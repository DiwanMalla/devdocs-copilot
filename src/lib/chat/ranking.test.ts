import { describe, expect, it } from "vitest";
import {
  diversifyRankedChunks,
  mergeHybridCandidates,
  type RetrievalCandidate,
} from "./ranking";
import { MIN_HYBRID_SCORE } from "./limits";

const vector: RetrievalCandidate[] = [
  {
    chunk_id: "v1",
    file_id: "f1",
    path: "src/auth.ts",
    language: "ts",
    start_line: 1,
    end_line: 20,
    content: "export function requireUser() {}",
    similarity: 0.82,
  },
  {
    chunk_id: "v2",
    file_id: "f1",
    path: "src/auth.ts",
    language: "ts",
    start_line: 21,
    end_line: 40,
    content: "export function getUser() {}",
    similarity: 0.8,
  },
  {
    chunk_id: "v3",
    file_id: "f1",
    path: "src/auth.ts",
    language: "ts",
    start_line: 41,
    end_line: 60,
    content: "export function signOut() {}",
    similarity: 0.79,
  },
  {
    chunk_id: "v4",
    file_id: "f2",
    path: "src/session.ts",
    language: "ts",
    start_line: 1,
    end_line: 12,
    content: "session cookie helpers",
    similarity: 0.4,
  },
];

const lexical: RetrievalCandidate[] = [
  {
    chunk_id: "v1",
    file_id: "f1",
    path: "src/auth.ts",
    language: "ts",
    start_line: 1,
    end_line: 20,
    content: "export function requireUser() {}",
    rank: 0.9,
  },
  {
    chunk_id: "l1",
    file_id: "f3",
    path: "README.md",
    language: "md",
    start_line: 1,
    end_line: 8,
    content: "Authentication lives in src/auth.ts",
    rank: 0.6,
  },
];

describe("mergeHybridCandidates", () => {
  it("boosts chunks found by both vector and lexical search", () => {
    const ranked = mergeHybridCandidates(vector, lexical);
    expect(ranked[0]?.chunk_id).toBe("v1");
    expect(ranked[0]?.hybridScore).toBeGreaterThan(ranked[1]?.hybridScore ?? 0);
  });

  it("keeps lexical-only and vector-only evidence", () => {
    const ranked = mergeHybridCandidates(vector, lexical);
    expect(ranked.some((chunk) => chunk.chunk_id === "l1")).toBe(true);
    expect(ranked.some((chunk) => chunk.chunk_id === "v4")).toBe(true);
  });
});

describe("diversifyRankedChunks", () => {
  it("caps chunks per file and fills remaining slots from other files", () => {
    const selected = diversifyRankedChunks(
      mergeHybridCandidates(vector, lexical),
      4,
    );
    const authCount = selected.filter((chunk) => chunk.path === "src/auth.ts").length;
    expect(authCount).toBeLessThanOrEqual(2);
    expect(selected.some((chunk) => chunk.path === "README.md")).toBe(true);
    expect(selected.every((chunk) => chunk.hybridScore >= MIN_HYBRID_SCORE)).toBe(
      true,
    );
  });
});
