// Phase 16B-A — server-side bounding of draft / submitted answers. Every answer shape is stored as before EXCEPT a simulation
// state, which must satisfy the shared bounded-JSON contract (size, depth, finite numbers, no prototype-pollution keys). A
// rejected simulation answer is DROPPED from the stored map (never stored, never crashes the save); the rest is untouched.
const { normalizeSimulationState } = require("./shared-finalization/smartsimState");
// Phase 17A — a `code` answer is TEXT bounded to 64 KB (UTF-8) and reduced to EXACTLY {kind, language, languageVersion, source}:
// the source is never trimmed / re-indented / re-encoded; client-reported score / passed / testsPassed / stdout are dropped;
// only a REGISTERED language at its exact contract version is accepted (V1: python@1, java@1, csharp@1).
const { normalizeCodeAnswer, bindCodeAnswerToQuestion } = require("./shared-finalization/codingQuestion");
const { flattenQuestions } = require("./exam-structure");
// Phase 19A — an answer to an inlineCloze@1 question is the existing `fields` Answer; bound to the published question only STRING
// values for that question's own blank ids survive (bounded). A non-fields answer to a cloze question is dropped with a code.
// Every other `fields` answer (legacy fillBlank / wordBank / matrix / …) is passed through exactly as before.
const { bindInlineClozeAnswerToQuestion } = require("./shared-finalization/inlineClozeQuestion");
// Phase 18C — a `networkCli` answer is a bounded command history + canonical state. Bound to the published question, the server
// REPLAYS the history from that question's initial state through the shared engine and stores the derived state (the client's
// claim is discarded); unbound it is shape / bounds checked only. A networkCli answer on another question, an unknown id or a
// compound part is dropped (not compound-capable). Nothing is ever executed — the engine is a closed, pure grammar.
const { normalizeNetworkCliAnswer, bindNetworkCliAnswerToQuestion } = require("./shared-finalization/networkCliQuestion");
// Phase 19B — an answer to a parametricNumeric@1 question is reduced to EXACTLY { kind: "numeric", value, unit? } (bounded strings):
// a client-sent seed / generated values / expected result / score is dropped and never stored; any other kind is rejected. Every
// other numeric answer (numericResponse) is passed through exactly as before.
const { bindParametricNumericAnswer } = require("./shared-finalization/parametricNumericQuestion");

// Phase 17A Independent Review Fix — when the caller passes the AUTHORITATIVE exam (the assignment's exam snapshot, the same
// one the grader uses), every code answer is bound to the question its answer id names: it must be a coding@1 question, the
// language must be one of that question's allowed languages, and the source must fit that question's limits.sourceBytes.
// A code answer on a non-coding question, an unknown id, or hidden inside a compound part (coding is not compound-capable)
// is dropped. A missing / malformed exam binds nothing → every code answer is dropped (fail closed).
function questionIndex(exam) {
  const index = new Map();
  if (!exam || typeof exam !== "object") return index;
  try { for (const { question, questionId } of flattenQuestions(exam)) index.set(questionId, question); } catch { /* malformed exam → empty index */ }
  return index;
}
const isCode = a => !!a && typeof a === "object" && a.kind === "code";
const isNetworkCli = a => !!a && typeof a === "object" && a.kind === "networkCli";
const isInlineClozeQuestion = q => !!q && typeof q === "object" && q.presentationType === "inlineCloze";
const isParametricQuestion = q => !!q && typeof q === "object" && q.presentationType === "parametricNumeric";

/** normalizeDraftAnswers(answers, exam?) → { answers, rejected: [{ id, code }] } */
function normalizeDraftAnswers(answers, exam) {
  const out = {}, rejected = [];
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { answers: out, rejected };
  const bound = exam !== undefined, index = bound ? questionIndex(exam) : null;
  for (const id of Object.keys(answers)) {
    const a = answers[id];
    if (a && typeof a === "object" && a.kind === "simulation") {
      const r = normalizeSimulationState(a.state);
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = { kind: "simulation", state: r.state };
      continue;
    }
    if (isCode(a)) {
      const r = bound ? bindCodeAnswerToQuestion(a, index.get(id)) : normalizeCodeAnswer(a);
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = r.answer;
      continue;
    }
    if (isNetworkCli(a)) {
      const r = bound ? bindNetworkCliAnswerToQuestion(a, index.get(id)) : normalizeNetworkCliAnswer(a);
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = r.answer;
      continue;
    }
    if (bound && isParametricQuestion(index.get(id))) {
      const r = bindParametricNumericAnswer(a);
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = r.answer;
      continue;
    }
    if (bound && isInlineClozeQuestion(index.get(id))) {
      const r = bindInlineClozeAnswerToQuestion(a, index.get(id));
      if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
      out[id] = r.answer;
      continue;
    }
    if (bound && a && typeof a === "object" && a.kind === "compound" && a.parts && typeof a.parts === "object" && !Array.isArray(a.parts)) {
      const parts = {};
      for (const pid of Object.keys(a.parts)) {
        if (isCode(a.parts[pid])) { rejected.push({ id: id + "." + pid, code: "CODE_QUESTION_MISMATCH" }); continue; }
        if (isNetworkCli(a.parts[pid])) { rejected.push({ id: id + "." + pid, code: "NETCLI_QUESTION_MISMATCH" }); continue; }
        parts[pid] = a.parts[pid];
      }
      out[id] = { ...a, parts };
      continue;
    }
    out[id] = a;
  }
  return { answers: out, rejected };
}

module.exports = { normalizeDraftAnswers };
