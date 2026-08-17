import "server-only";

import { createClient } from "@/lib/supabase/server";
import { embedQuery } from "./embeddings";

export type SemanticSearchResult = {
  chunk_id: string;
  file_id: string;
  path: string;
  language: string | null;
  start_line: number;
  end_line: number;
  content: string;
  similarity: number;
};

export async function searchRepoChunks(
  repoId: string,
  query: string,
  limit = 8,
): Promise<SemanticSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  if (normalizedQuery.length > 500) {
    throw new Error("Search queries must be 500 characters or fewer.");
  }

  const queryEmbedding = await embedQuery(normalizedQuery);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_repo_id: repoId,
    match_threshold: 0.2,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return (data ?? []) as SemanticSearchResult[];
}
