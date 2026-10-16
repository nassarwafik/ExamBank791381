// Phase 21G.5 (owner decision D2) — when students may see an assignment's results, a per-assignment setting:
//   "immediate" (the default, and every assignment stored before 21G.5): as soon as a result exists — the historical behaviour;
//   "afterDue": from the assignment's due date (dueAt) on;
//   "manual": only once the teacher has published them (resultsReleasedAt).
// Until then the SERVER withholds the mark: score, percentage, the manual-review marks and the teacher's feedback leave no student
// surface (the submission, the dashboard and its totals, medal posts, review notifications). Fail closed: an unknown mode or an
// unreadable date withholds — it never releases.
const MODES = ["immediate", "afterDue", "manual"];
const MODE_LABEL = { immediate: "فور التصحيح", afterDue: "بعد الموعد النهائي", manual: "يدويًا" };

function releaseMode(a) {
  const m = a && a.resultsRelease;
  if (m === undefined || m === null || m === "") return "immediate";
  return MODES.includes(m) ? m : "invalid";
}
const validIso = v => typeof v === "string" && v !== "" && Number.isFinite(Date.parse(v));

/** Whether the assignment's results are visible to students now. */
function resultsReleased(a, nowMs = Date.now()) {
  const mode = releaseMode(a);
  if (mode === "immediate") return true;
  if (mode === "afterDue") return validIso(a.dueAt) && nowMs >= Date.parse(a.dueAt);
  if (mode === "manual") return validIso(a.resultsReleasedAt);
  return false;
}

/** The student-safe description of the release (for the "results not released yet" state): never a mark. The student-facing
 *  field names are resultsVisible / resultsVisibility / resultsVisibleAt. */
function releaseInfo(a, nowMs = Date.now()) {
  const mode = releaseMode(a), released = resultsReleased(a, nowMs);
  return released ? { resultsVisible: true } : { resultsVisible: false, resultsVisibility: mode === "invalid" ? "manual" : mode, ...(mode === "afterDue" && validIso(a.dueAt) ? { resultsVisibleAt: a.dueAt } : {}) };
}

const WITHHELD = ["score", "percentage", "manualReviewMarks", "teacherFeedback", "latestScore", "latestPercentage"];
/** A copy of a student projection of a result with every mark-bearing field removed (structure and timing kept). */
function withholdResult(x) {
  if (!x || typeof x !== "object") return x;
  const out = { ...x };
  for (const k of WITHHELD) delete out[k];
  return out;
}

/** Validates a teacher's requested mode (create / update). */
function normalizeReleaseMode(v) {
  if (v === undefined || v === null || v === "") return "immediate";
  return MODES.includes(v) ? v : null;
}

/**
 * Read-time gating of a record that names an assignment and reveals its mark (a medal post, a review notification): the ids among
 * `ids` whose results are NOT visible now. A read failure withholds (fail closed); an assignment that no longer exists does not
 * (nothing is left to protect, and such records keep their historical behaviour). Each assignment is read once.
 */
async function withheldAssignmentIds(ids, readAssignment, nowMs = Date.now()) {
  const out = new Set();
  await Promise.all([...new Set(ids.filter(Boolean).map(String))].map(async id => {
    let a;
    try { a = await readAssignment(id); } catch { out.add(id); return; }
    if (a && !resultsReleased(a, nowMs)) out.add(id);
  }));
  return out;
}

module.exports = { MODES, MODE_LABEL, releaseMode, resultsReleased, releaseInfo, withholdResult, normalizeReleaseMode, withheldAssignmentIds };
