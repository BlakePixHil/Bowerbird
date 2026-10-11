import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { progressOf, type ActivityRow } from "@/lib/access";
import { HomeOverview, type HomeData } from "./HomeOverview";
import type { SetupFacts } from "./home";

const OCTOBER = { start: "2026-10-01", end: "2026-10-31" };
const MONTH = { period: "monthly", anchor: null } as const;

const progress = (budgets: boolean) =>
  progressOf({
    today: "2026-10-10",
    spec: MONTH,
    period: OCTOBER,
    budgets: budgets
      ? [
          {
            id: "b",
            scope: "personal",
            ownerMemberId: "olive",
            categoryId: "groceries",
            amountCents: 90_000,
            period: "monthly",
            periodAnchor: null,
            periodEnd: null,
            periodSecondDay: null,
            rollover: false,
            onSetDates: false,
            alert80: true,
            alert100: true,
            since: "2026-03-01",
          },
        ]
      : [],
    categories: [
      {
        id: "groceries",
        name: "Groceries",
        icon: "cart",
        colourSlot: 1,
        kind: "spending",
        countsTowardBudgets: true,
      },
    ],
    days: new Map([["groceries", [{ date: "2026-10-03", cents: 21_400 }]]]),
    firstDay: "2026-03-01",
  });

const row = (more: Partial<ActivityRow>): ActivityRow => ({
  id: "t1",
  date: "2026-10-10",
  amountCents: -8_620,
  description: "WOOLWORTHS 1234",
  shop: "Woolworths",
  category: null,
  pending: false,
  notCounted: false,
  paired: false,
  parts: [],
  tags: [],
  note: null,
  source: "file",
  account: { id: "a", name: "Everyday", institution: null },
  whose: "mine",
  ...more,
});

const facts = (transactions: number): SetupFacts => ({
  today: "2026-10-10",
  period: OCTOBER,
  spec: MONTH,
  transactions,
  since: transactions ? "2026-07-11" : null,
  toCheck: transactions ? 1 : 0,
  accounts: transactions ? [{ whose: "mine" }] : [],
  banks: transactions ? 1 : 0,
  live: 0,
  pay: null,
  budgets: 0,
});

const data = (more: Partial<HomeData>): HomeData => ({
  today: "2026-10-10",
  progress: progress(true),
  money: { in: 326_000, out: 21_400 },
  latest: [
    row({
      category: {
        id: "groceries",
        name: "Groceries",
        icon: "cart",
        colourSlot: 1,
        kind: "spending",
      },
    }),
  ],
  people: { me: { name: "Olive", initials: "O" }, partner: null },
  setup: null,
  firstName: "Olive",
  ...more,
});

describe("Home", () => {
  it("shows the period's cards with a plan and transactions", () => {
    const html = renderToStaticMarkup(<HomeOverview data={data({})} />);
    expect(html).toContain("Left to spend in October");
    expect(html).toContain("Spending pace");
    expect(html).toContain("Money in, money out");
    expect(html).toContain('href="/reports/money-in-out"');
    expect(html).toContain("Woolworths");
    expect(html).not.toContain("Finish setting up");
  });

  it("shows the setup checklist before there's anything to show", () => {
    const html = renderToStaticMarkup(
      <HomeOverview data={data({ progress: progress(false), latest: [], setup: facts(0) })} />,
    );
    expect(html).toContain("Welcome, Olive");
    expect(html).toContain("Finish setting up");
    expect(html).toContain("Fills in as the month goes on");
    expect(html).not.toContain("Left to spend");
    expect(html).not.toContain("Latest");
  });

  it("marks transactions to check in the first week", () => {
    const html = renderToStaticMarkup(
      <HomeOverview
        data={data({ progress: progress(false), latest: [row({})], setup: facts(12) })}
      />,
    );
    expect(html).toContain("You&#x27;re set, Olive");
    expect(html).toContain(">Check<");
    expect(html).toContain('href="/activity?show=check"');
  });
});
