// AUTO-A15a (docs/enterprise-automata-lab-a4.md §22) — the exam grade of a machineTrace@1 answer («تتبّع تشغيل آلة»). Server authority:
//   • the question's machine and word are read by the shared contract (shared-finalization/machineTraceQuestion, compiled from
//     src/machineTraceQuestion.ts) with the book's own engine; a config that does not read, or a run that does not end within the limit, is
//     NOT the student's fault → FAIL CLOSED: 0 with teacher review (manualReview), never an automatic mark (AGENTS.md §10 grading safety);
//   • the true run is computed here, from the config — it is stored nowhere and never sent;
//   • owner decisions (2026-11-26): PARTIAL credit, and an error is never counted twice — row k is right when it is the configuration the
//     machine reaches in one step from the student's OWN row k − 1 (or the true row k); the verdict is one more part:
//     score = marks × right parts / (true rows + 1);
//   • no answer → 0 (not answered), as every auto-graded type.
// `traceFeedback` (which rows were right, the verdict, the true run's length) is returned beside the score, bounded. Pure; never throws.
const { machineTraceAuthority, normalizeMachineTraceAnswer, gradeTrace } = require("./shared-finalization/machineTraceQuestion");

const MACHINE_TRACE_FAIL_CLOSED = Object.freeze({ score: 0, correct: false, manualReview: true });

function scoreMachineTrace({ config, answerKey, response, maxMarks }) {
  try {
    const max = Number.isFinite(maxMarks) ? Math.max(0, maxMarks) : 0;
    const auth = machineTraceAuthority(config, answerKey);
    if (!auth) return { ...MACHINE_TRACE_FAIL_CLOSED };
    if (response === undefined || response === null) return { score: 0, correct: false, manualReview: false };
    const ans = normalizeMachineTraceAnswer(response);
    if (!ans.ok) return { ...MACHINE_TRACE_FAIL_CLOSED };   // a stored answer the ingest would refuse: the teacher looks, never a silent 0
    const g = gradeTrace(auth.machine, auth.config.word, ans.answer);
    if (!g) return { ...MACHINE_TRACE_FAIL_CLOSED };
    const score = max * g.right / g.parts;
    return { score, correct: g.right === g.parts, manualReview: false, parts: { correct: g.right, total: g.parts }, trace: { rows: g.rows, verdict: g.verdict, trueRows: g.trueRows, truth: g.truth, trueVerdict: g.trueVerdict } };
  } catch {
    return { ...MACHINE_TRACE_FAIL_CLOSED };
  }
}

/** The stored feedback of one graded answer, or null: which of the true run's rows the student got right, the verdict, and (AUTO-A15b)
 *  the true run as text rows and its verdict — shown to the teacher, and to the student once the results are released (owner decision:
 *  the machine and the word were the question; after the exam the run is no secret). Rebuilt field by field and bounded. */
const ROW_TEXT = /^[^\u0000-\u001f]{1,60}$/u;
function traceFeedbackOf(r) {
  const t = r && r.trace;
  if (!t || !Array.isArray(t.rows) || t.rows.length > 64 || typeof t.verdict !== "boolean" || !Number.isInteger(t.trueRows)) return null;
  const truth = Array.isArray(t.truth) && t.truth.length === t.trueRows && t.truth.every(x => typeof x === "string" && ROW_TEXT.test(x)) ? [...t.truth] : null;
  const trueVerdict = t.trueVerdict === "accept" || t.trueVerdict === "reject" ? t.trueVerdict : null;
  return { rows: t.rows.map(x => x === true), verdict: t.verdict, trueRows: t.trueRows, ...(truth && trueVerdict ? { truth, trueVerdict } : {}) };
}

module.exports = { scoreMachineTrace, traceFeedbackOf, MACHINE_TRACE_FAIL_CLOSED };
