import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@techstark/opencv-js", "sharp", "pg"],
  outputFileTracingExcludes: {
    "/*": ["./backend/**/*", "./media/**/*", "./.env*"],
  },
};
export default config;
