// Phase F1 — the project «استمارة امتحان المشروع» (exam form): its bundled template, the validation of a template, and the
// projection a student may receive. No route, no storage and no UI in this phase (docs/enterprise-project-exam-form-f1.md).
//
// A template is one form per project: sections (each worth a share of 100) holding questions. Every question is asked to the
// whole class; most are answered from the student's OWN project, so the teacher reviews them. A small set (`grading: "auto"`)
// has one right answer for everybody and carries its key in `answer`.
//
// SAFETY: `answer` is an answer key. It lives only in this server-side data file and must never be sent to a student.
// `toStudentView` is an ALLOW-LIST projection: it copies the public fields it knows and nothing else, so a key (or any field
// added later) cannot leak by being forgotten in a deny-list.
const fs = require("fs");
const path = require("path");

const MAX_SECTIONS = 40;
const MAX_QUESTIONS_PER_SECTION = 40;
const MAX_QUESTIONS = 300;
const TOTAL_WEIGHT = 100;
const FILE_TYPES = [".pkt", ".docx", ".pdf"];

// kind → which `grading` values it accepts. "auto" = graded from the key; "teacher" = reviewed by the teacher; "none" = never marked.
const KINDS = {
  shortText: ["teacher"],
  paragraph: ["teacher"],
  cli: ["teacher"],
  table: ["teacher"],
  image: ["teacher"],
  file: ["teacher"],
  choice: ["auto", "teacher"],
  multiChoice: ["auto", "teacher"],
  matching: ["auto"],
  ordering: ["auto"],
  scale: ["none"],
  checklist: ["none"],
  declaration: ["none"]
};
const TEXT_LIMITS = { shortText: 500, paragraph: 4000, cli: 20000 };
const IMAGE_HOSTS = new Set(["image", "shortText", "paragraph", "cli", "table"]);

