export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfterSeconds: number };

type RateLimitRpcRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

function isRateLimitRpcRow(value: unknown): value is RateLimitRpcRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "allowed" in value &&
    typeof value.allowed === "boolean" &&
    "remaining" in value &&
    typeof value.remaining === "number" &&
    "retry_after_seconds" in value &&
    typeof value.retry_after_seconds === "number"
  );
}

export function toRateLimitResult(value: unknown): RateLimitResult {
  if (!isRateLimitRpcRow(value)) {
    throw new Error("Chat rate-limit RPC returned an invalid result.");
  }

  if (value.allowed) {
    return {
      allowed: true,
      remaining: Math.max(0, Math.floor(value.remaining)),
    };
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil(value.retry_after_seconds)),
  };
}

export function rateLimitExceededResponse(
  result: Extract<RateLimitResult, { allowed: false }>,
): Response {
  return new Response("Too many chat requests. Please wait and try again.", {
    status: 429,
    headers: {
      "Retry-After": String(result.retryAfterSeconds),
    },
  });
}
