import { describe, expect, it } from "vitest";
import { fetchWithRetry } from "./client";

describe("GitHub provider resilience", () => {
  it("retries transient GitHub statuses without calling the network in tests", async () => {
    let calls = 0;
    const response = await fetchWithRetry("https://example.test/repo", {
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: calls === 1 ? 503 : 200 });
      },
      attempts: 2,
      sleep: async () => {},
    });

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not retry permanent GitHub statuses", async () => {
    let calls = 0;
    const response = await fetchWithRetry("https://example.test/repo", {
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 404 });
      },
      attempts: 3,
      sleep: async () => {},
    });

    expect(response.status).toBe(404);
    expect(calls).toBe(1);
  });

  it("surfaces an exhausted transient failure", async () => {
    let calls = 0;
    await expect(
      fetchWithRetry("https://example.test/repo", {
        fetchImpl: async () => {
          calls += 1;
          return new Response("{}", { status: 429 });
        },
        attempts: 2,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ kind: "transient", status: 429 });
    expect(calls).toBe(2);
  });
});
