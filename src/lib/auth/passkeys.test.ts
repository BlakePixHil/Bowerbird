import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { passkeys, users } from "@/lib/db/schema";
import { passkeyList, removePasskey } from "./passkeys";

let db: Db;
let close: () => Promise<void>;
let olive: string;
let pat: string;

const key = (userId: string, n: number, label: string) => ({
  userId,
  credentialId: `cred-${userId}-${n}`,
  publicKey: "pk",
  label,
  createdAt: new Date(Date.UTC(2026, 9, n)),
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [o, p] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
    ])
    .returning();
  olive = o.id;
  pat = p.id;
  await db
    .insert(passkeys)
    .values([key(olive, 1, "iPhone"), key(olive, 2, "Mac"), key(pat, 3, "Android phone")]);
});

afterAll(async () => {
  await close();
});

describe("removePasskey", () => {
  it("removes one of your passkeys while another is left", async () => {
    const [iphone, mac] = await passkeyList(db, olive);
    expect(await removePasskey(db, olive, iphone.id)).toEqual({ ok: true });
    expect((await passkeyList(db, olive)).map((k) => k.id)).toEqual([mac.id]);
  });

  it("keeps your last passkey, so you can still sign in", async () => {
    const [mac] = await passkeyList(db, olive);
    expect(await removePasskey(db, olive, mac.id)).toEqual({
      ok: false,
      error: "That's your only passkey, so it stays. Add one on another device first.",
    });
    expect(await passkeyList(db, olive)).toHaveLength(1);
  });

  it("can't remove someone else's passkey", async () => {
    const [android] = await passkeyList(db, pat);
    await db.insert(passkeys).values(key(pat, 4, "Laptop"));
    expect(await removePasskey(db, olive, android.id)).toEqual({
      ok: false,
      error: "That passkey is already gone.",
    });
    expect(await passkeyList(db, pat)).toHaveLength(2);
  });
});
