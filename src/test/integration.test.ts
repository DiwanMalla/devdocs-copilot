import { describe, expect, it } from "vitest";
import { parseEnvAssignments, unquoteEnvValue } from "./integration";

describe("unquoteEnvValue", () => {
  it("strips matching double and single quotes", () => {
    expect(unquoteEnvValue('"http://127.0.0.1:54321"')).toBe("http://127.0.0.1:54321");
    expect(unquoteEnvValue("'http://127.0.0.1:54321'")).toBe("http://127.0.0.1:54321");
  });

  it("trims whitespace and leaves unquoted values unchanged", () => {
    expect(unquoteEnvValue("  https://example.supabase.co  ")).toBe(
      "https://example.supabase.co",
    );
    expect(unquoteEnvValue('unmatched"')).toBe('unmatched"');
  });
});

describe("parseEnvAssignments", () => {
  it("parses supabase status env output without keeping quotes", () => {
    const assignments = parseEnvAssignments(
      [
        'API_URL="http://127.0.0.1:54321"',
        'ANON_KEY="anon-key"',
        "# ignored",
        'SERVICE_ROLE_KEY="service-key"',
      ].join("\n"),
    );

    expect(assignments).toEqual({
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "anon-key",
      SERVICE_ROLE_KEY: "service-key",
    });
  });
});
