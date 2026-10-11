import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { accounts, members } from "@/lib/db/schema";

/** Who is looking: one member of one household. */
export type Viewer = { memberId: string; householdId: string };

/** The viewer for the signed-in member, from `requireMember()` or `apiMember()`. */
export function viewerOf(me: { member: { id: string }; household: { id: string } }): Viewer {
  return { memberId: me.member.id, householdId: me.household.id };
}

/** How much of an account the viewer may see. */
export type Access = "full" | "balance_only" | "hidden";

/** Whose money an account is, from the viewer's side. Joint accounts are Shared. */
export type Whose = "mine" | "partner" | "shared";

/** The "Whose money" views. */
export type View = "mine" | "partner" | "shared" | "household";
export const VIEWS: readonly View[] = ["mine", "partner", "shared", "household"];

type AccountRow = typeof accounts.$inferSelect;

/** An account the viewer can see, in full or as a balance only. */
export type SeenAccount = Pick<
  AccountRow,
  | "id"
  | "ownerMemberId"
  | "isJoint"
  | "visibility"
  | "name"
  | "institution"
  | "kind"
  | "includeInBudgets"
  | "manual"
  | "archived"
> & { access: "full" | "balance_only"; whose: Whose };

/** Someone else's private account. Only enough to say it exists, never its name or bank. */
export type HiddenAccount = Pick<AccountRow, "id" | "ownerMemberId" | "isJoint"> & {
  access: "hidden";
  whose: Whose;
};

export type VisibleAccount = SeenAccount | HiddenAccount;

/**
 * Your own accounts are always full. Someone else's account is full if they set it to Shared,
 * balance only if they set it to Balance only, and hidden if it's Private. The member's role
 * makes no difference: the Owner can't see the Partner's private accounts either.
 */
export function accessTo(
  viewer: Viewer,
  account: Pick<AccountRow, "ownerMemberId" | "visibility">,
): Access {
  if (account.ownerMemberId === viewer.memberId) return "full";
  if (account.visibility === "shared") return "full";
  if (account.visibility === "balance_only") return "balance_only";
  return "hidden";
}

/** An individual account counts toward its owner, and a joint account counts as Shared. */
export function whoseIs(
  viewer: Viewer,
  account: Pick<AccountRow, "ownerMemberId" | "isJoint">,
): Whose {
  if (account.isJoint) return "shared";
  return account.ownerMemberId === viewer.memberId ? "mine" : "partner";
}

/**
 * Every account in the viewer's household, each marked full, balance only or hidden. A viewer
 * whose member isn't in that household gets nothing.
 */
export async function visibleAccounts(db: Db, viewer: Viewer): Promise<VisibleAccount[]> {
  const rows = await db
    .select({
      id: accounts.id,
      ownerMemberId: accounts.ownerMemberId,
      isJoint: accounts.isJoint,
      visibility: accounts.visibility,
      name: accounts.name,
      institution: accounts.institution,
      kind: accounts.kind,
      includeInBudgets: accounts.includeInBudgets,
      manual: accounts.manual,
      archived: accounts.archived,
    })
    .from(accounts)
    .innerJoin(
      members,
      and(eq(members.id, viewer.memberId), eq(members.householdId, accounts.householdId)),
    )
    .where(eq(accounts.householdId, viewer.householdId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));

  return rows.map((row): VisibleAccount => {
    const access = accessTo(viewer, row);
    const whose = whoseIs(viewer, row);
    if (access === "hidden") {
      return { id: row.id, ownerMemberId: row.ownerMemberId, isJoint: row.isJoint, access, whose };
    }
    return { ...row, access, whose };
  });
}

/** What one view holds. */
export type Scope = {
  view: View;
  /** The accounts in this view the viewer can see, in full or as a balance only. */
  accounts: SeenAccount[];
  /** How many accounts in this view are someone else's and private, for notes like
   * "Partner's spending is private". */
  hidden: number;
};

/**
 * Whether an account belongs in a view, before asking if the viewer can see it. The views split
 * the household's accounts with no overlap, so Household is always Mine plus Partner's plus
 * Shared.
 *
 * - Mine: the viewer's own individual accounts, whatever their visibility.
 * - Partner's: other members' individual accounts.
 * - Shared: joint accounts.
 * - Household: everything.
 */
function belongsIn(account: VisibleAccount, view: View): boolean {
  return view === "household" || account.whose === view;
}

/** Narrows the viewer's accounts to one view. */
export function pickScope(all: readonly VisibleAccount[], view: View): Scope {
  const inView = all.filter((account) => belongsIn(account, view));
  return {
    view,
    accounts: inView.filter((account): account is SeenAccount => account.access !== "hidden"),
    hidden: inView.filter((account) => account.access === "hidden").length,
  };
}

/** The accounts the viewer can see in one of the four views. */
export async function scopeFor(db: Db, viewer: Viewer, view: View): Promise<Scope> {
  return pickScope(await visibleAccounts(db, viewer), view);
}

/** The other members of the viewer's household, first to join first: who sharing is with. */
export async function otherMembers(
  db: Db,
  viewer: Viewer,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: members.id, name: members.displayName })
    .from(members)
    .where(eq(members.householdId, viewer.householdId))
    .orderBy(asc(members.createdAt), asc(members.id));
  if (!rows.some((row) => row.id === viewer.memberId)) return [];
  return rows.filter((row) => row.id !== viewer.memberId);
}
