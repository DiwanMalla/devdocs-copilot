import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(
      "\n",
    )) {
      const trimmed = line.trim();
      const separator = trimmed.indexOf("=");
      if (!trimmed || trimmed.startsWith("#") || separator === -1) continue;
      const key = trimmed.slice(0, separator);
      if (!process.env[key]) process.env[key] = trimmed.slice(separator + 1);
    }
  } catch {
    // Integration tests skip when local credentials are absent.
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && serviceRoleKey);

type RpcRateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

describe.skipIf(!canRun)("atomic chat rate limit", () => {
  const admin = createClient(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let userId = "";

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: `chat-rate-limit-${suffix}@devdocs-copilot.test`,
      password: "phase7-rate-limit-test-pass-123",
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error("Could not create rate-limit test user.");
    }
    userId = data.user.id;
  });

  afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function consume(maxRequests: number, windowSeconds = 600) {
    const { data, error } = await admin.rpc("consume_chat_rate_limit", {
      p_user_id: userId,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    expect(error).toBeNull();
    const row = (data as RpcRateLimitRow[] | null)?.[0];
    expect(row).toBeDefined();
    return row!;
  }

  it("atomically allows only the configured concurrent capacity", async () => {
    const capacity = 5;
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume(capacity)),
    );
    const allowed = results.filter((result) => result.allowed);
    const denied = results.filter((result) => !result.allowed);

    expect(allowed).toHaveLength(capacity);
    expect(denied).toHaveLength(20 - capacity);
    expect(denied.every((result) => result.remaining === 0)).toBe(true);
    expect(
      denied.every((result) => result.retry_after_seconds >= 1),
    ).toBe(true);

    const { data: usage, error } = await admin
      .from("chat_usage")
      .select("request_count")
      .eq("user_id", userId)
      .single();
    expect(error).toBeNull();
    expect(usage?.request_count).toBe(capacity);
  });

  it("returns retry metadata until the fixed window expires", async () => {
    const denied = await consume(5);
    expect(denied).toMatchObject({
      allowed: false,
      remaining: 0,
    });
    expect(denied.retry_after_seconds).toBeGreaterThan(0);

    await admin
      .from("chat_usage")
      .update({
        window_start: new Date(Date.now() - 2_000).toISOString(),
        request_count: 5,
      })
      .eq("user_id", userId);

    const reset = await consume(5, 1);
    expect(reset).toEqual({
      allowed: true,
      remaining: 4,
      retry_after_seconds: 0,
    });
  });
});
