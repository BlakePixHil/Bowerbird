import type { IconName } from "./icons";

export type NavLink = { href: string; label: string; icon: IconName };

/** True when `pathname` is the page or inside it. Home only matches itself. */
export function isCurrent(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
