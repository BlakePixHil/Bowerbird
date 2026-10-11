import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canEncrypt,
  decryptSecret,
  DecryptError,
  encryptionKey,
  EncryptionKeyError,
  encryptSecret,
} from ".";

const key = randomBytes(32);
const secret = "https://user:pass@bridge.example/simplefin";

describe("secrets at rest", () => {
  it("seals and opens a secret", () => {
    const sealed = encryptSecret(secret, key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("pass");
    expect(decryptSecret(sealed, key)).toBe(secret);
  });

  it("never seals the same secret the same way twice", () => {
    expect(encryptSecret(secret, key)).not.toBe(encryptSecret(secret, key));
  });

  it("refuses the wrong key and changed values", () => {
    const sealed = encryptSecret(secret, key);
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow(DecryptError);
    // Change the second-to-last character, which is all ciphertext (the last can be part padding).
    const flipped = sealed.slice(0, -2) + (sealed.at(-2) === "A" ? "B" : "A") + sealed.slice(-1);
    expect(() => decryptSecret(flipped, key)).toThrow(DecryptError);
    expect(() => decryptSecret(sealed.slice(0, 20), key)).toThrow(DecryptError);
    expect(() => decryptSecret("v2." + sealed.slice(3), key)).toThrow(DecryptError);
    expect(() => decryptSecret("not sealed", key)).toThrow(DecryptError);
  });

  it("reads ENCRYPTION_KEY as 32 bytes of base64", () => {
    const text = key.toString("base64");
    expect(encryptionKey({ ENCRYPTION_KEY: text, NODE_ENV: "production" }).equals(key)).toBe(true);
    expect(() => encryptionKey({ ENCRYPTION_KEY: "c2hvcnQ=", NODE_ENV: "production" })).toThrow(
      EncryptionKeyError,
    );
    expect(() => encryptionKey({ NODE_ENV: "production" })).toThrow(EncryptionKeyError);
    expect(encryptionKey({ NODE_ENV: "test" })).toHaveLength(32);
    expect(canEncrypt({ NODE_ENV: "production" })).toBe(false);
    expect(canEncrypt({ ENCRYPTION_KEY: text, NODE_ENV: "production" })).toBe(true);
  });

  it("never puts the key in its error message", () => {
    try {
      encryptionKey({ ENCRYPTION_KEY: "c2VjcmV0LWtleQ==", NODE_ENV: "production" });
    } catch (error) {
      expect(String(error)).not.toContain("c2VjcmV0LWtleQ==");
    }
  });
});
