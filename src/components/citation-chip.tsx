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
  path,
  startLine,
  endLine,
  unavailable,
  className,
}: {
  href?: string;
  path: string;
  startLine: number;
  endLine: number;
  unavailable?: boolean;
  className?: string;
}) {
  const fileName = path.split("/").pop() ?? path;
  const range = `${startLine}–${endLine}`;
  const label = `${fileName}:${range}`;

  const chipClass = cn(
    "inline-flex items-baseline rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-5",
    unavailable
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-foreground ring-1 ring-primary/20 hover:bg-primary/15 hover:ring-primary/40",
    className,
  );

  const preview = (
    <div className="space-y-1 text-left">
      <p className="font-mono text-[11px] break-all">{path}</p>
      <p>Lines {range}</p>
      <p className="opacity-70">
        {unavailable
          ? "This snapshot is no longer available."
          : "Open the cited lines in the explorer"}
      </p>
    </div>
  );

  const trigger = unavailable || !href ? (
    <span
      className={chipClass}
      role="note"
      aria-label={`${path}, lines ${range}; cited snapshot unavailable`}
    >
      {label}
    </span>
  ) : (
    <Link
      href={href}
      className={cn(chipClass, "no-underline")}
      aria-label={`Open ${path}, lines ${range}`}
    >
      {label}
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs flex-col items-start">
        {preview}
      </TooltipContent>
    </Tooltip>
  );
}
