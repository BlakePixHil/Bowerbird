import { describe, expect, it } from "vitest";
import { addDays, type PlainDate } from "@/lib/money/dates";
import { findPays, payLookbackFrom, type DepositRow } from "./paydays";

const TODAY = "2026-10-11";
const EVERYDAY = "everyday";

const deposit = (
  date: PlainDate,
  amountCents: number,
  payer = "ACME PTY LTD SALARY",
  accountId = EVERYDAY,
): DepositRow => ({ date, amountCents, accountId, payer, payerName: payer });

/** Deposits every `step` days back from `last` to the start of the lookback. */
function stepping(last: PlainDate, step: number, amountCents: number, payer?: string) {
  const rows: DepositRow[] = [];
  for (let date = last; date >= payLookbackFrom(TODAY); date = addDays(date, -step))
    rows.unshift(deposit(date, amountCents, payer));
  return rows;
}

describe("findPays", () => {
  it("spots fortnightly pay, as in the demo household", () => {
    const [pay, ...others] = findPays(stepping("2026-10-09", 14, 326_000), TODAY);
    expect(others).toEqual([]);
    expect(pay).toMatchObject({
      frequency: "fortnightly",
      anchorDate: "2026-10-09",
      amountCents: 326_000,
      lowCents: 326_000,
      highCents: 326_000,
      accountId: EVERYDAY,
      next: "2026-10-23",
    });
    expect(pay.seen).toHaveLength(7);
    expect(pay.seen[0]).toBe("2026-07-17");
  });

  it("spots weekly pay that comes a day early around a public holiday", () => {
    const rows = stepping("2026-10-07", 7, 95_000);
    rows[5] = { ...rows[5], date: addDays(rows[5].date, -1) };
    const [pay] = findPays(rows, TODAY);
    expect(pay).toMatchObject({
      frequency: "weekly",
      anchorDate: "2026-10-07",
      next: "2026-10-14",
    });
    expect(pay.seen).toHaveLength(rows.length);
  });

  it("spots four-weekly pay", () => {
    const [pay] = findPays(stepping("2026-10-01", 28, 410_000), TODAY);
    expect(pay).toMatchObject({ frequency: "four_weekly", next: "2026-10-29" });
  });

  it("spots monthly pay on a set day, moved before a weekend", () => {
    const rows = [
      deposit("2026-07-15", 520_000),
      deposit("2026-08-14", 520_000), // the 15th was a Saturday
      deposit("2026-09-15", 520_000),
    ];
    const [pay] = findPays(rows, TODAY);
    expect(pay).toMatchObject({
      frequency: "monthly",
      anchorDate: "2026-09-15",
      next: "2026-10-15",
    });
    expect(pay.seen).toEqual(["2026-07-15", "2026-08-14", "2026-09-15"]);
  });

  it("spots pay on the last day of each month", () => {
    const rows = ["2026-07-31", "2026-08-31", "2026-09-30"].map((d) => deposit(d, 600_000));
    const [pay] = findPays(rows, TODAY);
    expect(pay).toMatchObject({ frequency: "monthly", anchorDate: "2026-08-31" });
    expect(pay.next).toBe("2026-10-31");
  });

  it("spots twice-monthly pay on the 15th and the last day", () => {
    const rows = [
      "2026-07-15",
      "2026-07-31",
      "2026-08-14",
      "2026-08-31",
      "2026-09-15",
      "2026-09-30",
    ].map((d) => deposit(d, 280_000));
    const [pay] = findPays(rows, TODAY);
    expect(pay).toMatchObject({
      frequency: "twice_monthly",
      secondDay: 31,
      next: "2026-10-15",
    });
    expect(pay.anchorDate.slice(8)).toBe("15");
    expect(pay.seen).toHaveLength(6);
  });

  it("takes pay that changes a little, and leaves out a bonus", () => {
    const rows = stepping("2026-10-09", 14, 300_000).map((row, i) => ({
      ...row,
      amountCents: 300_000 + (i % 3) * 10_000,
    }));
    rows.push(deposit("2026-09-30", 900_000));
    const [pay, ...others] = findPays(rows, TODAY);
    expect(others).toEqual([]);
    expect(pay).toMatchObject({
      frequency: "fortnightly",
      amountCents: 310_000,
      lowCents: 300_000,
      highCents: 320_000,
    });
    expect(pay.seen).not.toContain("2026-09-30");
  });

  it("leaves out small deposits, odd ones and pay that stopped", () => {
    const interest = ["2026-08-01", "2026-09-01", "2026-10-01"].map((d) =>
      deposit(d, 450, "INTEREST CREDIT"),
    );
    const odd = ["2026-07-20", "2026-08-02", "2026-09-19", "2026-09-22"].map((d) =>
      deposit(d, 25_000, "PAYMENT FROM SAM"),
    );
    const stopped = ["2026-07-17", "2026-07-31", "2026-08-14"].map((d) =>
      deposit(d, 200_000, "OLD JOB PTY LTD"),
    );
    expect(findPays([...interest, ...odd, ...stopped], TODAY)).toEqual([]);
  });

  it("keeps pay whose next payday is after the last day the bank file covers", () => {
    const rows = stepping("2026-09-11", 14, 326_000).filter((row) => row.date <= "2026-09-11");
    expect(findPays(rows, TODAY)).toEqual([]);
    expect(findPays(rows, TODAY, "2026-09-20")).toHaveLength(1);
  });

  it("lists each pay, biggest over a year first", () => {
    const rows = [
      ...stepping("2026-10-06", 7, 30_000, "CAFE SHIFTS"),
      ...stepping("2026-10-09", 14, 326_000),
      ...["2026-07-31", "2026-08-31", "2026-09-30"].map((d) =>
        deposit(d, 326_000, "ACME PTY LTD SALARY", "joint"),
      ),
    ];
    const pays = findPays(rows, TODAY);
    expect(pays.map((pay) => [pay.payer, pay.accountId, pay.frequency])).toEqual([
      ["ACME PTY LTD SALARY", EVERYDAY, "fortnightly"],
      ["ACME PTY LTD SALARY", "joint", "monthly"],
      ["CAFE SHIFTS", EVERYDAY, "weekly"],
    ]);
  });

  it("needs at least three paydays", () => {
    expect(
      findPays([deposit("2026-09-25", 326_000), deposit("2026-10-09", 326_000)], TODAY),
    ).toEqual([]);
  });
});
