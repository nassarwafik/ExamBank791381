// Pure, storage-free progress math for the Project 794589 tracker. Every function is deterministic
// (any "now" is passed in), so the identical logic is mirrored 1:1 in the frontend
// (src/project794589/helpers.ts) and both are unit-tested against the same expectations. No React,
// no Azure, no I/O here.

const STATUSES = ["not_started", "in_progress", "ready_for_review", "approved"];
const TRACKS = ["book", "packetTracer"];
const DAY_MS = 24 * 60 * 60 * 1000;

// Design decisions (documented so UI and API never diverge):
// - A stage counts toward a track's % only when active === true AND required === true. Optional
//   stages are shown in the status counts but never move the official percentage, so 100% always
//   means "every required stage approved" == complete.
// - Only status === "approved" is progress. not_started / in_progress / ready_for_review are all
//   "not done" for the percentage (ready_for_review is surfaced separately for the teacher).
// - A stage's weight is stage.weight when it is a positive number, else 1 (equal weighting).

function stageStatus(progress, stageId) {
  const entry = progress && progress.stages ? progress.stages[stageId] : null;
  const status = entry && entry.status;
  return STATUSES.includes(status) ? status : "not_started";
}

function stageWeight(stage) {
  const w = Number(stage && stage.weight);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function countedStages(stages, track) {
  return (Array.isArray(stages) ? stages : []).filter(
    s => s && s.active === true && s.required === true && (!track || s.track === track)
  );
}

// Weighted approved-fraction (0-100, rounded) over the required+active stages of a track.
function calculateTrackProgress(stages, progress, track) {
  const counted = countedStages(stages, track);
  if (!counted.length) return 0;
  let total = 0;
  let done = 0;
  for (const stage of counted) {
    const w = stageWeight(stage);
    total += w;
    if (stageStatus(progress, stage.stageId) === "approved") done += w;
  }
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function calculateOverallProgress(bookPct, ptPct, weights) {
  const wBook = Number(weights && weights.book);
  const wPt = Number(weights && weights.packetTracer);
  const b = Number.isFinite(wBook) && wBook >= 0 ? wBook : 50;
  const p = Number.isFinite(wPt) && wPt >= 0 ? wPt : 50;
  const denom = b + p;
  if (denom <= 0) return 0;
  return Math.round((Number(bookPct) * b + Number(ptPct) * p) / denom);
}

// Status counts over ALL active stages (required or not) of a track, or the whole project when
// track is omitted. Used for the "✅ N / 🔵 N / 🟡 N / ⬜ N" displays.
function countStatuses(stages, progress, track) {
  const counts = { not_started: 0, in_progress: 0, ready_for_review: 0, approved: 0 };
  for (const stage of (Array.isArray(stages) ? stages : [])) {
    if (!stage || stage.active !== true) continue;
    if (track && stage.track !== track) continue;
    counts[stageStatus(progress, stage.stageId)] += 1;
  }
  return counts;
}

// First required+active stage (by order) not yet approved, for one track.
function getNextStage(stages, progress, track) {
  const counted = countedStages(stages, track).slice().sort((a, b) => Number(a.order) - Number(b.order));
  for (const stage of counted) {
    if (stageStatus(progress, stage.stageId) !== "approved") return stage;
  }
  return null;
}

// Non-null only when the two tracks differ by >= threshold points; names the leading track.
function getBalanceInsight(bookPct, ptPct, threshold) {
  const t = Number.isFinite(Number(threshold)) ? Number(threshold) : 25;
  const diff = Math.round(Number(bookPct) - Number(ptPct));
  if (Math.abs(diff) < t) return null;
  return { leadingTrack: diff > 0 ? "book" : "packetTracer", diff: Math.abs(diff) };
}

function isStudentComplete(stages, progress) {
  const required = countedStages(stages, null);
  if (!required.length) return false;
  return required.every(stage => stageStatus(progress, stage.stageId) === "approved");
}

function daysSince(iso, now) {
  if (!iso) return Infinity;
  const then = new Date(iso).getTime();
  const ref = new Date(now).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(ref)) return Infinity;
  return Math.floor((ref - then) / DAY_MS);
}

// Stale = not complete and no progress update for >= staleDays. Completed students are never stale.
function getStaleState(updatedAt, staleDays, now, complete) {
  if (complete) return false;
  const limit = Number.isFinite(Number(staleDays)) ? Number(staleDays) : 7;
  return daysSince(updatedAt, now) >= limit;
}

function readyForReviewCount(stages, progress) {
  return countStatuses(stages, progress).ready_for_review;
}

// The lightweight card object for the students grid - never includes the full stage map/history.
function buildStudentSummary(classConfig, progressDoc, now) {
  const stages = (classConfig && classConfig.stages) || [];
  const weights = (classConfig && classConfig.trackWeights) || { book: 50, packetTracer: 50 };
  const staleDays = classConfig && classConfig.config ? classConfig.config.staleDays : 7;
  const bookProgress = calculateTrackProgress(stages, progressDoc, "book");
  const packetTracerProgress = calculateTrackProgress(stages, progressDoc, "packetTracer");
  const overallProgress = calculateOverallProgress(bookProgress, packetTracerProgress, weights);
  const counts = countStatuses(stages, progressDoc, null);
  const complete = isStudentComplete(stages, progressDoc);
  const updatedAt = (progressDoc && progressDoc.updatedAt) || "";
  return {
    overallProgress,
    bookProgress,
    packetTracerProgress,
    counts,
    readyForReviewCount: counts.ready_for_review,
    complete,
    updatedAt,
    stale: getStaleState(updatedAt, staleDays, now, complete)
  };
}

// Progress bucket for the class distribution chart.
function progressBucket(pct) {
  const p = Number(pct);
  if (p >= 100) return "100";
  if (p >= 76) return "76-99";
  if (p >= 51) return "51-75";
  if (p >= 26) return "26-50";
  return "0-25";
}

module.exports = {
  STATUSES,
  TRACKS,
  stageStatus,
  stageWeight,
  countedStages,
  calculateTrackProgress,
  calculateOverallProgress,
  countStatuses,
  getNextStage,
  getBalanceInsight,
  isStudentComplete,
  getStaleState,
  daysSince,
  readyForReviewCount,
  buildStudentSummary,
  progressBucket
};
