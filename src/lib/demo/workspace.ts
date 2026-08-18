import "server-only";

import { enqueueGitHubRepoIngest, kickIngestWorker } from "@/lib/github/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import {
  DEMO_OWNER_USER_ID,
  type Repo,
  type RepoFile,
  type RepoFileMeta,
  type RepoSnapshot,
} from "@/lib/supabase/types";
import {
  DEMO_REPO_NAME,
  DEMO_REPO_OWNER,
  isReadyDemoSnapshot,
} from "./config";

export async function getDemoRepo(): Promise<Repo | null> {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("repos")
    .select("*")
    .eq("user_id", DEMO_OWNER_USER_ID)
    .ilike("owner", DEMO_REPO_OWNER)
    .ilike("name", DEMO_REPO_NAME)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Repo | null) ?? null;
}

export async function ensureDemoRepo(): Promise<Repo> {
  const existing = await getDemoRepo();
  if (existing && isReadyDemoSnapshot(existing)) {
    return existing;
  }

  if (
    existing &&
    (existing.status === "ingesting" || existing.status === "indexing")
  ) {
    kickIngestWorker();
    return existing;
  }

  if (process.env.NEXT_PHASE === "phase-production-build") {
    if (existing) {
      return existing;
    }
    throw new Error("Demo snapshot is not available during production build.");
  }

  try {
    const queued = await enqueueGitHubRepoIngest(
      DEMO_OWNER_USER_ID,
      DEMO_REPO_OWNER,
      DEMO_REPO_NAME,
    );
    kickIngestWorker();
    return queued.repo;
  } catch (error) {
    const raced = await getDemoRepo();
    if (raced) {
      if (
        raced.status === "ingesting" ||
        raced.status === "indexing" ||
        isReadyDemoSnapshot(raced)
      ) {
        kickIngestWorker();
        return raced;
      }
    }
    throw error;
  }
}

export async function listDemoFileMeta(
  repoId: string,
  snapshotId: string | null,
): Promise<RepoFileMeta[]> {
  if (!snapshotId) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("files")
    .select("id, repo_id, snapshot_id, path, language, size_bytes, sha")
    .eq("repo_id", repoId)
    .eq("snapshot_id", snapshotId)
    .order("path", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RepoFileMeta[];
}

export async function getDemoFileByPath(
  repoId: string,
  path: string,
  snapshotId: string | null,
): Promise<RepoFile | null> {
  if (!snapshotId) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("files")
    .select("*")
    .eq("repo_id", repoId)
    .eq("snapshot_id", snapshotId)
    .eq("path", path)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RepoFile | null) ?? null;
}

export async function getDemoSnapshot(
  repoId: string,
  snapshotId: string,
): Promise<RepoSnapshot | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("repo_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .eq("repo_id", repoId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RepoSnapshot | null) ?? null;
}

export async function listDemoSnapshotIds(
  repoId: string,
  snapshotIds: string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(snapshotIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("repo_snapshots")
    .select("id")
    .eq("repo_id", repoId)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => String(row.id));
}
