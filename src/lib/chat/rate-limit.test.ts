import { describe, expect, it } from "vitest";
import {
  rateLimitExceededResponse,
  toRateLimitResult,
} from "./rate-limit-contract";

describe("chat rate-limit RPC result mapping", () => {
  it("preserves allowed capacity metadata", () => {
    expect(
      toRateLimitResult({
        allowed: true,
        remaining: 59,
        retry_after_seconds: 0,
      }),
    ).toEqual({ allowed: true, remaining: 59 });
  });

  it("preserves a rejected request's retry metadata", () => {
    const result = toRateLimitResult({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 412,
    });

    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 412,
    });
    if (result.allowed) throw new Error("Expected a rate-limit rejection.");
    const response = rateLimitExceededResponse(result);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("412");
  });

  it("rejects malformed database results rather than allowing requests", () => {
    expect(() => toRateLimitResult({ allowed: true })).toThrow(
      "Chat rate-limit RPC returned an invalid result.",
    );
  });
});
