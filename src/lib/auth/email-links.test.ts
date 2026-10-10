import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../tests/db";
import type { Db } from "@/lib/db";
import { emailLinks, users } from "@/lib/db/schema";
import { smtpSettings } from "@/lib/env";
import { cleanEmail, createEmailLink, redeemEmailLink } from "./email-links";
import { sendSignInEmail, signInMessage } from "./mail";
import { hashToken } from "./tokens";

const MINUTE = 60_000;
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MINUTE);

describe("email addresses", () => {
  it("are tidied to lower case, or turned away", () => {
    expect(cleanEmail("  Sam@Example.COM ")).toBe("sam@example.com");
    expect(cleanEmail("sam@example")).toBeNull();
    expect(cleanEmail("not an email")).toBeNull();
    expect(cleanEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});

describe("sign-in links", () => {
  let db: Db;
  let close: () => Promise<void>;
  const samId = randomUUID();
  const start = new Date("2026-10-10T10:00:00Z");
  let minute = 0;
  /** Each link gets its own minute, so "newest" is never a tie. */
  const tick = () => at(start, (minute += 1));

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(users).values({ id: samId, name: "Sam Lee", email: "Sam@Example.com" });
  });
  afterAll(async () => close());

  async function makeLink(now: Date) {
    const link = await createEmailLink(db, "sam@example.com", now);
    if (link.kind !== "made") throw new Error(`expected a link, got ${link.kind}`);
    return link.token;
  }

  it("aren't made for an email that isn't a member", async () => {
    expect(await createEmailLink(db, "stranger@example.com", start)).toEqual({ kind: "unknown" });
    expect(await db.select().from(emailLinks)).toHaveLength(0);
  });

  it("keep only the token's hash, and work once", async () => {
    const now = tick();
    const link = await createEmailLink(db, "sam@example.com", now);
    expect(link).toMatchObject({ kind: "made", name: "Sam Lee" });
    const token = link.kind === "made" ? link.token : "";
    const [row] = await db.select().from(emailLinks);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expiresAt.getTime() - now.getTime()).toBe(15 * MINUTE);

    expect(await redeemEmailLink(db, token, at(now, 1))).toBe(samId);
    expect(await redeemEmailLink(db, token, at(now, 2))).toBeNull();
  });

  it("stop working after 15 minutes", async () => {
    const now = tick();
    const token = await makeLink(now);
    expect(await redeemEmailLink(db, token, at(now, 15))).toBeNull();
  });

  it("stop working once a newer one is sent", async () => {
    minute += 20; // Out of the last test's sending window.
    const older = await makeLink(tick());
    const newer = await makeLink(tick());
    expect(await redeemEmailLink(db, older, at(start, minute + 1))).toBeNull();
    expect(await redeemEmailLink(db, newer, at(start, minute + 1))).toBe(samId);
    // Using the newest one doesn't bring the older one back.
    expect(await redeemEmailLink(db, older, at(start, minute + 2))).toBeNull();
  });

  it("can't be used twice at the same moment", async () => {
    minute += 20;
    const token = await makeLink(tick());
    const now = at(start, minute + 1);
    const results = await Promise.all([
      redeemEmailLink(db, token, now),
      redeemEmailLink(db, token, now),
    ]);
    expect(results.filter(Boolean)).toEqual([samId]);
  });

  it("refuse made-up and missing tokens", async () => {
    expect(await redeemEmailLink(db, "made-up", start)).toBeNull();
    expect(await redeemEmailLink(db, undefined, start)).toBeNull();
    expect(await redeemEmailLink(db, "", start)).toBeNull();
  });

  it("are sent at most 3 times in 15 minutes", async () => {
    minute += 20;
    const first = tick();
    await makeLink(first);
    await makeLink(tick());
    await makeLink(tick());
    expect(await createEmailLink(db, "sam@example.com", tick())).toEqual({ kind: "limited" });
    // 15 minutes after the first, there's room for one more.
    expect((await createEmailLink(db, "sam@example.com", at(first, 15))).kind).toBe("made");
  });

  it("are cleared away after a day", async () => {
    await makeLink(at(start, 2 * 24 * 60));
    const rows = await db.select().from(emailLinks);
    expect(rows).toHaveLength(1);
  });
});

describe("the sign-in email", () => {
  const url = "https://bowerbird.example/sign-in/email#t=abc123";

  afterEach(() => vi.restoreAllMocks());

  it("is short, plain and has one button", () => {
    const message = signInMessage({ name: "Sam <b>Lee</b>", url });
    expect(message.subject).toBe("Your Bowerbird sign-in link");
    expect(message.text).toContain(url);
    expect(message.text).toContain("It lasts 15 minutes and works once.");
    expect(message.html).toContain(`href="${url}"`);
    expect(message.html.match(/<a /g)).toHaveLength(1);
    expect(message.html).toContain("Sign in to Bowerbird");
    // Names are escaped in the HTML.
    expect(message.html).toContain("Hi Sam,");
    expect(signInMessage({ name: "<script>", url }).html).not.toContain("<script>");
  });

  it("goes through the SMTP server", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(transport, "sendMail");
    const sent = await sendSignInEmail(
      "sam@example.com",
      { name: "Sam", url },
      { smtp: { from: "Bowerbird <me@example.com>", transport } },
    );
    expect(sent).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Bowerbird <me@example.com>",
        to: "sam@example.com",
        subject: "Your Bowerbird sign-in link",
      }),
    );
  });

  it("logs nothing about the link when sending fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = nodemailer.createTransport({ jsonTransport: true });
    vi.spyOn(transport, "sendMail").mockRejectedValue(
      Object.assign(new Error(`could not send ${url}`), { code: "EAUTH", responseCode: 535 }),
    );
    const sent = await sendSignInEmail(
      "sam@example.com",
      { name: "Sam", url },
      { smtp: { from: "me@example.com", transport } },
    );
    expect(sent).toBe(false);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("EAUTH");
    expect(logged).not.toContain("abc123");
    expect(logged).not.toContain("sam@example.com");
  });

  it("isn't sent without SMTP settings on the live app", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent = await sendSignInEmail(
      "sam@example.com",
      { name: "Sam", url },
      { env: { NODE_ENV: "production" } },
    );
    expect(sent).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain("abc123");
  });

  it("prints the link instead on your own computer when SMTP isn't set", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const sent = await sendSignInEmail(
      "sam@example.com",
      { name: "Sam", url },
      { env: { NODE_ENV: "development" } },
    );
    expect(sent).toBe(true);
    expect(info.mock.calls[0][0]).toContain(url);
  });

  it("reads the SMTP settings", () => {
    expect(smtpSettings({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "me@gmail.com" })).toBeNull();
    expect(
      smtpSettings({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "me@gmail.com", SMTP_PASS: "x" }),
    ).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      user: "me@gmail.com",
      pass: "x",
      from: "Bowerbird <me@gmail.com>",
    });
    expect(
      smtpSettings({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "me",
        SMTP_PASS: "x",
        SMTP_FROM: "Us <us@example.com>",
      }),
    ).toMatchObject({ port: 587, from: "Us <us@example.com>" });
  });
});
