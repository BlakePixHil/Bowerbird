import { deflateRawSync } from "node:zlib";

/**
 * A small zip writer for the export: each file is compressed and sent as soon as it's ready, then
 * the list of files that ends every zip. Enough of the format for any unzip tool or spreadsheet
 * app (deflate, UTF-8 names, no zip64), so no library is needed. Files must stay under 4 GB.
 */

export type ZipFile = { name: string; data: Uint8Array };

/** When the files were made, in the household's own time, as zips store it. */
export type ZipTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 every zip entry carries, so unzipping can tell a file arrived whole. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(t: ZipTime): { time: number; date: number } {
  return {
    time: (t.hour << 11) | (t.minute << 5) | Math.floor(t.second / 2),
    date: ((t.year - 1980) << 9) | (t.month << 5) | t.day,
  };
}

type Entry = { name: Uint8Array; crc: number; size: number; packed: number; offset: number };

// Version 2.0, bit 11 (names are UTF-8), deflate.
const VERSION = 20;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;

function localHeader(entry: Entry, when: { time: number; date: number }): Uint8Array {
  const out = new Uint8Array(30 + entry.name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, UTF8_NAMES, true);
  view.setUint16(8, DEFLATE, true);
  view.setUint16(10, when.time, true);
  view.setUint16(12, when.date, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.packed, true);
  view.setUint32(22, entry.size, true);
  view.setUint16(26, entry.name.length, true);
  view.setUint16(28, 0, true);
  out.set(entry.name, 30);
  return out;
}

function centralRecord(entry: Entry, when: { time: number; date: number }): Uint8Array {
  const out = new Uint8Array(46 + entry.name.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, VERSION, true);
  view.setUint16(8, UTF8_NAMES, true);
  view.setUint16(10, DEFLATE, true);
  view.setUint16(12, when.time, true);
  view.setUint16(14, when.date, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.packed, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.name.length, true);
  // Extra field, comment, disk number, internal and external attributes stay 0.
  view.setUint32(42, entry.offset, true);
  out.set(entry.name, 46);
  return out;
}

function endRecord(count: number, size: number, offset: number): Uint8Array {
  const out = new Uint8Array(22);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  return out;
}

/**
 * A zip of `files`, sent as a stream. Each file is asked for only once the one before has gone,
 * so only one file is in memory at a time.
 */
export function zipStream(
  files: AsyncIterable<ZipFile> | Iterable<ZipFile>,
  modified: ZipTime,
): ReadableStream<Uint8Array> {
  const when = dosTime(modified);
  const encoder = new TextEncoder();
  const entries: Entry[] = [];
  let offset = 0;
  const iterator =
    Symbol.asyncIterator in files
      ? files[Symbol.asyncIterator]()
      : (files as Iterable<ZipFile>)[Symbol.iterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        const records = entries.map((entry) => centralRecord(entry, when));
        const size = records.reduce((sum, record) => sum + record.length, 0);
        for (const record of records) controller.enqueue(record);
        controller.enqueue(endRecord(entries.length, size, offset));
        controller.close();
        return;
      }
      const { name, data } = next.value;
      const packed = new Uint8Array(deflateRawSync(data));
      const entry: Entry = {
        name: encoder.encode(name),
        crc: crc32(data),
        size: data.length,
        packed: packed.length,
        offset,
      };
      const header = localHeader(entry, when);
      entries.push(entry);
      offset += header.length + packed.length;
      controller.enqueue(header);
      controller.enqueue(packed);
    },
  });
}
