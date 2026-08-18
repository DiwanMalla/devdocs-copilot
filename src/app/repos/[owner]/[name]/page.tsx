import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { FileTree } from "@/components/file-tree";
import { FileViewer } from "@/components/file-viewer";
import { RepoChat } from "@/components/repo-chat";
import { RepoLifecycleActions } from "@/components/repo-lifecycle-actions";
import { RepoStatusBadge } from "@/components/repo-status-badge";
import { RepoStatusRefresh } from "@/components/repo-status-refresh";
import { SemanticSearch } from "@/components/semantic-search";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  searchRepoChunks,
  type SemanticSearchResult,
} from "@/lib/ai/search";
import { chatMessagesToUIMessages } from "@/lib/chat/messages";
import { parseLineRange } from "@/lib/repo/line-range";
import { requireUser } from "@/lib/supabase/auth";
import {
  getRepoByOwnerName,
  getRepoFileByPath,
  getRepoSnapshot,
  listAvailableSnapshotIds,
  listChatMessages,
  listOwnedChats,
  listRepoFileMeta,
} from "@/lib/supabase/queries";

export const maxDuration = 60;

function buildGitHubFileUrl(
  repoUrl: string,
  ref: string,
  path: string,
  lines: { start: number; end: number } | null,
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
}: {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { owner, name } = await params;
  const query = await searchParams;
  const selectedPath = typeof query.path === "string" ? query.path : null;
  const searchQuery = typeof query.q === "string" ? query.q.trim() : "";
  const requestedLines = parseLineRange(query.lines);
  const requestedChatId = typeof query.chat === "string" ? query.chat : null;
  const requestedSnapshot =
    typeof query.snapshot === "string" ? query.snapshot : null;

  const repo = await getRepoByOwnerName(
    decodeURIComponent(owner),
    decodeURIComponent(name),
  );

  if (!repo || repo.user_id !== user.id) {
    notFound();
  }

  const [searchOutcome, chats] = await Promise.all([
    getSearchOutcome(
      repo.id,
      searchQuery,
      Boolean(repo.active_snapshot_id) && repo.chunk_count > 0,
    ),
    listOwnedChats(repo.id),
  ]);

  if (requestedChatId && !chats.some((chat) => chat.id === requestedChatId)) {
    notFound();
  }

  const activeChat =
    chats.find((chat) => chat.id === requestedChatId) ?? chats[0] ?? null;
  const persistedMessages = activeChat
    ? await listChatMessages(activeChat.id)
    : [];
  const initialMessages = chatMessagesToUIMessages(persistedMessages);
  const messageSnapshotIds = persistedMessages.flatMap((message) => [
    ...(message.snapshot_id ? [message.snapshot_id] : []),
    ...message.citations.map((citation) => citation.snapshotId),
  ]);
  const availableSnapshotIds = await listAvailableSnapshotIds(repo.id, [
    ...(repo.active_snapshot_id ? [repo.active_snapshot_id] : []),
    ...messageSnapshotIds,
  ]);

  const viewedSnapshotId = requestedSnapshot ?? repo.active_snapshot_id;
  const viewedSnapshot = viewedSnapshotId
    ? await getRepoSnapshot(repo.id, viewedSnapshotId)
    : null;
  const requestedSnapshotUnavailable =
    Boolean(requestedSnapshot) && !viewedSnapshot;
  const files = viewedSnapshot
    ? await listRepoFileMeta(repo.id, viewedSnapshot.id)
    : [];

  const selectedFile =
    selectedPath !== null && viewedSnapshot
      ? await getRepoFileByPath(repo.id, selectedPath, viewedSnapshot.id)
      : null;

  const defaultFilePath = files[0]?.path ?? null;
  const fileToShow =
    selectedFile ??
    (selectedPath === null && defaultFilePath && viewedSnapshot
      ? await getRepoFileByPath(repo.id, defaultFilePath, viewedSnapshot.id)
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {repo.owner}/{repo.name}
            </h1>
            <RepoStatusBadge status={repo.status} />
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            {repo.description ?? "No description on GitHub."}
          </p>
          <p className="text-muted-foreground font-mono text-xs">
            {repo.file_count} files · {repo.default_branch}
            {repo.commit_sha ? ` @ ${repo.commit_sha.slice(0, 7)}` : ""}
            {repo.chunk_count > 0 ? ` · ${repo.chunk_count} chunks` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={repo.html_url} target="_blank" rel="noreferrer">
                GitHub
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/">Repositories</Link>
            </Button>
          </div>
          <RepoLifecycleActions
            repoId={repo.id}
            owner={repo.owner}
            name={repo.name}
            showOpen={false}
            indexing={repo.status === "ingesting" || repo.status === "indexing"}
          />
        </div>
      </div>

      {repo.status === "failed" && repo.error ? (
        <Alert variant="destructive">
          <AlertTitle>Indexing failed</AlertTitle>
          <AlertDescription>{repo.error}</AlertDescription>
        </Alert>
      ) : null}

      {repo.status === "ingesting" || repo.status === "indexing" ? (
        <Alert>
          <Loader2Icon className="animate-spin" />
          <AlertTitle>Indexing in the background</AlertTitle>
          <AlertDescription>
            Chat stays on the last ready snapshot if one exists. This page
            refreshes automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      <RepoStatusRefresh
        active={repo.status === "ingesting" || repo.status === "indexing"}
      />

      <div className="bg-card grid h-[min(40rem,calc(100dvh-9rem))] overflow-hidden rounded-xl ring-1 ring-foreground/10 max-lg:grid-rows-[10rem_minmax(0,1fr)] lg:h-128 lg:grid-cols-[220px_1fr]">
        <div className="min-h-0 overflow-hidden border-b lg:border-r lg:border-b-0">
          <ChatSidebar
            repoId={repo.id}
            owner={repo.owner}
            name={repo.name}
            chats={chats}
            activeChatId={activeChat?.id ?? null}
            path={selectedPath}
            query={searchQuery || null}
            snapshotId={requestedSnapshot}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <RepoChat
            key={activeChat?.id ?? "no-chat"}
            owner={repo.owner}
            name={repo.name}
            repoId={repo.id}
            chatId={activeChat?.id ?? null}
            availableSnapshotIds={availableSnapshotIds}
            initialMessages={initialMessages}
            disabled={!repo.active_snapshot_id || repo.chunk_count === 0}
            path={selectedPath}
            query={searchQuery || null}
          />
        </div>
      </div>

      <SemanticSearch
        owner={repo.owner}
        name={repo.name}
        query={searchQuery}
        results={searchOutcome.results}
        error={searchOutcome.error}
        disabled={!repo.active_snapshot_id || repo.chunk_count === 0}
        chatId={activeChat?.id ?? null}
        path={selectedPath}
      />

      <div className="bg-card grid h-[calc(100vh-11rem)] min-h-[28rem] overflow-hidden rounded-xl ring-1 ring-foreground/10 lg:grid-cols-[280px_1fr]">
        <div className="flex h-full min-h-0 flex-col overflow-hidden border-b lg:border-r lg:border-b-0">
          <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium tracking-wide uppercase">
            Source
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <FileTree
              files={files}
              owner={repo.owner}
              name={repo.name}
              selectedPath={activePath}
              chatId={activeChat?.id ?? null}
              query={searchQuery || null}
              snapshotId={requestedSnapshot}
            />
          </div>
        </div>
        <div className="h-full min-h-0 overflow-hidden">
          <FileViewer
            file={fileToShow}
            highlightedLines={highlightedLines}
            githubUrl={githubFileUrl}
            lineRangeWarning={
              requestedLines && fileToShow && !highlightedLines
                ? "Those cited lines are outside this file."
                : null
            }
            emptyMessage={
              selectedPath && requestedSnapshotUnavailable
                ? "That citation points to a snapshot that is no longer available."
                : selectedPath && !selectedFile
                  ? "That file is not in the ingested snapshot."
                  : "Select a file from the tree."
            }
          />
        </div>
      </div>
    </main>
  );
}
