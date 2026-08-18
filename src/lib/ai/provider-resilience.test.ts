import { describe, expect, it } from "vitest";
import { chatFallbackModels, openRouterChatProviderOptions } from "./chat-provider-policy";
import { runEmbeddingRequest } from "./provider-resilience";
import { ProviderRequestError } from "@/lib/provider-resilience";

describe("OpenRouter provider boundaries", () => {
  it("retries a mocked transient embedding request", async () => {
    let calls = 0;
    const result = await runEmbeddingRequest(async () => {
      calls += 1;
      if (calls === 1) {
        throw new ProviderRequestError("rate limited", "transient", 429);
      }
      return [[0.1, 0.2]];
    });

    expect(result).toEqual([[0.1, 0.2]]);
    expect(calls).toBe(2);
  });

  it("uses an optional fallback model through OpenRouter before streaming", () => {
    expect(chatFallbackModels("  provider/fallback  ")).toEqual([
      "provider/fallback",
    ]);
    expect(openRouterChatProviderOptions("provider/fallback")).toEqual({
      reasoning: { effort: "minimal", exclude: true },
      provider: { allow_fallbacks: true },
      models: ["provider/fallback"],
    });
  });
});
