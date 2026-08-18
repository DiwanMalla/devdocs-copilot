"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RepoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Repository workspace failed", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        This workspace could not be loaded
      </h1>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Refresh the page or return to your repositories and try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Repositories</Link>
        </Button>
      </div>
    </main>
  );
}
