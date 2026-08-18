import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RepoStatus } from "@/lib/supabase/types";

const STATUS_COPY: Record<
  RepoStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ready: { label: "Ready", variant: "default" },
  indexing: { label: "Indexing", variant: "secondary" },
  ingesting: { label: "Ingesting", variant: "secondary" },
  pending: { label: "Queued", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export function repoStatusLabel(status: RepoStatus): string {
  return STATUS_COPY[status].label;
}

export function RepoStatusBadge({
  status,
  className,
}: {
  status: RepoStatus;
  className?: string;
}) {
  const copy = STATUS_COPY[status];
  const busy = status === "indexing" || status === "ingesting";

  return (
    <Badge variant={copy.variant} className={cn("gap-1.5 capitalize", className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "ready" && "bg-primary-foreground/80",
          status === "failed" && "bg-destructive",
          busy && "bg-foreground/50 animate-pulse",
          status === "pending" && "bg-muted-foreground",
        )}
        aria-hidden="true"
      />
      {copy.label}
    </Badge>
  );
}
