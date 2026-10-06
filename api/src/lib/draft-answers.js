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
// Phase 19D — a `hotspot` answer is rebuilt to exactly { kind, points: [{ x, y }] } (normalized points only; a client score / matched
// target ids / regions / pixel sizes are dropped) and bounded by its question's `selections`; on any other question (or inside a
// compound part — visual types are not compound-capable) it is rejected. A labelDiagram answer is the existing `fields` Answer bound to
// the question's zones and labels (unknown zones stripped; unknown labels / reuse abuse / prototype keys rejected).
const { bindHotspotAnswerToQuestion, normalizeHotspotAnswer } = require("./shared-finalization/hotspotQuestion");
const { bindLabelDiagramAnswerToQuestion } = require("./shared-finalization/labelDiagramQuestion");
// Phase 19E — an answer on an openResponse question is rebuilt to exactly { kind: "text", value } (a client score / rubric awards /
// model answer / comment are dropped), the text kept verbatim and bounded by the question's maxChars (over-long ⇒ rejected, never
// truncated); any other kind is rejected.
const { bindOpenResponseAnswerToQuestion, isOpenResponseQuestion } = require("./shared-finalization/openResponseQuestion");
// Phase 19F — a `codeTemplate` answer (coding@3 locked template) carries ONLY gap values. Bound to the published question it must
// answer a coding@3 question, in the template's language, naming EXACTLY the template's gaps (missing / unknown / prototype keys and
// oversized values are refused); the stored answer is rebuilt to exactly { kind, language, languageVersion, values } — a client-sent
// `source`, score or locked text is dropped and never stored. Any other kind on a coding@3 question is refused (a full-source answer
// could rewrite locked text). Unbound it is shape / bounds checked only. Not compound-capable.
const { bindCodingTemplateAnswerToQuestion, codingQuestionVersion } = require("./shared-finalization/codingQuestion");
const { normalizeCodeTemplateAnswer } = require("./shared-finalization/codingTemplate");
// Phase 20A — a `smartSim` answer (trusted SmartSim plugin) carries the plugin identity and bounded SEMANTIC actions. Bound to the published
// question it must answer a smartSim@1 question whose VALID envelope names the SAME plugin identity; every action is normalized by the
// plugin (unknown / malformed / wrong-device actions refuse the whole answer — nothing is partially applied) and the server REPLAYS them
// from the canonical initial state, storing the DERIVED state (the client's claim, score or checks are discarded). Any other kind on a
// smartSim question is refused; a smartSim answer on another question, an unknown id or a compound part is dropped (not compound-capable).
const { bindSmartSimAnswerToQuestion, normalizeSmartSimAnswer } = require("./shared-finalization/trustedSimPlugins");

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
const isHotspot = a => !!a && typeof a === "object" && a.kind === "hotspot";
const isHotspotQuestion = q => !!q && typeof q === "object" && q.presentationType === "hotspot";
const isCodeTemplate = a => !!a && typeof a === "object" && a.kind === "codeTemplate";
const isCodingV3Question = q => !!q && typeof q === "object" && String(q.presentationType ?? q.type ?? "") === "coding" && codingQuestionVersion(q) === 3;
const isLabelDiagramQuestion = q => !!q && typeof q === "object" && q.presentationType === "labelDiagram";
const isSmartSim = a => !!a && typeof a === "object" && a.kind === "smartSim";
const isSmartSimQuestion = q => !!q && typeof q === "object" && String(q.presentationType ?? q.type ?? "") === "smartSim";

// Phase 20D — the per-answer binding chain, extracted VERBATIM (same branch order, same results, same refusal codes) from the original
// loop so a composite@1 child answer is bound by EXACTLY the binder a standalone question of its type uses. `reject(id, code)` records the
// nested refusals the compound branch reports; `q` is the published question (undefined when unbound or unknown).
function bindAnswer(id, a, q, bound, reject) {
  if (a && typeof a === "object" && a.kind === "simulation") {
    const r = normalizeSimulationState(a.state);
    return r.ok ? { ok: true, answer: { kind: "simulation", state: r.state } } : { ok: false, code: r.code };
  }
  if (isCode(a)) return bound ? bindCodeAnswerToQuestion(a, q) : normalizeCodeAnswer(a);
  if (isCodeTemplate(a) || (bound && isCodingV3Question(q))) return bound ? bindCodingTemplateAnswerToQuestion(a, q) : normalizeCodeTemplateAnswer(a);
  if (isSmartSim(a) || (bound && isSmartSimQuestion(q))) return bound ? bindSmartSimAnswerToQuestion(a, q) : normalizeSmartSimAnswer(a);
  if (isNetworkCli(a)) return bound ? bindNetworkCliAnswerToQuestion(a, q) : normalizeNetworkCliAnswer(a);
  if (isHotspot(a) || (bound && isHotspotQuestion(q))) return bound ? (isHotspotQuestion(q) ? bindHotspotAnswerToQuestion(a, q) : { ok: false, code: "HOTSPOT_QUESTION_MISMATCH" }) : normalizeHotspotAnswer(a);
  if (bound && isLabelDiagramQuestion(q)) return bindLabelDiagramAnswerToQuestion(a, q);
  if (bound && isOpenResponseQuestion(q)) return bindOpenResponseAnswerToQuestion(a, q);
  if (bound && isParametricQuestion(q)) return bindParametricNumericAnswer(a);
  if (bound && isInlineClozeQuestion(q)) return bindInlineClozeAnswerToQuestion(a, q);
  if (bound && a && typeof a === "object" && a.kind === "compound" && a.parts && typeof a.parts === "object" && !Array.isArray(a.parts)) {
    const parts = {};
    for (const pid of Object.keys(a.parts)) {
      if (isCode(a.parts[pid])) { reject(id + "." + pid, "CODE_QUESTION_MISMATCH"); continue; }
      if (isCodeTemplate(a.parts[pid])) { reject(id + "." + pid, "CODE_QUESTION_MISMATCH"); continue; }
      if (isNetworkCli(a.parts[pid])) { reject(id + "." + pid, "NETCLI_QUESTION_MISMATCH"); continue; }
      if (isSmartSim(a.parts[pid])) { reject(id + "." + pid, "SMARTSIM_QUESTION_MISMATCH"); continue; }
      if (isHotspot(a.parts[pid])) { reject(id + "." + pid, "HOTSPOT_QUESTION_MISMATCH"); continue; }
      parts[pid] = a.parts[pid];
    }
    return { ok: true, answer: { ...a, parts } };
  }
  return { ok: true, answer: a };
}

