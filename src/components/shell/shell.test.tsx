import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FEATURES, type FeatureFlags } from "@/config/features";
import { AppSidebar } from "./AppSidebar";
import type { Shell } from "./data";
import { REPORTS, SETTINGS, TABS, visible } from "./nav";
import { isSearchShortcut } from "./search";
import { syncLabel } from "./sync";

const APP_ROUTES = join(__dirname, "../../app/(app)");

/** The page file a link opens, ignoring any #section. */
function pageFor(href: string): string {
  const path = href.split("#")[0];
  return join(APP_ROUTES, path === "/" ? "" : path, "page.tsx");
}

const ALL_ON = Object.fromEntries(Object.keys(FEATURES).map((key) => [key, true])) as FeatureFlags;
const ENTRIES = [...TABS, ...REPORTS, ...SETTINGS];

describe("navigation", () => {
  it.each(visible(ENTRIES).map((entry) => [entry.label, entry.href]))(
    "%s opens a page that exists (%s)",
    (_label, href) => {
      expect(existsSync(pageFor(href))).toBe(true);
    },
  );

  it("has a page for the header's Import a file", () => {
    expect(existsSync(pageFor("/import"))).toBe(true);
  });

  it("hides Goals and the phase 2 and 3 reports in phase 1", () => {
    const labels = visible(ENTRIES).map((entry) => entry.label);
    expect(labels).toEqual([
      "Home",
      "Activity",
      "Budgets",
      "Reports",
      "Money in, money out",
      "What's left over",
      "Plan vs reality",
      "Categories and rules",
      "Accounts and sharing",
    ]);
  });

  it("shows every entry once its feature is on", () => {
    expect(visible(ENTRIES, ALL_ON)).toHaveLength(ENTRIES.length);
  });

  it("names a feature that exists for every switchable entry", () => {
    for (const entry of ENTRIES) {
      if (entry.feature) expect(Object.keys(FEATURES)).toContain(entry.feature);
    }
  });
});

describe("syncLabel", () => {
  const now = new Date("2026-10-10T09:30:00+11:00");
  const ago = (ms: number) => ({ kind: "synced" as const, at: new Date(now.getTime() - ms) });
  const zone = "Australia/Sydney";

  it.each([
    [{ kind: "never" as const }, "Not synced yet"],
    [{ kind: "syncing" as const }, "Syncing…"],
    [ago(20_000), "Synced just now"],
    [ago(12 * 60_000), "Synced 12 min ago"],
    [ago(59 * 60_000), "Synced 59 min ago"],
    [ago(3 * 3_600_000 + 5 * 60_000), "Synced 3 hr ago"],
    [ago(26 * 3_600_000), "Synced 1 day ago"],
    [ago(6 * 86_400_000), "Synced 6 days ago"],
    [ago(9 * 86_400_000), "Synced Thu 1 Oct"],
    [ago(-60_000), "Synced just now"],
  ])("%o reads %s", (state, words) => {
    expect(syncLabel(state, now, zone)).toBe(words);
  });
});

describe("the / shortcut", () => {
  const press = (overrides: Partial<Parameters<typeof isSearchShortcut>[0]> = {}) =>
    isSearchShortcut({
      key: "/",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      defaultPrevented: false,
      target: { tagName: "BODY", isContentEditable: false },
      ...overrides,
    });

  it("jumps to search from anywhere on the page", () => {
    expect(press()).toBe(true);
    expect(press({ target: { tagName: "A" } })).toBe(true);
    expect(press({ target: null })).toBe(true);
  });

  it("leaves the key alone while typing or with a modifier", () => {
    expect(press({ target: { tagName: "INPUT" } })).toBe(false);
    expect(press({ target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(press({ target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    expect(press({ metaKey: true })).toBe(false);
    expect(press({ ctrlKey: true })).toBe(false);
    expect(press({ key: "?" })).toBe(false);
    expect(press({ defaultPrevented: true })).toBe(false);
  });
});

describe("AppSidebar", () => {
  const shell: Shell = {
    householdName: "Our household",
    timeZone: "Australia/Sydney",
    now: new Date("2026-10-10T09:30:00+11:00"),
    today: "2026-10-10",
    member: { name: "You", initials: "Y", owner: "you" },
    sync: { kind: "never" },
    syncDue: false,
    live: { connections: 0, banks: null },
    installed: false,
  };
  const html = renderToStaticMarkup(<AppSidebar shell={shell} />);

  it("lists the phase 1 pages under their sections", () => {
    expect(html).toContain('aria-label="Main menu"');
    expect(html).toContain('href="/activity"');
    expect(html).toContain(">Reports</div>");
    expect(html).toContain('href="/reports/money-in-out#left-over"');
    expect(html).toContain('href="/accounts"');
    expect(html).not.toContain('href="/goals"');
    expect(html).not.toContain('href="/reports/until-payday"');
  });

  it("has a search box the / key can reach", () => {
    expect(html).toMatch(/<input[^>]*aria-label="Search transactions"[^>]*data-search/);
    expect(html).toContain('aria-keyshortcuts="/"');
  });

  it("shows the household and the member", () => {
    expect(html).toContain("Our household");
    expect(html).toContain("READ-ONLY");
  });
});
