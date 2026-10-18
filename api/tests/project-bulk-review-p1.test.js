import { describe, it, expect } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P1 — bulk review. The class board (`resource=board`: every member × every active stage, non-default cells only)
// and `progress.bulk` (ONE status and/or score applied to many (student, stage) pairs through the canonical per-pair
// pipeline: membership, active stage, CAS, audit, milestones). A failing pair never blocks the others; validation
// failures write nothing; archived classes stay read-only.

const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const STAGES = getProjectDefinition(CODE).stages.filter(s => s.active === true);
const [S1, S2, S3] = STAGES.map(s => s.stageId);
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });

function setup(extra = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c1"),
    "platform/users/x1.json": user("x1", "c2"),
    ...extra
  });
  const audits = [], milestones = [];
  const deps = {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }),
    container: ctx.container, getContainer: () => ctx.container,
    recordAuditEvent: async (_c, ev) => { audits.push(ev); },
    recordProjectMilestones: async (_c, ev) => { milestones.push(ev); }
  };
  const get = async params => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId: "c1", ...params }), json: async () => ({}) }, deps));
  const post = async body => (await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", action: "progress.bulk", ...body }) }, deps));
  const progress = sid => ctx.getJson(NS.progressName("c1", sid));
  return { ctx, audits, milestones, get, post, progress };
}
const pairs = (students, stageId) => students.map(studentId => ({ studentId, stageId }));

describe("P1 board — one class-wide read", () => {
  it("lists every member with only the non-default cells, plus the active stages in snapshot order", async () => {
    const t = setup();
    await t.post({ items: pairs(["s1"], S2), status: "ready_for_review" });
    const r = await t.get({ resource: "board" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.readOnly).toBe(false);
    expect(r.jsonBody.stages.map(s => s.stageId)).toEqual(STAGES.map(s => s.stageId));
    expect(r.jsonBody.students.map(s => s.studentId)).toEqual(["s1", "s2", "s3"]);
    expect(r.jsonBody.students[0].cells).toEqual({ [S2]: { status: "ready_for_review", score: null } });
    expect(r.jsonBody.students[1].cells).toEqual({});
  });
  it("never lists a student of another class", async () => {
    const t = setup();
    const r = await t.get({ resource: "board" });
    expect(r.jsonBody.students.some(s => s.studentId === "x1")).toBe(false);
  });
});

describe("P1 progress.bulk — one decision for many pairs", () => {
  it("approves one stage for several students at once, without a score, auditing each change", async () => {
    const t = setup();
    const r = await t.post({ items: pairs(["s1", "s2", "s3"], S1), status: "approved" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.totals).toEqual({ requested: 3, changed: 3, unchanged: 0, failed: 0 });
    expect(r.jsonBody.readyChanged).toBe(true);
    for (const sid of ["s1", "s2", "s3"]) {
      const entry = t.progress(sid).stages[S1];
      expect(entry.status).toBe("approved");
      expect(entry.approvedBy).toBe("teacher-1");
      expect(entry.score).toBeUndefined();
    }
    expect(t.audits.map(a => a.action)).toEqual(["project.stage.approve", "project.stage.approve", "project.stage.approve"]);
    expect(t.audits.every(a => a.details.via === "progress.bulk")).toBe(true);
    expect(t.milestones).toHaveLength(3);
  });

  it("applies several stages of the SAME student (one blob) without losing any", async () => {
    const t = setup();
    const r = await t.post({ items: [{ studentId: "s1", stageId: S1 }, { studentId: "s1", stageId: S2 }, { studentId: "s1", stageId: S3 }], status: "approved" });
    expect(r.jsonBody.totals.changed).toBe(3);
    const doc = t.progress("s1");
    expect([S1, S2, S3].map(id => doc.stages[id].status)).toEqual(["approved", "approved", "approved"]);
    expect(doc.history.filter(h => h.type === "status")).toHaveLength(3);
  });

  it("is idempotent: a repeated decision changes nothing and records no audit", async () => {
    const t = setup();
    await t.post({ items: pairs(["s1", "s2"], S1), status: "approved" });
    t.audits.length = 0;
    const r = await t.post({ items: pairs(["s1", "s2"], S1), status: "approved" });
    expect(r.jsonBody.totals).toEqual({ requested: 2, changed: 0, unchanged: 2, failed: 0 });
    expect(r.jsonBody.readyChanged).toBe(false);
    expect(t.audits).toHaveLength(0);
  });

  it("sets an optional common score together with the status", async () => {
    const t = setup();
    const r = await t.post({ items: pairs(["s1", "s2"], S1), status: "approved", score: 90 });
    expect(r.jsonBody.results.map(x => [x.status, x.score])).toEqual([["approved", 90], ["approved", 90]]);
    expect(t.audits.map(a => a.action).sort()).toEqual(["project.stage.approve", "project.stage.approve", "project.stage.score", "project.stage.score"]);
  });

  it("reports a foreign student or an unknown stage per item and still applies the valid pairs", async () => {
    const t = setup();
    const r = await t.post({ items: [{ studentId: "s1", stageId: S1 }, { studentId: "x1", stageId: S1 }, { studentId: "s2", stageId: "NOPE" }, { studentId: "s2", stageId: S1 }], status: "approved" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.results.map(x => x.ok ? "ok" : x.error)).toEqual(["ok", "not_member", "stage_inactive", "ok"]);
    expect(r.jsonBody.totals).toEqual({ requested: 4, changed: 2, unchanged: 0, failed: 2 });
    expect(t.ctx.getJson(NS.progressName("c1", "x1"))).toBeNull();
    expect(t.ctx.getJson(NS.progressName("c2", "x1"))).toBeNull();
    expect(t.progress("s2").stages.NOPE).toBeUndefined();
  });

  it("collapses duplicate pairs to one write", async () => {
    const t = setup();
    const r = await t.post({ items: [{ studentId: "s1", stageId: S1 }, { studentId: "s1", stageId: S1 }], status: "approved" });
    expect(r.jsonBody.totals).toEqual({ requested: 1, changed: 1, unchanged: 0, failed: 0 });
  });

  it.each([
    ["no items", { items: [] }],
    ["too many items", { items: Array.from({ length: 301 }, (_, i) => ({ studentId: "s" + i, stageId: S1 })), status: "approved" }],
    ["an unknown status", { items: pairs(["s1"], S1), status: "done" }],
    ["an out-of-range score", { items: pairs(["s1"], S1), score: 101 }],
    ["a note", { items: pairs(["s1"], S1), status: "approved", note: "x" }],
    ["neither status nor score", { items: pairs(["s1"], S1) }],
    ["a pair without a stage", { items: [{ studentId: "s1" }], status: "approved" }]
  ])("rejects %s with 400 and writes nothing", async (_label, body) => {
    const t = setup();
    const r = await t.post(body);
    expect(r.status).toBe(400);
    expect(t.progress("s1")).toBeNull();
    expect(t.audits).toHaveLength(0);
  });

  it("refuses every write on an archived class", async () => {
    const t = setup({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    const r = await t.post({ items: pairs(["s1"], S1), status: "approved" });
    expect(r.status).toBe(403);
    expect(t.progress("s1")).toBeNull();
  });
});
