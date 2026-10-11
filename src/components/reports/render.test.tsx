import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { moneyReport, rangeMonths } from "./money";
import { MoneyInOutReport } from "./MoneyInOutReport";

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
