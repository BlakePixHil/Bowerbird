import type { ChangeKind, ChangeOf } from "@/lib/changes";
import {
  browserStore,
  waitingChanged,
  type ChangeStore,
  type RowPatch,
  type WaitingChange,
} from "./queue";

/*
 * Changes made with no signal (BUD-40). A change goes to its server action as usual. With no
 * signal, or when the action never got an answer, it waits in this device's queue with its own
 * id instead, and the page shows it as saved. The queue is sent in order once there's signal,
 * through /api/changes, and the server saves each id once, so a change whose answer was lost
 * isn't saved twice. While changes wait, new ones wait behind them, so they're saved in the order
 * they were made.
 */

/** The answer for a change that's waiting to be sent. */
export type Waiting = { ok: true; waiting: true };
const WAITING: Waiting = { ok: true, waiting: true };

export const isWaiting = (result: unknown): result is Waiting =>
  typeof result === "object" && result !== null && "waiting" in result;

/** Whose changes this page may queue. Set by OfflineSupport on every signed-in page. */
let owner: string | null = null;

export function setChangesOwner(memberId: string | null): void {
  owner = memberId;
}

/** A fetch that never reached the server: every browser says so with a TypeError. */
const neverArrived = (error: unknown) =>
  error instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);

async function wait(
  store: ChangeStore,
  waiting: Omit<WaitingChange, "seq" | "at">,
): Promise<Waiting | null> {
  try {
    await store.add({ ...waiting, at: Date.now() });
    waitingChanged();
    return WAITING;
  } catch {
    // No IndexedDB here, such as some private windows: say it didn't save.
    return null;
  }
}

/**
 * Sends a change through its server action, or queues it when there's no signal. Answers the
 * action's own result, `Waiting` when it's queued, or null when it failed and wasn't queued.
 */
export async function sendChange<K extends ChangeKind, R>(
  kind: K,
  change: ChangeOf<K>,
  action: (change: ChangeOf<K>) => Promise<R>,
  row?: WaitingChange["row"],
): Promise<R | Waiting | null> {
  const memberId = owner;
  if (!memberId) return action(change).catch(() => null);
  const waiting = { memberId, kind, change: change as WaitingChange["change"], row };
  if (navigator.onLine === false) return wait(browserStore, waiting);
  // Earlier changes go first. If they can't, this one waits behind them.
  if ((await browserStore.all().catch(() => [])).length > 0) {
    const sent = await sendWaiting();
    if (sent.left > 0) return wait(browserStore, waiting);
  }
  try {
    return await action(change);
  } catch (error) {
    return neverArrived(error) ? wait(browserStore, waiting) : null;
  }
}

/** What sending the queue did. */
export type Sent = {
  /** Changes saved, or found saved already. */
  saved: number;
  /** Why each refused change couldn't be saved. They're dropped. */
  refused: string[];
  /** Changes still waiting, because there's no signal or the server is having trouble. */
  left: number;
  /** Whether the server answered at all. */
  answered: boolean;
};

/** One waiting change sent to /api/changes: the status and the answer, or a throw offline. */
export type Post = (
  waiting: WaitingChange,
) => Promise<{ status: number; body: { ok?: boolean; error?: string } | null }>;

const COULD_NOT = "A change made offline couldn't be saved.";

/**
 * Sends the waiting changes of `memberId` in order, stopping at the first one that can't go yet,
 * so none jumps the queue. Saved and refused changes leave the queue; a refused one says why.
 */
export async function sendQueue(store: ChangeStore, post: Post, memberId: string): Promise<Sent> {
  const queue = await store.all();
  const sent: Sent = { saved: 0, refused: [], left: 0, answered: false };
  for (const [i, waiting] of queue.entries()) {
    if (waiting.seq === undefined) continue;
    // Someone else's, left from before they signed out: never theirs to send from here.
    if (waiting.memberId !== memberId) {
      await store.remove(waiting.seq);
      continue;
    }
    let answer: Awaited<ReturnType<Post>>;
    try {
      answer = await post(waiting);
    } catch {
      sent.left = queue.length - i;
      return sent;
    }
    sent.answered = true;
    const { status, body } = answer;
    // Signed out, the server's having trouble, or something else answered (such as a hotel's
    // wifi sign-in page): try again later. The route itself always answers JSON.
    if (status === 401 || status >= 500 || !body) {
      sent.left = queue.length - i;
      return sent;
    }
    if (status === 200 && body?.ok) sent.saved++;
    else sent.refused.push(body?.error ? `${COULD_NOT} ${body.error}` : COULD_NOT);
    await store.remove(waiting.seq);
  }
  return sent;
}

const post: Post = async (waiting) => {
  const response = await fetch("/api/changes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      memberId: waiting.memberId,
      kind: waiting.kind,
      change: waiting.change,
    }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};

let sending: Promise<Sent> | null = null;

/**
 * Sends this device's waiting changes, one tab at a time (a second tab waits for the first and
 * then finds the queue empty). Never throws.
 */
export function sendWaiting(): Promise<Sent> {
  const memberId = owner;
  if (!memberId) return Promise.resolve({ saved: 0, refused: [], left: 0, answered: false });
  const send = () => sendQueue(browserStore, post, memberId);
  const oneTab = async (): Promise<Sent> =>
    navigator.locks ? await navigator.locks.request("bowerbird-changes", send) : send();
  sending ??= oneTab()
    .catch((): Sent => ({ saved: 0, refused: [], left: 1, answered: false }))
    .finally(() => {
      sending = null;
      waitingChanged();
    });
  return sending;
}

/**
 * The waiting changes to Activity's rows, oldest first, so a list can show them. Rows are the
 * household's own, so another person's changes (there never are any) couldn't match them.
 */
export async function waitingRowPatches(): Promise<{ id: string; patch: RowPatch }[]> {
  if (typeof indexedDB === "undefined") return [];
  const queue = await browserStore.all().catch(() => []);
  return queue.flatMap((waiting) => (waiting.row ? [waiting.row] : []));
}
