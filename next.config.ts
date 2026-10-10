import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Bank files up to 4 MB (MAX_FILE_BYTES), plus room for the form around them. Vercel
      // functions refuse anything over 4.5 MB.
      bodySizeLimit: "4.25mb",
    },
  },
};

export default nextConfig;
