import type { NextConfig } from "next";
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { proxyClientMaxBodySize: "12mb" },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};
export default config;
