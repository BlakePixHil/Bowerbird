import { APP_NAME } from "@/config/app";
import { appUrl } from "@/lib/env";

type Env = Record<string, string | undefined>;

/** Who passkeys belong to: the site's domain (the relying party id), its origin and its name. */
export type RelyingParty = { rpID: string; origin: string; rpName: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * The relying party for a request. In production it always comes from APP_URL. A Vercel preview
 * also accepts its own deployment and branch addresses, and local development any localhost port,
 * so passkeys work there too. Any other host gets APP_URL's, and the browser refuses the mismatch.
 */
export function relyingParty(requestHost: string | null, env: Env = process.env): RelyingParty {
  const base = new URL(appUrl(env));
  const allowed = new Set([base.host]);
  if (env.VERCEL_ENV === "preview") {
    if (env.VERCEL_URL) allowed.add(env.VERCEL_URL);
    if (env.VERCEL_BRANCH_URL) allowed.add(env.VERCEL_BRANCH_URL);
  }
  let origin = base.origin;
  if (requestHost && requestHost !== base.host) {
    const local = env.NODE_ENV === "development" && LOCAL_HOSTS.has(requestHost.split(":")[0]);
    if (local) origin = `http://${requestHost}`;
    else if (allowed.has(requestHost)) origin = `https://${requestHost}`;
  }
  return { rpID: new URL(origin).hostname, origin, rpName: APP_NAME };
}
