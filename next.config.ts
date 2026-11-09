import { createJiti } from "jiti";
import type { NextConfig } from "next";

const jiti = createJiti(import.meta.url);

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  poweredByHeader: false,
  // 🔍 Verify against docs: typedRoutes is stable in Next 16? If so:
  typedRoutes: true,
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Validate environment variables without top-level await.
void jiti.import("./src/libs/Env").catch((error) => {
  console.error("Environment validation failed:", error);
  process.exit(1);
});

export default nextConfig;
