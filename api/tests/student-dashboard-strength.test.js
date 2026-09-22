import { describe, it, expect } from "vitest";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Unified Strength through the REAL dashboard + the REAL project engine (in-memory container): project points are
// derived from the same `core.buildStudentSummary` the student project tracker uses (one shared loader), practice
// points from ONE per-student practice summary read, exam points from the dashboard's own finalized count.

const NOW = "2026-09-20T10:00:00.000Z";
const NS = { A: getStorageNamespace("899373"), B: getStorageNamespace("883589"), L: getStorageNamespace("794589") };
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "S" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [], createdAt: "2026-01-01", updatedAt: NOW, ...extra });
/** A progress doc whose approved required stages give exact per-track percentages (book / second track). */
function progressAt(code, cid, sid, bookFraction, otherFraction) {
  const def = getProjectDefinition(code);
  const tracks = def.tracks.map(t => t.trackId);
  const ids = t => def.stages.filter(s => s.track === t && s.required === true && s.active === true).map(s => s.stageId);
  const stages = {};
  const pick = (list, fraction) => list.slice(0, Math.round(list.length * fraction));
  for (const id of pick(ids(tracks[0]), bookFraction)) stages[id] = { status: "approved", approvedAt: NOW, updatedAt: NOW };
  for (const id of pick(ids(tracks[1]), otherFraction)) stages[id] = { status: "approved", approvedAt: NOW, updatedAt: NOW };
  // a ready_for_review stage never counts toward progress
  const extra = ids(tracks[0]).find(id => !stages[id]); if (extra) stages[extra] = { status: "ready_for_review", updatedAt: NOW };
  return { programCode: code, classId: cid, studentId: sid, stages, history: [], updatedAt: NOW };
}
const finalAttempt = { attemptNumber: 1, submittedAt: NOW, score: 84, totalMarks: 100, percentage: 84, manualReviewMarks: 0, finalized: true, teacherFeedback: "" };
const assignment = (id, cid) => ({ assignmentId: id, classId: cid, status: "published", title: id, instructions: "", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", createdAt: NOW });
function deps(ctx, id = "s1", extra = {}) {
  const reads = [];
  return { reads, d: {
    requireActiveStudentSession: async () => { const student = ctx.getJson("platform/users/" + id + ".json"); return student ? { ok: true, container: ctx.container, user: { sub: id, sv: 1, classId: "STALE" }, student } : { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }; },
    downloadJsonOrNull: async (_c, n) => { reads.push(n); return ctx.getJson(n); },
    listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    ...extra
  } };
}
const req = () => ({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } });

describe("dashboard strength — project-only students (the reported problem)", () => {
  it("PROJECT-ONLY 50%: 0 assignments, no practice, 899373 at book 50% / access 50% → strength 200 = stage 3, 40 / 80, 50%", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: ["899373"] }), "platform/users/s1.json": user("s1", "c1"), [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 0.5, 0.5) });
    const { d } = deps(ctx);
    const r = await dashboard(req(), d);
    expect(r.status).toBe(200);
    expect(r.jsonBody.stats.finalized).toBe(0);
    expect(r.jsonBody.strength).toMatchObject({ totalPoints: 200, rawTotalPoints: 200, examPoints: 0, practicePoints: 0, studyPoints: 0, projectPoints: 200, stagePoints: 200, stageNumber: 3, withinStagePoints: 40, stagePercent: 50, nextStageNumber: 4, nextStageRemaining: 40, stageBlockSize: 80, stageMaxPoints: 2000, stageCount: 25, isMaximumStage: false, pathComplete: false });
    expect(r.jsonBody.strength.projects).toEqual([{ projectCode: "899373", overallProgress: 50, strengthPoints: 200 }]);
    // the SAME authority as the student project tracker
    const t = await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", headers: { get: () => null } }, deps(ctx).d);
    expect(t.jsonBody.projects[0].summary.overallProgress).toBe(50);
  });
  it("PROJECT-ONLY 100%: 400 points = stage 6 (0 / 80) with zero assignments", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: ["899373"] }), "platform/users/s1.json": user("s1", "c1"), [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 1, 1) });
    const r = await dashboard(req(), deps(ctx).d);
    expect(r.jsonBody.strength).toMatchObject({ totalPoints: 400, projectPoints: 400, stageNumber: 6, withinStagePoints: 0, stagePercent: 0 });
  });
  it("MULTI-PROJECT: 899373 at 50% + legacy 794589 at 25% (book 27/54, packetTracer 0) → 300; each project once; unsupported codes ignored", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/c1.json": room("c1", { programCodes: ["899373", "794589", "899373", "000000"] }),
      "platform/users/s1.json": user("s1", "c1"),
      [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 0.5, 0.5),
      [NS.L.progressName("c1", "s1")]: progressAt("794589", "c1", "s1", 0.5, 0)
    });
    const r = await dashboard(req(), deps(ctx).d);
    expect(r.jsonBody.strength.projects).toEqual([{ projectCode: "899373", overallProgress: 50, strengthPoints: 200 }, { projectCode: "794589", overallProgress: 25, strengthPoints: 100 }]);
    expect(r.jsonBody.strength.projectPoints).toBe(300);
  });
  it("DERIVED: reading twice awards nothing extra; a teacher correction to lower progress lowers the contribution", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: ["899373"] }), "platform/users/s1.json": user("s1", "c1"), [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 1, 0.5) });
    expect((await dashboard(req(), deps(ctx).d)).jsonBody.strength.projectPoints).toBe(300);
    expect((await dashboard(req(), deps(ctx).d)).jsonBody.strength.projectPoints).toBe(300);
    ctx.setJson(NS.A.progressName("c1", "s1"), progressAt("899373", "c1", "s1", 0.5, 0));
    expect((await dashboard(req(), deps(ctx).d)).jsonBody.strength.projectPoints).toBe(100);
  });
});

