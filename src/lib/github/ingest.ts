import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IngestJob, Repo } from "@/lib/supabase/types";
import { indexRepoFiles } from "@/lib/ai/index-repo";
import { generateAndStoreRepoSummary } from "@/lib/ai/repo-summary";
import { INGEST_LOCK_MS, SNAPSHOT_RETENTION } from "@/lib/chat/limits";
import { shouldSkipReindex } from "./reindex";
import {
  decodeGitBlobContent,
  fetchDefaultCommitSha,
  fetchGitBlob,
  fetchGitHubRepo,
  fetchGitTree,
} from "./client";
import { isAlwaysIndexPath } from "@/lib/repo/priority-paths";
import {
  isLikelyBinaryContent,
  MAX_FILE_BYTES,
  MAX_PRIORITY_FILE_BYTES,
  shouldSkipPath,
} from "./filters";
import { languageFromPath } from "./languages";
import { assertIndexableTree } from "./tree";

const BLOB_CONCURRENCY = 8;
const INSERT_BATCH_SIZE = 40;
const INGEST_LEASE_SECONDS = 360;
const RETRY_DELAY_SECONDS = 30;

export type IngestExecutionResult = {
  jobId: string | null;
  status: "idle" | "succeeded" | "retrying" | "failed" | "lost";
};

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
    .filter((entry) => {
      const size = entry.size ?? 0;
      if (size <= 0) {
        return false;
      }
      const maxBytes = isAlwaysIndexPath(entry.path)
        ? MAX_PRIORITY_FILE_BYTES
        : MAX_FILE_BYTES;
      return size <= maxBytes;
    });

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
    await admin.from("repo_snapshots").delete().eq("id", snapshot.id);
    await admin
      .from("repos")
      .update({ ingest_lock_until: null })
      .eq("id", repo.id);
    throw new Error(jobError?.message ?? "Could not queue indexing.");
  }

  kickIngestWorker();
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

async function claimNextIngestJob(workerId: string): Promise<IngestJob | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_ingest_job", {
    p_worker_id: workerId,
    p_lease_seconds: INGEST_LEASE_SECONDS,
  });
  if (error) {
    throw new Error(`Could not claim indexing work: ${error.message}`);
  }
  return ((data ?? [])[0] as IngestJob | undefined) ?? null;
}

async function renewIngestLease(jobId: string, workerId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("renew_ingest_job_lease", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lease_seconds: INGEST_LEASE_SECONDS,
  });
  if (error || data !== true) {
    throw new Error(error?.message ?? "Indexing lease was lost.");
  }
}

async function prepareIngestAttempt(
  jobId: string,
  workerId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("prepare_ingest_job_attempt", {
    p_job_id: jobId,
    p_worker_id: workerId,
  });
  if (error || data !== true) {
    throw new Error(error?.message ?? "Indexing lease was lost before preparation.");
  }
}

async function completeIngestAttempt(input: {
  job: IngestJob;
  workerId: string;
  fileCount: number;
  chunkCount: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_ingest_job", {
    p_job_id: input.job.id,
    p_worker_id: input.workerId,
    p_file_count: input.fileCount,
    p_chunk_count: input.chunkCount,
  });
  if (error || data !== true) {
    throw new Error(error?.message ?? "Indexing lease was lost before activation.");
  }
}

async function failIngestAttempt(
  job: IngestJob,
  workerId: string,
  error: unknown,
): Promise<IngestExecutionResult["status"]> {
  const message =
    error instanceof Error ? error.message : "Ingestion failed unexpectedly.";
  const admin = createAdminClient();
  const { data, error: updateError } = await admin.rpc(
    "fail_ingest_job_attempt",
    {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error: message,
      p_retry_delay_seconds: RETRY_DELAY_SECONDS * job.attempt_count,
    },
  );
  if (updateError) {
    throw new Error(`Could not record indexing failure: ${updateError.message}`);
  }
  return data === "retrying" || data === "failed" ? data : "lost";
}

async function processClaimedIngestJob(
  job: IngestJob,
  workerId: string,
): Promise<IngestExecutionResult> {
  try {
    await prepareIngestAttempt(job.id, workerId);
    await renewIngestLease(job.id, workerId);

    const admin = createAdminClient();
    const { data: snapshot, error: snapshotError } = await admin
      .from("repo_snapshots")
      .select("commit_sha")
      .eq("id", job.snapshot_id)
      .eq("repo_id", job.repo_id)
      .single();
    if (snapshotError || !snapshot?.commit_sha) {
      throw new Error(snapshotError?.message ?? "Indexing snapshot not found.");
    }

    const files = await collectIngestibleFiles(
      job.owner,
      job.name,
      snapshot.commit_sha,
    );
    await renewIngestLease(job.id, workerId);
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
      await renewIngestLease(job.id, workerId);
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
      () => renewIngestLease(job.id, workerId),
    );
    await renewIngestLease(job.id, workerId);
    await completeIngestAttempt({
      job,
      workerId,
      fileCount: files.length,
      chunkCount,
    });
    try {
      const { data: repoRow } = await admin
        .from("repos")
        .select("description")
        .eq("id", job.repo_id)
        .maybeSingle();
      await generateAndStoreRepoSummary({
        repoId: job.repo_id,
        owner: job.owner,
        name: job.name,
        description:
          typeof repoRow?.description === "string" ? repoRow.description : null,
        files,
      });
    } catch (error) {
      console.error("Repository summary generation failed:", error);
    }
    await pruneOldSnapshots(job.repo_id, job.snapshot_id);
    return { jobId: job.id, status: "succeeded" };
  } catch (error) {
    return {
      jobId: job.id,
      status: await failIngestAttempt(job, workerId, error),
    };
  }
}

export async function processNextIngestJob(
  workerId = crypto.randomUUID(),
): Promise<IngestExecutionResult> {
  const admin = createAdminClient();
  const { error: recoveryError } = await admin.rpc("recover_expired_ingest_jobs");
  if (recoveryError) {
    throw new Error(`Could not recover expired indexing jobs: ${recoveryError.message}`);
  }

  const job = await claimNextIngestJob(workerId);
  if (!job) {
    return { jobId: null, status: "idle" };
  }
  return await processClaimedIngestJob(job, workerId);
}

export function kickIngestWorker(): void {
  try {
    after(() => {
      void processNextIngestJob().catch((error: unknown) => {
        console.error("Indexing worker failed", error);
      });
    });
  } catch (error) {
    console.error("Could not schedule indexing worker", error);
  }
}
