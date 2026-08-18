import { describe, expect, it } from "vitest";
import {
  isDemoRepo,
  isReadyDemoSnapshot,
  DEMO_REPO_NAME,
  DEMO_REPO_OWNER,
} from "./config";

describe("demo repository identity", () => {
  it("accepts this repository as the public sample", () => {
    expect(isDemoRepo(DEMO_REPO_OWNER, DEMO_REPO_NAME)).toBe(true);
    expect(isDemoRepo("diwanmalla", "DevDocs-Copilot")).toBe(true);
  });

  it("rejects oversized or unrelated repositories", () => {
    expect(isDemoRepo("vercel", "next.js")).toBe(false);
    expect(isDemoRepo("facebook", "react")).toBe(false);
  });
});

describe("demo snapshot readiness", () => {
  it("rejects one-file test stubs even when status is ready", () => {
    expect(
      isReadyDemoSnapshot({
        status: "ready",
        file_count: 1,
        chunk_count: 1,
        active_snapshot_id: "snap-1",
      }),
    ).toBe(false);
  });

  it("accepts a real indexed snapshot", () => {
    expect(
      isReadyDemoSnapshot({
        status: "ready",
        file_count: 42,
        chunk_count: 80,
        active_snapshot_id: "snap-1",
      }),
    ).toBe(true);
  });
});
