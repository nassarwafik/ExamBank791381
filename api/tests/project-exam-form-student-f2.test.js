import { describe, it, expect } from "vitest";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { normalizeAnswer, isAnswered, formProgress, applyDraft, applySubmit, DEFERRED_KINDS } from "../src/lib/project-tracker/exam-form-answers.js";
import { saveStudentDraft } from "../src/lib/project-tracker/exam-form-service.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F2 — the student's project exam form: the teacher opens it for a class (questions frozen), each student saves a
// draft as they go, resumes later, and submits once. No time limit, no images or files yet, no marking
// (docs/enterprise-project-exam-form-f2.md).

const NOW = "2026-11-14T10:00:00.000Z";
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const TEMPLATE = getExamFormTemplate(CODE);
const QUESTIONS = TEMPLATE.sections.flatMap(s => s.questions);
const Q = id => QUESTIONS.find(q => q.questionId === id);
const ANSWERABLE = QUESTIONS.filter(q => !DEFERRED_KINDS.has(q.kind));
const clone = v => JSON.parse(JSON.stringify(v));
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}
// A complete, valid answer for any answerable question.
function fullAnswer(q) {
  switch (q.kind) {
    case "shortText": case "paragraph": case "cli": return { text: "جواب " + q.questionId };
    case "table": return { rows: Array.from({ length: q.minRows }, (_, i) => Object.fromEntries(q.columns.map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options[0].id, justification: "لأن البوابة خارج الشبكة" } : { optionId: q.options[0].id };
    case "multiChoice": return { optionIds: [q.options[0].id] };
    case "matching": return { pairs: Object.fromEntries(q.left.map((l, i) => [l.id, q.right[i % q.right.length].id])) };
    case "ordering": return { order: q.items.map(i => i.id) };
    case "scale": return { values: Object.fromEntries(q.items.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items[0].id] };
    case "declaration": return { accepted: true };
    default: throw new Error("no answer for " + q.kind);
  }
}
const allAnswers = () => Object.fromEntries(ANSWERABLE.map(q => [q.questionId, fullAnswer(q)]));

function setup(extra = {}, hooks = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/classes/c8.json": room("c8", { programCodes: ["883589"] }), "platform/classes/c9.json": room("c9", { programCodes: [] }),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c2"), "platform/users/n1.json": user("n1", "c9"),
    ...extra
  }, hooks);
  const audits = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
  const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const get = (id = "s1", code = CODE) => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?" + new URLSearchParams(code === null ? {} : { projectCode: code }), json: async () => ({}) }, studentDeps(id));
  const post = (body, id = "s1") => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps(id));
  const save = (answers, baseRevision, id = "s1") => post({ action: "saveDraft", baseRevision, answers }, id);
  const submit = (baseRevision, id = "s1") => post({ action: "submit", baseRevision }, id);
  const teacher = (body, code = CODE) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", ...body }) }, teacherDeps);
  const state = async (classId = "c1") => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId, resource: "exam-form" }), json: async () => ({}) }, teacherDeps));
  const doc = (sid = "s1", cid = "c1") => ctx.has(NS.examFormAnswersName(cid, sid)) ? ctx.getJson(NS.examFormAnswersName(cid, sid)) : null;
  const classForm = (cid = "c1") => ctx.has(NS.examFormClassName(cid)) ? ctx.getJson(NS.examFormClassName(cid)) : null;
  return { ctx, audits, get, post, save, submit, teacher, state, doc, classForm };
}
async function opened(extra, hooks) {
  const t = setup(extra, hooks);
  expect((await t.teacher({ action: "examForm.open" })).status).toBe(200);
  t.audits.length = 0;
  return t;
}

