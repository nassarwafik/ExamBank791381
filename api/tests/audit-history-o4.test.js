import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler } from "../src/functions/audit-history.js";
import * as auditLog from "../src/lib/audit-log.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ O4 (security review docs/enterprise-security-review-p9b3.md; approved design docs/enterprise-teacher-activity-log-o4.md) —
// «سجل نشاطي» per teacher. The reader used to take the newest 100 events of the WHOLE platform and then keep the teacher's, so a
// teacher's real event vanished once others wrote 100 after it. Every new event now also writes a pointer under
// platform/audit-index/<teacher>/<inverted stamp>-<event key>.json; the reader takes one page of the teacher's own index (newest
// first), re-checks actor / forTeacher on the event itself, and falls back to the old window only for events written before.
// TEST data only (multi-user teachers t.a / t.b; the shared-password mode has no tenant).
const { AUDIT_PREFIX, recordAuditEvent, recordAuditEventStrict } = auditLog;
const INDEX = "platform/audit-index/";
const teacher = sub => ({ requireBuilderAuth: () => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } }) });
const shared = { requireBuilderAuth: () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } }) };
const read = (ctx, auth, query = "") => handler({ method: "GET", url: "https://x/api/audit-history" + (query ? "?" + query : "") }, { ...auth, container: ctx.container });
const labels = r => r.jsonBody.events.map(e => e.targetLabel);
let clock = Date.UTC(2026, 10, 1, 8, 0, 0);
const tick = (ms = 1000) => { clock += ms; vi.setSystemTime(clock); };
async function write(ctx, actor, label, extra = {}, strict = false) {
  tick();
  await (strict ? recordAuditEventStrict : recordAuditEvent)(ctx.container, { actor, action: "class.update", targetType: "class", targetId: "c", targetLabel: label, ...extra });
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); clock = Date.UTC(2026, 10, 1, 8, 0, 0); vi.setSystemTime(clock); });
afterEach(() => { vi.useRealTimers(); });

describe("O4 — a teacher's own events stay in «سجل نشاطي» however busy the platform is", () => {
  it("fail-first: A has one event, then B writes 100 → A still sees it (baseline: 0)", async () => {
    const ctx = createMemoryContainer();
    await write(ctx, "t.a", "حدث المعلم أ");
    for (let i = 0; i < 100; i++) await write(ctx, "t.b", "حدث ب " + i);
    expect(labels(await read(ctx, teacher("t.a")))).toEqual(["حدث المعلم أ"]);
    const b = await read(ctx, teacher("t.b"), "limit=100");
    expect(b.jsonBody.events).toHaveLength(100);
    expect(labels(b)[0]).toBe("حدث ب 99");
  });

  it("newest first and bounded by limit, with writers interleaved and several events in the same millisecond", async () => {
    const ctx = createMemoryContainer();
    for (let i = 0; i < 30; i++) { await write(ctx, i % 2 ? "t.a" : "t.b", (i % 2 ? "أ" : "ب") + i); }
    tick(); const same = clock;
    for (const n of ["س1", "س2"]) { vi.setSystemTime(same); await recordAuditEvent(ctx.container, { actor: "t.a", action: "x", targetLabel: n }); }
    const r = await read(ctx, teacher("t.a"), "limit=5");
    expect(r.jsonBody.events).toHaveLength(5);
    expect(labels(r).slice(2)).toEqual(["أ29", "أ27", "أ25"]);
    expect(new Set(labels(r).slice(0, 2))).toEqual(new Set(["س1", "س2"]));
    const times = r.jsonBody.events.map(e => e.eventId);
    expect(times).toEqual([...times].sort((x, y) => y.localeCompare(x)));
  });

  it("events written before the index still show (from the old window), once each, in order", async () => {
    const ctx = createMemoryContainer();
    const seedOld = (iso, label, actor = "t.a") => ctx.setJson(AUDIT_PREFIX + iso.replace(/[:.]/g, "-") + "-0000000" + label.length + ".json", { schemaVersion: 1, timestamp: iso, actor, action: "old", targetType: "class", targetId: "c", targetLabel: label, details: {} });
    seedOld("2026-10-01T08:00:00.000Z", "قديم1"); seedOld("2026-10-02T08:00:00.000Z", "قديم22"); seedOld("2026-10-03T08:00:00.000Z", "لغيره", "t.b");
    await write(ctx, "t.a", "جديد1"); await write(ctx, "t.a", "جديد2");
    expect(labels(await read(ctx, teacher("t.a")))).toEqual(["جديد2", "جديد1", "قديم22", "قديم1"]);
  });

  it("isolation: a pointer planted in A's index to B's event shows nothing; an event FOR A (forTeacher) shows in A's log", async () => {
    const ctx = createMemoryContainer();
    await write(ctx, "t.b", "سر ب");
    const bKey = ctx.names(INDEX + "t.b/")[0].slice((INDEX + "t.b/").length);
    ctx.setJson(INDEX + "t.a/" + bKey, { schemaVersion: 1 });
    await write(ctx, "system", "قراءة محادثة", { forTeacher: "t.a" });
    expect(labels(await read(ctx, teacher("t.a")))).toEqual(["قراءة محادثة"]);
    expect(ctx.names(INDEX + "system/")).toEqual([]);
  });

  it("an id that is not safe to put in a storage path is never indexed (the event itself is still recorded)", async () => {
    const ctx = createMemoryContainer();
    for (const actor of ["../t.a", "a/b", "builder", "system", "..", "x".repeat(65), ""]) await write(ctx, actor, "غير مفهرس");
    expect(ctx.names(INDEX)).toEqual([]);
    expect(ctx.names(AUDIT_PREFIX)).toHaveLength(7);
  });

  it("the shared-password mode (no tenant) keeps today's window over every event", async () => {
    const ctx = createMemoryContainer();
    await write(ctx, "t.a", "أ"); await write(ctx, "t.b", "ب");
    expect(labels(await read(ctx, shared))).toEqual(["ب", "أ"]);
  });
});

