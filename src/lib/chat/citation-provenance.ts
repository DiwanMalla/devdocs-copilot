import type { StructuredCitation } from "@/lib/supabase/types";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";
import { buildGitHubFileUrl } from "@/lib/repo/github-url";
import { findReadmePath } from "@/lib/repo/priority-paths";
import { parseLineRange } from "@/lib/repo/line-range";
import { REPO_OVERVIEW_PATH } from "./overview-question";

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

export type ResolvedCitationLink = {
  href?: string;
  fallbackHref?: string;
  unavailable: boolean;
};

export function resolveCitationTarget(input: {
  path: string;
  startLine: number;
  endLine: number;
  structured: StructuredCitation | null;
  availableSnapshotIds: ReadonlySet<string>;
  indexedPaths: ReadonlySet<string>;
  owner: string;
  name: string;
  chatId: string | null;
  basePath?: string | null;
  githubRepoUrl?: string | null;
  githubRef?: string | null;
}): ResolvedCitationLink {
  const mappedPath =
    input.path === REPO_OVERVIEW_PATH
      ? findReadmePath(input.indexedPaths)
      : input.path;
  const pathExists = Boolean(
    mappedPath && input.indexedPaths.has(mappedPath),
  );
  const linesValid = parseLineRange(`${input.startLine}-${input.endLine}`);
  const githubPath =
    mappedPath && mappedPath !== REPO_OVERVIEW_PATH
      ? mappedPath
      : findReadmePath(input.indexedPaths);
  const githubHref =
    input.githubRepoUrl && input.githubRef && githubPath
      ? buildGitHubFileUrl(
          input.githubRepoUrl,
          input.githubRef,
          githubPath,
          linesValid,
        )
      : (input.githubRepoUrl ?? undefined);

  const snapshotOk =
    input.structured !== null &&
    citationAvailability(input.structured, input.availableSnapshotIds) ===
      "available";

  if (snapshotOk && input.structured) {
    const structuredPath =
      input.structured.path === REPO_OVERVIEW_PATH
        ? mappedPath
        : input.structured.path;
    if (structuredPath && input.indexedPaths.has(structuredPath)) {
      return {
        href: buildCitationHref(
          {
            ...input.structured,
            path: structuredPath,
          },
          {
            owner: input.owner,
            name: input.name,
            chatId: input.chatId,
            basePath: input.basePath,
          },
        ),
        unavailable: false,
      };
    }
  }

  if (pathExists && mappedPath) {
    return {
      href: buildRepoWorkspaceHref({
        owner: input.owner,
        name: input.name,
        path: mappedPath,
        lines: linesValid,
        chatId: input.chatId,
        basePath: input.basePath,
      }),
      fallbackHref: githubHref,
      unavailable: false,
    };
  }

  return {
    fallbackHref: githubHref,
    unavailable: true,
  };
}
