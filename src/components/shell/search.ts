type KeyPress = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
};

/** True when a key press should jump to search: a plain "/" while not typing somewhere else. */
export function isSearchShortcut(press: KeyPress): boolean {
  if (press.key !== "/" || press.metaKey || press.ctrlKey || press.altKey) return false;
  if (press.defaultPrevented) return false;
  const target = press.target;
  if (!target) return true;
  if (target.isContentEditable) return false;
  return !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? "");
}
