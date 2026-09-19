import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { listLearningTrainings, findLearningTraining, trainingAllowedForClass } from "../src/lib/learning-training-registry.js";
import { normalizePracticeDoc, applyTrainingResult, practicePointsOf, practiceDocName } from "../src/lib/learning-practice.js";
const req_ = createRequire(import.meta.url);
const ITEM = id => req_("../src/data/exam-library/items/" + id + ".json");

// Learning Practice API — T01–T04 through the REAL handler, the REAL sanitizer, the REAL grader and the REAL
// library items, over the in-memory container: answer-key secrecy, the PR #117 progressive-release gate, persisted
// class authority, lifecycle, server grading, best-score anti-farming and CAS concurrency.

const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1", ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: visible === null ? [] : [{ courseId: "791381", visibleModuleIds: visible }], ...extra });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
function studentDeps(ctx, id = "u1", extra = {}) {
  return { ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, ...extra };
}
const teacherDeps = ctx => ({ ...BUILDER_OK, container: ctx.container, getContainer: () => ctx.container });
const get = (deps, trainingId) => handler({ method: "GET", url: "https://x/api/learning-training", headers: { get: () => null }, params: trainingId ? { trainingId } : {} }, deps);
const submit = (deps, trainingId, answers) => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId, action: "submit" }, json: async () => answers }, deps);
/** Answers scoring exactly `correct` of the 10 questions of an item (the rest deliberately wrong). */
function answersFor(id, correct) {
  const qs = ITEM(id).examSnapshot.questions;
  const out = {};
  qs.forEach((q, i) => { const key = Number(q.answer.correctOptionIndex); out[q.examQuestionId] = { kind: "choice", index: i < correct ? key : (key + 1) % q.options.length }; });
  return out;
}
const seed = (visible, extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible), ...extra });

describe("registry — the canonical T-series mapping", () => {
  it("T01 → m01 · T02 → m02 · T03/T04 → m07, in book order, real library titles", () => {
    expect(listLearningTrainings()).toEqual([
      { trainingId: "T01", order: 1, label: "تدريب 1", title: "أساسيات الشبكات", courseId: "791381", requiredModuleId: M01 },
      { trainingId: "T02", order: 2, label: "تدريب 2", title: "أنظمة العد", courseId: "791381", requiredModuleId: M02 },
      { trainingId: "T03", order: 3, label: "تدريب 3", title: "عناوين IPv4 وصلاحية العنوان", courseId: "791381", requiredModuleId: M07 },
      { trainingId: "T04", order: 4, label: "تدريب 4", title: "العناوين الخاصة والعامة", courseId: "791381", requiredModuleId: M07 }
    ]);
    for (const id of ["T01", "T02", "T03", "T04"]) { const item = ITEM(id); expect(item.title).toBe(findLearningTraining(id).title); expect(item.questionCount).toBe(10); expect(item.publishable).toBe(true); }
    expect(findLearningTraining("T09")).toBeNull(); expect(findLearningTraining("")).toBeNull();
  });
  it("gate: course assigned + required module published; [] / unassigned / unknown → false", () => {
    const t = id => findLearningTraining(id);
    expect([trainingAllowedForClass(room("c", [M01]), t("T01")), trainingAllowedForClass(room("c", [M01]), t("T02")), trainingAllowedForClass(room("c", [M01]), t("T03"))]).toEqual([true, false, false]);
    expect(trainingAllowedForClass(room("c", []), t("T01"))).toBe(false);
    expect(trainingAllowedForClass(room("c", null), t("T01"))).toBe(false);
    expect(trainingAllowedForClass(null, t("T01"))).toBe(false);
  });
});

