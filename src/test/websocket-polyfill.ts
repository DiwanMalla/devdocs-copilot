/**
 * supabase-js initializes Realtime at client construction and requires a
 * WebSocket constructor. Node 20 does not expose a global WebSocket.
 */
if (typeof globalThis.WebSocket === "undefined") {
  class TestWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly readyState = TestWebSocket.CLOSED;
    close(): void {}
    send(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false;
    }
  }

  Object.defineProperty(globalThis, "WebSocket", {
    value: TestWebSocket,
    configurable: true,
    writable: true,
  });
}
