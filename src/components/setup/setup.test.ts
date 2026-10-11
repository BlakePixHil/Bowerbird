import { describe, expect, it } from "vitest";
import { railSteps, stepLine, transactionsInLine, type SetupSoFar } from "./steps";

const so: SetupSoFar = { name: "Blake", household: "Our household", live: 0, transactions: 0 };

describe("the first run's step rail", () => {
  it("marks the steps before done, with what was done, and the rest still to come", () => {
    expect(railSteps("payday", { ...so, live: 1, transactions: 482 })).toEqual([
      {
        key: "welcome",
        n: 1,
        title: "Welcome",
        sub: "Blake, Our household",
        state: "done",
        href: "/start/welcome",
      },
      {
        key: "bring",
        n: 2,
        title: "Bring in your transactions",
        sub: "Live sync with Redbark",
        state: "done",
        href: "/start/bring-in",
      },
      {
        key: "payday",
        n: 3,
        title: "Your payday",
        sub: "Now",
        state: "now",
        href: "/start/payday",
      },
      {
        key: "done",
        n: 4,
        title: "You’re set",
        sub: "What’s ready and what’s next",
        state: "later",
        href: null,
      },
    ]);
  });

  it("says bank files when there's no live sync, and can't skip ahead", () => {
    expect(railSteps("payday", { ...so, transactions: 30 })[1].sub).toBe("Bank files");
    const first = railSteps("welcome", so);
    expect(first.map((step) => step.state)).toEqual(["now", "later", "later", "later"]);
    expect(first.slice(1).every((step) => step.href === null)).toBe(true);
  });
});

describe("the first run's words", () => {
  it("says what came in and how far back", () => {
    expect(transactionsInLine(482, "2026-07-11", "2026-10-10")).toBe(
      "Your transactions are in: 482 of them, back to Sat 11 Jul.",
    );
    expect(transactionsInLine(1_204, "2025-11-03", "2026-10-10")).toBe(
      "Your transactions are in: 1,204 of them, back to Mon 3 Nov 2025.",
    );
    expect(transactionsInLine(1, "2026-10-09", "2026-10-10")).toBe(
      "Your first transaction is in, from Fri 9 Oct.",
    );
  });

  it("dates each step on desktop", () => {
    expect(stepLine("2026-10-10", 1)).toBe("SAT 10 OCT · STEP 1 OF 4");
  });
});
