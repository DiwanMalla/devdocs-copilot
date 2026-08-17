"use client";

import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { ingestRepo, type IngestState } from "@/app/actions/repositories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function IngestForm() {
  const [state, formAction, pending] = useActionState<IngestState, FormData>(
    ingestRepo,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="repo">Public GitHub repository</Label>
        <Input
          id="repo"
          name="repo"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/vercel/next.js"
          disabled={pending}
        />
      </div>
      {state?.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending} size="lg">
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" />
            Ingesting and indexing…
          </>
        ) : (
          "Add repository"
        )}
      </Button>
      <p className="text-muted-foreground text-xs leading-5">
        Public repos only. Skips binaries, vendor folders, and files over 200KB.
        Caps at 250 source files, then creates semantic-search embeddings.
      </p>
    </form>
  );
}
