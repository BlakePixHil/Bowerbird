import type { RunningTotalChartProps } from "@/components/charts";
import { addDays } from "@/lib/money";

// A made-up month for the picture of the app beside the sign-in card, from the "Desktop: Sign in"
// board: the same numbers as the Home board.
const START = "2026-10-01";
const SPENT = [38, 112, 164, 231, 298, 352, 418, 507, 611, 701];
const PLAN = 222_000;

export const preview = {
  chips: [
    { label: "Left to spend", value: "$1,519" },
    { label: "Net worth", value: "$270,945" },
    { label: "Left over so far", value: "$4,253" },
  ],
  chart: {
    label: "Everyday spending in October",
    summary:
      "A preview of Bowerbird with made-up numbers: $701 of everyday spending against a $2,220 plan by 10 October.",
    start: START,
    end: "2026-10-31",
    today: "2026-10-10",
    tone: "neg",
    height: 92,
    table: "none",
    actual: {
      name: "October",
      area: true,
      points: SPENT.map((dollars, day) => ({ date: addDays(START, day), cents: dollars * 100 })),
    },
    plan: {
      name: "Plan",
      points: [
        { date: START, cents: Math.round(PLAN / 31) },
        { date: "2026-10-31", cents: PLAN },
      ],
    },
    callouts: [{ date: "2026-10-10", cents: 70_100, label: "$701", strong: true }],
  } satisfies RunningTotalChartProps,
};
