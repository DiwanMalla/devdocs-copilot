export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    attempts?: number;
    delayMs?: number;
    retryOn?: (error: unknown) => boolean;
  },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const delayMs = options?.delayMs ?? 400;
  const retryOn = options?.retryOn ?? defaultRetryOn;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !retryOn(error)) {
        throw error;
      }
      await wait(delayMs * attempt);
    }
  }

  throw lastError;
}

function defaultRetryOn(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("econnreset")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
