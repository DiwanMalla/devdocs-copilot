import { createAdminClient } from "@/lib/supabase/admin";
import type { Repo } from "@/lib/supabase/types";
import { indexRepoFiles } from "@/lib/ai/index-repo";
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
  MAX_FILES,
  shouldSkipPath,
} from "./filters";
import { languageFromPath } from "./languages";

const BLOB_CONCURRENCY = 8;
const INSERT_BATCH_SIZE = 40;

export type IngestedFile = {
  path: string;
  language: string | null;
  size_bytes: number;
  sha: string;
  content: string;
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
    .filter((entry) => (entry.size ?? 0) > 0 && (entry.size ?? 0) <= MAX_FILE_BYTES)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_FILES);

  const fetched = await mapPool(candidates, BLOB_CONCURRENCY, async (entry) => {
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
  });

  return fetched.filter((file): file is IngestedFile => file !== null);
}

export async function ingestGitHubRepo(
  owner: string,
  name: string,
): Promise<Repo> {
  const metadata = await fetchGitHubRepo(owner, name);
  const canonicalOwner = metadata.owner;
  const canonicalName = metadata.name;
  const commitSha = await fetchDefaultCommitSha(
    canonicalOwner,
    canonicalName,
    metadata.defaultBranch,
  );

  const admin = createAdminClient();

  const { data: repo, error: upsertError } = await admin
    .from("repos")
    .upsert(
      {
        owner: canonicalOwner,
        name: canonicalName,
        description: metadata.description,
        default_branch: metadata.defaultBranch,
        commit_sha: commitSha,
        html_url: metadata.htmlUrl,
        status: "ingesting",
        error: null,
        file_count: 0,
        chunk_count: 0,
      },
      { onConflict: "owner,name" },
    )
    .select()
    .single();

  if (upsertError || !repo) {
    throw new Error(upsertError?.message ?? "Failed to save repository metadata.");
  }

  try {
    const files = await collectIngestibleFiles(
      canonicalOwner,
      canonicalName,
      commitSha,
    );

    if (files.length === 0) {
      throw new Error("No ingestible source files found in this repository.");
    }

    const { error: deleteError } = await admin
      .from("files")
      .delete()
      .eq("repo_id", repo.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const storedFileIds = new Map<string, string>();

    for (let i = 0; i < files.length; i += INSERT_BATCH_SIZE) {
      const batch = files.slice(i, i + INSERT_BATCH_SIZE).map((file) => ({
        repo_id: repo.id,
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

    const { error: indexingStatusError } = await admin
      .from("repos")
      .update({
        status: "indexing",
        file_count: files.length,
        error: null,
      })
      .eq("id", repo.id);

    if (indexingStatusError) {
      throw new Error(indexingStatusError.message);
    }

    const chunkCount = await indexRepoFiles(
      repo.id,
      files.map((file) => {
        const id = storedFileIds.get(file.path);
        if (!id) {
          throw new Error(`Missing database ID for ${file.path}.`);
        }
        return { id, path: file.path, content: file.content };
      }),
    );

    const { data: readyRepo, error: readyError } = await admin
      .from("repos")
      .update({
        status: "ready",
        file_count: files.length,
        chunk_count: chunkCount,
        error: null,
        commit_sha: commitSha,
      })
      .eq("id", repo.id)
      .select()
      .single();

    if (readyError || !readyRepo) {
      throw new Error(readyError?.message ?? "Failed to mark repository as ready.");
    }

    return readyRepo as Repo;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ingestion failed unexpectedly.";

    await admin
      .from("repos")
      .update({
        status: "failed",
        error: message,
      })
      .eq("id", repo.id);

    throw error;
  }
}
