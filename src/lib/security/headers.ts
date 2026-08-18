export type SecurityHeaderContext = {
  nonce: string;
  supabaseUrl?: string;
  isDev: boolean;
};

export type NextConfigHeader = {
  key: string;
  value: string;
};

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

const HSTS_VALUE = "max-age=31536000; includeSubDomains; preload";

const BROWSER_CONNECT_SOURCES = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://api.openai.com",
  "https://openrouter.ai",
  "https://api.github.com",
] as const;

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function supabaseConnectSources(supabaseUrl?: string): string[] {
  if (!supabaseUrl || supabaseUrl.trim().length === 0) {
    return [];
  }

  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return [];
    }

    const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    const wsOrigin = `${wsProtocol}//${parsed.host}`;
    return [parsed.origin, wsOrigin].filter((origin) =>
      /^https?:\/\/[^;,\s]+$/i.test(origin) || /^wss?:\/\/[^;,\s]+$/i.test(origin),
    );
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy({
  nonce,
  supabaseUrl,
  isDev,
}: SecurityHeaderContext): string {
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
  }

  const connectSrc = [
    ...BROWSER_CONNECT_SOURCES,
    ...supabaseConnectSources(supabaseUrl),
  ];
  if (isDev) {
    connectSrc.push("ws:", "wss:");
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${[...new Set(connectSrc)].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function staticSecurityHeaders(isProduction: boolean): NextConfigHeader[] {
  const headers: NextConfigHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];

  if (isProduction) {
    headers.push({ key: "Strict-Transport-Security", value: HSTS_VALUE });
  }

  return headers;
}

export function applySecurityHeaders(
  headers: Headers,
  context: SecurityHeaderContext,
): void {
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(context));

  for (const { key, value } of staticSecurityHeaders(!context.isDev)) {
    headers.set(key, value);
  }
}

export function createCspRequestHeaders(
  requestHeaders: Headers,
  context: SecurityHeaderContext,
): Headers {
  const forwarded = new Headers(requestHeaders);
  const csp = buildContentSecurityPolicy(context);
  forwarded.set("x-nonce", context.nonce);
  forwarded.set("Content-Security-Policy", csp);
  return forwarded;
}
