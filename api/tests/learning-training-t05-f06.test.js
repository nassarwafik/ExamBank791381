import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { listLearningTrainings, findLearningTraining, trainingAllowedForClass } from "../src/lib/learning-training-registry.js";
import { readLibraryCatalog, readLibraryItem } from "../src/lib/exam-library-store.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
const req_ = createRequire(import.meta.url);
const ITEM = id => req_("../src/data/exam-library/items/" + id + ".json");

// Learning Practice — T05–T30 and F01–F06 through the REAL handler, sanitizer, grader and library items: the
// complete registry (36) with catalog titles and the progressive-release gate map, page association ≠ release
// module, disclosure, teacher access, unknown / invented ids, F-series safety (matching + open questions),
// server-side grading with no assignment / gradebook side effects, lifecycle and persisted-class authority.

const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1", ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: visible === null ? [] : [{ courseId: "791381", visibleModuleIds: visible }], ...extra });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const studentDeps = (ctx, id = "u1") => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ ...BUILDER_OK, container: ctx.container, getContainer: () => ctx.container });
const get = (deps, trainingId) => handler({ method: "GET", url: "https://x/api/learning-training", headers: { get: () => null }, params: trainingId ? { trainingId } : {} }, deps);
const submit = (deps, trainingId, answers) => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId, action: "submit" }, json: async () => answers }, deps);
const seed = (visible, extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible), ...extra });
const M = id => "791381-" + id;
const ids = (from, to, prefix = "T") => Array.from({ length: to - from + 1 }, (_, i) => prefix + String(from + i).padStart(2, "0"));
const ORDER = listLearningModules("791381").map(m => m.moduleId);   // canonical reading order
const through = moduleId => ORDER.slice(0, ORDER.indexOf(moduleId) + 1);

const GATE = {
  T05: "m08", T06: "m09", T07: "m10", T08: "m11", T09: "m12", T10: "m13", T11: "m14", T12: "m15",
  T13: "m16", T14: "m18", T15: "m03", T16: "m19", T17: "m04", T18: "m21",
  T19: "m22", T20: "m24", T21: "m05", T22: "m26", T23: "m27", T24: "m06",
  T25: "m24", T26: "m24", T27: "m06", T28: "m06", T29: "m06", T30: "m06",
  F01: "m06", F02: "m06", F03: "m06", F04: "m06", F05: "m06", F06: "m06",
};
/** Answers for a mixed item: every MCQ right, every matching row right (as the runner sends: table values per
 *  printed row, from the item's own answer text), every open question with some text (manual review). */
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

