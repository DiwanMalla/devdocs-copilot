import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import {
  buildGroundedSystemPrompt,
  getChatModel,
  normalizeAnswerCitations,
} from "@/lib/ai/chat";
import { searchRepoChunks } from "@/lib/ai/search";
import { parseGitHubRepoInput } from "@/lib/github/parse-url";
import { getRepoByOwnerName } from "@/lib/supabase/queries";

export const maxDuration = 60;

const MAX_MESSAGES = 20;
const MAX_QUESTION_CHARACTERS = 2_000;

class ChatRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatRequestError";
  }
}

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

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ChatRequestError("Invalid chat request.");
    }

    const requestBody = body as Record<string, unknown>;
    const { owner, name } = parseRepoFields(requestBody);
    const messages = await validateUIMessages<UIMessage>({
      messages: requestBody.messages,
    });

    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      throw new ChatRequestError(
        `Chat must contain between 1 and ${MAX_MESSAGES} messages.`,
      );
    }

    if (messages.some((message) => message.role === "system")) {
      throw new ChatRequestError("Client system messages are not allowed.");
    }

    const latestUserMessage = messages
      .toReversed()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      throw new ChatRequestError("A user question is required.");
    }

    if (latestUserMessage.parts.some((part) => part.type !== "text")) {
      throw new ChatRequestError("Only text questions are supported.");
    }

    const question = getMessageText(latestUserMessage).trim();
    if (!question || question.length > MAX_QUESTION_CHARACTERS) {
      throw new ChatRequestError(
        `Questions must be between 1 and ${MAX_QUESTION_CHARACTERS} characters.`,
      );
    }

    const repo = await getRepoByOwnerName(owner, name);
    if (!repo) {
      throw new ChatRequestError("Repository has not been ingested.");
    }
    if (repo.status !== "ready" || repo.chunk_count < 1) {
      throw new ChatRequestError(
        "Repository must finish indexing before chat is available.",
      );
    }

    const chunks = await searchRepoChunks(repo.id, question, 8);
    const recentMessages = messages.slice(-12);
    const modelMessages = await convertToModelMessages(recentMessages);

    const result = await generateText({
      model: getChatModel(),
      system: buildGroundedSystemPrompt(repo.owner, repo.name, chunks),
      messages: modelMessages,
      maxOutputTokens: 2_000,
      providerOptions: {
        openrouter: {
          reasoning: {
            effort: "minimal",
            exclude: true,
          },
        },
      },
    });

    const answer = normalizeAnswerCitations(result.text, chunks);
    const stream = createUIMessageStream({
      originalMessages: recentMessages,
      execute: ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: answer });
        writer.write({ type: "text-end", id });
      },
      onError: (error) => {
        console.error("Repository chat response failed", error);
        return "The model could not complete this answer. Please try again.";
      },
    });

    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error) {
    if (error instanceof ChatRequestError) {
      return new Response(error.message, { status: 400 });
    }

    console.error("Repository chat request failed", error);
    return new Response(
      "Repository chat is temporarily unavailable.",
      { status: 500 },
    );
  }
}
