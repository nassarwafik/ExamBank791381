// Generic class-level aggregation (dashboard KPIs, analytics charts, heatmap) for any Project Tracker
// project. Pure: takes plain arrays and a project definition, returns ready-made shapes. Track-agnostic
// (keys by trackId) — the same code drives 794589 / 899373 / 883589 and any future project.
const core = require("./core");

// entries: [{ studentId, displayName, progress }]
function buildClassSummary(definition, entries, now) {
  const summaries = entries.map(e => core.buildStudentSummary(definition, e.progress, now));
  const n = summaries.length;
  const avg = pick => (n ? Math.round(summaries.reduce((s, x) => s + pick(x), 0) / n) : 0);
  const trackAverages = {};
  for (const t of (definition.tracks || [])) trackAverages[t.trackId] = avg(x => x.trackProgress[t.trackId] || 0);
  return {
    studentCount: n,
    avgOverall: avg(x => x.overallProgress),
    trackAverages,
    completedCount: summaries.filter(s => s.complete).length,
    studentsReadyForReview: summaries.filter(s => s.readyForReviewCount > 0).length,
    totalReadyStages: summaries.reduce((s, x) => s + x.readyForReviewCount, 0),
    staleCount: summaries.filter(s => s.stale).length,
    trackWeights: definition.trackWeights,
    staleDays: definition.config ? definition.config.staleDays : 7
  };
}

// entries: [{ studentId, displayName, progress }]
function buildAnalytics(definition, entries, now) {
  const stages = ((definition && definition.stages) || []).filter(s => s.active === true);

  const perStudent = entries.map(e => {
    const trackProgress = core.buildTrackProgress(definition, e.progress);
    return { studentId: e.studentId, name: e.displayName, trackProgress, overall: core.calculateOverall(trackProgress, definition) };
  }).sort((a, b) => a.overall - b.overall);

  const n = entries.length;
  const stageCompletion = stages.map(stage => {
    const approved = entries.filter(e => core.stageStatus(e.progress, stage.stageId) === "approved").length;
    return { stageId: stage.stageId, title: stage.title, track: stage.track, groupId: stage.groupId, approvedPct: n ? Math.round((approved / n) * 100) : 0 };
  });

  const buckets = { "0-25": 0, "26-50": 0, "51-75": 0, "76-99": 0, "100": 0 };
  for (const s of perStudent) buckets[core.progressBucket(s.overall)] += 1;

  const weeklyTrend = buildWeeklyTrend(definition, entries, now);

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
  const d = new Date(ms);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return base - d.getUTCDay() * 24 * 60 * 60 * 1000;
}
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
function buildWeeklyTrend(definition, entries, now) {
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
    let sum = 0;
    for (const e of entries) {
      const asOf = asOfProgress(e.progress, weekEnd);
      sum += core.calculateOverall(core.buildTrackProgress(definition, asOf), definition);
    }
    points.push({ weekStart: new Date(w).toISOString().slice(0, 10), avgOverall: Math.round(sum / entries.length) });
  }
  return points;
}

module.exports = { buildClassSummary, buildAnalytics, buildWeeklyTrend };