describe("answer-key secrecy — GET item before submit", () => {
  it.each(["T01", "T02", "T03", "T04"])("%s: safe questions + option texts only; no correctOptionIndex / correct:true / hint text / teacherNote / aiInstruction / solution / expectedAnswer / history / redoStack", async id => {
    const r = await get(studentDeps(seed([M01, M02, M07])), id);
    expect(r.status).toBe(200);
    const json = JSON.stringify(r.jsonBody);
    expect(r.jsonBody.exam.questions.length).toBe(10);
    expect(r.jsonBody.exam.questions[0].options.length).toBeGreaterThan(1);
    expect(r.jsonBody.training).toMatchObject({ trainingId: id, questionCount: 10, totalMarks: 100, maxPoints: 25 });
    for (const banned of ["correctOptionIndex", '"correct":true', "correctText", "solution", "expectedAnswer", "answerKey", "explanation", "rationale"]) expect(json, banned).not.toContain(banned);
    for (const q of ITEM(id).examSnapshot.questions) { expect(json).not.toContain(q.hint); expect(q.hint.length).toBeGreaterThan(0); }
    // legacy-identical blanking: the keys exist but are EMPTY (answer {}, hint/teacherNote/aiInstruction "", history/redoStack [])
    expect(r.jsonBody.exam.questions.every(q => JSON.stringify(q.answer) === "{}" && q.hint === "" && q.teacherNote === "" && q.aiInstruction === "" && q.history.length === 0 && q.redoStack.length === 0)).toBe(true);
  });
  it("the raw library item DOES carry keys (so the sanitizer is what protects students)", () => {
    expect(JSON.stringify(ITEM("T01"))).toContain("correctOptionIndex");
  });
});

describe("progressive-release gate + authority", () => {
  const matrix = [[[M01], [true, false, false, false]], [[M01, M02], [true, true, false, false]], [[M01, M02, M07], [true, true, true, true]], [[M01, M07], [true, false, true, true]], [[], [false, false, false, false]]];
  it.each(matrix)("published %j → T01..T04 available %j (list discloses titles only when available)", async (visible, expected) => {
    const r = await get(studentDeps(seed(visible)));
    expect(r.status).toBe(200);
    expect(r.jsonBody.trainings.map(t => t.available)).toEqual(expected);
    for (const t of r.jsonBody.trainings) {
      if (t.available) expect(t.title).toBe(findLearningTraining(t.trainingId).title);
      else expect("title" in t).toBe(false);
    }
    const text = JSON.stringify(r.jsonBody);
    if (!expected[2]) { expect(text).not.toContain("عناوين IPv4 وصلاحية العنوان"); expect(text).not.toContain("العناوين الخاصة والعامة"); }
    // GET item / submit of a denied training → 403, and the exam never leaves the server
    for (let i = 0; i < 4; i++) {
      const id = "T0" + (i + 1);
      const item = await get(studentDeps(seed(visible)), id);
      expect(item.status, id).toBe(expected[i] ? 200 : 403);
      if (!expected[i]) { expect(JSON.stringify(item.jsonBody)).not.toContain("questions"); expect((await submit(studentDeps(seed(visible)), id, { answers: answersFor(id, 10) })).status).toBe(403); }
    }
  });
  it("course not assigned at all → every training denied; unknown training → 404", async () => {
    const r = await get(studentDeps(seed(null)));
    expect(r.jsonBody.trainings.every(t => t.available === false)).toBe(true);
    expect((await get(studentDeps(seed(null)), "T01")).status).toBe(403);
    expect((await get(studentDeps(seed([M01])), "T99")).status).toBe(404);
  });
  it("MOVED STUDENT: token says class STALE; persisted class cB (m01 only) decides", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cB"), [CLS("cA")]: room("cA", [M01, M02, M07]), [CLS("cB")]: room("cB", [M01]) });
    const r = await get(studentDeps(ctx));
    expect(r.jsonBody.trainings.map(t => t.available)).toEqual([true, false, false, false]);
    expect((await get(studentDeps(ctx), "T03")).status).toBe(403);
  });
  it("archived class → 403 (list, item, submit); inactive / archived student → 401", async () => {
    const archived = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [M01, M02, M07], { status: "archived", active: false }) });
    expect((await get(studentDeps(archived))).status).toBe(403);
    expect((await get(studentDeps(archived), "T01")).status).toBe(403);
    expect((await submit(studentDeps(archived), "T01", { answers: answersFor("T01", 10) })).status).toBe(403);
    expect(archived.names("platform/learning-practice/")).toEqual([]);
    for (const extra of [{ active: false }, { archived: true }]) {
      const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA", extra), [CLS("cA")]: room("cA", [M01]) });
      expect((await get(studentDeps(ctx), "T01")).status).toBe(401);
    }
  });
  it("TEACHER: a builder token opens and grades any training regardless of class publication; nothing persisted", async () => {
    const ctx = createMemoryContainer();
    const list = await get(teacherDeps(ctx));
    expect(list.jsonBody.actor).toBe("teacher"); expect(list.jsonBody.trainings.every(t => t.available && t.title)).toBe(true);
    const item = await get(teacherDeps(ctx), "T04");
    expect(item.status).toBe(200); expect(JSON.stringify(item.jsonBody)).not.toContain("correctOptionIndex");
    const r = await submit(teacherDeps(ctx), "T04", { answers: answersFor("T04", 7) });
    expect(r.jsonBody).toMatchObject({ ok: true, actor: "teacher", persisted: false, result: { correctCount: 7, questionCount: 10, percentage: 70 } });
    expect(ctx.names("platform/")).toEqual([]);
  });
});

