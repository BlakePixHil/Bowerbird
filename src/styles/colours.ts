/**
 * The few token colours needed outside CSS: in the web app manifest, the theme-color tags and the
 * app icons. tokens.test.ts checks them against tokens.css, so they can't drift.
 */

/** `--bg`, the page behind everything, for each theme. Dark is the app's default. */
export const PAGE = { dark: "#08090B", light: "#F5F5F7" } as const;

/** The app icon's tile, `--brand-top` to `--brand-bottom`, and the flat blue of the 16px icon. */
export const BRAND = { top: "#4A90F0", bottom: "#1E5BC8", flat: "#2F6FD6" } as const;
