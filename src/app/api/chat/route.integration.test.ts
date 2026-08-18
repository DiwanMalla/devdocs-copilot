import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_RATE_LIMIT_MAX_REQUESTS } from "@/lib/chat/limits";
import {
  canRunSupabaseIntegration,
  createReadyRepoFixture,
  createServiceClient,
  createSignedInClient,
  deleteFixture,
  drainResponse,
  listMessagesForRequest,
  loadEnvLocal,
  UNIT_EMBEDDING_VECTOR,
  waitFor,
  type MessageRow,
  type ReadyRepoFixture,
} from "@/test/integration";

loadEnvLocal();
process.env.OPENROUTER_API_KEY ??= "test-openrouter-key";

const GROUNDED_ANSWER =
  "requireUser is exported from [src/auth.ts:L1-L3].";

type StreamCallbacks = {
  abortSignal?: AbortSignal;
  onAbort?: () => void | Promise<void>;
  onFinish?: (event: { text: string }) => void | Promise<void>;
};

type StreamHandle = StreamCallbacks & {
  onError?: (error: unknown) => string | undefined;
  close: () => void;
};

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  createClient: vi.fn(),
  embedQuery: vi.fn(),
  streamText: vi.fn(),
}));

let streamMode: "complete" | "hold" | "fail" = "complete";
const streamHandles: StreamHandle[] = [];

vi.mock("@/lib/supabase/auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  requireUser: vi.fn(),
  getSiteUrl: () => "http://localhost:3000",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return {
    ...actual,
    embedQuery: mocks.embedQuery,
  };
});

vi.mock("@/lib/ai/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/chat")>();
  return {
    ...actual,
    getChatModel: () => ({ specificationVersion: "v2", provider: "mock" }),
  };
});

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: mocks.streamText,
  };
});

function latestStream(): StreamHandle {
  const handle = streamHandles.at(-1);
  if (!handle) {
    throw new Error("Expected a chat stream to be open.");
  }
  return handle;
}

async function finishHeldStream(text = GROUNDED_ANSWER): Promise<void> {
  const handle = latestStream();
  await handle.onFinish?.({ text });
  handle.close();
}

const canRun = canRunSupabaseIntegration();

describe("POST /api/chat", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: "phase7-route",
          name: "chat",
          chatId: "00000000-0000-4000-8000-000000000001",
          requestId: "unauthenticated",
          messages: [
            { role: "user", parts: [{ type: "text", text: "Where is auth?" }] },
          ],
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Authentication required.");
  });

  it("rejects unauthenticated demo chat for a non-sample repository", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo: true,
          owner: "facebook",
          name: "react",
          requestId: "demo-wrong-repo",
          messages: [
            { role: "user", parts: [{ type: "text", text: "Where is auth?" }] },
          ],
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "Demo chat is only available for the sample repository.",
    );
  });
});

