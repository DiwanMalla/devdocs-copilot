import type { ChatMessage } from "@/lib/supabase/types";
import {
  MAX_CONTEXT_CHARACTERS,
  MAX_CONTEXT_MESSAGES,
} from "./limits";

export type BoundedChatContext = {
  messages: ChatMessage[];
  usedSummary: boolean;
  omittedCount: number;
};

export function buildBoundedContext(
  messages: ChatMessage[],
  summary: string | null,
): BoundedChatContext {
  const complete = messages.filter(
    (message) =>
      message.status === "complete" &&
      (message.role === "user" || message.role === "assistant") &&
      message.content.trim().length > 0,
  );

  const recent = complete.slice(-MAX_CONTEXT_MESSAGES);
  let selected = [...recent];
  let total = selected.reduce(
    (sum, message) => sum + message.content.length,
    0,
  );

  while (selected.length > 2 && total > MAX_CONTEXT_CHARACTERS) {
    selected = selected.slice(1);
    total = selected.reduce((sum, message) => sum + message.content.length, 0);
  }

  const omittedCount = Math.max(0, complete.length - selected.length);
  const usedSummary = omittedCount > 0 && Boolean(summary?.trim());

  if (usedSummary && summary) {
    const summaryMessage: ChatMessage = {
      id: "thread-summary",
      chat_id: selected[0]?.chat_id ?? "",
      user_id: selected[0]?.user_id ?? "",
      role: "assistant",
      content: `Earlier conversation summary:\n${summary.trim()}`,
      created_at: selected[0]?.created_at ?? new Date(0).toISOString(),
      status: "complete",
      client_request_id: null,
      snapshot_id: null,
      citations: [],
      error_code: null,
      correlation_id: null,
      model: null,
    };
    return {
      messages: [summaryMessage, ...selected],
      usedSummary: true,
      omittedCount,
    };
  }

  return {
    messages: selected,
    usedSummary: false,
    omittedCount,
  };
}

export function shouldRefreshSummary(omittedCount: number): boolean {
  return omittedCount >= 4;
}

export function buildThreadSummarySource(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.status === "complete")
    .slice(0, -8)
    .map((message) => `${message.role}: ${message.content.slice(0, 400)}`)
    .join("\n");
}
