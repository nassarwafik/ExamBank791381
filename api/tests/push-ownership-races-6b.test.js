import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import {
  upsertStudentSubscription, removeStudentSubscription, endpointId, endpointDocName, studentDocName, MAX_SUBSCRIPTIONS_PER_STUDENT
} from "../src/lib/push-subscriptions.js";
import { notifyStudentOfNewMessage } from "../src/lib/push-notify.js";

// Phase 6B follow-up — device OWNERSHIP under concurrency. Deterministic interleavings (no sleeps): every storage step
// of an "actor" goes through a barrier, so a test can stop actor A right before a chosen step, let actor B run to
// completion, then resume A. Storage is the repo's in-memory container with real ETag compare-and-set semantics and
// the REAL platform-storage helpers. The push sender is a local spy (no network).

const storage = createRequire(import.meta.url)("../src/lib/platform-storage.js");

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const b64 = buf => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sub = n => ({ endpoint: "https://fcm.googleapis.com/fcm/send/device-" + n, keys: { p256dh: b64(Buffer.alloc(65, n)), auth: b64(Buffer.alloc(16, n)) } });
const E = sub(1);
const CONFIG = { available: true, publicKey: b64(Buffer.alloc(65, 4)), privateKey: b64(Buffer.alloc(32, 7)), subject: "mailto:admin@example.com" };

function defer() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

/** Barrier-controlled storage deps per actor. `stopAt("A", "ownerCasRead", 2)` pauses A's 2nd owner CAS read. */
function interleave() {
  const counters = {};
  const stops = new Map();
  const at = async (actor, op) => {
    const key = actor + ":" + op;
    counters[key] = (counters[key] || 0) + 1;
    const stop = stops.get(key + "#" + counters[key]);
    if (!stop) return;
    stop.reached.resolve();
    await stop.released.promise;
  };
  const kind = name => (name.startsWith("platform/push/endpoints/") ? "owner" : "list");
  const deps = actor => ({
    downloadJsonOrNull: async (c, n) => { await at(actor, kind(n) + "Read"); return storage.downloadJsonOrNull(c, n); },
    downloadJsonWithEtagOrNull: async (c, n) => { await at(actor, kind(n) + "CasRead"); return storage.downloadJsonWithEtagOrNull(c, n); },
    uploadJsonConditional: async (c, n, v, etag) => { await at(actor, kind(n) + "CasWrite"); return storage.uploadJsonConditional(c, n, v, etag); },
    mutateJsonWithRetry: async (c, n, f) => { await at(actor, "listMutate"); return storage.mutateJsonWithRetry(c, n, f); },
    pushConfig: () => CONFIG
  });
  const stopAt = (actor, op, nth = 1) => { const s = { reached: defer(), released: defer() }; stops.set(actor + ":" + op + "#" + nth, s); return { reached: s.reached.promise, release: () => s.released.resolve() }; };
  return { deps, stopAt };
}

const ownerOf = (ctx, s = E) => ctx.getJson(endpointDocName(endpointId(s.endpoint)));
const listOf = (ctx, who) => ((ctx.getJson(studentDocName(who)) || {}).subscriptions || []).map(x => x.endpoint);
async function deliveredTo(ctx, who) {
  const sent = [];
  await notifyStudentOfNewMessage(ctx.container, who, { pushConfig: () => CONFIG, sendNotification: async s => { sent.push(s.endpoint); } });
  return sent;
}
/** The safety invariant after any race: exactly one owner; only the owner can ever be delivered to; no residue. */
async function expectConverged(ctx, expectedOwner) {
  const other = expectedOwner === A ? B : A;
  expect(ownerOf(ctx).studentId).toBe(expectedOwner);
  expect(listOf(ctx, expectedOwner)).toEqual([E.endpoint]);
  expect(listOf(ctx, other)).toEqual([]);
  expect(await deliveredTo(ctx, other)).toEqual([]);
  expect(await deliveredTo(ctx, expectedOwner)).toEqual([E.endpoint]);
}

