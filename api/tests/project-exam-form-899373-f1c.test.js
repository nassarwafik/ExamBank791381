import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getSupportedProjects, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { validateExamFormTemplate, toStudentView, summarizeExamForm, loadExamFormTemplate } from "../src/lib/project-tracker/exam-form.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { routesWithFormlessProject } from "./fixtures/formless-project.js";

// Phase F1c — the 899373 project exam form («استمارة امتحان المشروع»): the third bundled template, for the Access database
// project. Data and a registry flag only; the validation, the student projection and the routes are the ones the other two
// projects use (docs/enterprise-project-exam-form-899373.md). Owner decision of 2026-11-15: no file is uploaded to the
// site, so this form has no file question at all.

const CODE = "899373";
const OTHERS = ["794589", "883589"];
const NOW = "2026-11-15T08:00:00.000Z";
const NS = getStorageNamespace(CODE);
const FILE = path.join(__dirname, "..", "src", "data", "project-" + CODE, "exam-form-template.json");
const all = template => template.sections.flatMap(s => s.questions);
const question = (template, id) => all(template).find(q => q.questionId === id);
const sectionWeights = (template, from, to) => template.sections.filter(s => s.order >= from && s.order <= to).reduce((n, s) => n + s.weight, 0);
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}
function fullAnswer(q) {
  switch (q.kind) {
    case "shortText": case "paragraph": case "cli": return { text: "جواب " + q.questionId };
    case "table": return { rows: Array.from({ length: q.minRows }, (_, i) => Object.fromEntries(q.columns.map(c => [c.id, c.id + i]))) };
    case "choice": return { optionId: q.answer.correctOptionId };
    case "multiChoice": return { optionIds: q.answer.correctOptionIds };
    case "matching": return { pairs: q.answer.pairs };
    case "ordering": return { order: q.answer.order };
    case "scale": return { values: Object.fromEntries(q.items.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items[0].id] };
    case "declaration": return { accepted: true };
    default: throw new Error("no answer for " + q.kind);
  }
}

