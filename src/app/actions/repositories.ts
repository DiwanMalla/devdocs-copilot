"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { GitHubApiError } from "@/lib/github/client";
import { enqueueGitHubRepoIngest } from "@/lib/github/ingest";
import { parseGitHubRepoInput } from "@/lib/github/parse-url";
import { requireUser } from "@/lib/supabase/auth";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getOwnedRepoById } from "@/lib/supabase/queries";

export type IngestState = {
  error: string;
} | null;

export type RepoActionState = {
  error?: string;
  notice?: string;
} | null;

export async function ingestRepo(
  _prev: IngestState,
  formData: FormData,
): Promise<IngestState> {
  if (!hasSupabaseConfig()) {
    return {
      error:
        "Supabase is not configured. Copy .env.example to .env.local and add your project keys.",
    };
  }

  const user = await requireUser();
  const raw = String(formData.get("repo") ?? "");

  try {
    const parsed = parseGitHubRepoInput(raw);
    const queued = await enqueueGitHubRepoIngest(
      user.id,
      parsed.owner,
      parsed.name,
    );
    redirect(
      `/repos/${encodeURIComponent(queued.repo.owner)}/${encodeURIComponent(queued.repo.name)}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (error instanceof GitHubApiError) {
      return { error: error.message };
    }

    const message =
      error instanceof Error ? error.message : "Could not ingest this repository.";
    return { error: message };
  }
}

export async function reindexRepository(
  _prev: RepoActionState,
  formData: FormData,
): Promise<RepoActionState> {
  const user = await requireUser();
  const repoId = String(formData.get("repoId") ?? "");
  const repo = await getOwnedRepoById(repoId);

  if (!repo || repo.user_id !== user.id) {
    return { error: "Repository not found." };
  }

  try {
    const result = await enqueueGitHubRepoIngest(user.id, repo.owner, repo.name, {
      skipIfUnchanged: true,
    });

    if (result.unchanged) {
      return { notice: "This repository is already indexed at the current commit." };
    }

    return {
      notice:
        "Indexing started. The current snapshot stays searchable until the new one is ready.",
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return { error: error.message };
    }

    return {
      error:
        error instanceof Error ? error.message : "Could not re-index this repository.",
    };
  }
}

export async function deleteRepository(formData: FormData): Promise<void> {
  const user = await requireUser();
  const repoId = String(formData.get("repoId") ?? "");
  const repo = await getOwnedRepoById(repoId);

  if (!repo || repo.user_id !== user.id) {
    throw new Error("Repository not found.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("repos").delete().eq("id", repo.id);

  if (error) {
    throw new Error(error.message);
  }

  redirect("/");
}
