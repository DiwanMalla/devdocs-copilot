import { describe, expect, it } from "vitest";
import {
  ProviderRequestError,
  runProviderRequest,
} from "./provider-resilience";

describe("provider resilience", () => {
  it("retries transient failures with bounded exponential backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const result = await runProviderRequest(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new ProviderRequestError("temporary outage", "transient", 503);
        }
        return "ok";
      },
      {
        timeoutMs: 100,
        attempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 15,
        sleep: async (delay) => {
          delays.push(delay);
        },
      },
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([10, 15]);
  });

  it("does not retry permanent failures", async () => {
    let calls = 0;
    await expect(
      runProviderRequest(
        async () => {
          calls += 1;
          throw new ProviderRequestError("bad request", "permanent", 400);
        },
        { timeoutMs: 100, attempts: 3 },
      ),
    ).rejects.toMatchObject({ kind: "permanent", status: 400 });
    expect(calls).toBe(1);
  });

  it("reports a timeout and exhausts bounded retries", async () => {
    let calls = 0;
    await expect(
      runProviderRequest(
        async (signal) => {
          calls += 1;
          return await new Promise<string>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("underlying operation aborted")),
              { once: true },
            );
          });
        },
        {
          timeoutMs: 5,
          attempts: 2,
          initialDelayMs: 0,
          sleep: async () => {},
        },
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(calls).toBe(2);
  });

  it("preserves user cancellation without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    await expect(
      runProviderRequest(
        async () => {
          calls += 1;
          return "never";
        },
        { timeoutMs: 100, signal: controller.signal, attempts: 3 },
      ),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(calls).toBe(0);
  });
});
