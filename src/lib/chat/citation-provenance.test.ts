import { describe, expect, it } from "vitest";
import {
  buildCitationHref,
  citationAvailability,
  findStructuredCitation,
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
});
