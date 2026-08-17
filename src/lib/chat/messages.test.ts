import { describe, expect, it } from "vitest";
import { chatMessagesToUIMessages } from "./messages";
import type { ChatMessage } from "@/lib/supabase/types";

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "content" | "status">): ChatMessage {
  return {
    chat_id: "chat-1",
    user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    client_request_id: null,
    snapshot_id: null,
    citations: [],
    error_code: null,
    correlation_id: null,
    model: null,
    ...partial,
  };
}

describe("chatMessagesToUIMessages", () => {
  it("hydrates completed turns and cancelled or failed generations", () => {
    const ui = chatMessagesToUIMessages([
      message({ id: "u1", role: "user", content: "Where?", status: "complete" }),
      message({ id: "a1", role: "assistant", content: "", status: "streaming" }),
      message({ id: "a2", role: "assistant", content: "", status: "cancelled" }),
    ]);

    expect(ui.map((item) => item.parts[0])).toEqual([
      { type: "text", text: "Where?" },
      { type: "text", text: "Generation cancelled." },
    ]);
  });
});
