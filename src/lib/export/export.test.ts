import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { cell, csv, dollars } from "./csv";
import { crc32, zipStream, type ZipFile } from "./zip";

describe("csv", () => {
  it("writes money from whole cents, with no floating point", () => {
    expect(dollars(-1250)).toBe("-12.50");
    expect(dollars(5)).toBe("0.05");
    expect(dollars(0)).toBe("0.00");
    expect(dollars(123_456_789)).toBe("1234567.89");
    expect(dollars(-1)).toBe("-0.01");
  });

  it("quotes only what needs it, and says yes or no", () => {
    expect(cell("Coles")).toBe("Coles");
    expect(cell('Say "hi", then')).toBe('"Say ""hi"", then"');
    expect(cell("two\nlines")).toBe('"two\nlines"');
    expect(cell(true)).toBe("Yes");
    expect(cell(false)).toBe("No");
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
    expect(cell(12)).toBe("12");
    expect(cell({ cents: -8500 })).toBe("-85.00");
  });

  it("keeps text that looks like a formula as text", () => {
    expect(cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(cell("+61 400")).toBe("'+61 400");
    expect(cell("-ATM")).toBe("'-ATM");
    expect(cell("@SUM")).toBe("'@SUM");
    expect(cell("=1,2")).toBe(`"'=1,2"`);
  });

  it("starts with a byte order mark and ends each row with CRLF", () => {
    expect(csv(["A", "B"], [["x", { cents: 100 }]])).toBe("﻿A,B\r\nx,1.00\r\n");
  });
});

/** Reads a zip back: each file's name and data, checked against its CRC and sizes. */
function unzip(bytes: Uint8Array): { name: string; text: string }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const data = new Uint8Array(inflateRawSync(bytes.subarray(start, start + packed)));
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    files.push({ name, text: new TextDecoder().decode(data) });
    at += 46 + nameLength;
  }
  return files;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read())
    parts.push(next.value);
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe("zip", () => {
  it("works out the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("streams files that read back whole, names in UTF-8", async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    function* files(): Generator<ZipFile> {
      yield { name: "export/accounts.csv", data: encode("Account\r\nEveryday\r\n") };
      yield { name: "export/café.csv", data: encode("x".repeat(10_000)) };
      yield { name: "export/empty.csv", data: encode("") };
    }
    const bytes = await collect(
      zipStream(files(), { year: 2026, month: 10, day: 11, hour: 9, minute: 5, second: 30 }),
    );
    expect(unzip(bytes)).toEqual([
      { name: "export/accounts.csv", text: "Account\r\nEveryday\r\n" },
      { name: "export/café.csv", text: "x".repeat(10_000) },
      { name: "export/empty.csv", text: "" },
    ]);
    // Compressed: 10,000 x's take far less than 10 KB.
    expect(bytes.length).toBeLessThan(1_000);
  });
});
