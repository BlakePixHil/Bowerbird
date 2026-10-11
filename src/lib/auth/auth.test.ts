import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import { fakeAuthenticator } from "../../../tests/fake-authenticator";
import type { Db } from "@/lib/db";
import { STARTING_CATEGORIES } from "@/config/app";
import { categories, households, members, passkeys, sessions } from "@/lib/db/schema";
import { isCronCall } from "./cron";
import { memberFor } from "./current";
import { deviceLabel, passkeyButtonLabel } from "./device";
import { checkRegistration, checkSignIn, registrationOptions, signInOptions } from "./passkeys";
import { relyingParty } from "./relying-party";
import { accessFor, safeNext } from "./routes";
import { createSession, deleteSession, findSession } from "./sessions";
import { createOwner, FIRST_HOUSEHOLD_NAME, hasUsers } from "./setup";
import { hashToken, newToken, seal, unseal } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;

describe("tokens", () => {
  it("are random and only their hash is kept", () => {
    const token = newToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it("seal a value that can't be changed or reused after it expires", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const later = new Date(now.getTime() + 5 * 60_000);
    const sealed = seal({ challenge: "abc" }, "secret", later);
    expect(unseal(sealed, "secret", now)).toEqual({ challenge: "abc" });
    expect(unseal(sealed, "other secret", now)).toBeNull();
    expect(unseal(sealed, "secret", new Date(later.getTime() + 1))).toBeNull();
    const [body, tag] = sealed.split(".");
    const forged = Buffer.from(JSON.stringify({ v: { challenge: "xyz" }, x: later.getTime() }));
    expect(unseal(`${forged.toString("base64url")}.${tag}`, "secret", now)).toBeNull();
    expect(unseal(`${body}.${tag}x`, "secret", now)).toBeNull();
    expect(unseal(undefined, "secret", now)).toBeNull();
    expect(unseal("not sealed", "secret", now)).toBeNull();
  });
});

describe("who may open what", () => {
  it.each([
    ["/", "page"],
    ["/activity", "page"],
    ["/reports/money-in-out", "page"],
    ["/accounts", "page"],
    ["/signing", "page"],
    ["/sign-in", "public"],
    ["/sign-in/email", "public"],
    ["/setup", "public"],
    ["/dev/ui", "public"],
    ["/api/health", "public"],
    ["/api/cron/sync", "public"],
    ["/serwist/sw.js", "public"],
    ["/~offline", "public"],
    ["/serwistful", "page"],
    ["/api/changes", "api"],
    ["/api/sync", "api"],
    ["/api/webauthn", "api"],
    ["/api", "api"],
  ])("%s is %s", (path, access) => {
    expect(accessFor(path)).toBe(access);
  });

  it("only sends you back to pages in this app after signing in", () => {
    expect(safeNext("/activity?q=woolies")).toBe("/activity?q=woolies");
    expect(safeNext("/budgets#plan-vs-reality")).toBe("/budgets#plan-vs-reality");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/api/sync")).toBe("/");
    expect(safeNext("/sign-in")).toBe("/");
  });
});

describe("the daily job's secret", () => {
  const env = { CRON_SECRET: "a-long-random-cron-secret" };

  it("lets in only Vercel Cron's header with the secret", () => {
    expect(isCronCall("Bearer a-long-random-cron-secret", env)).toBe(true);
    expect(isCronCall("Bearer a-long-random-cron-secreT", env)).toBe(false);
    expect(isCronCall("a-long-random-cron-secret", env)).toBe(false);
    expect(isCronCall("Bearer ", env)).toBe(false);
    expect(isCronCall(null, env)).toBe(false);
  });

  it("refuses every call without a long enough secret", () => {
    expect(isCronCall("Bearer ", { CRON_SECRET: "" })).toBe(false);
    expect(isCronCall("Bearer undefined", {})).toBe(false);
    expect(isCronCall("Bearer short", { CRON_SECRET: "short" })).toBe(false);
  });
});

describe("relying party", () => {
  const prod = { APP_URL: "https://bowerbird-xyz.vercel.app", NODE_ENV: "production" };

  it("comes from APP_URL in production, whatever the request says", () => {
    expect(relyingParty("bowerbird-xyz.vercel.app", prod)).toEqual({
      rpID: "bowerbird-xyz.vercel.app",
      origin: "https://bowerbird-xyz.vercel.app",
      rpName: "Bowerbird",
    });
    expect(relyingParty("evil.example", prod).rpID).toBe("bowerbird-xyz.vercel.app");
  });

  it("accepts a preview's own addresses", () => {
    const preview = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "bowerbird-abc123.vercel.app",
      VERCEL_BRANCH_URL: "bowerbird-git-bud-11.vercel.app",
    };
    expect(relyingParty("bowerbird-abc123.vercel.app", preview).origin).toBe(
      "https://bowerbird-abc123.vercel.app",
    );
    expect(relyingParty("bowerbird-git-bud-11.vercel.app", preview).rpID).toBe(
      "bowerbird-git-bud-11.vercel.app",
    );
    expect(relyingParty("evil.example", preview).rpID).toBe("bowerbird-git-bud-11.vercel.app");
  });

  it("accepts any localhost port in development", () => {
    const dev = { APP_URL: "http://localhost:3000", NODE_ENV: "development" };
    expect(relyingParty("localhost:3200", dev)).toMatchObject({
      rpID: "localhost",
      origin: "http://localhost:3200",
    });
    expect(relyingParty("localhost:3200", { ...dev, NODE_ENV: "production" }).origin).toBe(
      "http://localhost:3000",
    );
  });
});

