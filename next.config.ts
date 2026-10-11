import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Bank files up to 4 MB (MAX_FILE_BYTES), plus room for the form around them. Vercel
      // functions refuse anything over 4.5 MB.
      bodySizeLimit: "4.25mb",
    },
  },
  async headers() {
    return [
      {
        // The service worker (src/app/sw.ts) lives under /serwist but looks after the whole app.
        // Browsers check for a new one on every visit, so it's never cached.
        source: "/serwist/:path*",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

// Serwist builds the service worker with esbuild, which stays out of the server bundle.
export default withSerwist(nextConfig);
