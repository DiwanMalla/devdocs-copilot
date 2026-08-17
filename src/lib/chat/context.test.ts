import { describe, expect, it } from "vitest";
import { buildBoundedContext } from "./context";
import type { ChatMessage } from "@/lib/supabase/types";

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
): ChatMessage {
  return {
    id,
    chat_id: "chat-1",
    user_id: "user-1",
    role,
    content,
    created_at: "2026-01-01T00:00:00.000Z",
    status: "complete",
    client_request_id: null,
    snapshot_id: null,
    citations: [],
    error_code: null,
    correlation_id: null,
    model: null,
  };
}

describe("buildBoundedContext", () => {
  it("keeps the most recent complete turns", () => {
    const messages = Array.from({ length: 20 }, (_, index) =>
      message(`m${index}`, index % 2 === 0 ? "user" : "assistant", `turn ${index}`),
    );
    const bounded = buildBoundedContext(messages, null);
    expect(bounded.messages).toHaveLength(12);
    expect(bounded.messages[0]?.content).toBe("turn 8");
    expect(bounded.omittedCount).toBe(8);
    expect(bounded.usedSummary).toBe(false);
  });

  it("prepends a summary when older turns were omitted", () => {
    const messages = Array.from({ length: 16 }, (_, index) =>
      message(`m${index}`, "user", `turn ${index}`),
    );
    const bounded = buildBoundedContext(messages, "Discussed auth helpers.");
    expect(bounded.usedSummary).toBe(true);
    expect(bounded.messages[0]?.content).toContain("Discussed auth helpers.");
  });

  it("ignores incomplete generations", () => {
    const messages = [
      message("u1", "user", "What does parse do?"),
      {
        ...message("a1", "assistant", ""),
        status: "cancelled" as const,
      },
    ];
    const bounded = buildBoundedContext(messages, null);
    expect(bounded.messages).toHaveLength(1);
    expect(bounded.messages[0]?.role).toBe("user");
  });
});