describe("F2 teacher opens and closes the form for a class", () => {
  it("before the first open the class has no form; the route reports the bundled form's size", async () => {
    const t = setup();
    const r = await t.state();
    expect(r.status).toBe(200);
    expect(r.jsonBody.examForm).toMatchObject({ hasForm: true, state: "none" });
    expect(r.jsonBody.examForm.summary).toMatchObject({ sections: 16, questions: 92 });
    expect(t.classForm()).toBeNull();
  });

  it("the first open freezes the questions into the class and is audited once", async () => {
    const t = setup();
    const r = await t.teacher({ action: "examForm.open" });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, changed: true, examForm: { state: "open", formVersion: 1 } });
    const stored = t.classForm();
    expect(stored).toMatchObject({ schemaVersion: 1, projectCode: CODE, classId: "c1", state: "open", formVersion: 1, openedBy: "teacher-1" });
    expect(stored.template).toEqual(clone(TEMPLATE));
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.open"]);
    expect(t.audits[0].details).toMatchObject({ projectCode: CODE, classId: "c1", formVersion: 1, firstOpen: true });
    const again = await t.teacher({ action: "examForm.open" });
    expect(again.jsonBody.changed).toBe(false);
    expect(t.audits).toHaveLength(1);
  });

  it("close keeps the class's questions and every answer; reopening keeps the same frozen questions", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "EcoResort" } }, 0);
    const edited = t.classForm();
    edited.template.title = "استمارة الصف (مجمّدة)";
    t.ctx.setJson(NS.examFormClassName("c1"), edited);
    const closed = await t.teacher({ action: "examForm.close" });
    expect(closed.jsonBody).toMatchObject({ changed: true, examForm: { state: "closed" } });
    expect(t.doc().answers.S01Q01).toEqual({ text: "EcoResort" });
    const reopened = await t.teacher({ action: "examForm.open" });
    expect(reopened.jsonBody).toMatchObject({ changed: true, examForm: { state: "open" } });
    expect(t.classForm().template.title).toBe("استمارة الصف (مجمّدة)");
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.close", "project.exam_form.open"]);
    expect(t.audits[1].details.firstOpen).toBe(false);
  });

  it("refuses: closing a form that was never opened, a project with no form, an archived class, an unknown class", async () => {
    const t = setup({ "platform/classes/c7.json": room("c7", { status: "archived", active: false }) });
    expect((await t.teacher({ action: "examForm.close" })).status).toBe(404);
    const noForm = await t.teacher({ action: "examForm.open", classId: "c8" }, "883589");
    expect(noForm.status).toBe(400);
    expect(noForm.jsonBody.code).toBe("NO_FORM");
    expect((await t.teacher({ action: "examForm.open", classId: "c7" })).status).toBe(403);
    expect((await t.teacher({ action: "examForm.open", classId: "nope" })).status).toBe(404);
    expect(t.ctx.names("platform/project-exam-forms/")).toEqual([]);
    expect(t.audits).toEqual([]);
  });
});

describe("F2 the student reads the form", () => {
  it("is not available until the teacher opens it", async () => {
    const t = setup();
    const r = await t.get();
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, projectCode: CODE, available: false });
  });

  it("returns every question without any answer key, the empty answers and the progress", async () => {
    const t = await opened();
    const r = await t.get();
    expect(r.status).toBe(200);
    const b = r.jsonBody;
    expect(b).toMatchObject({ ok: true, available: true, state: "open", status: "draft", revision: 0, answers: {}, deferredKinds: ["image", "file"] });
    expect(b.form.sections.flatMap(s => s.questions)).toHaveLength(92);
    expect(b.progress).toMatchObject({ total: 77, answered: 0, deferred: 15 });
    expect(b.progress.missing.length).toBeGreaterThan(60);
    const keys = keysDeep(b);
    for (const secret of ["answer", "correctOptionId", "correctOptionIds", "template", "rubric", "weight"]) expect(keys.has(secret)).toBe(false);
    expect(JSON.stringify(b)).not.toContain("correctOption");
  });

  it("refuses a project the student's class does not run, and a request with no project", async () => {
    const t = await opened();
    expect((await t.get("n1")).status).toBe(400);
    expect((await t.get("s1", "883589")).status).toBe(400);
    expect((await t.get("s1", null)).status).toBe(400);
    expect((await t.post({ action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "x" } } }, "n1")).status).toBe(400);
  });

  it("a request without a session is the session layer's refusal, untouched", async () => {
    const t = await opened();
    const r = await studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?projectCode=" + CODE, json: async () => ({}) },
      { requireActiveStudentSession: async () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) });
    expect(r.status).toBe(401);
    expect(t.doc()).toBeNull();
  });

  it("a class in another class of the same project has its own form: opening c1 opens nothing for c2", async () => {
    const t = await opened();
    expect((await t.get("s3")).jsonBody).toEqual({ ok: true, projectCode: CODE, available: false });
    expect((await t.save({ S01Q01: { text: "x" } }, 0, "s3")).status).toBe(404);
  });
});

