import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Secrets at rest (SimpleFIN access links, CoinSpot keys, Claude keys) are sealed with AES-256-GCM
 * using ENCRYPTION_KEY. Decrypt them only on the server, and only when they're used.
 *
 * A sealed secret is `v1.` then base64url of the 12-byte nonce, the 16-byte tag and the ciphertext.
 */

const VERSION = "v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Thrown when ENCRYPTION_KEY is missing or isn't 32 bytes of base64. Says nothing about the key. */
export class EncryptionKeyError extends Error {
  constructor(reason: string) {
    super(`ENCRYPTION_KEY ${reason}`);
    this.name = "EncryptionKeyError";
  }
}

/** Thrown when a sealed secret can't be opened: the wrong key, or a changed or cut-off value. */
export class DecryptError extends Error {
  constructor() {
    super("The secret couldn't be decrypted");
    this.name = "DecryptError";
  }
}

// A fixed stand-in for your own computer and tests, so no one needs a key to run the app locally.
const LOCAL_KEY = Buffer.alloc(32, "bowerbird-local-development-only");

/**
 * The 32-byte key from ENCRYPTION_KEY (base64, from `openssl rand -base64 32`). Production and
 * previews must set it; local development and tests get a fixed stand-in.
 */
export function encryptionKey(env: Record<string, string | undefined> = process.env): Buffer {
  const text = env.ENCRYPTION_KEY?.trim();
  if (!text) {
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return LOCAL_KEY;
    throw new EncryptionKeyError("is not set");
  }
  const key = Buffer.from(text, "base64");
  if (key.length !== 32) throw new EncryptionKeyError("must be 32 bytes, base64");
  return key;
}

/** True when secrets can be sealed here, so a one-time token isn't spent on a server without a key. */
export function canEncrypt(env: Record<string, string | undefined> = process.env): boolean {
  try {
    encryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

/** Seals a secret. Each call uses a new random nonce, so the same secret never seals the same way. */
export function encryptSecret(plain: string, key: Buffer = encryptionKey()): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const sealed = Buffer.concat([nonce, cipher.getAuthTag(), body]);
  return `${VERSION}.${sealed.toString("base64url")}`;
}

/** Opens a sealed secret, or throws DecryptError if the key is wrong or the value was changed. */
export function decryptSecret(sealed: string, key: Buffer = encryptionKey()): string {
  const [version, data, extra] = sealed.split(".");
  if (version !== VERSION || !data || extra !== undefined) throw new DecryptError();
  const bytes = Buffer.from(data, "base64url");
  if (bytes.length < NONCE_BYTES + TAG_BYTES) throw new DecryptError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, NONCE_BYTES));
    decipher.setAuthTag(bytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
    const body = bytes.subarray(NONCE_BYTES + TAG_BYTES);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptError();
  }
}
