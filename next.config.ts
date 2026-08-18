import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security/headers";

const securityHeaders = staticSecurityHeaders(
  process.env.NODE_ENV === "production",
);

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/",
        headers: securityHeaders,
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
