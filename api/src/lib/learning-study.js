// Study Practice Strength — the per-student COMPLETION STATE of in-page learning exercises, the source of the STUDY
// part of Unified Strength. Storage: platform/learning-study/<studentId>.json, ONE document per student:
//
//   { schemaVersion: 1, pages: { "<pageId>": { courseId, moduleId, completed: { "<activityId>": "<iso time>" } } } }
//
// COMPLETION STATE, NOT A COUNTER (anti-farming): an activity id is either completed or not; a repeat, a duplicate
// request, a retry or a re-opened page can never add a second entry, and a wrong answer writes nothing. Points are
// NEVER stored — they are re-derived on every read from the completed ids that the SERVER-SIDE KEY INDEX
// (api/src/data/learning-study/<courseId>.json, generated from the real content) still lists as eligible, through
// the Strength policy (student-strength.js): per MODULE, round(completed / eligible × 20), 0..20 — where `eligible`
// is the module's total count of eligible activities in the index and `completed` the uniquely completed ones.
// Library-training blocks (T/F items) are never in the index: they belong only to their own 40-point bucket.
// Writes go through mutateJsonWithRetry (CAS): overlapping submissions converge on the same set.
const { normalizeClassStatus } = require("./class-lifecycle");
const { classHasLearningCourse, classCanSeeLearningModule } = require("./class-learning-materials");
const { STUDY_MODULE_MAX_POINTS, studyPointsForModule, studyPointsFromModules } = require("./student-strength");

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
/** How many eligible activities the index lists for one page (0 for an unknown page). */
function pageEligibleCount(index, pageId) {
  const page = findStudyPage(index, pageId);
  return page ? Object.keys(page.activities).length : 0;
}
/** The eligible-activity total of every module in the index: { moduleId: eligibleCount }. */
function moduleEligibleCounts(index) {
  const out = {};
  if (!index || !index.pages) return out;
  for (const page of Object.values(index.pages)) {
    if (!page || typeof page !== "object" || !page.activities || typeof page.activities !== "object") continue;
    const moduleId = cleanId(page.moduleId);
    if (!moduleId) continue;
    out[moduleId] = (out[moduleId] || 0) + Object.keys(page.activities).length;
  }
  return out;
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
 * `gained` is the ACTUAL Study Strength delta of this completion — the student's study total (every module
 * re-derived against the index through round(completed / eligible × 20)) after minus before, never negative — while
 * pageBefore / pageAfter are the page's counts of eligible completed activities. A completion whose module fraction
 * rounds to the same points gains 0 (and a later one may gain 1 — the module total is exact at 100%). Called inside
 * the CAS mutation with the FRESHEST document, so a retry recomputes both totals. Pure.
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
  return { doc: normalized, alreadyCompleted, pageBefore, pageAfter, gained: alreadyCompleted ? 0 : Math.max(0, after - before) };
}

/** How many of a page's completed ids the index STILL lists as eligible (ids that left the content stop counting). */
function eligibleCompletedCount(index, pageId, completed) {
  const page = findStudyPage(index, pageId);
  if (!page) return 0;
  return Object.keys(completed || {}).filter(id => Object.prototype.hasOwnProperty.call(page.activities, id)).length;
}

/**
 * The authoritative study state of a student for ONE course: the { moduleId: { completed, eligible } } map the
 * Strength summary consumes (EVERY module the index knows, so a module with nothing completed reads 0 / eligible),
 * plus per-page views ({ moduleId, completed: [ids], eligible }) and per-module views ({ completed, eligible, points,
 * max }) for the API. Nothing stored is trusted beyond the completed ids; an id the index no longer lists (or a
 * library-training id, which is never in the index) does not count.
 */
function studyStateOf(doc, index) {
  const normalized = normalizeStudyDoc(doc);
  const modules = {};
  const pages = {};
  if (index) {
    for (const [moduleId, eligible] of Object.entries(moduleEligibleCounts(index))) modules[moduleId] = { completed: 0, eligible };
    for (const [pageId, entry] of Object.entries(normalized.pages)) {
      const spec = findStudyPage(index, pageId);
      if (!spec || entry.courseId !== index.courseId) continue;
      const completed = Object.keys(entry.completed).filter(id => Object.prototype.hasOwnProperty.call(spec.activities, id)).sort();
      const moduleId = cleanId(spec.moduleId);
      modules[moduleId] = modules[moduleId] || { completed: 0, eligible: 0 };
      modules[moduleId].completed += completed.length;
      pages[pageId] = { moduleId, completed, eligible: Object.keys(spec.activities).length };
    }
  }
  const moduleViews = {};
  for (const [moduleId, m] of Object.entries(modules)) moduleViews[moduleId] = { completed: m.completed, eligible: m.eligible, points: studyPointsForModule(m), max: STUDY_MODULE_MAX_POINTS };
  return { modules, pages, moduleViews, totalPoints: studyPointsFromModules(modules) };
}

/**
 * Phase 9A — the student's MOST RECENT study activity: the latest completion timestamp across every page of the
 * document → { courseId, moduleId, pageId, completedAt } or null (no completion, or no parseable timestamp). Pure and
 * read-only: derived from the same document the Strength summary already reads (no new store, no extra read). The
 * Today Hub uses it as the cross-device "continue reading" fallback; the caller still validates the course/module
 * against what the class currently has published.
 */
function latestStudyActivity(doc) {
  const normalized = normalizeStudyDoc(doc);
  let best = null, bestMs = -Infinity;
  for (const [pageId, entry] of Object.entries(normalized.pages)) {
    for (const at of Object.values(entry.completed)) {
      const ms = Date.parse(String(at || ""));
      if (!Number.isFinite(ms) || ms <= bestMs) continue;
      bestMs = ms;
      best = { courseId: entry.courseId, moduleId: entry.moduleId, pageId, completedAt: new Date(ms).toISOString() };
    }
  }
  return best;
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
  STUDY_PREFIX, studyDocName, loadStudyIndex, findStudyPage, pageEligibleCount, moduleEligibleCounts, findStudyActivity, evaluateStudyResponse,
  normalizeStudyDoc, applyStudyCompletion, eligibleCompletedCount, studyStateOf, studyModulesForStrength, studyAllowedForClass,
  latestStudyActivity,
};
