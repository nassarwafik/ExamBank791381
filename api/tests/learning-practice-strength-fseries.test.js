import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
import {
  LIBRARY_ITEM_MAX_POINTS, strengthFromLibraryBest, trainingCountsTowardStrength, trainingMaxStrengthPoints,
  strengthFromTrainingResult, libraryPointsFromTrainings, buildStrengthSummary, gradableStrengthPercentage, stageForTotal
} from "../src/lib/student-strength.js";
import { normalizePracticeDoc, trainingEntry, applyTrainingResult, practicePointsOf, practiceDocName } from "../src/lib/learning-practice.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";
const req_ = createRequire(import.meta.url);
const ITEM = id => req_("../src/data/exam-library/items/" + id + ".json");

// Unified Strength × Learning Practice — the 25-stage LIBRARY source, enforced by the SERVER authority:
//   T01–T30  keep bestPercentage, derive bestPoints (≤ 40) and contribute to Unified Strength;
//   F01–F06  NOW COUNT TOO: every F-series final exam is a canonical library item worth up to 40, bestPoints
//            re-derived through the SAME rule, strengthEligible = true, maxPoints = 40. The best percentage stored
//            for an F item is the SERVER's GRADABLE-ONLY percentage (gradableStrengthPercentage): manual-review /
//            open-question marks leave the denominator, so an open-question final exam is scored over its reliably
//            auto-gradable portion only and is never understated to 0.
// The rule lives in student-strength.js (libraryItemCountsTowardStrength → T AND F) and is applied by
// libraryPointsFromTrainings (the dashboard / profile path), by learning-practice.js (persisted bestPoints) and
// by the API responses. Stored bestPoints are NEVER trusted — always re-derived from bestPercentage.

const T_IDS = Array.from({ length: 30 }, (_, i) => "T" + String(i + 1).padStart(2, "0"));
const F_IDS = Array.from({ length: 6 }, (_, i) => "F0" + (i + 1));

describe("policy — which Learning-Practice ids feed Strength", () => {
  it("T01–T30 AND F01–F06 all count (max 40 each); malformed / foreign ids never count", () => {
    for (const id of T_IDS) { expect(trainingCountsTowardStrength(id), id).toBe(true); expect(trainingMaxStrengthPoints(id)).toBe(LIBRARY_ITEM_MAX_POINTS); }
    for (const id of F_IDS) { expect(trainingCountsTowardStrength(id), id).toBe(true); expect(trainingMaxStrengthPoints(id)).toBe(LIBRARY_ITEM_MAX_POINTS); }
    expect(LIBRARY_ITEM_MAX_POINTS).toBe(40);
    for (const bad of ["", null, undefined, "T", "t01", "TT01", "F", "f01", "X01", "T01;F01", 1]) { expect(trainingCountsTowardStrength(bad)).toBe(false); expect(trainingMaxStrengthPoints(bad)).toBe(0); }
    expect(trainingCountsTowardStrength(" T05 ")).toBe(true);                       // ids are trimmed like everywhere else
    expect(trainingCountsTowardStrength(" F01 ")).toBe(true);
  });
  it("(1) a perfect result awards 40; (2) F01 and (3) F06 NOW award through the same library rule — round(bestPercentage × 40 / 100)", () => {
    expect(strengthFromTrainingResult("T05", 100)).toBe(40); expect(strengthFromTrainingResult("T05", 80)).toBe(32); expect(strengthFromTrainingResult("T30", 40)).toBe(16);
    expect(strengthFromTrainingResult("T01", 100)).toBe(strengthFromLibraryBest(100));           // T semantics
    // F items now contribute IDENTICALLY to T items — launch location can never change Strength
    expect(strengthFromTrainingResult("F01", 100)).toBe(40); expect(strengthFromTrainingResult("F06", 85)).toBe(34);
    for (const pct of [0, 50, 60, 85, 98, 100, 150, "100", NaN]) {
      expect(strengthFromTrainingResult("F01", pct)).toBe(strengthFromLibraryBest(pct));
      expect(strengthFromTrainingResult("F06", pct)).toBe(strengthFromLibraryBest(pct));
    }
    // spot-checks of the 40-point scale: 100→40, 90→36, 80→32, 60→24, 50→20, 40→16, 0→0
    expect([0, 40, 50, 60, 80, 90, 100].map(strengthFromLibraryBest)).toEqual([0, 16, 20, 24, 32, 36, 40]);
  });
  it("(4) a practice document containing T + F entries sums BOTH the T and the F entries for Unified Strength; stored bestPoints are never trusted", () => {
    const trainings = {
      T01: { bestPercentage: 100 }, T05: { bestPercentage: 80, bestPoints: 999 }, T30: { bestPercentage: 40 },
      F01: { bestPercentage: 100, bestPoints: 25 }, F03: { bestPercentage: 98, bestPoints: 999 }, F06: { bestPercentage: 85, bestPoints: 21 },
    };
    // T: 40 + 32 + 16 ; F: 40 + round(98×40/100)=39 + round(85×40/100)=34  → the stored 999 / 25 / 21 are ignored
    const expectedTotal = strengthFromLibraryBest(100) + strengthFromLibraryBest(80) + strengthFromLibraryBest(40)
      + strengthFromLibraryBest(100) + strengthFromLibraryBest(98) + strengthFromLibraryBest(85);
    expect(expectedTotal).toBe(201);
    expect(libraryPointsFromTrainings(trainings)).toBe(201);
    // six perfect F exams now DO contribute (6 × 40)
    expect(libraryPointsFromTrainings(Object.fromEntries(F_IDS.map(id => [id, { bestPercentage: 100 }])))).toBe(240);
    // the dashboard / profile summary (the ONE total behind the stage images) reads ONLY trainings + moduleCompletion
    const withF = buildStrengthSummary({ trainings });
    const withoutF = buildStrengthSummary({ trainings: { T01: trainings.T01, T05: trainings.T05, T30: trainings.T30 } });
    expect(withF.libraryPoints).toBe(201); expect(withF.modulePoints).toBe(0); expect(withF.totalPoints).toBe(201);
    expect(withF.stage).toBe(stageForTotal(201));                                   // floor(201/80)+1 = 3
    expect(withoutF.libraryPoints).toBe(88);                                        // 40 + 32 + 16
    expect(withF.libraryPoints).toBeGreaterThan(withoutF.libraryPoints);            // F now moves the total (the flip)
    const allF = buildStrengthSummary({ trainings: Object.fromEntries(F_IDS.map(id => [id, { bestPercentage: 100 }])) });
    expect(allF.libraryPoints).toBe(240); expect(allF.totalPoints).toBe(240); expect(allF.stage).toBe(stageForTotal(240));
  });
});

