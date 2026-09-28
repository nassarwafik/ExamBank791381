// Phase 12E-A — COUNT-ONLY read-cost telemetry for the hot read paths (student-dashboard, teacher-today).
//
// Emits one info event per successful request with aggregate numbers the handler already knows (how many documents
// its scans returned, how many assignments it selected, how many submission reads/listings it issued). It never
// carries an identifier, a name, a title, a mark, a submission or a token: every value that is not a finite,
// non-negative number is dropped here, whatever the caller passes. Best-effort: a logger failure never fails the request.
function logReadCost(obs, event, counters) {
  try {
    if (!obs || typeof obs.logInfo !== "function") return;
    const fields = {};
    for (const [key, value] of Object.entries(counters || {})) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) fields[key] = Math.floor(value);
    }
    obs.logInfo(event, fields);
  } catch { /* observability must never break the read */ }
}

module.exports = { logReadCost };
