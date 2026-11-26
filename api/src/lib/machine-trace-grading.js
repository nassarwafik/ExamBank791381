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
    return { score, correct: g.right === g.parts, manualReview: false, parts: { correct: g.right, total: g.parts }, trace: { rows: g.rows, verdict: g.verdict, trueRows: g.trueRows } };
  } catch {
    return { ...MACHINE_TRACE_FAIL_CLOSED };
  }
}

/** The stored feedback of one graded answer, or null: which of the true run's rows the student got right, and the verdict — bounded. */
function traceFeedbackOf(r) {
  const t = r && r.trace;
  if (!t || !Array.isArray(t.rows) || t.rows.length > 64 || typeof t.verdict !== "boolean" || !Number.isInteger(t.trueRows)) return null;
  return { rows: t.rows.map(x => x === true), verdict: t.verdict, trueRows: t.trueRows };
}

module.exports = { scoreMachineTrace, traceFeedbackOf, MACHINE_TRACE_FAIL_CLOSED };
