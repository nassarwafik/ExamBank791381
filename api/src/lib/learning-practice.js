// Learning Practice — the per-student summary of T-series training results, the source of the PRACTICE part of
// Unified Strength. Storage: platform/learning-practice/<studentId>.json, ONE document per student:
//
//   { schemaVersion: 1, trainings: { T01: { bestPercentage, bestPoints, attempts, lastPercentage, lastCompletedAt } } }
//
// BEST-SCORE, NOT A COUNTER (anti-farming): a retry only ever raises bestPercentage (max-merge), so repeated
// solving cannot create points; bestPoints is re-derived from bestPercentage through the Strength policy on
// every write, and readers (the dashboard) recompute from bestPercentage rather than trusting stored points.
// Writes go through mutateJsonWithRetry (CAS): two overlapping submissions resolve to max(bestA, bestB), and a
// duplicate request cannot double-award. Pure helpers here; the HTTP orchestration lives in the function.
const { strengthFromTrainingBest, clampPercent } = require("./student-strength");

const PRACTICE_PREFIX = "platform/learning-practice/";
const practiceDocName = studentId => PRACTICE_PREFIX + String(studentId || "").trim() + ".json";

/** A well-formed practice document from whatever is stored (missing / malformed → empty). Pure. */
function normalizePracticeDoc(doc) {
  const out = { schemaVersion: 1, trainings: {} };
  const raw = doc && typeof doc === "object" && doc.trainings && typeof doc.trainings === "object" ? doc.trainings : {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const bestPercentage = Math.round(clampPercent(entry.bestPercentage));
    const attempts = Number.isFinite(Number(entry.attempts)) && Number(entry.attempts) > 0 ? Math.floor(Number(entry.attempts)) : 0;
    out.trainings[id] = {
      bestPercentage,
      bestPoints: strengthFromTrainingBest(bestPercentage),
      attempts,
      lastPercentage: Math.round(clampPercent(entry.lastPercentage)),
      lastCompletedAt: String(entry.lastCompletedAt || "")
    };
  }
  return out;
}

/** The entry for one training (or a zero entry). Pure. */
function trainingEntry(doc, trainingId) {
  return normalizePracticeDoc(doc).trainings[trainingId] || { bestPercentage: 0, bestPoints: 0, attempts: 0, lastPercentage: 0, lastCompletedAt: "" };
}

/**
 * Apply a graded result: attempts + 1, lastPercentage, and bestPercentage = max(previous, new) — never lowered.
 * Returns { doc, before, after, improved, pointsGained } with points derived through the policy. Pure.
 */
function applyTrainingResult(doc, trainingId, percentage, now) {
  const normalized = normalizePracticeDoc(doc);
  const before = trainingEntry(normalized, trainingId);
  const pct = Math.round(clampPercent(percentage));
  const bestPercentage = Math.max(before.bestPercentage, pct);
  const after = {
    bestPercentage,
    bestPoints: strengthFromTrainingBest(bestPercentage),
    attempts: before.attempts + 1,
    lastPercentage: pct,
    lastCompletedAt: String(now || new Date().toISOString())
  };
  normalized.trainings[trainingId] = after;
  return { doc: normalized, before, after, improved: after.bestPercentage > before.bestPercentage, pointsGained: after.bestPoints - before.bestPoints };
}

/** Total practice Strength = Σ bestPoints (each re-derived from bestPercentage). Pure. */
function practicePointsOf(doc) {
  return Object.values(normalizePracticeDoc(doc).trainings).reduce((sum, t) => sum + t.bestPoints, 0);
}

module.exports = { PRACTICE_PREFIX, practiceDocName, normalizePracticeDoc, trainingEntry, applyTrainingResult, practicePointsOf };
