// Study Practice Strength — the per-student COMPLETION STATE of in-page learning exercises, the source of the STUDY
// part of Unified Strength. Storage: platform/learning-study/<studentId>.json, ONE document per student:
//
//   { schemaVersion: 1, pages: { "<pageId>": { courseId, moduleId, completed: { "<activityId>": "<iso time>" } } } }
//
// COMPLETION STATE, NOT A COUNTER (anti-farming): an activity id is either completed or not; a repeat, a duplicate
// request, a retry or a re-opened page can never add a second entry, and a wrong answer writes nothing. Points are
// NEVER stored — they are re-derived on every read from the completed ids that the SERVER-SIDE KEY INDEX
// (api/src/data/learning-study/<courseId>.json, generated from the real content) still lists as eligible for that
// page, through the Strength policy (student-strength.js): min(count, 2) per page, min(Σ, 15) per module.
// Writes go through mutateJsonWithRetry (CAS): overlapping submissions converge on the same set.
const { normalizeClassStatus } = require("./class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("./class-learning-materials");
const { STUDY_PAGE_MAX_POINTS, STUDY_MODULE_MAX_POINTS, studyPointsForPage, studyPointsForModule, studyPointsFromModules } = require("./student-strength");

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
 * timestamp kept) and reports gained 0. Returns { doc, alreadyCompleted, pageBefore, pageAfter } where the page
 * values are the derived page points against the index (so the caller can tell +1 / capped / repeat apart). Pure.
 */
function applyStudyCompletion(doc, index, { courseId, moduleId, pageId, activityId }, now) {
  const normalized = normalizeStudyDoc(doc);
  const page = normalized.pages[pageId] || { courseId: cleanId(courseId), moduleId: cleanId(moduleId), completed: {} };
  const alreadyCompleted = Object.prototype.hasOwnProperty.call(page.completed, activityId);
  const pageBefore = studyPointsForPage(eligibleCompletedCount(index, pageId, page.completed));
  if (!alreadyCompleted) page.completed = { ...page.completed, [activityId]: String(now || new Date().toISOString()) };
  page.courseId = cleanId(courseId); page.moduleId = cleanId(moduleId);
  normalized.pages[pageId] = page;
  const pageAfter = studyPointsForPage(eligibleCompletedCount(index, pageId, page.completed));
  return { doc: normalized, alreadyCompleted, pageBefore, pageAfter };
}

/** How many of a page's completed ids the index STILL lists as eligible (ids that left the content stop counting). */
function eligibleCompletedCount(index, pageId, completed) {
  const page = findStudyPage(index, pageId);
  if (!page) return 0;
  return Object.keys(completed || {}).filter(id => Object.prototype.hasOwnProperty.call(page.activities, id)).length;
}

/**
 * The authoritative study state of a student for ONE course: the { moduleId: { pageId: count } } map the Strength
 * summary consumes, plus per-page / per-module views for the API. Nothing stored is trusted beyond the completed ids.
 */
function studyStateOf(doc, index) {
  const normalized = normalizeStudyDoc(doc);
  const modules = {};
  const pages = {};
  if (index) {
    for (const [pageId, entry] of Object.entries(normalized.pages)) {
      const spec = findStudyPage(index, pageId);
      if (!spec || entry.courseId !== index.courseId) continue;
      const completed = Object.keys(entry.completed).filter(id => Object.prototype.hasOwnProperty.call(spec.activities, id)).sort();
      modules[spec.moduleId] = modules[spec.moduleId] || {};
      modules[spec.moduleId][pageId] = completed.length;
      pages[pageId] = { moduleId: spec.moduleId, completed, points: studyPointsForPage(completed.length), max: STUDY_PAGE_MAX_POINTS };
    }
  }
  const moduleViews = {};
  for (const [moduleId, pageCounts] of Object.entries(modules)) moduleViews[moduleId] = { points: studyPointsForModule(pageCounts), max: STUDY_MODULE_MAX_POINTS };
  return { modules, pages, moduleViews, totalPoints: studyPointsFromModules(modules) };
}

/** The study contribution of a student across every course that has an index (the dashboard / profile path). */
function studyModulesForStrength(doc, courseIds) {
  const modules = {};
  for (const courseId of courseIds || []) {
    const index = loadStudyIndex(courseId);
    if (!index) continue;
    Object.assign(modules, studyStateOf(doc, index).modules);
  }
  return modules;
}

/** The SAME publication authority as Learning Practice: active class + course attached + module published. */
function studyAllowedForClass(classroom, courseId, moduleId) {
  if (!classroom || normalizeClassStatus(classroom) === "archived") return false;
  return classHasLearningCourse(classroom, courseId) && classCanSeeLearningModule(classroom, courseId, moduleId);
}

module.exports = {
  STUDY_PREFIX, studyDocName, loadStudyIndex, findStudyPage, findStudyActivity, evaluateStudyResponse,
  normalizeStudyDoc, applyStudyCompletion, eligibleCompletedCount, studyStateOf, studyModulesForStrength, studyAllowedForClass,
};
