import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const UNIT_EMBEDDING_VECTOR = [1, ...Array.from({ length: 1535 }, () => 0)];
export const UNIT_EMBEDDING = `[${UNIT_EMBEDDING_VECTOR.join(",")}]`;

const CLIENT_AUTH = { persistSession: false, autoRefreshToken: false } as const;

export function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export function parseEnvAssignments(contents: string): Record<string, string> {
  const assignments: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || separator === -1) continue;
    const key = trimmed.slice(0, separator);
    assignments[key] = unquoteEnvValue(trimmed.slice(separator + 1));
  }
  return assignments;
}

export function loadEnvLocal(): void {
  try {
    const assignments = parseEnvAssignments(
      readFileSync(resolve(process.cwd(), ".env.local"), "utf8"),
    );
    for (const [key, value] of Object.entries(assignments)) {
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Integration tests skip when local credentials are absent.
  }
}

function isHttpUrl(value: string | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

export function canRunSupabaseIntegration(): boolean {
  return (
    isHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  );
}

function createEnvClient(key: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: CLIENT_AUTH,
  });
}

export function createServiceClient(): SupabaseClient {
  return createEnvClient(process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function createAnonClient(): SupabaseClient {
  return createEnvClient(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function createSignedInClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createAnonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.user) {
    throw signedIn.error ?? new Error("Could not sign in test user.");
  }
  return client;
}

export async function waitFor<T>(
  run: () => Promise<T>,
  isReady: (value: T) => boolean,
  message: string,
  timeoutMs = 12_000,
): Promise<T> {
  const started = Date.now();
  let last: T | undefined;
  while (Date.now() - started < timeoutMs) {
    last = await run();
    if (isReady(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(message);
}

export async function drainResponse(response: Response): Promise<void> {
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) {
        return;
      }
    }
  } catch {
    // Aborted or failed streams can reject while the durable status is already persisted.
  }
}

export type ReadyRepoFixture = {
  userId: string;
  email: string;
  password: string;
  owner: string;
  name: string;
  repoId: string;
  snapshotId: string;
  chatId: string;
};

export async function createReadyRepoFixture(
  admin: SupabaseClient,
  suffix: string,
  options?: { owner?: string; namePrefix?: string },
): Promise<ReadyRepoFixture> {
  const password = "phase7-route-test-pass-123";
  const email = `route-${suffix}@devdocs-copilot.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Could not create route test user.");
  }

  const owner = options?.owner ?? "phase7-route";
  const name = `${options?.namePrefix ?? "chat"}-${suffix.slice(-8)}`;
  const repo = await admin
    .from("repos")
    .insert({
      user_id: created.data.user.id,
      owner,
      name,
      default_branch: "main",
      html_url: `https://github.com/${owner}/${name}`,
      status: "ready",
      commit_sha: "snapshot-sha",
      file_count: 1,
      chunk_count: 1,
    })
    .select("id")
    .single();
  if (repo.error || !repo.data) {
    throw repo.error ?? new Error("Could not create test repository.");
  }

  const snapshot = await admin
    .from("repo_snapshots")
    .insert({
      repo_id: repo.data.id,
      commit_sha: "snapshot-sha",
      status: "ready",
      file_count: 1,
      chunk_count: 1,
    })
    .select("id")
    .single();
  if (snapshot.error || !snapshot.data) {
    throw snapshot.error ?? new Error("Could not create test snapshot.");
  }

  await admin
    .from("repos")
    .update({ active_snapshot_id: snapshot.data.id })
    .eq("id", repo.data.id);

  const file = await admin
    .from("files")
    .insert({
      repo_id: repo.data.id,
      snapshot_id: snapshot.data.id,
      path: "src/auth.ts",
      language: "ts",
      size_bytes: 64,
      sha: "file-sha",
      content: "export function requireUser() {\n  return getSession();\n}\n",
    })
    .select("id")
    .single();
  if (file.error || !file.data) {
    throw file.error ?? new Error("Could not create test file.");
  }

  const chunk = await admin.from("chunks").insert({
    repo_id: repo.data.id,
    file_id: file.data.id,
    snapshot_id: snapshot.data.id,
    chunk_index: 0,
    start_line: 1,
    end_line: 3,
    content: "export function requireUser() {\n  return getSession();\n}",
    embedding: UNIT_EMBEDDING,
  });
  if (chunk.error) {
    throw chunk.error;
  }

  const chat = await admin
    .from("chats")
    .insert({
      user_id: created.data.user.id,
      repo_id: repo.data.id,
      title: "Route tests",
    })
    .select("id")
    .single();
  if (chat.error || !chat.data) {
    throw chat.error ?? new Error("Could not create test chat.");
  }

  return {
    userId: created.data.user.id,
    email,
    password,
    owner,
    name,
    repoId: repo.data.id,
    snapshotId: snapshot.data.id,
    chatId: chat.data.id,
  };
}

export async function deleteFixture(
  admin: SupabaseClient,
  fixture: Pick<ReadyRepoFixture, "repoId" | "userId">,
): Promise<void> {
  if (fixture.repoId) {
    await admin.from("repos").delete().eq("id", fixture.repoId);
  }
  if (fixture.userId) {
    await admin.auth.admin.deleteUser(fixture.userId);
  }
}

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "streaming" | "complete" | "cancelled" | "failed";
  error_code: string | null;
  client_request_id: string | null;
  citations: unknown;
};

export async function listMessagesForRequest(
  admin: SupabaseClient,
  chatId: string,
  requestId: string,
): Promise<MessageRow[]> {
  const { data, error } = await admin
    .from("messages")
    .select("id, role, content, status, error_code, client_request_id, citations")
    .eq("chat_id", chatId)
    .eq("client_request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as MessageRow[];
}
