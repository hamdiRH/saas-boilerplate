import { createJiti } from "jiti";
import type { NextConfig } from "next";

const jiti = createJiti(import.meta.url);

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    agentFeedback: true,
  },
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        as: "*.css",
        loaders: ["@tailwindcss/turbopack"],
      },
    },
  },
  typedRoutes: true,
};

// Validate environment variables without top-level await.
const validateEnvironment = async (): Promise<void> => {
  try {
    await jiti.import("./src/libs/env");
  } catch (error) {
    console.error("Environment validation failed:", error);
    process.exit(1);
  }
};

void validateEnvironment();

export default nextConfig;
