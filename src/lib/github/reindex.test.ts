import { describe, expect, it } from "vitest";
import { shouldSkipReindex } from "./reindex";

describe("shouldSkipReindex", () => {
  it("skips when the ready snapshot already matches the commit", () => {
    expect(
      shouldSkipReindex(
        { status: "ready", commit_sha: "abc123" },
        "abc123",
      ),
    ).toBe(true);
  });

  it("reindexes when the commit changed", () => {
    expect(
      shouldSkipReindex(
        { status: "ready", commit_sha: "abc123" },
        "def456",
      ),
    ).toBe(false);
  });

  it("reindexes failed or incomplete snapshots even if the SHA matches", () => {
    expect(
      shouldSkipReindex(
        { status: "failed", commit_sha: "abc123" },
        "abc123",
      ),
    ).toBe(false);
    expect(
      shouldSkipReindex(
        { status: "indexing", commit_sha: "abc123" },
        "abc123",
      ),
    ).toBe(false);
  });
});
