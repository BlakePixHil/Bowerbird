import { describe, expect, it } from "vitest";
import type { FirstSyncProgress, SyncAccount } from "@/lib/banks/live/shapes";
import {
  axisStart,
  chartTicks,
  daysBack,
  leadLine,
  pillLine,
  reachPercent,
  statusLine,
  statusWithBack,
} from "./sync-labels";

const account = (over: Partial<SyncAccount>): SyncAccount => ({
  id: "a",
  name: "Everyday",
  kind: "everyday",
  isJoint: false,
  status: "waiting",
  rows: 0,
  oldest: null,
  historyFrom: null,
  ...over,
});

const progress = (accounts: SyncAccount[], over: Partial<FirstSyncProgress> = {}) =>
  ({
    connectionId: "c",
    accounts,
    rows: accounts.reduce((sum, a) => sum + a.rows, 0),
    done: accounts.filter((a) => a.status === "done").length,
    finished: false,
    running: true,
    problem: null,
    bankCount: 2,
    today: "2026-10-10",
    ...over,
  }) satisfies FirstSyncProgress;

describe("first sync words", () => {
  it("says where each account is up to", () => {
    expect(statusLine(account({}))).toBe("Waiting its turn");
    const busy = account({
      status: "busy",
      rows: 1248,
      oldest: "2026-07-20",
      historyFrom: "2026-07-13",
    });
    expect(statusLine(busy)).toBe("Bringing in · 1,248 so far");
    expect(statusWithBack(busy)).toBe("Bringing in · 1,248 so far, back to Mon 13 Jul");
    const done = account({
      status: "done",
      rows: 214,
      oldest: "2026-07-11",
      historyFrom: "2026-01-14",
    });
    expect(statusLine(done)).toBe("Done · 214 transactions since Sat 11 Jul");
    expect(statusWithBack(done)).toBe("Done · 214 transactions since Sat 11 Jul");
    expect(statusLine(account({ status: "done" }))).toBe("Done · no transactions to bring in");
  });

  it("says what's happening at the top", () => {
    const busy = progress([account({ status: "busy", rows: 3, oldest: "2026-09-01" })]);
    expect(leadLine(busy, "screen")).toBe(
      "Bringing in everything your banks share, newest first. You can leave this screen, it keeps going.",
    );
    expect(pillLine(busy)).toBe("1 still bringing in");
    const done = progress([account({ status: "done", rows: 3, oldest: "2026-07-11" })], {
      finished: true,
      running: false,
    });
    expect(leadLine(done, "page")).toBe("Everything since Sat 11 Jul is here.");
    expect(pillLine(done)).toBe("All done");
    expect(daysBack(done)).toBe(92);
  });

  it("leaves room on the chart while accounts are still going back", () => {
    const busy = account({
      status: "busy",
      rows: 40,
      oldest: "2026-07-14",
      historyFrom: "2026-07-13",
    });
    const shown = progress([busy]);
    expect(axisStart(shown)).toBe("2026-04-14");
    expect(Math.round(reachPercent(busy, axisStart(shown), shown.today))).toBe(50);
    const done = account({
      status: "done",
      rows: 40,
      oldest: "2026-05-13",
      historyFrom: "2026-01-14",
    });
    const finished = progress([done], { finished: true });
    expect(axisStart(finished)).toBe("2026-05-13");
    expect(reachPercent(done, "2026-05-13", finished.today)).toBe(0);
    expect(reachPercent(account({}), "2026-05-13", finished.today)).toBe(100);
  });

  it("labels the chart with its first day, the months between and today", () => {
    expect(chartTicks("2026-07-11", "2026-10-10").map((tick) => tick.label)).toEqual([
      "11 Jul",
      "Aug",
      "Sep",
      "Today",
    ]);
  });
});
