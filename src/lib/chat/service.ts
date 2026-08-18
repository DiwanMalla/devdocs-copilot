import "server-only";

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  type UIMessage,
} from "ai";
import {
  buildGroundedSystemPrompt,
  getChatModel,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  normalizeAnswerCitations,
  CHAT_MODEL,
} from "@/lib/ai/chat";
import { openRouterChatProviderOptions } from "@/lib/ai/chat-provider-policy";
import {
  CHAT_GENERATION_TIMEOUT,
  runChatRequest,
} from "@/lib/ai/provider-resilience";
import { generateChatTitle } from "@/lib/chat/title";
import {
  chatMessagesToUIMessages,
  type RepoUIMessage,
} from "@/lib/chat/messages";
import { parseGitHubRepoInput } from "@/lib/github/parse-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import {
  getOwnedChat,
  getRepoByOwnerName,
  listChatMessages,
} from "@/lib/supabase/queries";
import type {
  ChatMessage,
  Repo,
  RepoChatMessageMetadata,
} from "@/lib/supabase/types";
import {
  citationsAreValid,
  extractStructuredCitations,
} from "./citations";
import {
  buildBoundedContext,
  buildThreadSummarySource,
  shouldRefreshSummary,
} from "./context";
import { ChatRequestError } from "./errors";
import {
  MAX_OUTPUT_TOKENS,
  STALE_GENERATION_MS,
} from "./limits";
import { chatError, chatLog } from "./observability";
import {
  consumeChatRateLimit,
} from "./rate-limit";
import { rateLimitExceededResponse } from "./rate-limit-contract";
import { retrieveRepoChunks } from "./retrieval";
import { validateQuestion } from "./validate";

export { ChatRequestError } from "./errors";

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function parseRepoFields(body: Record<string, unknown>) {
  if (typeof body.owner !== "string" || typeof body.name !== "string") {
    throw new ChatRequestError("Repository owner and name are required.");
  }

  try {
    return parseGitHubRepoInput(`${body.owner}/${body.name}`);
  } catch {
    throw new ChatRequestError("Invalid repository owner or name.");
  }
}

function parseRequestId(body: Record<string, unknown>): string {
  if (typeof body.requestId !== "string" || !body.requestId.trim()) {
    throw new ChatRequestError("A client request ID is required.");
  }
  const requestId = body.requestId.trim();
  if (requestId.length > 80) {
    throw new ChatRequestError("Request ID is too long.");
  }
  return requestId;
}

function replayAnswer(
  answer: string,
  originalMessages: RepoUIMessage[],
  metadata: RepoChatMessageMetadata,
) {
  const stream = createUIMessageStream<RepoUIMessage>({
    originalMessages,
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: "message-metadata", messageMetadata: metadata });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: answer });
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

async function persistUserQuestion(input: {
  chatId: string;
  userId: string;
  content: string;
  requestId: string;
  correlationId: string;
}): Promise<ChatMessage> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({
      chat_id: input.chatId,
      user_id: input.userId,
      role: "user",
      content: input.content,
      status: "complete",
      client_request_id: input.requestId,
      correlation_id: input.correlationId,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await loadUserMessage(input.chatId, input.requestId);
      if (existing) {
        return existing;
      }
    }
    throw new Error(error.message);
  }

  return normalizeMessage(data);
}

async function loadUserMessage(
  chatId: string,
  requestId: string,
): Promise<ChatMessage | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .eq("client_request_id", requestId)
    .eq("role", "user")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeMessage(data) : null;
}

async function loadAssistantForRequest(
  chatId: string,
  requestId: string,
): Promise<ChatMessage | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .eq("client_request_id", requestId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeMessage(data) : null;
}

function normalizeMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    chat_id: String(row.chat_id),
    user_id: String(row.user_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content ?? ""),
    created_at: String(row.created_at),
    status:
      row.status === "pending" ||
      row.status === "streaming" ||
      row.status === "cancelled" ||
      row.status === "failed"
        ? row.status
        : "complete",
    client_request_id:
      typeof row.client_request_id === "string" ? row.client_request_id : null,
    snapshot_id: typeof row.snapshot_id === "string" ? row.snapshot_id : null,
    citations: Array.isArray(row.citations)
      ? (row.citations as ChatMessage["citations"])
      : [],
    error_code: typeof row.error_code === "string" ? row.error_code : null,
    correlation_id:
      typeof row.correlation_id === "string" ? row.correlation_id : null,
    model: typeof row.model === "string" ? row.model : null,
  };
}

async function insertAssistantPlaceholder(input: {
  chatId: string;
  userId: string;
  requestId: string;
  correlationId: string;
  snapshotId: string | null;
}): Promise<ChatMessage> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .insert({
      chat_id: input.chatId,
      user_id: input.userId,
      role: "assistant",
      content: "",
      status: "streaming",
      client_request_id: input.requestId,
      correlation_id: input.correlationId,
      snapshot_id: input.snapshotId,
      model: CHAT_MODEL,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not start assistant generation.");
  }

  return normalizeMessage(data);
}

async function finalizeAssistant(
  messageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("messages").update(patch).eq("id", messageId);
  if (error) {
    throw new Error(error.message);
  }
}

async function touchThread(
  chatId: string,
  title: string | null,
  currentTitle: string,
): Promise<void> {
  const admin = createAdminClient();
  const updates: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (currentTitle === "New chat" && title) {
    updates.title = title;
  }
  const { error } = await admin.from("chats").update(updates).eq("id", chatId);
  if (error) {
    throw new Error(error.message);
  }
}

