/**
 * Build every app icon from brand/mark.svg, as the "Logo and app icon" board draws them: the white
 * mark on the blue tile, never redrawn. Run with `pnpm icons` after changing the mark, and commit
 * what it writes:
 *
 * - public/icons: 1024, 512 and 192px for the web app manifest, and a maskable 512px for Android,
 *   with the mark small enough to stay inside the safe circle whatever shape the phone cuts.
 * - src/app/apple-icon.png: 180px for the iPhone Home Screen.
 * - src/app/favicon.ico: the 32px and 16px browser tab icons.
 *
 * The big icons are square, since each platform rounds the corners itself. The tab icons are
 * rounded, and the 16px one is flat blue with a bigger mark so it stays crisp.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { BRAND } from "../src/styles/colours";

const root = process.cwd();
const mark = readFileSync(join(root, "brand/mark.svg"), "utf8").match(/<path d="([^"]+)"/)?.[1];
if (!mark) throw new Error("brand/mark.svg has no path");

type Tile = {
  size: number;
  /** How much of the tile the mark's 48-unit box covers, from the board. */
  mark: number;
  /** Corner radius in pixels. Zero for icons that the platform rounds. */
  radius: number;
  fill: "gradient" | "flat";
};

/** Main icon: a 136px tile with a 104px mark. Maskable and Android: 88px. */
const FULL = 104 / 136;
const MASKABLE = 88 / 136;

const n = (value: number) => String(Math.round(value * 1e4) / 1e4);

function tileSvg({ size, mark: cover, radius, fill }: Tile): string {
  const box = size * cover;
  const offset = (size - box) / 2;
  const background = fill === "flat" ? BRAND.flat : "url(#tile)";
  const gradient =
    fill === "gradient"
      ? `<defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${BRAND.top}"/><stop offset="1" stop-color="${BRAND.bottom}"/>` +
        `</linearGradient></defs>`
      : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    gradient +
    `<rect width="${size}" height="${size}" rx="${n(radius)}" fill="${background}"/>` +
    `<path transform="translate(${n(offset)} ${n(offset)}) scale(${n(box / 48)})" fill="#FFFFFF" d="${mark}"/>` +
    `</svg>`
  );
}

async function png(tile: Tile): Promise<Buffer> {
  const image = sharp(Buffer.from(tileSvg(tile))).png({ compressionLevel: 9 });
  // A square icon covers every pixel, so it needs no transparency (iOS fills any with black).
  return (tile.radius === 0 ? image.removeAlpha() : image).toBuffer();
}

/** An .ico holding PNG images, which every current browser reads. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

function write(path: string, data: Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
  console.log(`Wrote ${path} (${data.length} bytes)`);
}

async function main() {
  const square = (size: number): Tile => ({ size, mark: FULL, radius: 0, fill: "gradient" });
  for (const size of [1024, 512, 192])
    write(`public/icons/icon-${size}.png`, await png(square(size)));
  write(
    "public/icons/maskable-512.png",
    await png({ size: 512, mark: MASKABLE, radius: 0, fill: "gradient" }),
  );
  write("src/app/apple-icon.png", await png(square(180)));
  // The board's small sizes: 32px rounded 8 with a 26px mark, 16px rounded 4 with a 14px mark.
  const tab32 = await png({ size: 32, mark: 26 / 32, radius: 8, fill: "gradient" });
  const tab16 = await png({ size: 16, mark: 14 / 16, radius: 4, fill: "flat" });
  write(
    "src/app/favicon.ico",
    ico([
      { size: 16, data: tab16 },
      { size: 32, data: tab32 },
    ]),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
