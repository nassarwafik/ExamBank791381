import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-exam-item.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { validateExamItem, loadExamItems, ALLOWED_TYPES } from "../src/lib/learning-exam-items.js";

// 791381s Phase 8C-1 (docs/enterprise-791381s-enrichment-plan.md §11.4) — the learning book's ADVANCED exam items through the real
// handler, the real sanitizer and the real grader (gradeExam):
//   • no key before or after an answer leaves the server (GET is the student projection; check returns verdicts + explanations);
//   • the class gate: course assigned + the item's own unit published; archived → 403; unknown → 404; teachers preview;
//   • the official grader judges; only `answers` is read (client score / correct claims ignored); an explanation only for an
//     ANSWERED question; a parametric question grades the SAME instance the learner was shown;
//   • NOTHING is written (no assignment, attempt, gradebook or study record) — `persisted: false`;
//   • an item the store could not validate is 503 retryable, never graded; the store rejects disallowed types / broken nodes.

const CID = "791381s", MID = "791381s-m10";
const MS = { examQuestionId: "q1", presentationType: "multipleSelect", questionTypeVersion: 1, text: "أي البروتوكولات في طبقة النقل؟", marks: 2, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "allOrNothing" } };
const NUM = { examQuestionId: "q2", presentationType: "numericResponse", questionTypeVersion: 1, text: "كم بتًا في عنوان IPv4؟", marks: 1, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 32, tolerance: 0 } };
const MX = { examQuestionId: "q3", presentationType: "matrix", questionTypeVersion: 1, text: "طبقة كل بروتوكول", marks: 2, matrix: { rows: [{ id: "r1", label: "HTTP" }, { id: "r2", label: "TCP" }], columns: [{ id: "c1", label: "Application" }, { id: "c2", label: "Transport" }] }, answer: { correctColumnByRow: { r1: "c1", r2: "c2" } } };
const PARA = { examQuestionId: "q4", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 2, parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 97, step: 1 }, { id: "b", kind: "int", min: 100, max: 997, step: 1 }], constraints: ["a < b"], response: { unit: "none" } }, answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } };
const exam = qs => ({ examId: "LX", title: "x", status: "published", schemaVersion: 2, sections: [{ id: "s1", title: "س", gradingPolicy: "all", stimuli: {}, questions: qs }] });
const item = (over = {}) => ({ moduleId: MID, label: "تدريب متقدّم: البروتوكولات", examSnapshot: exam([MS, NUM, MX, PARA]), feedback: { q1: { explanation: "TCP و UDP بروتوكولا طبقة النقل." }, q2: { explanation: "عنوان IPv4 من 32 بتًا." } }, ...over });
const INDEX = () => ({ schemaVersion: 1, courseId: CID, items: {
  adv1: item(),
  broken: item({ examSnapshot: exam([{ ...NUM, answer: { mode: "exact", expected: 32 } }]) }),
  open1: item({ examSnapshot: exam([{ examQuestionId: "o", presentationType: "openResponse", questionTypeVersion: 1, text: "اشرح", marks: 2 }]) }),
} });

const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = (visible, extra = {}) => ({ classId: "cA", name: "صف", active: true, status: "active", studentIds: [], learningMaterials: visible === null ? [] : [{ courseId: CID, visibleModuleIds: visible }], ...extra });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const seed = (visible = [MID], extra = {}, id = "u1") => createMemoryContainer({ [USR(id)]: student(id, "cA"), [CLS("cA")]: room(visible, extra) });
const studentDeps = (ctx, id = "u1") => ({ ...BUILDER_NO, readIndex: () => INDEX(), requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ ...BUILDER_OK, readIndex: () => INDEX(), container: ctx.container, getContainer: () => ctx.container });
const get = (deps, itemId = "adv1") => handler({ method: "GET", url: "https://x", headers: { get: () => null }, params: { courseId: CID, itemId } }, deps);
const check = (deps, body, itemId = "adv1") => handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: CID, itemId, action: "check" }, json: async () => body }, deps);
const written = ctx => ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"));
/** The right answer of the parametric question FROM the instance the learner was shown («احسب ناتج ضرب a في b.»). */
const productShown = getBody => { const q = getBody.exam.sections[0].questions.find(x => x.examQuestionId === "q4"); const [a, b] = (q.text.match(/\d+/g) || []).map(Number); return { a, b, value: String(a * b) }; };