describe("storage — learning-practice.js derives bestPoints through the same rule (T AND F)", () => {
  it("(5) normalization of stored entries: whatever bestPoints was stored (999, 25, '25') is re-derived from bestPercentage — for F too", () => {
    const doc = normalizePracticeDoc({ trainings: {
      T02: { bestPercentage: 80, bestPoints: 999, attempts: 2 },
      F01: { bestPercentage: 100, bestPoints: 999, attempts: 1 }, F06: { bestPercentage: 85, bestPoints: "25", attempts: 3, lastPercentage: 85 },
    } });
    expect(doc.trainings.T02).toMatchObject({ bestPercentage: 80, bestPoints: 32, attempts: 2 });
    expect(doc.trainings.F01).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 1 });   // F now awards
    expect(doc.trainings.F06).toMatchObject({ bestPercentage: 85, bestPoints: 34, attempts: 3, lastPercentage: 85 });
    expect(practicePointsOf(doc)).toBe(32 + 40 + 34);
    expect(trainingEntry(doc, "F01")).toMatchObject({ bestPercentage: 100, bestPoints: 40 });
  });
  it("(5) retries / max-merge on an F entry: bestPoints re-derived, retries award only the improvement delta, best percentage never lowers", () => {
    let doc = null;
    const r1 = applyTrainingResult(doc, "F01", 60, "2026-09-20T10:00:00.000Z"); doc = r1.doc;
    expect(r1.after).toMatchObject({ bestPercentage: 60, bestPoints: 24, attempts: 1 }); expect(r1.pointsGained).toBe(24); expect(r1.improved).toBe(true);
    const r2 = applyTrainingResult(doc, "F01", 100, "2026-09-20T10:01:00.000Z"); doc = r2.doc;
    expect(r2.after).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 2 }); expect(r2.pointsGained).toBe(16); expect(r2.improved).toBe(true);   // only the delta 40−24
    const r3 = applyTrainingResult(doc, "F01", 10, "2026-09-20T10:02:00.000Z"); doc = r3.doc;
    expect(r3.after).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 3, lastPercentage: 10 }); expect(r3.pointsGained).toBe(0); expect(r3.improved).toBe(false);
    // a T retry on the same document behaves the same way
    const t = applyTrainingResult(doc, "T05", 100, "2026-09-20T10:03:00.000Z"); doc = t.doc;
    expect(t.after).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 1 }); expect(t.pointsGained).toBe(40);
    expect(practicePointsOf(doc)).toBe(80); expect(libraryPointsFromTrainings(doc.trainings)).toBe(80);   // F01 40 + T05 40
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

