import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { members, savedViews } from "@/lib/db/schema";
import type { Viewer } from "./accounts";
import { cleanFind, cleanSaved, type SavedFilters } from "./find";
import { VIEW_NAME_MAX, VIEWS_MAX } from "./limits";

/**
 * Saved views: a person's own sets of Activity filters, kept by name, which sit with the chips at
 * the top of Activity. Each belongs to one member and no one else sees it.
 */

export type SavedView = { id: string; name: string; filters: SavedFilters };

async function isMember(db: Db, viewer: Viewer): Promise<boolean> {
  const [found] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, viewer.memberId), eq(members.householdId, viewer.householdId)));
  return !!found;
}

/** The viewer's views, oldest first, as their chips line up. */
export async function savedViewList(db: Db, viewer: Viewer): Promise<SavedView[]> {
  if (!(await isMember(db, viewer))) return [];
  const rows = await db
    .select({ id: savedViews.id, name: savedViews.name, filters: savedViews.filters })
    .from(savedViews)
    .where(eq(savedViews.memberId, viewer.memberId))
    .orderBy(asc(savedViews.createdAt), asc(savedViews.id));
  return rows.map((row) => ({ ...row, filters: cleanSaved(row.filters) }));
}

/** A view's name as it's kept: spaces tidied. */
export const tidyViewName = (name: string) => name.replace(/\s+/g, " ").trim();

export type ViewSaved = { ok: true; view: SavedView } | { ok: false; error: string };

/**
 * Saves the filters under a name. A view with the same name, whatever its capitals, gets the new
 * filters, so saving twice changes nothing.
 */
export async function saveView(
  db: Db,
  viewer: Viewer,
  name: string,
  filters: SavedFilters,
): Promise<ViewSaved> {
  if (!(await isMember(db, viewer))) return { ok: false, error: "You can't save views here." };
  const tidy = tidyViewName(name);
  if (!tidy) return { ok: false, error: "Give the view a name." };
  if (tidy.length > VIEW_NAME_MAX)
    return { ok: false, error: `Keep a name to ${VIEW_NAME_MAX} characters.` };
  const clean = { search: filters.search.trim().slice(0, 100), find: cleanFind(filters.find) };
  const same = and(
    eq(savedViews.memberId, viewer.memberId),
    sql`lower(${savedViews.name}) = lower(${tidy})`,
  );

  return db.transaction(async (tx) => {
    // One at a time per person, so two saves can't both squeeze in under the limit.
    await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, viewer.memberId))
      .for("update");
    const [had] = await tx.select({ id: savedViews.id }).from(savedViews).where(same);
    if (had) {
      const [view] = await tx
        .update(savedViews)
        .set({ name: tidy, filters: clean })
        .where(eq(savedViews.id, had.id))
        .returning({ id: savedViews.id, name: savedViews.name });
      return { ok: true as const, view: { ...view, filters: clean } };
    }
    const [{ n }] = await tx
      .select({ n: count() })
      .from(savedViews)
      .where(eq(savedViews.memberId, viewer.memberId));
    if (n >= VIEWS_MAX)
      return {
        ok: false as const,
        error: `You can keep up to ${VIEWS_MAX} views. Remove one to save another.`,
      };
    const [view] = await tx
      .insert(savedViews)
      .values({ memberId: viewer.memberId, name: tidy, filters: clean })
      .returning({ id: savedViews.id, name: savedViews.name });
    return { ok: true as const, view: { ...view, filters: clean } };
  });
}

/** Removes one of the viewer's views. Removing one that's already gone is fine. */
export async function removeView(
  db: Db,
  viewer: Viewer,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isMember(db, viewer))) return { ok: false, error: "You can't change views here." };
  await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.memberId, viewer.memberId)));
  return { ok: true };
}
