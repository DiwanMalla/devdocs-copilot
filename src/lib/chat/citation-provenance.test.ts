import { describe, expect, it } from "vitest";
import {
  buildCitationHref,
  citationAvailability,
  findStructuredCitation,
  resolveCitationTarget,
} from "./citation-provenance";
import type { StructuredCitation } from "@/lib/supabase/types";

const citation: StructuredCitation = {
  chunkId: "chunk-a",
  path: "src/index.ts",
  startLine: 4,
  endLine: 8,
  snapshotId: "snapshot-a",
};

describe("historical citation provenance", () => {
  it("keeps an old answer pinned to Snapshot A after Snapshot B activates", () => {
    const activeSnapshotId = "snapshot-b";
    const available = new Set(["snapshot-a", activeSnapshotId]);
    const resolved = findStructuredCitation(
      [citation],
      "src/index.ts",
      4,
      8,
    );

    expect(resolved).toEqual(citation);
    expect(resolved?.snapshotId).toBe("snapshot-a");
    expect(resolved?.snapshotId).not.toBe(activeSnapshotId);
    expect(citationAvailability(citation, available)).toBe("available");
    expect(
      buildCitationHref(citation, {
        owner: "acme",
        name: "docs",
        chatId: "chat-1",
      }),
    ).toContain("snapshot=snapshot-a");
  });

  it("marks retired Snapshot A unavailable instead of retargeting to Snapshot B", () => {
    const available = new Set(["snapshot-b"]);

    expect(citationAvailability(citation, available)).toBe("unavailable");
  });

  it("falls back to a file link when the cited snapshot is gone", () => {
    const resolved = resolveCitationTarget({
      path: "src/index.ts",
      startLine: 4,
      endLine: 8,
      structured: citation,
      availableSnapshotIds: new Set(["snapshot-b"]),
      indexedPaths: new Set(["src/index.ts"]),
      owner: "acme",
      name: "docs",
      chatId: "chat-1",
      githubRepoUrl: "https://github.com/acme/docs",
      githubRef: "abc123",
    });

    expect(resolved.unavailable).toBe(false);
    expect(resolved.href).toContain("path=src%2Findex.ts");
    expect(resolved.fallbackHref).toContain("github.com/acme/docs/blob/");
  });

  it("maps repo-overview citations onto README with a View file fallback", () => {
    const resolved = resolveCitationTarget({
      path: "repo-overview",
      startLine: 1,
      endLine: 12,
      structured: null,
      availableSnapshotIds: new Set(["snapshot-a"]),
      indexedPaths: new Set(["README.md", "src/index.ts"]),
      owner: "acme",
      name: "docs",
      chatId: null,
      githubRepoUrl: "https://github.com/acme/docs",
      githubRef: "main",
    });

    expect(resolved.unavailable).toBe(false);
    expect(resolved.href).toContain("path=README.md");
  });

  it("opens GitHub when the cited path is missing from the snapshot", () => {
    const resolved = resolveCitationTarget({
      path: "missing.ts",
      startLine: 1,
      endLine: 4,
      structured: null,
      availableSnapshotIds: new Set(["snapshot-a"]),
      indexedPaths: new Set(["README.md"]),
      owner: "acme",
      name: "docs",
      chatId: null,
      githubRepoUrl: "https://github.com/acme/docs",
      githubRef: "main",
    });

    expect(resolved.unavailable).toBe(true);
    expect(resolved.href).toBeUndefined();
    expect(resolved.fallbackHref).toContain("github.com/acme/docs");
  });
});
