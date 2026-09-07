// Generic, storage-free progress math for the Project Tracker engine. It REUSES the already-proven
// track-agnostic primitives from project-794589-core (single source of truth for the math) and only
// generalizes the three pieces that were hard-coded to book/packetTracer, so an arbitrary set of
// tracks (keyed by trackId, weighted by trackWeights[trackId]) works. Deterministic; `now` passed in.
const base = require("../project-794589-core");
const { applyProgressUpdate, emptyProgress } = require("../project-794589-progress");

const {
  STATUSES, stageStatus, stageWeight, countedStages, calculateTrackProgress,
  countStatuses, getNextStage, isStudentComplete, getStaleState, daysSince, progressBucket
} = base;

function trackIds(definition) {
  return ((definition && definition.tracks) || []).map(t => t.trackId);
}

// Per-track approved % keyed by trackId.
function buildTrackProgress(definition, progressDoc) {
  const stages = (definition && definition.stages) || [];
  const out = {};
  for (const t of (definition.tracks || [])) out[t.trackId] = calculateTrackProgress(stages, progressDoc, t.trackId);
  return out;
}

// Weighted overall across all of the project's tracks (weights from definition.trackWeights).
function calculateOverall(trackProgress, definition) {
  const weights = (definition && definition.trackWeights) || {};
  let num = 0, den = 0;
  for (const t of (definition.tracks || [])) {
    const w = Number(weights[t.trackId]);
    const ww = Number.isFinite(w) && w >= 0 ? w : 50;
    num += Number(trackProgress[t.trackId] || 0) * ww;
    den += ww;
  }
  return den > 0 ? Math.round(num / den) : 0;
}

// Balance between the first two tracks (every project is 2-track). Null when within threshold.
// Names both tracks generically (no "Packet Tracer" outside 794589).
function getBalanceInsight(trackProgress, definition) {
  const ts = (definition && definition.tracks) || [];
  if (ts.length < 2) return null;
  const cfg = definition.config || {};
  const threshold = Number.isFinite(Number(cfg.balanceWarningThreshold)) ? Number(cfg.balanceWarningThreshold) : 25;
  const [a, b] = ts;
  const diff = Math.round(Number(trackProgress[a.trackId] || 0) - Number(trackProgress[b.trackId] || 0));
  if (Math.abs(diff) < threshold) return null;
  const leading = diff > 0 ? a : b;
  const lagging = diff > 0 ? b : a;
  return {
    leadingTrackId: leading.trackId, leadingTrackTitle: leading.title,
    laggingTrackId: lagging.trackId, laggingTrackTitle: lagging.title,
    diff: Math.abs(diff)
  };
}

// Next not-yet-approved stage per track, keyed by trackId.
function getNextStages(definition, progressDoc) {
  const out = {};
  for (const t of (definition.tracks || [])) out[t.trackId] = getNextStage(definition.stages, progressDoc, t.trackId);
  return out;
}

// Lightweight student card. trackProgress is a { trackId: pct } map (generic replacement for the old
// bookProgress / packetTracerProgress fields).
function buildStudentSummary(definition, progressDoc, now) {
  const stages = (definition && definition.stages) || [];
  const staleDays = definition && definition.config ? definition.config.staleDays : 7;
  const trackProgress = buildTrackProgress(definition, progressDoc);
  const overallProgress = calculateOverall(trackProgress, definition);
  const counts = countStatuses(stages, progressDoc, null);
  const complete = isStudentComplete(stages, progressDoc);
  const updatedAt = (progressDoc && progressDoc.updatedAt) || "";
  return {
    overallProgress,
    trackProgress,
    counts,
    readyForReviewCount: counts.ready_for_review,
    complete,
    updatedAt,
    stale: getStaleState(updatedAt, staleDays, now, complete)
  };
}

module.exports = {
  STATUSES,
  stageStatus, stageWeight, countedStages, calculateTrackProgress, countStatuses,
  getNextStage, isStudentComplete, getStaleState, daysSince, progressBucket,
  trackIds, buildTrackProgress, calculateOverall, getBalanceInsight, getNextStages, buildStudentSummary,
  applyProgressUpdate, emptyProgress
};
