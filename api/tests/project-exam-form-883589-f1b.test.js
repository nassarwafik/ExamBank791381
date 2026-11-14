import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getSupportedProjects, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { validateExamFormTemplate, toStudentView, summarizeExamForm, loadExamFormTemplate } from "../src/lib/project-tracker/exam-form.js";
import { DEFERRED_KINDS } from "../src/lib/project-tracker/exam-form-answers.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F1b — the 883589 project exam form («استمارة امتحان المشروع»): the second bundled template. Data and a registry flag
// only; the validation, the student projection and the F2 routes are the ones 794589 already uses
// (docs/enterprise-project-exam-form-883589.md).

const CODE = "883589";
const OTHER = "794589";
const FILE = path.join(__dirname, "..", "src", "data", "project-" + CODE, "exam-form-template.json");
const all = template => template.sections.flatMap(s => s.questions);
const question = (template, id) => all(template).find(q => q.questionId === id);
const sectionWeights = (template, from, to) => template.sections.filter(s => s.order >= from && s.order <= to).reduce((n, s) => n + s.weight, 0);
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}

describe("F1b — the bundled 883589 exam form", () => {
  it("is a valid template of 16 sections and 95 questions worth 100", () => {
    const template = getExamFormTemplate(CODE);
    expect(() => validateExamFormTemplate(template, { projectCode: CODE })).not.toThrow();
    expect(summarizeExamForm(template)).toEqual({
      projectCode: CODE, formVersion: 1, sections: 16, questions: 95,
      auto: 16, teacher: 75, unmarked: 4, withImages: 14, files: 1, totalWeight: 100
    });
    expect(template.title).toBe("استمارة امتحان المشروع");
  });

  it("keeps the sections in book order with the agreed weight of each section and axis", () => {
    const template = getExamFormTemplate(CODE);
    expect(template.sections.map(s => s.sectionId)).toEqual(Array.from({ length: 16 }, (_, i) => "S" + String(i + 1).padStart(2, "0")));
    expect(template.sections.map(s => s.order)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(template.sections.map(s => s.title)).toEqual([
      "بطاقة المشروع", "المقدمة وموضوع المشروع", "الجداول وحقولها", "المفاتيح والعلاقات بين الجداول", "معطيات الجداول",
      "التحقق من صحة المعلومات و Regex", "SQL Server Code", "الاستعلامات", "لغات البرمجة والفئات", "خدمات الويب وفحصها",
      "XML والمخططات", "الموقع: المبنى والصفحات", "الدخول والصلاحيات والأمان", "تدقيق الكتاب مقابل المشروع",
      "المردود والمصادر والأمانة الأكاديمية", "المرفقات والتسليم"
    ]);
    expect(template.sections.map(s => s.questions.length)).toEqual([3, 4, 7, 6, 4, 8, 5, 8, 5, 8, 7, 7, 7, 5, 7, 4]);
    expect(template.sections.map(s => s.weight)).toEqual([3, 3, 8, 8, 5, 8, 7, 8, 6, 9, 8, 8, 6, 5, 5, 3]);
    // project card and introduction · database design and data · validation, SQL and queries · code and web services ·
    // diagrams, site and access · audit, reflection and submission
    expect([sectionWeights(template, 1, 2), sectionWeights(template, 3, 5), sectionWeights(template, 6, 8), sectionWeights(template, 9, 10), sectionWeights(template, 11, 13), sectionWeights(template, 14, 16)])
      .toEqual([6, 21, 23, 15, 22, 13]);
    for (const s of template.sections) expect(typeof s.bookRef, s.sectionId).toBe("string");
  });

  it("has a five-level rubric from 0 to 4 whose evidence is the student's own project", () => {
    const levels = getExamFormTemplate(CODE).rubric.levels;
    expect(levels.map(l => l.value)).toEqual([0, 1, 2, 3, 4]);
    expect(levels[3].label).toContain("Visual Studio");
    expect(levels[3].label).toContain("قاعدة البيانات");
    expect(levels[3].label).toContain("خدمة الويب");
  });

  it("pins the key of every auto-marked question (a key edit must be deliberate)", () => {
    const template = getExamFormTemplate(CODE);
    const chosen = id => { const q = question(template, id); return q.options.find(o => o.id === q.answer.correctOptionId).text; };
    const pairs = id => { const q = question(template, id); return Object.fromEntries(q.left.map(l => [l.text, q.right.find(r => r.id === q.answer.pairs[l.id]).text])); };
    expect(all(template).filter(q => q.grading === "auto").map(q => q.questionId))
      .toEqual(["S03Q03", "S04Q03", "S05Q03", "S06Q02", "S06Q03", "S06Q04", "S07Q02", "S08Q01", "S08Q04", "S09Q01", "S10Q02", "S10Q03", "S11Q02", "S11Q03", "S13Q02", "S13Q03"]);

    expect(chosen("S04Q03")).toBe("واحد لمتعدد (1:N)");
    expect(chosen("S05Q03")).toBe("الزبائن أولًا ثم الطلبات");
    expect(chosen("S06Q03")).toBe("^\\d{9}$");
    expect(chosen("S06Q04")).toBe("^05\\d{8}$");
    expect(chosen("S07Q02")).toContain("تتولد تلقائيًا");
    expect(chosen("S08Q04")).toBe("يُطبَّق الأمر على كل سجلات الجدول");
    expect(chosen("S10Q03")).toBe("XML");
    expect(chosen("S11Q02")).toContain("XML يصف المعطيات");
    expect(chosen("S13Q02")).toContain("بارامترات");
    expect(chosen("S13Q03")).toContain("Hash");

    expect(pairs("S03Q03")).toEqual({
      "INT": "رقم تعريفي صحيح مثل 17", "DECIMAL(10,2)": "سعر مثل 59.90", "VARCHAR(50)": "اسم شخص",
      "DATETIME": "تاريخ ووقت معًا، مثل لحظة تسجيل طلب", "DATE": "تاريخ بلا وقت، مثل تاريخ الميلاد"
    });
    expect(pairs("S06Q02")).toEqual({
      "NOT NULL": "لا يُترك الحقل فارغًا", "UNIQUE": "لا تتكرر القيمة في سجلين", "CHECK": "القيمة يجب أن تحقق شرطًا، مثل price > 0",
      "DEFAULT": "قيمة توضع تلقائيًا إذا لم تُدخل قيمة", "FOREIGN KEY": "القيمة يجب أن توجد في جدول آخر"
    });
    expect(pairs("S08Q01")).toEqual({ "INSERT": "يضيف سجلًا جديدًا", "SELECT": "يقرأ سجلات ويعرضها", "UPDATE": "يعدّل قيمًا في سجلات موجودة", "DELETE": "يحذف سجلات" });
    expect(pairs("S09Q01")).toEqual({
      "HTML": "هيكل الصفحة ومحتواها", "CSS": "مظهر الصفحة: الألوان والخطوط والتنسيق", "JavaScript": "التفاعل داخل المتصفح",
      "C#": "منطق الخادم وعمليات خدمة الويب", "SQL": "التعامل مع المعطيات في قاعدة البيانات"
    });
    expect(pairs("S11Q03")).toEqual({
      "ERD": "الكيانات وخصائصها والعلاقات بينها", "DFD": "حركة المعطيات بين المستخدم والعمليات ومخازن المعطيات",
      "Use Case": "المستخدمون وما يستطيع كل منهم أن يفعله في النظام", "Sequence": "الرسائل بين الأطراف مرتبة حسب الزمن",
      "Activity": "خطوات عملية واحدة وتفرعات القرار فيها"
    });
    const steps = question(template, "S10Q02");
    expect(steps.answer.order.map(id => steps.items.find(i => i.id === id).text)).toEqual([
      "JavaScript في الصفحة يفحص الحقول قبل الإرسال",
      "المتصفح يرسل طلب HTTP إلى عملية خدمة الويب",
      "العملية تتحقق من صحة المعطيات ومن صلاحية المستخدم",
      "العملية تنفّذ أمر INSERT في قاعدة البيانات",
      "خدمة الويب تعيد الرد إلى المتصفح",
      "الصفحة تعرض النتيجة للمستخدم"
    ]);
  });

  it("the two regular-expression keys accept exactly what their question asks for", () => {
    const template = getExamFormTemplate(CODE);
    const accepted = (id, good, bad) => {
      const q = question(template, id);
      const passing = q.options.filter(o => { const re = new RegExp(o.text); return good.every(v => re.test(v)) && bad.every(v => !re.test(v)); });
      expect(passing.map(o => o.id), id).toEqual([q.answer.correctOptionId]);
    };
    accepted("S06Q03", ["123456789", "000000000"], ["12345678", "1234567890", "12345678a", ""]);
    accepted("S06Q04", ["0501234567", "0599999999"], ["050123456", "05012345678", "0401234567", "05abcdefgh", "5012345670"]);
  });

  it("never lists a matching or ordering question in the order of its key, and a choice key is not always the first option", () => {
    const questions = all(getExamFormTemplate(CODE));
    const matching = questions.filter(q => q.kind === "matching");
    const ordering = questions.filter(q => q.kind === "ordering");
    expect(matching).toHaveLength(5);
    expect(ordering).toHaveLength(1);
    for (const q of matching) expect(q.left.map(l => q.answer.pairs[l.id]), q.questionId).not.toEqual(q.right.map(r => r.id));
    for (const q of ordering) expect(q.answer.order, q.questionId).not.toEqual(q.items.map(i => i.id));
    const choices = questions.filter(q => q.kind === "choice" && q.grading === "auto");
    expect(choices).toHaveLength(10);
    expect(new Set(choices.map(q => q.answer.correctOptionId)).size).toBeGreaterThan(1);
  });

  it("asks for a justification on the two questions the teacher reads, and only accepts the book as a file", () => {
    const template = getExamFormTemplate(CODE);
    expect(all(template).filter(q => q.justification === true).map(q => q.questionId)).toEqual(["S04Q03", "S13Q02"]);
    const files = all(template).filter(q => q.kind === "file");
    expect(files.map(q => q.questionId)).toEqual(["S16Q03"]);
    expect(files[0].accept).toEqual([".docx", ".pdf"]);
    expect(all(template).filter(q => q.grading === "none").map(q => q.kind + ":" + q.questionId)).toEqual(["checklist:S14Q01", "scale:S15Q03", "declaration:S15Q07", "declaration:S16Q04"]);
  });

  it("is frozen and is its own file, not another project's form", () => {
    const template = getExamFormTemplate(CODE);
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(question(template, "S06Q03").answer)).toBe(true);
    expect(() => { template.sections[0].questions.push({}); }).toThrow();
    expect(getExamFormTemplate(CODE)).toBe(template);
    expect(summarizeExamForm(loadExamFormTemplate(CODE))).toEqual(summarizeExamForm(template));
    expect(template).not.toBe(getExamFormTemplate(OTHER));
    expect(template.projectCode).toBe(CODE);
    expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(template)));
  });

  it("is a class-wide form: no personal data and no single student's topic in it", () => {
    const text = fs.readFileSync(FILE, "utf8");
    expect(text).not.toMatch(/\d{9}/);                       // no identity number
    expect(text).not.toMatch(/05\d{8}/);                     // no phone number
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);     // no e-mail address
    expect(text).not.toMatch(/https?:\/\//);                 // no link copied from a book
    for (const topic of ["صالون", "حلاق", "Barber", "Salon"]) expect(text, topic).not.toContain(topic);
    // Every section asks about the student's OWN work, so two students' answers differ.
    for (const s of getExamFormTemplate(CODE).sections) expect(s.questions.some(q => /مشروعك|كتابك|موقعك|المشروع/.test(q.prompt)), s.sectionId).toBe(true);
  });
});

