import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { citationAvailability } from "./citation-provenance";
import { chatMessagesToUIMessages } from "./messages";
import type { ChatMessage, StructuredCitation } from "@/lib/supabase/types";
import {
  canRunSupabaseIntegration,
  createAnonClient,
  createServiceClient,
  loadEnvLocal,
} from "@/test/integration";

loadEnvLocal();

const canRun = canRunSupabaseIntegration();

describe.skipIf(!canRun)("persisted historical citation provenance", () => {
  let admin: SupabaseClient;
  let client: SupabaseClient;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `citation-${suffix}@devdocs-copilot.test`;
  const password = "phase7-citation-test-pass-123";
  let userId = "";
  let repoId = "";
  let chatId = "";
  let snapshotA = "";
  let snapshotB = "";

  beforeAll(async () => {
    admin = createServiceClient();
    client = createAnonClient();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error;
    userId = created.data.user.id;

    const repo = await admin
      .from("repos")
      .insert({
        user_id: userId,
        owner: "phase7-test",
        name: `citations-${suffix.slice(-8)}`,
        default_branch: "main",
        html_url: "https://github.com/phase7-test/citations",
        status: "ready",
        commit_sha: "snapshot-a-sha",
        file_count: 1,
        chunk_count: 1,
      })
      .select("id")
      .single();
    if (repo.error || !repo.data) throw repo.error;
    repoId = repo.data.id;

    const snapshots = await admin
      .from("repo_snapshots")
      .insert([
        {
          repo_id: repoId,
          commit_sha: "snapshot-a-sha",
          status: "ready",
          file_count: 1,
          chunk_count: 1,
        },
        {
          repo_id: repoId,
          commit_sha: "snapshot-b-sha",
          status: "ready",
          file_count: 1,
          chunk_count: 1,
        },
      ])
      .select("id, commit_sha");
    if (snapshots.error) throw snapshots.error;
    snapshotA =
      snapshots.data?.find((row) => row.commit_sha === "snapshot-a-sha")?.id ?? "";
    snapshotB =
      snapshots.data?.find((row) => row.commit_sha === "snapshot-b-sha")?.id ?? "";

    const chat = await admin
      .from("chats")
      .insert({ user_id: userId, repo_id: repoId, title: "Historical answer" })
      .select("id")
      .single();
    if (chat.error || !chat.data) throw chat.error;
    chatId = chat.data.id;

    const citation: StructuredCitation = {
      chunkId: crypto.randomUUID(),
      path: "src/index.ts",
      startLine: 4,
      endLine: 8,
      snapshotId: snapshotA,
    };
    const inserted = await admin.from("messages").insert({
      chat_id: chatId,
      user_id: userId,
      role: "assistant",
      content: "The answer is here [src/index.ts:L4-L8].",
      status: "complete",
      snapshot_id: snapshotA,
      citations: [citation],
    });
    if (inserted.error) throw inserted.error;

    await admin
      .from("repos")
      .update({
        active_snapshot_id: snapshotB,
        commit_sha: "snapshot-b-sha",
      })
      .eq("id", repoId);

    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
  });

  afterAll(async () => {
    if (repoId) await admin.from("repos").delete().eq("id", repoId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("opens the old conversation against Snapshot A after Snapshot B activates", async () => {
    const messages = await client
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at");
    expect(messages.error).toBeNull();
    const ui = chatMessagesToUIMessages(messages.data as ChatMessage[]);
    const persistedCitation = ui[0]?.metadata?.citations[0];

    expect(ui[0]?.metadata?.snapshotId).toBe(snapshotA);
    expect(persistedCitation).toMatchObject({
      path: "src/index.ts",
      startLine: 4,
      endLine: 8,
      snapshotId: snapshotA,
    });
    expect(persistedCitation?.snapshotId).not.toBe(snapshotB);
    expect(
      citationAvailability(persistedCitation!, new Set([snapshotA, snapshotB])),
    ).toBe("available");
  });

  it("shows retired Snapshot A as unavailable without falling back to B", async () => {
    const deleted = await admin
      .from("repo_snapshots")
      .delete()
      .eq("id", snapshotA);
    expect(deleted.error).toBeNull();

    const messages = await client
      .from("messages")
      .select("*")
      .eq("chat_id", chatId);
    const ui = chatMessagesToUIMessages(messages.data as ChatMessage[]);
    const persistedCitation = ui[0]?.metadata?.citations[0];
    const available = await client
      .from("repo_snapshots")
      .select("id")
      .eq("repo_id", repoId);
    const availableIds = new Set((available.data ?? []).map((row) => row.id));

    expect(ui[0]?.metadata?.snapshotId).toBe(snapshotA);
    expect(citationAvailability(persistedCitation!, availableIds)).toBe(
      "unavailable",
    );
    expect(availableIds.has(snapshotB)).toBe(true);
  });
});
