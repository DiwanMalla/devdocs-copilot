"use client";

import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CitationChip({
  href,
  fallbackHref,
  path,
  startLine,
  endLine,
  unavailable,
  className,
}: {
  href?: string;
  fallbackHref?: string;
  path: string;
  startLine: number;
  endLine: number;
  unavailable?: boolean;
  className?: string;
}) {
  const fileName = path.split("/").pop() ?? path;
  const range = `${startLine}–${endLine}`;
  const label = `${fileName}:${range}`;
  const citationFailed = unavailable || !href;

  const chipClass = cn(
    "inline-flex items-baseline rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-5",
    citationFailed
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-foreground ring-1 ring-primary/20 hover:bg-primary/15 hover:ring-primary/40",
    className,
  );

  const preview = (
    <div className="space-y-1 text-left">
      <p className="font-mono text-[11px] break-all">{path}</p>
      <p>Lines {range}</p>
      <p className="opacity-70">
        {citationFailed
          ? fallbackHref
            ? "Cited lines could not be mapped. Open the file instead."
            : "This snapshot is no longer available."
          : "Open the cited lines in the explorer"}
      </p>
    </div>
  );

  const trigger = href ? (
    <Link
      href={href}
      className={cn(chipClass, "no-underline")}
      aria-label={`Open ${path}, lines ${range}`}
    >
      {label}
    </Link>
  ) : (
    <span
      className={chipClass}
      role="note"
      aria-label={`${path}, lines ${range}; cited snapshot unavailable`}
    >
      {label}
    </span>
  );

  return (
    <span className="inline-flex items-baseline gap-1">
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-xs flex-col items-start"
        >
          {preview}
        </TooltipContent>
      </Tooltip>
      {citationFailed && fallbackHref ? (
        <Link
          href={fallbackHref}
          className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
          aria-label={`View file ${path}`}
          target={fallbackHref.startsWith("http") ? "_blank" : undefined}
          rel={fallbackHref.startsWith("http") ? "noreferrer" : undefined}
        >
          View file
        </Link>
      ) : null}
    </span>
  );
}