describe("the store — validated with the platform's own authorities", () => {
  it("a valid item has no issue; disallowed types, broken nodes, unknown units, duplicate ids and stray feedback are rejected", () => {
    expect(validateExamItem(CID, "adv1", item())).toEqual([]);
    expect(validateExamItem(CID, "x", item({ examSnapshot: exam([{ examQuestionId: "o", presentationType: "openResponse", questionTypeVersion: 1, text: "اشرح", marks: 2 }]) })).join(" ")).toMatch(/not allowed/);
    expect(validateExamItem(CID, "x", item({ examSnapshot: exam([{ ...NUM, answer: { mode: "exact", expected: 32 } }]) })).join(" ")).toMatch(/NUM_INVALID_MODE/);
    expect(validateExamItem(CID, "x", item({ moduleId: "791381s-m99" })).join(" ")).toMatch(/moduleId/);
    expect(validateExamItem(CID, "x", item({ examSnapshot: exam([MS, MS]) })).join(" ")).toMatch(/unique/);
    expect(validateExamItem(CID, "x", item({ feedback: { zz: { explanation: "x" } } })).join(" ")).toMatch(/unknown question zz/);
    expect(validateExamItem(CID, "../x", item()).join(" ")).toMatch(/unsafe/);
    for (const t of ["openResponse", "coding", "smartSim", "composite", "networkCli", "simulation"]) expect(ALLOWED_TYPES).not.toContain(t);
  });
  it("loadExamItems: a course with no store file → null; a malformed index → null", () => {
    expect(loadExamItems("000000", { readIndex: () => { throw new Error("ENOENT"); } })).toBeNull();
    expect(loadExamItems(CID, { readIndex: () => ({ schemaVersion: 2, courseId: CID, items: {} }) })).toBeNull();
    expect(loadExamItems(CID, { readIndex: () => ({ schemaVersion: 1, courseId: "other", items: {} }) })).toBeNull();
  });
});

