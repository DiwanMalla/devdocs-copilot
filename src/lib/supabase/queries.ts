import "server-only";

import { createClient } from "@/lib/supabase/server";
import { MAX_HISTORY_PAGE } from "@/lib/chat/limits";
import type {
  ChatMessage,
  ChatThread,
  Repo,
  RepoFile,
  RepoFileMeta,
  StructuredCitation,
} from "@/lib/supabase/types";

function asCitations(value: unknown): StructuredCitation[] {
  return Array.isArray(value) ? (value as StructuredCitation[]) : [];
}

function asMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    chat_id: String(row.chat_id),
    user_id: String(row.user_id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content ?? ""),
    created_at: String(row.created_at),
    status:
      row.status === "pending" ||
      row.status === "streaming" ||
      row.status === "cancelled" ||
      row.status === "failed"
        ? row.status
        : "complete",
    client_request_id:
      typeof row.client_request_id === "string" ? row.client_request_id : null,
    snapshot_id: typeof row.snapshot_id === "string" ? row.snapshot_id : null,
    citations: asCitations(row.citations),
    error_code: typeof row.error_code === "string" ? row.error_code : null,
    correlation_id:
      typeof row.correlation_id === "string" ? row.correlation_id : null,
    model: typeof row.model === "string" ? row.model : null,
  };
}

export async function listOwnedRepos(): Promise<Repo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repos")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Repo[];
}

export async function getRepoByOwnerName(
  owner: string,
  name: string,
): Promise<Repo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repos")
    .select("*")
    .eq("owner", owner)
    .eq("name", name)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Repo | null) ?? null;
}

export async function getOwnedRepoById(repoId: string): Promise<Repo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repos")
    .select("*")
    .eq("id", repoId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Repo | null) ?? null;
}

export async function listRepoFileMeta(repoId: string): Promise<RepoFileMeta[]> {
  const supabase = await createClient();
  const { data: repo, error: repoError } = await supabase
    .from("repos")
    .select("active_snapshot_id")
    .eq("id", repoId)
    .maybeSingle();

  if (repoError) {
    throw new Error(repoError.message);
  }

  let query = supabase
    .from("files")
    .select("id, repo_id, snapshot_id, path, language, size_bytes, sha")
    .eq("repo_id", repoId)
    .order("path", { ascending: true });

  if (repo?.active_snapshot_id) {
    query = query.eq("snapshot_id", repo.active_snapshot_id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RepoFileMeta[];
}

export async function getRepoFileByPath(
  repoId: string,
  path: string,
  snapshotId?: string | null,
): Promise<RepoFile | null> {
  const supabase = await createClient();
  let resolvedSnapshotId = snapshotId ?? null;

  if (!resolvedSnapshotId) {
    const { data: repo, error: repoError } = await supabase
      .from("repos")
      .select("active_snapshot_id")
      .eq("id", repoId)
      .maybeSingle();
    if (repoError) {
      throw new Error(repoError.message);
    }
    resolvedSnapshotId = repo?.active_snapshot_id ?? null;
  }

  let query = supabase
    .from("files")
    .select("*")
    .eq("repo_id", repoId)
    .eq("path", path);

  if (resolvedSnapshotId) {
    query = query.eq("snapshot_id", resolvedSnapshotId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  return (data as RepoFile | null) ?? null;
}

export async function snapshotExists(
  repoId: string,
  snapshotId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repo_snapshots")
    .select("id")
    .eq("id", snapshotId)
    .eq("repo_id", repoId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function listOwnedChats(repoId: string): Promise<ChatThread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("repo_id", repoId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChatThread[];
}

export async function getOwnedChat(chatId: string): Promise<ChatThread | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ChatThread | null) ?? null;
}

export async function listChatMessages(
  chatId: string,
  options?: { limit?: number },
): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const limit = options?.limit ?? MAX_HISTORY_PAGE;
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(asMessage).toReversed();
}

export async function insertChatMessage(input: {
  chatId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    chat_id: input.chatId,
    user_id: input.userId,
    role: input.role,
    content: input.content,
    status: "complete",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function touchChat(chatId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function touchChatTitle(
  chatId: string,
  title: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chats")
    .update({ title })
    .eq("id", chatId);

  if (error) {
    throw new Error(error.message);
  }
}
