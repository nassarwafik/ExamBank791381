// Study Practice Strength — the per-student COMPLETION STATE of in-page learning exercises, the source of the STUDY
// part of Unified Strength. Storage: platform/learning-study/<studentId>.json, ONE document per student:
//
//   { schemaVersion: 1, pages: { "<pageId>": { courseId, moduleId, completed: { "<activityId>": "<iso time>" } } } }
//
// COMPLETION STATE, NOT A COUNTER (anti-farming): an activity id is either completed or not; a repeat, a duplicate
// request, a retry or a re-opened page can never add a second entry, and a wrong answer writes nothing. Points are
// NEVER stored — they are re-derived on every read from the completed ids that the SERVER-SIDE KEY INDEX
// (api/src/data/learning-study/<courseId>.json, generated from the real content) still lists as eligible for that
// module, through the Strength policy (student-strength.js): a MODULE's Strength is round(completed/total × 20),
// i.e. the module's unique eligible Study-Practice completion ratio, capped at 20 per module (the 25-stage model).
// Writes go through mutateJsonWithRetry (CAS): overlapping submissions converge on the same set.
const { normalizeClassStatus } = require("./class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("./class-learning-materials");
const { MODULE_MAX_POINTS, strengthFromModuleCompletion, modulePointsFromCompletion } = require("./student-strength");

const STUDY_PREFIX = "platform/learning-study/";
const studyDocName = studentId => STUDY_PREFIX + String(studentId || "").trim() + ".json";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const cleanId = v => (typeof v === "string" ? v.trim() : "");

// ── the key index (generated content data; read-only) ───────────────────────────────────────────────────────
const INDEX_CACHE = new Map();
/** The eligible-activity key index of a course, or null when the course has none. Cached per process. */
function loadStudyIndex(courseId) {
  const id = cleanId(courseId);
  if (!ID.test(id)) return null;
  if (INDEX_CACHE.has(id)) return INDEX_CACHE.get(id);
  let index = null;
  try { index = require("../data/learning-study/" + id + ".json"); } catch { index = null; }
  if (!index || index.schemaVersion !== 1 || index.courseId !== id || !index.pages || typeof index.pages !== "object") index = null;
  INDEX_CACHE.set(id, index);
  return index;
}
/** The index entry of one page ({ moduleId, activities }) or null. */
function findStudyPage(index, pageId) {
  const id = cleanId(pageId);
  const page = index && ID.test(id) ? index.pages[id] : null;
  return page && typeof page === "object" && page.activities && typeof page.activities === "object" ? page : null;
}
/** The key of one activity on one page, or null (unknown page / unknown activity / not eligible). */
function findStudyActivity(index, pageId, activityId) {
  const page = findStudyPage(index, pageId);
  const id = cleanId(activityId);
  const key = page && ID.test(id) ? page.activities[id] : null;
  return key && typeof key === "object" && typeof key.kind === "string" ? { moduleId: page.moduleId, key } : null;
}

// ── the SERVER evaluator (mirrors src/learning/practice/evaluator.ts normalization; the client verdict is never trusted) ──
const norm = s => String(s ?? "").trim().toLocaleLowerCase("ar").replace(/\s+/g, " ");
/** True when `response` answers `key` correctly. Malformed / mismatched responses are simply wrong. Pure. */
function evaluateStudyResponse(key, response) {
  if (!key || !response || typeof response !== "object") return false;
  switch (key.kind) {
    case "multipleChoice":
      return response.kind === "multipleChoice" && typeof response.optionId === "string" && Array.isArray(key.correct) && key.correct.includes(response.optionId);
    case "trueFalse":
      return response.kind === "trueFalse" && typeof response.value === "boolean" && response.value === key.answer;
    case "shortInput":
      return response.kind === "shortInput" && typeof response.text === "string" && response.text.trim() !== "" && norm(response.text) === norm(key.answer);
    case "practice-table": {
      if (response.kind !== "practice-table" || !response.choices || typeof response.choices !== "object" || Array.isArray(response.choices)) return false;
      const cells = key.cells && typeof key.cells === "object" ? key.cells : {};
      const entries = Object.entries(cells);
      return entries.length > 0 && entries.every(([cell, expected]) => typeof response.choices[cell] === "string" && response.choices[cell] === expected);
    }
    default:
      return false;
  }
}

// ── the per-student document ────────────────────────────────────────────────────────────────────────────────
/** A well-formed study document from whatever is stored (missing / malformed → empty). Pure. */
function normalizeStudyDoc(doc) {
  const out = { schemaVersion: 1, pages: {} };
  const raw = doc && typeof doc === "object" && doc.pages && typeof doc.pages === "object" ? doc.pages : {};
  for (const [pageId, entry] of Object.entries(raw)) {
    if (!ID.test(pageId) || !entry || typeof entry !== "object") continue;
    const completed = {};
    const rawCompleted = entry.completed && typeof entry.completed === "object" ? entry.completed : {};
    for (const [activityId, at] of Object.entries(rawCompleted)) if (ID.test(activityId)) completed[activityId] = typeof at === "string" ? at : "";
    out.pages[pageId] = { courseId: cleanId(entry.courseId), moduleId: cleanId(entry.moduleId), completed };
  }
  return out;
}

/**
 * Record ONE correct completion. Idempotent: an activity already completed is left exactly as it was (its original
 * timestamp kept) and reports gained 0. Returns { doc, alreadyCompleted, pageBefore, pageAfter, gained } where
 * `gained` is the ACTUAL Study Strength delta of this completion — the student's study total (page cap AND module
 * cap applied, re-derived against the index) after minus before, never negative — while pageBefore / pageAfter are
 * the page's own points. A completion that raises the page but not the (already capped) module gains 0. Called
 * inside the CAS mutation with the FRESHEST document, so a retry recomputes both totals. Pure.
 */
function applyStudyCompletion(doc, index, { courseId, moduleId, pageId, activityId }, now) {
  const normalized = normalizeStudyDoc(doc);
  const before = studyStateOf(normalized, index).totalPoints;
  const page = normalized.pages[pageId] || { courseId: cleanId(courseId), moduleId: cleanId(moduleId), completed: {} };
  const alreadyCompleted = Object.prototype.hasOwnProperty.call(page.completed, activityId);
  const pageBefore = eligibleCompletedCount(index, pageId, page.completed);
  if (!alreadyCompleted) page.completed = { ...page.completed, [activityId]: String(now || new Date().toISOString()) };
  page.courseId = cleanId(courseId); page.moduleId = cleanId(moduleId);
  normalized.pages[pageId] = page;
  const pageAfter = eligibleCompletedCount(index, pageId, page.completed);
  const after = studyStateOf(normalized, index).totalPoints;
  // `gained` is the ACTUAL module-Strength delta (module completion cap applied), never negative — the whole point
  // of the immediate «+N نقاط قوة» feedback. `pageBefore`/`pageAfter` are the page's eligible-completed COUNTS.
  return { doc: normalized, alreadyCompleted, pageBefore, pageAfter, gained: alreadyCompleted ? 0 : Math.max(0, after - before) };
}

/** How many of a page's completed ids the index STILL lists as eligible (ids that left the content stop counting). */
function eligibleCompletedCount(index, pageId, completed) {
  const page = findStudyPage(index, pageId);
  if (!page) return 0;
  return Object.keys(completed || {}).filter(id => Object.prototype.hasOwnProperty.call(page.activities, id)).length;
}

/** Total eligible Study-Practice activities per module of a course, from the index (the module-completion DENOMINATOR).
 *  Only modules with at least one eligible activity appear. Pure. */
function moduleTotalsOf(index) {
  const totals = {};
  if (!index || !index.pages || typeof index.pages !== "object") return totals;
  for (const page of Object.values(index.pages)) {
    if (!page || typeof page !== "object" || !page.moduleId || !page.activities || typeof page.activities !== "object") continue;
    const n = Object.keys(page.activities).length;
    if (n > 0) totals[page.moduleId] = (totals[page.moduleId] || 0) + n;
  }
  return totals;
}

/**
 * The authoritative study state of a student for ONE course: the module-completion map the Strength summary
 * consumes ({ moduleId: { completed, total } }), plus per-page / per-module views for the API. Module Strength is
 * round(completed/total × 20). Nothing stored is trusted beyond the completed ids; the totals come from the index.
 */
function studyStateOf(doc, index) {
  const normalized = normalizeStudyDoc(doc);
  const totals = moduleTotalsOf(index);
  const completedByModule = {};
  const pages = {};
  if (index) {
    for (const [pageId, entry] of Object.entries(normalized.pages)) {
      const spec = findStudyPage(index, pageId);
      if (!spec || entry.courseId !== index.courseId) continue;
      const completed = Object.keys(entry.completed).filter(id => Object.prototype.hasOwnProperty.call(spec.activities, id)).sort();
      completedByModule[spec.moduleId] = (completedByModule[spec.moduleId] || 0) + completed.length;
      pages[pageId] = { moduleId: spec.moduleId, completed, total: Object.keys(spec.activities).length };
    }
  }
  const moduleCompletion = {};
  const moduleViews = {};
  for (const [moduleId, total] of Object.entries(totals)) {
    const completed = completedByModule[moduleId] || 0;
    moduleCompletion[moduleId] = { completed, total };
    moduleViews[moduleId] = { points: strengthFromModuleCompletion(completed, total), max: MODULE_MAX_POINTS, completed, total };
  }
  return { moduleCompletion, pages, moduleViews, totalPoints: modulePointsFromCompletion(moduleCompletion) };
}

/** The study contribution of a student across every course that has an index (the dashboard / profile path):
 *  { moduleId: { completed, total } } for every module with eligible activities. */
function studyModuleCompletionForStrength(doc, courseIds) {
  const moduleCompletion = {};
  for (const courseId of courseIds || []) {
    const index = loadStudyIndex(courseId);
    if (!index) continue;
    Object.assign(moduleCompletion, studyStateOf(doc, index).moduleCompletion);
  }
  return moduleCompletion;
}

/** The SAME publication authority as Learning Practice: active class + course attached + module published. */
function studyAllowedForClass(classroom, courseId, moduleId) {
  if (!classroom || normalizeClassStatus(classroom) === "archived") return false;
  return classHasLearningCourse(classroom, courseId) && classCanSeeLearningModule(classroom, courseId, moduleId);
}

module.exports = {
  STUDY_PREFIX, studyDocName, loadStudyIndex, findStudyPage, findStudyActivity, evaluateStudyResponse,
  normalizeStudyDoc, applyStudyCompletion, eligibleCompletedCount, moduleTotalsOf, studyStateOf, studyModuleCompletionForStrength, studyAllowedForClass,
};