describe.skipIf(!canRun).sequential("POST /api/chat against Supabase", () => {
  let admin: SupabaseClient;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let fixture: ReadyRepoFixture;
  let userClient: SupabaseClient;
  let POST: typeof import("./route").POST;

  beforeAll(async () => {
    admin = createServiceClient();
    fixture = await createReadyRepoFixture(admin, suffix);
    userClient = await createSignedInClient(fixture.email, fixture.password);
    mocks.createClient.mockImplementation(async () => userClient);
    mocks.embedQuery.mockResolvedValue(UNIT_EMBEDDING_VECTOR);
    mocks.streamText.mockImplementation((options: StreamCallbacks) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const handle: StreamHandle = {
        abortSignal: options.abortSignal,
        onAbort: options.onAbort,
        onFinish: options.onFinish,
        close: () => {
          try {
            controller?.close();
          } catch {
            // Stream may already be closed by abort.
          }
        },
      };
      streamHandles.push(handle);
      options.abortSignal?.addEventListener(
        "abort",
        () => {
          void options.onAbort?.();
          handle.close();
        },
        { once: true },
      );

      return {
        toUIMessageStreamResponse(init?: {
          onError?: (error: unknown) => string;
        }) {
          handle.onError = init?.onError;
          const stream = new ReadableStream<Uint8Array>({
            start(streamController) {
              controller = streamController;
              if (streamMode === "complete") {
                void Promise.resolve(
                  options.onFinish?.({ text: GROUNDED_ANSWER }),
                ).then(() => {
                  handle.close();
                });
              }
              if (streamMode === "fail") {
                init?.onError?.(new Error("OpenRouter provider failed."));
                handle.close();
              }
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        },
      };
    });
    ({ POST } = await import("./route"));
  });

  beforeEach(() => {
    streamMode = "complete";
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: fixture.userId,
      email: fixture.email,
    });
    mocks.streamText.mockClear();
    mocks.embedQuery.mockClear();
    mocks.embedQuery.mockResolvedValue(UNIT_EMBEDDING_VECTOR);
  });

  afterAll(async () => {
    await deleteFixture(admin, fixture);
  });

  function chatRequest(requestId: string, question = "Where is requireUser defined?", signal?: AbortSignal) {
    return new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        owner: fixture.owner,
        name: fixture.name,
        chatId: fixture.chatId,
        requestId,
        messages: [
          {
            id: requestId,
            role: "user",
            parts: [{ type: "text", text: question }],
          },
        ],
      }),
    });
  }

  async function waitForMessages(
    requestId: string,
    isReady: (rows: MessageRow[]) => boolean,
    message: string,
  ) {
    return waitFor(
      () => listMessagesForRequest(admin, fixture.chatId, requestId),
      isReady,
      message,
    );
  }

  it("streams a grounded answer and persists complete message states", async () => {
    streamMode = "hold";
    const requestId = `stream-${crypto.randomUUID()}`;
    const responsePromise = POST(chatRequest(requestId));

    const inFlight = await waitForMessages(
      requestId,
      (rows) =>
        rows.some((row) => row.role === "user" && row.status === "complete") &&
        rows.some(
          (row) =>
            row.role === "assistant" &&
            (row.status === "pending" || row.status === "streaming"),
        ),
      "Expected a completed user turn and an in-progress assistant generation.",
    );
    const assistant = inFlight.find((row) => row.role === "assistant");
    expect(assistant?.status).toMatch(/^(pending|streaming)$/);

    await finishHeldStream();
    const response = await responsePromise;
    expect(response.status).toBe(200);
    await drainResponse(response);

    const rows = await waitForMessages(
      requestId,
      (messages) =>
        messages.some(
          (row) =>
            row.role === "assistant" &&
            row.status === "complete" &&
            row.content.includes("src/auth.ts"),
        ),
      "Expected the assistant message to complete.",
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual(["complete", "complete"]);
    expect(rows[1]?.citations).toEqual([
      expect.objectContaining({
        path: "src/auth.ts",
        startLine: 1,
        endLine: 3,
        snapshotId: fixture.snapshotId,
      }),
    ]);
  });

  it("cancels an in-flight generation when the client aborts", async () => {
    streamMode = "hold";
    const requestId = `abort-${crypto.randomUUID()}`;
    const controller = new AbortController();
    const responsePromise = POST(chatRequest(requestId, "Where is requireUser defined?", controller.signal));

    await waitForMessages(
      requestId,
      (rows) =>
        rows.some(
          (row) =>
            row.role === "assistant" &&
            (row.status === "pending" || row.status === "streaming"),
        ),
      "Expected an in-progress assistant message before aborting.",
    );

    controller.abort();
    const response = await responsePromise.catch((error: unknown) => error);
    if (response instanceof Response) {
      await drainResponse(response);
    }

    const rows = await waitForMessages(
      requestId,
      (messages) =>
        messages.some(
          (row) =>
            row.role === "assistant" &&
            row.status === "cancelled" &&
            row.error_code === "cancelled",
        ),
      "Expected the assistant message to be cancelled.",
    );
    expect(rows.find((row) => row.role === "user")?.status).toBe("complete");
    expect(rows.find((row) => row.role === "assistant")?.content).toBe("");
  });

  it("marks the assistant message failed when the provider errors", async () => {
    streamMode = "fail";
    const requestId = `fail-${crypto.randomUUID()}`;
    const response = await POST(chatRequest(requestId));
    expect(response.status).toBe(200);
    await drainResponse(response);

    const rows = await waitForMessages(
      requestId,
      (messages) =>
        messages.some(
          (row) =>
            row.role === "assistant" &&
            row.status === "failed" &&
            row.error_code === "provider_failed",
        ),
      "Expected the assistant message to fail.",
    );
    expect(rows.find((row) => row.role === "user")?.status).toBe("complete");
  });

  it("replays a completed request without creating another generation", async () => {
    const requestId = `replay-${crypto.randomUUID()}`;
    const first = await POST(chatRequest(requestId));
    expect(first.status).toBe(200);
    await drainResponse(first);
    await waitForMessages(
      requestId,
      (rows) => rows.some((row) => row.role === "assistant" && row.status === "complete"),
      "Expected the original generation to complete before replay.",
    );

    mocks.streamText.mockClear();
    mocks.embedQuery.mockClear();
    const replay = await POST(chatRequest(requestId));
    expect(replay.status).toBe(200);
    await drainResponse(replay);

    const rows = await listMessagesForRequest(admin, fixture.chatId, requestId);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.role, row.status])).toEqual([
      ["user", "complete"],
      ["assistant", "complete"],
    ]);
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.embedQuery).not.toHaveBeenCalled();
  });

  it("rejects an in-progress replay with 409", async () => {
    streamMode = "hold";
    const requestId = `inflight-${crypto.randomUUID()}`;
    const firstPromise = POST(chatRequest(requestId));
    await waitForMessages(
      requestId,
      (rows) =>
        rows.some(
          (row) =>
            row.role === "assistant" &&
            (row.status === "pending" || row.status === "streaming"),
        ),
      "Expected the first generation to be in progress.",
    );

    const collision = await POST(chatRequest(requestId));
    expect(collision.status).toBe(409);
    expect(await collision.text()).toBe("This question is already being generated.");

    await finishHeldStream();
    await drainResponse(await firstPromise);
  });

  it("rejects replay of a cancelled generation with 409", async () => {
    streamMode = "hold";
    const requestId = `cancelled-${crypto.randomUUID()}`;
    const controller = new AbortController();
    const firstPromise = POST(
      chatRequest(requestId, "Where is requireUser defined?", controller.signal),
    );
    await waitForMessages(
      requestId,
      (rows) =>
        rows.some(
          (row) =>
            row.role === "assistant" &&
            (row.status === "pending" || row.status === "streaming"),
        ),
      "Expected an in-progress generation before cancellation.",
    );
    controller.abort();
    const first = await firstPromise.catch((error: unknown) => error);
    if (first instanceof Response) {
      await drainResponse(first);
    }
    await waitForMessages(
      requestId,
      (rows) => rows.some((row) => row.role === "assistant" && row.status === "cancelled"),
      "Expected the generation to be cancelled before replay.",
    );

    const replay = await POST(chatRequest(requestId));
    expect(replay.status).toBe(409);
    expect(await replay.text()).toBe(
      "This generation was cancelled. Send a new question to retry.",
    );
  });

  it("returns 429 with Retry-After when the owner quota is exhausted", async () => {
    const isolated = await createReadyRepoFixture(admin, `${suffix}-rl`, {
      namePrefix: "rate",
    });
    const isolatedClient = await createSignedInClient(isolated.email, isolated.password);
    mocks.createClient.mockImplementation(async () => isolatedClient);
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: isolated.userId,
      email: isolated.email,
    });

    try {
      for (let i = 0; i < CHAT_RATE_LIMIT_MAX_REQUESTS; i += 1) {
        const { data, error } = await admin.rpc("consume_chat_rate_limit", {
          p_user_id: isolated.userId,
          p_max_requests: CHAT_RATE_LIMIT_MAX_REQUESTS,
          p_window_seconds: 600,
        });
        expect(error).toBeNull();
        expect((data as { allowed: boolean }[] | null)?.[0]?.allowed).toBe(true);
      }

      const response = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: isolated.owner,
            name: isolated.name,
            chatId: isolated.chatId,
            requestId: `rate-${crypto.randomUUID()}`,
            messages: [
              {
                role: "user",
                parts: [{ type: "text", text: "Where is requireUser defined?" }],
              },
            ],
          }),
        }),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toEqual(expect.stringMatching(/^[1-9]\d*$/));
      expect(await response.text()).toBe(
        "Too many chat requests. Please wait and try again.",
      );
      expect(mocks.streamText).not.toHaveBeenCalled();
    } finally {
      mocks.createClient.mockImplementation(async () => userClient);
      await deleteFixture(admin, isolated);
    }
  });
});
