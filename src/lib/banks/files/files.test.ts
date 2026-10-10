import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  closingBalance,
  dedupeKey,
  dedupeKeys,
  matchRows,
  MAX_FILE_BYTES,
  NOT_A_BANK_FILE,
  normaliseDescription,
  parseBankAmount,
  parseBankDate,
  parseBankFile,
  type ExistingRow,
  type ParsedFile,
  type ParsedRow,
  type ParseResult,
} from ".";

const fixture = (name: string) => readFileSync(`tests/fixtures/files/${name}`);

function parsed(result: ParseResult): ParsedFile {
  if (!result.ok) throw new Error(`expected rows, got: ${result.error}`);
  return result;
}

const roles = (file: ParsedFile) => file.columns.map((c) => [c.heading, c.role]);

describe("Westpac CSV", () => {
  const file = parsed(parseBankFile(fixture("westpac.csv"), "westpac-sep.csv"));

  it("is recognised without asking", () => {
    expect(file).toMatchObject({
      format: "csv",
      layout: "westpac",
      needsCheck: false,
      warnings: [],
    });
    expect(roles(file)).toEqual([
      ["Bank Account", "ignore"],
      ["Date", "date"],
      ["Narrative", "description"],
      ["Debit Amount", "debit"],
      ["Credit Amount", "credit"],
      ["Balance", "balance"],
      ["Categories", "ignore"],
      ["Serial", "ignore"],
    ]);
    expect(file.columns.map((c) => c.sample).slice(1, 6)).toEqual([
      "03/09/2026",
      "WOOLWORTHS 1187 SURRY HILLS AU Card xx0000 Value Date: 01/09/2026",
      "31.60",
      "",
      "1,904.35",
    ]);
  });

  it("reads debit and credit columns, quoted commas, balances, and skips blank lines", () => {
    expect(file.rows).toEqual([
      {
        date: "2026-09-03",
        amountCents: -3160,
        description: "WOOLWORTHS 1187 SURRY HILLS AU Card xx0000 Value Date: 01/09/2026",
        balanceCents: 190435,
      },
      {
        date: "2026-09-02",
        amountCents: 245000,
        description: "SALARY SAMPLE CO PTY LTD, PAYROLL",
        balanceCents: 193595,
      },
      {
        date: "2026-09-01",
        amountCents: -1899,
        description: "NETFLIX.COM MELBOURNE AU",
        balanceCents: -51405,
      },
      {
        date: "2026-09-01",
        amountCents: -5000,
        description: "CHEQUE 000123",
        balanceCents: -49506,
      },
    ]);
  });
});

describe("ANZ CSV", () => {
  it("is recognised by its shape: no header, then date, amount and description", () => {
    const file = parsed(parseBankFile(fixture("anz.csv"), "anz.csv"));
    expect(file).toMatchObject({ format: "csv", layout: "anz", needsCheck: false, warnings: [] });
    expect(roles(file)).toEqual([
      [null, "date"],
      [null, "amount"],
      [null, "description"],
    ]);
    expect(file.rows).toEqual([
      { date: "2026-09-03", amountCents: -3160, description: "WOOLWORTHS 1187 SURRY HILLS AU" },
      { date: "2026-09-02", amountCents: 245000, description: "PAYMENT FROM SAMPLE CO PTY LTD" },
      { date: "2026-09-01", amountCents: -1899, description: "NETFLIX.COM MELBOURNE" },
    ]);
  });
});

