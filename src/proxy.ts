import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applySecurityHeaders,
  createCspRequestHeaders,
  createNonce,
  type SecurityHeaderContext,
} from "@/lib/security/headers";

function securityContext(): SecurityHeaderContext {
  return {
    nonce: createNonce(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV !== "production",
  };
}

function nextWithSecurity(request: NextRequest, context: SecurityHeaderContext) {
  const requestHeaders = createCspRequestHeaders(request.headers, context);
  const cookie = request.cookies
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  if (cookie.length > 0) {
    requestHeaders.set("cookie", cookie);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  applySecurityHeaders(response.headers, context);
  return response;
}

function redirectWithSecurity(
  url: URL,
  context: SecurityHeaderContext,
): NextResponse {
  const response = NextResponse.redirect(url);
  applySecurityHeaders(response.headers, context);
  return response;
}

export async function proxy(request: NextRequest) {
  const context = securityContext();
  let supabaseResponse = nextWithSecurity(request, context);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = nextWithSecurity(request, context);
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/login" ||
    path === "/demo" ||
    path.startsWith("/auth/") ||
    path === "/favicon.ico";
  const isApi = path.startsWith("/api/");

  if (!user && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return redirectWithSecurity(redirectUrl, context);
  }

  if (user && path === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return redirectWithSecurity(redirectUrl, context);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
