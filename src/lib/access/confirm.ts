/** Checks for typed confirmations, shared with the browser so a button can wait for them. */

/** "Our  household " and "our household" both confirm "Our household". */
export function sameName(typed: unknown, name: string): boolean {
  const tidy = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-AU");
  return typeof typed === "string" && tidy(typed) === tidy(name);
}
