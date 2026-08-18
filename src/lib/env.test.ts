import { describe, expect, it } from "vitest";
import { listMissingEnv, validateRequiredEnv } from "./env";

describe("environment validation", () => {
  it("reports every missing required variable", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      OPENROUTER_API_KEY: "key",
    } as unknown as NodeJS.ProcessEnv;

    expect(
      listMissingEnv(
        [
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
          "OPENROUTER_API_KEY",
        ],
        env,
      ),
    ).toEqual([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("throws a fail-fast startup error for missing variables", () => {
    expect(() =>
      validateRequiredEnv(["NEXT_PUBLIC_SUPABASE_URL", "OPENROUTER_API_KEY"], {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Missing required environment variables: OPENROUTER_API_KEY\./);
  });
});