function fail(message) { const err = new Error(message); err.httpStatus = 400; throw err; }
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const nonEmpty = v => typeof v === "string" && v.trim() !== "";
const isInt = v => Number.isInteger(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// A list of { id, text } entries: `min`–`max` of them, ids unique, texts non-empty. Returns the ids.
function validateEntries(list, min, max, what) {
  if (!Array.isArray(list) || list.length < min || list.length > max) fail(what + ": العدد يجب أن يكون بين " + min + " و" + max + ".");
  const ids = new Set();
  for (const e of list) {
    if (!isObject(e) || !nonEmpty(e.id) || e.id.trim() !== e.id || e.id.length > 24) fail(what + ": معرّف غير صحيح.");
    if (ids.has(e.id)) fail(what + ": معرّف مكرّر " + e.id + ".");
    ids.add(e.id);
    if (!nonEmpty(e.text) || e.text.length > 300) fail(what + ": نص العنصر " + e.id + " فارغ أو أطول من 300 حرف.");
  }
  return ids;
}

function validateImages(images, what) {
  if (!isObject(images) || !isInt(images.min) || !isInt(images.max) || images.min < 0 || images.max < 1 || images.max > 6 || images.min > images.max) {
    fail(what + ": إعداد الصور غير صحيح (من 0 إلى 6، والحد الأدنى لا يتجاوز الأعلى).");
  }
}

function validateKind(q, what) {
  const auto = q.grading === "auto";
  if (!auto && has(q, "answer")) fail(what + ": مفتاح إجابة على سؤال لا يُصحَّح آليًا.");
  if (auto && !isObject(q.answer)) fail(what + ": سؤال آلي بلا مفتاح إجابة.");
  if (has(q, "images")) {
    if (!IMAGE_HOSTS.has(q.kind)) fail(what + ": هذا النوع لا يقبل صورًا.");
    validateImages(q.images, what);
  }
  if (has(q, "justification") && (q.kind !== "choice" || typeof q.justification !== "boolean")) fail(what + ": «التبرير» يخص سؤال الاختيار فقط.");

  switch (q.kind) {
    case "shortText": case "paragraph": case "cli":
      if (!isInt(q.maxLength) || q.maxLength < 1 || q.maxLength > TEXT_LIMITS[q.kind]) fail(what + ": الحد الأقصى للطول غير صحيح.");
      break;
    case "table": {
      const cols = q.columns;
      if (!Array.isArray(cols) || cols.length < 1 || cols.length > 8) fail(what + ": أعمدة الجدول يجب أن تكون بين 1 و8.");
      const ids = new Set();
      for (const c of cols) {
        if (!isObject(c) || typeof c.id !== "string" || !/^[a-z][A-Za-z0-9]{0,23}$/.test(c.id)) fail(what + ": معرّف عمود غير صحيح.");
        if (ids.has(c.id)) fail(what + ": عمود مكرّر " + c.id + ".");
        ids.add(c.id);
        if (!nonEmpty(c.title) || c.title.length > 60) fail(what + ": عنوان العمود " + c.id + " فارغ أو طويل.");
      }
      if (!isInt(q.minRows) || !isInt(q.maxRows) || q.minRows < 1 || q.maxRows > 40 || q.minRows > q.maxRows) fail(what + ": عدد صفوف الجدول غير صحيح.");
      break;
    }
    case "image":
      if (!has(q, "images")) fail(what + ": سؤال صورة بلا إعداد للصور.");
      break;
    case "file":
      if (!Array.isArray(q.accept) || q.accept.length < 1 || new Set(q.accept).size !== q.accept.length || !q.accept.every(t => FILE_TYPES.includes(t))) fail(what + ": أنواع الملفات غير مسموحة.");
      break;
    case "choice": {
      const ids = validateEntries(q.options, 2, 8, what);
      if (auto && !ids.has(q.answer.correctOptionId)) fail(what + ": الإجابة الصحيحة ليست من الخيارات.");
      break;
    }
    case "multiChoice": {
      const ids = validateEntries(q.options, 2, 10, what);
      if (auto) {
        const correct = q.answer.correctOptionIds;
        if (!Array.isArray(correct) || correct.length < 1 || new Set(correct).size !== correct.length || !correct.every(id => ids.has(id))) fail(what + ": الإجابات الصحيحة ليست من الخيارات.");
      }
      break;
    }
    case "matching": {
      const left = validateEntries(q.left, 2, 8, what);
      const right = validateEntries(q.right, 2, 8, what);
      const pairs = q.answer.pairs;
      if (!isObject(pairs) || Object.keys(pairs).length !== left.size) fail(what + ": مفتاح المطابقة لا يغطي كل العناصر.");
      for (const id of left) if (!right.has(pairs[id])) fail(what + ": مفتاح المطابقة ناقص للعنصر " + id + ".");
      break;
    }
    case "ordering": {
      const ids = validateEntries(q.items, 2, 8, what);
      const order = q.answer.order;
      if (!Array.isArray(order) || order.length !== ids.size || new Set(order).size !== order.length || !order.every(id => ids.has(id))) fail(what + ": مفتاح الترتيب ليس ترتيبًا لكل العناصر.");
      break;
    }
    case "scale":
      validateEntries(q.items, 1, 10, what);
      if (!isInt(q.min) || !isInt(q.max) || q.min >= q.max || q.max - q.min > 9) fail(what + ": حدود السلّم غير صحيحة.");
      break;
    case "checklist":
      validateEntries(q.items, 1, 12, what);
      break;
    case "declaration":
      break;
    default:
      fail(what + ": نوع سؤال غير معروف.");
  }
}

/**
 * Validates a whole exam-form template. Pure; throws an Error with httpStatus 400 and an Arabic message on the first problem.
 * @param {object} template
 * @param {{ projectCode?: string }} [options] when given, the template must belong to this project
 */
function validateExamFormTemplate(template, options = {}) {
  if (!isObject(template)) fail("قالب الاستمارة غير صحيح.");
  if (!nonEmpty(template.projectCode)) fail("قالب الاستمارة بلا رمز مشروع.");
  if (options.projectCode !== undefined && template.projectCode !== String(options.projectCode)) fail("قالب الاستمارة لا يخص هذا المشروع.");
  if (!isInt(template.formVersion) || template.formVersion < 1) fail("رقم نسخة الاستمارة غير صحيح.");
  if (!nonEmpty(template.title) || template.title.length > 120) fail("عنوان الاستمارة فارغ أو طويل.");

  const levels = template.rubric && template.rubric.levels;
  if (!Array.isArray(levels) || levels.length < 2 || levels.length > 11) fail("سلّم التقدير يحتاج مستويين على الأقل.");
  levels.forEach((level, i) => {
    if (!isObject(level) || level.value !== i) fail("مستويات سلّم التقدير يجب أن تبدأ من 0 وتتزايد بواحد.");
    if (!nonEmpty(level.label) || level.label.length > 200) fail("وصف مستوى التقدير " + i + " فارغ أو طويل.");
  });

  const sections = template.sections;
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > MAX_SECTIONS) fail("عدد أقسام الاستمارة يجب أن يكون بين 1 و" + MAX_SECTIONS + ".");
  const sectionIds = new Set();
  const orders = new Set();
  const questionIds = new Set();
  let weight = 0;
  let questions = 0;
  for (const s of sections) {
    if (!isObject(s) || typeof s.sectionId !== "string" || !/^S\d{2}$/.test(s.sectionId)) fail("كل قسم يحتاج معرّفًا بالشكل S01.");
    const sid = s.sectionId;
    if (sectionIds.has(sid)) fail("معرّف القسم مكرّر: " + sid);
    sectionIds.add(sid);
    if (!nonEmpty(s.title) || s.title.length > 120) fail("عنوان القسم " + sid + " فارغ أو طويل.");
    if (!Number.isFinite(s.order) || orders.has(s.order)) fail("ترتيب القسم " + sid + " غير صحيح أو مكرّر.");
    orders.add(s.order);
    if (!(typeof s.weight === "number" && Number.isFinite(s.weight) && s.weight >= 0 && s.weight <= TOTAL_WEIGHT)) fail("وزن القسم " + sid + " يجب أن يكون رقمًا بين 0 و" + TOTAL_WEIGHT + ".");
    weight += s.weight;
    if (has(s, "bookRef") && (typeof s.bookRef !== "string" || s.bookRef.length > 200)) fail("مرجع الكتاب في القسم " + sid + " غير صحيح.");
    if (!Array.isArray(s.questions) || s.questions.length < 1 || s.questions.length > MAX_QUESTIONS_PER_SECTION) fail("عدد أسئلة القسم " + sid + " يجب أن يكون بين 1 و" + MAX_QUESTIONS_PER_SECTION + ".");
    for (const q of s.questions) {
      if (!isObject(q) || typeof q.questionId !== "string" || !/^S\d{2}Q\d{2}$/.test(q.questionId) || !q.questionId.startsWith(sid)) fail("معرّف سؤال غير صحيح في القسم " + sid + ".");
      const what = "السؤال " + q.questionId;
      if (questionIds.has(q.questionId)) fail("معرّف السؤال مكرّر: " + q.questionId);
      questionIds.add(q.questionId);
      if (!nonEmpty(q.prompt) || q.prompt.length > 600) fail(what + ": النص فارغ أو أطول من 600 حرف.");
      if (has(q, "help") && (!nonEmpty(q.help) || q.help.length > 400)) fail(what + ": التلميح فارغ أو طويل.");
      if (typeof q.required !== "boolean") fail(what + ": قيمة «إلزامي» غير صحيحة.");
      if (!has(KINDS, q.kind)) fail(what + ": نوع سؤال غير معروف.");
      if (!KINDS[q.kind].includes(q.grading)) fail(what + ": طريقة التصحيح لا تناسب نوع السؤال.");
      validateKind(q, what);
      questions += 1;
    }
  }
  if (questions > MAX_QUESTIONS) fail("عدد أسئلة الاستمارة أكبر من الحد المسموح (" + MAX_QUESTIONS + ").");
  if (Math.abs(weight - TOTAL_WEIGHT) > 1e-9) fail("مجموع أوزان الأقسام يجب أن يساوي " + TOTAL_WEIGHT + ".");
}

