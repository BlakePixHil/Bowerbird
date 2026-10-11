import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/db";
import { APP_NAME } from "@/config/app";
import { appLinkMessage, sendAppLinkEmail } from "@/lib/auth/mail";
import type { Db } from "@/lib/db";
import { households, members, users } from "@/lib/db/schema";
import {
  noteInstalled,
  noteInstallPromptDone,
  showsInstallPrompt,
  takeAppLinkTurn,
} from "./install";

const at = (iso: string) => new Date(iso);

describe("installing the app, for each person", () => {
  let db: Db;
  let close: () => Promise<void>;
  const memberId = randomUUID();
  const row = async () => (await db.select().from(members).where(eq(members.id, memberId)))[0];

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    const [user] = await db
      .insert(users)
      .values({ name: "Olive", email: "olive@example.com" })
      .returning();
    const [home] = await db.insert(households).values({ name: "Home" }).returning();
    await db.insert(members).values({
      id: memberId,
      householdId: home.id,
      userId: user.id,
      role: "owner",
      displayName: "Olive",
    });
  });
  afterAll(async () => close());

  it("keeps the first time they opened the installed app", async () => {
    expect((await row()).installedAt).toBeNull();
    await noteInstalled(db, memberId, at("2026-10-11T01:00:00Z"));
    await noteInstalled(db, memberId, at("2026-10-12T01:00:00Z"));
    expect((await row()).installedAt).toEqual(at("2026-10-11T01:00:00Z"));
  });

  it("keeps when Home's prompt was closed", async () => {
    await noteInstallPromptDone(db, memberId, at("2026-10-11T02:00:00Z"));
    await noteInstallPromptDone(db, memberId, at("2026-10-13T02:00:00Z"));
    expect((await row()).installPromptDoneAt).toEqual(at("2026-10-11T02:00:00Z"));
  });

  it("emails the app's address at most once a minute", async () => {
    expect(await takeAppLinkTurn(db, memberId, at("2026-10-11T03:00:00Z"))).toBe(true);
    expect(await takeAppLinkTurn(db, memberId, at("2026-10-11T03:00:30Z"))).toBe(false);
    expect(await takeAppLinkTurn(db, memberId, at("2026-10-11T03:01:01Z"))).toBe(true);
    expect(await takeAppLinkTurn(db, randomUUID(), at("2026-10-11T03:05:00Z"))).toBe(false);
  });
});

describe("Home's prompt to install the app", () => {
  const joinedAt = at("2026-10-01T00:00:00Z");
  const fresh = { joinedAt, installedAt: null, installPromptDoneAt: null };

  it("waits for the first week to be up", () => {
    expect(showsInstallPrompt(fresh, at("2026-10-07T23:59:00Z"))).toBe(false);
    expect(showsInstallPrompt(fresh, at("2026-10-08T00:00:00Z"))).toBe(true);
  });

  it("never shows once it's done or the app is installed", () => {
    const later = at("2026-10-20T00:00:00Z");
    expect(showsInstallPrompt({ ...fresh, installPromptDoneAt: joinedAt }, later)).toBe(false);
    expect(showsInstallPrompt({ ...fresh, installedAt: joinedAt }, later)).toBe(false);
  });
});

describe("the email with the app's address", () => {
  const url = "https://bowerbird.example/install";

  it("is short, plain and has one button", () => {
    const message = appLinkMessage({ name: "Sam <b>Lee</b>", url });
    expect(message.subject).toBe(`Open ${APP_NAME} on your phone`);
    expect(message.text).toContain(url);
    expect(message.html).toContain(`href="${url}"`);
    expect(message.html.match(/<a /g)).toHaveLength(1);
    expect(message.html).toContain("Hi Sam,");
    expect(appLinkMessage({ name: "<script>", url }).html).not.toContain("<script>");
  });

  it("goes through the SMTP server", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(transport, "sendMail");
    const sent = await sendAppLinkEmail(
      "sam@example.com",
      { name: "Sam", url },
      { smtp: { from: `${APP_NAME} <me@example.com>`, transport } },
    );
    expect(sent).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com", subject: `Open ${APP_NAME} on your phone` }),
    );
  });
});
