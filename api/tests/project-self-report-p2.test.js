import { describe, it, expect } from "vitest";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { applySelfReport } from "../src/lib/project-tracker/self-report.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase P2 — student self-report. The student marks the stages they completed (owner decision: counts immediately,
// no attachment). Identity and class come only from the session; only active stages of a project the class runs; the
// student can undo their own unconfirmed marks but never a teacher-approved stage, a score or a note. The teacher
// confirms (re-approve → `verified`, stamps cleared, audited) or cancels (any other status) from the existing routes.

const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const STAGES = getProjectDefinition(CODE).stages.filter(s => s.active === true);
const [S1, S2, S3] = STAGES.map(s => s.stageId);
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
const progressDoc = (sid, stages) => ({ schemaVersion: 1, programCode: CODE, classId: "c1", studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [] });

function setup(extra = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c9.json": room("c9", { programCodes: [] }),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/n1.json": user("n1", "c9"),
    ...extra
  });
  const audits = [], milestones = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); }, recordProjectMilestones: async (_c, ev) => { milestones.push(ev); } };
  const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const mark = async (body, id = "s1") => studentTracker({ method: "POST", url: "https://x/api/student-project-tracker", json: async () => body }, studentDeps(id));
  const view = async (id = "s1") => (await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, studentDeps(id))).jsonBody;
  const teacher = async body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, teacherDeps);
  const board = async () => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId: "c1", resource: "board" }), json: async () => ({}) }, teacherDeps)).jsonBody;
  const doc = (sid = "s1") => ctx.getJson(NS.progressName("c1", sid));
  return { ctx, audits, milestones, mark, view, teacher, board, doc };
}

describe("P2 student marks completed stages", () => {
  it("marks several stages in one write: they count immediately and stay flagged as the student's own", async () => {
    const t = setup();
    const before = (await t.view()).projects[0].summary.overallProgress;
    const r = await t.mark({ projectCode: CODE, stageIds: [S1, S2], mark: true });
    expect(r.status).toBe(200);
    expect(r.jsonBody.changed).toBe(2);
    const e = t.doc().stages[S1];
    expect(e).toMatchObject({ status: "approved", approvedBy: "s1", selfReportedBy: "s1", selfReportedFrom: "not_started" });
    expect(e.score).toBeUndefined();
    expect((await t.view()).projects[0].summary.overallProgress).toBeGreaterThan(before);
    expect(t.doc().history.map(h => [h.stageId, h.source, h.actor])).toEqual([[S1, "student", "s1"], [S2, "student", "s1"]]);
    expect(t.audits).toEqual([expect.objectContaining({ actor: "s1", action: "project.stage.self_report", details: expect.objectContaining({ stageIds: [S1, S2] }) })]);
    expect(t.milestones).toHaveLength(1);
  });

  it("is idempotent: marking again changes nothing and records no audit", async () => {
    const t = setup();
    await t.mark({ projectCode: CODE, stageIds: [S1], mark: true });
    t.audits.length = 0;
    const r = await t.mark({ projectCode: CODE, stageIds: [S1], mark: true });
    expect(r.jsonBody.changed).toBe(0);
    expect(t.audits).toHaveLength(0);
    expect(t.doc().history).toHaveLength(1);
  });

  it("undo restores the stage's previous status and keeps a teacher score", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progressDoc("s1", { [S1]: { status: "in_progress", score: 70 } }) });
    await t.mark({ projectCode: CODE, stageIds: [S1], mark: true });
    const r = await t.mark({ projectCode: CODE, stageIds: [S1], mark: false });
    expect(r.jsonBody.changed).toBe(1);
    const e = t.doc().stages[S1];
    expect(e.status).toBe("in_progress");
    expect(e.score).toBe(70);
    for (const k of ["approvedAt", "approvedBy", "selfReportedAt", "selfReportedBy", "selfReportedFrom"]) expect(e).not.toHaveProperty(k);
    expect(t.audits.map(a => a.action)).toEqual(["project.stage.self_report", "project.stage.self_report_undo"]);
  });

  it("never changes or undoes a stage the teacher approved", async () => {
    const t = setup({ [NS.progressName("c1", "s1")]: progressDoc("s1", { [S1]: { status: "approved", approvedBy: "teacher-1", approvedAt: NOW } }) });
    const marked = await t.mark({ projectCode: CODE, stageIds: [S1], mark: true });
    expect(marked.jsonBody.results).toEqual([{ stageId: S1, ok: true, changed: false }]);
    const undo = await t.mark({ projectCode: CODE, stageIds: [S1], mark: false });
    expect(undo.jsonBody.results).toEqual([{ stageId: S1, ok: false, changed: false, error: "teacher_approved" }]);
    expect(t.doc().stages[S1]).toEqual({ status: "approved", approvedBy: "teacher-1", approvedAt: NOW });
  });

  it("writes only the session student's own document (body studentId / classId are ignored)", async () => {
    const t = setup();
    await t.mark({ projectCode: CODE, stageIds: [S1], mark: true, studentId: "s2", classId: "c9" });
    expect(t.doc("s1").stages[S1].status).toBe("approved");
    expect(t.doc("s2")).toBeNull();
  });

  it("reports an inactive or unknown stage per item and writes the valid ones", async () => {
    const t = setup();
    const r = await t.mark({ projectCode: CODE, stageIds: ["NOPE", S1], mark: true });
    expect(r.jsonBody.results.map(x => x.ok ? "ok" : x.error)).toEqual(["stage_inactive", "ok"]);
    expect(t.doc().stages.NOPE).toBeUndefined();
  });

  it.each([
    ["a project the class does not run", { projectCode: "883589", stageIds: [S1], mark: true }],
    ["a non-boolean mark", { projectCode: CODE, stageIds: [S1], mark: "yes" }],
    ["no stages", { projectCode: CODE, stageIds: [], mark: true }],
    ["too many stages", { projectCode: CODE, stageIds: Array.from({ length: 61 }, (_, i) => "X" + i), mark: true }],
    ["an empty stage id", { projectCode: CODE, stageIds: [""], mark: true }]
  ])("rejects %s with 400 and writes nothing", async (_l, body) => {
    const t = setup();
    const r = await t.mark(body);
    expect(r.status).toBe(400);
    expect(t.doc()).toBeNull();
    expect(t.audits).toHaveLength(0);
  });

  it("refuses an archived class (403) and a student whose class runs no project (400)", async () => {
    const t = setup({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    expect((await t.mark({ projectCode: CODE, stageIds: [S1], mark: true })).status).toBe(403);
    expect(t.doc()).toBeNull();
    expect((await t.mark({ projectCode: CODE, stageIds: [S1], mark: true }, "n1")).status).toBe(400);
  });
});

