// Phase 16B-A — server-side bounding of draft / submitted answers. Every answer shape is stored as before EXCEPT a simulation
// state, which must satisfy the shared bounded-JSON contract (size, depth, finite numbers, no prototype-pollution keys). A
// rejected simulation answer is DROPPED from the stored map (never stored, never crashes the save); the rest is untouched.
const { normalizeSimulationState } = require("./shared-finalization/smartsimState");

/** normalizeDraftAnswers(answers) → { answers, rejected: [{ id, code }] } */
function normalizeDraftAnswers(answers) {
  const out = {}, rejected = [];
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { answers: out, rejected };
  for (const id of Object.keys(answers)) {
    const a = answers[id];
    if (a && typeof a === "object" && a.kind === "simulation") {
      const r = normalizeSimulationState(a.state);
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = { kind: "simulation", state: r.state };
      continue;
    }
    out[id] = a;
  }
  return { answers: out, rejected };
}

module.exports = { normalizeDraftAnswers };
