import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SemanticSearchResult } from "@/lib/ai/search";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";

export function SemanticSearch({
  owner,
  name,
  query,
  results,
  error,
  disabled,
  chatId,
  path,
}: {
  owner: string;
  name: string;
  query: string;
  results: SemanticSearchResult[];
  error: string | null;
  disabled: boolean;
  chatId?: string | null;
  path?: string | null;
}) {
  return (
    <section className="space-y-3">
      <form method="get" className="flex gap-2">
        {chatId ? <input type="hidden" name="chat" value={chatId} /> : null}
        {path ? <input type="hidden" name="path" value={path} /> : null}
        <Input
          name="q"
          defaultValue={query}
          maxLength={2_000}
          placeholder="Search by meaning, e.g. where is authentication handled?"
          aria-label="Semantic code search"
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled}>
          <SearchIcon />
          Search
        </Button>
      </form>

      {disabled ? (
        <p className="text-muted-foreground text-xs">
          Semantic search becomes available when indexing is ready.
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {query && !error ? (
        results.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {results.map((result) => (
              <Link
                key={result.chunk_id}
                href={buildRepoWorkspaceHref({
                  owner,
                  name,
                  path: result.path,
                  lines: {
                    start: result.start_line,
                    end: result.end_line,
                  },
                  chatId,
                  query,
                })}
                className="bg-card hover:bg-muted/60 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-xs">{result.path}</p>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {(result.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Lines {result.start_line}–{result.end_line}
                </p>
                <p className="mt-2 line-clamp-2 font-mono text-xs leading-5">
                  {result.content}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={SearchIcon}
            title="No close matches"
            description="Try a more specific question, or open a file from the tree and ask in chat."
            className="bg-card rounded-xl py-8 ring-1 ring-foreground/10"
          />
        )
      ) : null}
    </section>
  );
}
