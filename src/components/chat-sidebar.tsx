"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquareIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createChat, deleteChat, renameChat } from "@/app/actions/chats";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";
import { cn } from "@/lib/utils";
import type { ChatThread } from "@/lib/supabase/types";

export function ChatSidebar({
  repoId,
  owner,
  name,
  chats,
  activeChatId,
  path,
  query,
  snapshotId,
}: {
  repoId: string;
  owner: string;
  name: string;
  chats: ChatThread[];
  activeChatId: string | null;
  path?: string | null;
  query?: string | null;
  snapshotId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
        <h2 className="text-sm font-medium">Chats</h2>
        <form action={createChat}>
          <input type="hidden" name="repoId" value={repoId} />
          {path ? <input type="hidden" name="path" value={path} /> : null}
          {query ? <input type="hidden" name="q" value={query} /> : null}
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <PlusIcon />
            New
          </Button>
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <EmptyState
            icon={MessageSquareIcon}
            title="No threads yet"
            description="Ask a question to keep this conversation with the repository."
            className="px-2 py-8"
          />
        ) : (
          <ul className="space-y-1">
            {chats.map((chat) => {
              const active = chat.id === activeChatId;
              return (
                <li key={chat.id} className="flex items-center gap-1">
                  {renamingId === chat.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1"
                      action={(formData) => {
                        startTransition(async () => {
                          await renameChat(formData);
                          setRenamingId(null);
                          router.refresh();
                        });
                      }}
                    >
                      <input type="hidden" name="chatId" value={chat.id} />
                      <Input
                        name="title"
                        defaultValue={chat.title}
                        aria-label="Chat title"
                        className="h-8 text-sm"
                        maxLength={80}
                        autoFocus
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Link
                        href={buildRepoWorkspaceHref({
                          owner,
                          name,
                          path,
                          query,
                          snapshotId,
                          chatId: chat.id,
                        })}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm",
                          active ? "bg-muted font-medium" : "hover:bg-muted/60",
                        )}
                      >
                        {chat.title}
                      </Link>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Rename ${chat.title}`}
                        onClick={() => setRenamingId(chat.id)}
                      >
                        <PencilIcon />
                      </Button>
                      <form
                        action={deleteChat}
                        onSubmit={(event) => {
                          if (
                            !window.confirm(`Delete chat “${chat.title}”?`)
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="chatId" value={chat.id} />
                        <Button
                          type="submit"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Delete ${chat.title}`}
                        >
                          <Trash2Icon />
                        </Button>
                      </form>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
