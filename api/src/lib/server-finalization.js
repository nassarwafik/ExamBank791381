// Phase 14A §15/§16 — the SERVER finalization authority.
//
// It is not a re-implementation: shared-finalization/ is the CommonJS build of src/examFinalization.ts and its whole chain
// (structural validation, Blueprint coverage with official-marks semantics, quality-policy validation incl. the Review
// Fix 1 malformed-enabled fail-closed rule, quality gates). scripts/build-shared-finalization.mjs generates it and
// api/tests/shared-finalization-drift-14a.test.js fails on any byte of drift, so the Builder and the governance server
// always decide identically. A submission for review is gated by THIS decision — never by a canFinalize flag from a browser.
const { evaluateExamFinalization } = require("./shared-finalization/examFinalization");

function evaluateServerFinalization(exam) {
  return evaluateExamFinalization(exam);
}

// Counts only — safe to return to a client and to keep in an error payload (no exam body, no answer keys).
function summarizeFinalization(decision) {
  const blockers = Array.isArray(decision && decision.blockers) ? decision.blockers : [];
  const warnings = Array.isArray(decision && decision.warnings) ? decision.warnings : [];
  return {
    canFinalize: decision && decision.canFinalize === true,
    structuralErrors: Array.isArray(decision && decision.structuralErrors) ? decision.structuralErrors.length : 0,
    structuralWarnings: Array.isArray(decision && decision.structuralWarnings) ? decision.structuralWarnings.length : 0,
    qualityBlockers: blockers.filter(b => b && b.kind === "quality").length,
    qualityWarnings: warnings.filter(w => w && w.kind === "quality").length,
    policyBlockers: blockers.filter(b => b && b.kind === "policy").length,
    blockerIds: blockers.map(b => String(b && b.id != null ? b.id : ""))
  };
}

module.exports = { evaluateServerFinalization, summarizeFinalization };
