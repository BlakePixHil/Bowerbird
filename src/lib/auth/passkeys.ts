import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { passkeys, users } from "@/lib/db/schema";
import type { RelyingParty } from "./relying-party";

export type { AuthenticationResponseJSON, RegistrationResponseJSON };

/** A checked new passkey, ready to save. */
export type NewPasskey = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
};

/** A user's id as the 16 bytes passkeys store. Our user ids are UUIDs. */
function uuidBytes(id: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(id.replace(/-/g, ""), "hex"));
}

/**
 * What the browser needs to make a new passkey. It must be a discoverable passkey that checks it's
 * you (Face ID, a fingerprint or the screen lock), so signing in never needs a name or password.
 */
export function registrationOptions(
  rp: RelyingParty,
  user: { id: string; email: string; name: string },
  existing: { credentialId: string; transports: string[] }[] = [],
) {
  return generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userID: uuidBytes(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((key) => ({
      id: key.credentialId,
      transports: key.transports,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
}

/** Checks the browser's new passkey against the challenge. Returns null when it doesn't hold up. */
export async function checkRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  rp: RelyingParty,
): Promise<NewPasskey | null> {
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
    if (!result.verified) return null;
    const { credential } = result.registrationInfo;
    return {
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? response.response.transports ?? [],
    };
  } catch {
    return null;
  }
}

/** What the browser needs to sign in with any passkey it holds for this site. */
export function signInOptions(rp: RelyingParty) {
  return generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" });
}

/**
 * Checks a sign-in against the saved passkey, including its signature counter, which must go up
 * each time unless the authenticator doesn't keep one. Saves the new counter and returns the
 * passkey's user, or null when the sign-in doesn't hold up.
 */
export async function checkSignIn(
  db: Db,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  rp: RelyingParty,
  now = new Date(),
): Promise<string | null> {
  const [key] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id));
  if (!key) return null;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: key.credentialId,
        publicKey: isoBase64URL.toBuffer(key.publicKey),
        counter: key.counter,
        transports: key.transports,
      },
      requireUserVerification: true,
    });
    if (!result.verified) return null;
    await db
      .update(passkeys)
      .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: now })
      .where(eq(passkeys.id, key.id));
    return key.userId;
  } catch {
    return null;
  }
}

/** Saves another passkey for a user who's already signed in, such as their laptop. */
export async function savePasskey(db: Db, userId: string, key: NewPasskey, label: string) {
  await db.insert(passkeys).values({ userId, label, ...key, lastUsedAt: new Date() });
}

/** A user's passkeys, so a new one isn't made twice on the same device. */
export function passkeysFor(db: Db, userId: string) {
  return db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
}

/** The passkeys listed in Accounts and sharing, oldest first. */
export function passkeyList(db: Db, userId: string) {
  return db
    .select({
      id: passkeys.id,
      label: passkeys.label,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(asc(passkeys.createdAt));
}

export type PasskeyRemoved = { ok: true } | { ok: false; error: string };

/**
 * Removes one of a user's passkeys, such as one on a phone they no longer have. The last one
 * stays, so there's always a way to sign in. The user's row is locked while it counts, so two
 * removals at once can't take both of the last two.
 */
export async function removePasskey(db: Db, userId: string, id: string): Promise<PasskeyRemoved> {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const keys = await tx
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
    if (!keys.some((key) => key.id === id))
      return { ok: false, error: "That passkey is already gone." };
    if (keys.length === 1)
      return {
        ok: false,
        error: "That's your only passkey, so it stays. Add one on another device first.",
      };
    await tx.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)));
    return { ok: true };
  });
}
