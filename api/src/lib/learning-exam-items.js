// 791381s Phase 8C-1 (docs/enterprise-791381s-enrichment-plan.md §11.4) — the PRIVATE store of the learning book's ADVANCED
// exam items: questions of the platform's advanced types (multipleSelect, numericResponse, matrix, categorization, inline cloze,
// label / hotspot diagrams, parametric numeric, table fill…) placed on a unit's «تدريبات الوحدة» page by a metadata-only
// `exam-item` block (8C-2). The question, its key and its explanation live HERE only — under api/, never in a browser bundle:
//
//   api/src/data/learning-exam-items/<courseId>.json
//   { schemaVersion: 1, courseId, items: { "<itemId>": {
//       moduleId,                     // the unit whose PUBLICATION releases the item (the class gate)
//       label,                        // the card's title (public)
//       examSnapshot,                 // a structured exam in the Builder's own node schema (sections → questions)
//       feedback?: { "<questionId>": { explanation } }   // shown after an answer to that question, right or wrong
//   } } }
//
// Every item is validated at load with the platform's own authorities (the shared question-type validator, the allowlist of
// types below, the course's module registry); an item that fails is kept as INVALID — the API answers it with a retryable error
// and never grades it (a broken item is not the learner's fault). The store is read once per process and deep-frozen.
const path = require("path");
const fs = require("fs");
require("./question-type-graders");                      // registers the shared per-type validators (same as the grader)
const { validateQuestionTypeNode } = require("./shared-finalization/questionTypeValidation");
const { findLearningModule } = require("./learning-materials-registry");
const { sanitizeExamForStudent } = require("./student-exam-sanitize");
const { gradeExam, parametricGenerationContext } = require("./assignment-grading");

const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The question types an exam item may use: auto-graded by the official grader, reasonable on a phone. Open responses,
 *  coding, simulations, composites and the network CLI stay out (no automatic score, or too heavy for a page). */
const ALLOWED_TYPES = Object.freeze(["multipleChoice", "trueFalse", "multipleSelect", "numericResponse", "matrix", "categorization", "inlineCloze", "labelDiagram", "hotspot", "parametricNumeric", "tableFill"]);
const MAX_QUESTIONS = 12;

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const cleanId = v => (typeof v === "string" ? v.trim() : "");
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); }
  return value;
}
const typeOf = q => String(q.presentationType || q.type || "");

/** The structural + authority problems of one item (empty = valid). Pure. */
function validateExamItem(courseId, itemId, item) {
  const issues = [];
  const bad = m => issues.push(itemId + ": " + m);
  if (!ID.test(itemId)) bad("unsafe item id");
  if (!isObj(item)) { bad("not an object"); return issues; }
  if (!ID.test(cleanId(item.moduleId)) || !findLearningModule(courseId, item.moduleId)) bad("moduleId is not a module of " + courseId);
  if (typeof item.label !== "string" || !item.label.trim()) bad("label is required");
  const exam = item.examSnapshot;
  if (!isObj(exam) || !Array.isArray(exam.sections) || exam.sections.length === 0) { bad("examSnapshot must be a structured exam (sections)"); return issues; }
  const questions = exam.sections.flatMap(s => (isObj(s) && Array.isArray(s.questions) ? s.questions : []));
  if (questions.length === 0 || questions.length > MAX_QUESTIONS) bad("1–" + MAX_QUESTIONS + " questions");
  const ids = new Set();
  for (const q of questions) {
    const qid = isObj(q) ? cleanId(q.examQuestionId) : "";
    if (!ID.test(qid) || ids.has(qid)) { bad("question ids must be safe and unique"); continue; }
    ids.add(qid);
    const type = typeOf(q);
    if (!ALLOWED_TYPES.includes(type)) { bad(qid + ": type " + type + " is not allowed in a learning exam item"); continue; }
    if (!(Number(q.marks) > 0)) bad(qid + ": marks must be positive");
    const found = validateQuestionTypeNode(q, type, q.questionTypeVersion).filter(i => i.severity === "error");
    if (found.length) bad(qid + ": " + found.map(i => i.code).join(", "));
  }
  if (item.feedback !== undefined) {
    if (!isObj(item.feedback)) bad("feedback must be an object");
    else for (const [qid, fb] of Object.entries(item.feedback)) {
      if (!ids.has(qid)) bad("feedback for an unknown question " + qid);
      else if (!isObj(fb) || typeof fb.explanation !== "string" || !fb.explanation.trim()) bad("feedback." + qid + ".explanation is required");
    }
  }
  return issues;
}