describe("server grading — real T-series items", () => {
  it("all correct → 10/10, 100%, 25 points; partial 8/10 → 80%, 20 points; all wrong → 0/10, 0%", async () => {
    const ctx = seed([M01, M02, M07]);
    const full = await submit(studentDeps(ctx), "T02", { answers: answersFor("T02", 10) });
    expect(full.jsonBody.result).toMatchObject({ correctCount: 10, questionCount: 10, score: 100, totalMarks: 100, percentage: 100 });
    expect(full.jsonBody.practice).toMatchObject({ bestPercentage: 100, bestPoints: 25, maxPoints: 25, attempts: 1, improved: true, pointsGained: 25 });
    const part = await submit(studentDeps(seed([M01, M02, M07])), "T02", { answers: answersFor("T02", 8) });
    expect(part.jsonBody.result).toMatchObject({ correctCount: 8, percentage: 80 });
    expect(part.jsonBody.practice).toMatchObject({ bestPercentage: 80, bestPoints: 20 });
    const none = await submit(studentDeps(seed([M01, M02, M07])), "T02", { answers: answersFor("T02", 0) });
    expect(none.jsonBody.result).toMatchObject({ correctCount: 0, percentage: 0 });
    expect(none.jsonBody.practice).toMatchObject({ bestPercentage: 0, bestPoints: 0, attempts: 1 });
  });
  it("post-submit review reveals per-question correctness, the key and the item's hint — never before submit", async () => {
    const r = await submit(studentDeps(seed([M01])), "T01", { answers: answersFor("T01", 5) });
    expect(r.jsonBody.result.review.length).toBe(10);
    expect(r.jsonBody.result.review.slice(0, 5).every(q => q.correct)).toBe(true);
    expect(r.jsonBody.result.review.slice(5).every(q => !q.correct)).toBe(true);
    const q1 = ITEM("T01").examSnapshot.questions[0];
    expect(r.jsonBody.result.review[0]).toMatchObject({ questionId: q1.examQuestionId, correctOptionIndex: q1.answer.correctOptionIndex, hint: q1.hint, chosenIndex: q1.answer.correctOptionIndex });
  });
  it("client-supplied percentage / score / strengthPoints / correctCount have NO authority; missing answers → 0", async () => {
    const r = await submit(studentDeps(seed([M01])), "T01", { answers: answersFor("T01", 2), percentage: 100, score: 100, strengthPoints: 25, correctCount: 10, practice: { bestPercentage: 100 } });
    expect(r.jsonBody.result).toMatchObject({ correctCount: 2, percentage: 20 });
    expect(r.jsonBody.practice.bestPoints).toBe(5);
    const empty = await submit(studentDeps(seed([M01])), "T01", { percentage: 100 });
    expect(empty.jsonBody.result).toMatchObject({ correctCount: 0, percentage: 0 });
    const junk = await submit(studentDeps(seed([M01])), "T01", { answers: "LIB-T01-Q01" });
    expect(junk.jsonBody.result.percentage).toBe(0);
  });
});

