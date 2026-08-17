import { describe, expect, it } from "vitest";
import { INSUFFICIENT_EVIDENCE_MESSAGE } from "@/lib/ai/grounding";
import type { SemanticSearchResult } from "@/lib/ai/search";
import {
  citationsAreValid,
  extractStructuredCitations,
} from "./citations";

const chunks: SemanticSearchResult[] = [
  {
    chunk_id: "c1",
    file_id: "f1",
    path: "src/parse.ts",
    language: "ts",
    start_line: 4,
    end_line: 18,
    content: "export function parseGitHubRepoInput() {}",
    similarity: 0.9,
  },
];

describe("extractStructuredCitations", () => {
  it("keeps only retrieved snapshot sources", () => {
    const citations = extractStructuredCitations(
      "Parsing lives here [S1].",
      chunks,
      "snap-1",
    );
    expect(citations).toEqual([
      {
        chunkId: "c1",
        path: "src/parse.ts",
        startLine: 4,
        endLine: 18,
        snapshotId: "snap-1",
      },
    ]);
    expect(citationsAreValid(citations, chunks, "snap-1")).toBe(true);
  });

  it("rejects citations from another snapshot", () => {
    const citations = extractStructuredCitations(
      "Parsing lives here [S1].",
      chunks,
      "snap-1",
    );
    expect(citationsAreValid(citations, chunks, "snap-2")).toBe(false);
  });

  it("returns no citations for the insufficient-evidence fallback", () => {
    expect(
      extractStructuredCitations(INSUFFICIENT_EVIDENCE_MESSAGE, chunks, "snap-1"),
    ).toEqual([]);
  });
});
