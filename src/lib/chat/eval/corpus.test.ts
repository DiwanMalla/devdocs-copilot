import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diversifyRankedChunks,
  mergeHybridCandidates,
  type RetrievalCandidate,
} from "../ranking";
import { extractStructuredCitations } from "../citations";
import { INSUFFICIENT_EVIDENCE_MESSAGE } from "@/lib/ai/grounding";
import type { SemanticSearchResult } from "@/lib/ai/search";

type EvalCase = {
  id: string;
  question: string;
  expectedPaths: string[];
  mustCite: boolean;
};

type EvalCorpus = {
  version: number;
  budget: {
    maxLatencyMs: number;
    minCitationPrecision: number;
    minRecallAt8: number;
  };
  cases: EvalCase[];
};

const corpus = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/lib/chat/eval/corpus.json"), "utf8"),
) as EvalCorpus;

const fixtures: Record<string, RetrievalCandidate[]> = {
  "type-guard": [
    {
      chunk_id: "c1",
      file_id: "f1",
      path: "source/index.ts",
      language: "ts",
      start_line: 10,
      end_line: 20,
      content: "export function isString(value: unknown): value is string { return typeof value === 'string'; }",
      similarity: 0.91,
    },
  ],
  "readme-purpose": [
    {
      chunk_id: "c2",
      file_id: "f2",
      path: "readme.md",
      language: "md",
      start_line: 1,
      end_line: 6,
      content: "Type check values. This package is a type guard helper.",
      similarity: 0.84,
    },
  ],
  "no-evidence": [],
};

describe("RAG evaluation corpus", () => {
  it("keeps a versioned public-repo fixture set", () => {
    expect(corpus.version).toBe(1);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(3);
    expect(corpus.budget.maxLatencyMs).toBeLessThanOrEqual(15_000);
  });

  it("selects expected files for evidence questions and none for no-evidence", () => {
    for (const evalCase of corpus.cases) {
      const ranked = diversifyRankedChunks(
        mergeHybridCandidates(fixtures[evalCase.id] ?? [], []),
        8,
      );
      const paths = new Set(ranked.map((chunk) => chunk.path.toLowerCase()));
      if (evalCase.expectedPaths.length === 0) {
        expect(ranked).toHaveLength(0);
        continue;
      }

      const hits = evalCase.expectedPaths.some((path) =>
        paths.has(path.toLowerCase()),
      );
      expect(hits).toBe(true);
    }
  });

  it("only emits citations from retrieved snapshot chunks", () => {
    const grounded = corpus.cases.find((item) => item.mustCite);
    expect(grounded).toBeTruthy();
    const chunks = (fixtures[grounded!.id] ?? []) as SemanticSearchResult[];
    const citations = extractStructuredCitations(
      `Implemented here [S1].`,
      chunks.map((chunk) => ({
        ...chunk,
        similarity: chunk.similarity ?? 0.9,
      })),
      "snap-eval",
    );
    expect(citations).toHaveLength(1);
    expect(
      extractStructuredCitations(INSUFFICIENT_EVIDENCE_MESSAGE, chunks, "snap-eval"),
    ).toHaveLength(0);
  });
});