describe("best presence — never attempted vs a real 0% attempt", () => {
  it("A. never attempted: the list row and the item carry NO `best` at all (the card says «لم تحلّ هذا التدريب بعد»)", async () => {
    const d = studentDeps(seed([M01, M02]));
    const list = await get(d);
    expect(list.status).toBe(200);
    for (const t of list.jsonBody.trainings) expect(Object.prototype.hasOwnProperty.call(t, "best"), t.trainingId).toBe(false);
    const item = await get(d, "T01");
    expect(item.status).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(item.jsonBody, "best")).toBe(false);
    expect(JSON.stringify(list.jsonBody)).not.toContain('"bestPercentage":0');
  });
  it("B. attempted once with 0%: `best` IS present with bestPercentage 0 / bestPoints 0 / attempts 1 in the list and the item", async () => {
    const d = studentDeps(seed([M01, M02]));
    const r = await submit(d, "T01", { answers: answersFor("T01", 0) });
    expect(r.jsonBody.practice).toMatchObject({ bestPercentage: 0, bestPoints: 0, attempts: 1 });
    const list = await get(d);
    const t01 = list.jsonBody.trainings.find(t => t.trainingId === "T01"), t02 = list.jsonBody.trainings.find(t => t.trainingId === "T02");
    expect(t01.best).toMatchObject({ bestPercentage: 0, bestPoints: 0, maxPoints: 25, attempts: 1 });
    expect(Object.prototype.hasOwnProperty.call(t02, "best")).toBe(false);          // the other training is still unattempted
    const item = await get(d, "T01");
    expect(item.jsonBody.best).toMatchObject({ bestPercentage: 0, bestPoints: 0, attempts: 1 });
  });
  it("teacher responses are unaffected: no `best` in the list or the item, submissions still not persisted", async () => {
    const d = teacherDeps(seed([M01]));
    const list = await get(d);
    for (const t of list.jsonBody.trainings) expect(Object.prototype.hasOwnProperty.call(t, "best")).toBe(false);
    const item = await get(d, "T03");
    expect(Object.prototype.hasOwnProperty.call(item.jsonBody, "best")).toBe(false);
    expect((await submit(d, "T03", { answers: answersFor("T03", 3) })).jsonBody).toMatchObject({ actor: "teacher", persisted: false });
  });
});

