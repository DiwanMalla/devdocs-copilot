import Link from "next/link";
import { FolderGit2Icon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function RepoNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        icon={FolderGit2Icon}
        title="Repository not in your workspace"
        description="This owner/name is not ingested yet. Add it from the home page to index and chat."
      >
        <Button asChild>
          <Link href="/">Add a repository</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
