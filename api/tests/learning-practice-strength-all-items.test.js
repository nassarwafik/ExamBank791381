import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
import {
  LEARNING_PRACTICE_MAX_POINTS, strengthFromTrainingBest, isLearningPracticeItem, trainingMaxStrengthPoints,
  strengthFromTrainingResult, practicePointsFromTrainings, buildStrengthSummary
} from "../src/lib/student-strength.js";
import { normalizePracticeDoc, trainingEntry, applyTrainingResult, practicePointsOf, practiceDocName } from "../src/lib/learning-practice.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";
const req_ = createRequire(import.meta.url);
const ITEM = id => req_("../src/data/exam-library/items/" + id + ".json");

// Unified Strength × Learning Practice — ALL 36 canonical items feed Strength with the same 40-point ceiling:
//   T01–T30 AND F01–F06: bestPoints = round(bestPercentage × 40 / 100), maxPoints 40, strengthEligible true.
// One id = ONE bucket: the Training Library and the Learning-Materials Reader submit to the same route for the same
// id, so there is never a second T10. Best percentage only (retry delta = best improvement, never a counter), stored
// bestPoints ignored. The rule lives in student-strength.js and is applied by learning-practice.js (persisted
// bestPoints), practicePointsFromTrainings (dashboard / profile) and the API responses.

const T_IDS = Array.from({ length: 30 }, (_, i) => "T" + String(i + 1).padStart(2, "0"));
const F_IDS = Array.from({ length: 6 }, (_, i) => "F0" + (i + 1));
const ALL_IDS = [...T_IDS, ...F_IDS];

describe("policy — every Learning-Practice id feeds Strength", () => {
  it("T01–T30 and F01–F06 all count (max 40 each = 1440); malformed / foreign ids never count", () => {
    for (const id of ALL_IDS) { expect(isLearningPracticeItem(id), id).toBe(true); expect(trainingMaxStrengthPoints(id)).toBe(LEARNING_PRACTICE_MAX_POINTS); }
    expect(ALL_IDS.length * LEARNING_PRACTICE_MAX_POINTS).toBe(1440);
    for (const bad of ["", null, undefined, "T", "t01", "TT01", "F", "F07", "X01", "T01;F01", 1]) { expect(isLearningPracticeItem(bad)).toBe(false); expect(trainingMaxStrengthPoints(bad)).toBe(0); }
    expect(isLearningPracticeItem(" T05 ")).toBe(true);
  });
  it("F01 / F06 earn exactly like a T item: 100% = 40, 85% = 34, 50% = 20; T05 80% = 32", () => {
    expect(strengthFromTrainingResult("F01", 100)).toBe(40); expect(strengthFromTrainingResult("F06", 85)).toBe(34); expect(strengthFromTrainingResult("F03", 50)).toBe(20);
    expect(strengthFromTrainingResult("T05", 80)).toBe(32); expect(strengthFromTrainingResult("T30", 40)).toBe(16);
    expect(strengthFromTrainingResult("T01", 100)).toBe(strengthFromTrainingBest(100));
    for (const pct of [150, "100", NaN, -5]) expect(strengthFromTrainingResult("F01", pct)).toBe(strengthFromTrainingBest(pct));
  });
  it("a practice document with T + F entries sums ALL of them; stored bestPoints are never trusted", () => {
    const trainings = {
      T01: { bestPercentage: 100 }, T05: { bestPercentage: 80, bestPoints: 999 }, T30: { bestPercentage: 40 },
      F01: { bestPercentage: 100, bestPoints: 25 }, F03: { bestPercentage: 98, bestPoints: 999 }, F06: { bestPercentage: 85, bestPoints: 21 },
    };
    expect(practicePointsFromTrainings(trainings)).toBe(40 + 32 + 16 + 40 + 39 + 34);
    expect(practicePointsFromTrainings(Object.fromEntries(F_IDS.map(id => [id, { bestPercentage: 100 }])))).toBe(240);
    const s = buildStrengthSummary({ finalizedCount: 3, trainings, projects: [] });
    expect(s).toMatchObject({ practicePoints: 201, rawTotalPoints: 501, stageNumber: 7, withinStagePoints: 21 });
  });
});

