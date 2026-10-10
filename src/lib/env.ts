/**
 * The app's public address, used in sign-in links and as the passkey domain.
 * Production sets APP_URL. Vercel previews work out their own address, and local development
 * falls back to localhost.
 */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  if (env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL)
    return `https://${env.VERCEL_BRANCH_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Developer pages such as /dev/ui show on your own computer and on Vercel previews, never on the
 * live app.
 */
export function devPagesAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" || env.VERCEL_ENV === "preview";
}
