import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, splits, tags, transactions, transactionTags } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { assignColours } from "@/lib/sorting/categories";
import { visibleAccounts, type Viewer } from "./accounts";
import type { ActivityCategory, SplitPart, TagRef } from "./activity";
import { NOTE_MAX, SPLIT_MAX_PARTS, TAG_NAME_MAX, TAGS_MAX } from "./limits";

/**
 * Changes to one transaction beyond its category: splitting it across categories, its tags and
 * its note. As with categorising, the viewer must see the transaction's account in full. Each
 * change gives the same result when sent twice, so the offline queue (project 06) can resend one.
 */

const cannot = { ok: false as const, error: "That transaction isn't one you can change." };

/** The row, if the viewer sees its account in full. */
async function changeable(db: Db, viewer: Viewer, transactionId: string) {
  const seen = await visibleAccounts(db, viewer);
  const accountIds = seen.filter((a) => a.access === "full").map((a) => a.id);
  if (accountIds.length === 0) return null;
  const [row] = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      pending: transactions.pending,
      transferGroupId: transactions.transferGroupId,
      kind: categories.kind,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.householdId, viewer.householdId),
        inArray(transactions.accountId, accountIds),
      ),
    );
  return row ?? null;
}

const categoryFields = {
  id: categories.id,
  name: categories.name,
  kind: categories.kind,
  icon: categories.icon,
  colourSlot: categories.colourSlot,
};

/**
 * A row's parts, biggest first, then in the household's category order. Parts have no order of
 * their own, so every screen shows them this way.
 */
export async function partsOf(db: Db, transactionIds: string[]): Promise<Map<string, SplitPart[]>> {
  const found = new Map<string, SplitPart[]>();
  if (transactionIds.length === 0) return found;
  const rows = await db
    .select({ transactionId: splits.transactionId, cents: splits.amountCents, ...categoryFields })
    .from(splits)
    .innerJoin(categories, eq(categories.id, splits.categoryId))
    .where(inArray(splits.transactionId, transactionIds))
    .orderBy(
      asc(splits.transactionId),
      desc(sql`abs(${splits.amountCents})`),
      asc(categories.sortOrder),
    );
  for (const { transactionId, cents, ...category } of rows)
    found.set(transactionId, [...(found.get(transactionId) ?? []), { category, cents }]);
  return found;
}

// Splits ------------------------------------------------------------------------------------------

/** A part as someone enters it: a category and how much of the payment, in positive cents. */
export type PartChoice = { categoryId: string; cents: number };

export type SplitSaved =
  | {
      ok: true;
      /** Biggest first, in signed cents like the row. */
      parts: SplitPart[];
      /** The row's own category now: its biggest part's, so lists and rules still have one. */
      category: ActivityCategory;
    }
  | { ok: false; error: string };

/** Why a split can't be saved, or null when it can. */
export function splitProblem(total: number, parts: readonly PartChoice[]): string | null {
  if (parts.length < 2) return "A split needs at least two parts.";
  if (parts.length > SPLIT_MAX_PARTS) return `A split can have up to ${SPLIT_MAX_PARTS} parts.`;
  if (parts.some((part) => !Number.isSafeInteger(part.cents) || part.cents <= 0))
    return "Give every part an amount, or remove it.";
  if (new Set(parts.map((part) => part.categoryId)).size < parts.length)
    return "Each part needs its own category.";
  const sum = parts.reduce((n, part) => n + part.cents, 0);
  if (sum !== Math.abs(total))
    return `The parts add up to ${formatMoney(sum)}, but the payment is ${formatMoney(Math.abs(total))}.`;
  return null;
}

/**
 * Splits a transaction across categories, replacing any split it had. The parts must add up to
 * the payment exactly and each needs its own spending or income category. Every total counts the
 * parts instead of the whole (see `partCents`), and the bank's row is left as it came.
 */
export async function splitTransaction(
  db: Db,
  viewer: Viewer,
  transactionId: string,
  parts: readonly PartChoice[],
): Promise<SplitSaved> {
  const row = await changeable(db, viewer, transactionId);
  if (!row) return cannot;
  if (row.pending)
    return {
      ok: false,
      error: "It's still pending, so the amount can change. Split it once the bank settles it.",
    };
  if (row.transferGroupId || row.kind === "transfer")
    return { ok: false, error: "Transfers aren't counted, so there's nothing to split." };
  const problem = splitProblem(row.amountCents, parts);
  if (problem) return { ok: false, error: problem };

  const ids = parts.map((part) => part.categoryId);
  const found = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(
      and(
        inArray(categories.id, ids),
        eq(categories.householdId, viewer.householdId),
        eq(categories.archived, false),
      ),
    );
  if (found.length < ids.length)
    return { ok: false, error: "That category isn't in your household." };
  if (found.some((category) => category.kind === "transfer"))
    return { ok: false, error: "Pick a spending or income category for each part." };

  const sign = Math.sign(row.amountCents);
  // The biggest part, the first one on a tie, is the row's own category.
  const main = parts.reduce((best, part) => (part.cents > best.cents ? part : best));
  await db.transaction(async (tx) => {
    await tx.delete(splits).where(eq(splits.transactionId, row.id));
    await tx.insert(splits).values(
      parts.map((part) => ({
        transactionId: row.id,
        categoryId: part.categoryId,
        amountCents: sign * part.cents,
      })),
    );
    await tx
      .update(transactions)
      .set({ categoryId: main.categoryId })
      .where(eq(transactions.id, row.id));
    await assignColours(tx, viewer.householdId);
  });

  const saved = (await partsOf(db, [row.id])).get(row.id) ?? [];
  const category = saved.find((part) => part.category.id === main.categoryId)!.category;
  return { ok: true, parts: saved, category };
}