describe("storage — learning-practice.js derives bestPoints through the same rule", () => {
  it("normalization re-derives every entry: stored bestPoints 999 / 25 / '25' are ignored; F entries earn like T entries", () => {
    const doc = normalizePracticeDoc({ trainings: {
      T02: { bestPercentage: 80, bestPoints: 999, attempts: 2 },
      F01: { bestPercentage: 100, bestPoints: 999, attempts: 1 }, F06: { bestPercentage: 85, bestPoints: "25", attempts: 3, lastPercentage: 85 },
    } });
    expect(doc.trainings.T02).toMatchObject({ bestPercentage: 80, bestPoints: 32, attempts: 2 });
    expect(doc.trainings.F01).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 1 });
    expect(doc.trainings.F06).toMatchObject({ bestPercentage: 85, bestPoints: 34, attempts: 3, lastPercentage: 85 });
    expect(practicePointsOf(doc)).toBe(32 + 40 + 34);
    expect(trainingEntry(doc, "F01")).toMatchObject({ bestPercentage: 100, bestPoints: 40 });
    expect(normalizePracticeDoc({ trainings: { T08: { bestPercentage: 80, bestPoints: 20 } } }).trainings.T08.bestPoints).toBe(32);   // the owner's example
  });
  it("retry deltas: T08 50% → 20 (+20); retry 80% → 32 (+12 only); retry 70% → +0; retry 80% → +0; the best never lowers", () => {
    let doc = null;
    const r1 = applyTrainingResult(doc, "T08", 50, "2026-09-20T10:00:00.000Z"); doc = r1.doc;
    expect(r1.after).toMatchObject({ bestPercentage: 50, bestPoints: 20, attempts: 1 }); expect(r1.pointsGained).toBe(20); expect(r1.improved).toBe(true);
    const r2 = applyTrainingResult(doc, "T08", 80, "2026-09-20T10:01:00.000Z"); doc = r2.doc;
    expect(r2.after).toMatchObject({ bestPercentage: 80, bestPoints: 32, attempts: 2 }); expect(r2.pointsGained).toBe(12); expect(r2.improved).toBe(true);
    const r3 = applyTrainingResult(doc, "T08", 70, "2026-09-20T10:02:00.000Z"); doc = r3.doc;
    expect(r3.after).toMatchObject({ bestPercentage: 80, bestPoints: 32, attempts: 3, lastPercentage: 70 }); expect(r3.pointsGained).toBe(0); expect(r3.improved).toBe(false);
    const r4 = applyTrainingResult(doc, "T08", 80, "2026-09-20T10:03:00.000Z"); doc = r4.doc;
    expect(r4.pointsGained).toBe(0); expect(r4.improved).toBe(false); expect(r4.after.attempts).toBe(4);
    // an F item behaves identically
    const f = applyTrainingResult(doc, "F01", 60, "2026-09-20T10:04:00.000Z"); doc = f.doc;
    expect(f.after).toMatchObject({ bestPercentage: 60, bestPoints: 24, attempts: 1 }); expect(f.pointsGained).toBe(24);
    const f2 = applyTrainingResult(doc, "F01", 100, "2026-09-20T10:05:00.000Z"); doc = f2.doc;
    expect(f2.after).toMatchObject({ bestPercentage: 100, bestPoints: 40 }); expect(f2.pointsGained).toBe(16);
    expect(practicePointsOf(doc)).toBe(32 + 40); expect(practicePointsFromTrainings(doc.trainings)).toBe(72);
  });
});

