// Reports-only weekly progress timeline built from the REAL recorded status history (not the current
// approvedAt stamps). It replays history events (type === "status") in time order and, at each weekly
// cutoff, reconstructs each stage's status AS OF that moment — so a later un-approval (approved -> in_
// progress) correctly lowers the reconstructed progress instead of keeping the old approval forever.
// Pure; leaves the generic analytics.weeklyTrend (and 794589 parity) untouched.
const core = require("../project-tracker/core");

const WEEK = 7 * 24 * 60 * 60 * 1000;

function weekStartMs(ms) {
  const d = new Date(ms);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return base - d.getUTCDay() * 24 * 60 * 60 * 1000;
}

// Reconstructs a progress-like { stages: { id: { status } } } from a student's history up to cutoffMs.
function statusAsOf(history, cutoffMs) {
  const events = (Array.isArray(history) ? history : [])
    .filter(e => e && e.type === "status" && e.createdAt && e.toStatus)
    .map(e => ({ stageId: e.stageId, toStatus: e.toStatus, ms: Date.parse(e.createdAt) }))
    .filter(e => Number.isFinite(e.ms) && e.ms <= cutoffMs)
    .sort((a, b) => a.ms - b.ms);
  const stages = {};
  for (const e of events) stages[e.stageId] = { status: e.toStatus }; // last event before cutoff wins
  return { stages };
}

// entries: [{ studentId, progress }]. range: { from, to } (ms|null). Returns [] when there is no
// recorded status history (never invents points). Points are clipped to the range.
function buildHistoryTimeline(definition, entries, range, now) {
  const rows = Array.isArray(entries) ? entries : [];
  const times = [];
  for (const e of rows) {
    for (const ev of ((e.progress && e.progress.history) || [])) {
      if (ev && ev.type === "status" && ev.createdAt) {
        const ms = Date.parse(ev.createdAt);
        if (Number.isFinite(ms)) times.push(ms);
      }
    }
  }
  if (!times.length || !rows.length) return [];

  const first = weekStartMs(Math.min(...times));
  const lastRef = range && range.to !== null && range.to !== undefined ? range.to : Date.parse(now);
  const last = weekStartMs(lastRef);

  const points = [];
  for (let w = first; w <= last; w += WEEK) {
    const weekEnd = w + WEEK - 1;
    let sum = 0;
    for (const e of rows) {
      const asOf = statusAsOf((e.progress && e.progress.history) || [], weekEnd);
      sum += core.calculateOverall(core.buildTrackProgress(definition, asOf), definition);
    }
    points.push({ weekStart: new Date(w).toISOString().slice(0, 10), avgOverall: Math.round(sum / rows.length) });
  }

  if (!range || (range.from === null && range.to === null)) return points;
  return points.filter(p => {
    const ms = Date.parse(p.weekStart);
    if (range.from !== null && ms < range.from) return false;
    if (range.to !== null && ms > range.to) return false;
    return true;
  });
}

module.exports = { buildHistoryTimeline, statusAsOf };
