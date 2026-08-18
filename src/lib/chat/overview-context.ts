import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { SemanticSearchResult } from "@/lib/ai/search";
import { isPrioritySourcePath } from "@/lib/repo/priority-paths";
import type { Repo } from "@/lib/supabase/types";
import type { RetrievalResult } from "./retrieval";
import { retrieveRepoChunks } from "./retrieval";
import {
  buildRepoOverviewChunk,
  chunksFromFileContent,
  mergeRetrievalWithOverview,
  parsePackageJsonDescription,
} from "./overview";
import { isRepoOverviewQuestion } from "./overview-question";

type StoredFile = {
  id: string;
  path: string;
  language: string | null;
  content: string;
};

export type ChatRetrievalResult = RetrievalResult & {
  overviewQuestion: boolean;
};

export async function retrieveChatContext(input: {
  repo: Pick<
    Repo,
    | "id"
    | "owner"
    | "name"
    | "description"
    | "summary"
    | "active_snapshot_id"
  >;
  query: string;
  client?: SupabaseClient;
}): Promise<ChatRetrievalResult> {
  const overviewQuestion = isRepoOverviewQuestion(input.query);
  const client = input.client ?? (await createClient());
  const retrieval = await retrieveRepoChunks({
    repoId: input.repo.id,
    query: input.query,
    snapshotId: input.repo.active_snapshot_id,
    client,
  });

  const snapshotId = input.repo.active_snapshot_id;
  if (!snapshotId) {
    return { ...retrieval, overviewQuestion };
  }

  if (retrieval.chunks.length > 0 && !overviewQuestion) {
    return { ...retrieval, overviewQuestion };
  }

  let extra: SemanticSearchResult[] = [];
  try {
    extra = await loadOverviewFallbackChunks({
      client,
      repo: input.repo,
      snapshotId,
    });
  } catch {
    extra = [
      buildRepoOverviewChunk({
        repoId: input.repo.id,
        owner: input.repo.owner,
        name: input.repo.name,
        description: input.repo.description,
        summary: input.repo.summary,
        packageDescription: null,
      }),
    ];
  }

  const chunks = mergeRetrievalWithOverview(retrieval.chunks, extra);
  return {
    chunks,
    diagnostics: {
      ...retrieval.diagnostics,
      selectedChunkIds: chunks.map((chunk) => chunk.chunk_id),
    },
    overviewQuestion,
  };
}

export async function loadOverviewFallbackChunks(input: {
  client: SupabaseClient;
  repo: Pick<
    Repo,
    "id" | "owner" | "name" | "description" | "summary" | "active_snapshot_id"
  >;
  snapshotId: string;
}): Promise<SemanticSearchResult[]> {
  const files = await loadPriorityFiles(
    input.client,
    input.repo.id,
    input.snapshotId,
  );
  const packageFile = files.find((file) =>
    file.path.toLowerCase().endsWith("package.json"),
  );

  const overview = buildRepoOverviewChunk({
    repoId: input.repo.id,
    owner: input.repo.owner,
    name: input.repo.name,
    description: input.repo.description,
    summary: input.repo.summary,
    packageDescription: packageFile
      ? parsePackageJsonDescription(packageFile.content)
      : null,
  });

  const preferred = files
    .slice()
    .sort((a, b) => priorityRank(a.path) - priorityRank(b.path))
    .slice(0, 6);

  const fromFiles = preferred.flatMap((file) =>
    chunksFromFileContent({
      fileId: file.id,
      path: file.path,
      language: file.language,
      content: file.content,
    }).slice(0, 2),
  );

  return [overview, ...fromFiles];
}

async function loadPriorityFiles(
  client: SupabaseClient,
  repoId: string,
  snapshotId: string,
): Promise<StoredFile[]> {
  const { data, error } = await client
    .from("files")
    .select("id, path, language, content")
    .eq("repo_id", repoId)
    .eq("snapshot_id", snapshotId);

  if (error) {
    throw new Error(`Could not load overview files: ${error.message}`);
  }

  return ((data ?? []) as StoredFile[]).filter((file) =>
    isPrioritySourcePath(file.path),
  );
}

function priorityRank(path: string): number {
  const lower = path.toLowerCase();
  if (/^readme(\.[a-z0-9]+)?$/.test(lower.split("/").pop() ?? "")) {
    return 0;
  }
  if (lower === "package.json") {
    return 1;
  }
  if (lower.startsWith("docs/")) {
    return 2;
  }
  return 3;
}
