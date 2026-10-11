/**
 * Checking a SimpleFIN setup token before it's used. Safe to run in the browser: it only decodes
 * the token and never sends it anywhere.
 *
 * A setup token is a claim link in base64. The app POSTs to that link once and gets back an access
 * link, which is the only thing it keeps.
 */

export const NOT_A_TOKEN =
  "That doesn't look like a setup token. Copy the whole token from Redbark and paste it again.";

export type TokenCheck =
  | {
      ok: true;
      /** The decoded claim link. A secret until it's used: never log it or show it. */
      claimUrl: string;
      /** Who issued it, for messages: "Redbark", or "your sync service" for any other provider. */
      provider: string;
      /** The last four characters, to show a masked token: "•••• 7Q2F". */
      last4: string;
    }
  | { ok: false; error: string };

/** Turns pasted text into a token: spaces, line breaks and quotes from copying are dropped. */
export function cleanToken(text: string): string {
  return text.replace(/[\s"'`]+/g, "");
}

/** Who a claim or access link belongs to, for messages. Never the link itself. */
export function providerName(url: URL): string {
  return url.hostname.toLowerCase().includes("redbark") ? "Redbark" : "your sync service";
}

function decodeBase64(text: string): string | null {
  const standard = text.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(standard)) return null;
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

/** Decodes a pasted setup token and checks it holds a claim link. */
export function checkSetupToken(text: string): TokenCheck {
  const token = cleanToken(text);
  // A claim link is at least "https://a.b/c", so its base64 is at least 16 characters.
  if (token.length < 16 || token.length > 2048) return { ok: false, error: NOT_A_TOKEN };
  const decoded = decodeBase64(token);
  if (!decoded || !/^https?:\/\/[^\s]+$/i.test(decoded)) return { ok: false, error: NOT_A_TOKEN };
  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    return { ok: false, error: NOT_A_TOKEN };
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost" && !url.hostname.startsWith("["))
    return { ok: false, error: NOT_A_TOKEN };
  return {
    ok: true,
    claimUrl: url.href,
    provider: providerName(url),
    last4: token.replace(/=+$/, "").slice(-4),
  };
}