const entries = list => list.map(e => ({ id: e.id, text: e.text }));

// The public shape of one question, built field by field (allow-list). Never copies `answer`.
function studentQuestion(q) {
  const out = { questionId: q.questionId, prompt: q.prompt, kind: q.kind, grading: q.grading, required: q.required };
  if (has(q, "help")) out.help = q.help;
  if (has(q, "images")) out.images = { min: q.images.min, max: q.images.max };
  switch (q.kind) {
    case "shortText": case "paragraph": case "cli": out.maxLength = q.maxLength; break;
    case "table": out.columns = q.columns.map(c => ({ id: c.id, title: c.title })); out.minRows = q.minRows; out.maxRows = q.maxRows; break;
    case "file": out.accept = q.accept.slice(); break;
    case "choice": out.options = entries(q.options); if (q.justification === true) out.justification = true; break;
    case "multiChoice": out.options = entries(q.options); break;
    case "matching": out.left = entries(q.left); out.right = entries(q.right); break;
    case "ordering": out.items = entries(q.items); break;
    case "scale": out.items = entries(q.items); out.min = q.min; out.max = q.max; break;
    case "checklist": out.items = entries(q.items); break;
    default: break;
  }
  return out;
}

/**
 * The form as a student may receive it: sections and questions in template order, with no answer key and no field this
 * module does not know. The template must already be valid.
 */
