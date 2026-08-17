import { IngestForm } from "@/components/ingest-form";
import { RepoLifecycleActions } from "@/components/repo-lifecycle-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { listOwnedRepos } from "@/lib/supabase/queries";
import type { RepoStatus } from "@/lib/supabase/types";

export const maxDuration = 300;

function statusVariant(status: RepoStatus) {
  if (status === "ready") return "default" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function formatIndexedAt(value: string | null) {
  if (!value) {
    return "Not indexed yet";
  }
  return `Indexed ${new Date(value).toLocaleString()}`;
}

export default async function HomePage() {
  await requireUser();
  const configured = hasSupabaseConfig();
  const repos = configured ? await listOwnedRepos() : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">Authenticated workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Repositories</h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-6">
          Add a public GitHub repository to ingest, search, and chat with its
          source. Re-index only when the default-branch commit has changed.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add repository</CardTitle>
            <CardDescription>
              Accepts https://github.com/owner/repo or owner/repo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configured ? (
              <IngestForm />
            ) : (
              <p className="text-muted-foreground text-sm leading-6">
                Add{" "}
                <code className="text-foreground font-mono">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>
                ,{" "}
                <code className="text-foreground font-mono">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>
                , and{" "}
                <code className="text-foreground font-mono">
                  SUPABASE_SERVICE_ROLE_KEY
                </code>{" "}
                to <code className="text-foreground font-mono">.env.local</code>
                , then restart the dev server.
              </p>
            )}
          </CardContent>
        </Card>

        <section className="space-y-3">
          {repos.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-sm">
                No repositories yet. Add a public GitHub URL to create your first
                workspace.
              </CardContent>
            </Card>
          ) : (
            repos.map((repo) => (
              <Card key={repo.id}>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>
                        {repo.owner}/{repo.name}
                      </CardTitle>
                      <CardDescription>
                        {repo.description ?? "No description."}
                      </CardDescription>
                    </div>
                    <Badge variant={statusVariant(repo.status)}>
                      {repo.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground font-mono text-xs">
                    {repo.file_count} files · {repo.chunk_count} chunks ·{" "}
                    {repo.default_branch}
                    {repo.commit_sha ? ` @ ${repo.commit_sha.slice(0, 7)}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatIndexedAt(repo.last_indexed_at)}
                  </p>
                  {repo.status === "failed" && repo.error ? (
                    <p className="text-destructive text-sm">{repo.error}</p>
                  ) : null}
                  <RepoLifecycleActions
                    repoId={repo.id}
                    owner={repo.owner}
                    name={repo.name}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
