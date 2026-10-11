/** How many categories get a colour of their own (`--c1` to `--c7`). The rest share grey. */
export const COLOUR_SLOTS = 7;

/** The colours a category can have: one of seven slots, or the grey the rest share. */
export type CategoryColour = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c-other";

/**
 * A category's colour on every chart and list, as a data colour (`var(--c3)` and so on). Its slot
 * if it has one, otherwise grey. No category is grey too. `assignColours` hands out the slots.
 */
export function categoryColour(category: { colourSlot: number | null } | null): CategoryColour {
  const slot = category?.colourSlot;
  return slot && Number.isInteger(slot) && slot >= 1 && slot <= COLOUR_SLOTS
    ? (`c${slot}` as CategoryColour)
    : "c-other";
}
