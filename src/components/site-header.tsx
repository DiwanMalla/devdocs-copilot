import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const user = await getAuthenticatedUser();

  return (
    <header className="border-b border-border/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href={user ? "/" : "/login"} className="font-medium tracking-tight">
          DevDocs Copilot
        </Link>
        {user ? (
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground hidden max-w-56 truncate text-sm sm:block">
              {user.email ?? "Signed in"}
            </p>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-muted-foreground hidden text-sm sm:block">
            Phase 5 · persistent workspace
          </p>
        )}
      </div>
    </header>
  );
}