describe("O4 — writing: the pointer first, then the event", () => {
  const recording = (ctx, failIndex = false) => {
    const order = [];
    const container = new Proxy(ctx.container, { get(t, k) {
      if (k !== "getBlockBlobClient") return typeof t[k] === "function" ? t[k].bind(t) : t[k];
      return name => { const c = t.getBlockBlobClient(name); return { ...c, upload: async (...a) => { if (failIndex && name.startsWith(INDEX)) throw new Error("index down"); order.push(name.startsWith(INDEX) ? "index" : "event"); return c.upload(...a); } }; };
    } });
    return { container, order };
  };
  it("one pointer for the actor and one for forTeacher, both written before the event", async () => {
    const ctx = createMemoryContainer();
    const { container, order } = recording(ctx);
    tick();
    await recordAuditEvent(container, { actor: "t.a", forTeacher: "t.b", action: "x", targetLabel: "y" });
    expect(order).toEqual(["index", "index", "event"]);
    expect(ctx.names(INDEX + "t.a/")).toHaveLength(1);
    expect(ctx.names(INDEX + "t.b/")).toHaveLength(1);
  });
  it("best effort: a failed pointer never stops the event; strict: a failed pointer refuses, and no event is written", async () => {
    const ctx = createMemoryContainer();
    const { container } = recording(ctx, true);
    tick();
    await recordAuditEvent(container, { actor: "t.a", action: "x", targetLabel: "y" });
    expect(ctx.names(AUDIT_PREFIX)).toHaveLength(1);
    tick();
    await expect(recordAuditEventStrict(container, { actor: "system", forTeacher: "t.a", action: "owner.conversation.read", targetLabel: "z" })).rejects.toThrow("index down");
    expect(ctx.names(AUDIT_PREFIX)).toHaveLength(1);
  });
  it("the inverted stamp lists the newest first", async () => {
    const ctx = createMemoryContainer();
    await write(ctx, "t.a", "1"); await write(ctx, "t.a", "2");
    const names = ctx.names(INDEX + "t.a/").sort();   // the order the storage lists them (lexicographic)
    const keys = names.map(n => n.slice(n.indexOf("-", (INDEX + "t.a/").length) + 1));
    expect(keys[0] > keys[1]).toBe(true);   // the first listed pointer (lexicographic) is the newest event
  });
});
