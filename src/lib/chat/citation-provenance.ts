import type { StructuredCitation } from "@/lib/supabase/types";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";

export type CitationAvailability = "available" | "unavailable";

export function citationAvailability(
  citation: StructuredCitation,
  availableSnapshotIds: ReadonlySet<string>,
): CitationAvailability {
  return availableSnapshotIds.has(citation.snapshotId)
    ? "available"
    : "unavailable";
}

export function findStructuredCitation(
  citations: StructuredCitation[],
  path: string,
  startLine: number,
  endLine: number,
): StructuredCitation | null {
  return (
    citations.find(
      (citation) =>
        citation.path === path &&
        citation.startLine === startLine &&
        citation.endLine === endLine,
    ) ?? null
  );
}

export function buildCitationHref(
  citation: StructuredCitation,
  input: {
    owner: string;
    name: string;
    chatId: string | null;
    basePath?: string | null;
  },
): string {
  return buildRepoWorkspaceHref({
    owner: input.owner,
    name: input.name,
    path: citation.path,
    lines: {
      start: citation.startLine,
      end: citation.endLine,
    },
    chatId: input.chatId,
    snapshotId: citation.snapshotId,
    basePath: input.basePath,
  });
}
