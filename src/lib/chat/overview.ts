import { chunkSource } from "@/lib/ai/chunking";
import type { SemanticSearchResult } from "@/lib/ai/search";
import {
  isPackageJsonPath,
  isReadmePath,
} from "@/lib/repo/priority-paths";
import { REPO_OVERVIEW_PATH } from "./overview-question";

const OVERVIEW_CHUNK_PREFIX = "repo-overview";
const FALLBACK_LIMIT = 10;

export function parsePackageJsonDescription(content: string): string | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "description" in parsed &&
      typeof parsed.description === "string"
    ) {
      const description = parsed.description.trim();
      return description || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildRepoOverviewChunk(input: {
  repoId: string;
  owner: string;
  name: string;
  description: string | null;
  summary: string | null;
  packageDescription: string | null;
}): SemanticSearchResult {
  const sections = [
    `Repository: ${input.owner}/${input.name}`,
    input.description ? `GitHub description: ${input.description}` : null,
    input.packageDescription
      ? `package.json description: ${input.packageDescription}`
      : null,
    input.summary ? `Repository summary:\n${input.summary}` : null,
  ].filter((section): section is string => Boolean(section));

  const content =
    sections.join("\n\n") ||
    `${input.owner}/${input.name} is an indexed GitHub repository.`;
  const endLine = Math.max(1, content.split("\n").length);

  return {
    chunk_id: `${OVERVIEW_CHUNK_PREFIX}:${input.repoId}`,
    file_id: `${OVERVIEW_CHUNK_PREFIX}:${input.repoId}`,
    path: REPO_OVERVIEW_PATH,
    language: "md",
    start_line: 1,
    end_line: endLine,
    content,
    similarity: 1,
  };
}

export function chunksFromFileContent(input: {
  fileId: string;
  path: string;
  language: string | null;
  content: string;
}): SemanticSearchResult[] {
  return chunkSource(input.content).map((chunk) => ({
    chunk_id: `file:${input.fileId}:${chunk.chunkIndex}`,
    file_id: input.fileId,
    path: input.path,
    language: input.language,
    start_line: chunk.startLine,
    end_line: chunk.endLine,
    content: chunk.content,
    similarity: 0.99,
  }));
}

export function mergeRetrievalWithOverview(
  retrieved: SemanticSearchResult[],
  overview: SemanticSearchResult[],
  limit = FALLBACK_LIMIT,
): SemanticSearchResult[] {
  const seen = new Set<string>();
  const merged: SemanticSearchResult[] = [];

  for (const chunk of [...overview, ...retrieved]) {
    if (seen.has(chunk.chunk_id)) {
      continue;
    }
    seen.add(chunk.chunk_id);
    merged.push(chunk);
  }

  return merged.slice(0, Math.max(limit, overview.length));
}

export function buildFallbackOverviewAnswer(input: {
  owner: string;
  name: string;
  description: string | null;
  summary: string | null;
  chunks: SemanticSearchResult[];
}): string {
  const overview =
    input.chunks.find((chunk) => chunk.path === REPO_OVERVIEW_PATH) ?? null;
  const readme =
    input.chunks.find((chunk) => isReadmePath(chunk.path)) ?? null;
  const packageJson =
    input.chunks.find((chunk) => isPackageJsonPath(chunk.path)) ?? null;

  const intro = input.description
    ? `${input.owner}/${input.name} is ${input.description.replace(/\.\s*$/, "")}.`
    : `${input.owner}/${input.name} is an indexed GitHub repository.`;

  const body = input.summary?.trim()
    ? input.summary.trim()
    : excerpt(readme?.content ?? packageJson?.content ?? overview?.content ?? "");

  const citation = citationFor(
    readme ?? packageJson ?? overview,
  );

  return [intro, body, citation].filter(Boolean).join("\n\n").trim();
}

function excerpt(content: string, max = 700): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function citationFor(chunk: SemanticSearchResult | null): string {
  if (!chunk) {
    return "";
  }
  return `[${chunk.path}:L${chunk.start_line}-L${chunk.end_line}]`;
}
