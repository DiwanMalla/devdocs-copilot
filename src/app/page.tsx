import Link from "next/link";
import { MessageSquareIcon, SearchIcon } from "lucide-react";
import { IngestForm } from "@/components/ingest-form";
import { RepoLifecycleActions } from "@/components/repo-lifecycle-actions";
import { RepoStatusBadge } from "@/components/repo-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { listOwnedRepos } from "@/lib/supabase/queries";

export const maxDuration = 300;

function formatIndexedAt(value: string | null) {
  if (!value) {
    return "Waiting for first index";
  }
  return `Indexed ${new Date(value).toLocaleString()}`;
}

export default async function HomePage() {
  await requireUser();
  const configured = hasSupabaseConfig();
  const repos = configured ? await listOwnedRepos() : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Your repository workspace
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-6">
          Paste a public GitHub URL, wait for indexing, then chat with the
          snapshot. Answers stay grounded in the files you ingested.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          {
            step: "1",
            title: "Paste a GitHub repo",
            body: "Use owner/name or a full github.com URL.",
          },
          {
            step: "2",
            title: "Index the snapshot",
            body: "We chunk the source and store embeddings for search.",
          },
          {
            step: "3",
            title: "Ask grounded questions",
            body: "Citations open the exact lines in the explorer.",
          },
        ].map((item) => (
          <li
            key={item.step}
            className="bg-card flex gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
          >
            <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-medium">
              {item.step}
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-muted-foreground text-xs leading-5">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {!configured ? (
        <Alert>
          <AlertTitle>Workspace is not configured yet</AlertTitle>
          <AlertDescription>
            Add the Supabase and OpenRouter keys from{" "}
            <code className="font-mono">.env.example</code> to{" "}
            <code className="font-mono">.env.local</code>, then restart the
            app.
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={
          repos.length === 0
            ? "mx-auto w-full max-w-xl"
            : "grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]"
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Add a repository</CardTitle>
            <CardDescription>
              Indexing starts as soon as you paste a public GitHub repo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configured ? (
              <IngestForm />
            ) : (
              <p className="text-muted-foreground text-sm leading-6">
                Configuration is required before repositories can be ingested.
              </p>
            )}
          </CardContent>
        </Card>

        {repos.length === 0 ? null : (
          <section className="grid gap-4 sm:grid-cols-2">
            {repos.map((repo) => (
              <Card key={repo.id} className="h-full">
                <CardHeader className="border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate">
                        <Link
                          href={`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`}
                          className="hover:underline underline-offset-4"
                        >
                          {repo.owner}/{repo.name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {repo.description ?? "No description on GitHub."}
                      </CardDescription>
                    </div>
                    <RepoStatusBadge status={repo.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                    <span className="bg-muted rounded-md px-2 py-1 font-mono">
                      {repo.file_count} files
                    </span>
                    <span className="bg-muted rounded-md px-2 py-1 font-mono">
                      {repo.chunk_count} chunks
                    </span>
                    <span className="bg-muted rounded-md px-2 py-1 font-mono">
                      {repo.default_branch}
                      {repo.commit_sha ? ` @ ${repo.commit_sha.slice(0, 7)}` : ""}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatIndexedAt(repo.last_indexed_at)}
                  </p>
                  {repo.status === "failed" && repo.error ? (
                    <p className="text-destructive text-sm">{repo.error}</p>
                  ) : null}
                </CardContent>
                <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground hidden items-center gap-1 text-xs sm:flex">
                    {repo.status === "ready" ? (
                      <>
                        <MessageSquareIcon className="size-3.5" />
                        Ready to chat
                      </>
                    ) : repo.status === "failed" ? (
                      "Fix and re-index"
                    ) : (
                      <>
                        <SearchIcon className="size-3.5" />
                        Indexing in background
                      </>
                    )}
                  </p>
                  <RepoLifecycleActions
                    repoId={repo.id}
                    owner={repo.owner}
                    name={repo.name}
                  />
                </CardFooter>
              </Card>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
