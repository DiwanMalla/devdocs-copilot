import { RepoWorkspace } from "@/components/repo-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  searchRepoChunks,
  type SemanticSearchResult,
} from "@/lib/ai/search";
import { DEMO_REPO_INPUT, DEMO_WORKSPACE_PATH } from "@/lib/demo/config";
import {
  ensureDemoRepo,
  getDemoFileByPath,
  getDemoSnapshot,
  listDemoFileMeta,
  listDemoSnapshotIds,
} from "@/lib/demo/workspace";
import { buildGitHubFileUrl } from "@/lib/repo/github-url";
import { parseLineRange } from "@/lib/repo/line-range";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getDemoSearchOutcome(
  repoId: string,
  query: string,
  enabled: boolean,
  snapshotId: string | null,
): Promise<{ results: SemanticSearchResult[]; error: string | null }> {
  if (!query || !enabled) {
    return { results: [], error: null };
  }

  try {
    return {
      results: await searchRepoChunks(
        repoId,
        query,
        8,
        snapshotId,
        createAdminClient(),
      ),
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

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!hasSupabaseConfig()) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
        <Alert>
          <AlertTitle>Demo is not configured yet</AlertTitle>
          <AlertDescription>
            The live demo needs Supabase and OpenRouter keys. After those are
            set, open {DEMO_WORKSPACE_PATH} to auto-load {DEMO_REPO_INPUT}.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  let repo;
  try {
    repo = await ensureDemoRepo();
  } catch (error) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
        <Alert variant="destructive">
          <AlertTitle>Could not load the sample repository</AlertTitle>
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : `The ${DEMO_REPO_INPUT} demo snapshot is unavailable.`}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const query = await searchParams;
  const selectedPath = typeof query.path === "string" ? query.path : null;
  const searchQuery = typeof query.q === "string" ? query.q.trim() : "";
  const requestedLines = parseLineRange(query.lines);
  const requestedSnapshot =
    typeof query.snapshot === "string" ? query.snapshot : null;

  const searchOutcome = await getDemoSearchOutcome(
    repo.id,
    searchQuery,
    Boolean(repo.active_snapshot_id) && repo.chunk_count > 0,
    repo.active_snapshot_id,
  );

  const viewedSnapshotId = requestedSnapshot ?? repo.active_snapshot_id;
  const viewedSnapshot = viewedSnapshotId
    ? await getDemoSnapshot(repo.id, viewedSnapshotId)
    : null;
  const requestedSnapshotUnavailable =
    Boolean(requestedSnapshot) && !viewedSnapshot;
  const files = viewedSnapshot
    ? await listDemoFileMeta(repo.id, viewedSnapshot.id)
    : [];

  const selectedFile =
    selectedPath !== null && viewedSnapshot
      ? await getDemoFileByPath(repo.id, selectedPath, viewedSnapshot.id)
      : null;

  const defaultFilePath = files[0]?.path ?? null;
  const fileToShow =
    selectedFile ??
    (selectedPath === null && defaultFilePath && viewedSnapshot
      ? await getDemoFileByPath(repo.id, defaultFilePath, viewedSnapshot.id)
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
        viewedSnapshot?.commit_sha ?? repo.default_branch,
        fileToShow.path,
        highlightedLines,
      )
    : null;

  return (
    <RepoWorkspace
      repo={repo}
      demo
      chats={[]}
      activeChatId={null}
      initialMessages={[]}
      availableSnapshotIds={await listDemoSnapshotIds(repo.id, [
        ...(repo.active_snapshot_id ? [repo.active_snapshot_id] : []),
        ...(viewedSnapshot ? [viewedSnapshot.id] : []),
      ])}
      files={files}
      fileToShow={fileToShow}
      selectedFile={selectedFile}
      selectedPath={selectedPath}
      activePath={activePath}
      highlightedLines={highlightedLines}
      githubFileUrl={githubFileUrl}
      requestedLines={requestedLines}
      requestedSnapshot={requestedSnapshot}
      requestedSnapshotUnavailable={requestedSnapshotUnavailable}
      searchQuery={searchQuery}
      searchOutcome={searchOutcome}
    />
  );
}