const CACHE = new Map();
const DATA_DIR = path.join(__dirname, "..", "data", "learning-exam-items");
/** The course's item index → { courseId, items: Map(itemId → { item, issues }) }, or null when the course has none. Cached. */
function loadExamItems(courseId, deps = {}) {
  const id = cleanId(courseId);
  if (!ID.test(id)) return null;
  if (!deps.readIndex && CACHE.has(id)) return CACHE.get(id);
  let raw = null;
  try { raw = deps.readIndex ? deps.readIndex(id) : JSON.parse(fs.readFileSync(path.join(DATA_DIR, id + ".json"), "utf8")); } catch { raw = null; }
  let index = null;
  if (isObj(raw) && raw.schemaVersion === 1 && raw.courseId === id && isObj(raw.items)) {
    const items = new Map();
    for (const [itemId, item] of Object.entries(raw.items)) items.set(itemId, { item: deepFreeze(JSON.parse(JSON.stringify(item))), issues: validateExamItem(id, itemId, item) });
    index = { courseId: id, items };
  }
  if (!deps.readIndex) CACHE.set(id, index);
  return index;
}

/** One item: { status: "ok", item } · { status: "invalid", issues, item } (gated like any item, never served) · { status: "missing" }. */
function findExamItem(index, itemId) {
  const id = cleanId(itemId);
  const entry = index && ID.test(id) ? index.items.get(id) : null;
  if (!entry) return { status: "missing" };
  return entry.issues.length ? { status: "invalid", issues: entry.issues, item: entry.item } : { status: "ok", item: entry.item };
}

/** The ONE generation context of an item for a learner: the same on GET and on check (a parametric question shows and grades
 *  the same instance). The `learning:` prefix keeps it apart from every real assignment id. */
const examItemContext = (courseId, itemId, learnerId) => parametricGenerationContext("learning:" + courseId + ":" + itemId, learnerId, 1);

const questionsOf = item => item.examSnapshot.sections.flatMap(s => s.questions);
/** What the browser receives: the card metadata and the SANITIZED exam (the platform's student projection — no key). */
function studentItemView(itemId, item, ctx) {
  const questions = questionsOf(item);
  return {
    item: { itemId, label: item.label, moduleId: item.moduleId, questionCount: questions.length, totalMarks: questions.reduce((n, q) => n + Number(q.marks || 0), 0) },
    exam: sanitizeExamForStudent(item.examSnapshot, ctx),
  };
}

const isAnswer = a => isObj(a) && typeof a.kind === "string";
/**
 * The official grader's verdict on the learner's answers (gradeExam — the same engine as every exam), for practice: per question
 * right / wrong / manual review, its score, the per-part counts it reports, and — only for a question the learner ANSWERED —
 * the item's explanation. Only the `answers` map is read; nothing is persisted. Never the key itself.
 */
function checkExamItem(item, answers, ctx) {
  const given = isObj(answers) ? answers : {};
  const graded = gradeExam(item.examSnapshot, given, ctx);
  const feedback = isObj(item.feedback) ? item.feedback : {};
  return {
    score: graded.score, totalMarks: graded.totalMarks, percentage: graded.percentage,
    questions: graded.questions.map(g => {
      const answered = isAnswer(given[g.questionId]);
      const row = { questionId: g.questionId, answered, correct: answered && g.correct === true, manualReview: g.manualReview === true, score: g.score, maxMarks: g.maxMarks };
      if (g.parts && typeof g.parts.correct === "number" && typeof g.parts.total === "number") row.parts = { correct: g.parts.correct, total: g.parts.total };
      const fb = feedback[g.questionId];
      if (answered && isObj(fb) && typeof fb.explanation === "string") row.explanation = fb.explanation;
      return row;
    }),
  };
}

function resetExamItemCacheForTests() { CACHE.clear(); }

module.exports = { ALLOWED_TYPES, validateExamItem, loadExamItems, findExamItem, examItemContext, studentItemView, checkExamItem, resetExamItemCacheForTests };