describe("any other CSV", () => {
  it("guesses the columns from their headings, for the person to check", () => {
    const file = parsed(parseBankFile(fixture("other-bank.csv"), "export.csv"));
    expect(file).toMatchObject({ layout: "other", needsCheck: true, warnings: [] });
    expect(roles(file)).toEqual([
      ["Transaction Date", "date"],
      ["Details", "description"],
      ["Money Out", "debit"],
      ["Money In", "credit"],
      ["Running Balance", "balance"],
      ["Reference", "ignore"],
    ]);
    expect(file.rows).toEqual([
      {
        date: "2026-09-03",
        amountCents: -450,
        description: "Coffee Cart Newtown",
        balanceCents: 12000,
      },
      {
        date: "2026-09-02",
        amountCents: 20000,
        description: "Transfer from savings",
        balanceCents: 12450,
      },
      {
        date: "2026-09-01",
        amountCents: -120000,
        description: "Rent, September",
        balanceCents: -7550,
      },
    ]);
  });

  it("guesses from the values when there's no header, with semicolons and month names", () => {
    const file = parsed(parseBankFile(fixture("other-no-header.csv"), "export.csv"));
    expect(file.needsCheck).toBe(true);
    expect(file.columns.map((c) => c.role)).toEqual(["date", "description", "amount", "balance"]);
    expect(file.rows.map((r) => [r.date, r.amountCents, r.description, r.balanceCents])).toEqual([
      ["2026-09-01", -620, "Bakery on King", 99380],
      ["2026-09-02", -310, "Bus fare", 99070],
      ["2026-09-03", 1500, "Refund from shop", 100570],
    ]);
  });

  it("reads the file again with the person's own choice of columns", () => {
    const file = parsed(
      parseBankFile(fixture("other-no-header.csv"), "export.csv", {
        columns: ["date", "description", "ignore", "amount"],
      }),
    );
    expect(file.needsCheck).toBe(false);
    expect(file.rows.map((r) => r.amountCents)).toEqual([99380, 99070, 100570]);
  });

  it("asks for what's missing instead of guessing rows", () => {
    const file = parsed(
      parseBankFile(fixture("other-no-header.csv"), "export.csv", {
        columns: ["date", "description", "ignore", "ignore"],
      }),
    );
    expect(file).toMatchObject({
      needsCheck: true,
      rows: [],
      warnings: ["Choose which column is the amount, or the money out and money in columns."],
    });
  });

  it("leaves out rows it can't read, and says which", () => {
    const text = [
      "Date,Description,Amount",
      "01/09/2026,Coffee,-4.50",
      "31/02/2026,Broken date,-1.00",
      "02/09/2026,Broken amount,lots",
      "03/09/2026,Tea,-3.00",
    ].join("\n");
    const file = parsed(parseBankFile(text, "export.csv"));
    expect(file.rows.map((r) => r.description)).toEqual(["Coffee", "Tea"]);
    expect(file.warnings).toEqual([
      "2 rows were left out because the date or amount couldn't be read (rows 3 and 4).",
    ]);
  });
});

describe("OFX", () => {
  it("reads the older SGML style, with FITID as the id", () => {
    const file = parsed(parseBankFile(fixture("statement-sgml.ofx"), "statement.ofx"));
    expect(file).toMatchObject({ format: "ofx", layout: "ofx", needsCheck: false, warnings: [] });
    expect(file.rows).toEqual([
      {
        date: "2026-09-03",
        amountCents: -3160,
        description: "WOOLWORTHS 1187 SURRY HILLS AU",
        externalId: "2026090300001",
      },
      {
        date: "2026-09-02",
        amountCents: 245000,
        description: "SALARY SAMPLE CO PTY LTD PAYROLL & BONUS",
        externalId: "2026090200001",
      },
      {
        date: "2026-09-01",
        amountCents: -1899,
        description: "NETFLIX.COM",
        externalId: "2026090100001",
      },
    ]);
    expect(file.closingBalance).toEqual({ date: "2026-09-03", balanceCents: 190435 });
    expect(file.columns.map((c) => [c.heading, c.sample])).toEqual([
      ["DTPOSTED", "20260903"],
      ["NAME", "WOOLWORTHS 1187 SURRY HILLS"],
      ["MEMO", "WOOLWORTHS 1187 SURRY HILLS AU"],
      ["TRNAMT", "-31.60"],
    ]);
  });

  it("reads XML, whatever the file is called", () => {
    const file = parsed(parseBankFile(fixture("statement-xml.ofx"), "download.qbo"));
    expect(file.rows).toEqual([
      {
        date: "2026-09-05",
        amountCents: -450,
        description: "EFTPOS COFFEE CART NEWTOWN",
        externalId: "XML-0001",
      },
      {
        date: "2026-09-06",
        amountCents: 1500,
        description: "REFUND SAMPLE STORE",
        externalId: "XML-0002",
      },
    ]);
    expect(file.closingBalance).toEqual({ date: "2026-09-06", balanceCents: -21040 });
  });
});

