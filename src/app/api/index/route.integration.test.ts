import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canRunSupabaseIntegration,
  createReadyRepoFixture,
  createServiceClient,
  deleteFixture,
  loadEnvLocal,
  UNIT_EMBEDDING_VECTOR,
  type ReadyRepoFixture,
} from "@/test/integration";

loadEnvLocal();
process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";

const SOURCE_FILE = "export function hello() {\n  return 1;\n}\n";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  fetchGitTree: vi.fn(),
  fetchGitBlob: vi.fn(),
  embedTexts: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  requireUser: vi.fn(),
  getSiteUrl: () => "http://localhost:3000",
}));

vi.mock("@/lib/github/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/client")>();
  return {
    ...actual,
    fetchGitTree: mocks.fetchGitTree,
    fetchGitBlob: mocks.fetchGitBlob,
  };
});

vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return {
    ...actual,
    embedTexts: mocks.embedTexts,
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

const canRun = canRunSupabaseIntegration();

describe("GET /api/index authorization", () => {
  it("rejects indexing requests without a signed-in user", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Authentication required.");
  });
});

describe("POST /api/index authorization", () => {
  it("rejects unauthenticated enqueue acknowledgements", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Authentication required.");
  });
});

describe.skipIf(!canRun).sequential("GET/POST /api/index against Supabase", () => {
  let admin: SupabaseClient;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let fixture: ReadyRepoFixture;
  let GET: typeof import("./route").GET;
  let POST: typeof import("./route").POST;

  beforeAll(async () => {
    admin = createServiceClient();
    fixture = await createReadyRepoFixture(admin, suffix, { namePrefix: "index" });
    mocks.embedTexts.mockImplementation(async (values: string[]) =>
      values.map(() => UNIT_EMBEDDING_VECTOR),
    );
    ({ GET, POST } = await import("./route"));
  });

  beforeEach(() => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: fixture.userId,
      email: fixture.email,
    });
    mocks.fetchGitTree.mockReset();
    mocks.fetchGitBlob.mockReset();
    mocks.embedTexts.mockClear();
    mocks.fetchGitTree.mockResolvedValue({
      sha: "commit-sha",
      truncated: false,
      entries: [
        { path: "src/hello.ts", type: "blob", sha: "blob-sha", size: SOURCE_FILE.length },
      ],
    });
    mocks.fetchGitBlob.mockResolvedValue({
      content: SOURCE_FILE,
      encoding: "utf-8",
    });
  });

  afterAll(async () => {
    await deleteFixture(admin, fixture);
  });

  async function createJob(maxAttempts = 3) {
    await admin
      .from("ingest_jobs")
      .delete()
      .eq("repo_id", fixture.repoId)
      .in("status", ["queued", "running"]);

    const snapshot = await admin
      .from("repo_snapshots")
      .insert({
        repo_id: fixture.repoId,
        commit_sha: crypto.randomUUID().replaceAll("-", ""),
        status: "pending",
      })
      .select("id")
      .single();
    if (snapshot.error || !snapshot.data) {
      throw snapshot.error ?? new Error("Could not create ingest snapshot.");
    }

    const job = await admin
      .from("ingest_jobs")
      .insert({
        repo_id: fixture.repoId,
        snapshot_id: snapshot.data.id,
        user_id: fixture.userId,
        owner: fixture.owner,
        name: fixture.name,
        max_attempts: maxAttempts,
      })
      .select("*")
      .single();
    if (job.error || !job.data) {
      throw job.error ?? new Error("Could not create ingest job.");
    }
    return job.data;
  }

  async function loadJob(jobId: string) {
    const { data, error } = await admin
      .from("ingest_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (error || !data) {
      throw error ?? new Error("Missing ingest job.");
    }
    return data;
  }

  it("claims a queued job, indexes mocked sources, and activates the snapshot", async () => {
    const job = await createJob();
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: job.id,
      status: "succeeded",
    });

    const stored = await loadJob(job.id);
    expect(stored.status).toBe("succeeded");
    expect(stored.lease_owner).toBeNull();

    const [snapshot, repo, files, chunks] = await Promise.all([
      admin.from("repo_snapshots").select("*").eq("id", job.snapshot_id).single(),
      admin.from("repos").select("*").eq("id", fixture.repoId).single(),
      admin.from("files").select("path").eq("snapshot_id", job.snapshot_id),
      admin.from("chunks").select("id").eq("snapshot_id", job.snapshot_id),
    ]);
    expect(snapshot.data?.status).toBe("ready");
    expect(repo.data?.active_snapshot_id).toBe(job.snapshot_id);
    expect(repo.data?.status).toBe("ready");
    expect(files.data).toEqual([{ path: "src/hello.ts" }]);
    expect(chunks.data?.length).toBeGreaterThan(0);
    expect(mocks.fetchGitTree).toHaveBeenCalled();
    expect(mocks.embedTexts).toHaveBeenCalled();
    fixture.snapshotId = job.snapshot_id;
  });

  it("lets only one concurrent worker claim the same job", async () => {
    const job = await createJob();
    const [first, second] = await Promise.all([GET(), GET()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const bodies = [await first.json(), await second.json()];
    const succeeded = bodies.filter((body) => body.status === "succeeded");
    const idle = bodies.filter((body) => body.status === "idle");
    expect(succeeded).toHaveLength(1);
    expect(idle).toHaveLength(1);
    expect(succeeded[0]?.jobId).toBe(job.id);

    const stored = await loadJob(job.id);
    expect(stored.status).toBe("succeeded");
    fixture.snapshotId = job.snapshot_id;
  });

  it("recovers an expired lease and completes the job on the next worker tick", async () => {
    const job = await createJob();
    const claimed = await admin.rpc("claim_ingest_job", {
      p_worker_id: crypto.randomUUID(),
      p_lease_seconds: 60,
      p_job_id: job.id,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toHaveLength(1);

    await admin
      .from("ingest_jobs")
      .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", job.id);

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: job.id,
      status: "succeeded",
    });
    const stored = await loadJob(job.id);
    expect(stored.status).toBe("succeeded");
    expect(stored.attempt_count).toBeGreaterThanOrEqual(2);
    fixture.snapshotId = job.snapshot_id;
  });

  it("marks an exhausted expired lease as failed without replacing the ready snapshot", async () => {
    const job = await createJob(1);
    const claimed = await admin.rpc("claim_ingest_job", {
      p_worker_id: crypto.randomUUID(),
      p_lease_seconds: 60,
      p_job_id: job.id,
    });
    expect(claimed.data).toHaveLength(1);
    await admin
      .from("ingest_jobs")
      .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", job.id);

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: null,
      status: "idle",
    });

    const [stored, repo] = await Promise.all([
      loadJob(job.id),
      admin.from("repos").select("status, active_snapshot_id").eq("id", fixture.repoId).single(),
    ]);
    expect(stored.status).toBe("failed");
    expect(repo.data).toMatchObject({
      status: "ready",
      active_snapshot_id: fixture.snapshotId,
    });
  });

  it("records a retryable worker failure when the mocked GitHub provider fails", async () => {
    const job = await createJob();
    mocks.fetchGitTree.mockRejectedValueOnce(new Error("GitHub unavailable"));
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: job.id,
      status: "retrying",
    });
    const stored = await loadJob(job.id);
    expect(stored.status).toBe("queued");
    expect(stored.error).toContain("GitHub unavailable");
  });

  it("acknowledges an owned job without starting a second claim", async () => {
    const job = await createJob();
    const response = await POST(
      new Request("http://localhost/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      status: "queued",
    });
    const stored = await loadJob(job.id);
    expect(stored.status).toBe("queued");
    expect(mocks.fetchGitTree).not.toHaveBeenCalled();
  });

  it("returns idle on repeated GET when the queue is empty", async () => {
    await admin
      .from("ingest_jobs")
      .delete()
      .eq("repo_id", fixture.repoId)
      .in("status", ["queued", "running"]);

    const first = await GET();
    const second = await GET();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ jobId: null, status: "idle" });
    await expect(second.json()).resolves.toEqual({ jobId: null, status: "idle" });
    expect(mocks.fetchGitTree).not.toHaveBeenCalled();
  });

  it("does not acknowledge another owner's indexing job", async () => {
    const job = await createJob();
    mocks.getAuthenticatedUser.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000000099",
      email: "other@devdocs-copilot.test",
    });
    const response = await POST(
      new Request("http://localhost/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Indexing job not found.");
  });
});
