import type { ActivityRow } from "@/lib/access";
import type { ChangeKind } from "@/lib/changes";

/** What a waiting change does to its row in Activity, so the list shows it until it's sent. */
export type RowPatch = Partial<
  Pick<ActivityRow, "category" | "parts" | "tags" | "note" | "notCounted" | "paired">
>;

/** A change made with no signal, waiting on this device to be sent. */
export type WaitingChange = {
  /** The order changes were made in, from the store. */
  seq?: number;
  /** Whose change it is. Only theirs are ever sent, and only to them. */
  memberId: string;
  kind: ChangeKind;
  /** The change itself, with its own `id`, as the server action takes it. */
  change: { id: string } & Record<string, unknown>;
  /** When it was made, in milliseconds. */
  at: number;
  /** For Activity: the row it changes and how. */
  row?: { id: string; patch: RowPatch };
};

/** Where waiting changes are kept: IndexedDB in the browser, memory in tests. */
export interface ChangeStore {
  add(change: WaitingChange): Promise<void>;
  /** Every waiting change, oldest first. */
  all(): Promise<WaitingChange[]>;
  remove(seq: number): Promise<void>;
  clear(): Promise<void>;
}

/** A store in memory, for tests. */
export function memoryStore(): ChangeStore {
  let next = 1;
  let changes: WaitingChange[] = [];
  return {
    add: async (change) => void changes.push({ ...change, seq: next++ }),
    all: async () => changes.map((change) => ({ ...change })),
    remove: async (seq) => void (changes = changes.filter((change) => change.seq !== seq)),
    clear: async () => void (changes = []),
  };
}

const DATABASE = "bowerbird";
const CHANGES = "changes";

let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(CHANGES, { keyPath: "seq", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

async function using<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(CHANGES, mode);
    const request = work(tx.objectStore(CHANGES));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** The store in this browser. Its changes outlast the page, so they survive a reload offline. */
export const browserStore: ChangeStore = {
  add: async (change) => void (await using("readwrite", (store) => store.add(change))),
  all: () => using("readonly", (store) => store.getAll() as IDBRequest<WaitingChange[]>),
  remove: async (seq) => void (await using("readwrite", (store) => store.delete(seq))),
  clear: async () => void (await using("readwrite", (store) => store.clear())),
};

/*
 * Anything showing how many changes wait (the offline banner) listens here. Other tabs hear about
 * it too, since they share the store.
 */

const listeners = new Set<() => void>();
let tabs: BroadcastChannel | null | undefined;

/** The channel to the other tabs, opened once. A message from one means their changes moved. */
function otherTabs(): BroadcastChannel | null {
  if (tabs === undefined) {
    tabs =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("bowerbird-changes");
    if (tabs) tabs.onmessage = () => listeners.forEach((call) => call());
  }
  return tabs;
}

export function onWaitingChanges(listener: () => void): () => void {
  otherTabs();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Tells this tab and the others that the waiting changes changed. */
export function waitingChanged(): void {
  listeners.forEach((call) => call());
  otherTabs()?.postMessage("changed");
}
