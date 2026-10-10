import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

/** The Tokens table from 03 · Design system in Linear: token, dark value, light value. */
const DOC_TOKENS: Array<[string, string, string]> = [
  ["--bg", "#08090B", "#F5F5F7"],
  ["--surface", "#0F1013", "#FFFFFF"],
  ["--surface-2", "#15161A", "#F3F3F5"],
  ["--surface-3", "#1C1D22", "#EAEAEE"],
  ["--line", "#1E2025", "#E6E6EA"],
  ["--line-2", "#2B2D33", "#D8D9DE"],
  ["--grid", "#1C1E23", "#EEEEF1"],
  ["--axis", "#34363D", "#C9CAD0"],
  ["--track", "#202227", "#ECECF0"],
  ["--ghost", "#44464E", "#C9CACF"],
  ["--text", "#EDEEF0", "#111216"],
  ["--text-2", "#A4A7AF", "#55585F"],
  ["--text-3", "#80838C", "#6B6E76"],
  ["--accent", "#3987E5", "#2A78D6"],
  ["--accent-ink", "#7DB1F5", "#1F5FB4"],
  ["--accent-btn", "#2F6FD6", "#2463C2"],
  ["--accent-tint", "rgba(57,135,229,.14)", "rgba(42,120,214,.10)"],
  ["--accent-wash", "rgba(57,135,229,.10)", "rgba(42,120,214,.08)"],
  ["--pos", "#3BB04E", "#2EA043"],
  ["--neg", "#C22929", "#B42323"],
  ["--pos-wash", "rgba(59,176,78,.14)", "rgba(46,160,67,.12)"],
  ["--neg-wash", "rgba(194,41,41,.16)", "rgba(180,35,35,.10)"],
  ["--you", "#3987E5", "#2A78D6"],
  ["--partner", "#D55181", "#E87BA4"],
  ["--shared", "#C98500", "#EDA100"],
  ["--c1", "#14A3B8", "#0A8AA6"],
  ["--c2", "#D95926", "#EB6834"],
  ["--c3", "#199E70", "#1BAF7A"],
  ["--c4", "#C98500", "#EDA100"],
  ["--c5", "#D55181", "#E87BA4"],
  ["--c6", "#008300", "#008300"],
  ["--c7", "#3987E5", "#2A78D6"],
  ["--c-other", "#4A4D56", "#C4C6CC"],
  ["--seq1", "#93DCA0", "#134F22"],
  ["--seq2", "#3BB04E", "#1F7A33"],
  ["--seq3", "#2A8439", "#2EA043"],
  ["--seq4", "#1F6129", "#6CC07A"],
  ["--debt1", "#E07070", "#B42323"],
  ["--debt2", "#8A2020", "#E58585"],
  ["--good", "#0CA30C", "#0CA30C"],
  ["--good-ink", "#3FBF5F", "#006300"],
  ["--good-tint", "rgba(12,163,12,.14)", "rgba(12,163,12,.10)"],
  ["--warn", "#FAB219", "#FAB219"],
  ["--warn-ink", "#E8B030", "#8A5C00"],
  ["--warn-tint", "rgba(250,178,25,.12)", "rgba(250,178,25,.16)"],
  ["--crit", "#D03B3B", "#D03B3B"],
  ["--crit-ink", "#F07070", "#B42323"],
  ["--crit-tint", "rgba(208,59,59,.15)", "rgba(208,59,59,.10)"],
  ["--glass", "rgba(19,20,24,.84)", "rgba(255,255,255,.86)"],
  ["--scrim", "rgba(3,4,6,.66)", "rgba(17,18,22,.38)"],
];

/** Reads the declarations in the first block whose selector starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector}`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const tokens = new Map<string, string>();
  for (const match of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** Compares colours however they're written: case, spaces and 0.10 against .1 don't matter. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\d*\.\d+/g, (n) => String(Number.parseFloat(n)));
}

const dark = block(':root,\n[data-theme="dark"]');
const deviceLight = block(':root:not([data-theme="dark"])');
const forcedLight = block('[data-theme="light"]');

describe("design tokens", () => {
  it.each(DOC_TOKENS)("%s matches the design system doc", (token, darkValue, lightValue) => {
    expect(normalise(dark.get(token) ?? "missing")).toBe(normalise(darkValue));
    expect(normalise(forcedLight.get(token) ?? dark.get(token) ?? "missing")).toBe(
      normalise(lightValue),
    );
  });

  it("uses the same light values for the device setting and the data-theme override", () => {
    expect([...deviceLight.entries()]).toEqual([...forcedLight.entries()]);
  });
});

describe("colour literals", () => {
  // White text on blue buttons and black or white shadows are the only colours allowed outside
  // the token file, so the accent and every data colour always come from tokens.
  const allowed = /^(?:#fff|#ffffff|rgba\((0|255),\s*\1,\s*\1,\s*[\d.]+\))$/i;
  const literal = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

  function cssFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return cssFiles(path);
      return entry.name.endsWith(".css") && entry.name !== "tokens.css" ? [path] : [];
    });
  }

  it.each(cssFiles(join(__dirname, "..")))("%s only takes colours from tokens", (file) => {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const found = [...source.matchAll(literal)].map((m) => m[0]).filter((c) => !allowed.test(c));
    expect(found).toEqual([]);
  });
});
