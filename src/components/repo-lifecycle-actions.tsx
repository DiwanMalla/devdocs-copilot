"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import {
  deleteRepository,
  reindexRepository,
  type RepoActionState,
} from "@/app/actions/repositories";
import { Button } from "@/components/ui/button";

export function RepoLifecycleActions({
  repoId,
  owner,
  name,
  showOpen = true,
  indexing = false,
}: {
  repoId: string;
  owner: string;
  name: string;
  showOpen?: boolean;
  indexing?: boolean;
}) {
  const router = useRouter();
  const [state, reindexAction, pending] = useActionState<
    RepoActionState,
    FormData
  >(reindexRepository, null);

  useEffect(() => {
    if (state?.notice) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {showOpen ? (
          <Button asChild size="sm">
            <a href={`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}>
              Open
            </a>
          </Button>
        ) : null}
        <form action={reindexAction}>
          <input type="hidden" name="repoId" value={repoId} />
          <Button type="submit" size="sm" variant="outline" disabled={pending || indexing}>
            {pending || indexing ? <Loader2Icon className="animate-spin" /> : null}
            {pending ? "Checking…" : indexing ? "Indexing…" : "Re-index"}
          </Button>
        </form>
        <form
          action={deleteRepository}
          onSubmit={(event) => {
            if (
              !window.confirm(
                `Delete ${owner}/${name}? Files, chunks, and chats will be removed.`,
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="repoId" value={repoId} />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={pending}
          >
            Delete
          </Button>
        </form>
      </div>
      {state?.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {state.notice}
        </p>
      ) : null}
    </div>
  );
}
