import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
import {
  TRAINING_MAX_STRENGTH_POINTS, strengthFromTrainingBest, trainingCountsTowardStrength, trainingMaxStrengthPoints,
  strengthFromTrainingResult, practicePointsFromTrainings, buildStrengthSummary, rankTierFromStrength
} from "../src/lib/student-strength.js";
import { normalizePracticeDoc, trainingEntry, applyTrainingResult, practicePointsOf, practiceDocName } from "../src/lib/learning-practice.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";
const req_ = createRequire(import.meta.url);
const ITEM = id => req_("../src/data/exam-library/items/" + id + ".json");

// Unified Strength × Learning Practice — the T / F distinction, enforced by the SERVER authority:
//   T01–T30  keep bestPercentage, derive bestPoints (≤ 25) and contribute to Unified Strength exactly as before;
//   F01–F06  keep bestPercentage / attempts as practice history, but bestPoints = 0, maxPoints = 0,
//            strengthEligible = false and they NEVER move practicePoints / totalPoints / rank.
// The rule lives in student-strength.js (trainingCountsTowardStrength) and is applied by practicePointsFromTrainings
// (the dashboard / profile path), by learning-practice.js (persisted bestPoints) and by the API responses.

const T_IDS = Array.from({ length: 30 }, (_, i) => "T" + String(i + 1).padStart(2, "0"));
const F_IDS = Array.from({ length: 6 }, (_, i) => "F0" + (i + 1));

describe("policy — which Learning-Practice ids feed Strength", () => {
  it("T01–T30 count (max 25 each); F01–F06 never count (max 0); malformed / foreign ids never count", () => {
    for (const id of T_IDS) { expect(trainingCountsTowardStrength(id), id).toBe(true); expect(trainingMaxStrengthPoints(id)).toBe(TRAINING_MAX_STRENGTH_POINTS); }
    for (const id of F_IDS) { expect(trainingCountsTowardStrength(id), id).toBe(false); expect(trainingMaxStrengthPoints(id)).toBe(0); }
    for (const bad of ["", null, undefined, "T", "t01", "TT01", "F", "X01", "T01;F01", 1]) { expect(trainingCountsTowardStrength(bad)).toBe(false); expect(trainingMaxStrengthPoints(bad)).toBe(0); }
    expect(trainingCountsTowardStrength(" T05 ")).toBe(true);                       // ids are trimmed like everywhere else
  });
  it("(1) a perfect T-series result still contributes up to 25 points; (2) F01 → 0; (3) F06 → 0 — whatever the percentage", () => {
    expect(strengthFromTrainingResult("T05", 100)).toBe(25); expect(strengthFromTrainingResult("T05", 80)).toBe(20); expect(strengthFromTrainingResult("T30", 40)).toBe(10);
    expect(strengthFromTrainingResult("T01", 100)).toBe(strengthFromTrainingBest(100));           // unchanged T semantics
    for (const pct of [0, 50, 85, 98, 100, 150, "100", NaN]) { expect(strengthFromTrainingResult("F01", pct)).toBe(0); expect(strengthFromTrainingResult("F06", pct)).toBe(0); }
  });
  it("(4) a practice document containing T + F entries sums ONLY the T entries for Unified Strength; stored bestPoints are never trusted", () => {
    const trainings = {
      T01: { bestPercentage: 100 }, T05: { bestPercentage: 80, bestPoints: 999 }, T30: { bestPercentage: 40 },
      F01: { bestPercentage: 100, bestPoints: 25 }, F03: { bestPercentage: 98, bestPoints: 999 }, F06: { bestPercentage: 85, bestPoints: 21 },
    };
    expect(practicePointsFromTrainings(trainings)).toBe(25 + 20 + 10);
    expect(practicePointsFromTrainings({ F01: { bestPercentage: 100 }, F02: { bestPercentage: 100 }, F03: { bestPercentage: 100 }, F04: { bestPercentage: 100 }, F05: { bestPercentage: 100 }, F06: { bestPercentage: 100 } })).toBe(0);
    // the dashboard / profile summary (the ONE total behind the rank images) sees the same thing
    const withF = buildStrengthSummary({ finalizedCount: 3, trainings, projects: [] });
    const withoutF = buildStrengthSummary({ finalizedCount: 3, trainings: { T01: trainings.T01, T05: trainings.T05, T30: trainings.T30 }, projects: [] });
    expect(withF.practicePoints).toBe(55); expect(withF).toEqual(withoutF);
    expect(withF.totalPoints).toBe(355); expect(withF.tier).toBeNull();                        // six perfect F exams cannot push 355 over the 400 boundary
    const allF = buildStrengthSummary({ finalizedCount: 3, trainings: Object.fromEntries(F_IDS.map(id => [id, { bestPercentage: 100 }])), projects: [] });
    expect(allF.practicePoints).toBe(0); expect(allF.totalPoints).toBe(300); expect(rankTierFromStrength(allF.totalPoints)).toBeNull();
  });
});

