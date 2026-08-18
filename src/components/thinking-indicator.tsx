import { Loader2Icon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ThinkingIndicator({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex max-w-[90%] flex-col gap-3", className)}
      role="status"
      aria-live="polite"
    >
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </div>
      <div className="bg-muted/70 space-y-2 rounded-2xl rounded-bl-md px-4 py-3">
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