describe("P2 teacher confirms or cancels a student's mark", () => {
  it("the board flags student marks; re-approving confirms (stamps cleared, audited) and the student can no longer undo", async () => {
    const t = setup();
    await t.mark({ projectCode: CODE, stageIds: [S1, S2], mark: true });
    expect((await t.board()).students[0].cells[S1]).toEqual({ status: "approved", score: null, selfReported: true });
    t.audits.length = 0;
    const r = await t.teacher({ action: "progress.update", studentId: "s1", stageId: S1, status: "approved" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.noChange).toBeUndefined();
    const e = t.doc().stages[S1];
    expect(e).toMatchObject({ status: "approved", approvedBy: "teacher-1" });
    expect(e).not.toHaveProperty("selfReportedAt");
    expect(t.audits).toEqual([expect.objectContaining({ action: "project.stage.approve", details: expect.objectContaining({ verifiedSelfReport: true }) })]);
    expect(t.doc().history.at(-1)).toMatchObject({ stageId: S1, fromStatus: "approved", toStatus: "approved", verified: true, actor: "teacher-1" });
    expect((await t.board()).students[0].cells[S1]).toEqual({ status: "approved", score: null });
    const undo = await t.mark({ projectCode: CODE, stageIds: [S1], mark: false });
    expect(undo.jsonBody.results[0].error).toBe("teacher_approved");
  });

  it("bulk-confirms and bulk-cancels student marks", async () => {
    const t = setup();
    await t.mark({ projectCode: CODE, stageIds: [S1, S2], mark: true });
    await t.mark({ projectCode: CODE, stageIds: [S1], mark: true }, "s2");
    const ok = await t.teacher({ action: "progress.bulk", items: [{ studentId: "s1", stageId: S1 }, { studentId: "s2", stageId: S1 }], status: "approved" });
    expect(ok.jsonBody.totals).toEqual({ requested: 2, changed: 2, unchanged: 0, failed: 0 });
    expect(t.doc("s2").stages[S1].selfReportedAt).toBeUndefined();
    const back = await t.teacher({ action: "progress.bulk", items: [{ studentId: "s1", stageId: S2 }], status: "in_progress" });
    expect(back.jsonBody.totals.changed).toBe(1);
    expect(t.doc().stages[S2]).toMatchObject({ status: "in_progress" });
    expect(t.doc().stages[S2]).not.toHaveProperty("selfReportedAt");
    // confirming an already-confirmed stage is still a no-op
    const again = await t.teacher({ action: "progress.bulk", items: [{ studentId: "s1", stageId: S1 }], status: "approved" });
    expect(again.jsonBody.totals.unchanged).toBe(1);
  });

  it("a teacher score on a student-marked stage keeps it flagged as the student's own", async () => {
    const t = setup();
    await t.mark({ projectCode: CODE, stageIds: [S3], mark: true });
    await t.teacher({ action: "score.set", studentId: "s1", stageId: S3, score: 80 });
    expect(t.doc().stages[S3]).toMatchObject({ status: "approved", score: 80, selfReportedBy: "s1" });
  });
});

describe("P2 applySelfReport — pure", () => {
  it("throws NO_CHANGE with per-stage results when nothing changes", () => {
    let err = null;
    try { applySelfReport(null, { stageIds: ["A"], mark: false, studentId: "s1", now: NOW, programCode: CODE, classId: "c1" }); } catch (e) { err = e; }
    expect(err && err.code).toBe("NO_CHANGE");
    expect(err.results).toEqual([{ stageId: "A", ok: true, changed: false }]);
  });
  it("an unknown remembered status falls back to not_started on undo", () => {
    const cur = progressDoc("s1", { A: { status: "approved", selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "weird", approvedBy: "s1", approvedAt: NOW } });
    const { doc } = applySelfReport(cur, { stageIds: ["A"], mark: false, studentId: "s1", now: NOW, programCode: CODE, classId: "c1" });
    expect(doc.stages.A.status).toBe("not_started");
  });
});