describe("QIF", () => {
  it("reads the D, T, P and M lines of each record", () => {
    const file = parsed(parseBankFile(fixture("statement.qif"), "statement.qif"));
    expect(file).toMatchObject({ format: "qif", layout: "qif", needsCheck: false, warnings: [] });
    expect(file.rows).toEqual([
      {
        date: "2026-09-03",
        amountCents: -3160,
        description: "WOOLWORTHS 1187 SURRY HILLS Card xx0000",
      },
      { date: "2026-09-02", amountCents: 245000, description: "SALARY SAMPLE CO PTY LTD" },
      { date: "2026-09-01", amountCents: -1899, description: "NETFLIX.COM" },
    ]);
  });

  it("skips account details and says which transactions it couldn't read", () => {
    const text = [
      "!Account",
      "NEveryday",
      "TBank",
      "^",
      "!Type:Bank",
      "D01/09/2026",
      "T-4.50",
      "PCoffee",
      "^",
      "Dsoon",
      "T-1.00",
      "PNo date",
      "^",
    ].join("\n");
    const file = parsed(parseBankFile(text, "x.qif"));
    expect(file.rows).toEqual([{ date: "2026-09-01", amountCents: -450, description: "Coffee" }]);
    expect(file.warnings).toEqual([
      "1 transaction was left out because the date or amount couldn't be read (transaction 2).",
    ]);
  });
});

describe("files that aren't bank exports", () => {
  const error = (input: Parameters<typeof parseBankFile>[0], name: string) => {
    const result = parseBankFile(input, name);
    return result.ok ? "read" : result.error;
  };

  it("get a plain message, never a crash", () => {
    expect(error("Dear Sam, here are the minutes, as promised.", "notes.csv")).toBe(
      NOT_A_BANK_FILE,
    );
    expect(error(new TextEncoder().encode("%PDF-1.7 statement"), "statement.pdf")).toBe(
      NOT_A_BANK_FILE,
    );
    expect(error(new Uint8Array([0x50, 0x4b, 3, 4, 20, 0]), "statement.xlsx")).toBe(
      NOT_A_BANK_FILE,
    );
    expect(error("just one column\nand another line", "x.csv")).toBe(NOT_A_BANK_FILE);
    expect(error("01/09/2026,-4.50,Coffee", "statement.ofx")).toBe(NOT_A_BANK_FILE);
    expect(error("<<<>>>", "x.txt")).toBe(NOT_A_BANK_FILE);
    expect(error("\uFEFF \r\n\r\n", "empty.csv")).toBe(
      "This file is empty. Download it from your bank again and try once more.",
    );
    expect(error("OFXHEADER:100\n<OFX><BANKTRANLIST></BANKTRANLIST></OFX>", "x.ofx")).toBe(
      "We couldn't find any transactions in this file.",
    );
    expect(error(new Uint8Array(MAX_FILE_BYTES + 1).fill(65), "huge.csv")).toBe(
      "This file is bigger than 4 MB. Export a shorter date range and try again.",
    );
  });

  it("survive random bytes", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 50; n++) {
      const bytes = Uint8Array.from({ length: 200 }, () => Math.floor(random() * 128) + 1);
      expect(() => parseBankFile(bytes, "x.csv")).not.toThrow();
    }
  });

  it("reads older exports that aren't UTF-8", () => {
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode("01/09/2026,-4.50,CAF"),
      0xc9, // É in Windows-1252
      ...new TextEncoder().encode(" SYDNEY"),
    ]);
    expect(parsed(parseBankFile(bytes, "x.csv")).rows[0].description).toBe("CAFÉ SYDNEY");
  });

  it("reads spreadsheet Unicode text (UTF-16)", () => {
    const text = "\ufeffDate\tDescription\tAmount\r\n01/09/2026\tCoffee\t-4.50\r\n";
    const bytes = Uint8Array.from(
      [...text].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8]),
    );
    expect(parsed(parseBankFile(bytes, "export.txt")).rows).toEqual([
      { date: "2026-09-01", amountCents: -450, description: "Coffee" },
    ]);
  });
});

