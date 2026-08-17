import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHAT_RATE_LIMIT_MAX_REQUESTS,
  CHAT_RATE_LIMIT_WINDOW_MS,
} from "./limits";

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfterSeconds: number };

export async function consumeChatRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = Date.now();
  const { data, error } = await admin
    .from("chat_usage")
    .select("window_start, request_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const windowStart = data?.window_start
    ? Date.parse(data.window_start)
    : now;
  const expired = now - windowStart >= CHAT_RATE_LIMIT_WINDOW_MS;
  const requestCount = expired ? 0 : (data?.request_count ?? 0);

  if (requestCount >= CHAT_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart + CHAT_RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  const nextCount = requestCount + 1;
  const nextWindowStart =
    !data || expired ? new Date(now).toISOString() : data.window_start;

  const { error: upsertError } = await admin.from("chat_usage").upsert({
    user_id: userId,
    window_start: nextWindowStart,
    request_count: nextCount,
  });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return {
    allowed: true,
    remaining: CHAT_RATE_LIMIT_MAX_REQUESTS - nextCount,
  };
}
