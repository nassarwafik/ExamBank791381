// Pure class-level aggregation for the Project 794589 dashboard, analytics charts and heatmap.
// Takes plain arrays (no I/O) so it is fully unit-testable; the Azure function does the blob reads
// and hands the results here.
const core = require("./project-794589-core");

// entries: [{ studentId, displayName, progress }]
function buildClassSummary(classConfig, entries, now) {
  const weights = (classConfig && classConfig.trackWeights) || { book: 50, packetTracer: 50 };
  const staleDays = classConfig && classConfig.config ? classConfig.config.staleDays : 7;

  const summaries = entries.map(e => core.buildStudentSummary(classConfig, e.progress, now));
  const n = summaries.length;
  const avg = pick => (n ? Math.round(summaries.reduce((s, x) => s + x[pick], 0) / n) : 0);

  return {
    studentCount: n,
    avgOverall: avg("overallProgress"),
    avgBook: avg("bookProgress"),
    avgPacketTracer: avg("packetTracerProgress"),
    completedCount: summaries.filter(s => s.complete).length,
    studentsReadyForReview: summaries.filter(s => s.readyForReviewCount > 0).length,
    totalReadyStages: summaries.reduce((s, x) => s + x.readyForReviewCount, 0),
    staleCount: summaries.filter(s => s.stale).length,
    trackWeights: weights,
    staleDays
  };
}

// Charts + heatmap payload. entries: [{ studentId, displayName, progress }]
function buildAnalytics(classConfig, entries, now) {
  const stages = ((classConfig && classConfig.stages) || []).filter(s => s.active === true);
  const weights = (classConfig && classConfig.trackWeights) || { book: 50, packetTracer: 50 };

  // CHART 1 & 2: per-student overall / book / pt (sorted lowest overall first).
  const perStudent = entries.map(e => {
    const book = core.calculateTrackProgress(classConfig.stages, e.progress, "book");
    const pt = core.calculateTrackProgress(classConfig.stages, e.progress, "packetTracer");
    return {
      studentId: e.studentId,
      name: e.displayName,
      book,
      packetTracer: pt,
      overall: core.calculateOverallProgress(book, pt, weights)
    };
  }).sort((a, b) => a.overall - b.overall);

  // CHART 3: per-stage class approval % (approved / studentCount) over active stages.
  const n = entries.length;
  const stageCompletion = stages.map(stage => {
    const approved = entries.filter(e => core.stageStatus(e.progress, stage.stageId) === "approved").length;
    return {
      stageId: stage.stageId,
      title: stage.title,
      track: stage.track,
      groupId: stage.groupId,
      approvedPct: n ? Math.round((approved / n) * 100) : 0
    };
  });

  // CHART 4: distribution buckets of overall progress.
  const buckets = { "0-25": 0, "26-50": 0, "51-75": 0, "76-99": 0, "100": 0 };
  for (const s of perStudent) buckets[core.progressBucket(s.overall)] += 1;

  // CHART 5: weekly class-average overall progress, reconstructed from approvedAt timestamps of the
  // currently-approved stages (a deterministic Phase-1 trend, not a full un-approval replay).
  const weeklyTrend = buildWeeklyTrend(classConfig, entries, now);

  // HEATMAP: students x stages statuses (frontend filters by track/group). Kept compact.
  const heatmap = {
    students: entries.map(e => ({ studentId: e.studentId, name: e.displayName })),
    stages: stages.map(s => ({ stageId: s.stageId, title: s.title, track: s.track, groupId: s.groupId })),
    statuses: entries.map(e => {
      const row = {};
      for (const s of stages) row[s.stageId] = core.stageStatus(e.progress, s.stageId);
      return row;
    })
  };

  return { perStudent, stageCompletion, buckets, weeklyTrend, heatmap };
}

function weekStart(ms) {
  // Normalize to the start of the week (Sunday 00:00 UTC) for stable bucketing.
  const d = new Date(ms);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return base - d.getUTCDay() * 24 * 60 * 60 * 1000;
}

function buildWeeklyTrend(classConfig, entries, now) {
  const weights = (classConfig && classConfig.trackWeights) || { book: 50, packetTracer: 50 };
  // Collect all approvedAt timestamps.
  const approvals = [];
  for (const e of entries) {
    const st = (e.progress && e.progress.stages) || {};
    for (const key of Object.keys(st)) {
      if (st[key] && st[key].status === "approved" && st[key].approvedAt) {
        const ms = new Date(st[key].approvedAt).getTime();
        if (Number.isFinite(ms)) approvals.push(ms);
      }
    }
  }
  if (!approvals.length || !entries.length) return [];
  const firstWeek = weekStart(Math.min(...approvals));
  const lastWeek = weekStart(new Date(now).getTime());
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const points = [];
  for (let w = firstWeek; w <= lastWeek; w += WEEK) {
    const weekEnd = w + WEEK - 1;
    // class-average overall using only stages approved on/before weekEnd.
    let sum = 0;
    for (const e of entries) {
      const asOf = asOfProgress(e.progress, weekEnd);
      const book = core.calculateTrackProgress(classConfig.stages, asOf, "book");
      const pt = core.calculateTrackProgress(classConfig.stages, asOf, "packetTracer");
      sum += core.calculateOverallProgress(book, pt, weights);
    }
    points.push({ weekStart: new Date(w).toISOString().slice(0, 10), avgOverall: Math.round(sum / entries.length) });
  }
  return points;
}

// Returns a progress-like object where only stages approved on/before `cutoffMs` are "approved".
function asOfProgress(progress, cutoffMs) {
  const stages = {};
  const src = (progress && progress.stages) || {};
  for (const key of Object.keys(src)) {
    const entry = src[key];
    if (entry && entry.status === "approved" && entry.approvedAt && new Date(entry.approvedAt).getTime() <= cutoffMs) {
      stages[key] = { status: "approved" };
    }
  }
  return { stages };
}

module.exports = { buildClassSummary, buildAnalytics, buildWeeklyTrend };
