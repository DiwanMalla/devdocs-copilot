import "server-only";

import { generateText } from "ai";
import { getChatModel } from "@/lib/ai/chat";
import { openRouterChatProviderOptions } from "@/lib/ai/chat-provider-policy";
import {
  CHAT_GENERATION_TIMEOUT,
  runChatRequest,
} from "@/lib/ai/provider-resilience";
import { parsePackageJsonDescription } from "@/lib/chat/overview";
import { isPackageJsonPath, isReadmePath } from "@/lib/repo/priority-paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRepoSummaryPrompt } from "./repo-summary-prompt";

const MAX_SUMMARY_CHARS = 8_000;

export async function generateAndStoreRepoSummary(input: {
  repoId: string;
  owner: string;
  name: string;
  description: string | null;
  files: { path: string; content: string }[];
}): Promise<void> {
  const readme = input.files.find((file) => isReadmePath(file.path))?.content ?? null;
  const packageFile = input.files.find((file) => isPackageJsonPath(file.path));
  const prompt = buildRepoSummaryPrompt({
    owner: input.owner,
    name: input.name,
    description: input.description,
    readme,
    packageDescription: packageFile
      ? parsePackageJsonDescription(packageFile.content)
      : null,
    filePaths: input.files.map((file) => file.path),
  });

  const result = await runChatRequest((signal) =>
    generateText({
      model: getChatModel(),
      prompt,
      maxOutputTokens: 700,
      abortSignal: signal,
      maxRetries: 0,
      timeout: CHAT_GENERATION_TIMEOUT.totalMs,
      providerOptions: {
        openrouter: openRouterChatProviderOptions(),
      },
    }),
  );

  const summary = result.text.trim().slice(0, MAX_SUMMARY_CHARS);
  if (!summary) {
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("repos")
    .update({ summary })
    .eq("id", input.repoId);
  if (error) {
    throw new Error(`Failed to store repository summary: ${error.message}`);
  }
}