describe("R1 — the same endpoint subscribed by two students concurrently", () => {
  for (const [label, op, nth] of [
    ["A stopped before writing the owner record", "ownerCasWrite", 1],
    ["A stopped after owning, before adding to its list", "listMutate", 1],
    ["A stopped before its post-write ownership check", "ownerRead", 1]
  ]) {
    it(label + " → exactly one owner, the other list converges, no cross-student delivery", async () => {
      const ctx = createMemoryContainer({});
      const run = interleave();
      const stop = run.stopAt("A", op, nth);
      const a = upsertStudentSubscription(ctx.container, A, E, run.deps("A"));
      await stop.reached;
      await upsertStudentSubscription(ctx.container, B, E, run.deps("B"));   // B runs to completion in between
      stop.release();
      await a;
      const owner = ownerOf(ctx).studentId;
      expect([A, B]).toContain(owner);
      await expectConverged(ctx, owner);
    });
  }
  it("both reach the owner record at the same time (both read 'no owner') → one CAS write wins, the loser re-reads", async () => {
    const ctx = createMemoryContainer({});
    const run = interleave();
    const sa = run.stopAt("A", "ownerCasWrite"), sb = run.stopAt("B", "ownerCasWrite");
    const a = upsertStudentSubscription(ctx.container, A, E, run.deps("A"));
    const b = upsertStudentSubscription(ctx.container, B, E, run.deps("B"));
    await Promise.all([sa.reached, sb.reached]);                           // both read the empty owner record
    sa.release(); await a;                                                 // A commits first
    sb.release(); await b;                                                 // B's stale CAS conflicts → retries → takes over
    await expectConverged(ctx, B);
  });
});

describe("R2 — A unsubscribes while B subscribes the same endpoint", () => {
  it("A's stale release cannot delete B's newer ownership", async () => {
    const ctx = createMemoryContainer({});
    await upsertStudentSubscription(ctx.container, A, E);
    const run = interleave();
    const stop = run.stopAt("A", "ownerCasWrite");                         // A has read "owner = A" and is about to release
    const a = removeStudentSubscription(ctx.container, A, E.endpoint, run.deps("A"));
    await stop.reached;
    await upsertStudentSubscription(ctx.container, B, E, run.deps("B"));
    stop.release();
    await a;
    await expectConverged(ctx, B);
  });
  it("A's unsubscribe that starts after B took over never touches B's record", async () => {
    const ctx = createMemoryContainer({});
    await upsertStudentSubscription(ctx.container, A, E);
    await upsertStudentSubscription(ctx.container, B, E);
    await removeStudentSubscription(ctx.container, A, E.endpoint);
    await expectConverged(ctx, B);
  });
});

describe("R3 — sends are fail-closed on ownership", () => {
  it("after B takes over, a send for A never reaches the endpoint", async () => {
    const ctx = createMemoryContainer({});
    await upsertStudentSubscription(ctx.container, A, E);
    await upsertStudentSubscription(ctx.container, B, E);
    expect(await deliveredTo(ctx, A)).toEqual([]);
  });
  it("a list entry whose owner record is MISSING or RELEASED is never delivered (and is cleaned up)", async () => {
    for (const ownerDoc of [null, { schemaVersion: 2, id: endpointId(E.endpoint), studentId: "", claim: "" }]) {
      const ctx = createMemoryContainer({});
      await upsertStudentSubscription(ctx.container, A, E);
      if (ownerDoc) ctx.setJson(endpointDocName(endpointId(E.endpoint)), ownerDoc); else ctx.store.delete(endpointDocName(endpointId(E.endpoint)));
      expect(await deliveredTo(ctx, A)).toEqual([]);
      expect(listOf(ctx, A)).toEqual([]);
    }
  });
  it("the review's chained race (stale list entry + missing owner) no longer delivers across students", async () => {
    const ctx = createMemoryContainer({});
    await upsertStudentSubscription(ctx.container, B, E);
    // Inconsistent state forced directly: A's list still lists E, and the owner record is gone.
    const bEntry = ctx.getJson(studentDocName(B)).subscriptions[0];
    ctx.setJson(studentDocName(A), { schemaVersion: 2, studentId: A, subscriptions: [bEntry] });
    await removeStudentSubscription(ctx.container, B, E.endpoint);
    expect(await deliveredTo(ctx, A)).toEqual([]);
  });
});

