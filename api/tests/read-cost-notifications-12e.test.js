import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { recordEvent } from "../src/lib/notification-events.js";
import { CENTER_LIMIT, EVENT_SCAN_LIMIT } from "../src/lib/notification-center.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-A — NON-REGRESSION BASELINE for the student notification center (GET /api/student-notifications).
//
// Unlike the dashboard / Today paths, the notification center is NOT a global assignment scan today: it lists only the
// student's own event streams (+ the Phase 5D message streams) and reads ONE assignment document per DISTINCT
// assignment among the events it classifies, cached per request. These tests pin that better architecture through the
// REAL handler, the REAL event producer and the REAL in-memory container, so a later change cannot silently turn it
// into an all-assignments read. Nothing is redesigned here.

const S1 = "11111111-1111-1111-1111-111111111111";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const AP = "platform/assignments/";
const req = view => ({ method: "GET", url: "https://x/api/student-notifications" + (view ? "?view=" + view : ""), headers: { get: () => null } });
const user = { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "11", classId: CA, active: true, archived: false, authVersion: 1 };
const asg = (id, classId = CA, status = "published") => ({ assignmentId: id, classId, status, title: "واجب " + id });

let ctx, clock;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock = Date.UTC(2026, 8, 1, 8, 0, 0); vi.setSystemTime(clock);
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: user,
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, status: "active", studentIds: [S1] },
    ["platform/classes/" + CB + ".json"]: { classId: CB, name: "ب", active: true, status: "active", studentIds: [] }
  });
});
afterEach(() => { vi.useRealTimers(); });
const tick = () => { clock += 1000; vi.setSystemTime(clock); };
const deps = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }) });
async function classEvent(aid, n) { tick(); await recordEvent(ctx.container, { scope: "class", classId: CA, type: "assignment_published", dedupeKey: "pub-" + aid + "-" + n, data: { assignmentId: aid, assignmentTitle: "مخزّن" } }); }
async function personalEvent(aid, n) { tick(); await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_retry_granted", dedupeKey: "rg-" + aid + "-" + n, data: { assignmentId: aid, assignmentTitle: "مخزّن" } }); }
function seedHistory(n) { for (let i = 0; i < n; i++) ctx.setJson(AP + "hist" + i + ".json", asg("hist" + i, i % 2 ? CB : CA, i % 3 ? "archived" : "published")); }
async function measure(view) {
  const rc = instrumentReadCost(ctx.container);
  const r = await notificationsHandler(req(view), deps());
  return { r, rc, snap: rc.snapshot() };
}

describe("12E-A notification center — no global assignment scan", () => {
  for (const view of ["unread", "notifications"]) {
    it(`?view=${view}: never lists platform/assignments/ (nor any prefix under it)`, async () => {
      ctx.setJson(AP + "a1.json", asg("a1"));
      await classEvent("a1", 1);
      seedHistory(30);
      const { r, rc } = await measure(view);
      expect(r.status).toBe(200);
      expect(rc.listsUnder(AP)).toBe(0);
      expect(rc.downloadsOf(AP)).toBe(1);                                           // only the one referenced assignment
      expect(rc.downloadsExact(AP + "a1.json")).toBe(1);
    });
  }

  it("unrelated historical assignments (0 vs 300 stored documents) do not change the storage operations at all", async () => {
    ctx.setJson(AP + "a1.json", asg("a1")); ctx.setJson(AP + "a2.json", asg("a2"));
    await classEvent("a1", 1); await personalEvent("a2", 1);
    const before = await measure("notifications");
    seedHistory(300);
    const after = await measure("notifications");
    expect(after.snap.log).toEqual(before.snap.log);                                // identical list/download sequence
    expect(after.r.jsonBody).toEqual(before.r.jsonBody);
  });
});

describe("12E-A notification center — per-request assignment cache", () => {
  it("12 events (class + personal) about the SAME assignment → that assignment document is read exactly ONCE per request", async () => {
    ctx.setJson(AP + "same.json", asg("same"));
    for (let i = 0; i < 6; i++) { await classEvent("same", i); await personalEvent("same", i); }
    for (const view of ["unread", "notifications"]) {
      const { r, rc } = await measure(view);
      expect(r.status).toBe(200);
      expect(rc.downloadsExact(AP + "same.json")).toBe(1);
      expect(rc.downloadsOf(AP)).toBe(1);
    }
    const { r } = await measure("notifications");
    expect(r.jsonBody.items.length).toBe(CENTER_LIMIT);                             // 12 visible → the preview cap
  });

  it("N distinct visible assignment ids → at most one assignment document read each (N = 5)", async () => {
    for (let i = 0; i < 5; i++) { ctx.setJson(AP + "d" + i + ".json", asg("d" + i)); await classEvent("d" + i, 1); await personalEvent("d" + i, 1); }
    for (const view of ["unread", "notifications"]) {
      const { rc } = await measure(view);
      expect(rc.downloadsOf(AP)).toBe(5);
      for (let i = 0; i < 5; i++) expect(rc.downloadsExact(AP + "d" + i + ".json")).toBe(1);
    }
  });

  it("a hidden assignment (another class / unpublished) is read once, never shown, never counted", async () => {
    ctx.setJson(AP + "other.json", asg("other", CB)); ctx.setJson(AP + "draft.json", asg("draft", CA, "draft")); ctx.setJson(AP + "ok.json", asg("ok"));
    await classEvent("other", 1); await classEvent("draft", 1); await classEvent("ok", 1);
    const { r, rc } = await measure("notifications");
    expect(r.jsonBody.items.map(i => i.assignmentId)).toEqual(["ok"]);
    expect(r.jsonBody.events.unread).toBe(1);
    expect([rc.downloadsExact(AP + "other.json"), rc.downloadsExact(AP + "draft.json"), rc.downloadsExact(AP + "ok.json")]).toEqual([1, 1, 1]);
  });
});

describe("12E-A notification center — bounds unchanged", () => {
  it("EVENT_SCAN_LIMIT = 1000 and CENTER_LIMIT = 10 (the per-stream classification bound and the preview size)", () => {
    expect(EVENT_SCAN_LIMIT).toBe(1000);
    expect(CENTER_LIMIT).toBe(10);
  });

  it("the preview returns at most CENTER_LIMIT items; the response keeps its public shape (no metrics / debug field)", async () => {
    for (let i = 0; i < 15; i++) { ctx.setJson(AP + "v" + i + ".json", asg("v" + i)); await classEvent("v" + i, 1); }
    const { r } = await measure("notifications");
    expect(r.jsonBody.items.length).toBe(CENTER_LIMIT);
    expect(Object.keys(r.jsonBody).sort()).toEqual(["bell", "events", "items", "messages", "ok"]);
    const u = await measure("unread");
    expect(Object.keys(u.r.jsonBody).sort()).toEqual(["bell", "events", "messages", "ok"]);
    for (const k of ["readCost", "read_cost", "debug", "metrics"]) expect(JSON.stringify(r.jsonBody)).not.toContain(k);
  });
});
