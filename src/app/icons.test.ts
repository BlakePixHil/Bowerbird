import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MARK_PATH } from "@/components/ui/Logo";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";
import manifest from "./manifest";

const root = join(__dirname, "../..");
const file = (path: string) => readFileSync(join(root, path));

describe("installing the app", () => {
  const app = manifest();

  it("uses the app's own name and opens full screen", () => {
    expect(app).toMatchObject({
      name: APP_NAME,
      short_name: APP_SHORT_NAME,
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
  });

  it("has the icons Chrome needs to install it, each the size it says", async () => {
    const icons = app.icons ?? [];
    for (const size of ["192x192", "512x512"])
      expect(icons.some((icon) => icon.sizes === size && icon.purpose === "any")).toBe(true);
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      const { width, height, format } = await sharp(file(`public${icon.src}`)).metadata();
      expect(`${width}x${height}`).toBe(icon.sizes);
      expect(format).toBe("png");
    }
  });

  it("gives the iPhone a square 180px icon with no see-through corners", async () => {
    const { width, height, hasAlpha } = await sharp(file("src/app/apple-icon.png")).metadata();
    expect({ width, height, hasAlpha }).toEqual({ width: 180, height: 180, hasAlpha: false });
  });

  it("has 16 and 32px browser tab icons", () => {
    const ico = file("src/app/favicon.ico");
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32]);
  });

  it("draws the same mark in the app as in the icons' source", () => {
    const source = file("brand/mark.svg")
      .toString()
      .match(/<path d="([^"]+)"/)?.[1];
    expect(source).toBe(MARK_PATH);
  });
});