describe("F1c — the bundled 899373 exam form", () => {
  it("is a valid template of 15 sections and 84 questions worth 100, with no file question", () => {
    const template = getExamFormTemplate(CODE);
    expect(() => validateExamFormTemplate(template, { projectCode: CODE })).not.toThrow();
    expect(summarizeExamForm(template)).toEqual({
      projectCode: CODE, formVersion: 1, sections: 15, questions: 84,
      auto: 17, teacher: 62, unmarked: 5, withImages: 13, files: 0, totalWeight: 100
    });
    expect(template.title).toBe("استمارة امتحان المشروع");
    expect(all(template).filter(q => q.kind === "file")).toEqual([]);
  });

  it("keeps the sections in book order with the agreed weight of each section and axis", () => {
    const template = getExamFormTemplate(CODE);
    expect(template.sections.map(s => s.sectionId)).toEqual(Array.from({ length: 15 }, (_, i) => "S" + String(i + 1).padStart(2, "0")));
    expect(template.sections.map(s => s.order)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(template.sections.map(s => s.title)).toEqual([
      "بطاقة المشروع", "المقدمة وموضوع المشروع", "الجداول وحقولها", "المفاتيح والعلاقات بين الجداول", "معطيات الجداول",
      "التحقق من صحة المعلومات وقواعد التحقق", "SQL Server Code", "الفئات البرمجية (Classes)", "المخططات: ERD و DSD و DFD",
      "استعلامات الإضافة والحذف والتعديل", "استعلامات البحث والحساب والبارامتر", "النماذج والتقارير في Access",
      "تدقيق الكتاب مقابل ملف Access", "المردود والمصادر والأمانة الأكاديمية", "التسليم"
    ]);
    expect(template.sections.map(s => s.questions.length)).toEqual([3, 4, 7, 6, 4, 6, 5, 5, 6, 6, 9, 7, 5, 7, 4]);
    expect(template.sections.map(s => s.weight)).toEqual([3, 4, 9, 9, 6, 9, 7, 7, 8, 8, 10, 8, 5, 4, 3]);
    // project card and introduction · database design and data · validation and SQL code · classes and diagrams ·
    // queries · Access forms and reports · audit, reflection and submission
    expect([sectionWeights(template, 1, 2), sectionWeights(template, 3, 5), sectionWeights(template, 6, 7), sectionWeights(template, 8, 9), sectionWeights(template, 10, 11), sectionWeights(template, 12, 12), sectionWeights(template, 13, 15)])
      .toEqual([7, 24, 16, 15, 18, 8, 12]);
    for (const s of template.sections) expect(typeof s.bookRef, s.sectionId).toBe("string");
  });

  it("has a five-level rubric from 0 to 4 whose evidence is the student's own Access file", () => {
    const levels = getExamFormTemplate(CODE).rubric.levels;
    expect(levels.map(l => l.value)).toEqual([0, 1, 2, 3, 4]);
    expect(levels[3].label).toContain("ملف Access");
    expect(levels[3].label).toContain("الاستعلامات");
    expect(levels[1].label).toContain("منقولة من الكتاب");
  });

  it("pins the key of every auto-marked question (a key edit must be deliberate)", () => {
    const template = getExamFormTemplate(CODE);
    const chosen = id => { const q = question(template, id); return q.options.find(o => o.id === q.answer.correctOptionId).text; };
    const pairs = id => { const q = question(template, id); return Object.fromEntries(q.left.map(l => [l.text, q.right.find(r => r.id === q.answer.pairs[l.id]).text])); };
    expect(all(template).filter(q => q.grading === "auto").map(q => q.questionId))
      .toEqual(["S03Q03", "S04Q03", "S05Q03", "S06Q02", "S06Q03", "S06Q04", "S07Q02", "S08Q02", "S09Q01", "S09Q03", "S10Q01", "S10Q04", "S11Q04", "S11Q05", "S11Q06", "S11Q07", "S12Q04"]);

    expect(chosen("S04Q03")).toBe("إضافة سجل في الجدول التابع يشير إلى سجل غير موجود في الجدول الرئيسي");
    expect(chosen("S05Q03")).toBe("يرفض Access حفظ السجل ويعرض رسالة");
    expect(chosen("S06Q03")).toBe("يُرفض الإدخال وتظهر رسالة الخطأ");
    expect(chosen("S06Q04")).toBe("CHECK (status IN ('Confirmed', 'Cancelled', 'Completed'))");
    expect(chosen("S07Q02")).toBe("يولّد الرقم وحده: يبدأ من 1 ويزيد 1 مع كل سجل جديد");
    expect(chosen("S09Q03")).toBe("واحد إلى متعدد");
    expect(chosen("S10Q04")).toBe("يُطبَّق على كل سجلات الجدول");
    expect(chosen("S11Q04")).toBe("[أدخل اسم المدينة]");
    expect(chosen("S11Q05")).toBe("سطرًا لكل مدينة ومعه عدد زبائنها");
    expect(chosen("S12Q04")).toBe("استعلام بارامتر");

    expect(pairs("S03Q03")).toEqual({
      "ترقيم تلقائي (AutoNumber)": "رقم تعريفي يتولد وحده مع كل سجل جديد", "نص قصير (Short Text)": "اسم شخص", "رقم (Number)": "مدة بالدقائق مثل 45",
      "عملة (Currency)": "سعر مثل 59.90", "تاريخ/وقت (Date/Time)": "تاريخ الميلاد", "نعم/لا (Yes/No)": "هل دُفع المبلغ؟"
    });
    expect(pairs("S06Q02")).toEqual({
      "PRIMARY KEY": "يعرّف كل سجل: القيمة لا تتكرر ولا تكون فارغة", "NOT NULL": "الحقل لا يُترك فارغًا",
      "UNIQUE": "القيمة لا تتكرر في سجلين، ويمكن أن تبقى فارغة", "DEFAULT": "قيمة تُكتب وحدها إن لم يُدخل المستخدم شيئًا",
      "CHECK": "شرط يجب أن تحققه القيمة، مثل أن تكون أكبر من صفر", "FOREIGN KEY": "القيمة يجب أن تشير إلى سجل موجود في جدول آخر"
    });
    expect(pairs("S08Q02")).toEqual({ "INT": "int", "VARCHAR(50)": "string", "DECIMAL(10,2)": "decimal", "DATETIME": "DateTime", "BIT": "bool" });
    expect(pairs("S09Q01")).toEqual({
      "ERD": "الكيانات وصفاتها والعلاقات بينها", "DSD": "مبنى الجداول: الحقول وأنواعها والمفاتيح",
      "DFD": "حركة البيانات: من يرسل ماذا إلى أي عملية، وأين تُحفظ"
    });
    expect(pairs("S10Q01")).toEqual({
      "استعلام إلحاق (Append)": "INSERT INTO", "استعلام تحديث (Update)": "UPDATE ... SET", "استعلام حذف (Delete)": "DELETE FROM", "استعلام تحديد (Select)": "SELECT ... FROM"
    });
    const aggregates = question(template, "S11Q06");
    expect(aggregates.answer.correctOptionIds.map(id => aggregates.options.find(o => o.id === id).text)).toEqual(["SUM", "COUNT", "AVG"]);
    const clauses = question(template, "S11Q07");
    expect(clauses.answer.order.map(id => clauses.items.find(i => i.id === id).text)).toEqual(["SELECT", "FROM", "WHERE", "ORDER BY"]);
  });

  it("never lists a matching or ordering question in the order of its key, and a choice key is not always the same option", () => {
    const questions = all(getExamFormTemplate(CODE));
    const matching = questions.filter(q => q.kind === "matching");
    const ordering = questions.filter(q => q.kind === "ordering");
    expect(matching).toHaveLength(5);
    expect(ordering).toHaveLength(1);
    for (const q of matching) {
      expect(q.left.map(l => q.answer.pairs[l.id]), q.questionId).not.toEqual(q.right.map(r => r.id));
      expect(new Set(Object.values(q.answer.pairs)).size, q.questionId).toBe(q.left.length);        // each right entry is used once
    }
    for (const q of ordering) expect(q.answer.order, q.questionId).not.toEqual(q.items.map(i => i.id));
    const choices = questions.filter(q => q.kind === "choice" && q.grading === "auto");
    expect(choices).toHaveLength(10);
    const positions = choices.map(q => q.answer.correctOptionId);
    expect(new Set(positions).size).toBe(4);                                                         // every position is used
    for (const id of new Set(positions)) expect(positions.filter(p => p === id).length, id).toBeLessThanOrEqual(4);
  });

  it("takes images where the book has screenshots, and hands the files to the teacher instead of uploading them", () => {
    const template = getExamFormTemplate(CODE);
    const images = all(template).filter(q => q.kind === "image");
    expect(images.map(q => q.questionId)).toEqual(["S01Q03", "S03Q07", "S04Q06", "S05Q04", "S06Q06", "S09Q06", "S10Q06", "S11Q09", "S12Q06", "S12Q07", "S13Q05", "S15Q01", "S15Q02"]);
    expect(all(template).filter(q => q.images && q.kind !== "image")).toEqual([]);
    expect(images.filter(q => !q.required).map(q => [q.questionId, q.images.min])).toEqual([["S15Q02", 0]]);
    for (const q of images.filter(q => q.required)) expect(q.images.min, q.questionId).toBeGreaterThanOrEqual(1);
    const handed = question(template, "S15Q03");
    expect(handed).toMatchObject({ kind: "checklist", grading: "none" });
    expect(handed.prompt).toContain("الملفات لا تُرفع إلى الموقع");
    expect(handed.items.map(i => i.text)).toEqual(["ملف Access النهائي", "كتاب المشروع النهائي"]);
    expect(all(template).filter(q => q.grading === "none").map(q => q.kind + ":" + q.questionId)).toEqual(["checklist:S13Q01", "scale:S14Q03", "declaration:S14Q07", "checklist:S15Q03", "declaration:S15Q04"]);
  });

  it("is frozen and is its own file, not another project's form", () => {
    const template = getExamFormTemplate(CODE);
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(question(template, "S06Q02").answer)).toBe(true);
    expect(() => { template.sections[0].questions.push({}); }).toThrow();
    expect(getExamFormTemplate(CODE)).toBe(template);
    expect(summarizeExamForm(loadExamFormTemplate(CODE))).toEqual(summarizeExamForm(template));
    for (const other of OTHERS) expect(template).not.toBe(getExamFormTemplate(other));
    expect(template.projectCode).toBe(CODE);
    expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(template)));
  });

  it("is a class-wide form: no personal data, no single student's topic and no invisible character in it", () => {
    const text = fs.readFileSync(FILE, "utf8");
    expect(text).not.toMatch(/\d{9}/);                       // no identity number
    expect(text).not.toMatch(/05\d{8}/);                     // no phone number
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);     // no e-mail address
    expect(text).not.toMatch(/https?:\/\//);                 // no link copied from a book
    for (const topic of ["صالون", "حلاق", "حالق", "Barber", "Salon", "Employees", "Clients", "Appointments", "Invoices"]) expect(text, topic).not.toContain(topic);
    expect(text).not.toMatch(/[​-‏‪-‮⁦-⁩﻿]/);   // direction marks and zero-width characters
    // Every section asks about the student's OWN work, so two students' answers differ.
    for (const s of getExamFormTemplate(CODE).sections) expect(s.questions.some(q => /مشروعك|كتابك|ملفك|جداولك|نماذجك|تقاريرك|أنت/.test(q.prompt)), s.sectionId).toBe(true);
  });

  it("gives the student every question and no answer key", () => {
    const template = getExamFormTemplate(CODE);
    const view = toStudentView(template);
    expect(view.sections.flatMap(s => s.questions).map(q => q.questionId)).toEqual(all(template).map(q => q.questionId));
    const keys = keysDeep(view);
    // (a section's `order` is public; the key of an ordering question lives under `answer`)
    for (const secret of ["answer", "correctOptionId", "correctOptionIds", "pairs", "rubric", "weight", "bookRef"]) expect(keys.has(secret), secret).toBe(false);
    expect(keysDeep(JSON.parse(JSON.stringify(template))).has("answer")).toBe(true);
  });
});

