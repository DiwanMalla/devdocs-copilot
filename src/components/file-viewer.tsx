import Link from "next/link";
import { Code2Icon, ExternalLinkIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ScrollToLine } from "@/components/scroll-to-line";
import { Button } from "@/components/ui/button";
import { tokenClassName, tokenizeFile } from "@/lib/code/syntax";
import type { RepoFile } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export type LineRange = {
  start: number;
  end: number;
};

export function FileViewer({
  file,
  emptyMessage,
  highlightedLines,
  githubUrl,
  lineRangeWarning,
}: {
  file: RepoFile | null;
  emptyMessage: string;
  highlightedLines: LineRange | null;
  githubUrl: string | null;
  lineRangeWarning?: string | null;
}) {
  if (!file) {
    return (
      <EmptyState
        icon={Code2Icon}
        title="Select a file"
        description={emptyMessage}
        className="h-full"
      />
    );
  }

  const highlighted = tokenizeFile(file.content, file.language);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <p className="truncate font-mono text-xs">{file.path}</p>
        <div className="flex shrink-0 items-center gap-3">
          {highlightedLines ? (
            <p className="text-xs font-medium">
              Lines {highlightedLines.start}–{highlightedLines.end}
            </p>
          ) : null}
          {lineRangeWarning ? (
            <p className="text-destructive text-xs" role="status">
              {lineRangeWarning}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {file.language ?? "Text"} · {file.size_bytes.toLocaleString()} bytes
          </p>
          {githubUrl ? (
            <Button asChild size="icon-xs" variant="ghost">
              <Link
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open selected lines on GitHub"
                title="Open on GitHub"
              >
                <ExternalLinkIcon />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-smooth py-3 font-mono text-[13px] leading-6">
        <code className="block min-w-max">
          {highlighted.map((tokens, index) => {
            const lineNumber = index + 1;
            const isHighlighted =
              highlightedLines !== null &&
              lineNumber >= highlightedLines.start &&
              lineNumber <= highlightedLines.end;

            return (
              <span
                id={`L${lineNumber}`}
                key={lineNumber}
                className={cn(
                  "grid scroll-mt-8 grid-cols-[4rem_1fr] [contain-intrinsic-size:0_24px] [content-visibility:auto]",
                  isHighlighted
                    ? "border-primary bg-primary/10 border-l-2"
                    : "border-l-2 border-transparent",
                )}
              >
                {highlightedLines?.start === lineNumber ? (
                  <ScrollToLine line={lineNumber} />
                ) : null}
                <span
                  className={cn(
                    "text-muted-foreground sticky left-0 bg-card/90 pr-4 text-right select-none backdrop-blur-[1px]",
                    isHighlighted && "text-primary",
                  )}
                  aria-hidden="true"
                >
                  {lineNumber}
                </span>
                <span className="pr-4 whitespace-pre">
                  {tokens.map((token, tokenIndex) => (
                    <span
                      key={`${lineNumber}-${tokenIndex}`}
                      className={tokenClassName(token.type)}
                    >
                      {token.value}
                    </span>
                  ))}
                </span>
              </span>
            );
          })}
        </code>
      </div>
    </div>
  );
}
