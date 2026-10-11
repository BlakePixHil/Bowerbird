import { describe, expect, it } from "vitest";
import {
  consentLine,
  namesList,
  syncWarning,
  type BankHealth,
  type ConnectionHealth,
} from "./banks";

const TZ = "Australia/Sydney";
const TODAY = "2026-10-11";

const bank = (change: Partial<BankHealth> = {}): BankHealth => ({
  name: "ANZ",
  status: "ok",
  lastSyncedAt: new Date("2026-10-08T03:00:00Z"),
  consentFrom: "2026-01-20",
  consentEnds: "2027-01-20",
  ...change,
});

const connection = (change: Partial<ConnectionHealth> = {}): ConnectionHealth => ({
  id: "c-1",
  mine: true,
  status: "ok",
  lastError: null,
  lastSyncedAt: new Date("2026-10-08T03:00:00Z"),
  banks: [bank()],
  ...change,
});

const warn = (...health: ConnectionHealth[]) => syncWarning(health, TODAY, TZ);

describe("the live sync warning", () => {
  it("says nothing when all is well, or about someone else's connection", () => {
    expect(warn()).toBeNull();
    expect(warn(connection())).toBeNull();
    expect(warn(connection({ mine: false, status: "needs_reconnect", banks: [] }))).toBeNull();
  });

  it("asks for a new setup token when the provider stopped the app's access", () => {
    expect(warn(connection({ status: "needs_reconnect" }))).toEqual({
      title: "Reconnect live sync.",
      body: "It needs a new setup token from Redbark. Everything up to 8 Oct is still here.",
      action: { kind: "link", label: "Reconnect", href: "/connect?reconnect=c-1", external: false },
    });
  });

  it("says a failed sync will try again, with a way to try now", () => {
    expect(
      warn(
        connection({
          status: "error",
          lastError: "Couldn't reach Redbark just now. The next sync will try again.",
        }),
      ),
    ).toEqual({
      title: "Live sync didn't work.",
      body: "Couldn't reach Redbark just now. The next sync will try again. Everything up to 8 Oct is still here.",
      action: { kind: "sync", label: "Try again" },
    });
  });

  it("names the bank to reconnect, and says when its consent ran out", () => {
    const expired = bank({
      status: "needs_reconnect",
      consentFrom: "2025-10-08",
      consentEnds: "2026-10-08",
    });
    expect(warn(connection({ banks: [expired, bank({ name: "Westpac" })] }))).toEqual({
      title: "Reconnect ANZ in Redbark.",
      body: "The bank consent expired. Everything up to 8 Oct is still here.",
      action: { kind: "link", label: "Reconnect", href: "https://redbark.com", external: true },
    });
    const both = warn(
      connection({
        banks: [
          bank({ status: "needs_reconnect" }),
          bank({ name: "Westpac", status: "needs_reconnect", lastSyncedAt: null }),
        ],
      }),
    );
    expect(both).toMatchObject({
      title: "Reconnect ANZ and Westpac in Redbark.",
      body: "Redbark says they need attention. Everything up to 8 Oct is still here.",
    });
    // A bank that never synced here counts from when its connection last did.
    const fresh = warn(
      connection({
        lastSyncedAt: new Date("2026-10-06T03:00:00Z"),
        banks: [bank({ status: "needs_reconnect", lastSyncedAt: null })],
      }),
    );
    expect(fresh?.body).toBe(
      "Redbark says it needs attention. Everything up to 6 Oct is still here.",
    );
  });

  it("warns two weeks before a consent ends", () => {
    const ending = (consentEnds: string) => connection({ banks: [bank({ consentEnds })] });
    expect(warn(ending("2026-10-26"))).toBeNull();
    expect(warn(ending("2026-10-25"))).toEqual({
      title: "Renew ANZ in Redbark soon.",
      body: "The bank consent ends around 25 Oct. Renewing it keeps everything syncing.",
      action: { kind: "link", label: "Open Redbark", href: "https://redbark.com", external: true },
    });
  });

  it("puts the most serious problem first", () => {
    const stuck = connection({ id: "c-2", banks: [bank({ status: "needs_reconnect" })] });
    expect(warn(stuck, connection({ status: "needs_reconnect" }))?.title).toBe(
      "Reconnect live sync.",
    );
    expect(warn(connection({ status: "error" }), stuck)?.title).toBe("Live sync didn't work.");
  });

  it("lists names in plain words", () => {
    expect(namesList(["ANZ"])).toBe("ANZ");
    expect(namesList(["ANZ", "Westpac"])).toBe("ANZ and Westpac");
    expect(namesList(["ANZ", "Bendigo", "Westpac"])).toBe("ANZ, Bendigo and Westpac");
    expect(namesList(["ANZ", "ANZ"])).toBe("ANZ");
  });
});

describe("a bank's consent line", () => {
  const line = (change: Partial<BankHealth>) => consentLine(bank(change), TODAY);

  it("says how long the consent has left, with a bar", () => {
    const year = line({ consentFrom: "2026-09-20", consentEnds: "2027-09-20" });
    expect(year).toMatchObject({ text: "Consent lasts another 11 months", warn: false });
    expect(year.left).toBeCloseTo(344 / 365, 5);
    expect(line({ consentFrom: "2025-11-20", consentEnds: "2026-11-20" }).text).toBe(
      "Consent lasts another month",
    );
    expect(line({ consentFrom: "2025-11-05", consentEnds: "2026-11-05" }).text).toBe(
      "Consent lasts another 25 days",
    );
  });

  it("warns in the last two weeks, and once it's over", () => {
    expect(line({ consentFrom: "2025-10-20", consentEnds: "2026-10-20" })).toMatchObject({
      text: "Consent ends around 20 Oct",
      warn: true,
    });
    expect(
      line({ status: "needs_reconnect", consentFrom: "2025-10-08", consentEnds: "2026-10-08" }),
    ).toEqual({ text: "Consent expired 8 Oct", warn: true, left: 0 });
    expect(line({ status: "needs_reconnect" })).toEqual({
      text: "Needs reconnecting in Redbark",
      warn: true,
      left: null,
    });
  });

  it("draws no bar when the consent's dates aren't known", () => {
    expect(line({ consentFrom: null, consentEnds: null })).toEqual({
      text: "Syncing",
      warn: false,
      left: null,
    });
  });
});
