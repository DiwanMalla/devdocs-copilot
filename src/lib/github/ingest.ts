import { createAdminClient } from "@/lib/supabase/admin";
import type { Repo } from "@/lib/supabase/types";
import { indexRepoFiles } from "@/lib/ai/index-repo";
import { INGEST_LOCK_MS, SNAPSHOT_RETENTION } from "@/lib/chat/limits";
import { shouldSkipReindex } from "./reindex";
import {
  decodeGitBlobContent,
  fetchDefaultCommitSha,
  fetchGitBlob,
  fetchGitHubRepo,
  fetchGitTree,
} from "./client";
import {
  isLikelyBinaryContent,
  MAX_FILE_BYTES,
  shouldSkipPath,
} from "./filters";
import { languageFromPath } from "./languages";
import { assertIndexableTree } from "./tree";

const BLOB_CONCURRENCY = 8;
const INSERT_BATCH_SIZE = 40;

export type IngestedFile = {
  path: string;
  language: string | null;
  size_bytes: number;
  sha: string;
  content: string;
};

export type EnqueueIngestResult = {
  repo: Repo;
  unchanged: boolean;
  jobId: string | null;
};

async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await mapper(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function collectIngestibleFiles(
  owner: string,
  name: string,
  commitSha: string,
): Promise<IngestedFile[]> {
  const tree = await fetchGitTree(owner, name, commitSha);
  const candidates = tree.entries
    .filter((entry) => entry.type === "blob")
    .filter((entry) => !shouldSkipPath(entry.path))
    .filter((entry) => (entry.size ?? 0) > 0 && (entry.size ?? 0) <= MAX_FILE_BYTES);

  assertIndexableTree({
    truncated: tree.truncated,
    candidateCount: candidates.length,
  });

  const fetched = await mapPool(
    candidates.sort((a, b) => a.path.localeCompare(b.path)),
    BLOB_CONCURRENCY,
    async (entry) => {
      const blob = await fetchGitBlob(owner, name, entry.sha);
      if (!blob) {
        return null;
      }

      const content = decodeGitBlobContent(blob.content, blob.encoding);
      if (!content || isLikelyBinaryContent(content)) {
        return null;
      }

      return {
        path: entry.path,
        language: languageFromPath(entry.path),
        size_bytes: entry.size ?? Buffer.byteLength(content, "utf8"),
        sha: entry.sha,
        content,
      } satisfies IngestedFile;
    },
  );

  return fetched.filter((file): file is IngestedFile => file !== null);
}

function lockHeld(repo: Repo | null): boolean {
  if (!repo?.ingest_lock_until) {
    return false;
  }
  return Date.parse(repo.ingest_lock_until) > Date.now();
}

export async function enqueueGitHubRepoIngest(
  userId: string,
  owner: string,
  name: string,
  options?: { skipIfUnchanged?: boolean },
): Promise<EnqueueIngestResult> {
  const metadata = await fetchGitHubRepo(owner, name);
  const canonicalOwner = metadata.owner;
  const canonicalName = metadata.name;
  const commitSha = await fetchDefaultCommitSha(
    canonicalOwner,
    canonicalName,
    metadata.defaultBranch,
  );

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("repos")
    .select("*")
    .eq("user_id", userId)
    .eq("owner", canonicalOwner)
    .eq("name", canonicalName)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingRepo = (existing as Repo | null) ?? null;
  if (
    options?.skipIfUnchanged &&
    existingRepo &&
    shouldSkipReindex(existingRepo, commitSha)
  ) {
    return { repo: existingRepo, unchanged: true, jobId: null };
  }

  if (lockHeld(existingRepo)) {
    throw new Error("Indexing is already in progress for this repository.");
  }

  const keepReady = Boolean(existingRepo?.active_snapshot_id);
  const { data: repo, error: upsertError } = await admin
    .from("repos")
    .upsert(
      {
        user_id: userId,
        owner: canonicalOwner,
        name: canonicalName,
        description: metadata.description,
        default_branch: metadata.defaultBranch,
        html_url: metadata.htmlUrl,
        status: keepReady ? "ready" : "ingesting",
        error: null,
        file_count: existingRepo?.file_count ?? 0,
        chunk_count: existingRepo?.chunk_count ?? 0,
        commit_sha: existingRepo?.commit_sha ?? null,
        last_indexed_at: existingRepo?.last_indexed_at ?? null,
        ingest_lock_until: new Date(Date.now() + INGEST_LOCK_MS).toISOString(),
      },
      { onConflict: "user_id,owner,name" },
    )
    .select()
    .single();

  if (upsertError || !repo) {
    throw new Error(upsertError?.message ?? "Failed to save repository metadata.");
  }

  const { data: snapshot, error: snapshotError } = await admin
    .from("repo_snapshots")
    .insert({
      repo_id: repo.id,
      commit_sha: commitSha,
      status: "pending",
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    await admin
      .from("repos")
      .update({ ingest_lock_until: null })
      .eq("id", repo.id);
    throw new Error(snapshotError?.message ?? "Could not create source snapshot.");
  }

  const { data: job, error: jobError } = await admin
    .from("ingest_jobs")
    .insert({
      repo_id: repo.id,
      snapshot_id: snapshot.id,
      user_id: userId,
      owner: canonicalOwner,
      name: canonicalName,
      status: "queued",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    await admin
      .from("repos")
      .update({ ingest_lock_until: null })
      .eq("id", repo.id);
    throw new Error(jobError?.message ?? "Could not queue indexing.");
  }

  return { repo: repo as Repo, unchanged: false, jobId: job.id as string };
}

async function pruneOldSnapshots(repoId: string, activeSnapshotId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("repo_snapshots")
    .select("id, created_at")
    .eq("repo_id", repoId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  const extra = (data ?? [])
    .map((row) => row.id as string)
    .filter((id) => id !== activeSnapshotId)
    .slice(SNAPSHOT_RETENTION - 1);

  if (extra.length === 0) {
    return;
  }

  await admin.from("repo_snapshots").delete().in("id", extra);
}

export async function processIngestJob(jobId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin
    .from("ingest_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Indexing job not found.");
  }

  const { data: repo } = await admin
    .from("repos")
    .select("*")
    .eq("id", job.repo_id)
    .single();

  const previousSnapshotId = (repo?.active_snapshot_id as string | null) ?? null;

  await admin
    .from("ingest_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  await admin
    .from("repo_snapshots")
    .update({ status: "indexing" })
    .eq("id", job.snapshot_id);

  if (!previousSnapshotId) {
    await admin
      .from("repos")
      .update({ status: "indexing", error: null })
      .eq("id", job.repo_id);
  }

  try {
    const { data: snapshot } = await admin
      .from("repo_snapshots")
      .select("commit_sha")
      .eq("id", job.snapshot_id)
      .single();

    const commitSha = snapshot?.commit_sha as string;
    const files = await collectIngestibleFiles(job.owner, job.name, commitSha);

    if (files.length === 0) {
      throw new Error("No ingestible source files found in this repository.");
    }

    const storedFileIds = new Map<string, string>();

    for (let i = 0; i < files.length; i += INSERT_BATCH_SIZE) {
      const batch = files.slice(i, i + INSERT_BATCH_SIZE).map((file) => ({
        repo_id: job.repo_id,
        snapshot_id: job.snapshot_id,
        path: file.path,
        language: file.language,
        size_bytes: file.size_bytes,
        sha: file.sha,
        content: file.content,
      }));

      const { data: storedFiles, error: insertError } = await admin
        .from("files")
        .insert(batch)
        .select("id, path");

      if (insertError) {
        throw new Error(insertError.message);
      }

      for (const storedFile of storedFiles ?? []) {
        storedFileIds.set(storedFile.path, storedFile.id);
      }
    }

    if (storedFileIds.size !== files.length) {
      throw new Error("Not all ingested files were returned by the database.");
    }

    const chunkCount = await indexRepoFiles(
      job.repo_id,
      job.snapshot_id,
      files.map((file) => {
        const id = storedFileIds.get(file.path);
        if (!id) {
          throw new Error(`Missing database ID for ${file.path}.`);
        }
        return { id, path: file.path, content: file.content };
      }),
    );

    const indexedAt = new Date().toISOString();
    const { error: snapshotReadyError } = await admin
      .from("repo_snapshots")
      .update({
        status: "ready",
        file_count: files.length,
        chunk_count: chunkCount,
        indexed_at: indexedAt,
        error: null,
      })
      .eq("id", job.snapshot_id);

    if (snapshotReadyError) {
      throw new Error(snapshotReadyError.message);
    }

    const { error: repoReadyError } = await admin
      .from("repos")
      .update({
        status: "ready",
        file_count: files.length,
        chunk_count: chunkCount,
        error: null,
        commit_sha: commitSha,
        last_indexed_at: indexedAt,
        active_snapshot_id: job.snapshot_id,
        ingest_lock_until: null,
      })
      .eq("id", job.repo_id);

    if (repoReadyError) {
      throw new Error(repoReadyError.message);
    }

    await admin
      .from("ingest_jobs")
      .update({
        status: "succeeded",
        finished_at: indexedAt,
        error: null,
      })
      .eq("id", jobId);

    await pruneOldSnapshots(job.repo_id, job.snapshot_id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ingestion failed unexpectedly.";
    const keepPrevious = Boolean(previousSnapshotId);

    await admin
      .from("repo_snapshots")
      .update({
        status: "failed",
        error: message,
      })
      .eq("id", job.snapshot_id);

    await admin
      .from("repos")
      .update({
        status: keepPrevious ? "ready" : "failed",
        error: keepPrevious ? null : message,
        ingest_lock_until: null,
      })
      .eq("id", job.repo_id);

    await admin
      .from("ingest_jobs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    throw error;
  }
}

export async function ingestGitHubRepo(
  userId: string,
  owner: string,
  name: string,
  options?: { skipIfUnchanged?: boolean },
): Promise<{ repo: Repo; unchanged: boolean }> {
  const queued = await enqueueGitHubRepoIngest(userId, owner, name, options);
  if (queued.unchanged || !queued.jobId) {
    return { repo: queued.repo, unchanged: queued.unchanged };
  }

  await processIngestJob(queued.jobId);
  const admin = createAdminClient();
  const { data: repo, error } = await admin
    .from("repos")
    .select("*")
    .eq("id", queued.repo.id)
    .single();

  if (error || !repo) {
    throw new Error(error?.message ?? "Failed to load indexed repository.");
  }

  return { repo: repo as Repo, unchanged: false };
}
