import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SemanticSearchResult } from "@/lib/ai/search";

export function SemanticSearch({
  owner,
  name,
  query,
  results,
  error,
  disabled,
}: {
  owner: string;
  name: string;
  query: string;
  results: SemanticSearchResult[];
  error: string | null;
  disabled: boolean;
}) {
  return (
    <section className="space-y-3">
      <form method="get" className="flex gap-2">
        <Input
          name="q"
          defaultValue={query}
          maxLength={500}
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
          Semantic search becomes available when repository indexing is ready.
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {query && !error ? (
        <div className="grid gap-2 md:grid-cols-2">
          {results.length > 0 ? (
            results.map((result) => (
              <Link
                key={result.chunk_id}
                href={
                  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
                  `?path=${encodeURIComponent(result.path)}` +
                  `&lines=${result.start_line}-${result.end_line}` +
                  `#L${result.start_line}`
                }
                className="bg-card hover:bg-muted/60 rounded-lg p-3 ring-1 ring-foreground/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-xs">{result.path}</p>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {(result.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Lines {result.start_line}–{result.end_line}
                </p>
                <p className="mt-2 line-clamp-2 font-mono text-xs leading-5">
                  {result.content}
                </p>
              </Link>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No sufficiently similar chunks found.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
