import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InOutBars } from "./InOutBars";
import { ProgressRing } from "./ProgressRing";
import { RunningTotalChart } from "./RunningTotalChart";

describe("RunningTotalChart", () => {
  const out = renderToStaticMarkup(
    <RunningTotalChart
      label="Spending in October"
      start="2026-10-01"
      end="2026-10-31"
      tone="neg"
      actual={{
        name: "October",
        points: [
          { date: "2026-10-01", cents: 3800 },
          { date: "2026-10-02", cents: 11_200 },
        ],
      }}
      plan={{
        name: "Plan",
        points: [
          { date: "2026-10-01", cents: 7_161 },
          { date: "2026-10-31", cents: 222_000 },
        ],
      }}
      guides={[{ cents: 100_000, label: "Alert $1,000", alert: true }]}
    />,
  );

  it("states the key numbers in its label", () => {
    expect(out).toContain(
      'aria-label="Spending in October. October: $112 by Fri 2 Oct. Plan: $2,220. Alert $1,000."',
    );
  });

  it("lists every day's numbers in a table, filling in the plan between its points", () => {
    expect(out).toContain("<caption");
    expect(out).toMatch(/Thu 1 Oct<\/td><td[^>]*>\$38<\/td><td[^>]*>\$72</);
    expect(out).toMatch(/Thu 15 Oct<\/td><td[^>]*><\/td><td[^>]*>\$1,074</);
  });
});

describe("InOutBars", () => {
  const months = [
    { key: "2026-08", label: "A", name: "Aug 2026", inCents: 1_117_000, outCents: 872_000 },
    { key: "2026-09", label: "S", name: "Sep 2026", inCents: 1_117_000, outCents: 804_000 },
  ];

  it("is a picture with its numbers when nothing can be picked", () => {
    const out = renderToStaticMarkup(<InOutBars label="Money in and out" months={months} />);
    expect(out).toContain('role="img"');
    expect(out).toContain("Sep 2026: $11,170 in, $8,040 out, $3,130 kept (28%).");
    expect(out).not.toContain("<button");
  });

  it("makes each month a pressable button when it can be picked", () => {
    const out = renderToStaticMarkup(
      <InOutBars label="Money in and out" months={months} selected="2026-08" onSelect={() => {}} />,
    );
    expect(out).toContain('role="group"');
    expect(out).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*aria-label="Aug 2026: \$11,170 in, \$8,720 out"/,
    );
    expect(out).toMatch(/<button[^>]*aria-pressed="false"/);
  });
});

describe("ProgressRing", () => {
  it("leaves out the tick unless there's an expected point", () => {
    const plain = renderToStaticMarkup(<ProgressRing fraction={0.5} label="Half" />);
    const ticked = renderToStaticMarkup(
      <ProgressRing fraction={0.5} expected={0.6} label="Half" />,
    );
    expect(plain).not.toContain("<line");
    expect(ticked).toContain("<line");
  });
});