describe("registry — the complete Learning-Practice catalog", () => {
  it("36 items: T01–T30 then F01–F06, orders 1..36, unique ids, every title = the Exam Library catalog title, every item readable and ready / publishable", () => {
    const list = listLearningTrainings();
    expect(list.map(t => t.trainingId)).toEqual([...ids(1, 30), ...ids(1, 6, "F")]);
    expect(list.map(t => t.order)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    const cat = Object.fromEntries(readLibraryCatalog().map(c => [c.libraryItemId, c]));
    expect(Object.keys(cat).sort()).toEqual(list.map(t => t.trainingId).sort());   // the registry covers the WHOLE library, nothing invented
    for (const t of list) {
      const item = readLibraryItem(t.trainingId);
      expect(item && item.examSnapshot && item.examSnapshot.questions.length, t.trainingId).toBe(cat[t.trainingId].questionCount);
      expect(t.title, t.trainingId).toBe(cat[t.trainingId].title);
      expect([cat[t.trainingId].publishable, cat[t.trainingId].conversionStatus], t.trainingId).toEqual([true, "ready"]);
      expect(t.label).toMatch(t.trainingId.startsWith("T") ? new RegExp("^تدريب " + Number(t.trainingId.slice(1)) + "$") : /^الامتحان (الأول|الثاني|الثالث|الرابع|الخامس|السادس)$/);
      expect(ORDER, t.trainingId).toContain(t.requiredModuleId);   // every gate is a real, publishable module
    }
    for (const [id, mod] of Object.entries(GATE)) expect(findLearningTraining(id).requiredModuleId, id).toBe(M(mod));
    for (const bad of ["T31", "T00", "F07", "F00", "T05-T06", "t05", "T5", "../F01", ""]) expect(findLearningTraining(bad), JSON.stringify(bad)).toBeNull();
  });
  it("gate: each item is released by its requiredModuleId only — publishing everything up to the module before it leaves it closed, publishing it opens it", () => {
    for (const [id, mod] of Object.entries(GATE)) {
      const t = findLearningTraining(id), upTo = through(M(mod));
      expect(trainingAllowedForClass(room("c", upTo), t), id).toBe(true);
      expect(trainingAllowedForClass(room("c", upTo.slice(0, -1)), t), id + " without " + mod).toBe(false);
      expect(trainingAllowedForClass(room("c", [M(mod)]), t), id + " gate alone").toBe(true);   // the gate module alone releases (the page's module is irrelevant)
    }
  });
});

describe("page association ≠ release module (through the handler, real classes)", () => {
  const cases = [
    ["T05", "m16", "m08"],   // shown on Reader 98 (m16) but released by m08
    ["T14", "m18", "m18"],   // shown on Reader 110 (m18) — its page module happens to be its gate
    ["T18", "m18", "m21"],   // shown on Reader 110 (m18) but released by m21
    ["T23", "m24", "m27"],   // shown on Reader 178 (m24) but released by m27
    ["T24", "m24", "m06"],   // shown on Reader 178 (m24) but released by m06
    ["T21", "m04", "m05"],   // shown on Reader 145 (m04) but released by m05
    ["F01", "m06", "m06"],   // shown on Reader 215 (m06) and released by m06
  ];
  it.each(cases)("%s: class released through the PAGE module %s (gate %s hidden unless it is earlier) → unavailable + title undisclosed; publishing the gate → available with the catalog title", async (id, pageMod, gate) => {
    const title = findLearningTraining(id).title;
    const pageOnly = through(M(pageMod)).filter(m => m !== M(gate));           // the page is visible, the gate is not
    const r1 = await get(studentDeps(seed(pageOnly)));
    const row1 = r1.jsonBody.trainings.find(t => t.trainingId === id);
    expect(row1.available, id).toBe(false);
    expect("title" in row1, id).toBe(false);
    expect(JSON.stringify(r1.jsonBody), id).not.toContain(title);
    expect((await get(studentDeps(seed(pageOnly)), id)).status, id).toBe(403);
    expect((await submit(studentDeps(seed(pageOnly)), id, { answers: fullAnswers(id) })).status, id).toBe(403);
    const r2 = await get(studentDeps(seed([...pageOnly, M(gate)])));
    const row2 = r2.jsonBody.trainings.find(t => t.trainingId === id);
    expect([row2.available, row2.title, row2.requiredModuleId], id).toEqual([true, title, M(gate)]);
    expect((await get(studentDeps(seed([...pageOnly, M(gate)])), id)).status, id).toBe(200);
  });
  it("a class released through m06 (every module before the final summary) sees ALL 36 available; through m24 sees T20 / T25 / T26 but not T21 / T22 / T23 / T24 / T27–T30 / F01–F06", async () => {
    const all = (await get(studentDeps(seed(through(M("m06")))))).jsonBody.trainings;
    expect(all.length).toBe(36); expect(all.every(t => t.available && t.title)).toBe(true);
    const upTo24 = (await get(studentDeps(seed(through(M("m24")))))).jsonBody.trainings;
    const avail = Object.fromEntries(upTo24.map(t => [t.trainingId, t.available]));
    expect([avail.T19, avail.T20, avail.T25, avail.T26, avail.T15, avail.T17]).toEqual([true, true, true, true, true, true]);
    expect([avail.T21, avail.T22, avail.T23, avail.T24, avail.T27, avail.T30, avail.F01, avail.F06]).toEqual([false, false, false, false, false, false, false, false]);
  });
  it("TEACHER: every registered item (36) is available with its title regardless of class publication; F06 opens sanitized and grades without persisting anything", async () => {
    const ctx = createMemoryContainer();
    const list = await get(teacherDeps(ctx));
    expect(list.jsonBody.trainings.length).toBe(36); expect(list.jsonBody.trainings.every(t => t.available && t.title)).toBe(true);
    const item = await get(teacherDeps(ctx), "F06");
    expect(item.status).toBe(200); expect(item.jsonBody.training).toMatchObject({ trainingId: "F06", title: "بجروت صيف 2025", questionCount: 45, requiredModuleId: M("m06") });
    const r = await submit(teacherDeps(ctx), "F06", { answers: fullAnswers("F06") });
    expect(r.jsonBody).toMatchObject({ ok: true, actor: "teacher", persisted: false });
    expect(ctx.names("platform/")).toEqual([]);
  });
  it("unknown / invented ids → 404 for both actors, never a library read of a foreign file", async () => {
    for (const bad of ["T31", "F07", "T05-T06", "T5", "..", "F01.json"]) {
      expect((await get(studentDeps(seed(through(M("m06")))), bad)).status, bad).toBe(404);
      expect((await get(teacherDeps(createMemoryContainer()), bad)).status, bad).toBe(404);
    }
  });
});

describe("F-series safety — the final exams for training reuse the SAME sanitizer, grader and best-score flow", () => {
  it("GET F01 is sanitized: no answer text / correct flags / hints on MCQ, matching (fields) or open questions; the raw item DOES carry them", async () => {
    const raw = ITEM("F01");
    const matching = raw.examSnapshot.questions.find(q => q.presentationType === "matching");
    expect(matching.answer.text).toContain("=");
    expect(raw.examSnapshot.questions.some(q => q.teacherNote)).toBe(true);
    const r = await get(studentDeps(seed(through(M("m06")))), "F01");
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.jsonBody);
    for (const banned of ["correctOptionIndex", "correctText", "\"correct\":", matching.answer.text]) expect(text, banned).not.toContain(banned);
    for (const q of r.jsonBody.exam.questions) {
      // the sanitizer blanks these keys (legacy-identical shape) rather than deleting them
      expect(q.answer).toEqual({}); expect(q.hint).toBe(""); expect(q.teacherNote).toBe(""); expect(q.aiInstruction).toBe("");
      for (const f of q.fields || []) { expect("correct" in f).toBe(false); for (const o of f.options || []) expect("correct" in o).toBe(false); }
    }
    expect(r.jsonBody.exam.questions.map(q => q.presentationType).filter(t => t === "matching").length).toBe(8);
    expect(r.jsonBody.training).toMatchObject({ trainingId: "F01", title: "نموذج A — 2025", questionCount: 34, totalMarks: 100, maxPoints: 25, label: "الامتحان الأول" });
  });
  it("POST F01 grades server-side with the real grader: MCQ + matching count, open questions are flagged manualReview (their marks stay in the total, as everywhere else); review reveals keys only now; best is persisted; no assignment / gradebook document", async () => {
    const ctx = seed(through(M("m06")));
    const answers = fullAnswers("F01");
    const expected = gradeExam(ITEM("F01").examSnapshot, answers);
    const r = await submit(studentDeps(ctx), "F01", { answers, percentage: 100, score: 999 });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result).toMatchObject({ questionCount: 34, score: expected.score, totalMarks: expected.totalMarks, percentage: Math.round(expected.percentage) });
    expect(r.jsonBody.result.correctCount).toBe(expected.questions.filter(q => q.correct).length);
    expect(expected.manualReviewMarks).toBeGreaterThan(0);                                   // the two open questions
    expect(r.jsonBody.result.percentage).toBeGreaterThanOrEqual(90); expect(r.jsonBody.result.percentage).toBeLessThan(100);
    const review = r.jsonBody.result.review;
    expect(review.length).toBe(34);
    expect(review.filter(x => x.manualReview).length).toBe(2);
    expect(review.filter(x => x.manualReview).every(x => !x.correct)).toBe(true);
    const matchingRows = review.filter(x => x.correctText);
    expect(matchingRows.length).toBe(8); expect(matchingRows.every(x => x.correct && x.correctOptionIndex === null)).toBe(true);
    expect(review.filter(x => x.correctOptionIndex !== null).length).toBe(24);
    expect(r.jsonBody.practice).toMatchObject({ attempts: 1, bestPercentage: Math.round(expected.percentage), maxPoints: 25, improved: true });
    expect(ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"))).toEqual(["platform/learning-practice/u1.json"]);
    expect(ctx.names("platform/assignments/")).toEqual([]); expect(ctx.names("platform/submissions/")).toEqual([]); expect(ctx.names("platform/gradebook/")).toEqual([]);
    // a retry with fewer right answers never lowers the best
    const worse = await submit(studentDeps(ctx), "F01", { answers: {} });
    expect(worse.jsonBody.result.percentage).toBe(0);
    expect(worse.jsonBody.practice).toMatchObject({ attempts: 2, bestPercentage: Math.round(expected.percentage), improved: false });
    // the class document is byte-unaffected by practice
    expect(ctx.getJson(CLS("cA")).learningMaterials[0].visibleModuleIds).toEqual(through(M("m06")));
  });
  it("every F item and every T item grades end to end (36 items, full answers → the real grader's percentage, manual-review rows = catalog manualReviewCount, questionCount = catalog count)", async () => {
    const ctx = createMemoryContainer();
    for (const t of listLearningTrainings()) {
      const r = await submit(teacherDeps(ctx), t.trainingId, { answers: fullAnswers(t.trainingId) });
      expect(r.status, t.trainingId).toBe(200);
      expect(r.jsonBody.result.questionCount, t.trainingId).toBe(readLibraryItem(t.trainingId).examSnapshot.questions.length);
      const expected = gradeExam(readLibraryItem(t.trainingId).examSnapshot, fullAnswers(t.trainingId));
      expect(r.jsonBody.result.percentage, t.trainingId).toBe(Math.round(expected.percentage));   // the SAME grader as assignments — no practice-specific rule
      expect(r.jsonBody.result.percentage, t.trainingId).toBeGreaterThanOrEqual(80);
      expect(r.jsonBody.result.percentage, t.trainingId).toBeLessThanOrEqual(100);
      expect(r.jsonBody.result.review.filter(x => x.manualReview).length, t.trainingId).toBe(readLibraryCatalog().find(c => c.libraryItemId === t.trainingId).manualReviewCount);
      if (t.trainingId.startsWith("T")) expect(r.jsonBody.result.percentage, t.trainingId).toBe(100);
    }
    expect(ctx.names("platform/")).toEqual([]);
  });
  it("archived class → 403 for F01 (list, item, submit); MOVED STUDENT: the persisted class (m06 hidden) decides over the token", async () => {
    const archived = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M("m06")), { status: "archived", active: false }) });
    expect((await get(studentDeps(archived), "F01")).status).toBe(403);
    expect((await submit(studentDeps(archived), "F01", { answers: fullAnswers("F01") })).status).toBe(403);
    const moved = createMemoryContainer({ [USR("u1")]: student("u1", "cB"), [CLS("cA")]: room("cA", through(M("m06"))), [CLS("cB")]: room("cB", through(M("m27"))) });
    const r = await get(studentDeps(moved));
    const avail = Object.fromEntries(r.jsonBody.trainings.map(t => [t.trainingId, t.available]));
    expect([avail.T23, avail.T24, avail.F01]).toEqual([true, false, false]);
    expect((await get(studentDeps(moved), "F01")).status).toBe(403);
  });
});
