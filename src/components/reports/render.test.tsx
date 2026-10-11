import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REPORTS, visible } from "@/components/shell/nav";
import type { ReportsData } from "./cards";
import { moneyReport, rangeMonths } from "./money";
import { MoneyInOutReport } from "./MoneyInOutReport";
import { REPORT_CARDS, ReportsOverview } from "./ReportsOverview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

const report = moneyReport({
  range: "12m",
  months: rangeMonths("12m", "2026-10-11", "2026-06-20"),
  since: "2026-06-20",
  sums: [
    { month: "2026-06", in: 652_000, out: 500_000 },
    { month: "2026-07", in: 652_000, out: 480_000 },
    { month: "2026-08", in: 978_000, out: 700_000 },
    { month: "2026-09", in: 652_000, out: 650_000 },
  ],
  byCategory: [
    { month: "2026-06", categoryId: "housing", out: 225_000 },
    { month: "2026-08", categoryId: "housing", out: 225_000 },
    { month: "2026-08", categoryId: null, out: 475_000 },
    { month: "2026-09", categoryId: "housing", out: 225_000 },
    { month: "2026-09", categoryId: "travel", out: 425_000 },
  ],
  sources: [
    { month: "2026-08", shop: "Acme Salary", cents: 978_000, count: 3 },
    { month: "2026-09", shop: "Acme Salary", cents: 652_000, count: 2 },
  ],
  categories: [
    { id: "housing", name: "Housing", colourSlot: 1 },
    { id: "travel", name: "Travel", colourSlot: 7 },
  ],
});

describe("Money in, money out", () => {
  const html = renderToStaticMarkup(<MoneyInOutReport report={report} initial="2026-09" />);

  it("says the range in a sentence and shows both layouts' headline numbers", () => {
    expect(html).toContain("From June to September you earned");
    expect(html).toContain(">$29,340<");
    expect(html).toContain("about a fifth of your pay.");
    expect(html).toContain(">$29.3k<");
    expect(html).toContain("$7,335 a month on average");
    expect(html).toContain("Kept in August, and in September");
  });

  it("keeps What's left over at #left-over, once", () => {
    expect(html.split('id="left-over"')).toHaveLength(2);
    expect(html).toContain("Average 21%");
    expect(html).toContain("August kept the most, 28% of pay. September kept the least, 0%.");
  });

  it("opens on the month asked for, with where it went and came from", () => {
    expect(html).toContain("Where it went in September");
    expect(html).toContain("Where it came from in September");
    expect(html).toContain("Acme Salary, 2 payments");
    expect(html).toContain("Travel was $4,250 above usual");
    expect(html).toContain('aria-pressed="true">September 2026<');
    expect(html).toContain(">4 months<");
    const august = renderToStaticMarkup(<MoneyInOutReport report={report} initial="2026-08" />);
    expect(august).toContain("Where it went in August");
    expect(august).toContain("Not sorted yet");
  });
});

const DATA: ReportsData = {
  inOut: {
    when: "September",
    in: 1_117_000,
    out: 804_000,
    months: [
      { key: "2026-09", label: "SEP 26", name: "Sep 2026", inCents: 1_117_000, outCents: 804_000 },
      {
        key: "2026-10",
        label: "OCT 26",
        name: "Oct 2026",
        inCents: 736_500,
        outCents: 311_200,
        partial: true,
      },
    ],
    from: "SEP 26",
    to: "OCT 26, SO FAR",
  },
  leftOver: {
    month: "Sept",
    kept: 312_760,
    share: 0.28,
    shares: [0.2, -0.05, 0.28],
    average: 0.23,
  },
  plan: {
    on: 2,
    of: 3,
    when: "in Sept",
    marks: [
      { key: "a", name: "Groceries", over: true, text: "$100 over" },
      { key: "b", name: "Fun", over: false, text: "$60 under" },
      { key: "c", name: "Rent", over: false, text: "On budget" },
    ],
  },
};

describe("Reports", () => {
  const html = renderToStaticMarkup(<ReportsOverview reports={visible(REPORTS)} data={DATA} />);

  it("has a card for every report that's on, and only those", () => {
    const on = visible(REPORTS).map((report) => report.href);
    expect(REPORT_CARDS.map((card) => card.href).sort()).toEqual([...on].sort());
    for (const href of on) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("What we own and owe");
    expect(html).not.toContain("check-in");
  });

  it("shows each report's question, headline and small chart", () => {
    expect(html).toContain("Did we earn more than we spent?");
    expect(html).toContain("In, September");
    expect(html).toContain(">$11,170<");
    expect(html).toContain(">$8,040<");
    expect(html).toContain("OCT 26, SO FAR");
    expect(html).toContain(">28%<");
    expect(html).toContain("of pay kept in Sept");
    expect(html).toContain(">2 of 3<");
    expect(html).toContain("on plan in Sept");
    expect(html.match(/>!</g)).toHaveLength(1);
  });

  it("says when a card has nothing yet", () => {
    const empty = renderToStaticMarkup(
      <ReportsOverview
        reports={visible(REPORTS)}
        data={{
          inOut: { note: "Shows once your first transactions are in." },
          leftOver: { note: "Shows after your first whole month." },
          plan: { note: "Shows once you set your budgets." },
        }}
      />,
    );
    expect(empty).toContain("Shows once your first transactions are in.");
    expect(empty).toContain("Shows after your first whole month.");
    expect(empty).toContain("Shows once you set your budgets.");
  });
});
