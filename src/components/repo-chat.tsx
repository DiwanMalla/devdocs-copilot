"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "next/navigation";
import { SendIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { startChatThread } from "@/app/actions/chats";
import { CitationChip } from "@/components/citation-chip";
import { EmptyState } from "@/components/empty-state";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  resolveCitationTarget,
  findStructuredCitation,
} from "@/lib/chat/citation-provenance";
import { MAX_QUESTION_CHARACTERS } from "@/lib/chat/limits";
import type { RepoUIMessage } from "@/lib/chat/messages";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";
import { cn } from "@/lib/utils";

function messageText(message: RepoUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

const CITATION_PATTERN = /\[([^\]\n]+):L(\d+)-L(\d+)\]/g;

const STARTER_PROMPTS = [
  "What is this project?",
  "How does it work?",
  "What are the main features?",
];

function renderAnswerWithCitationLinks(
  text: string,
  owner: string,
  name: string,
  chatId: string | null,
  message: RepoUIMessage,
  availableSnapshotIds: ReadonlySet<string>,
  indexedPaths: ReadonlySet<string>,
  githubRepoUrl?: string | null,
  githubRef?: string | null,
  basePath?: string | null,
) {
  const parts: ReactNode[] = [];
  const citations = message.metadata?.citations ?? [];
  let cursor = 0;

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const index = match.index;
    const [citation, path, start, end] = match;
    if (index === undefined || !path || !start || !end) {
      continue;
    }

    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }

    const startLine = Number.parseInt(start, 10);
    const endLine = Number.parseInt(end, 10);
    const structured = findStructuredCitation(
      citations,
      path,
      startLine,
      endLine,
    );
    const resolved = resolveCitationTarget({
      path,
      startLine,
      endLine,
      structured,
      availableSnapshotIds,
      indexedPaths,
      owner,
      name,
      chatId,
      basePath,
      githubRepoUrl,
      githubRef,
    });

    parts.push(
      <CitationChip
        key={`${index}-${path}-${startLine}-${endLine}`}
        href={resolved.href}
        fallbackHref={resolved.fallbackHref}
        path={path}
        startLine={startLine}
        endLine={endLine}
        unavailable={resolved.unavailable}
      />,
    );
    cursor = index + citation.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : text;
}

