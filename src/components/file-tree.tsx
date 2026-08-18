import Link from "next/link";
import { FileIcon, FolderIcon, FolderTreeIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";
import { cn } from "@/lib/utils";
import type { RepoFileMeta } from "@/lib/supabase/types";

type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  language: string | null;
  children: TreeNode[];
};

function buildFileTree(files: RepoFileMeta[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = root;
    let acc = "";

    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i];
      if (!name) {
        continue;
      }

      acc = acc ? `${acc}/${name}` : name;
      const isFile = i === parts.length - 1;
      let node = level.find((entry) => entry.name === name);

      if (!node) {
        node = {
          name,
          path: acc,
          type: isFile ? "file" : "dir",
          language: isFile ? file.language : null,
          children: [],
        };
        level.push(node);
      }

      if (!isFile) {
        level = node.children;
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "dir" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(root);
  return root;
}

function TreeItems({
  nodes,
  owner,
  name,
  selectedPath,
  chatId,
  query,
  snapshotId,
  depth,
}: {
  nodes: TreeNode[];
  owner: string;
  name: string;
  selectedPath: string | null;
  chatId: string | null;
  query: string | null;
  snapshotId: string | null;
  depth: number;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const href = buildRepoWorkspaceHref({
          owner,
          name,
          path: node.path,
          chatId,
          query,
          snapshotId,
        });
        const isSelected = node.type === "file" && node.path === selectedPath;

        return (
          <li key={node.path}>
            {node.type === "dir" ? (
              <div>
                <div
                  className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                  style={{ paddingLeft: `${depth * 12 + 8}px` }}
                >
                  <FolderIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{node.name}</span>
                </div>
                <TreeItems
                  nodes={node.children}
                  owner={owner}
                  name={name}
                  selectedPath={selectedPath}
                  chatId={chatId}
                  query={query}
                  snapshotId={snapshotId}
                  depth={depth + 1}
                />
              </div>
            ) : (
              <Link
                href={href}
                aria-current={isSelected ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                  isSelected
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <FileIcon className="size-3.5 shrink-0" />
                <span className="truncate">{node.name}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FileTree({
  files,
  owner,
  name,
  selectedPath,
  chatId,
  query,
  snapshotId,
}: {
  files: RepoFileMeta[];
  owner: string;
  name: string;
  selectedPath: string | null;
  chatId?: string | null;
  query?: string | null;
  snapshotId?: string | null;
}) {
  const tree = buildFileTree(files);

  if (files.length === 0) {
    return (
      <EmptyState
        icon={FolderTreeIcon}
        title="No files yet"
        description="Files appear here after the snapshot finishes ingesting."
        className="px-3 py-10"
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      <nav aria-label="Repository files" className="p-2">
        <TreeItems
          nodes={tree}
          owner={owner}
          name={name}
          selectedPath={selectedPath}
          chatId={chatId ?? null}
          query={query ?? null}
          snapshotId={snapshotId ?? null}
          depth={0}
        />
      </nav>
    </ScrollArea>
  );
}
