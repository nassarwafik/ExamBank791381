// Phase L.6b — the CHECK INDEX: the answer material of every in-page exercise of the learning book, which never reaches the
// browser (the served module bodies carry `serverCheck: true` instead). Generated data, read-only:
// api/src/data/learning-check/<courseId>.json, written by scripts/build-learning-content.mjs from the authored content and pinned
// by src/learning/content/contentData.sync.test.ts:
//
//   { schemaVersion: 1, courseId, pages: { "<pageId>": { moduleId, activities: { "<blockId>": {
//       key,                                           // the same key shape as the study index (evaluateStudyResponse)
//       study,                                         // true when the block is a study activity (it is then in the study index)
//       feedback: { correct?, incorrect?, hints?, explanation? },
//       reveal? } } } } }                              // true: REVEAL mode (791381s Phase 2) — see checkResponse
//
// The API judges every answer here and returns the verdict with ONLY the feedback that answer earns: a right answer gets the right
// message and the explanation, a wrong one gets the wrong message and the hint ladder. Study points stay with the study index.
// A REVEAL block answers every well-formed response with the right answer (`reveal`) and the explanation, right or wrong — the
// owner's «الخطأ بالأحمر والصحيح بالأخضر مع شرح بسيط». Nothing is revealed for a malformed response or one of another kind, so the
// key never leaves without an answer of that question.
const { evaluateStudyResponse } = require("./learning-study");

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const cleanId = v => (typeof v === "string" ? v.trim() : "");
const INDEX_CACHE = new Map();

/** The check index of a course, or null when the course has none. Cached per process. */
function loadCheckIndex(courseId) {
  const id = cleanId(courseId);
  if (!ID.test(id)) return null;
  if (INDEX_CACHE.has(id)) return INDEX_CACHE.get(id);
  let index = null;
  try { index = require("../data/learning-check/" + id + ".json"); } catch { index = null; }
  if (!index || index.schemaVersion !== 1 || index.courseId !== id || !index.pages || typeof index.pages !== "object") index = null;
  INDEX_CACHE.set(id, index);
  return index;
}

/** One checkable block of one page → { moduleId, key, study, feedback }, or null (unknown page / block, or not checkable). */
function findCheckActivity(index, pageId, activityId) {
  const p = cleanId(pageId), a = cleanId(activityId);
  const page = index && ID.test(p) ? index.pages[p] : null;
  if (!page || typeof page !== "object" || !page.activities || typeof page.activities !== "object" || !ID.test(a)) return null;
  const entry = Object.prototype.hasOwnProperty.call(page.activities, a) ? page.activities[a] : null;
  if (!entry || typeof entry !== "object" || !entry.key || typeof entry.key.kind !== "string") return null;
  const fb = entry.feedback && typeof entry.feedback === "object" ? entry.feedback : {};
  return { moduleId: cleanId(page.moduleId), key: entry.key, study: entry.study === true, feedback: fb, reveal: entry.reveal === true };
}

const text = v => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * The server's verdict on one answer → { correct, feedback, cells? }. `feedback` carries only what this answer earns (right:
 * message + explanation; wrong: message + hints); `cells` (a practice-table) says, for every answered cell the key knows, whether
 * that choice is right. A malformed or mismatched response is simply wrong. Pure.
 */
function checkResponse(activity, response) {
  const correct = evaluateStudyResponse(activity.key, response);
  const fb = activity.feedback || {};
  const feedback = {};
  const message = text(correct ? fb.correct : fb.incorrect);
  if (message) feedback.message = message;
  const reveal = activity.reveal === true ? revealOf(activity.key, response) : null;
  if ((correct || reveal) && text(fb.explanation)) feedback.explanation = fb.explanation;
  if (!correct && !reveal && Array.isArray(fb.hints)) { const hints = fb.hints.filter(h => text(h)); if (hints.length) feedback.hints = hints; }
  const out = { correct, feedback };
  if (reveal) out.reveal = reveal;
  if (activity.key.kind === "practice-table") {
    const expected = activity.key.cells && typeof activity.key.cells === "object" ? activity.key.cells : {};
    const choices = response && typeof response === "object" && response.choices && typeof response.choices === "object" && !Array.isArray(response.choices) ? response.choices : {};
    const cells = {};
    for (const [cell, value] of Object.entries(choices)) {
      if (Object.prototype.hasOwnProperty.call(expected, cell) && typeof value === "string" && value !== "") cells[cell] = value === expected[cell];
    }
    out.cells = cells;
  }
  return out;
}

/**
 * The right answer of a REVEAL block, returned only for a well-formed response OF THE SAME KIND (an answer to this question):
 * multipleChoice → { kind, optionIds }, trueFalse → { kind, answer }. Anything else → null. Pure. (shortInput is not a reveal kind:
 * its key is stored normalised, which is not the text to show.)
 */
function revealOf(key, response) {
  if (!key || !response || typeof response !== "object" || response.kind !== key.kind) return null;
  switch (key.kind) {
    case "multipleChoice":
      return typeof response.optionId === "string" && response.optionId !== "" && Array.isArray(key.correct) ? { kind: "multipleChoice", optionIds: [...key.correct] } : null;
    case "trueFalse":
      return typeof response.value === "boolean" && typeof key.answer === "boolean" ? { kind: "trueFalse", answer: key.answer } : null;
    default:
      return null;
  }
}

module.exports = { loadCheckIndex, findCheckActivity, checkResponse, revealOf };