describe("practice points — best score, anti-farming, storage", () => {
  it("T01 60 → 15; retry 80 → 20 (+5); retry 50 → stays 20; retry 80 → stays 20; T02 100 → +25; total 45", async () => {
    const ctx = seed([M01, M02]);
    const d = () => studentDeps(ctx);
    expect((await submit(d(), "T01", { answers: answersFor("T01", 6) })).jsonBody.practice).toMatchObject({ bestPercentage: 60, bestPoints: 15, attempts: 1, improved: true, pointsGained: 15 });
    expect((await submit(d(), "T01", { answers: answersFor("T01", 8) })).jsonBody.practice).toMatchObject({ bestPercentage: 80, bestPoints: 20, attempts: 2, improved: true, pointsGained: 5 });
    expect((await submit(d(), "T01", { answers: answersFor("T01", 5) })).jsonBody.practice).toMatchObject({ bestPercentage: 80, bestPoints: 20, attempts: 3, improved: false, pointsGained: 0 });
    expect((await submit(d(), "T01", { answers: answersFor("T01", 8) })).jsonBody.practice).toMatchObject({ bestPercentage: 80, bestPoints: 20, attempts: 4, improved: false, pointsGained: 0 });
    expect((await submit(d(), "T02", { answers: answersFor("T02", 10) })).jsonBody.practice).toMatchObject({ bestPercentage: 100, bestPoints: 25, attempts: 1 });
    const doc = ctx.getJson(practiceDocName("u1"));
    expect(doc.trainings.T01).toMatchObject({ bestPercentage: 80, bestPoints: 20, attempts: 4, lastPercentage: 80 });
    expect(doc.trainings.T02).toMatchObject({ bestPercentage: 100, bestPoints: 25 });
    expect(practicePointsOf(doc)).toBe(45);
    expect(ctx.names("platform/learning-practice/")).toEqual([practiceDocName("u1")]);   // ONE document per student
    // the list shows the best result per training
    const list = await get(d());
    expect(list.jsonBody.trainings[0].best).toMatchObject({ bestPercentage: 80, bestPoints: 20, attempts: 4 });
  });
  it("pure helpers: normalize malformed docs, max-merge, points re-derived from bestPercentage only", () => {
    expect(normalizePracticeDoc(null)).toEqual({ schemaVersion: 1, trainings: {} });
    expect(normalizePracticeDoc({ trainings: { T01: { bestPercentage: 80, bestPoints: 999, attempts: "3" }, T02: "x" } }).trainings).toEqual({ T01: { bestPercentage: 80, bestPoints: 20, attempts: 3, lastPercentage: 0, lastCompletedAt: "" } });
    const a = applyTrainingResult(null, "T01", 60, "t1");
    expect(a.after).toMatchObject({ bestPercentage: 60, bestPoints: 15, attempts: 1 });
    const b = applyTrainingResult(a.doc, "T01", 40, "t2");
    expect(b.after).toMatchObject({ bestPercentage: 60, bestPoints: 15, attempts: 2, lastPercentage: 40 }); expect(b.improved).toBe(false); expect(b.pointsGained).toBe(0);
    expect(applyTrainingResult(a.doc, "T01", 150, "t3").after.bestPercentage).toBe(100);
  });
  it("CONCURRENCY: two overlapping submissions to the same training resolve to max(bestA, bestB); a duplicate never double-awards", async () => {
    // A concurrent 80% submission lands between our read and our CAS write of a 60% submission → retry → best stays 80
    let fired = false;
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [M01]) }, {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== practiceDocName("u1")) return;
        fired = true;
        api.setJson(name, applyTrainingResult(api.getJson(name), "T01", 80, "concurrent").doc);
      }
    });
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 6) });      // first write creates the doc
    fired = false;
    const r = await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 6) });
    expect(r.status).toBe(200);
    const doc = ctx.getJson(practiceDocName("u1"));
    expect(doc.trainings.T01.bestPercentage).toBe(80); expect(doc.trainings.T01.bestPoints).toBe(20);
    expect(practicePointsOf(doc)).toBe(20);
    // duplicate identical submissions: attempts count up, points do not
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 8) });
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 8) });
    expect(practicePointsOf(ctx.getJson(practiceDocName("u1")))).toBe(20);
    // persistent conflict → 503, nothing corrupted
    const stuck = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [M01]), [practiceDocName("u1")]: { trainings: {} } }, { beforeConditionalUpload: (name, api) => { if (name === practiceDocName("u1")) api.setJson(name, api.getJson(name)); } });
    expect((await submit(studentDeps(stuck), "T01", { answers: answersFor("T01", 10) })).status).toBe(503);
  });
  it("no assignment / submission / gradebook record is ever written for a training", async () => {
    const ctx = seed([M01]);
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 10) });
    expect(ctx.names("platform/").filter(n => !n.startsWith("platform/learning-practice/") && !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"))).toEqual([]);
  });
});
