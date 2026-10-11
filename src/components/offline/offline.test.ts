import { describe, expect, it } from "vitest";
import { withPatches } from "@/components/activity/look";
import { formatClock } from "@/lib/money";
import { keepsPage, keepsResponse, keptAt, KEPT_AT_HEADER, keptRecently, tooOld } from "./caching";
import { memoryStore, type WaitingChange } from "./queue";
import { sendQueue, type Post } from "./send";
import { offlineLine, waitingLine } from "./words";

const OLIVE = "00000000-0000-4000-8000-0000000000a1";
const PAT = "00000000-0000-4000-8000-0000000000a2";

const waiting = (n: number, memberId = OLIVE): WaitingChange => ({
  memberId,
  kind: "note",
  change: { id: `change-${n}`, transactionId: "t", note: `Note ${n}` },
  at: n,
});

/** A pretend /api/changes: answers each change by its id, and remembers the order they came. */
function server(answers: Record<string, Awaited<ReturnType<Post>> | "offline"> = {}) {
  const got: string[] = [];
  const post: Post = async (change) => {
    const answer = answers[change.change.id] ?? { status: 200, body: { ok: true } };
    if (answer === "offline") throw new TypeError("Failed to fetch");
    got.push(change.change.id);
    return answer;
  };
  return { got, post };
}

async function queueOf(...changes: WaitingChange[]) {
  const store = memoryStore();
  for (const change of changes) await store.add(change);
  return store;
}

describe("sending the changes made offline", () => {
  it("sends them in the order they were made, then the queue is empty", async () => {
    const store = await queueOf(waiting(1), waiting(2), waiting(3));
    const { got, post } = server();
    expect(await sendQueue(store, post, OLIVE)).toEqual({
      saved: 3,
      refused: [],
      left: 0,
      answered: true,
    });
    expect(got).toEqual(["change-1", "change-2", "change-3"]);
    expect(await store.all()).toEqual([]);
  });

  it("stops at the first that can't go, so none jumps the queue", async () => {
    const store = await queueOf(waiting(1), waiting(2), waiting(3));
    const { got, post } = server({ "change-2": "offline" });
    expect(await sendQueue(store, post, OLIVE)).toMatchObject({ saved: 1, left: 2 });
    expect(got).toEqual(["change-1"]);
    expect((await store.all()).map((c) => c.change.id)).toEqual(["change-2", "change-3"]);
  });

  it("keeps them while signed out, the server has trouble or something else answers", async () => {
    for (const answer of [
      { status: 401, body: { error: "Sign in first" } },
      { status: 503, body: null },
      { status: 200, body: null },
    ]) {
      const store = await queueOf(waiting(1));
      const sent = await sendQueue(store, server({ "change-1": answer }).post, OLIVE);
      expect(sent).toMatchObject({ saved: 0, left: 1, answered: true });
      expect(await store.all()).toHaveLength(1);
    }
  });

  it("counts a change saved already as saved", async () => {
    const store = await queueOf(waiting(1));
    const { post } = server({ "change-1": { status: 200, body: { ok: true } } });
    expect(await sendQueue(store, post, OLIVE)).toMatchObject({ saved: 1, left: 0 });
  });

  it("drops a refused change and says why, then carries on", async () => {
    const store = await queueOf(waiting(1), waiting(2), waiting(3));
    const { got, post } = server({
      "change-1": { status: 200, body: { ok: false, error: "That transaction is gone." } },
      "change-2": { status: 400, body: { error: "That change didn't make sense." } },
    });
    expect(await sendQueue(store, post, OLIVE)).toEqual({
      saved: 1,
      refused: [
        "A change made offline couldn't be saved. That transaction is gone.",
        "A change made offline couldn't be saved. That change didn't make sense.",
      ],
      left: 0,
      answered: true,
    });
    expect(got).toEqual(["change-1", "change-2", "change-3"]);
  });

  it("never sends someone else's changes", async () => {
    const store = await queueOf(waiting(1, PAT), waiting(2));
    const { got, post } = server();
    await sendQueue(store, post, OLIVE);
    expect(got).toEqual(["change-2"]);
    expect(await store.all()).toEqual([]);
  });

  it("says when there's no signal at all", async () => {
    const store = await queueOf(waiting(1));
    const { post } = server({ "change-1": "offline" });
    expect(await sendQueue(store, post, OLIVE)).toEqual({
      saved: 0,
      refused: [],
      left: 1,
      answered: false,
    });
  });
});

