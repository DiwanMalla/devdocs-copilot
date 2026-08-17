import "server-only";

import { createClient } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/ai/embeddings";
import type { SemanticSearchResult } from "@/lib/ai/search";
import {
  FINAL_CHUNK_LIMIT,
  LEXICAL_CANDIDATE_COUNT,
  MAX_RETRIEVAL_QUERY_CHARACTERS,
  VECTOR_CANDIDATE_COUNT,
  VECTOR_MATCH_THRESHOLD,
} from "./limits";
import {
  diversifyRankedChunks,
  mergeHybridCandidates,
  type RetrievalCandidate,
} from "./ranking";

export type RetrievalDiagnostics = {
  snapshotId: string | null;
  vectorCount: number;
  lexicalCount: number;
  selectedChunkIds: string[];
  minHybridScore: number | null;
  durationMs: number;
};

export type RetrievalResult = {
  chunks: SemanticSearchResult[];
  diagnostics: RetrievalDiagnostics;
};

function lexicalQuery(query: string): string {
  return query
    .replace(/[^\p{L}\p{N}\s/_.-]+/gu, " ")
    .trim()
    .slice(0, 200);
}

export async function retrieveRepoChunks(input: {
  repoId: string;
  query: string;
  snapshotId?: string | null;
  limit?: number;
}): Promise<RetrievalResult> {
  const started = Date.now();
  const normalizedQuery = input.query.trim();
  const limit = input.limit ?? FINAL_CHUNK_LIMIT;

  if (!normalizedQuery) {
    return {
      chunks: [],
      diagnostics: emptyDiagnostics(input.snapshotId ?? null, started),
    };
  }

  if (normalizedQuery.length > MAX_RETRIEVAL_QUERY_CHARACTERS) {
    throw new Error(
      `Search queries must be ${MAX_RETRIEVAL_QUERY_CHARACTERS} characters or fewer.`,
    );
  }

  const queryEmbedding = await embedQuery(normalizedQuery);
  const supabase = await createClient();
  const snapshotId = input.snapshotId ?? null;

  const [vectorResult, lexicalResult] = await Promise.all([
    supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_repo_id: input.repoId,
      match_threshold: VECTOR_MATCH_THRESHOLD,
      match_count: VECTOR_CANDIDATE_COUNT,
      match_snapshot_id: snapshotId,
    }),
    supabase.rpc("search_chunks_lexical", {
      match_repo_id: input.repoId,
      match_query: lexicalQuery(normalizedQuery) || normalizedQuery.slice(0, 80),
      match_count: LEXICAL_CANDIDATE_COUNT,
      match_snapshot_id: snapshotId,
    }),
  ]);

  if (vectorResult.error) {
    throw new Error(`Semantic search failed: ${vectorResult.error.message}`);
  }

  const lexical = lexicalResult.error
    ? []
    : ((lexicalResult.data ?? []) as RetrievalCandidate[]);
  const vector = (vectorResult.data ?? []) as RetrievalCandidate[];
  const ranked = diversifyRankedChunks(
    mergeHybridCandidates(vector, lexical),
    limit,
  );

  return {
    chunks: ranked.map((chunk) => ({
      chunk_id: chunk.chunk_id,
      file_id: chunk.file_id,
      path: chunk.path,
      language: chunk.language,
      start_line: chunk.start_line,
      end_line: chunk.end_line,
      content: chunk.content,
      similarity: chunk.hybridScore,
    })),
    diagnostics: {
      snapshotId,
      vectorCount: vector.length,
      lexicalCount: lexical.length,
      selectedChunkIds: ranked.map((chunk) => chunk.chunk_id),
      minHybridScore: ranked.at(-1)?.hybridScore ?? null,
      durationMs: Date.now() - started,
    },
  };
}

function emptyDiagnostics(
  snapshotId: string | null,
  started: number,
): RetrievalDiagnostics {
  return {
    snapshotId,
    vectorCount: 0,
    lexicalCount: 0,
    selectedChunkIds: [],
    minHybridScore: null,
    durationMs: Date.now() - started,
  };
}