describe("F2 the student saves a draft and resumes", () => {
  it("saves answers of every answerable kind, exactly as normalized, and counts them", async () => {
    const t = await opened();
    const answers = { S01Q01: { text: "EcoResort" }, S02Q03: fullAnswer(Q("S02Q03")), S04Q04: { optionId: "o1" }, S04Q03: { optionIds: ["o3", "o1"] },
      S06Q04: { pairs: { l1: "r2", l2: "r4" } }, S12Q03: { order: ["i2", "i4", "i5", "i1", "i3"] }, S14Q04: { values: { s1: 4, s2: 5 } }, S13Q01: { checked: ["c4", "c1"] }, S15Q04: { accepted: true } };
    const r = await t.save(answers, 0);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, changed: true, revision: 1, status: "draft" });
    const stored = t.doc();
    expect(stored).toMatchObject({ schemaVersion: 1, projectCode: CODE, classId: "c1", studentId: "s1", formVersion: 1, status: "draft", revision: 1, submittedAt: null });
    expect(stored.answers.S04Q03).toEqual({ optionIds: ["o1", "o3"] });       // the question's own order
    expect(stored.answers.S13Q01).toEqual({ checked: ["c1", "c4"] });
    expect(stored.answers.S06Q04).toEqual({ pairs: { l1: "r2", l2: "r4" } });
    expect(Object.keys(stored.answers).sort()).toEqual(Object.keys(answers).sort());
    // answered: the partial matching and the partial scale are saved but not yet complete
    expect(r.jsonBody.progress.answered).toBe(7);
    expect(JSON.stringify(r.jsonBody)).not.toContain("correctOption");
    expect(t.audits).toEqual([]);
  });

  it("resume: a later read returns what was saved and the revision to continue from", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "EcoResort" } }, 0);
    await t.save({ S01Q02: { text: "شبكة منتجع" } }, 1);
    const r = (await t.get()).jsonBody;
    expect(r.revision).toBe(2);
    expect(r.answers).toEqual({ S01Q01: { text: "EcoResort" }, S01Q02: { text: "شبكة منتجع" } });
    expect(r.progress.answered).toBe(2);
  });

  it("a patch touches only its own questions; null clears one; an unchanged patch writes nothing", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "أ" }, S01Q02: { text: "ب" } }, 0);
    const cleared = await t.save({ S01Q01: null }, 1);
    expect(cleared.jsonBody.revision).toBe(2);
    expect(t.doc().answers).toEqual({ S01Q02: { text: "ب" } });
    const same = await t.save({ S01Q02: { text: "ب" } }, 2);
    expect(same.status).toBe(200);
    expect(same.jsonBody).toMatchObject({ changed: false, revision: 2 });
    expect(t.doc().revision).toBe(2);
    const blank = await t.save({ S01Q02: { text: "   " } }, 2);                 // whitespace only = cleared
    expect(blank.jsonBody.revision).toBe(3);
    expect(t.doc().answers).toEqual({});
  });

  it("a save from a page that missed a newer save is refused and changes nothing (another device or tab)", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "من الحاسوب" } }, 0);
    const stale = await t.save({ S01Q01: { text: "من الهاتف القديم" } }, 0);
    expect(stale.status).toBe(409);
    expect(stale.jsonBody.code).toBe("DRAFT_STALE");
    expect(t.doc()).toMatchObject({ revision: 1, answers: { S01Q01: { text: "من الحاسوب" } } });
    for (const bad of [undefined, "1", 1.5, null, -1]) expect((await t.save({ S01Q02: { text: "x" } }, bad)).status).toBe(409);
    expect(t.doc().revision).toBe(1);
  });

  it("a save that lands inside another save's write window is refused on the retry, not merged blindly", async () => {
    let raced = false;
    const t = await opened({}, {
      beforeConditionalUpload(name, api) {
        if (raced || name !== NS.examFormAnswersName("c1", "s1")) return;
        raced = true;
        const current = api.getJson(name);
        api.setJson(name, { ...current, revision: current.revision + 1, answers: { ...current.answers, S01Q03: { text: "من جهاز آخر" } } });
      }
    });
    await t.save({ S01Q01: { text: "أول" } }, 0);
    const r = await t.save({ S01Q02: { text: "ثانٍ" } }, 1);
    expect(raced).toBe(true);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("DRAFT_STALE");
    expect(t.doc().answers).toEqual({ S01Q01: { text: "أول" }, S01Q03: { text: "من جهاز آخر" } });
  });

  it("the student and the class come from the session only: a body classId / studentId is ignored", async () => {
    const t = await opened();
    const r = await t.post({ action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "لي" } }, classId: "c2", studentId: "s2" });
    expect(r.status).toBe(200);
    expect(t.doc("s1", "c1").answers.S01Q01).toEqual({ text: "لي" });
    expect(t.doc("s2", "c1")).toBeNull();
    expect(t.ctx.names(NS.examFormAnswersPrefix("c2"))).toEqual([]);
    expect((await t.get("s2")).jsonBody.answers).toEqual({});
  });

  it("the service refuses a student who is not a member of the class", async () => {
    const t = await opened();
    await expect(saveStudentDraft(t.ctx.container, CODE, "c1", "s3", { patch: { S01Q01: { text: "x" } }, baseRevision: 0, now: NOW })).rejects.toMatchObject({ httpStatus: 403, code: "NOT_MEMBER" });
    expect(t.doc("s3", "c1")).toBeNull();
  });

  describe("an answer the question does not allow is refused and nothing is written", () => {
    const long = n => "س".repeat(n);
    const cases = [
      ["a question that is not in the form", { S99Q01: { text: "x" } }],
      ["an option that is not in the question", { S04Q04: { optionId: "o9" } }],
      ["a multi-choice option that is not in the question", { S04Q03: { optionIds: ["o1", "o99"] } }],
      ["a repeated multi-choice option", { S04Q03: { optionIds: ["o1", "o1"] } }],
      ["a text longer than the question allows", { S01Q01: { text: long(121) } }],
      ["a text that is not a string", { S01Q01: { text: 5 } }],
      ["an answer that is not an object", { S01Q01: "EcoResort" }],
      ["an image question (not available yet)", { S01Q04: { text: "x" } }],
      ["a file question (not available yet)", { S16Q02: { text: "x" } }],
      ["a table column that does not exist", { S02Q03: { rows: [{ goal: "a", secret: "b" }] } }],
      ["more table rows than allowed", { S02Q03: { rows: Array.from({ length: 6 }, () => ({ goal: "a", where: "b" })) } }],
      ["a table cell longer than 300 characters", { S02Q03: { rows: [{ goal: long(301), where: "b" }] } }],
      ["a matching pair with an unknown left item", { S06Q04: { pairs: { l9: "r1" } } }],
      ["a matching pair with an unknown right item", { S06Q04: { pairs: { l1: "r9" } } }],
      ["an ordering that leaves an item out", { S12Q03: { order: ["i1", "i2", "i3", "i4"] } }],
      ["an ordering that repeats an item", { S12Q03: { order: ["i1", "i1", "i3", "i4", "i5"] } }],
      ["a scale value outside the scale", { S14Q04: { values: { s1: 6 } } }],
      ["a scale value that is not a whole number", { S14Q04: { values: { s1: 2.5 } } }],
      ["a scale item that does not exist", { S14Q04: { values: { s9: 3 } } }],
      ["a checklist item that does not exist", { S13Q01: { checked: ["c9"] } }],
      ["a declaration that is not true / false", { S15Q04: { accepted: "yes" } }],
      ["a justification on a question that does not ask for one", { S04Q04: { optionId: "o1", justification: "لأن" } }],
      ["a justification longer than 1000 characters", { S04Q07: { optionId: "o2", justification: long(1001) } }],
      ["one bad answer among good ones (all or nothing)", { S01Q02: { text: "جيد" }, S04Q04: { optionId: "o9" } }]
    ];
    for (const [name, answers] of cases) {
      it(name, async () => {
        const t = await opened();
        await t.save({ S01Q01: { text: "محفوظ" } }, 0);
        const r = await t.save(answers, 1);
        expect(r.status).toBe(400);
        expect(t.doc()).toMatchObject({ revision: 1, answers: { S01Q01: { text: "محفوظ" } } });
        expect(Object.keys(t.doc().answers)).toEqual(["S01Q01"]);
      });
    }
    it("a patch that is not an object, is empty, or names more than 120 questions", async () => {
      const t = await opened();
      for (const bad of [undefined, null, [], "x", {}]) expect((await t.save(bad, 0)).status).toBe(400);
      expect((await t.save(Object.fromEntries(Array.from({ length: 121 }, (_, i) => ["S01Q" + i, null])), 0)).status).toBe(400);
      expect((await t.post({ action: "delete", baseRevision: 0 })).status).toBe(400);
      expect(t.doc()).toBeNull();
    });
  });

  it("an unknown key inside an answer is dropped, never stored (allow-list)", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "EcoResort", score: 100, correct: true }, S04Q04: { optionId: "o1", correct: true } }, 0);
    expect(t.doc().answers).toEqual({ S01Q01: { text: "EcoResort" }, S04Q04: { optionId: "o1" } });
  });

  it("a closed form refuses writes and keeps the answers readable", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "قبل الإغلاق" } }, 0);
    await t.teacher({ action: "examForm.close" });
    const r = await t.save({ S01Q02: { text: "بعد الإغلاق" } }, 1);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("FORM_CLOSED");
    expect((await t.submit(1)).status).toBe(409);
    expect(t.doc()).toMatchObject({ revision: 1, status: "draft" });
    const read = (await t.get()).jsonBody;
    expect(read).toMatchObject({ available: true, state: "closed", answers: { S01Q01: { text: "قبل الإغلاق" } } });
  });

  it("an archived class is read-only: the answers stay readable, every write is refused", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "قبل الأرشفة" } }, 0);
    t.ctx.setJson("platform/classes/c1.json", room("c1", { status: "archived", active: false }));
    expect((await t.save({ S01Q02: { text: "x" } }, 1)).status).toBe(403);
    expect((await t.submit(1)).status).toBe(403);
    const read = (await t.get()).jsonBody;
    expect(read).toMatchObject({ available: true, readOnly: true, answers: { S01Q01: { text: "قبل الأرشفة" } } });
    expect(t.doc().revision).toBe(1);
  });

  it("a stored class form this code cannot trust is refused with 503, for reads and writes (fail closed)", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "محفوظ" } }, 0);
    const broken = t.classForm();
    broken.template.sections[0].weight += 5;
    t.ctx.setJson(NS.examFormClassName("c1"), broken);
    const read = await t.get();
    expect(read.status).toBe(503);
    expect(read.jsonBody.code).toBe("FORM_UNREADABLE");
    expect(read.jsonBody.form).toBeUndefined();
    expect((await t.save({ S01Q02: { text: "x" } }, 1)).status).toBe(503);
    expect((await t.submit(1)).status).toBe(503);
    expect((await t.state()).status).toBe(503);
    expect(t.doc()).toMatchObject({ revision: 1, status: "draft" });
  });
});

