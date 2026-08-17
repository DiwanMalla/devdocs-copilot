import { MAX_CHUNKS_PER_FILE, MIN_HYBRID_SCORE } from "./limits";

export type RankedChunk = {
  chunk_id: string;
  file_id: string;
  path: string;
  language: string | null;
  start_line: number;
  end_line: number;
  content: string;
  vectorScore: number;
  lexicalScore: number;
  hybridScore: number;
};

export type RetrievalCandidate = {
  chunk_id: string;
  file_id: string;
  path: string;
  language: string | null;
  start_line: number;
  end_line: number;
  content: string;
  similarity?: number;
  rank?: number;
};

export function mergeHybridCandidates(
  vector: RetrievalCandidate[],
  lexical: RetrievalCandidate[],
): RankedChunk[] {
  const maxLexical = Math.max(0.0001, ...lexical.map((item) => item.rank ?? 0));
  const merged = new Map<string, RankedChunk>();

  for (const item of vector) {
    merged.set(item.chunk_id, {
      ...item,
      vectorScore: item.similarity ?? 0,
      lexicalScore: 0,
      hybridScore: (item.similarity ?? 0) * 0.85,
    });
  }

  for (const item of lexical) {
    const lexicalScore = (item.rank ?? 0) / maxLexical;
    const existing = merged.get(item.chunk_id);
    if (existing) {
      existing.lexicalScore = lexicalScore;
      existing.hybridScore =
        existing.vectorScore * 0.7 + lexicalScore * 0.3;
      continue;
    }

    merged.set(item.chunk_id, {
      ...item,
      vectorScore: 0,
      lexicalScore,
      hybridScore: lexicalScore * 0.85,
    });
  }

  return [...merged.values()].sort(compareRankedChunks);
}

export function diversifyRankedChunks(
  chunks: RankedChunk[],
  limit: number,
): RankedChunk[] {
  const selected: RankedChunk[] = [];
  const perFile = new Map<string, number>();

  for (const chunk of chunks) {
    if (chunk.hybridScore < MIN_HYBRID_SCORE) {
      continue;
    }
    const used = perFile.get(chunk.path) ?? 0;
    if (used >= MAX_CHUNKS_PER_FILE) {
      continue;
    }
    selected.push(chunk);
    perFile.set(chunk.path, used + 1);
    if (selected.length >= limit) {
      return selected;
    }
  }

  if (selected.length < limit) {
    for (const chunk of chunks) {
      if (selected.some((item) => item.chunk_id === chunk.chunk_id)) {
        continue;
      }
      if (chunk.hybridScore < MIN_HYBRID_SCORE) {
        continue;
      }
      selected.push(chunk);
      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

function compareRankedChunks(a: RankedChunk, b: RankedChunk): number {
  if (b.hybridScore !== a.hybridScore) {
    return b.hybridScore - a.hybridScore;
  }
  if (a.path !== b.path) {
    return a.path.localeCompare(b.path);
  }
  return a.start_line - b.start_line;
}
