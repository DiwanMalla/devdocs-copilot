import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHAT_RATE_LIMIT_MAX_REQUESTS,
  CHAT_RATE_LIMIT_WINDOW_MS,
} from "./limits";
import { toRateLimitResult, type RateLimitResult } from "./rate-limit-contract";

export type { RateLimitResult } from "./rate-limit-contract";

export async function consumeChatRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("consume_chat_rate_limit", {
      p_user_id: userId,
      p_max_requests: CHAT_RATE_LIMIT_MAX_REQUESTS,
      p_window_seconds: CHAT_RATE_LIMIT_WINDOW_MS / 1_000,
    });

  if (error) {
    throw new Error(error.message);
  }

  return toRateLimitResult(Array.isArray(data) ? data[0] : data);
}
