export type RepoStatus =
  | "pending"
  | "ingesting"
  | "indexing"
  | "ready"
  | "failed";

export type GenerationStatus =
  | "pending"
  | "streaming"
  | "complete"
  | "cancelled"
  | "failed";

export type StructuredCitation = {
  chunkId: string;
  path: string;
  startLine: number;
  endLine: number;
  snapshotId: string;
};

export type RepoChatMessageMetadata = {
  snapshotId: string | null;
  citations: StructuredCitation[];
};

export type RepoSnapshot = {
  id: string;
  repo_id: string;
  commit_sha: string;
  status: "pending" | "indexing" | "ready" | "failed";
  file_count: number;
  chunk_count: number;
  truncated: boolean;
  capped: boolean;
  error: string | null;
  created_at: string;
  indexed_at: string | null;
};

export type IngestJob = {
  id: string;
  repo_id: string;
  snapshot_id: string;
  user_id: string;
  owner: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type Repo = {
  id: string;
  user_id: string;
  owner: string;
  name: string;
  description: string | null;
  default_branch: string;
  commit_sha: string | null;
  html_url: string;
  status: RepoStatus;
  file_count: number;
  chunk_count: number;
  error: string | null;
  last_indexed_at: string | null;
  active_snapshot_id: string | null;
  ingest_lock_until: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type RepoFile = {
  id: string;
  repo_id: string;
  snapshot_id: string | null;
  path: string;
  language: string | null;
  size_bytes: number;
  sha: string;
  content: string;
};

export type RepoFileMeta = Omit<RepoFile, "content">;

export type ChatThread = {
  id: string;
  user_id: string;
  repo_id: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  status: GenerationStatus;
  client_request_id: string | null;
  snapshot_id: string | null;
  citations: StructuredCitation[];
  error_code: string | null;
  correlation_id: string | null;
  model: string | null;
};

export const DEMO_OWNER_USER_ID = "00000000-0000-4000-8000-0000000000d1";
export const DEMO_OWNER_EMAIL = "demo@devdocs-copilot.local";