async function maybeRefreshSummary(
  chatId: string,
  messages: ChatMessage[],
  omittedCount: number,
): Promise<void> {
  if (!shouldRefreshSummary(omittedCount)) {
    return;
  }

  const source = buildThreadSummarySource(messages);
  if (!source) {
    return;
  }

  try {
    const result = await runChatRequest((signal) =>
      generateText({
        model: getChatModel(),
        prompt: `Summarize this repository chat in at most 80 words. Preserve file names and decisions.\n\n${source}`,
        maxOutputTokens: 220,
        abortSignal: signal,
        maxRetries: 0,
        timeout: CHAT_GENERATION_TIMEOUT.totalMs,
        providerOptions: {
          openrouter: openRouterChatProviderOptions(),
        },
      }),
    );
    const admin = createAdminClient();
    await admin
      .from("chats")
      .update({ summary: result.text.trim() })
      .eq("id", chatId);
  } catch (error) {
    chatError({
      event: "thread_summary_failed",
      correlationId: "summary",
      chatId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

function isStale(message: ChatMessage): boolean {
  return Date.now() - Date.parse(message.created_at) > STALE_GENERATION_MS;
}

export async function handleChatRequest(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const started = Date.now();

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new ChatRequestError("Authentication required.", 401, "unauthorized");
    }

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ChatRequestError("Invalid chat request.");
    }

    const requestBody = body as Record<string, unknown>;
    const { owner, name } = parseRepoFields(requestBody);
    if (typeof requestBody.chatId !== "string" || !requestBody.chatId) {
      throw new ChatRequestError("A chat thread is required.");
    }

    const requestId = parseRequestId(requestBody);
    const messages = Array.isArray(requestBody.messages)
      ? (requestBody.messages as UIMessage[])
      : [];
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      throw new ChatRequestError("A user question is required.");
    }

    if (
      latestUserMessage.parts?.some(
        (part) => part.type !== "text" && part.type !== undefined,
      )
    ) {
      throw new ChatRequestError("Only text questions are supported.");
    }

    const question = validateQuestion(getMessageText(latestUserMessage));

    const repo = await getRepoByOwnerName(owner, name);
    if (!repo || repo.user_id !== user.id) {
      throw new ChatRequestError("Repository has not been ingested.", 404, "not_found");
    }
    if (!repo.active_snapshot_id || repo.chunk_count < 1) {
      throw new ChatRequestError(
        "Repository must finish indexing before chat is available.",
        400,
        "not_ready",
      );
    }

    const chat = await getOwnedChat(requestBody.chatId);
    if (!chat || chat.user_id !== user.id || chat.repo_id !== repo.id) {
      throw new ChatRequestError("Chat thread not found.", 404, "not_found");
    }

    const existingUser = await loadUserMessage(chat.id, requestId);
    if (existingUser) {
      const existingAssistant = await loadAssistantForRequest(chat.id, requestId);
      if (existingAssistant?.status === "complete" && existingAssistant.content) {
        chatLog({
          event: "chat_replay",
          correlationId,
          userId: user.id,
          repoId: repo.id,
          chatId: chat.id,
        });
        return replayAnswer(
          existingAssistant.content,
          messages.slice(-12) as RepoUIMessage[],
          {
            snapshotId:
              existingAssistant.snapshot_id ??
              existingAssistant.citations[0]?.snapshotId ??
              null,
            citations: existingAssistant.citations,
          },
        );
      }
      if (
        existingAssistant &&
        (existingAssistant.status === "pending" ||
          existingAssistant.status === "streaming") &&
        !isStale(existingAssistant)
      ) {
        throw new ChatRequestError(
          "This question is already being generated.",
          409,
          "in_progress",
        );
      }
      if (existingAssistant?.status === "cancelled") {
        throw new ChatRequestError(
          "This generation was cancelled. Send a new question to retry.",
          409,
          "cancelled",
        );
      }
    }

    const rateLimit = await consumeChatRateLimit(user.id);
    if (!rateLimit.allowed) {
      chatLog({
        event: "chat_rate_limited",
        correlationId,
        userId: user.id,
        repoId: repo.id,
      });
      return rateLimitExceededResponse(rateLimit);
    }

    if (!existingUser) {
      await persistUserQuestion({
        chatId: chat.id,
        userId: user.id,
        content: question,
        requestId,
        correlationId,
      });
    }

    await touchThread(
      chat.id,
      generateChatTitle(question),
      chat.title,
    );

    const persisted = await listChatMessages(chat.id, { limit: 80 });
    const bounded = buildBoundedContext(persisted, chat.summary);
    const history = chatMessagesToUIMessages(bounded.messages);
    const retrieval = await retrieveRepoChunks({
      repoId: repo.id,
      query: question,
      snapshotId: repo.active_snapshot_id,
    });

    chatLog({
      event: "chat_retrieval",
      correlationId,
      userId: user.id,
      repoId: repo.id,
      chatId: chat.id,
      snapshotId: repo.active_snapshot_id,
      durationMs: retrieval.diagnostics.durationMs,
      vectorCount: retrieval.diagnostics.vectorCount,
      lexicalCount: retrieval.diagnostics.lexicalCount,
      selectedCount: retrieval.diagnostics.selectedChunkIds.length,
    });

    const assistant = await insertAssistantPlaceholder({
      chatId: chat.id,
      userId: user.id,
      requestId,
      correlationId,
      snapshotId: repo.active_snapshot_id,
    });

    if (retrieval.chunks.length === 0) {
      await finalizeAssistant(assistant.id, {
        content: INSUFFICIENT_EVIDENCE_MESSAGE,
        status: "complete",
        citations: [],
        error_code: "no_evidence",
      });
      void maybeRefreshSummary(chat.id, persisted, bounded.omittedCount);
      chatLog({
        event: "chat_no_evidence",
        correlationId,
        userId: user.id,
        repoId: repo.id,
        chatId: chat.id,
        durationMs: Date.now() - started,
      });
      return replayAnswer(INSUFFICIENT_EVIDENCE_MESSAGE, history, {
        snapshotId: repo.active_snapshot_id,
        citations: [],
      });
    }

    const modelMessages = await convertToModelMessages(history);
    let finalized = false;
    let responseMetadata: RepoChatMessageMetadata = {
      snapshotId: repo.active_snapshot_id,
      citations: [],
    };

    const finishGeneration = async (rawText: string, aborted: boolean) => {
      if (finalized) {
        return;
      }
      finalized = true;

      if (aborted || request.signal.aborted) {
        await finalizeAssistant(assistant.id, {
          status: "cancelled",
          error_code: "cancelled",
          content: "",
        });
        chatLog({
          event: "chat_cancelled",
          correlationId,
          userId: user.id,
          repoId: repo.id,
          chatId: chat.id,
          durationMs: Date.now() - started,
        });
        return;
      }

      const normalized = normalizeAnswerCitations(rawText, retrieval.chunks);
      const citations = extractStructuredCitations(
        rawText,
        retrieval.chunks,
        repo.active_snapshot_id as string,
      );
      const valid =
        normalized !== INSUFFICIENT_EVIDENCE_MESSAGE &&
        citations.length > 0 &&
        citationsAreValid(
          citations,
          retrieval.chunks,
          repo.active_snapshot_id as string,
        );
      responseMetadata = {
        snapshotId: repo.active_snapshot_id,
        citations: valid ? citations : [],
      };

      await finalizeAssistant(assistant.id, {
        content: valid ? normalized : INSUFFICIENT_EVIDENCE_MESSAGE,
        status: "complete",
        citations: valid ? citations : [],
        error_code: valid ? null : "no_evidence",
        snapshot_id: repo.active_snapshot_id,
        model: CHAT_MODEL,
      });
      void maybeRefreshSummary(chat.id, persisted, bounded.omittedCount);
      chatLog({
        event: "chat_complete",
        correlationId,
        userId: user.id,
        repoId: repo.id,
        chatId: chat.id,
        snapshotId: repo.active_snapshot_id,
        durationMs: Date.now() - started,
        citationCount: valid ? citations.length : 0,
        grounded: valid,
      });
    };

    const failGeneration = async (errorCode: "provider_timeout" | "provider_failed") => {
      if (finalized) {
        return;
      }
      finalized = true;
      await finalizeAssistant(assistant.id, {
        status: "failed",
        error_code: errorCode,
        content: "",
      });
    };

    const result = streamText({
      model: getChatModel(),
      system: buildGroundedSystemPrompt(repo.owner, repo.name, retrieval.chunks),
      messages: modelMessages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: request.signal,
      // AI SDK retries only request failures before stream output begins.
      // Retrying after output would risk duplicating persisted user-visible text.
      maxRetries: 2,
      timeout: CHAT_GENERATION_TIMEOUT,
      providerOptions: {
        openrouter: openRouterChatProviderOptions(),
      },
      onAbort: async () => {
        if (request.signal.aborted) {
          await finishGeneration("", true);
          return;
        }
        await failGeneration("provider_timeout");
      },
      onFinish: async ({ text }) => {
        await finishGeneration(text, request.signal.aborted);
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: history,
      messageMetadata: ({ part }) =>
        part.type === "start" || part.type === "finish"
          ? responseMetadata
          : undefined,
      onError: (error) => {
        chatError({
          event: "chat_provider_failed",
          correlationId,
          userId: user.id,
          repoId: repo.id,
          chatId: chat.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        void failGeneration("provider_failed");
        return "The model could not complete this answer. Please try again.";
      },
    });
  } catch (error) {
    if (error instanceof ChatRequestError) {
      return new Response(error.message, { status: error.status });
    }

    chatError({
      event: "chat_request_failed",
      correlationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return new Response("Repository chat is temporarily unavailable.", {
      status: 500,
    });
  }
}

export function repoIsChatReady(repo: Repo): boolean {
  return Boolean(repo.active_snapshot_id) && repo.chunk_count > 0;
}