describe("what's kept for reading offline", () => {
  const origin = "https://bowerbird.example";
  const page = (path: string) => new URL(path, origin);

  it("keeps signed-in pages, but never sign-in, setup, the bank forms or the API", () => {
    for (const path of ["/", "/activity?show=spending", "/budgets", "/accounts", "/reports"])
      expect(keepsPage(page(path), origin)).toBe(true);
    for (const path of [
      "/sign-in",
      "/sign-in/email",
      "/setup",
      "/start",
      "/start/payday",
      "/connect",
      "/connect/sync",
      "/connect/accounts",
      "/api/changes",
      "/serwist/sw.js",
      "/~offline",
      "/dev/ui",
    ])
      expect(keepsPage(page(path), origin)).toBe(false);
    expect(keepsPage(new URL("https://elsewhere.example/"), origin)).toBe(false);
  });

  it("keeps only whole pages that came straight back", () => {
    /** A response as the service worker's fetch gets it from this app. */
    const fetched = (type = "text/html; charset=utf-8", status = 200, redirected = false) => {
      const response = new Response("<html>", { status, headers: { "content-type": type } });
      Object.defineProperty(response, "type", { value: "basic" });
      Object.defineProperty(response, "redirected", { value: redirected });
      return response;
    };
    expect(keepsResponse(fetched())).toBe(true);
    expect(keepsResponse(fetched("text/x-component"))).toBe(false);
    expect(keepsResponse(fetched(undefined, 500))).toBe(false);
    // Sent off to sign in.
    expect(keepsResponse(fetched(undefined, 200, true))).toBe(false);
    expect(
      keepsResponse(new Response("<html>", { headers: { "content-type": "text/html" } })),
    ).toBe(false);
  });

  it("fetches a kept page again after half an hour, or after a newer sync", () => {
    const now = Date.UTC(2026, 9, 11, 1);
    const minutes = (n: number) => now - n * 60_000;
    expect(keptRecently(minutes(10), null, now)).toBe(true);
    expect(keptRecently(minutes(31), null, now)).toBe(false);
    expect(keptRecently(minutes(10), minutes(5), now)).toBe(false);
    expect(keptRecently(minutes(10), minutes(20), now)).toBe(true);
    expect(keptRecently(null, null, now)).toBe(false);
  });

  it("stops showing a kept page once it's a month old", () => {
    const now = Date.UTC(2026, 9, 11);
    const kept = new Response("", { headers: { [KEPT_AT_HEADER]: String(now - 86_400_000) } });
    expect(keptAt(kept)).toBe(now - 86_400_000);
    expect(tooOld(keptAt(kept), now)).toBe(false);
    expect(tooOld(now - 31 * 86_400_000, now)).toBe(true);
    expect(tooOld(keptAt(new Response("")), now)).toBe(true);
  });
});

describe("the offline banner", () => {
  const zone = "Australia/Sydney";
  // 9:12am on Sunday 11 October in Sydney.
  const sync = new Date("2026-10-10T22:12:00Z");

  it("says when the last sync was", () => {
    const savedAt = new Date("2026-10-11T00:00:00Z");
    expect(offlineLine({ lastSync: sync, savedAt }, new Date("2026-10-11T03:00:00Z"), zone)).toBe(
      "Offline · showing your last sync from 9:12am",
    );
    expect(offlineLine({ lastSync: sync, savedAt }, new Date("2026-10-12T03:00:00Z"), zone)).toBe(
      "Offline · showing your last sync from 9:12am yesterday",
    );
    expect(offlineLine({ lastSync: sync, savedAt }, new Date("2026-10-14T03:00:00Z"), zone)).toBe(
      "Offline · showing your last sync from 9:12am on Sun 11 Oct",
    );
  });

  it("says when the page was kept without live sync", () => {
    expect(
      offlineLine({ lastSync: null, savedAt: sync }, new Date("2026-10-11T03:00:00Z"), zone),
    ).toBe("Offline · showing this page from 9:12am");
  });

  it("counts the changes waiting to be sent", () => {
    expect(waitingLine(1)).toBe("1 change to send");
    expect(waitingLine(3)).toBe("3 changes to send");
  });

  it("tells the time like a clock", () => {
    expect(formatClock(new Date("2026-10-11T02:05:00Z"), zone)).toBe("1:05pm");
    expect(formatClock(new Date("2026-10-11T13:00:00Z"), zone)).toBe("12:00am");
  });
});

describe("waiting changes on Activity's rows", () => {
  type Row = { id: string; note: string | null; tags: string[] };
  const days = [
    { date: "2026-10-10", rows: [{ id: "a", note: null, tags: [] } as Row] },
    { date: "2026-10-09", rows: [{ id: "b", note: null, tags: [] } as Row] },
  ];

  it("shows each row's changes in order, and leaves the other days alone", () => {
    const shown = withPatches<Row>(days, [
      { id: "b", patch: { note: "First" } },
      { id: "b", patch: { tags: ["Trip"] } },
      { id: "b", patch: { note: "Second" } },
    ]);
    expect(shown[0]).toBe(days[0]);
    expect(shown[1].rows[0]).toEqual({ id: "b", note: "Second", tags: ["Trip"] });
  });
});
