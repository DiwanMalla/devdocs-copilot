export type RepoStatus =
  | "pending"
  | "ingesting"
  | "indexing"
  | "ready"
  | "failed";

export type Repo = {
  id: string;
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
  created_at: string;
  updated_at: string;
};

export type RepoFile = {
  id: string;
  repo_id: string;
  path: string;
  language: string | null;
  size_bytes: number;
  sha: string;
  content: string;
};

export type RepoFileMeta = Omit<RepoFile, "content">;
