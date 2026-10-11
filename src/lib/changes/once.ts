import { lt } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { appliedChanges } from "@/lib/db/schema";

/** How long a saved change's id is kept, so a copy sent again later is still skipped. */
export const CHANGE_MEMORY_DAYS = 60;

/** The answer for a change whose id was saved before. Nothing happened this time. */
export type AlreadySaved = { ok: true; already: true };

type Outcome = { ok: true } | { ok: false; error: string };

/** Carries a refused change's answer out of its transaction, which rolls the id back. */
class Refused<R> {
  constructor(readonly result: R) {}
}

/**
 * Saves a change at most once. Its id goes into `applied_changes` in the same transaction as the
 * change itself, so a copy sent again (an offline change whose answer was lost, or a second tab
 * sending the same queue) finds the id and changes nothing. A refused change, such as one for a
 * transaction that's gone, leaves no id behind.
 */
export async function once<R extends Outcome>(
  db: Db,
  memberId: string,
  change: { id: string; kind: string },
  run: (tx: Db) => Promise<R>,
  now = new Date(),
): Promise<R | AlreadySaved> {
  try {
    return await db.transaction(async (tx) => {
      const [fresh] = await tx
        .insert(appliedChanges)
        .values({ id: change.id, memberId, kind: change.kind, appliedAt: now })
        .onConflictDoNothing()
        .returning({ id: appliedChanges.id });
      if (!fresh) return { ok: true as const, already: true as const };
      const result = await run(tx);
      if (!result.ok) throw new Refused(result);
      const forgotten = new Date(now.getTime() - CHANGE_MEMORY_DAYS * 86_400_000);
      await tx.delete(appliedChanges).where(lt(appliedChanges.appliedAt, forgotten));
      return result;
    });
  } catch (error) {
    if (error instanceof Refused) return error.result as R;
    throw error;
  }
}
