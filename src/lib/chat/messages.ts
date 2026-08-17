import type {
  ChatMessage,
  RepoChatMessageMetadata,
} from "@/lib/supabase/types";
import type { UIMessage } from "ai";

export type RepoUIMessage = UIMessage<RepoChatMessageMetadata>;

function displayContent(message: ChatMessage): string {
  if (message.content.trim()) {
    return message.content;
  }
  if (message.status === "cancelled") {
    return "Generation cancelled.";
  }
  if (message.status === "failed") {
    return "Generation failed. Please try again.";
  }
  return "";
}

export function chatMessagesToUIMessages(
  messages: ChatMessage[],
): RepoUIMessage[] {
  return messages
    .filter((message) => {
      if (message.role === "user") {
        return message.content.trim().length > 0;
      }
      return (
        message.status === "complete" ||
        message.status === "cancelled" ||
        message.status === "failed"
      );
    })
    .map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text: displayContent(message) }],
      metadata: {
        snapshotId:
          message.snapshot_id ?? message.citations[0]?.snapshotId ?? null,
        citations: message.citations,
      },
    }))
    .filter((message) => message.parts[0]?.text);
}
