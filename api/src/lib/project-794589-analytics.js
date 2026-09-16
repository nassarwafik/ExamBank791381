// Legacy Project-794589 class-level aggregation (dashboard KPIs, analytics charts, heatmap).
//
// Roadmap #33 — Legacy 794589 Convergence: this module is now a COMPATIBILITY FORMATTER over the generic,
// track-agnostic engine in project-tracker/analytics.js (the single implementation of class summary, per-student
// rows, stage completion, buckets, weekly trend and heatmap). The exported functions keep their exact signatures
// and return the exact pre-R33 legacy shapes (avgBook / avgPacketTracer, perStudent.book / .packetTracer); the
// numbers are the same because the generic engine reuses the legacy 794589 math primitives (see
// project-tracker/core.js) and its parity with this module's former implementation is pinned by engine.test.js.
// Pure: no I/O.
const generic = require("./project-tracker/analytics");
const { legacyDefinition, legacyClassSummary, legacyAnalytics } = require("./project-794589-legacy-shape");

// entries: [{ studentId, displayName, progress }]
function buildClassSummary(classConfig, entries, now) {
  return legacyClassSummary(generic.buildClassSummary(legacyDefinition(classConfig), entries, now));
}

// Charts + heatmap payload. entries: [{ studentId, displayName, progress }]
function buildAnalytics(classConfig, entries, now) {
  return legacyAnalytics(generic.buildAnalytics(legacyDefinition(classConfig), entries, now));
}

function buildWeeklyTrend(classConfig, entries, now) {
  return generic.buildWeeklyTrend(legacyDefinition(classConfig), entries, now);
}

module.exports = { buildClassSummary, buildAnalytics, buildWeeklyTrend };