function toStudentView(template) {
  return {
    projectCode: template.projectCode,
    formVersion: template.formVersion,
    title: template.title,
    sections: template.sections.slice().sort((a, b) => a.order - b.order).map(s => ({
      sectionId: s.sectionId,
      title: s.title,
      order: s.order,
      questions: s.questions.map(studentQuestion)
    }))
  };
}

// Counts used by the hub and by the tests: how big the form is and how it is marked.
function summarizeExamForm(template) {
  const all = template.sections.flatMap(s => s.questions);
  return {
    projectCode: template.projectCode,
    formVersion: template.formVersion,
    sections: template.sections.length,
    questions: all.length,
    auto: all.filter(q => q.grading === "auto").length,
    teacher: all.filter(q => q.grading === "teacher").length,
    unmarked: all.filter(q => q.grading === "none").length,
    withImages: all.filter(q => has(q, "images")).length,
    files: all.filter(q => q.kind === "file").length,
    totalWeight: template.sections.reduce((sum, s) => sum + s.weight, 0)
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const cache = {};
function templateCandidates(projectCode) {
  const rel = ["data", "project-" + projectCode, "exam-form-template.json"];
  return [
    path.join(process.cwd(), "src", ...rel),
    path.join(__dirname, "..", "..", ...rel)
  ];
}

/**
 * Reads one template file: parsed, validated for `projectCode`, frozen. A file that fails validation throws, so a broken
 * template can never be handed to a caller.
 */
function readExamFormTemplateFile(file, projectCode) {
  const template = JSON.parse(fs.readFileSync(file, "utf8"));
  validateExamFormTemplate(template, { projectCode });
  return deepFreeze(template);
}

/**
 * The bundled exam-form template of a project (read-only, versioned in the repository). The returned object is shared and
 * frozen: a caller that needs its own copy (a class snapshot) clones it.
 */
function loadExamFormTemplate(projectCode) {
  const code = String(projectCode || "");
  if (!/^\d{6}$/.test(code)) throw new Error("Unknown project code: " + projectCode);
  if (cache[code]) return cache[code];
  for (const candidate of templateCandidates(code)) {
    if (fs.existsSync(candidate)) {
      cache[code] = readExamFormTemplateFile(candidate, code);
      return cache[code];
    }
  }
  throw new Error("Exam form template not found for project " + code);
}

module.exports = { KINDS, FILE_TYPES, TOTAL_WEIGHT, validateExamFormTemplate, toStudentView, summarizeExamForm, readExamFormTemplateFile, loadExamFormTemplate };
