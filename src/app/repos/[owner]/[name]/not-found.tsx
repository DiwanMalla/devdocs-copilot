import Link from "next/link";

export default function RepoNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Repository not ingested</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This owner/name is not in the database yet. Ingest it from the home page.
      </p>
      <Link href="/" className="mt-6 text-sm underline underline-offset-4">
        Back to ingest
      </Link>
    </main>
  );
}
