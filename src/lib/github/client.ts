import { runProviderRequest } from "@/lib/provider-resilience";

type GitHubRepoResponse = {
  private: boolean;
  description: string | null;
  default_branch: string;
  html_url: string;
  name: string;
  owner: { login: string };
  message?: string;
};

type GitHubCommitResponse = {
  sha: string;
  message?: string;
};

type GitHubTreeResponse = {
  sha: string;
  truncated: boolean;
  tree: Array<{
    path?: string;
    type?: string;
    sha?: string;
    size?: number;
  }>;
  message?: string;
};

type GitHubBlobResponse = {
  content?: string;
  encoding?: string;
  size?: number;
  message?: string;
};

const GITHUB_TIMEOUT_MS = 12_000;
const GITHUB_RETRY_ATTEMPTS = 3;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devdocs-copilot",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function fetchWithRetry(
  url: string,
  options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    attempts?: number;
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<Response> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  return runProviderRequest(
    async (signal) => {
      const response = await fetchImpl(url, {
        headers: githubHeaders(),
        cache: "no-store",
        signal,
      });

      if (response.status === 429 || response.status >= 500) {
        throw new GitHubApiError(
          `GitHub API request failed (${response.status}).`,
          response.status,
        );
      }
      return response;
    },
    {
      timeoutMs: options?.timeoutMs ?? GITHUB_TIMEOUT_MS,
      attempts: options?.attempts ?? GITHUB_RETRY_ATTEMPTS,
      initialDelayMs: 400,
      maxDelayMs: 1_600,
      sleep: options?.sleep,
    },
  );
}

async function githubFetch<T>(url: string): Promise<T> {
  const response = await fetchWithRetry(url);

  if (response.status === 404) {
    throw new GitHubApiError(
      "Repository not found or it is not public.",
      404,
    );
  }

  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new GitHubApiError(
        "GitHub rate limit exceeded. Add a GITHUB_TOKEN to .env.local and try again.",
        403,
      );
    }
    throw new GitHubApiError(
      "GitHub denied this request. The repository may be private.",
      403,
    );
  }

  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub API request failed (${response.status}).`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function fetchGitHubRepo(owner: string, name: string) {
  const repo = await githubFetch<GitHubRepoResponse>(
    `https://api.github.com/repos/${owner}/${name}`,
  );

  if (repo.private) {
    throw new GitHubApiError("Only public repositories can be ingested.", 403);
  }

  return {
    owner: repo.owner.login,
    name: repo.name,
    description: repo.description,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
  };
}

export async function fetchDefaultCommitSha(
  owner: string,
  name: string,
  branch: string,
): Promise<string> {
  const commit = await githubFetch<GitHubCommitResponse>(
    `https://api.github.com/repos/${owner}/${name}/commits/${encodeURIComponent(branch)}`,
  );
  return commit.sha;
}

export async function fetchGitTree(owner: string, name: string, sha: string) {
  const tree = await githubFetch<GitHubTreeResponse>(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${sha}?recursive=1`,
  );

  return {
    sha: tree.sha,
    truncated: tree.truncated,
    entries: tree.tree.filter(
      (entry): entry is { path: string; type: string; sha: string; size?: number } =>
        Boolean(entry.path && entry.type && entry.sha),
    ),
  };
}

export async function fetchGitBlob(
  owner: string,
  name: string,
  sha: string,
): Promise<{ content: string; encoding: string } | null> {
  const blob = await githubFetch<GitHubBlobResponse>(
    `https://api.github.com/repos/${owner}/${name}/git/blobs/${sha}`,
  );

  if (!blob.content || !blob.encoding) {
    return null;
  }

  return { content: blob.content, encoding: blob.encoding };
}

export function decodeGitBlobContent(
  content: string,
  encoding: string,
): string | null {
  if (encoding === "utf-8" || encoding === "utf8") {
    return content;
  }

  if (encoding !== "base64") {
    return null;
  }

  const buffer = Buffer.from(content.replace(/\n/g, ""), "base64");
  if (buffer.includes(0)) {
    return null;
  }

  return buffer.toString("utf8");
}
