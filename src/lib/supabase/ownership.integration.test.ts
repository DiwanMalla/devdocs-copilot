import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEMO_OWNER_USER_ID } from "./types";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator);
      const value = trimmed.slice(separator + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Tests skip when local env is absent.
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(url && anonKey && serviceRoleKey);

const UNIT_EMBEDDING = `[1,${Array.from({ length: 1535 }, () => 0).join(",")}]`;

async function createTestUser(
  admin: SupabaseClient,
  email: string,
  password: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error("Could not create test user.");
  }
  return data.user;
}

describe.skipIf(!canRun)("workspace ownership isolation", () => {
  const admin = createClient(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "phase5-test-pass-123";
  const emailA = `phase5-a-${suffix}@devdocs-copilot.test`;
  const emailB = `phase5-b-${suffix}@devdocs-copilot.test`;
  const createdUserIds: string[] = [];
  let repoId = "";
  let chatId = "";

  afterAll(async () => {
    if (repoId) {
      await admin.from("repos").delete().eq("id", repoId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("keeps repositories, search, chats, and deletes inside the owner boundary", async () => {
    const userA = await createTestUser(admin, emailA, password);
    const userB = await createTestUser(admin, emailB, password);
    createdUserIds.push(userA.id, userB.id);

    const { data: demoRepo } = await admin
      .from("repos")
      .select("id, user_id, owner, name")
      .eq("owner", "sindresorhus")
      .eq("name", "is")
      .maybeSingle();

    if (demoRepo) {
      expect(demoRepo.user_id).toBe(DEMO_OWNER_USER_ID);
      expect(demoRepo.user_id).not.toBe(userA.id);
      expect(demoRepo.user_id).not.toBe(userB.id);
    }

    const { data: repo, error: repoError } = await admin
      .from("repos")
      .insert({
        user_id: userA.id,
        owner: "phase5-test",
        name: `iso-${suffix.slice(0, 8)}`,
        description: "ownership fixture",
        default_branch: "main",
        commit_sha: "abc123",
        html_url: "https://github.com/phase5-test/iso",
        status: "ready",
        file_count: 1,
        chunk_count: 1,
      })
      .select("id")
      .single();

    expect(repoError).toBeNull();
    repoId = repo?.id ?? "";
    expect(repoId).toBeTruthy();

    const { data: snapshot, error: snapshotError } = await admin
      .from("repo_snapshots")
      .insert({
        repo_id: repoId,
        commit_sha: "abc123",
        status: "ready",
        file_count: 1,
        chunk_count: 1,
      })
      .select("id")
      .single();
    expect(snapshotError).toBeNull();
    const snapshotId = snapshot?.id as string;

    await admin
      .from("repos")
      .update({ active_snapshot_id: snapshotId })
      .eq("id", repoId);

    const { data: file, error: fileError } = await admin
      .from("files")
      .insert({
        repo_id: repoId,
        snapshot_id: snapshotId,
        path: "index.ts",
        language: "ts",
        size_bytes: 12,
        sha: "file-sha",
        content: "export const n = 1;\n",
      })
      .select("id")
      .single();

    expect(fileError).toBeNull();

    const { error: chunkError } = await admin.from("chunks").insert({
      repo_id: repoId,
      file_id: file?.id,
      snapshot_id: snapshotId,
      chunk_index: 0,
      start_line: 1,
      end_line: 1,
      content: "export const n = 1;",
      embedding: UNIT_EMBEDDING,
    });
    expect(chunkError).toBeNull();

    const { data: chat, error: chatError } = await admin
      .from("chats")
      .insert({
        user_id: userA.id,
        repo_id: repoId,
        title: "Owner thread",
      })
      .select("id")
      .single();
    expect(chatError).toBeNull();
    chatId = chat?.id ?? "";

    const clientA = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const clientB = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signedInA = await clientA.auth.signInWithPassword({
      email: emailA,
      password,
    });
    const signedInB = await clientB.auth.signInWithPassword({
      email: emailB,
      password,
    });
    expect(signedInA.error).toBeNull();
    expect(signedInB.error).toBeNull();

    const owned = await clientA.from("repos").select("id").eq("id", repoId);
    const foreign = await clientB.from("repos").select("id").eq("id", repoId);
    expect(owned.data).toHaveLength(1);
    expect(foreign.data).toHaveLength(0);

    const filesB = await clientB.from("files").select("id").eq("repo_id", repoId);
    const chatsB = await clientB.from("chats").select("id").eq("id", chatId);
    expect(filesB.data).toHaveLength(0);
    expect(chatsB.data).toHaveLength(0);

    const searchA = await clientA.rpc("match_chunks", {
      query_embedding: UNIT_EMBEDDING,
      match_repo_id: repoId,
      match_threshold: 0,
      match_count: 5,
      match_snapshot_id: snapshotId,
    });
    const searchB = await clientB.rpc("match_chunks", {
      query_embedding: UNIT_EMBEDDING,
      match_repo_id: repoId,
      match_threshold: 0,
      match_count: 5,
      match_snapshot_id: snapshotId,
    });
    expect(searchA.error).toBeNull();
    expect((searchA.data ?? []).length).toBeGreaterThan(0);
    expect(searchB.error).toBeNull();
    expect(searchB.data).toHaveLength(0);

    const lexicalA = await clientA.rpc("search_chunks_lexical", {
      match_repo_id: repoId,
      match_query: "export const",
      match_count: 5,
      match_snapshot_id: snapshotId,
    });
    const lexicalB = await clientB.rpc("search_chunks_lexical", {
      match_repo_id: repoId,
      match_query: "export const",
      match_count: 5,
      match_snapshot_id: snapshotId,
    });
    expect(lexicalA.error).toBeNull();
    expect((lexicalA.data ?? []).length).toBeGreaterThan(0);
    expect(lexicalB.error).toBeNull();
    expect(lexicalB.data).toHaveLength(0);

    const { data: retiredSnapshot, error: retiredError } = await admin
      .from("repo_snapshots")
      .insert({
        repo_id: repoId,
        commit_sha: "def456",
        status: "ready",
        file_count: 1,
        chunk_count: 1,
      })
      .select("id")
      .single();
    expect(retiredError).toBeNull();

    const { data: retiredFile } = await admin
      .from("files")
      .insert({
        repo_id: repoId,
        snapshot_id: retiredSnapshot?.id,
        path: "secret.ts",
        language: "ts",
        size_bytes: 18,
        sha: "secret-sha",
        content: "export const secret = 2;\n",
      })
      .select("id")
      .single();

    await admin.from("chunks").insert({
      repo_id: repoId,
      file_id: retiredFile?.id,
      snapshot_id: retiredSnapshot?.id,
      chunk_index: 0,
      start_line: 1,
      end_line: 1,
      content: "export const secret = 2;",
      embedding: UNIT_EMBEDDING,
    });

    const activeSearch = await clientA.rpc("match_chunks", {
      query_embedding: UNIT_EMBEDDING,
      match_repo_id: repoId,
      match_threshold: 0,
      match_count: 5,
      match_snapshot_id: snapshotId,
    });
    const retiredSearch = await clientA.rpc("match_chunks", {
      query_embedding: UNIT_EMBEDDING,
      match_repo_id: repoId,
      match_threshold: 0,
      match_count: 5,
      match_snapshot_id: retiredSnapshot?.id,
    });
    expect((activeSearch.data ?? []).every((row: { path: string }) => row.path !== "secret.ts")).toBe(
      true,
    );
    expect(
      (retiredSearch.data ?? []).some((row: { path: string }) => row.path === "secret.ts"),
    ).toBe(true);

    const insertUserA = await clientA.from("messages").insert({
      chat_id: chatId,
      user_id: userA.id,
      role: "user",
      content: "What does index.ts export?",
      client_request_id: "req-1",
    });
    expect(insertUserA.error).toBeNull();

    const replayUserA = await clientA.from("messages").insert({
      chat_id: chatId,
      user_id: userA.id,
      role: "user",
      content: "What does index.ts export?",
      client_request_id: "req-1",
    });
    expect(replayUserA.error).not.toBeNull();

    const insertAssistantA = await clientA.from("messages").insert({
      chat_id: chatId,
      user_id: userA.id,
      role: "assistant",
      content: "It exports n.",
    });
    expect(insertAssistantA.error).not.toBeNull();

    const insertUserB = await clientB.from("messages").insert({
      chat_id: chatId,
      user_id: userB.id,
      role: "user",
      content: "cross-thread",
    });
    expect(insertUserB.error).not.toBeNull();

    const embeddingSelect = await clientA.from("chunks").select("embedding");
    expect(embeddingSelect.error).not.toBeNull();

    const insertChatB = await clientB.from("chats").insert({
      user_id: userB.id,
      repo_id: repoId,
      title: "cross-user",
    });
    expect(insertChatB.error).not.toBeNull();

    const deleteB = await clientB.from("repos").delete().eq("id", repoId);
    expect(deleteB.error).toBeNull();
    const stillThere = await admin.from("repos").select("id").eq("id", repoId);
    expect(stillThere.data).toHaveLength(1);

    const deleteA = await clientA.from("repos").delete().eq("id", repoId);
    expect(deleteA.error).toBeNull();
    const gone = await admin.from("repos").select("id").eq("id", repoId);
    expect(gone.data).toHaveLength(0);
    repoId = "";
  });
});
