import { describe, expect, it } from "vitest";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  createCspRequestHeaders,
  createNonce,
  staticSecurityHeaders,
  supabaseConnectSources,
} from "./headers";

const nonce = "abc123nonce";

describe("supabaseConnectSources", () => {
  it("allows the configured Supabase origin over HTTPS and WSS", () => {
    expect(supabaseConnectSources("https://example.supabase.co")).toEqual([
      "https://example.supabase.co",
      "wss://example.supabase.co",
    ]);
  });

  it("ignores invalid or non-http URLs so they cannot break CSP", () => {
    expect(supabaseConnectSources("not a url")).toEqual([]);
    expect(supabaseConnectSources("javascript:alert(1)")).toEqual([]);
    expect(supabaseConnectSources("https://evil.example; script-src *")).toEqual([]);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("uses a per-request nonce and blocks inline/external script execution", () => {
    const csp = buildContentSecurityPolicy({
      nonce,
      supabaseUrl: "https://example.supabase.co",
      isDev: false,
    });

    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain("frame-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://openrouter.ai https://api.github.com https://example.supabase.co wss://example.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/\n/);
  });

  it("allows React's development eval and local HMR websockets", () => {
    const csp = buildContentSecurityPolicy({
      nonce,
      isDev: true,
    });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("static and applied security headers", () => {
  it("sets clickjacking, MIME sniffing, and referrer protections without CSP", () => {
    const headers = staticSecurityHeaders(true);
    const asMap = Object.fromEntries(headers.map(({ key, value }) => [key, value]));

    expect(asMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(asMap["X-Frame-Options"]).toBe("DENY");
    expect(asMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(asMap["Permissions-Policy"]).toContain("camera=()");
    expect(asMap["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(headers.some((header) => header.key === "Content-Security-Policy")).toBe(
      false,
    );
  });

  it("omits HSTS outside production so localhost HTTP keeps working", () => {
    expect(
      staticSecurityHeaders(false).some(
        (header) => header.key === "Strict-Transport-Security",
      ),
    ).toBe(false);
  });

  it("applies CSP and static headers onto a response", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, {
      nonce,
      supabaseUrl: "https://example.supabase.co",
      isDev: false,
    });

    expect(headers.get("Content-Security-Policy")).toContain(`nonce-${nonce}`);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("forwards the nonce so Next.js can stamp framework scripts", () => {
    const forwarded = createCspRequestHeaders(new Headers({ cookie: "a=1" }), {
      nonce,
      isDev: false,
    });

    expect(forwarded.get("x-nonce")).toBe(nonce);
    expect(forwarded.get("Content-Security-Policy")).toContain(`nonce-${nonce}`);
    expect(forwarded.get("cookie")).toBe("a=1");
  });

  it("creates unique nonces", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
