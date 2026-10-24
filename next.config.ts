import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Name + number plate font for server-built gang sheets (lib/server/render.ts).
  outputFileTracingIncludes: {
    "/api/data": ["./lib/server/fonts/**"],
    "/api/production/send": ["./lib/server/fonts/**"],
  },
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

export default nextConfig;
