import { IngestForm } from "@/components/ingest-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export const maxDuration = 300;

export default function HomePage() {
  const configured = hasSupabaseConfig();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <div className="mb-8 space-y-3 text-center">
        <p className="text-muted-foreground text-sm">Public GitHub → searchable source</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Turn a repository into a code library
        </h1>
        <p className="text-muted-foreground text-sm leading-6">
          Paste a public GitHub URL. DevDocs Copilot fetches the default branch,
          stores ingestible source files, and indexes them for semantic search.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingest a repository</CardTitle>
          <CardDescription>
            Accepts https://github.com/owner/repo or owner/repo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configured ? (
            <IngestForm />
          ) : (
            <p className="text-muted-foreground text-sm leading-6">
              Add <code className="font-mono text-foreground">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code className="font-mono text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
              <code className="font-mono text-foreground">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
              <code className="font-mono text-foreground">.env.local</code>, then restart the
              dev server.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
