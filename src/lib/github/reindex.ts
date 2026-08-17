import type { RepoStatus } from "@/lib/supabase/types";

export function shouldSkipReindex(
  repo: { status: RepoStatus; commit_sha: string | null },
  nextCommitSha: string,
): boolean {
  return repo.status === "ready" && repo.commit_sha === nextCommitSha;
}