describe("dates and amounts", () => {
  it("reads dates day first, never month first", () => {
    expect(parseBankDate("01/09/2026")).toBe("2026-09-01");
    expect(parseBankDate("1/9/26")).toBe("2026-09-01");
    expect(parseBankDate("01-09-2026")).toBe("2026-09-01");
    expect(parseBankDate("01.09.2026 14:05")).toBe("2026-09-01");
    expect(parseBankDate("2026-09-01")).toBe("2026-09-01");
    expect(parseBankDate("2026-09-01T10:00:00+10:00")).toBe("2026-09-01");
    expect(parseBankDate("1 Sep 2026")).toBe("2026-09-01");
    expect(parseBankDate("01-Sept-26")).toBe("2026-09-01");
    expect(parseBankDate("29/02/2028")).toBe("2028-02-29");
    expect(parseBankDate("09/30/2026")).toBeNull();
    expect(parseBankDate("29/02/2027")).toBeNull();
    expect(parseBankDate("Sep 1")).toBeNull();
  });

  it("reads amounts with CR and DR", () => {
    expect(parseBankAmount("31.60 DR")).toBe(-3160);
    expect(parseBankAmount("31.60CR")).toBe(3160);
    expect(parseBankAmount("$1,904.35")).toBe(190435);
    expect(parseBankAmount("31.605")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("normalises the description", () => {
    expect(normaliseDescription("Woolworths  1187 Card xx1234 Ref 00981234")).toBe(
      "WOOLWORTHS 1187",
    );
    expect(normaliseDescription("SQ *BEANS AND CO 4111 1111 1111 1111")).toBe("SQ *BEANS AND CO");
    expect(normaliseDescription("Transfer to savings Receipt No. 98765")).toBe(
      "TRANSFER TO SAVINGS",
    );
    expect(normaliseDescription("Paid ****5678 TRANSPORTFORNSW OPAL")).toBe(
      "PAID TRANSPORTFORNSW OPAL",
    );
  });

  it("is the date, amount and normalised description", () => {
    const row = { date: "2026-09-01", amountCents: -450, description: "Coffee Cart REF 123456" };
    expect(dedupeKey(row)).toBe("2026-09-01|-450|COFFEE CART");
    expect(dedupeKey({ ...row, description: "COFFEE  CART ref 999999" })).toBe(dedupeKey(row));
    expect(dedupeKey({ ...row, amountCents: -451 })).not.toBe(dedupeKey(row));
  });

  it("numbers identical rows in one file, so both are kept and re-imports still match", () => {
    const coffee = { date: "2026-09-01", amountCents: -450, description: "Coffee Cart" };
    const tea = { ...coffee, description: "Tea" };
    expect(dedupeKeys([coffee, tea, coffee, coffee])).toEqual([
      "2026-09-01|-450|COFFEE CART",
      "2026-09-01|-450|TEA",
      "2026-09-01|-450|COFFEE CART#2",
      "2026-09-01|-450|COFFEE CART#3",
    ]);
  });
});

describe("matchRows", () => {
  const coffee: ParsedRow = { date: "2026-09-01", amountCents: -450, description: "Coffee Cart" };
  const old = (row: ParsedRow, extra: Partial<ExistingRow> = {}): ExistingRow => ({
    date: row.date,
    amountCents: row.amountCents,
    descriptionRaw: row.description,
    externalId: null,
    dedupeKey: dedupeKey(row),
    source: "file",
    ...extra,
  });
  const statuses = (rows: ParsedRow[], existing: ExistingRow[]) =>
    matchRows(rows, existing).map((m) => (m.status === "new" ? m.dedupeKey : "here"));

  it("gives a new account the same keys as dedupeKeys", () => {
    const rows = [coffee, { ...coffee, description: "Tea" }, coffee];
    expect(statuses(rows, [])).toEqual(dedupeKeys(rows));
  });

  it("skips one row per match, so real repeats still come in", () => {
    expect(statuses([coffee, coffee, coffee], [old(coffee)])).toEqual([
      "here",
      "2026-09-01|-450|COFFEE CART#2",
      "2026-09-01|-450|COFFEE CART#3",
    ]);
  });

  it("matches synced rows by their text too, and never reuses a key the account has", () => {
    const synced = old(coffee, { dedupeKey: null, source: "sync" });
    expect(statuses([coffee, coffee], [synced])).toEqual(["here", "2026-09-01|-450|COFFEE CART#2"]);
    // An earlier import saved #2 and its first row has since gone. The new row skips past #2.
    const lone = old(coffee, { dedupeKey: "2026-09-01|-450|COFFEE CART#2" });
    expect(statuses([coffee, coffee], [lone])).toEqual(["here", "2026-09-01|-450|COFFEE CART#3"]);
  });

  it("matches the bank's ids from earlier files, and drops ids another row already uses", () => {
    const tagged = { ...coffee, externalId: "FIT-1" };
    const renamed = { ...tagged, description: "COFFEE CART NEWTOWN" };
    expect(statuses([renamed], [old(tagged, { externalId: "FIT-1" })])).toEqual(["here"]);

    const fromSync = old({ ...coffee, amountCents: -999 }, { externalId: "FIT-1", source: "sync" });
    const [match] = matchRows([tagged], [fromSync]);
    expect(match).toMatchObject({ status: "new", externalId: null });

    const twice = matchRows([tagged, { ...tagged, description: "Tea" }], []);
    expect(twice.map((m) => m.status === "new" && m.externalId)).toEqual(["FIT-1", null]);
  });
});

describe("closingBalance", () => {
  const row = (date: string, amountCents: number, balanceCents?: number): ParsedRow => ({
    date,
    amountCents,
    description: "x",
    balanceCents,
  });

  it("takes the balance the file states", () => {
    const file = parsed(parseBankFile(fixture("statement-sgml.ofx"), "a.ofx"));
    expect(closingBalance(file)).toEqual({ date: "2026-09-03", balanceCents: 1904_35 });
  });

  it("takes the latest row's balance, whichever way the file runs", () => {
    const newestFirst = [row("2026-09-03", -10, 90), row("2026-09-01", -5, 100)];
    expect(closingBalance({ rows: newestFirst })).toEqual({ date: "2026-09-03", balanceCents: 90 });
    const oldestFirst = [...newestFirst].reverse();
    expect(closingBalance({ rows: oldestFirst })).toEqual({ date: "2026-09-03", balanceCents: 90 });
    const westpac = parsed(parseBankFile(fixture("westpac.csv"), "w.csv"));
    expect(closingBalance(westpac)).toEqual({ date: "2026-09-03", balanceCents: 1904_35 });
  });

  it("works out the order from the balances when every row is on one day", () => {
    const oldestFirst = [row("2026-09-01", -10, 90), row("2026-09-01", -5, 85)];
    expect(closingBalance({ rows: oldestFirst })?.balanceCents).toBe(85);
    const newestFirst = [row("2026-09-01", -5, 85), row("2026-09-01", -10, 90)];
    expect(closingBalance({ rows: newestFirst })?.balanceCents).toBe(85);
  });

  it("is null when the file has no balances", () => {
    expect(closingBalance({ rows: [row("2026-09-01", -5)] })).toBeNull();
    expect(closingBalance({ rows: [] })).toBeNull();
  });
});