describe("device words", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
  const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  it("names the passkey button after the device's lock", () => {
    expect(passkeyButtonLabel(IPHONE)).toBe("Sign in with Face ID");
    expect(passkeyButtonLabel(MAC)).toBe("Sign in with Touch ID");
    expect(passkeyButtonLabel(ANDROID)).toBe("Sign in with your fingerprint or screen lock");
    expect(passkeyButtonLabel(null)).toBe("Sign in with your fingerprint or screen lock");
  });

  it("labels each passkey with the device it was made on", () => {
    expect(deviceLabel(IPHONE)).toBe("iPhone");
    expect(deviceLabel(MAC)).toBe("Mac");
    expect(deviceLabel(ANDROID)).toBe("Android phone");
    expect(deviceLabel(WINDOWS)).toBe("Windows computer");
    expect(deviceLabel(null)).toBe("This device");
  });
});

describe("with a database", () => {
  let db: Db;
  let close: () => Promise<void>;
  const rp = { rpID: "localhost", origin: "http://localhost:3000", rpName: "Bowerbird" };
  const ownerId = randomUUID();
  const phone = fakeAuthenticator(rp.origin);

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => close());

  it("sets up the first owner with a passkey made on their phone", async () => {
    expect(await hasUsers(db)).toBe(false);
    const options = await registrationOptions(rp, {
      id: ownerId,
      email: "owner@example.com",
      name: "Sam",
    });
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
    const passkey = await checkRegistration(phone.create(options), options.challenge, rp);
    expect(passkey).toMatchObject({ credentialId: phone.credentialId, counter: 0 });

    const created = await createOwner(db, {
      userId: ownerId,
      name: "Sam",
      email: "owner@example.com",
      passkey: passkey!,
      label: "iPhone",
    });
    expect(created).toBe(true);
    expect(await hasUsers(db)).toBe(true);
    expect(await memberFor(db, ownerId)).toMatchObject({
      user: { id: ownerId, name: "Sam" },
      member: { role: "owner", displayName: "Sam" },
      household: { name: FIRST_HOUSEHOLD_NAME },
    });
    const starting = await db.select({ name: categories.name }).from(categories);
    expect(starting.map((c) => c.name).sort()).toEqual(
      STARTING_CATEGORIES.map((c) => c.name).sort(),
    );
  });

  it("closes setup once someone has set up", async () => {
    const stranger = fakeAuthenticator(rp.origin);
    const options = await registrationOptions(rp, {
      id: randomUUID(),
      email: "late@example.com",
      name: "Late",
    });
    const passkey = await checkRegistration(stranger.create(options), options.challenge, rp);
    const created = await createOwner(db, {
      userId: randomUUID(),
      name: "Late",
      email: "late@example.com",
      passkey: passkey!,
      label: "Mac",
    });
    expect(created).toBe(false);
    expect(await db.select().from(households)).toHaveLength(1);
    expect(await db.select().from(members)).toHaveLength(1);
  });

  it("refuses a new passkey made for another challenge or site", async () => {
    const options = await registrationOptions(rp, {
      id: ownerId,
      email: "o@example.com",
      name: "S",
    });
    const laptop = fakeAuthenticator(rp.origin);
    expect(await checkRegistration(laptop.create(options), "another-challenge", rp)).toBeNull();
    const elsewhere = fakeAuthenticator("https://evil.example");
    expect(await checkRegistration(elsewhere.create(options), options.challenge, rp)).toBeNull();
  });

  it("signs in with the passkey and saves its counter", async () => {
    const options = await signInOptions(rp);
    expect(options.userVerification).toBe("required");
    const userId = await checkSignIn(db, phone.get(options), options.challenge, rp);
    expect(userId).toBe(ownerId);
    const [key] = await db.select().from(passkeys).where(eq(passkeys.userId, ownerId));
    expect(key.counter).toBe(1);
    expect(key.lastUsedAt).toBeInstanceOf(Date);
  });

  it("refuses a sign-in that's replayed, for another challenge, or from another site", async () => {
    const options = await signInOptions(rp);
    const answer = phone.get(options);
    expect(await checkSignIn(db, answer, options.challenge, rp)).toBe(ownerId);
    // The same answer again: its counter didn't go up.
    expect(await checkSignIn(db, answer, options.challenge, rp)).toBeNull();

    const fresh = await signInOptions(rp);
    expect(await checkSignIn(db, phone.get(fresh), "old-challenge", rp)).toBeNull();
    expect(
      await checkSignIn(db, phone.get(fresh, "https://evil.example"), fresh.challenge, rp),
    ).toBeNull();
  });

  it("refuses a passkey it doesn't know", async () => {
    const options = await signInOptions(rp);
    const unknown = fakeAuthenticator(rp.origin);
    expect(await checkSignIn(db, unknown.get(options), options.challenge, rp)).toBeNull();
  });

  it("keeps sessions as hashes, renews them in use and ends them on sign out", async () => {
    const start = new Date("2026-10-10T10:00:00Z");
    const { token, expiresAt } = await createSession(db, ownerId, start);
    expect(expiresAt.getTime() - start.getTime()).toBe(30 * DAY);
    const [row] = await db.select().from(sessions).where(eq(sessions.userId, ownerId));
    expect(row.id).toBe(hashToken(token));

    // The next day it's pushed out again.
    const nextDay = new Date(start.getTime() + 1.5 * DAY);
    const renewed = await findSession(db, token, nextDay);
    expect(renewed?.expiresAt.getTime()).toBe(nextDay.getTime() + 30 * DAY);

    expect(await findSession(db, "made-up-token", nextDay)).toBeNull();
    expect(await findSession(db, undefined, nextDay)).toBeNull();
    expect(await findSession(db, token, new Date(nextDay.getTime() + 31 * DAY))).toBeNull();

    await deleteSession(db, token);
    expect(await findSession(db, token, nextDay)).toBeNull();
  });
});
