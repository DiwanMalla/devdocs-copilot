import { runProviderRequest } from "@/lib/provider-resilience";

export const EMBEDDING_TIMEOUT_MS = 20_000;
export const CHAT_GENERATION_TIMEOUT = {
  totalMs: 55_000,
  firstChunkMs: 15_000,
  chunkMs: 20_000,
} as const;

export async function runEmbeddingRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runProviderRequest(operation, {
    timeoutMs: EMBEDDING_TIMEOUT_MS,
    attempts: 3,
    initialDelayMs: 300,
    maxDelayMs: 1_200,
  });
}

export async function runChatRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return runProviderRequest(operation, {
    signal,
    timeoutMs: CHAT_GENERATION_TIMEOUT.totalMs,
    attempts: 3,
    initialDelayMs: 300,
    maxDelayMs: 1_200,
  });
}
