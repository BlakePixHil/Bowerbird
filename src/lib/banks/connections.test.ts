import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import { startMockSimpleFin, type MockSimpleFin } from "../../../tests/simplefin";
import type { Viewer } from "@/lib/access";
import { decryptSecret } from "@/lib/crypto";
import type { Db } from "@/lib/db";
import { connections, households, members, users } from "@/lib/db/schema";
import { connectSimpleFin, NO_KEY, ownConnection } from "./connections";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
};
const olive: Viewer = { memberId: ids.olive, householdId: ids.home };
const pat: Viewer = { memberId: ids.pat, householdId: ids.home };
const key = randomBytes(32);
const env = { ENCRYPTION_KEY: key.toString("base64"), NODE_ENV: "production" };
const local = { allowLocal: true, env };

let db: Db;
let close: () => Promise<void>;
let server: MockSimpleFin;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  server = await startMockSimpleFin();
  await db.insert(households).values({ id: ids.home, name: "Home" });
  const [o, p] = await db
    .insert(users)
    .values([
      { name: "Olive", email: "olive@example.com" },
      { name: "Pat", email: "pat@example.com" },
    ])
    .returning();
  await db.insert(members).values([
    { id: ids.olive, householdId: ids.home, userId: o.id, role: "owner", displayName: "Olive" },
    { id: ids.pat, householdId: ids.home, userId: p.id, role: "partner", displayName: "Pat" },
  ]);
});
afterAll(async () => {
  await server.close();
  await close();
});

describe("connecting live sync", () => {
  it("claims the token and saves only the sealed access link", async () => {
    const result = await connectSimpleFin(db, olive, server.newToken(), local);
    expect(result).toMatchObject({ ok: true, provider: "your sync service" });
    if (!result.ok) return;
    const [row] = await db.select().from(connections);
    expect(row).toMatchObject({
      id: result.connectionId,
      householdId: ids.home,
      memberId: ids.olive,
      kind: "simplefin",
      status: "ok",
    });
    expect(row.secretEncrypted).not.toContain("s3cret");
    expect(decryptSecret(row.secretEncrypted, key)).toBe(server.accessUrl);
  });

  it("saves nothing for a used, bad or private token", async () => {
    const before = (await db.select().from(connections)).length;
    const token = server.newToken();
    await connectSimpleFin(db, olive, token, local);
    const used = await connectSimpleFin(db, olive, token, local);
    expect(used).toMatchObject({ ok: false, problem: "used" });
    expect(await connectSimpleFin(db, olive, "nope", local)).toMatchObject({
      ok: false,
      problem: "not_a_token",
    });
    expect(await connectSimpleFin(db, olive, server.newToken(), { env })).toMatchObject({
      ok: false,
      problem: "not_a_token",
    });
    expect((await db.select().from(connections)).length).toBe(before + 1);
  });

  it("doesn't spend the token when the server has no encryption key", async () => {
    const claims = server.claims;
    const result = await connectSimpleFin(db, olive, server.newToken(), {
      allowLocal: true,
      env: { NODE_ENV: "production" },
    });
    expect(result).toEqual({ ok: false, problem: "not_ready", error: NO_KEY });
    expect(server.claims).toBe(claims);
  });

  it("doesn't spend the token for someone who isn't a member", async () => {
    const claims = server.claims;
    const stranger = { memberId: ids.olive, householdId: "00000000-0000-4000-8000-000000000009" };
    expect(await connectSimpleFin(db, stranger, server.newToken(), local)).toMatchObject({
      ok: false,
    });
    expect(server.claims).toBe(claims);
  });

  it("shows a connection only to the member who made it, without its secret", async () => {
    const result = await connectSimpleFin(db, olive, server.newToken(), local);
    if (!result.ok) throw new Error(result.error);
    const mine = await ownConnection(db, olive, result.connectionId);
    expect(mine).toMatchObject({ id: result.connectionId, kind: "simplefin", status: "ok" });
    expect(mine).not.toHaveProperty("secretEncrypted");
    expect(await ownConnection(db, pat, result.connectionId)).toBeNull();
    expect(await ownConnection(db, olive, "not-an-id")).toBeNull();
  });
});