describe("F1c — the registry and the routes", () => {
  const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
  const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
  function setup() {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
    const audits = [];
    const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
    const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
    const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
    const teacher = (body, route = tracker) => route({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, teacherDeps);
    const state = (route = tracker) => route({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId: "c1", resource: "exam-form" }), json: async () => ({}) }, teacherDeps);
    const get = (route = studentForm) => route({ method: "GET", url: "https://x/api/student-project-exam-form?projectCode=" + CODE, json: async () => ({}) }, studentDeps);
    const post = body => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps);
    return { ctx, audits, teacher, state, get, post };
  }

  it("every bundled project ships its own form", () => {
    expect(getSupportedProjects().filter(code => getExamFormTemplate(code) !== null).sort()).toEqual([...OTHERS, CODE]);
    expect(getExamFormTemplate(CODE).projectCode).toBe(CODE);
    expect(() => getExamFormTemplate("000000")).toThrow(/Unknown project code/);
  });

  it("the teacher opens it for a class, under the 899373 prefix, and the student receives it without keys", async () => {
    const t = setup();
    expect((await t.state()).jsonBody.examForm).toMatchObject({ hasForm: true, state: "none", summary: { sections: 15, questions: 84 } });
    expect((await t.get()).jsonBody).toMatchObject({ available: false });
    const opened = await t.teacher({ action: "examForm.open", imageAnswers: true });
    expect(opened.status).toBe(200);
    expect(t.ctx.names("platform/project-exam-forms/")).toEqual([NS.examFormClassName("c1")]);
    expect(NS.examFormClassName("c1")).toContain("/" + CODE + "/");
    const view = (await t.get()).jsonBody;
    expect(view).toMatchObject({ available: true, state: "open", status: "draft", deferredKinds: ["file"], progress: { total: 84, answered: 0, deferred: 0 } });
    expect(view.form.sections).toHaveLength(15);
    expect(JSON.stringify(view)).not.toMatch(/correctOption|"answer"\s*:/);
  });

  it("with no file question nothing is deferred: a complete form with its required images is submitted", async () => {
    const t = setup();
    await t.teacher({ action: "examForm.open", imageAnswers: true });
    const questions = all(getExamFormTemplate(CODE));
    const answers = Object.fromEntries(questions.filter(q => q.kind !== "image").map(q => [q.questionId, fullAnswer(q)]));
    expect((await t.post({ action: "saveDraft", baseRevision: 0, answers })).status).toBe(200);
    // Every answer is in; the required images are not: the submit names exactly those questions.
    const refused = await t.post({ action: "submit", baseRevision: 1 });
    expect(refused.status).toBe(400);
    expect(refused.jsonBody.code).toBe("FORM_INCOMPLETE");
    expect(refused.jsonBody.missing).toEqual(questions.filter(q => q.kind === "image" && q.required).map(q => q.questionId));
    // Image references as the server writes them (the upload itself is F4's, tested there).
    const name = NS.examFormAnswersName("c1", "s1");
    const doc = t.ctx.getJson(name);
    let n = 0;
    for (const q of questions.filter(x => x.kind === "image" && x.required)) doc.answers[q.questionId] = { images: Array.from({ length: q.images.min }, () => ({ id: (n++).toString(16).padStart(24, "0"), width: 800, height: 600, bytes: 1000, addedAt: NOW })) };
    t.ctx.setJson(name, doc);
    const done = await t.post({ action: "submit", baseRevision: 1 });
    expect(done.status).toBe(200);
    expect(done.jsonBody).toMatchObject({ status: "submitted", progress: { total: 84, answered: 83, deferred: 0, missing: [] } });   // the one optional image question is not «answered»
  });

  it("a class with image answers off still submits: its image questions wait and never block", async () => {
    const t = setup();
    await t.teacher({ action: "examForm.open" });
    const questions = all(getExamFormTemplate(CODE));
    const answers = Object.fromEntries(questions.filter(q => q.kind !== "image").map(q => [q.questionId, fullAnswer(q)]));
    expect((await t.post({ action: "saveDraft", baseRevision: 0, answers })).jsonBody.progress).toMatchObject({ total: 71, answered: 71, deferred: 13, missing: [] });
    expect((await t.post({ action: "submit", baseRevision: 1 })).status).toBe(200);
  });

  it("the routes still answer «no form» for a project that ships none", async () => {
    // No bundled project is without a form any more; the branch is asked through a registry that has one (the fixture).
    const formless = routesWithFormlessProject(CODE);
    const t = setup();
    expect((await t.state(formless.tracker)).jsonBody.examForm).toEqual({ hasForm: false, state: "none" });
    const refused = await t.teacher({ action: "examForm.open" }, formless.tracker);
    expect(refused.status).toBe(400);
    expect(refused.jsonBody.code).toBe("NO_FORM");
    expect((await t.get(formless.studentForm)).jsonBody).toMatchObject({ available: false });
    expect(t.ctx.names("platform/project-exam-forms/")).toEqual([]);
    // The fixture changes nothing for the real routes.
    expect((await t.state()).jsonBody.examForm).toMatchObject({ hasForm: true, state: "none" });
    expect(getExamFormTemplate(CODE)).not.toBeNull();
  });

  it("the «no form» fixture leaves the registry and the loaded routes exactly as they were", () => {
    const nodeRequire = createRequire(import.meta.url);
    const registry = nodeRequire("../src/lib/project-tracker/registry.js");
    const route = nodeRequire.resolve("../src/functions/project-tracker.js");
    const before = { ask: registry.getExamFormTemplate, module: nodeRequire(route) };
    const formless = routesWithFormlessProject(CODE);
    expect(formless.tracker).not.toBe(before.module.handler);                       // a fresh copy, never the loaded route
    expect(registry.getExamFormTemplate).toBe(before.ask);
    expect(registry.getExamFormTemplate(CODE).projectCode).toBe(CODE);
    expect(nodeRequire(route)).toBe(before.module);                                 // the module cache holds the same route
    expect(() => routesWithFormlessProject("000000")).toThrow(/unknown project/);
  });
});
