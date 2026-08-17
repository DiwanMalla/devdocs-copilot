import Link from "next/link";
import { notFound } from "next/navigation";
import { FileTree } from "@/components/file-tree";
import { FileViewer, type LineRange } from "@/components/file-viewer";
import { RepoChat } from "@/components/repo-chat";
import { SemanticSearch } from "@/components/semantic-search";
import { Badge } from "@/components/ui/badge";
import {
  searchRepoChunks,
  type SemanticSearchResult,
} from "@/lib/ai/search";
import {
  getRepoByOwnerName,
  getRepoFileByPath,
  listRepoFileMeta,
} from "@/lib/supabase/queries";
import type { RepoStatus } from "@/lib/supabase/types";

export const maxDuration = 60;

function statusVariant(status: RepoStatus) {
  if (status === "ready") return "default" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function parseLineRange(value: unknown): LineRange | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }

  const start = Number.parseInt(match[1] ?? "", 10);
  const end = Number.parseInt(match[2] ?? "", 10);
  if (start < 1 || end < start || end - start > 500) {
    return null;
  }

  return { start, end };
}

function buildGitHubFileUrl(
  repoUrl: string,
  ref: string,
  path: string,
  lines: LineRange | null,
): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const lineHash = lines ? `#L${lines.start}-L${lines.end}` : "";
  return `${repoUrl}/blob/${encodeURIComponent(ref)}/${encodedPath}${lineHash}`;
}

async function getSearchOutcome(
  repoId: string,
  query: string,
  enabled: boolean,
): Promise<{ results: SemanticSearchResult[]; error: string | null }> {
  if (!query || !enabled) {
    return { results: [], error: null };
  }

  try {
    return {
      results: await searchRepoChunks(repoId, query),
      error: null,
    };
  } catch (error) {
    return {
      results: [],
      error:
        error instanceof Error ? error.message : "Semantic search failed.",
    };
  }
}

export default async function RepoPage({
  params,
  searchParams,
}: PageProps<"/repos/[owner]/[name]">) {
  const { owner, name } = await params;
  const query = await searchParams;
  const selectedPath = typeof query.path === "string" ? query.path : null;
  const searchQuery = typeof query.q === "string" ? query.q.trim() : "";
  const requestedLines = parseLineRange(query.lines);

  const repo = await getRepoByOwnerName(
    decodeURIComponent(owner),
    decodeURIComponent(name),
  );

  if (!repo) {
    notFound();
  }

  const [files, searchOutcome] = await Promise.all([
    listRepoFileMeta(repo.id),
    getSearchOutcome(repo.id, searchQuery, repo.status === "ready"),
  ]);
  const selectedFile =
    selectedPath !== null
      ? await getRepoFileByPath(repo.id, selectedPath)
      : null;

  const defaultFilePath = files[0]?.path ?? null;
  const fileToShow =
    selectedFile ??
    (selectedPath === null && defaultFilePath
      ? await getRepoFileByPath(repo.id, defaultFilePath)
      : null);
  const activePath = selectedFile?.path ?? fileToShow?.path ?? null;
  const fileLineCount = fileToShow?.content.split("\n").length ?? 0;
  const highlightedLines =
    requestedLines && requestedLines.end <= fileLineCount
      ? requestedLines
      : null;
  const githubFileUrl = fileToShow
    ? buildGitHubFileUrl(
        repo.html_url,
        repo.commit_sha ?? repo.default_branch,
        fileToShow.path,
        highlightedLines,
      )
    : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {repo.owner}/{repo.name}
            </h1>
            <Badge variant={statusVariant(repo.status)}>{repo.status}</Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            {repo.description ?? "No description."}
          </p>
          <p className="text-muted-foreground font-mono text-xs">
            {repo.file_count} files · {repo.default_branch}
            {repo.commit_sha ? ` @ ${repo.commit_sha.slice(0, 7)}` : ""}
            {repo.chunk_count > 0 ? ` · ${repo.chunk_count} chunks` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={repo.html_url}
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </Link>
          <Link href="/" className="hover:underline underline-offset-4">
            Ingest another
          </Link>
        </div>
      </div>

      {repo.status === "failed" && repo.error ? (
        <p className="text-destructive text-sm" role="alert">
          {repo.error}
        </p>
      ) : null}

      <RepoChat
        owner={repo.owner}
        name={repo.name}
        disabled={repo.status !== "ready" || repo.chunk_count === 0}
      />

      <SemanticSearch
        owner={repo.owner}
        name={repo.name}
        query={searchQuery}
        results={searchOutcome.results}
        error={searchOutcome.error}
        disabled={repo.status !== "ready" || repo.chunk_count === 0}
      />

      <div className="bg-card grid h-[calc(100vh-11rem)] overflow-hidden rounded-xl ring-1 ring-foreground/10 lg:grid-cols-[280px_1fr]">
        <div className="h-full min-h-0 overflow-hidden border-b lg:border-r lg:border-b-0">
          <FileTree
            files={files}
            owner={repo.owner}
            name={repo.name}
            selectedPath={activePath}
          />
        </div>
        <div className="h-full min-h-0 overflow-hidden">
          <FileViewer
            file={fileToShow}
            highlightedLines={highlightedLines}
            githubUrl={githubFileUrl}
            emptyMessage={
              selectedPath && !selectedFile
                ? "That file is not in the ingested snapshot."
                : "Select a file from the tree."
            }
          />
        </div>
      </div>
    </main>
  );
}
