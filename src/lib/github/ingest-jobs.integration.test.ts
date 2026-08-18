import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canRunSupabaseIntegration,
  createServiceClient,
  loadEnvLocal,
} from "@/test/integration";

loadEnvLocal();

const canRun = canRunSupabaseIntegration();

describe.skipIf(!canRun)("durable ingest job lifecycle", () => {
  let admin: SupabaseClient;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let userId = "";
  let repoId = "";
  let activeSnapshotId = "";

  beforeAll(async () => {
    admin = createServiceClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: `ingest-jobs-${suffix}@devdocs-copilot.test`,
      password: "phase7-ingest-test-pass-123",
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("Could not create test user.");
    userId = data.user.id;

    const repo = await admin
      .from("repos")
      .insert({
        user_id: userId,
        owner: "phase7-test",
        name: `durable-${suffix.slice(-8)}`,
        default_branch: "main",
        html_url: "https://github.com/phase7-test/durable",
        status: "ready",
        commit_sha: "snapshot-a-sha",
        file_count: 1,
        chunk_count: 1,
      })
      .select("id")
      .single();
    if (repo.error || !repo.data) throw repo.error ?? new Error("Missing repo.");
    repoId = repo.data.id;

    const snapshot = await admin
      .from("repo_snapshots")
      .insert({
        repo_id: repoId,
        commit_sha: "snapshot-a-sha",
        status: "ready",
        file_count: 1,
        chunk_count: 1,
      })
      .select("id")
      .single();
    if (snapshot.error || !snapshot.data) {
      throw snapshot.error ?? new Error("Missing snapshot.");
    }
    activeSnapshotId = snapshot.data.id;
    await admin
      .from("repos")
      .update({ active_snapshot_id: activeSnapshotId })
      .eq("id", repoId);
  });

  afterAll(async () => {
    if (repoId) await admin.from("repos").delete().eq("id", repoId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function createJob(maxAttempts = 3) {
    const snapshot = await admin
      .from("repo_snapshots")
      .insert({
        repo_id: repoId,
        commit_sha: crypto.randomUUID().replaceAll("-", ""),
        status: "pending",
      })
      .select("id")
      .single();
    if (snapshot.error || !snapshot.data) throw snapshot.error;

    const job = await admin
      .from("ingest_jobs")
      .insert({
        repo_id: repoId,
        snapshot_id: snapshot.data.id,
        user_id: userId,
        owner: "phase7-test",
        name: "durable",
        max_attempts: maxAttempts,
      })
      .select("*")
      .single();
    if (job.error || !job.data) throw job.error;
    return job.data;
  }

  async function claim(
    client: SupabaseClient,
    jobId: string,
    workerId: string,
  ) {
    return await client.rpc("claim_ingest_job", {
      p_worker_id: workerId,
      p_lease_seconds: 60,
      p_job_id: jobId,
    });
  }

  it("atomically claims, recovers, retries, and activates exactly once", async () => {
    const job = await createJob();
    const workerA = crypto.randomUUID();
    const workerB = crypto.randomUUID();
    const [first, second] = await Promise.all([
      claim(admin, job.id, workerA),
      claim(admin, job.id, workerB),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const claimed = [first, second].filter((result) => result.data?.length === 1);
    expect(claimed).toHaveLength(1);
    const firstWorker = claimed[0] === first ? workerA : workerB;

    await admin
      .from("ingest_jobs")
      .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", job.id);
    const recoveryWorker = crypto.randomUUID();
    const recovered = await claim(admin, job.id, recoveryWorker);
    expect(recovered.error).toBeNull();
    expect(recovered.data).toHaveLength(1);
    expect(recovered.data?.[0]?.attempt_count).toBe(2);
    expect(recoveryWorker).not.toBe(firstWorker);

    const prepared = await admin.rpc("prepare_ingest_job_attempt", {
      p_job_id: job.id,
      p_worker_id: recoveryWorker,
    });
    expect(prepared).toMatchObject({ data: true, error: null });
    const partialFile = await admin.from("files").insert({
      repo_id: repoId,
      snapshot_id: job.snapshot_id,
      path: "partial.ts",
      language: "ts",
      size_bytes: 1,
      sha: "partial",
      content: "x",
    });
    expect(partialFile.error).toBeNull();

    const retry = await admin.rpc("fail_ingest_job_attempt", {
      p_job_id: job.id,
      p_worker_id: recoveryWorker,
      p_error: "transient provider failure",
      p_retry_delay_seconds: 0,
    });
    expect(retry).toMatchObject({ data: "retrying", error: null });
    const beforeRetry = await admin
      .from("repos")
      .select("active_snapshot_id")
      .eq("id", repoId)
      .single();
    expect(beforeRetry.data?.active_snapshot_id).toBe(activeSnapshotId);

    const finalWorker = crypto.randomUUID();
    const finalClaim = await claim(admin, job.id, finalWorker);
    expect(finalClaim.data?.[0]?.attempt_count).toBe(3);
    const prepareAgain = await admin.rpc("prepare_ingest_job_attempt", {
      p_job_id: job.id,
      p_worker_id: finalWorker,
    });
    expect(prepareAgain.data).toBe(true);
    const staleFiles = await admin
      .from("files")
      .select("id")
      .eq("snapshot_id", job.snapshot_id);
    expect(staleFiles.data).toHaveLength(0);

    const completed = await admin.rpc("complete_ingest_job", {
      p_job_id: job.id,
      p_worker_id: finalWorker,
      p_file_count: 2,
      p_chunk_count: 4,
    });
    expect(completed).toMatchObject({ data: true, error: null });

    const duplicateCompletion = await admin.rpc("complete_ingest_job", {
      p_job_id: job.id,
      p_worker_id: finalWorker,
      p_file_count: 99,
      p_chunk_count: 99,
    });
    expect(duplicateCompletion).toMatchObject({ data: false, error: null });

    const [storedJob, repo] = await Promise.all([
      admin.from("ingest_jobs").select("*").eq("id", job.id).single(),
      admin.from("repos").select("*").eq("id", repoId).single(),
    ]);
    expect(storedJob.data?.status).toBe("succeeded");
    expect(repo.data?.active_snapshot_id).toBe(job.snapshot_id);
    expect(repo.data?.file_count).toBe(2);
    expect(repo.data?.chunk_count).toBe(4);
    activeSnapshotId = job.snapshot_id;
  });

  it("fails terminal attempts without replacing the ready snapshot", async () => {
    const job = await createJob(1);
    const worker = crypto.randomUUID();
    const claimed = await claim(admin, job.id, worker);
    expect(claimed.data).toHaveLength(1);

    const failed = await admin.rpc("fail_ingest_job_attempt", {
      p_job_id: job.id,
      p_worker_id: worker,
      p_error: "permanent indexing failure",
      p_retry_delay_seconds: 0,
    });
    expect(failed).toMatchObject({ data: "failed", error: null });

    const [storedJob, snapshot, repo] = await Promise.all([
      admin.from("ingest_jobs").select("status").eq("id", job.id).single(),
      admin
        .from("repo_snapshots")
        .select("status")
        .eq("id", job.snapshot_id)
        .single(),
      admin.from("repos").select("status, active_snapshot_id").eq("id", repoId).single(),
    ]);
    expect(storedJob.data?.status).toBe("failed");
    expect(snapshot.data?.status).toBe("failed");
    expect(repo.data).toMatchObject({
      status: "ready",
      active_snapshot_id: activeSnapshotId,
    });
  });

  it("recovers an expired final lease as a terminal failure", async () => {
    const job = await createJob(1);
    const worker = crypto.randomUUID();
    expect((await claim(admin, job.id, worker)).data).toHaveLength(1);
    await admin
      .from("ingest_jobs")
      .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", job.id);

    const recovered = await admin.rpc("recover_expired_ingest_jobs");
    expect(recovered.error).toBeNull();
    expect(recovered.data).toBeGreaterThanOrEqual(1);

    const stored = await admin
      .from("ingest_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    expect(stored.data?.status).toBe("failed");
  });
});
