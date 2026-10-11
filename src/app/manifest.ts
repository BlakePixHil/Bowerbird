import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";
import { PAGE } from "@/styles/colours";

/**
 * The web app manifest, so the app can go on a phone's Home Screen and open full screen with its
 * own icon. The icons come from `pnpm icons`. Dark is the app's default theme, so the splash screen
 * and the title bar start dark; the theme-color tags in the root layout follow the device after.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "All your money in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PAGE.dark,
    theme_color: PAGE.dark,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