// ── through the real handler ─────────────────────────────────────────────────────────────────────────────────────
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (id, visible) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: "791381", visibleModuleIds: visible }] });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const studentDeps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const get = (deps, trainingId) => handler({ method: "GET", url: "https://x/api/learning-training", headers: { get: () => null }, params: trainingId ? { trainingId } : {} }, deps);
const submit = (deps, trainingId, answers) => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId, action: "submit" }, json: async () => answers }, deps);
const dash = ctx => dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
  requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
  downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
});
const ORDER = listLearningModules("791381").map(m => m.moduleId);
const ALL = ORDER;   // every module published: T08 needs m11, T10 needs m13, the F exams m06
const seed = () => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", ALL) });
function fullAnswers(id) {
  const out = {};
  for (const q of ITEM(id).examSnapshot.questions) {
    const type = String(q.presentationType || "").toLowerCase();
    if (type === "multiplechoice" || type === "truefalse") out[q.examQuestionId] = { kind: "choice", index: Number(q.answer.correctOptionIndex) };
    else if (type === "matching") {
      const pairs = new Map(String(q.answer?.text || "").split(/[؛;]/).map(p => p.split("=")).filter(p => p.length >= 2).map(p => [p[0].trim(), p.slice(1).join("=").trim()]));
      const rows = String(q.text).split("\n").filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1).map(l => l.split("|")[1].trim());
      out[q.examQuestionId] = { kind: "table", values: rows.map(r => pairs.get(r) ?? "") };
    } else out[q.examQuestionId] = { kind: "text", value: "إجابة مقالية" };
  }
  return out;
}
/** Answers for the first `n` questions of a T item (10 MCQs, 10 marks each). */
function partialAnswers(id, n) {
  const out = {};
  ITEM(id).examSnapshot.questions.slice(0, n).forEach(q => { out[q.examQuestionId] = { kind: "choice", index: Number(q.answer.correctOptionIndex) }; });
  return out;
}

