import {
  isPackageJsonPath,
  isPrioritySourcePath,
  isReadmePath,
  priorityPathBoost,
} from "@/lib/repo/priority-paths";
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
      hybridScore:
        (item.similarity ?? 0) * 0.85 + priorityPathBoost(item.path),
    });
  }

  for (const item of lexical) {
    const lexicalScore = (item.rank ?? 0) / maxLexical;
    const existing = merged.get(item.chunk_id);
    if (existing) {
      existing.lexicalScore = lexicalScore;
      existing.hybridScore =
        existing.vectorScore * 0.7 +
        lexicalScore * 0.3 +
        priorityPathBoost(item.path);
      continue;
    }

    merged.set(item.chunk_id, {
      ...item,
      vectorScore: 0,
      lexicalScore,
      hybridScore: lexicalScore * 0.85 + priorityPathBoost(item.path),
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
    if (!meetsRetrievalFloor(chunk)) {
      continue;
    }
    const used = perFile.get(chunk.path) ?? 0;
    if (used >= MAX_CHUNKS_PER_FILE) {
      continue;
    }
    selected.push(chunk);
    perFile.set(chunk.path, used + 1);
    if (selected.length >= limit) {
      break;
    }
  }

  if (selected.length < limit) {
    for (const chunk of chunks) {
      if (selected.some((item) => item.chunk_id === chunk.chunk_id)) {
        continue;
      }
      if (!meetsRetrievalFloor(chunk)) {
        continue;
      }
      selected.push(chunk);
      if (selected.length >= limit) {
        break;
      }
    }
  }

  return ensurePriorityCoverage(selected, chunks, limit);
}

function ensurePriorityCoverage(
  selected: RankedChunk[],
  chunks: RankedChunk[],
  limit: number,
): RankedChunk[] {
  const already = new Set(selected.map((chunk) => chunk.chunk_id));
  const extras = pickPriorityExtras(chunks, already);
  if (extras.length === 0) {
    return selected;
  }

  const next = [...selected];
  for (const extra of extras) {
    if (next.length < limit) {
      next.push(extra);
      continue;
    }
    const replaceAt = [...next]
      .reverse()
      .findIndex((chunk) => !isPrioritySourcePath(chunk.path));
    if (replaceAt < 0) {
      break;
    }
    next.splice(next.length - 1 - replaceAt, 1, extra);
  }
  return next;
}

function pickPriorityExtras(
  chunks: RankedChunk[],
  already: ReadonlySet<string>,
): RankedChunk[] {
  const unused = chunks.filter(
    (chunk) => isPrioritySourcePath(chunk.path) && !already.has(chunk.chunk_id),
  );
  const picked: RankedChunk[] = [];
  const seenKind = new Set<string>();

  for (const chunk of unused) {
    const kind = isReadmePath(chunk.path)
      ? "readme"
      : isPackageJsonPath(chunk.path)
        ? "package"
        : "docs";
    if (seenKind.has(kind)) {
      continue;
    }
    seenKind.add(kind);
    picked.push(chunk);
    if (picked.length >= 2) {
      break;
    }
  }

  return picked;
}

function meetsRetrievalFloor(chunk: RankedChunk): boolean {
  return (
    isPrioritySourcePath(chunk.path) || chunk.hybridScore >= MIN_HYBRID_SCORE
  );
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
