export type ProviderFailureKind =
  | "cancelled"
  | "timeout"
  | "transient"
  | "permanent";

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderFailureKind,
    readonly status?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

type StatusCarrier = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
};

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const carrier = error as StatusCarrier;
  const candidate =
    typeof carrier.status === "number"
      ? carrier.status
      : typeof carrier.statusCode === "number"
        ? carrier.statusCode
        : undefined;
  return candidate;
}

export function classifyProviderError(
  error: unknown,
  signal?: AbortSignal,
): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  if (signal?.aborted) {
    return new ProviderRequestError(
      "Provider request was cancelled.",
      "cancelled",
      undefined,
      error,
    );
  }

  const status = errorStatus(error);
  const carrier = (typeof error === "object" && error !== null
    ? error
    : {}) as StatusCarrier;
  const name = typeof carrier.name === "string" ? carrier.name : "";
  const message =
    typeof carrier.message === "string" ? carrier.message : "Provider request failed.";
  const normalized = message.toLowerCase();

  if (
    name === "TimeoutError" ||
    normalized.includes("timeout") ||
    normalized.includes("timed out")
  ) {
    return new ProviderRequestError(message, "timeout", status, error);
  }

  if (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    normalized.includes("econnreset") ||
    normalized.includes("eai_again") ||
    normalized.includes("network")
  ) {
    return new ProviderRequestError(message, "transient", status, error);
  }

  return new ProviderRequestError(message, "permanent", status, error);
}

export function isTransientProviderFailure(error: unknown): boolean {
  const classified = classifyProviderError(error);
  return classified.kind === "transient" || classified.kind === "timeout";
}

export async function waitForProviderBackoff(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw classifyProviderError(new Error("Request cancelled."), signal);
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const onAbort = () => {
      cleanup();
      reject(classifyProviderError(new Error("Request cancelled."), signal));
    };
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runProviderRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: {
    timeoutMs: number;
    signal?: AbortSignal;
    attempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 2_000;
  const sleep = options.sleep ?? waitForProviderBackoff;
  let lastError: ProviderRequestError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw classifyProviderError(new Error("Request cancelled."), options.signal);
    }
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), options.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout.signal])
      : timeout.signal;

    try {
      return await operation(signal);
    } catch (error) {
      const classified =
        timeout.signal.aborted && !options.signal?.aborted
          ? new ProviderRequestError(
              "Provider request timed out.",
              "timeout",
              undefined,
              error,
            )
          : classifyProviderError(error, options.signal);
      lastError = classified;

      if (
        classified.kind === "cancelled" ||
        !isTransientProviderFailure(classified) ||
        attempt === attempts
      ) {
        throw classified;
      }

      const delay = Math.min(
        maxDelayMs,
        initialDelayMs * 2 ** (attempt - 1),
      );
      await sleep(delay, options.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new ProviderRequestError("Provider request failed.", "permanent");
}
