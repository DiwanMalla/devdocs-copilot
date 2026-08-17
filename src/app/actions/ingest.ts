"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ingestGitHubRepo } from "@/lib/github/ingest";
import { parseGitHubRepoInput } from "@/lib/github/parse-url";
import { GitHubApiError } from "@/lib/github/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export type IngestState = {
  error: string;
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

  const raw = String(formData.get("repo") ?? "");

  try {
    const parsed = parseGitHubRepoInput(raw);
    const repo = await ingestGitHubRepo(parsed.owner, parsed.name);
    redirect(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`);
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
