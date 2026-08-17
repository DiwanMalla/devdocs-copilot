import "server-only";

import { retrieveRepoChunks } from "@/lib/chat/retrieval";
import { MAX_RETRIEVAL_QUERY_CHARACTERS } from "@/lib/chat/limits";

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
  snapshotId?: string | null,
): Promise<SemanticSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  if (normalizedQuery.length > MAX_RETRIEVAL_QUERY_CHARACTERS) {
    throw new Error(
      `Search queries must be ${MAX_RETRIEVAL_QUERY_CHARACTERS} characters or fewer.`,
    );
  }

  const result = await retrieveRepoChunks({
    repoId,
    query: normalizedQuery,
    snapshotId,
    limit,
  });
  return result.chunks;
}
