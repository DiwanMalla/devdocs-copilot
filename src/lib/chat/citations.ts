import { INSUFFICIENT_EVIDENCE_MESSAGE } from "@/lib/ai/grounding";
import type { SemanticSearchResult } from "@/lib/ai/search";
import type { StructuredCitation } from "@/lib/supabase/types";

export type { StructuredCitation };

const TOKEN_PATTERN = /\[S(\d+)\]/gi;
const PATH_PATTERN = /\[(?:Source:\s*)?([^:\]\n]+):L(\d+)-L(\d+)\]/gi;

export function citationTokenForChunk(chunk: SemanticSearchResult): string {
  return `[${chunk.path}:L${chunk.start_line}-L${chunk.end_line}]`;
}

export function extractStructuredCitations(
  answer: string,
  chunks: SemanticSearchResult[],
  snapshotId: string,
): StructuredCitation[] {
  if (
    chunks.length === 0 ||
    answer === INSUFFICIENT_EVIDENCE_MESSAGE ||
    !snapshotId
  ) {
    return [];
  }

  const selected = new Map<string, StructuredCitation>();

  for (const match of answer.matchAll(TOKEN_PATTERN)) {
    const index = Number.parseInt(match[1] ?? "", 10) - 1;
    const chunk = chunks[index];
    if (chunk) {
      selected.set(chunk.chunk_id, toCitation(chunk, snapshotId));
    }
  }

  for (const match of answer.matchAll(PATH_PATTERN)) {
    const path = match[1]?.trim() ?? "";
    const start = Number.parseInt(match[2] ?? "", 10);
    const end = Number.parseInt(match[3] ?? "", 10);
    const chunk = chunks.find(
      (candidate) =>
        candidate.path === path &&
        start >= candidate.start_line &&
        end <= candidate.end_line,
    );
    if (chunk) {
      selected.set(chunk.chunk_id, toCitation(chunk, snapshotId));
    }
  }

  return [...selected.values()];
}

export function citationsAreValid(
  citations: StructuredCitation[],
  chunks: SemanticSearchResult[],
  snapshotId: string,
): boolean {
  const allowed = new Set(chunks.map((chunk) => chunk.chunk_id));
  return citations.every(
    (citation) =>
      citation.snapshotId === snapshotId && allowed.has(citation.chunkId),
  );
}

function toCitation(
  chunk: SemanticSearchResult,
  snapshotId: string,
): StructuredCitation {
  return {
    chunkId: chunk.chunk_id,
    path: chunk.path,
    startLine: chunk.start_line,
    endLine: chunk.end_line,
    snapshotId,
  };
}
