import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Repo, RepoFile, RepoFileMeta } from "@/lib/supabase/types";

export async function getRepoByOwnerName(
  owner: string,
  name: string,
): Promise<Repo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repos")
    .select("*")
    .eq("owner", owner)
    .eq("name", name)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Repo | null) ?? null;
}

export async function listRepoFileMeta(repoId: string): Promise<RepoFileMeta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("files")
    .select("id, repo_id, path, language, size_bytes, sha")
    .eq("repo_id", repoId)
    .order("path", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RepoFileMeta[];
}

export async function getRepoFileByPath(
  repoId: string,
  path: string,
): Promise<RepoFile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("files")
    .select("*")
    .eq("repo_id", repoId)
    .eq("path", path)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RepoFile | null) ?? null;
}