export type SplitRemoved =
  { ok: true; category: ActivityCategory | null } | { ok: false; error: string };

/** Takes a split away. The row keeps its biggest part's category and counts as one again. */
export async function removeSplit(
  db: Db,
  viewer: Viewer,
  transactionId: string,
): Promise<SplitRemoved> {
  const row = await changeable(db, viewer, transactionId);
  if (!row) return cannot;
  await db.delete(splits).where(eq(splits.transactionId, row.id));
  await assignColours(db, viewer.householdId);
  const [category] = await db
    .select(categoryFields)
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(eq(transactions.id, row.id));
  return { ok: true, category: category ?? null };
}

// Tags --------------------------------------------------------------------------------------------

/** A tag's name as it's kept: spaces tidied, at most `TAG_NAME_MAX` characters. */
export const tidyTag = (name: string) => name.replace(/\s+/g, " ").trim();

/**
 * The household's tag with this name, whatever its capitals, made if it doesn't exist yet. Null
 * for a name that's empty or too long.
 */
export async function tagNamed(db: Db, householdId: string, name: string): Promise<TagRef | null> {
  const tidy = tidyTag(name);
  if (!tidy || tidy.length > TAG_NAME_MAX) return null;
  const find = () =>
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.householdId, householdId), sql`lower(${tags.name}) = lower(${tidy})`));
  const [had] = await find();
  if (had) return had;
  const [made] = await db
    .insert(tags)
    .values({ householdId, name: tidy })
    .onConflictDoNothing()
    .returning({ id: tags.id, name: tags.name });
  return made ?? (await find())[0] ?? null;
}

async function tagsOn(db: Db, transactionId: string): Promise<TagRef[]> {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(transactionTags)
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(eq(transactionTags.transactionId, transactionId))
    .orderBy(asc(sql`lower(${tags.name})`));
}

export type TagsSaved = { ok: true; tags: TagRef[] } | { ok: false; error: string };

/** Adds a tag by name, such as "Bali 2027", making it if the household doesn't have it yet. */
export async function addTag(
  db: Db,
  viewer: Viewer,
  transactionId: string,
  name: string,
): Promise<TagsSaved> {
  const row = await changeable(db, viewer, transactionId);
  if (!row) return cannot;
  const tidy = tidyTag(name);
  if (!tidy) return { ok: false, error: "Type a name for the tag." };
  if (tidy.length > TAG_NAME_MAX)
    return { ok: false, error: `Keep a tag to ${TAG_NAME_MAX} characters.` };
  const now = await tagsOn(db, row.id);
  if (now.some((tag) => tag.name.toLowerCase() === tidy.toLowerCase()))
    return { ok: true, tags: now };
  if (now.length >= TAGS_MAX)
    return { ok: false, error: `A transaction can have up to ${TAGS_MAX} tags.` };
  const tag = await tagNamed(db, viewer.householdId, tidy);
  if (!tag) return { ok: false, error: "Type a name for the tag." };
  await db
    .insert(transactionTags)
    .values({ transactionId: row.id, tagId: tag.id })
    .onConflictDoNothing();
  return { ok: true, tags: await tagsOn(db, row.id) };
}

/** Takes a tag off one transaction. The tag stays for others that have it. */
export async function removeTag(
  db: Db,
  viewer: Viewer,
  transactionId: string,
  tagId: string,
): Promise<TagsSaved> {
  const row = await changeable(db, viewer, transactionId);
  if (!row) return cannot;
  await db
    .delete(transactionTags)
    .where(and(eq(transactionTags.transactionId, row.id), eq(transactionTags.tagId, tagId)));
  return { ok: true, tags: await tagsOn(db, row.id) };
}

/**
 * Tags to offer: the ones on transactions the viewer can see, most used first. A tag used only on
 * a partner's private account isn't offered, since its name could give away what's in there.
 */
export async function tagChoices(db: Db, viewer: Viewer): Promise<TagRef[]> {
  const seen = await visibleAccounts(db, viewer);
  const accountIds = seen.filter((a) => a.access === "full").map((a) => a.id);
  if (accountIds.length === 0) return [];
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .innerJoin(transactionTags, eq(transactionTags.tagId, tags.id))
    .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
    .where(
      and(
        eq(tags.householdId, viewer.householdId),
        eq(transactions.householdId, viewer.householdId),
        inArray(transactions.accountId, accountIds),
      ),
    )
    .groupBy(tags.id, tags.name)
    .orderBy(desc(count()), asc(sql`lower(${tags.name})`));
}

// Notes -------------------------------------------------------------------------------------------

export type NoteSaved = { ok: true; note: string | null } | { ok: false; error: string };

/** Saves a short note on a transaction. An empty note takes it away. */
export async function saveNote(
  db: Db,
  viewer: Viewer,
  transactionId: string,
  note: string,
): Promise<NoteSaved> {
  const row = await changeable(db, viewer, transactionId);
  if (!row) return cannot;
  const tidy = note.replace(/\s+/g, " ").trim();
  if (tidy.length > NOTE_MAX) return { ok: false, error: `Keep a note to ${NOTE_MAX} characters.` };
  await db
    .update(transactions)
    .set({ note: tidy || null })
    .where(eq(transactions.id, row.id));
  return { ok: true, note: tidy || null };
}
