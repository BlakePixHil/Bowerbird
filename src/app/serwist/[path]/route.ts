import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";
import { OFFLINE_PAGE } from "@/components/offline/caching";

/**
 * Builds the service worker from src/app/sw.ts with esbuild when the app is built, and serves it
 * as /serwist/sw.js, a static file. It precaches everything under .next/static (the app's code,
 * styles and fonts), public/ (the icons) and the offline page, which changes with every build.
 */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    globPatterns: [".next/static/**/*.{js,css,woff2,png,svg,ico,webmanifest}", "public/**/*"],
    additionalPrecacheEntries: [
      { url: OFFLINE_PAGE, revision: process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID() },
    ],
  },
);
