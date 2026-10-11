import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../tests/db";
import { memberFor } from "@/lib/auth/current";
import type { Db } from "@/lib/db";
import { households, members, users } from "@/lib/db/schema";
import { finishFirstRun, NAME_MAX, resumeAt, saveWelcome, tidyName } from ".";

const ids = {
  home: "00000000-0000-4000-8000-000000000001",
  olive: "00000000-0000-4000-8000-0000000000a1",
  pat: "00000000-0000-4000-8000-0000000000a2",
  oliveUser: "00000000-0000-4000-8000-0000000000c1",
  patUser: "00000000-0000-4000-8000-0000000000c2",
};

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values({ id: ids.home, name: "Our household" });
  await db.insert(users).values([
    { id: ids.oliveUser, name: "Olive", email: "olive@example.com" },
    { id: ids.patUser, name: "Pat", email: "pat@example.com" },
  ]);
  await db.insert(members).values([
    {
      id: ids.olive,
      householdId: ids.home,
      userId: ids.oliveUser,
      role: "owner",
      displayName: "Olive",
      setupStep: "welcome",
    },
    {
      id: ids.pat,
      householdId: ids.home,
      userId: ids.patUser,
      role: "partner",
      displayName: "Pat",
    },
  ]);
});
afterAll(async () => close());

const olive = { userId: ids.oliveUser, memberId: ids.olive, householdId: ids.home, owner: true };

describe("where the first run picks up", () => {
  it("goes back to the step it stopped at", () => {
    expect(resumeAt("welcome", 0)).toBe("welcome");
    expect(resumeAt("bring", 0)).toBe("bring");
  });

  it("moves on to payday once transactions are in, from a file or live sync", () => {
    expect(resumeAt("bring", 482)).toBe("payday");
    // Welcome still comes first, even if something came in some other way.
    expect(resumeAt("welcome", 12)).toBe("welcome");
  });

  it("is finished for anyone with no step saved", () => {
    expect(resumeAt(null, 0)).toBeNull();
    expect(resumeAt(null, 482)).toBeNull();
  });
});

describe("step 1, welcome", () => {
  it("tidies names, and refuses empty or long ones", () => {
    expect(tidyName("  Olive   Jones ")).toBe("Olive Jones");
    expect(tidyName("   ")).toBeNull();
    expect(tidyName("x".repeat(NAME_MAX + 1))).toBeNull();
  });

  it("says which answer needs fixing, and saves nothing", async () => {
    expect(await saveWelcome(db, olive, { name: " ", household: "The Joneses" })).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(await saveWelcome(db, olive, { name: "Olive", household: "" })).toMatchObject({
      ok: false,
      field: "household",
    });
    expect((await memberFor(db, ids.oliveUser))?.member.setupStep).toBe("welcome");
  });

  it("saves the person's name and the household's, then moves on", async () => {
    expect(await saveWelcome(db, olive, { name: "Olive J", household: " The Joneses " })).toEqual({
      ok: true,
    });
    expect(await memberFor(db, ids.oliveUser)).toMatchObject({
      user: { name: "Olive J" },
      member: { displayName: "Olive J", setupStep: "bring" },
      household: { name: "The Joneses" },
    });
  });

  it("can be gone back to, and stays on step 2", async () => {
    await saveWelcome(db, olive, { name: "Olive", household: "The Joneses" });
    expect((await memberFor(db, ids.oliveUser))?.member).toMatchObject({
      displayName: "Olive",
      setupStep: "bring",
    });
  });

  it("only lets the Owner name the household", async () => {
    await db.update(members).set({ setupStep: "welcome" }).where(eq(members.id, ids.pat));
    const pat = { userId: ids.patUser, memberId: ids.pat, householdId: ids.home, owner: false };
    expect(await saveWelcome(db, pat, { name: "Pat", household: "Pat's place" })).toEqual({
      ok: true,
    });
    const [home] = await db.select().from(households).where(eq(households.id, ids.home));
    expect(home.name).toBe("The Joneses");
  });
});

describe("finishing", () => {
  it("leaves setup for good once payday is saved", async () => {
    await finishFirstRun(db, ids.olive);
    expect((await memberFor(db, ids.oliveUser))?.member.setupStep).toBeNull();
    expect(await saveWelcome(db, olive, { name: "Someone else", household: "Elsewhere" })).toEqual({
      ok: false,
      field: null,
      error: "Setup is already finished.",
    });
    expect((await memberFor(db, ids.oliveUser))?.user.name).toBe("Olive");
  });
});
