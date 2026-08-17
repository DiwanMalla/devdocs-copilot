"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getOwnedChat, getOwnedRepoById } from "@/lib/supabase/queries";
import { buildRepoWorkspaceHref } from "@/lib/repo/href";

async function insertOwnedChat(repoId: string) {
  const user = await requireUser();
  const repo = await getOwnedRepoById(repoId);

  if (!repo || repo.user_id !== user.id) {
    throw new Error("Repository not found.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      repo_id: repo.id,
      title: "New chat",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create chat.");
  }

  return { repo, chatId: data.id as string };
}

export async function createChat(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") ?? "");
  const { repo, chatId } = await insertOwnedChat(repoId);

  const path = String(formData.get("path") ?? "") || null;
  const query = String(formData.get("q") ?? "") || null;
  redirect(
    buildRepoWorkspaceHref({
      owner: repo.owner,
      name: repo.name,
      chatId,
      path,
      query,
    }),
  );
}

export async function startChatThread(repoId: string): Promise<string> {
  const { chatId } = await insertOwnedChat(repoId);
  return chatId;
}

export async function renameChat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const chatId = String(formData.get("chatId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 80);
  const chat = await getOwnedChat(chatId);

  if (!chat || chat.user_id !== user.id) {
    throw new Error("Chat not found.");
  }
  if (!title) {
    throw new Error("A chat title is required.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("chats")
    .update({ title })
    .eq("id", chat.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteChat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const chatId = String(formData.get("chatId") ?? "");
  const chat = await getOwnedChat(chatId);

  if (!chat || chat.user_id !== user.id) {
    throw new Error("Chat not found.");
  }

  const supabase = await createClient();
  const { data: repo, error: repoError } = await supabase
    .from("repos")
    .select("owner, name")
    .eq("id", chat.repo_id)
    .maybeSingle();

  if (repoError) {
    throw new Error(repoError.message);
  }

  const { error } = await supabase.from("chats").delete().eq("id", chat.id);

  if (error) {
    throw new Error(error.message);
  }

  const { data: remaining } = await supabase
    .from("chats")
    .select("id")
    .eq("repo_id", chat.repo_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const owner = repo?.owner;
  const name = repo?.name;
  if (!owner || !name) {
    redirect("/");
  }

  const nextChat = remaining?.id ? `?chat=${remaining.id}` : "";
  redirect(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${nextChat}`,
  );
}