describe("GET — the student projection only", () => {
  it("the card metadata + the sanitized exam: no key, no explanation, no parametric formula", async () => {
    const r = await get(studentDeps(seed()));
    expect(r.status).toBe(200);
    expect(r.jsonBody.item).toEqual({ itemId: "adv1", label: "تدريب متقدّم: البروتوكولات", moduleId: MID, questionCount: 4, totalMarks: 7 });
    expect(r.jsonBody.exam.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q2", "q3", "q4"]);
    const json = JSON.stringify(r.jsonBody);
    for (const secret of ["correctOptionIds", "allOrNothing", "\"expected\"", "correctColumnByRow", "a * b", "{{a}}", "TCP و UDP بروتوكولا", "عنوان IPv4 من 32", "feedback", "explanation"]) expect(json, secret).not.toContain(secret);
  });
});

describe("the gate", () => {
  it("unpublished unit / course not assigned / archived class → 403; unknown item → 404; a teacher previews without a class", async () => {
    expect((await get(studentDeps(seed([])))).status).toBe(403);
    expect((await get(studentDeps(seed(null)))).status).toBe(403);
    expect((await get(studentDeps(seed([MID], { status: "archived" })))).status).toBe(403);
    expect((await check(studentDeps(seed([])), { answers: {} })).status).toBe(403);
    expect((await get(studentDeps(seed()), "nope")).status).toBe(404);
    expect((await get(studentDeps(seed()), "../adv1")).status).toBe(404);
    const t = await get(teacherDeps(seed(null)));
    expect(t.status).toBe(200);
    expect(t.jsonBody.actor).toBe("teacher");
  });
  it("an item the store rejected: 503 retryable in a published unit (never graded), 403 in an unpublished one", async () => {
    for (const id of ["broken", "open1"]) {
      const r = await check(studentDeps(seed()), { answers: { q2: { kind: "numeric", value: "32" } } }, id);
      expect(r.status, id).toBe(503);
      expect(r.jsonBody, id).toMatchObject({ ok: false, retryable: true });
      expect("result" in r.jsonBody, id).toBe(false);
      expect((await get(studentDeps(seed([])), id)).status, id).toBe(403);
    }
  });
});

describe("check — the official grader, practice only", () => {
  it("right / wrong per question with scores; an explanation only for an ANSWERED question; persisted:false and nothing written", async () => {
    const ctx = seed();
    const shown = productShown((await get(studentDeps(ctx))).jsonBody);
    const r = await check(studentDeps(ctx), { answers: { q1: { kind: "multiChoice", optionIds: ["o1", "o2"] }, q3: { kind: "fields", values: { r1: "c1", r2: "c1" } }, q4: { kind: "numeric", value: shown.value } } });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, actor: "student", persisted: false });
    const byId = Object.fromEntries(r.jsonBody.result.questions.map(q => [q.questionId, q]));
    expect(byId.q1).toMatchObject({ answered: true, correct: true, score: 2, maxMarks: 2, explanation: "TCP و UDP بروتوكولا طبقة النقل." });
    expect(byId.q2).toMatchObject({ answered: false, correct: false, score: 0 });
    expect("explanation" in byId.q2).toBe(false);                                     // not answered → no explanation
    expect(byId.q3).toMatchObject({ answered: true, correct: false, score: 1, parts: { correct: 1, total: 2 } });
    expect(byId.q4).toMatchObject({ answered: true, correct: true, score: 2 });           // the instance the learner was shown
    expect(r.jsonBody.result).toMatchObject({ score: 5, totalMarks: 7 });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/correctOptionIds|correctColumnByRow|"expected"|a \* b/);
    expect(written(ctx)).toEqual([]);
  });
  it("only `answers` is read: a client score / percentage / correct claim changes nothing; a malformed body grades as unanswered", async () => {
    const ctx = seed();
    const r = await check(studentDeps(ctx), { answers: { q2: { kind: "numeric", value: "16" } }, score: 7, percentage: 100, correct: true, result: { score: 7 } });
    expect(r.jsonBody.result.score).toBe(0);
    expect(r.jsonBody.result.questions.find(q => q.questionId === "q2")).toMatchObject({ answered: true, correct: false, explanation: "عنوان IPv4 من 32 بتًا." });
    for (const body of [null, { answers: [] }, { answers: "x" }]) {
      const m = await check(studentDeps(ctx), body);
      expect(m.status).toBe(200);
      expect(m.jsonBody.result.score).toBe(0);
      expect(m.jsonBody.result.questions.every(q => q.answered === false && !("explanation" in q))).toBe(true);
    }
    expect(written(ctx)).toEqual([]);
  });
  it("the parametric instance is per learner and the same on GET and on check (another learner's value is not accepted blindly)", async () => {
    const c1 = seed([MID], {}, "u1"), c2 = seed([MID], {}, "u2");
    const s1 = productShown((await get(studentDeps(c1, "u1"))).jsonBody), s2 = productShown((await get(studentDeps(c2, "u2"))).jsonBody);
    expect(s1.a).toBeGreaterThan(0);
    const again = productShown((await get(studentDeps(c1, "u1"))).jsonBody);
    expect(again).toEqual(s1);                                                           // stable for the learner
    const mine = await check(studentDeps(c1, "u1"), { answers: { q4: { kind: "numeric", value: s1.value } } });
    expect(mine.jsonBody.result.questions.find(q => q.questionId === "q4").correct).toBe(true);
    // per learner: across five learners the generator yields more than one instance (never one instance for everybody)
    const seen = new Set([s1.value, s2.value]);
    for (const id of ["u3", "u4", "u5"]) seen.add(productShown((await get(studentDeps(seed([MID], {}, id), id))).jsonBody).value);
    expect(seen.size).toBeGreaterThan(1);
    const otherValue = [...seen].find(v => v !== s1.value);
    const other = await check(studentDeps(c1, "u1"), { answers: { q4: { kind: "numeric", value: otherValue } } });
    expect(other.jsonBody.result.questions.find(q => q.questionId === "q4").correct).toBe(false);
  });
  it("a teacher's check is graded and never persisted; an oversized answers map → 413", async () => {
    const ctx = seed(null);
    const t = await check(teacherDeps(ctx), { answers: { q1: { kind: "multiChoice", optionIds: ["o1", "o2"] } } });
    expect(t.jsonBody).toMatchObject({ actor: "teacher", persisted: false });
    expect(t.jsonBody.result.questions[0].correct).toBe(true);
    expect((await check(studentDeps(seed()), { answers: { q2: { kind: "numeric", value: "1".repeat(70000) } } })).status).toBe(413);
    expect(written(ctx)).toEqual([]);
  });
});