describe("dashboard strength — mixed sources, compatibility, authority, read path", () => {
  it("MIXED: 3 finalized exams (300) + T02 best 80% (32) + project 50% (200) = 532 → stage 7, 52 / 80, 65%, 28 remaining", async () => {
    const seed = { "platform/classes/c1.json": room("c1", { programCodes: ["899373"] }), "platform/users/s1.json": user("s1", "c1"), [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 0.5, 0.5),
      "platform/learning-practice/s1.json": { trainings: { T02: { bestPercentage: 80, bestPoints: 999, attempts: 2 } } } };
    for (const id of ["a1", "a2", "a3"]) { seed["platform/assignments/" + id + ".json"] = assignment(id, "c1"); seed["platform/submissions/" + id + "/s1.json"] = { assignmentId: id, studentId: "s1", classId: "c1", attempts: [finalAttempt], activeAttempt: null }; }
    const r = await dashboard(req(), deps(createMemoryContainer(seed)).d);
    expect(r.jsonBody.stats.finalized).toBe(3);
    expect(r.jsonBody.strength).toMatchObject({ totalPoints: 532, rawTotalPoints: 532, examPoints: 300, practicePoints: 32, projectPoints: 200, stageNumber: 7, withinStagePoints: 52, nextStageNumber: 8, nextStageRemaining: 28, stagePercent: 65 });
  });
  it("EXAMS ONLY (no class projects, no practice): 3 finalized = 300 = stage 4 (60 / 80, 75%); 4 = 400 = stage 6 (0 / 80)", async () => {
    const mk = n => { const seed = { "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") }; for (let i = 0; i < n; i++) { seed["platform/assignments/a" + i + ".json"] = assignment("a" + i, "c1"); seed["platform/submissions/a" + i + "/s1.json"] = { assignmentId: "a" + i, studentId: "s1", classId: "c1", attempts: [finalAttempt], activeAttempt: null }; } return createMemoryContainer(seed); };
    expect((await dashboard(req(), deps(mk(3)).d)).jsonBody.strength).toMatchObject({ totalPoints: 300, stageNumber: 4, withinStagePoints: 60, stagePercent: 75 });
    expect((await dashboard(req(), deps(mk(4)).d)).jsonBody.strength).toMatchObject({ totalPoints: 400, stageNumber: 6, withinStagePoints: 0, stagePercent: 0 });
  });
  it("PERSISTED CLASS AUTHORITY: token says class STALE; persisted class c2's project drives the points; no scans, bounded reads", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c2.json": room("c2", { programCodes: ["899373"] }), "platform/classes/c1.json": room("c1", { programCodes: ["883589"] }), "platform/users/s1.json": user("s1", "c2"), [NS.A.progressName("c2", "s1")]: progressAt("899373", "c2", "s1", 1, 1), [NS.B.progressName("c1", "s1")]: progressAt("883589", "c1", "s1", 1, 1) });
    const { d, reads } = deps(ctx);
    const r = await dashboard(req(), d);
    expect(r.jsonBody.strength.projects).toEqual([{ projectCode: "899373", overallProgress: 100, strengthPoints: 400 }]);
    expect(reads.filter(n => n.startsWith("platform/classes/"))).toEqual(["platform/classes/c2.json"]);
    expect(reads.filter(n => n.startsWith("platform/project-"))).toEqual([NS.A.configName("c2"), NS.A.progressName("c2", "s1")]);   // exactly one config + one progress read
    expect(reads.filter(n => n.startsWith("platform/learning-practice/"))).toEqual(["platform/learning-practice/s1.json"]);   // ONE practice read
    expect(reads.filter(n => n.startsWith("platform/users/"))).toEqual([]);   // never scans users
  });
  it("no class / no projects / no practice doc → zeros, still ok", async () => {
    const r = await dashboard(req(), deps(createMemoryContainer({ "platform/users/s1.json": user("s1", "") })).d);
    expect(r.status).toBe(200);
    expect(r.jsonBody.strength).toMatchObject({ totalPoints: 0, examPoints: 0, practicePoints: 0, projectPoints: 0, projects: [] });
  });
  it("archived class → 403 before any project/practice read (lifecycle not bypassed)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { status: "archived", active: false, programCodes: ["899373"] }), "platform/users/s1.json": user("s1", "c1"), [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 1, 1) });
    const { d, reads } = deps(ctx);
    const r = await dashboard(req(), d);
    expect(r.status).toBe(403);
    expect(reads.some(n => n.startsWith("platform/project-") || n.startsWith("platform/learning-practice/"))).toBe(false);
  });
  it("stored bestPoints / client-shaped junk in the practice doc never count — only bestPercentage through the policy", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/learning-practice/s1.json": { trainings: { T01: { bestPercentage: 60, bestPoints: 25 }, T09: "x", T02: { bestPercentage: "abc" } }, strengthPoints: 9999 } });
    expect((await dashboard(req(), deps(ctx).d)).jsonBody.strength.practicePoints).toBe(24);
  });
});
