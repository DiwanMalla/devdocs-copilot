import { describe, expect, it } from "vitest";
import {
  buildGroundedSystemPrompt,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  normalizeAnswerCitations,
} from "./grounding";
import type { SemanticSearchResult } from "./search";

const chunks: SemanticSearchResult[] = [
  {
    chunk_id: "c1",
    file_id: "f1",
    path: "source/index.ts",
    language: "ts",
    start_line: 10,
    end_line: 20,
    content:
      "export function isString(value: unknown): value is string {\n  return typeof value === 'string';\n}",
    similarity: 0.9,
  },
  {
    chunk_id: "c2",
    file_id: "f2",
    path: "readme.md",
    language: "md",
    start_line: 1,
    end_line: 5,
    content: "# is\nType check helpers.",
    similarity: 0.7,
  },
];

describe("buildGroundedSystemPrompt", () => {
  it("requires citation tokens and forbids invented paths or details", () => {
    const prompt = buildGroundedSystemPrompt("sindresorhus", "is", chunks);
    expect(prompt).toContain("Strict grounding rules");
    expect(prompt).toContain("Do not invent file paths");
    expect(prompt).toContain("[S1]");
    expect(prompt).toContain("PATH: source/index.ts");
    expect(prompt).toContain("LINES: 10-20");
    expect(prompt).toContain("export function isString");
    expect(prompt).toContain(INSUFFICIENT_EVIDENCE_MESSAGE);
  });
});

describe("normalizeAnswerCitations", () => {
  it("maps source tokens to exact stored path citations", () => {
    expect(
      normalizeAnswerCitations(
        "It checks typeof === string [S1].",
        chunks,
      ),
    ).toBe("It checks typeof === string [source/index.ts:L10-L20].");
  });

  it("rejects answers with no valid citations instead of inventing sources", () => {
    expect(
      normalizeAnswerCitations(
        "This repo uses a custom AuthService in auth/service.ts.",
        chunks,
      ),
    ).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
  });

  it("strips invented file-path citations that are not in retrieved chunks", () => {
    expect(
      normalizeAnswerCitations(
        "See the helper [auth/service.ts:L1-L10] and the real check [S1].",
        chunks,
      ),
    ).toBe("See the helper and the real check [source/index.ts:L10-L20].");
  });

  it("does not remap invented line ranges onto a matching path", () => {
    expect(
      normalizeAnswerCitations(
        "Look here [source/index.ts:L999-L1000].",
        chunks,
      ),
    ).toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
  });

  it("returns the insufficient-evidence message when no chunks were retrieved", () => {
    expect(normalizeAnswerCitations("Anything at all [S1].", [])).toBe(
      INSUFFICIENT_EVIDENCE_MESSAGE,
    );
  });
});