describe("storage — learning-practice.js derives bestPoints through the same rule", () => {
  it("(5) normalization of stored F entries: whatever bestPoints was stored (999, 25, '25') it comes back 0; T entries re-derive as before", () => {
    const doc = normalizePracticeDoc({ trainings: {
      T02: { bestPercentage: 80, bestPoints: 999, attempts: 2 },
      F01: { bestPercentage: 100, bestPoints: 999, attempts: 1 }, F06: { bestPercentage: 85, bestPoints: "25", attempts: 3, lastPercentage: 85 },
    } });
    expect(doc.trainings.T02).toMatchObject({ bestPercentage: 80, bestPoints: 20, attempts: 2 });
    expect(doc.trainings.F01).toMatchObject({ bestPercentage: 100, bestPoints: 0, attempts: 1 });   // history kept, points 0
    expect(doc.trainings.F06).toMatchObject({ bestPercentage: 85, bestPoints: 0, attempts: 3, lastPercentage: 85 });
    expect(practicePointsOf(doc)).toBe(20);
    expect(trainingEntry(doc, "F01")).toMatchObject({ bestPercentage: 100, bestPoints: 0 });
  });
  it("(5) retries / max-merge cannot make an F entry contribute: pointsGained is always 0, bestPoints stays 0, best percentage still never lowers", () => {
    let doc = null;
    const r1 = applyTrainingResult(doc, "F01", 60, "2026-09-20T10:00:00.000Z"); doc = r1.doc;
    expect(r1.after).toMatchObject({ bestPercentage: 60, bestPoints: 0, attempts: 1 }); expect(r1.pointsGained).toBe(0); expect(r1.improved).toBe(true);
    const r2 = applyTrainingResult(doc, "F01", 100, "2026-09-20T10:01:00.000Z"); doc = r2.doc;
    expect(r2.after).toMatchObject({ bestPercentage: 100, bestPoints: 0, attempts: 2 }); expect(r2.pointsGained).toBe(0); expect(r2.improved).toBe(true);
    const r3 = applyTrainingResult(doc, "F01", 10, "2026-09-20T10:02:00.000Z"); doc = r3.doc;
    expect(r3.after).toMatchObject({ bestPercentage: 100, bestPoints: 0, attempts: 3, lastPercentage: 10 }); expect(r3.pointsGained).toBe(0); expect(r3.improved).toBe(false);
    // a T retry on the same document behaves exactly as before
    const t = applyTrainingResult(doc, "T05", 100, "2026-09-20T10:03:00.000Z"); doc = t.doc;
    expect(t.after).toMatchObject({ bestPercentage: 100, bestPoints: 25, attempts: 1 }); expect(t.pointsGained).toBe(25);
    expect(practicePointsOf(doc)).toBe(25); expect(practicePointsFromTrainings(doc.trainings)).toBe(25);
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
const ORDER = listLearningModules("791381").map(m => m.moduleId);
const ALL = ORDER.slice(0, ORDER.indexOf("791381-m06") + 1);
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

describe("API — F submissions never advertise or award Strength; T submissions still do", () => {
  it("list / item: every T row advertises strengthEligible: true (maxPoints 25 once attempted); every F row strengthEligible: false (maxPoints 0)", async () => {
    const ctx = seed();
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.length).toBe(36);
    for (const t of list.jsonBody.trainings) expect(t.strengthEligible, t.trainingId).toBe(/^T/.test(t.trainingId));
    const t05 = await get(studentDeps(ctx), "T05"); expect(t05.jsonBody.training).toMatchObject({ strengthEligible: true, maxPoints: 25 });
    const f06 = await get(studentDeps(ctx), "F06"); expect(f06.jsonBody.training).toMatchObject({ strengthEligible: false, maxPoints: 0 });
  });
  it("F01 / F06 full answers: the real grader's percentage (94 / 82 — NOT manufactured to 100; F06: 127 auto-gradable of 154 marks since Q45 = 4 manual marks and Q41..Q44 = 3), best + attempts persisted, bestPoints / earnedPoints / pointsGained / maxPoints all 0; the persisted document yields 0 practice Strength", async () => {
    const ctx = seed();
    for (const [id, expectedPct] of [["F01", 94], ["F06", 82]]) {
      const answers = fullAnswers(id);
      const expected = gradeExam(ITEM(id).examSnapshot, answers);
      expect(Math.round(expected.percentage)).toBe(expectedPct);                   // the open questions stay in the total
      const r = await submit(studentDeps(ctx), id, { answers, percentage: 100, points: 25 });
      expect(r.status).toBe(200);
      expect(r.jsonBody.result.percentage).toBe(expectedPct);
      expect(r.jsonBody.practice).toEqual({ bestPercentage: expectedPct, bestPoints: 0, maxPoints: 0, attempts: 1, lastCompletedAt: r.jsonBody.practice.lastCompletedAt, improved: true, pointsGained: 0, earnedPoints: 0 });
      // a retry never lowers the best, still awards nothing
      const again = await submit(studentDeps(ctx), id, { answers: {} });
      expect(again.jsonBody.practice).toMatchObject({ bestPercentage: expectedPct, bestPoints: 0, maxPoints: 0, attempts: 2, improved: false, pointsGained: 0, earnedPoints: 0 });
    }
    const stored = ctx.getJson(practiceDocName("u1"));
    expect(stored.trainings.F01).toMatchObject({ bestPercentage: 94, bestPoints: 0, attempts: 2 });
    expect(stored.trainings.F06).toMatchObject({ bestPercentage: 82, bestPoints: 0, attempts: 2 });
    expect(practicePointsFromTrainings(stored.trainings)).toBe(0);
    expect(buildStrengthSummary({ finalizedCount: 0, trainings: stored.trainings, projects: [] }).totalPoints).toBe(0);
    // the list keeps the practice history visible, with maxPoints 0
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.find(t => t.trainingId === "F01").best).toMatchObject({ bestPercentage: 94, bestPoints: 0, maxPoints: 0, attempts: 2 });
  });
  it("T05 perfect answers on the same document still award 25 (unchanged T semantics); the document's practice Strength is exactly the T total", async () => {
    const ctx = seed();
    await submit(studentDeps(ctx), "F01", { answers: fullAnswers("F01") });
    const r = await submit(studentDeps(ctx), "T05", { answers: fullAnswers("T05") });
    expect(r.jsonBody.result.percentage).toBe(100);
    expect(r.jsonBody.practice).toMatchObject({ bestPercentage: 100, bestPoints: 25, maxPoints: 25, attempts: 1, improved: true, pointsGained: 25, earnedPoints: 25 });
    const stored = ctx.getJson(practiceDocName("u1"));
    expect(Object.keys(stored.trainings).sort()).toEqual(["F01", "T05"]);
    expect(practicePointsFromTrainings(stored.trainings)).toBe(25);
    expect(buildStrengthSummary({ finalizedCount: 0, trainings: stored.trainings, projects: [] })).toMatchObject({ practicePoints: 25, totalPoints: 25 });
  });
});