describe("API — BOTH T and F submissions advertise and award Strength (max 40)", () => {
  it("list / item: every T AND every F row advertises strengthEligible: true and maxPoints 40", async () => {
    const ctx = seed();
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.length).toBe(36);
    for (const t of list.jsonBody.trainings) expect(t.strengthEligible, t.trainingId).toBe(true);
    const t05 = await get(studentDeps(ctx), "T05"); expect(t05.jsonBody.training).toMatchObject({ strengthEligible: true, maxPoints: 40 });
    const f06 = await get(studentDeps(ctx), "F06"); expect(f06.jsonBody.training).toMatchObject({ strengthEligible: true, maxPoints: 40 });
  });
  it("F01 / F06 full answers: the displayed percentage stays the real grader's (94 / 85), but Strength uses the gradable-only percentage (100 → 40 points); best + attempts persisted; the document yields real practice Strength", async () => {
    const ctx = seed();
    for (const [id, rawPct] of [["F01", 94], ["F06", 85]]) {
      const answers = fullAnswers(id);
      const expected = gradeExam(ITEM(id).examSnapshot, answers);
      expect(Math.round(expected.percentage)).toBe(rawPct);                        // the open questions stay in the displayed total
      // the SERVER gradable-only percentage excludes the manual-review marks from the denominator
      const gradablePct = gradableStrengthPercentage({ score: expected.score, totalMarks: expected.totalMarks, manualReviewMarks: expected.manualReviewMarks });
      const bestPoints = strengthFromLibraryBest(gradablePct);
      expect(gradablePct).toBe(100); expect(bestPoints).toBe(40);                   // a perfect auto-gradable run → 100% → 40
      const r = await submit(studentDeps(ctx), id, { answers, percentage: 100, points: 25 });
      expect(r.status).toBe(200);
      expect(r.jsonBody.result.percentage).toBe(rawPct);                           // client-supplied 100 has no authority
      expect(r.jsonBody.practice).toEqual({ bestPercentage: gradablePct, bestPoints, maxPoints: 40, attempts: 1, lastCompletedAt: r.jsonBody.practice.lastCompletedAt, improved: true, pointsGained: bestPoints, earnedPoints: bestPoints });
      // a retry with no answers never lowers the best, awards nothing more
      const again = await submit(studentDeps(ctx), id, { answers: {} });
      expect(again.jsonBody.practice).toMatchObject({ bestPercentage: gradablePct, bestPoints, maxPoints: 40, attempts: 2, improved: false, pointsGained: 0, earnedPoints: bestPoints });
    }
    const stored = ctx.getJson(practiceDocName("u1"));
    expect(stored.trainings.F01).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 2 });
    expect(stored.trainings.F06).toMatchObject({ bestPercentage: 100, bestPoints: 40, attempts: 2 });
    expect(libraryPointsFromTrainings(stored.trainings)).toBe(80);
    expect(buildStrengthSummary({ trainings: stored.trainings }).totalPoints).toBe(80);
    // the list keeps the practice history visible, with maxPoints 40 and real points
    const list = await get(studentDeps(ctx));
    expect(list.jsonBody.trainings.find(t => t.trainingId === "F01").best).toMatchObject({ bestPercentage: 100, bestPoints: 40, maxPoints: 40, attempts: 2 });
  });
  it("T05 perfect answers on the same document award 40; the document's practice Strength is the T + F total", async () => {
    const ctx = seed();
    await submit(studentDeps(ctx), "F01", { answers: fullAnswers("F01") });
    const r = await submit(studentDeps(ctx), "T05", { answers: fullAnswers("T05") });
    expect(r.jsonBody.result.percentage).toBe(100);
    expect(r.jsonBody.practice).toMatchObject({ bestPercentage: 100, bestPoints: 40, maxPoints: 40, attempts: 1, improved: true, pointsGained: 40, earnedPoints: 40 });
    const stored = ctx.getJson(practiceDocName("u1"));
    expect(Object.keys(stored.trainings).sort()).toEqual(["F01", "T05"]);
    expect(libraryPointsFromTrainings(stored.trainings)).toBe(80);                  // F01 40 + T05 40
    expect(buildStrengthSummary({ trainings: stored.trainings })).toMatchObject({ libraryPoints: 80, totalPoints: 80 });
  });
});