// Phase 20D — composite@1: the composite answer is only the CONTAINING authority. Bound to the published composite (the ONE strict
// structure authority, shared build): exactly { kind: "composite", parts, contexts } survives (extra keys dropped); the serialized answer and
// the Σ of shared-context actions are bounded; an unknown part / context id is removed and reported; a SmartSim part linked to a shared
// context never carries an answer of its own; every child answer is bound by bindAnswer() against the child node — the SAME binder (and the
// same refusal codes) a standalone question of that type uses; a shared context answer is REPLAYED against the context's envelope and stored
// with the server-derived state. A refused child / context is dropped ALONE; a malformed composite answer, a broken published composite or
// an oversized answer refuses the whole answer. Unbound (no exam) answers are shape / bounds checked only.
const { compositeStructure, compositeChildNode, isCompositeQuestionNode, COMPOSITE_LIMITS } = require("./shared-finalization/compositeQuestion");
const ownKeys = o => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : null);
function bindCompositeAnswer(id, a, q, bound, reject) {
  if (!a || typeof a !== "object" || Array.isArray(a) || a.kind !== "composite") return { ok: false, code: "COMPOSITE_ANSWER_INVALID" };
  const partIds = a.parts === undefined ? [] : ownKeys(a.parts), ctxIds = a.contexts === undefined ? [] : ownKeys(a.contexts);
  if (!partIds || !ctxIds) return { ok: false, code: "COMPOSITE_ANSWER_INVALID" };
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify({ parts: a.parts || {}, contexts: a.contexts || {} }), "utf8"); } catch { return { ok: false, code: "COMPOSITE_ANSWER_INVALID" }; }
  if (bytes > COMPOSITE_LIMITS.answerBytes) return { ok: false, code: "COMPOSITE_ANSWER_TOO_LARGE" };
  const actions = ctxIds.reduce((n, cid) => n + (a.contexts[cid] && Array.isArray(a.contexts[cid].actions) ? a.contexts[cid].actions.length : 0), 0);
  if (actions > COMPOSITE_LIMITS.contextActions) return { ok: false, code: "COMPOSITE_ANSWER_TOO_LARGE" };
  const st = bound ? compositeStructure(q) : null;
  if (bound && !st.ok) return { ok: false, code: "COMPOSITE_QUESTION_INVALID" };
  const parts = {}, contexts = {};
  for (const pid of partIds) {
    const value = a.parts[pid];
    if (!bound) { const r = bindAnswer(id + "." + pid, value, undefined, false, reject); if (r.ok) parts[pid] = r.answer; else reject(id + "." + pid, r.code); continue; }
    const part = st.model.partById.get(pid);
    if (!part) { reject(id + "." + pid, "COMPOSITE_PART_UNKNOWN"); continue; }
    if (part.linkedSmartSim) { reject(id + "." + pid, "COMPOSITE_PART_ANSWER_FORBIDDEN"); continue; }
    const r = bindAnswer(id + "." + pid, value, compositeChildNode(part.raw), true, reject);
    if (r.ok) parts[pid] = r.answer; else reject(id + "." + pid, r.code);
  }
  for (const cid of ctxIds) {
    const value = a.contexts[cid];
    if (!bound) { const r = normalizeSmartSimAnswer(value); if (r.ok) contexts[cid] = r.answer; else reject(id + "." + cid, r.code); continue; }
    const ctx = st.model.contextById.get(cid);
    if (!ctx || ctx.kind !== "smartSim") { reject(id + "." + cid, "COMPOSITE_CONTEXT_UNKNOWN"); continue; }
    const r = bindSmartSimAnswerToQuestion(value, { presentationType: "smartSim", questionTypeVersion: 1, smartSim: ctx.envelope });
    if (r.ok) contexts[cid] = r.answer; else reject(id + "." + cid, r.code);
  }
  return { ok: true, answer: { kind: "composite", parts, contexts } };
}

/** normalizeDraftAnswers(answers, exam?) → { answers, rejected: [{ id, code }] } */
function normalizeDraftAnswers(answers, exam) {
  const out = {}, rejected = [];
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { answers: out, rejected };
  const bound = exam !== undefined, index = bound ? questionIndex(exam) : null;
  const reject = (rid, code) => rejected.push({ id: rid, code });
  for (const id of Object.keys(answers)) {
    const a = answers[id], q = bound ? index.get(id) : undefined;
    const isComposite = (bound && isCompositeQuestionNode(q)) || (!bound && a && typeof a === "object" && a.kind === "composite");
    const r = isComposite ? bindCompositeAnswer(id, a, q, bound, reject) : bindAnswer(id, a, q, bound, reject);
    if (!r.ok) { rejected.push({ id, code: r.code }); continue; }
    out[id] = r.answer;
  }
  return { answers: out, rejected };
}

module.exports = { normalizeDraftAnswers };
