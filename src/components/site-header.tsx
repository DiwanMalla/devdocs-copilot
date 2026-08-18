import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const user = await getAuthenticatedUser();

  return (
    <header className="border-border/80 bg-background/80 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href={user ? "/" : "/login"}
          className="flex min-w-0 items-center gap-2.5"
        >
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg font-mono text-xs font-semibold">
            DC
          </span>
          <span className="truncate font-medium tracking-tight">
            DevDocs Copilot
          </span>
        </Link>
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Repositories</Link>
            </Button>
            <p className="text-muted-foreground hidden max-w-48 truncate text-sm sm:block">
              {user.email ?? "Signed in"}
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-muted-foreground hidden text-sm sm:block">
            Paste a repo. Index it. Ask grounded questions.
          </p>
        )}
      </div>
    </header>
  );
}