// ── 791381s Phase 8D — Study Strength (owner decision 2026-11-01): an item in the study index is a study activity ─────────────
describe("Study Strength — an exam item in the study index", () => {
  const PAGE = "791381s-m10-l99-p01", ACT = "m10-l99-p01-x-adv1";
  const index = () => ({ schemaVersion: 1, courseId: CID, pages: { [PAGE]: { moduleId: MID, activities: { [ACT]: { kind: "exam-item", itemId: "adv1" }, other: { kind: "trueFalse", answer: true } } } } });
  const sDeps = (ctx, id = "u1", extra = {}) => ({ ...studentDeps(ctx, id), loadStudyIndex: c => (c === CID ? index() : null), ...extra });
  const tDeps = ctx => ({ ...teacherDeps(ctx), loadStudyIndex: c => (c === CID ? index() : null) });
  const DOC = id => "platform/learning-study/" + id + ".json";
  async function fullMarks(ctx, id = "u1") {
    const shown = productShown((await get(sDeps(ctx, id))).jsonBody);
    return { q1: { kind: "multiChoice", optionIds: ["o1", "o2"] }, q2: { kind: "numeric", value: "32" }, q3: { kind: "fields", values: { r1: "c1", r2: "c2" } }, q4: { kind: "numeric", value: shown.value } };
  }

  it("full marks completes the item once (gained > 0); a repeat is read-only; only the learner's study document is written", async () => {
    const ctx = seed();
    const answers = await fullMarks(ctx);
    const r = await check(sDeps(ctx), { answers });
    expect(r.jsonBody.result.score).toBe(r.jsonBody.result.totalMarks);
    expect(r.jsonBody.study).toMatchObject({ counted: true, completed: true, persisted: true, alreadyCompleted: false });
    expect(r.jsonBody.study.gained).toBeGreaterThan(0);
    expect(r.jsonBody.study.module).toMatchObject({ completed: 1, eligible: 2 });
    expect(Object.keys(ctx.getJson(DOC("u1")).pages[PAGE].completed)).toEqual([ACT]);
    const again = await check(sDeps(ctx), { answers });
    expect(again.jsonBody.study).toMatchObject({ completed: true, persisted: false, alreadyCompleted: true, gained: 0 });
    expect(written(ctx)).toEqual([DOC("u1")]);
  });

  it("a wrong answer shows its explanation → the item is marked revealed; a later full-marks check is answered, never counted", async () => {
    const ctx = seed();
    const w = await check(sDeps(ctx), { answers: { q1: { kind: "multiChoice", optionIds: ["o3"] } } });
    expect(w.jsonBody.result.questions.find(q => q.questionId === "q1").explanation).toBeTruthy();
    expect(w.jsonBody.study).toMatchObject({ completed: false, persisted: false, gained: 0 });
    expect(Object.keys(ctx.getJson(DOC("u1")).pages[PAGE].revealed)).toEqual([ACT]);
    const r = await check(sDeps(ctx), { answers: await fullMarks(ctx) });
    expect(r.jsonBody.result.score).toBe(r.jsonBody.result.totalMarks);
    expect(r.jsonBody.study).toMatchObject({ completed: false, persisted: false, revealedBefore: true, gained: 0 });
    expect(ctx.getJson(DOC("u1")).pages[PAGE].completed).toEqual({});
  });

  it("right but incomplete answers (an unanswered question, no wrong one) write nothing; a teacher's full marks are never stored", async () => {
    const ctx = seed();
    const r = await check(sDeps(ctx), { answers: { q1: { kind: "multiChoice", optionIds: ["o1", "o2"] } } });
    expect(r.jsonBody.study).toMatchObject({ completed: false, persisted: false, gained: 0 });
    expect(r.jsonBody.study.revealedBefore).toBeUndefined();
    expect(written(ctx)).toEqual([]);
    const t = seed(null);
    const tr = await check(tDeps(t), { answers: { q1: { kind: "multiChoice", optionIds: ["o1", "o2"] }, q2: { kind: "numeric", value: "32" }, q3: { kind: "fields", values: { r1: "c1", r2: "c2" } } } });
    expect(tr.jsonBody).toMatchObject({ actor: "teacher", persisted: false });
    expect(tr.jsonBody.study).toMatchObject({ completed: false, persisted: false });
    expect(written(t)).toEqual([]);
  });

  it("a persistent storage conflict → 503 retryable (never a silent completion)", async () => {
    const answers = await fullMarks(seed());
    const stuck = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room([MID]), [DOC("u1")]: { pages: {} } }, { beforeConditionalUpload: (name, api) => { if (name === DOC("u1")) api.setJson(name, api.getJson(name)); } });
    const r = await check(sDeps(stuck), { answers });
    expect(r.status).toBe(503);
    expect(r.jsonBody).toMatchObject({ ok: false, retryable: true });
  });
});