describe("F2 the student submits", () => {
  it("an incomplete form is not submitted: the missing required questions are named and the draft stays a draft", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "EcoResort" } }, 0);
    const r = await t.submit(1);
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("FORM_INCOMPLETE");
    expect(r.jsonBody.missing).toContain("S01Q02");
    expect(r.jsonBody.missing).not.toContain("S01Q01");
    expect(r.jsonBody.missing).not.toContain("S01Q04");                        // an image question never blocks (F4)
    expect(t.doc()).toMatchObject({ status: "draft", revision: 1, submittedAt: null });
    expect(t.audits).toEqual([]);
  });

  it("nothing saved yet → nothing to submit", async () => {
    const t = await opened();
    const r = await t.submit(0);
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("NOTHING_TO_SUBMIT");
    expect(t.doc()).toBeNull();
  });

  it("a complete form is submitted once, audited once, and is then read-only for the student", async () => {
    const t = await opened();
    const saved = await t.save(allAnswers(), 0);
    expect(saved.jsonBody.progress).toMatchObject({ answered: 77, total: 77, missing: [] });
    const stale = await t.submit(0);
    expect(stale.status).toBe(409);
    expect(stale.jsonBody.code).toBe("DRAFT_STALE");
    const r = await t.submit(1);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, status: "submitted", revision: 2 });
    expect(r.jsonBody.submittedAt).toBeTruthy();
    expect(JSON.stringify(r.jsonBody)).not.toContain("correctOption");
    expect(t.doc()).toMatchObject({ status: "submitted", revision: 2 });
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.submit"]);
    expect(t.audits[0]).toMatchObject({ actor: "s1", targetId: CODE + "/c1/s1", details: { projectCode: CODE, classId: "c1", answered: 77, total: 77 } });

    const again = await t.submit(2);
    expect(again.status).toBe(409);
    expect(again.jsonBody.code).toBe("FORM_SUBMITTED");
    const edit = await t.save({ S01Q01: { text: "تعديل بعد التسليم" } }, 2);
    expect(edit.status).toBe(409);
    expect(edit.jsonBody.code).toBe("FORM_SUBMITTED");
    expect(t.doc()).toMatchObject({ status: "submitted", revision: 2 });
    expect(t.doc().answers.S01Q01).toEqual(fullAnswer(Q("S01Q01")));
    expect(t.audits).toHaveLength(1);
    expect((await t.get()).jsonBody).toMatchObject({ status: "submitted", revision: 2 });
  });

  it("one student's submit does not touch another student's draft", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "طالب 2" } }, 0, "s2");
    await t.save(allAnswers(), 0);
    await t.submit(1);
    expect(t.doc("s2")).toMatchObject({ status: "draft", revision: 1, answers: { S01Q01: { text: "طالب 2" } } });
    expect((await t.get("s2")).jsonBody.status).toBe("draft");
  });

  it("a form of another version is refused (the page must reload)", async () => {
    const t = await opened();
    await t.save({ S01Q01: { text: "x" } }, 0);
    const d = t.doc(); d.formVersion = 2;
    t.ctx.setJson(NS.examFormAnswersName("c1", "s1"), d);
    const r = await t.save({ S01Q02: { text: "y" } }, 1);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("FORM_VERSION_CHANGED");
  });
});

