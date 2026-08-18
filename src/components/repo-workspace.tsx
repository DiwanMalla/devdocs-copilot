import Link from "next/link";
import { Loader2Icon, SparklesIcon } from "lucide-react";
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
import type { SemanticSearchResult } from "@/lib/ai/search";
import { DEMO_REPO_INPUT, DEMO_WORKSPACE_PATH } from "@/lib/demo/config";
import type { RepoUIMessage } from "@/lib/chat/messages";
import type { ChatThread, Repo, RepoFile, RepoFileMeta } from "@/lib/supabase/types";

export function RepoWorkspace({
  repo,
  demo = false,
  chats,
  activeChatId,
  initialMessages,
  availableSnapshotIds,
  files,
  fileToShow,
  selectedFile,
  selectedPath,
  activePath,
  highlightedLines,
  githubFileUrl,
  requestedLines,
  requestedSnapshot,
  requestedSnapshotUnavailable,
  searchQuery,
  searchOutcome,
}: {
  repo: Repo;
  demo?: boolean;
  chats: ChatThread[];
  activeChatId: string | null;
  initialMessages: RepoUIMessage[];
  availableSnapshotIds: string[];
  files: RepoFileMeta[];
  fileToShow: RepoFile | null;
  selectedFile: RepoFile | null;
  selectedPath: string | null;
  activePath: string | null;
  highlightedLines: { start: number; end: number } | null;
  githubFileUrl: string | null;
  requestedLines: { start: number; end: number } | null;
  requestedSnapshot: string | null;
  requestedSnapshotUnavailable: boolean;
  searchQuery: string;
  searchOutcome: { results: SemanticSearchResult[]; error: string | null };
}) {
  const basePath = demo ? DEMO_WORKSPACE_PATH : null;
  const homeHref = demo ? "/login" : "/";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {repo.owner}/{repo.name}
            </h1>
            <RepoStatusBadge status={repo.status} />
            {demo ? (
              <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs font-medium">
                Live demo
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            {demo
              ? repo.status === "ready" && repo.chunk_count > 0
                ? "This public snapshot is already indexed. Ask a question — citations open the exact lines below."
                : "Indexing the sample snapshot now. This page refreshes automatically, then you can ask grounded questions."
              : (repo.description ?? "No description on GitHub.")}
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
              <Link href={homeHref}>{demo ? "Sign in" : "Repositories"}</Link>
            </Button>
          </div>
          {demo ? null : (
            <RepoLifecycleActions
              repoId={repo.id}
              owner={repo.owner}
              name={repo.name}
              showOpen={false}
              indexing={repo.status === "ingesting" || repo.status === "indexing"}
            />
          )}
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
            {demo
              ? "The sample repository is being indexed. This page refreshes automatically, then chat unlocks."
              : "Chat stays on the last ready snapshot if one exists. This page refreshes automatically."}
          </AlertDescription>
        </Alert>
      ) : null}

      <RepoStatusRefresh
        active={repo.status === "ingesting" || repo.status === "indexing"}
      />

      <div className="bg-card grid h-[min(40rem,calc(100dvh-9rem))] overflow-hidden rounded-xl ring-1 ring-foreground/10 max-lg:grid-rows-[10rem_minmax(0,1fr)] lg:h-128 lg:grid-cols-[220px_1fr]">
        <div className="min-h-0 overflow-hidden border-b lg:border-r lg:border-b-0">
          {demo ? (
            <aside className="flex h-full min-h-0 flex-col p-4">
              <div className="bg-muted text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-xl">
                <SparklesIcon className="size-4" />
              </div>
              <h2 className="text-sm font-medium">Public sample</h2>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {DEMO_REPO_INPUT} is preloaded for recruiters and visitors. Sign in
                to index your own repositories.
              </p>
            </aside>
          ) : (
            <ChatSidebar
              repoId={repo.id}
              owner={repo.owner}
              name={repo.name}
              chats={chats}
              activeChatId={activeChatId}
              path={selectedPath}
              query={searchQuery || null}
              snapshotId={requestedSnapshot}
            />
          )}
        </div>
        <div className="min-h-0 overflow-hidden">
          <RepoChat
            key={activeChatId ?? (demo ? "demo" : "no-chat")}
            owner={repo.owner}
            name={repo.name}
            repoId={repo.id}
            chatId={activeChatId}
            availableSnapshotIds={availableSnapshotIds}
            initialMessages={initialMessages}
            disabled={!repo.active_snapshot_id || repo.chunk_count === 0}
            path={selectedPath}
            query={searchQuery || null}
            demo={demo}
            basePath={basePath}
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
        chatId={activeChatId}
        path={selectedPath}
        basePath={basePath}
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
              chatId={activeChatId}
              query={searchQuery || null}
              snapshotId={requestedSnapshot}
              basePath={basePath}
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