describe("F1b — the registry", () => {
  it("returns a form for 794589 and 883589 and for no other project", () => {
    expect(getSupportedProjects().filter(code => getExamFormTemplate(code) !== null).sort()).toEqual([OTHER, CODE]);
    expect(getExamFormTemplate("899373")).toBeNull();
    expect(() => getExamFormTemplate("000000")).toThrow(/Unknown project code/);
  });
});

describe("F1b — the student view of the 883589 form never carries an answer key", () => {
  it("has every question and no key, rubric, weight or book reference, at any depth", () => {
    const template = getExamFormTemplate(CODE);
    const view = toStudentView(template);
    expect(view.projectCode).toBe(CODE);
    expect(all(view).map(q => q.questionId)).toEqual(all(template).map(q => q.questionId));
    const keys = keysDeep(view);
    for (const secret of ["answer", "correctOptionId", "correctOptionIds", "pairs", "rubric", "weight", "bookRef"]) expect(keys.has(secret), secret).toBe(false);
    expect(JSON.stringify(view)).not.toContain("correctOption");
    expect(question(view, "S06Q03").options).toHaveLength(4);
    expect(question(view, "S10Q02").items).toHaveLength(6);
    expect(question(view, "S04Q03").justification).toBe(true);
  });
});

// The F2 server path, unchanged, now serves this project: the class's form is the 883589 file, never 794589's.
describe("F1b — a class that runs 883589 gets the 883589 form through the existing routes", () => {
  const NOW = "2026-11-14T10:00:00.000Z";
  const NS = getStorageNamespace(CODE);
  const room = (id, programCodes) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes, createdAt: NOW, updatedAt: NOW });
  const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
  function setup() {
    const ctx = createMemoryContainer({
      "platform/classes/c1.json": room("c1", [CODE]), "platform/classes/c2.json": room("c2", [OTHER]),
      "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c2")
    });
    const audits = [];
    const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
    const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
    const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
    const get = (id, code) => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?" + new URLSearchParams({ projectCode: code }), json: async () => ({}) }, studentDeps(id));
    const open = (classId, code) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId, action: "examForm.open" }) }, teacherDeps);
    return { ctx, audits, get, open };
  }

  it("the first open freezes the 883589 questions under the 883589 prefix and is audited", async () => {
    const t = setup();
    const r = await t.open("c1", CODE);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, changed: true, examForm: { hasForm: true, state: "open", formVersion: 1, summary: { sections: 16, questions: 95, auto: 16 } } });
    expect(t.ctx.names("platform/project-exam-forms/")).toEqual([NS.examFormClassName("c1")]);
    const stored = t.ctx.getJson(NS.examFormClassName("c1"));
    expect(stored.projectCode).toBe(CODE);
    expect(stored.template).toEqual(JSON.parse(JSON.stringify(getExamFormTemplate(CODE))));
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.open"]);
    expect(t.audits[0].details).toMatchObject({ projectCode: CODE, classId: "c1", firstOpen: true });
  });

  it("the student of that class reads 95 questions with no key; images and the file wait and never block", async () => {
    const t = setup();
    await t.open("c1", CODE);
    const r = await t.get("s1", CODE);
    expect(r.status).toBe(200);
    const b = r.jsonBody;
    expect(b).toMatchObject({ ok: true, available: true, state: "open", status: "draft", revision: 0, answers: {} });
    expect(b.form.projectCode).toBe(CODE);
    expect(all(b.form)).toHaveLength(95);
    const keys = keysDeep(b);
    for (const secret of ["answer", "correctOptionId", "correctOptionIds", "pairs", "rubric", "weight", "bookRef"]) expect(keys.has(secret), secret).toBe(false);
    const deferred = all(getExamFormTemplate(CODE)).filter(q => DEFERRED_KINDS.has(q.kind)).length;
    expect(deferred).toBe(15);
    expect(b.progress).toMatchObject({ total: 80, answered: 0, deferred: 15 });
  });

  it("a class that runs another project is refused this form, and gets its own", async () => {
    const t = setup();
    await t.open("c1", CODE);
    expect((await t.get("s2", CODE)).status).toBe(400);
    expect((await t.get("s1", OTHER)).status).toBe(400);
    await t.open("c2", OTHER);
    expect((await t.get("s2", OTHER)).jsonBody.form.projectCode).toBe(OTHER);
  });
});
