import { isIP } from "node:net";

/**
 * Requests to a SimpleFIN server. The claim and access links come from a pasted token, so every
 * request checks where it's going: HTTPS only, never this machine or a private network, and the
 * same check again after each redirect. Bodies are capped and every request has a time limit.
 */

export type HttpOptions = {
  /** Lets tests use a server on this machine over plain HTTP. Never set it in the app. */
  allowLocal?: boolean;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
};

export class UnsafeUrlError extends Error {
  constructor() {
    super("That link can't be used");
    this.name = "UnsafeUrlError";
  }
}

const MAX_REDIRECTS = 3;

function privateIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function privateIpv6(ip: string): boolean {
  const text = ip.toLowerCase();
  if (text === "::" || text === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (mapped) return privateIpv4(mapped[1]);
  if (text.startsWith("::ffff:")) return true;
  return /^(fc|fd|fe[89ab]|ff)/.test(text);
}

/**
 * True for this machine, a private network, or a name that only works inside one. Names are
 * checked as written, not looked up: the token comes from a signed-in member, so this stops
 * mistakes and simple tricks rather than a name that resolves to a private address.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/\.(local|internal|lan|home|corp)$/.test(host) || !host.includes(".")) {
    if (isIP(host) !== 6) return true;
  }
  if (isIP(host) === 4) return privateIpv4(host);
  if (isIP(host) === 6) return privateIpv6(host);
  return false;
}

/** Parses a link and checks it's safe to send a request to. Throws UnsafeUrlError if not. */
export function remoteUrl(text: string, options: HttpOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UnsafeUrlError();
  }
  const local = options.allowLocal === true;
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new UnsafeUrlError();
  if (!local && isPrivateHost(url.hostname)) throw new UnsafeUrlError();
  return url;
}

/**
 * Sends a request, following up to three redirects with the same method, and checking each new
 * address. The URL must not carry credentials; pass them in an Authorization header instead.
 */
export async function safeRequest(
  url: URL,
  init: RequestInit & { timeoutMs: number },
  options: HttpOptions = {},
): Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  const { timeoutMs, ...rest } = init;
  const signal = AbortSignal.timeout(timeoutMs);
  let target = url;
  for (let hop = 0; ; hop++) {
    const response = await doFetch(target, { ...rest, redirect: "manual", signal });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError();
    await response.body?.cancel();
    const next = remoteUrl(new URL(location, target).href, options);
    // Credentials only ever go to the host they were issued for.
    if (next.origin !== target.origin && new Headers(rest.headers).has("authorization"))
      throw new UnsafeUrlError();
    target = next;
  }
}

export class TooBigError extends Error {
  constructor() {
    super("The answer was too big");
    this.name = "TooBigError";
  }
}

/** Reads a response body as text, stopping with TooBigError past `maxBytes`. */
export async function readText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new TooBigError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new TooBigError();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