describe("API — every item advertises and awards Strength (max 40)", () => {
  it("list / item: all 36 rows strengthEligible: true; T05 and F06 both advertise maxPoints 40", async () => {
    const ctx = seed();
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.length).toBe(36);
    for (const t of list.jsonBody.trainings) expect(t.strengthEligible, t.trainingId).toBe(true);
    const t05 = await get(studentDeps(ctx), "T05"); expect(t05.jsonBody.training).toMatchObject({ strengthEligible: true, maxPoints: 40 });
    const f06 = await get(studentDeps(ctx), "F06"); expect(f06.jsonBody.training).toMatchObject({ strengthEligible: true, maxPoints: 40 });
    expect(JSON.stringify(list.jsonBody)).not.toMatch(/"maxPoints":(0|25)\b/);
  });
  it("F01 / F06 full answers: the real grader's percentage (94 / 85 — NOT manufactured to 100) becomes round(pct × 40 / 100) points; best + attempts persisted; a retry never lowers", async () => {
    const ctx = seed();
    for (const [id, expectedPct] of [["F01", 94], ["F06", 85]]) {
      const answers = fullAnswers(id);
      const expected = gradeExam(ITEM(id).examSnapshot, answers);
      expect(Math.round(expected.percentage)).toBe(expectedPct);                   // the open questions stay in the total
      const pts = Math.round(expectedPct * 40 / 100);
      const r = await submit(studentDeps(ctx), id, { answers, percentage: 100, points: 40 });
      expect(r.status).toBe(200);
      expect(r.jsonBody.result.percentage).toBe(expectedPct);
      expect(r.jsonBody.practice).toEqual({ bestPercentage: expectedPct, bestPoints: pts, maxPoints: 40, attempts: 1, lastCompletedAt: r.jsonBody.practice.lastCompletedAt, improved: true, pointsGained: pts, earnedPoints: pts });
      const again = await submit(studentDeps(ctx), id, { answers: {} });
      expect(again.jsonBody.practice).toMatchObject({ bestPercentage: expectedPct, bestPoints: pts, maxPoints: 40, attempts: 2, improved: false, pointsGained: 0, earnedPoints: pts });
    }
    const stored = ctx.getJson(practiceDocName("u1"));
    expect(stored.trainings.F01).toMatchObject({ bestPercentage: 94, bestPoints: 38, attempts: 2 });
    expect(stored.trainings.F06).toMatchObject({ bestPercentage: 85, bestPoints: 34, attempts: 2 });
    expect(practicePointsFromTrainings(stored.trainings)).toBe(72);
    expect(buildStrengthSummary({ finalizedCount: 0, trainings: stored.trainings, projects: [] })).toMatchObject({ practicePoints: 72, rawTotalPoints: 72, stageNumber: 1 });
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.find(t => t.trainingId === "F01").best).toMatchObject({ bestPercentage: 94, bestPoints: 38, maxPoints: 40, attempts: 2 });
    expect((await dash(ctx)).jsonBody.strength).toMatchObject({ practicePoints: 72, rawTotalPoints: 72, stagePoints: 72, stageNumber: 1, withinStagePoints: 72 });
  });
  it("T08: 50% → 20 / 40 (+20); retry 80% → 32 / 40 (+12 only); retry 70% → +0; the dashboard reflects the ONE best", async () => {
    const ctx = seed();
    const r1 = await submit(studentDeps(ctx), "T08", { answers: partialAnswers("T08", 5) });
    expect(r1.jsonBody.result.percentage).toBe(50);
    expect(r1.jsonBody.practice).toMatchObject({ bestPercentage: 50, bestPoints: 20, maxPoints: 40, attempts: 1, improved: true, pointsGained: 20, earnedPoints: 20 });
    const r2 = await submit(studentDeps(ctx), "T08", { answers: partialAnswers("T08", 8) });
    expect(r2.jsonBody.practice).toMatchObject({ bestPercentage: 80, bestPoints: 32, attempts: 2, improved: true, pointsGained: 12, earnedPoints: 32 });
    const r3 = await submit(studentDeps(ctx), "T08", { answers: partialAnswers("T08", 7) });
    expect(r3.jsonBody.practice).toMatchObject({ bestPercentage: 80, bestPoints: 32, attempts: 3, improved: false, pointsGained: 0, earnedPoints: 32 });
    expect((await dash(ctx)).jsonBody.strength).toMatchObject({ practicePoints: 32, rawTotalPoints: 32 });
  });
  it("READER AND LIBRARY ARE THE SAME ITEM: T10 solved twice through the same id (as the Reader block and the Training Library both do) is ONE bucket — never 40 + 40; an improvement from either surface is the ONE best the portal shows", async () => {
    const ctx = seed();
    // "Library": 60% → 24
    const lib = await submit(studentDeps(ctx), "T10", { answers: partialAnswers("T10", 6) });
    expect(lib.jsonBody.practice).toMatchObject({ bestPercentage: 60, bestPoints: 24, attempts: 1, pointsGained: 24 });
    expect((await dash(ctx)).jsonBody.strength.practicePoints).toBe(24);
    // "Reader": the same T10 at 100% → the same bucket rises to 40 (+16), attempts 2 — no second entry
    const reader = await submit(studentDeps(ctx), "T10", { answers: partialAnswers("T10", 10) });
    expect(reader.jsonBody.practice).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 2, improved: true, pointsGained: 16, earnedPoints: 40 });
    const stored = ctx.getJson(practiceDocName("u1"));
    expect(Object.keys(stored.trainings)).toEqual(["T10"]);
    expect(stored.trainings.T10).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 2 });
    expect(practicePointsFromTrainings(stored.trainings)).toBe(40);
    const d = await dash(ctx);
    expect(d.jsonBody.strength).toMatchObject({ practicePoints: 40, rawTotalPoints: 40, stagePoints: 40, stageNumber: 1, withinStagePoints: 40, stagePercent: 50 });
    // the list shows ONE T10 with the merged best, and the item view agrees
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.filter(t => t.trainingId === "T10")).toHaveLength(1);
    expect(list.jsonBody.trainings.find(t => t.trainingId === "T10").best).toMatchObject({ bestPercentage: 100, bestPoints: 40, maxPoints: 40, attempts: 2 });
    expect((await get(studentDeps(ctx), "T10")).jsonBody.best).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 2 });
  });
  it("36 perfect items through the policy = 1440 practice points = stage 19 on the path (1440 / 80 = 18 → stage 19, 0 / 80)", async () => {
    const s = buildStrengthSummary({ finalizedCount: 0, trainings: Object.fromEntries(ALL_IDS.map(id => [id, { bestPercentage: 100 }])), projects: [] });
    expect(s).toMatchObject({ practicePoints: 1440, rawTotalPoints: 1440, stageNumber: 19, withinStagePoints: 0, stagePercent: 0 });
  });
});
