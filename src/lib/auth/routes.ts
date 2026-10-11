/**
 * Who may open a path before signing in. Everything is private except the sign-in and setup
 * pages, the email link landing page (under /sign-in), the cron route (it checks its own secret),
 * the health check (it says nothing but ok), the developer pages (never on the live app), and the
 * service worker, its offline page and the goodbye page after deleting a household (the same for
 * everyone, with nothing of anyone's in them).
 */
const PUBLIC = [
  "/sign-in",
  "/setup",
  "/goodbye",
  "/api/cron",
  "/api/health",
  "/dev",
  "/serwist",
  "/~offline",
];

export type Access = "public" | "page" | "api";

export function accessFor(pathname: string): Access {
  if (PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return "public";
  return pathname === "/api" || pathname.startsWith("/api/") ? "api" : "page";
}

/**
 * Where to go after signing in: the page someone was sent away from, as long as it's a page in
 * this app. Anything else goes Home.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return accessFor(next.split(/[?#]/)[0]) === "page" ? next : "/";
}
