"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import {
  Loader2Icon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

const CITATION_PATTERN = /\[([^\]\n]+):L(\d+)-L(\d+)\]/g;

function renderAnswerWithCitationLinks(
  text: string,
  owner: string,
  name: string,
) {
  const parts: React.ReactNode[] = [];
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

    const href =
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
      `?path=${encodeURIComponent(path)}&lines=${start}-${end}#L${start}`;

    parts.push(
      <Link
        key={`${index}-${citation}`}
        href={href}
        className="bg-background/70 text-foreground inline-flex rounded px-1.5 py-0.5 font-mono text-xs underline decoration-border underline-offset-2 hover:decoration-foreground"
        title={`Open ${path}, lines ${start}–${end}`}
      >
        {citation}
      </Link>,
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
  disabled,
}: {
  owner: string;
  name: string;
  disabled: boolean;
}) {
  const [input, setInput] = useState("");
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { owner, name },
      }),
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
  });
  const endRef = useRef<HTMLDivElement>(null);
  const isGenerating = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || isGenerating || disabled) {
      return;
    }

    setInput("");
    await sendMessage({ text: question });
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-medium">Ask this repository</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Grounded in retrieved chunks · citations use file and line ranges
          </p>
        </div>
        {messages.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            disabled={isGenerating}
          >
            <Trash2Icon />
            Clear
          </Button>
        ) : null}
      </div>

      <div
        className="max-h-[28rem] min-h-48 space-y-4 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center text-center text-sm">
            Ask how a feature works, where behavior is implemented, or what a
            function does.
          </div>
        ) : (
          messages.map((message) => {
            const text = messageText(message);
            if (!text) {
              return null;
            }

            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm leading-6 whitespace-pre-wrap",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-muted",
                )}
              >
                {message.role === "assistant"
                  ? renderAnswerWithCitationLinks(text, owner, name)
                  : text}
              </div>
            );
          })
        )}

        {status === "submitted" ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Retrieving repository context…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? (
        <p className="text-destructive border-t px-4 py-2 text-sm" role="alert">
          {error.message}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="border-t p-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={2_000}
          rows={3}
          placeholder={
            disabled
              ? "Repository must finish indexing before chat is available."
              : "How does this repository validate values?"
          }
          aria-label="Repository question"
          disabled={disabled || isGenerating}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            openai/gpt-oss-20b:free · answers only from retrieved context
          </p>
          {isGenerating ? (
            <Button type="button" variant="outline" onClick={() => stop()}>
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={disabled || !input.trim()}>
              <SendIcon />
              Ask
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
