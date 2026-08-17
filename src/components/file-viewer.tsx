import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { ScrollToLine } from "@/components/scroll-to-line";
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
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
        {emptyMessage}
      </div>
    );
  }

  const lines = file.content.split("\n");

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
            <Link
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Open selected lines on GitHub"
              title="Open on GitHub"
            >
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-4 font-mono text-[13px] leading-6">
        <code className="block min-w-max">
          {lines.map((line, index) => {
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
                  "grid scroll-mt-4 grid-cols-[4rem_1fr] px-4",
                  isHighlighted && "bg-amber-500/15",
                )}
              >
                {highlightedLines?.start === lineNumber ? (
                  <ScrollToLine line={lineNumber} />
                ) : null}
                <span
                  className={cn(
                    "text-muted-foreground sticky left-0 pr-4 text-right select-none",
                    isHighlighted && "text-amber-500",
                  )}
                  aria-hidden="true"
                >
                  {lineNumber}
                </span>
                <span className="whitespace-pre">{line || " "}</span>
              </span>
            );
          })}
        </code>
      </div>
    </div>
  );
}