describe("R4 — stale 404/410 cleanup", () => {
  async function staleCleanup(duringSend) {
    const ctx = createMemoryContainer({});
    await upsertStudentSubscription(ctx.container, A, E);
    const inSend = defer(), finish = defer();
    const p = notifyStudentOfNewMessage(ctx.container, A, {
      pushConfig: () => CONFIG,
      sendNotification: async () => { inSend.resolve(); await finish.promise; throw Object.assign(new Error("gone"), { statusCode: 410 }); }
    });
    await inSend.promise;                                                  // the send to E is in flight
    await duringSend(ctx);
    finish.resolve();
    const summary = await p;
    expect(summary.expired).toBe(1);
    return ctx;
  }
  it("B took the endpoint over before A's 410 cleanup ran → B's ownership and list entry survive", async () => {
    const ctx = await staleCleanup(ctx => upsertStudentSubscription(ctx.container, B, E));
    await expectConverged(ctx, B);
  });
  it("A re-registered the same endpoint during the send → the fresh registration is not removed", async () => {
    const ctx = await staleCleanup(ctx => upsertStudentSubscription(ctx.container, A, E));
    expect(ownerOf(ctx).studentId).toBe(A);
    expect(listOf(ctx, A)).toEqual([E.endpoint]);
    expect(ctx.getJson(studentDocName(A)).subscriptions[0].claim).toBe(ownerOf(ctx).claim);
  });
  it("no concurrent change → the expired registration is removed and its owner record released", async () => {
    const ctx = await staleCleanup(async () => {});
    expect(listOf(ctx, A)).toEqual([]);
    expect(ownerOf(ctx).studentId).toBe("");
  });
  it("A's cleanup stopped right before its owner release while B takes over → the release is a no-op", async () => {
    const ctx = createMemoryContainer({});
    await upsertStudentSubscription(ctx.container, A, E);
    const run = interleave();
    const stop = run.stopAt("A", "ownerCasWrite");
    const p = notifyStudentOfNewMessage(ctx.container, A, { ...run.deps("A"), sendNotification: async () => { throw Object.assign(new Error("gone"), { statusCode: 404 }); } });
    await stop.reached;
    await upsertStudentSubscription(ctx.container, B, E, run.deps("B"));
    stop.release();
    await p;
    await expectConverged(ctx, B);
  });
});

describe("R5 — one student, several NEW devices at once", () => {
  it("all devices survive (list CAS retries) and each is owned by the student", async () => {
    const ctx = createMemoryContainer({});
    await Promise.all([1, 2, 3, 4].map(n => upsertStudentSubscription(ctx.container, A, sub(n))));
    expect(listOf(ctx, A).sort()).toEqual([1, 2, 3, 4].map(n => sub(n).endpoint).sort());
    for (const n of [1, 2, 3, 4]) expect(ownerOf(ctx, sub(n)).studentId).toBe(A);
    expect((await deliveredTo(ctx, A)).length).toBe(4);
  });
});

describe("R6 — device-cap eviction", () => {
  const fillTo = async (ctx, n, deps = {}) => {
    let t = 0;
    for (let i = 1; i <= n; i++) await upsertStudentSubscription(ctx.container, A, sub(i), { now: () => new Date(1e12 + (t++) * 1000), ...deps });
  };
  it("the evicted (oldest) device leaves the list AND its owner record is released", async () => {
    const ctx = createMemoryContainer({});
    await fillTo(ctx, MAX_SUBSCRIPTIONS_PER_STUDENT + 1);
    expect(listOf(ctx, A)).toHaveLength(MAX_SUBSCRIPTIONS_PER_STUDENT);
    expect(listOf(ctx, A)).not.toContain(sub(1).endpoint);
    expect(ownerOf(ctx, sub(1)).studentId).toBe("");                      // no orphan owner record
    for (let i = 2; i <= MAX_SUBSCRIPTIONS_PER_STUDENT + 1; i++) expect(ownerOf(ctx, sub(i)).studentId).toBe(A);
  });
  it("if another student took the evicted device in the meantime, the eviction does not release it", async () => {
    const ctx = createMemoryContainer({});
    await fillTo(ctx, MAX_SUBSCRIPTIONS_PER_STUDENT);
    const run = interleave();
    // A's 11th subscribe: owner CAS for device 11 (#1), then the eviction release of device 1 (#2) — stop there.
    const stop = run.stopAt("A", "ownerCasRead", 2);
    const a = upsertStudentSubscription(ctx.container, A, sub(MAX_SUBSCRIPTIONS_PER_STUDENT + 1), { ...run.deps("A"), now: () => new Date(2e12) });
    await stop.reached;
    await upsertStudentSubscription(ctx.container, B, sub(1));
    stop.release();
    await a;
    expect(ownerOf(ctx, sub(1)).studentId).toBe(B);
    expect(listOf(ctx, B)).toEqual([sub(1).endpoint]);
    expect(listOf(ctx, A)).not.toContain(sub(1).endpoint);
  });
});
