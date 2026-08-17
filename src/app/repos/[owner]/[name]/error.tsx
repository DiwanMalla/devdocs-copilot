"use client";

import { useEffect } from "react";
import Link from "next/link";

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
      <p className="text-muted-foreground mt-2 text-sm">
        Refresh the page or return to your repositories and try again.
      </p>
      <div className="mt-6 flex items-center justify-center gap-4 text-sm">
        <button type="button" className="underline underline-offset-4" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="underline underline-offset-4">
          My repositories
        </Link>
      </div>
    </main>
  );
}
