// Roadmap #33 — Legacy 794589 Convergence: PURE formatters that turn the GENERIC project-tracker engine results
// (track-agnostic, keyed by trackId) into the EXACT pre-R33 response shape of the legacy 794589 routes
// (project-794589, student-project) and of the legacy analytics module.
//
// The legacy contract names the two 794589 tracks explicitly:
//   summary.bookProgress / summary.packetTracerProgress   ← summary.trackProgress.book / .packetTracer
//   nextBookStage / nextPacketTracerStage                 ← nextStages.book / .packetTracer
//   balance { leadingTrack, diff }                        ← balance { leadingTrackId, …, diff }
//   summary.avgBook / summary.avgPacketTracer             ← summary.trackAverages.book / .packetTracer
//   analytics.perStudent[].book / .packetTracer           ← perStudent[].trackProgress.book / .packetTracer
// No storage, auth, audit or HTTP logic lives here — only shape. Every function is deterministic and total
// (a missing/null input yields the legacy "empty" value).
const PROGRAM_CODE = "794589";
const LEGACY_TRACKS = [
  { trackId: "book", title: "الكتاب", icon: "📘" },
  { trackId: "packetTracer", title: "Packet Tracer", icon: "🖧" }
];
const DEFAULT_WEIGHTS = { book: 50, packetTracer: 50 };

function pct(map, trackId) {
  return Number((map && map[trackId]) || 0);
}

// A generic-engine "definition" for a legacy 794589 class snapshot (which carries no `tracks`), so the generic
// core/analytics can run over it. Weight defaulting mirrors the legacy modules exactly (missing → 50/50).
function legacyDefinition(classConfig) {
  const cfg = classConfig || {};
  return {
    projectCode: PROGRAM_CODE,
    title: "مشروع " + PROGRAM_CODE,
    tracks: LEGACY_TRACKS,
    templateVersion: cfg.templateVersion,
    trackWeights: cfg.trackWeights || DEFAULT_WEIGHTS,
    config: cfg.config,
    groups: cfg.groups,
    stages: cfg.stages || []
  };
}

// core.buildStudentSummary(...) → legacy card { overallProgress, bookProgress, packetTracerProgress, counts,
// readyForReviewCount, complete, updatedAt, stale }.
function legacyStudentSummary(summary) {
  const s = summary || {};
  return {
    overallProgress: s.overallProgress,
    bookProgress: pct(s.trackProgress, "book"),
    packetTracerProgress: pct(s.trackProgress, "packetTracer"),
    counts: s.counts,
    readyForReviewCount: s.readyForReviewCount,
    complete: s.complete,
    updatedAt: s.updatedAt,
    stale: s.stale
  };
}

// core.getBalanceInsight(...) → legacy { leadingTrack, diff } | null.
function legacyBalance(balance) {
  if (!balance) return null;
  return { leadingTrack: balance.leadingTrackId, diff: balance.diff };
}

// core.getNextStages(...) → the two legacy fields (null when a track is complete).
function legacyNextStages(nextStages) {
  const n = nextStages || {};
  return { nextBookStage: n.book || null, nextPacketTracerStage: n.packetTracer || null };
}

// analytics.buildClassSummary(...) → legacy class summary (avgBook / avgPacketTracer instead of trackAverages).
function legacyClassSummary(summary) {
  const s = summary || {};
  return {
    studentCount: s.studentCount,
    avgOverall: s.avgOverall,
    avgBook: pct(s.trackAverages, "book"),
    avgPacketTracer: pct(s.trackAverages, "packetTracer"),
    completedCount: s.completedCount,
    studentsReadyForReview: s.studentsReadyForReview,
    totalReadyStages: s.totalReadyStages,
    staleCount: s.staleCount,
    trackWeights: s.trackWeights || DEFAULT_WEIGHTS,
    staleDays: s.staleDays
  };
}

// analytics.buildAnalytics(...) → legacy analytics (perStudent rows carry book / packetTracer columns).
function legacyAnalytics(analytics) {
  const a = analytics || {};
  return {
    perStudent: (a.perStudent || []).map(row => ({
      studentId: row.studentId,
      name: row.name,
      book: pct(row.trackProgress, "book"),
      packetTracer: pct(row.trackProgress, "packetTracer"),
      overall: row.overall
    })),
    stageCompletion: a.stageCompletion,
    buckets: a.buckets,
    weeklyTrend: a.weeklyTrend,
    heatmap: a.heatmap
  };
}

module.exports = { PROGRAM_CODE, LEGACY_TRACKS, DEFAULT_WEIGHTS, legacyDefinition, legacyStudentSummary, legacyBalance, legacyNextStages, legacyClassSummary, legacyAnalytics };
