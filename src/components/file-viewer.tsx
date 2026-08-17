import { ScrollArea } from "@/components/ui/scroll-area";
import type { RepoFile } from "@/lib/supabase/types";

export function FileViewer({
  file,
  emptyMessage,
}: {
  file: RepoFile | null;
  emptyMessage: string;
}) {
  if (!file) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <p className="truncate font-mono text-xs">{file.path}</p>
        <p className="text-muted-foreground shrink-0 text-xs">
          {file.language ?? "Text"} · {file.size_bytes.toLocaleString()} bytes
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <pre className="p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap">
          {file.content}
        </pre>
      </ScrollArea>
    </div>
  );
}
