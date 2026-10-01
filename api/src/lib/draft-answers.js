// Phase 16B-A — server-side bounding of draft / submitted answers. Every answer shape is stored as before EXCEPT a simulation
// state, which must satisfy the shared bounded-JSON contract (size, depth, finite numbers, no prototype-pollution keys). A
// rejected simulation answer is DROPPED from the stored map (never stored, never crashes the save); the rest is untouched.
const { normalizeSimulationState } = require("./shared-finalization/smartsimState");
// Phase 17A — a `code` answer is TEXT bounded to 64 KB (UTF-8) and reduced to EXACTLY {kind, language, languageVersion, source}:
// the source is never trimmed / re-indented / re-encoded; client-reported score / passed / testsPassed / stdout are dropped.
const { normalizeCodeAnswer } = require("./shared-finalization/codingQuestion");

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
    if (a && typeof a === "object" && a.kind === "code") {
      const r = normalizeCodeAnswer(a);
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = r.answer;
      continue;
    }
    out[id] = a;
  }
  return { answers: out, rejected };
}

module.exports = { normalizeDraftAnswers };
