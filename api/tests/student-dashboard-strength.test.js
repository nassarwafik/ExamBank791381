import { describe, it, expect } from "vitest";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { buildStrengthSummary, strengthFromLibraryBest, strengthFromModuleCompletion } from "../src/lib/student-strength.js";
import { studyDocName, studyModuleCompletionForStrength } from "../src/lib/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Unified Strength through the REAL dashboard (in-memory container) in the NEW 25-STAGE model: the dashboard builds
// `strength` with buildStrengthSummary({ trainings, moduleCompletion }) from EXACTLY two sources —
//   (a) the learning-practice summary (LIBRARY items T01–T30 AND F01–F06, best% × 40, ≤40 each), and
//   (b) the study completion state (28 book modules, completed/total × 20, ≤20 each) —
// and NOTHING else. Finalized exams and projects are NO LONGER Strength sources: this is a requirement the suite
// pins. The shape is { totalPoints, libraryPoints, modulePoints, stage, stageCount, stageSpan, withinStagePoints,
// nextStageRemaining, percent, nextStage, totalMax }: there is no examPoints/practicePoints/projectPoints/tier/level.

const NOW = "2026-09-20T10:00:00.000Z";
const COURSE = "791381";
const NS = { A: getStorageNamespace("899373") };
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
  return { programCode: code, classId: cid, studentId: sid, stages, history: [], updatedAt: NOW };
}
const finalAttempt = { attemptNumber: 1, submittedAt: NOW, score: 84, totalMarks: 100, percentage: 84, manualReviewMarks: 0, finalized: true, teacherFeedback: "" };
const assignment = (id, cid) => ({ assignmentId: id, classId: cid, status: "published", title: id, instructions: "", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", createdAt: NOW });

// A study document that fully completes the book module 791381-m01 (its three eligible in-page activities, verified
// against the committed key index api/src/data/learning-study/791381.json → m01 total = 3). Completing it awards the
// full 20-point module ceiling: strengthFromModuleCompletion(3, 3) === 20.
const studyDocCompletingM01 = {
  schemaVersion: 1,
  pages: {
    "791381-m01-l01-p01": { courseId: COURSE, moduleId: "791381-m01", completed: { "m01-l01-p01-q1": NOW } },
    "791381-m01-l01-p02": { courseId: COURSE, moduleId: "791381-m01", completed: { "m01-l01-p02-q1": NOW } },
    "791381-m01-l01-p03": { courseId: COURSE, moduleId: "791381-m01", completed: { "m01-l01-p03-q1": NOW } }
  }
};

/** The strength the policy MUST produce from the same two sources the dashboard reads (the authoritative expectation). */
const expectStrength = (trainings, studyDoc) => buildStrengthSummary({ trainings, moduleCompletion: studyModuleCompletionForStrength(studyDoc, [COURSE]) });

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

describe("dashboard strength — the 25-stage model (library + module sources only)", () => {
  it("LIBRARY (T + F) and MODULE completion feed ONE total; the summary has the new stage shape (T02 80% → 32, F01 100% → 40, m01 3/3 → 20 = 92 → stage 2)", async () => {
    const trainings = { T02: { bestPercentage: 80, bestPoints: 999, attempts: 2 }, F01: { bestPercentage: 100 } };
    const ctx = createMemoryContainer({
      "platform/classes/c1.json": room("c1"),
      "platform/users/s1.json": user("s1", "c1"),
      "platform/learning-practice/s1.json": { trainings },
      [studyDocName("s1")]: studyDocCompletingM01
    });
    const r = await dashboard(req(), deps(ctx).d);
    expect(r.status).toBe(200);
    const s = r.jsonBody.strength;
    // exact shape — no examPoints/practicePoints/projectPoints/tier/level anymore
    expect(Object.keys(s).sort()).toEqual(["libraryPoints", "modulePoints", "nextStage", "nextStageRemaining", "percent", "stage", "stageCount", "stageSpan", "totalMax", "totalPoints", "withinStagePoints"]);
    // derived from the policy: 32 (T02) + 40 (F01, F-series now counts) library, 20 (m01) module
    expect(s.libraryPoints).toBe(strengthFromLibraryBest(80) + strengthFromLibraryBest(100));   // 32 + 40 = 72
    expect(s.modulePoints).toBe(strengthFromModuleCompletion(3, 3));                             // 20
    expect(s.totalPoints).toBe(92);
    expect(s.stage).toBe(2);
    expect(s).toMatchObject({ stageCount: 25, stageSpan: 80, withinStagePoints: 12, nextStageRemaining: 68, percent: 15, nextStage: 3, totalMax: 2000 });
    // whole object equals what the shared policy derives from the SAME two sources
    expect(s).toEqual(expectStrength(trainings, studyDocCompletingM01));
  });

  it("REQUIREMENT: finalized exams and projects NO LONGER feed Strength — a fully-approved project + 4 finalized exams leave the total at 0 / stage 1", async () => {
    const seed = {
      "platform/classes/c1.json": room("c1", { programCodes: ["899373"] }),
      "platform/users/s1.json": user("s1", "c1"),
      [NS.A.progressName("c1", "s1")]: progressAt("899373", "c1", "s1", 1, 1)   // project 100% — ignored by Strength
    };
    for (const id of ["a1", "a2", "a3", "a4"]) { seed["platform/assignments/" + id + ".json"] = assignment(id, "c1"); seed["platform/submissions/" + id + "/s1.json"] = { assignmentId: id, studentId: "s1", classId: "c1", attempts: [finalAttempt], activeAttempt: null }; }
    const r = await dashboard(req(), deps(createMemoryContainer(seed)).d);
    expect(r.status).toBe(200);
    expect(r.jsonBody.stats.finalized).toBe(4);                                  // exams still counted in stats
    expect(r.jsonBody.strength).toMatchObject({ totalPoints: 0, libraryPoints: 0, modulePoints: 0, stage: 1, percent: 0 });
    expect(r.jsonBody.strength).toEqual(expectStrength(undefined, null));         // == an empty-source summary
  });

  it("stored bestPoints / client-shaped junk in the practice doc never count — only bestPercentage through the LIBRARY policy", async () => {
    const trainings = { T01: { bestPercentage: 60, bestPoints: 25 }, T09: "x", T02: { bestPercentage: "abc" } };
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/learning-practice/s1.json": { trainings, strengthPoints: 9999 } });
    const s = (await dashboard(req(), deps(ctx).d)).jsonBody.strength;
    expect(s.libraryPoints).toBe(strengthFromLibraryBest(60));                    // 24 — the only well-formed entry
    expect(s.modulePoints).toBe(0);
    expect(s.totalPoints).toBe(24);
    expect(s.stage).toBe(1);
  });

  it("no practice doc / no study doc → zeros, still ok, stage 1", async () => {
    const r = await dashboard(req(), deps(createMemoryContainer({ "platform/users/s1.json": user("s1", "") })).d);
    expect(r.status).toBe(200);
    expect(r.jsonBody.strength).toMatchObject({ totalPoints: 0, libraryPoints: 0, modulePoints: 0, stage: 1, stageCount: 25, percent: 0, nextStage: 2 });
    expect(r.jsonBody.strength).toEqual(expectStrength(undefined, null));
  });

  it("PERSISTED CLASS AUTHORITY + bounded reads: token says class STALE; the persisted class is loaded; exactly ONE practice read + ONE study read; users are never scanned; projects are never read for Strength", async () => {
    const trainings = { T05: { bestPercentage: 100 } };
    const ctx = createMemoryContainer({
      "platform/classes/c2.json": room("c2", { programCodes: ["899373"] }),
      "platform/users/s1.json": user("s1", "c2"),
      "platform/learning-practice/s1.json": { trainings },
      [studyDocName("s1")]: studyDocCompletingM01,
      [NS.A.progressName("c2", "s1")]: progressAt("899373", "c2", "s1", 1, 1)     // present but irrelevant to Strength
    });
    const { d, reads } = deps(ctx);
    const r = await dashboard(req(), d);
    expect(r.status).toBe(200);
    expect(r.jsonBody.strength.libraryPoints).toBe(strengthFromLibraryBest(100)); // 40
    expect(r.jsonBody.strength.modulePoints).toBe(20);
    expect(reads.filter(n => n.startsWith("platform/classes/"))).toEqual(["platform/classes/c2.json"]);        // persisted class only
    expect(reads.filter(n => n.startsWith("platform/learning-practice/"))).toEqual(["platform/learning-practice/s1.json"]);  // ONE practice read
    expect(reads.filter(n => n.startsWith("platform/learning-study/"))).toEqual([studyDocName("s1")]);          // ONE study read
    expect(reads.filter(n => n.startsWith("platform/project-"))).toEqual([]);     // projects never read for Strength
    expect(reads.filter(n => n.startsWith("platform/users/"))).toEqual([]);       // never scans users
  });

  it("archived class → 403 before any practice / study read (lifecycle not bypassed)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }), "platform/users/s1.json": user("s1", "c1"), "platform/learning-practice/s1.json": { trainings: { T01: { bestPercentage: 100 } } } });
    const { d, reads } = deps(ctx);
    const r = await dashboard(req(), d);
    expect(r.status).toBe(403);
    expect(reads.some(n => n.startsWith("platform/learning-practice/") || n.startsWith("platform/learning-study/"))).toBe(false);
  });
});