export function RepoChat({
  owner,
  name,
  repoId,
  chatId,
  availableSnapshotIds,
  indexedPaths,
  githubRepoUrl,
  githubRef,
  initialMessages,
  disabled,
  path,
  query,
  demo = false,
  basePath,
}: {
  owner: string;
  name: string;
  repoId: string;
  chatId: string | null;
  availableSnapshotIds: string[];
  indexedPaths: string[];
  githubRepoUrl?: string | null;
  githubRef?: string | null;
  initialMessages: RepoUIMessage[];
  disabled: boolean;
  path?: string | null;
  query?: string | null;
  demo?: boolean;
  basePath?: string | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [activeChatId, setActiveChatId] = useState(chatId);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [creatingThread, setCreatingThread] = useState(false);
  const creatingRef = useRef(false);
  const [chatKey] = useState(() => chatId ?? `pending-${repoId}`);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<RepoUIMessage>({
        api: "/api/chat",
        body: { owner, name },
      }),
    [owner, name],
  );
  const { messages, sendMessage, status, error, stop } = useChat<RepoUIMessage>({
    id: chatKey,
    messages: initialMessages,
    transport,
    onFinish: () => router.refresh(),
  });
  const transcriptRef = useRef<HTMLDivElement>(null);
  const isGenerating = status === "submitted" || status === "streaming";
  const chatDisabled = disabled || creatingThread;
  const displayError = threadError ?? error?.message ?? null;
  const availableSnapshots = useMemo(
    () => new Set(availableSnapshotIds),
    [availableSnapshotIds],
  );
  const indexedPathSet = useMemo(() => new Set(indexedPaths), [indexedPaths]);
  const lastMessage = messages[messages.length - 1];
  const lastAssistantIsStreaming =
    status === "streaming" && lastMessage?.role === "assistant";
  const showThinking =
    status === "submitted" ||
    (status === "streaming" && lastMessage?.role !== "assistant");

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isGenerating || chatDisabled) {
      return;
    }

    let threadId = activeChatId;

    if (!threadId && !demo) {
      if (creatingRef.current) {
        return;
      }
      creatingRef.current = true;
      setCreatingThread(true);
      setThreadError(null);
      try {
        threadId = await startChatThread(repoId);
        setActiveChatId(threadId);
        router.replace(
          buildRepoWorkspaceHref({
            owner,
            name,
            chatId: threadId,
            path,
            query,
          }),
        );
      } catch (cause) {
        setThreadError(
          cause instanceof Error
            ? cause.message
            : "Could not start a chat thread.",
        );
        return;
      } finally {
        creatingRef.current = false;
        setCreatingThread(false);
      }
    }

    setInput("");
    await sendMessage(
      { text: trimmed },
      {
        body: demo
          ? {
              demo: true,
              requestId: crypto.randomUUID(),
            }
          : {
              chatId: threadId,
              requestId: crypto.randomUUID(),
            },
      },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(input);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-medium">Ask this repository</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {demo
              ? `Public demo of ${owner}/${name}. Answers cite the indexed snapshot — no account needed.`
              : "Answers use the indexed snapshot and cite exact source lines."}
          </p>
        </div>
      </div>

      <div
        ref={transcriptRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
        aria-live="polite"
        aria-busy={isGenerating}
        aria-label="Repository chat transcript"
      >
        {messages.length === 0 ? (
          <EmptyState
            icon={SparklesIcon}
            title={disabled ? "Indexing this snapshot" : "Ask anything in this repo"}
            description={
              disabled
                ? "Chat unlocks when the first index is ready. You can still browse files once they appear."
                : "Questions are answered only from retrieved source. Citations jump to the highlighted lines."
            }
            className="min-h-48 py-8"
          >
            {disabled ? null : (
              <div className="flex flex-wrap justify-center gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void ask(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            )}
          </EmptyState>
        ) : (
          messages.map((message, index) => {
            const text = messageText(message);
            const isLast = index === messages.length - 1;
            const streamingThis =
              lastAssistantIsStreaming && isLast && message.role === "assistant";

            if (!text && !streamingThis) {
              return null;
            }

            return (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md",
                  )}
                >
                  {message.role === "assistant" ? (
                    <>
                      {text
                        ? renderAnswerWithCitationLinks(
                            text,
                            owner,
                            name,
                            activeChatId,
                            message,
                            availableSnapshots,
                            indexedPathSet,
                            githubRepoUrl,
                            githubRef,
                            basePath,
                          )
                        : null}
                      {streamingThis ? (
                        <span
                          className="bg-foreground/70 ml-0.5 inline-block h-4 w-1.5 animate-pulse align-text-bottom"
                          aria-hidden="true"
                        />
                      ) : null}
                    </>
                  ) : (
                    text
                  )}
                </div>
              </div>
            );
          })
        )}

        {showThinking ? (
          <ThinkingIndicator
            label={
              status === "submitted"
                ? "Searching the indexed snapshot…"
                : "Generating an answer…"
            }
          />
        ) : null}
      </div>

      {displayError ? (
        <p className="text-destructive shrink-0 border-t px-4 py-2 text-sm" role="alert">
          {displayError}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="shrink-0 border-t p-3"
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={MAX_QUESTION_CHARACTERS}
          rows={3}
          placeholder={
            disabled
              ? "Indexing must finish before chat is available."
              : "Ask how a feature works, or where it lives in the source…"
          }
          aria-label="Repository question"
          disabled={chatDisabled || isGenerating}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Grounded answers only · citations open the explorer
          </p>
          {isGenerating ? (
            <Button type="button" variant="outline" onClick={() => stop()}>
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={chatDisabled || !input.trim()}>
              <SendIcon />
              Ask
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
