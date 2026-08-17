import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-medium tracking-tight">
          DevDocs Copilot
        </Link>
        <p className="text-muted-foreground hidden text-sm sm:block">
          Phase 4 · navigable source citations
        </p>
      </div>
    </header>
  );
}