describe("F2 answers — the pure rules", () => {
  it("an empty answer of any kind is stored as «cleared» (null), never as an empty shell", () => {
    expect(normalizeAnswer(Q("S01Q01"), { text: "  \n " })).toBeNull();
    expect(normalizeAnswer(Q("S02Q03"), { rows: [{ goal: " ", where: "" }, {}] })).toBeNull();
    expect(normalizeAnswer(Q("S04Q04"), {})).toBeNull();
    expect(normalizeAnswer(Q("S04Q03"), { optionIds: [] })).toBeNull();
    expect(normalizeAnswer(Q("S06Q04"), { pairs: {} })).toBeNull();
    expect(normalizeAnswer(Q("S14Q04"), { values: {} })).toBeNull();
    expect(normalizeAnswer(Q("S13Q01"), { checked: [] })).toBeNull();
    expect(normalizeAnswer(Q("S15Q04"), { accepted: false })).toBeNull();
    expect(normalizeAnswer(Q("S01Q01"), null)).toBeNull();
  });

  it("a table keeps only its filled rows, with every column present", () => {
    expect(normalizeAnswer(Q("S02Q03"), { rows: [{ goal: "ربط الفروع" }, { goal: "", where: "" }, { where: "الراوتر" }] }))
      .toEqual({ rows: [{ goal: "ربط الفروع", where: "" }, { goal: "", where: "الراوتر" }] });
  });

  it("«answered» means complete: enough rows, every pair, every scale item, the justification when asked", () => {
    const table = Q("S02Q03");                                                   // minRows 3
    expect(isAnswered(table, { rows: [{ goal: "a", where: "b" }, { goal: "c", where: "d" }] })).toBe(false);
    expect(isAnswered(table, fullAnswer(table))).toBe(true);
    expect(isAnswered(Q("S06Q04"), { pairs: { l1: "r1", l2: "r2", l3: "r3" } })).toBe(false);
    expect(isAnswered(Q("S06Q04"), fullAnswer(Q("S06Q04")))).toBe(true);
    expect(isAnswered(Q("S14Q04"), { values: { s1: 3 } })).toBe(false);
    expect(isAnswered(Q("S04Q07"), { optionId: "o2" })).toBe(false);            // asks for a justification
    expect(isAnswered(Q("S04Q07"), { optionId: "o2", justification: "لأن البوابة خارج شبكته" })).toBe(true);
    expect(isAnswered(Q("S04Q04"), { optionId: "o1" })).toBe(true);
    expect(isAnswered(Q("S01Q01"), null)).toBe(false);
    expect(isAnswered(Q("S01Q04"), { text: "x" })).toBe(false);                 // a deferred kind is never «answered»
  });

  it("progress counts answerable questions only; an optional question never blocks", () => {
    const optional = clone(TEMPLATE);
    optional.sections[0].questions[1].required = false;                         // S01Q02
    const p = formProgress(optional, { S01Q01: { text: "x" } });
    expect(p).toMatchObject({ total: 77, answered: 1, deferred: 15 });
    expect(p.missing).not.toContain("S01Q02");
    expect(p.missing).toContain("S01Q03");
    expect(formProgress(TEMPLATE, allAnswers()).missing).toEqual([]);
    expect(formProgress(TEMPLATE, null)).toMatchObject({ answered: 0 });
  });

  it("applyDraft / applySubmit never change the document they are given", () => {
    const identity = { projectCode: CODE, classId: "c1", studentId: "s1" };
    const first = applyDraft(null, TEMPLATE, { patch: allAnswers(), baseRevision: 0, identity, now: NOW }).doc;
    const frozen = JSON.stringify(first);
    applyDraft(first, TEMPLATE, { patch: { S01Q01: { text: "آخر" } }, baseRevision: 1, identity, now: NOW });
    const submitted = applySubmit(first, TEMPLATE, { baseRevision: 1, now: NOW }).doc;
    expect(JSON.stringify(first)).toBe(frozen);
    expect(submitted).toMatchObject({ status: "submitted", submittedAt: NOW, revision: 2 });
    expect(submitted.answers).toEqual(first.answers);
  });
});
