// D4 (item 7) — the student's per-question mark breakdown. Before D4 a student saw only the total and the teacher's general feedback:
// which questions lost marks, which await the teacher and what the teacher wrote on a question never reached them, although the
// attempt stores all of it (questionGrades).
//
// Owner decision: marks and the teacher's comment ONLY — never the correct answer, the student's answer, a model answer, a rubric, an
// expected output, a hidden-test detail or any part structure. The projection is an explicit ALLOWLIST built field by field from the
// stored grade (nothing is spread), so a field added to the grade later can never leak through here.
//
// AUTO-A8b — owner decision (2026-11-25): an automatonDesign@1 question ALSO shows the student, after the results are released, the
// shortest word on which their machine and the reference disagree («الكلمة abb كان يجب أن تُقبل») — or the public rule of the question
// their machine broke. One word or one rule, rebuilt field by field from the stored grade (never the reference, never a model machine),
// and never on a question that awaits the teacher or does not count.
//
// Gating (by the caller, student-submission pub()): only inside a RELEASED result (results release, Phase 21G.5 — before release the
// whole result is withheld), and never while official coding grading can still change a mark (the score itself is withheld then).
//
// Status of one question:
//   pending     the teacher has not marked it yet (manual review, a render-failure hold, a compile error awaiting review)
//   notCounted  outside the section's counted answers ("answer N of M" sections) — it never affects the score
//   full / partial / zero   by the earned mark against the question's maximum
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const MAX_COMMENT = 1000;
const AUTOMATON_ISSUES = new Set(["malformed", "no-states", "too-many-states", "no-start", "epsilon-in-dfa", "symbol-outside-alphabet", "two-arrows", "incomplete"]);
const WORD = /^[A-Za-z0-9#$*+@]{0,40}$/;
const SHORT = /^[A-Za-zε0-9#$*+@_]{1,8}$/;
/** AUTO-A8b — the separating word or the broken rule of a stored automaton grade, rebuilt and bounded; null otherwise. */
function automatonOf(g) {
  const f = isObj(g.automatonFeedback) ? g.automatonFeedback : null;
  if (!f) return null;
  const ce = isObj(f.counterexample) ? f.counterexample : null;
  if (ce && typeof ce.word === "string" && WORD.test(ce.word) && typeof ce.shouldAccept === "boolean") return { word: ce.word, shouldAccept: ce.shouldAccept };
  const is = isObj(f.issue) ? f.issue : null;
  if (is && AUTOMATON_ISSUES.has(is.code)) return { issue: { code: is.code, ...(typeof is.state === "string" && SHORT.test(is.state) ? { state: is.state } : {}), ...(typeof is.symbol === "string" && SHORT.test(is.symbol) ? { symbol: is.symbol } : {}), ...(Number.isInteger(is.max) && is.max > 0 && is.max <= 24 ? { max: is.max } : {}) } };
  return null;
}

// AUTO-A11b — a machineDesign@1 question (a push-down automaton / Turing machine) shows the student, after the results are released, the
// same kinds of line, rebuilt field by field from the stored grade: «agrees with the model on every word up to length N» (full marks —
// honestly not a proof), the separating word (or, for a function, the expected answer and the machine's), a broken public rule, or the
// word on which the Turing machine did not halt. Never the reference; never on a question that awaits the teacher or does not count.
const MACHINE_WORD = /^[A-Za-z0-9#*+@]{0,10}$/;
const MACHINE_ISSUES = new Set(["malformed", "too-many-states"]);
const between = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const answerOk = v => v === null || (typeof v === "string" && v.length <= 40 && !/[\u0000-\u001f$]/.test(v));
/** AUTO-A11b — the one line of a stored machine grade, rebuilt and bounded; null otherwise. */
function machineOf(g) {
  const f = isObj(g.machineFeedback) ? g.machineFeedback : null;
  if (!f) return null;
  const a = isObj(f.agreesUpTo) ? f.agreesUpTo : null;
  if (a && between(a.length, 1, 10) && between(a.words, 1, 2000) && (a.skipped === undefined || between(a.skipped, 1, 2000))) return { agreesUpTo: { length: a.length, words: a.words, ...(a.skipped !== undefined ? { skipped: a.skipped } : {}) } };
  const ce = isObj(f.counterexample) ? f.counterexample : null;
  if (ce && typeof ce.word === "string" && MACHINE_WORD.test(ce.word)) {
    if (typeof ce.shouldAccept === "boolean") return { word: ce.word, shouldAccept: ce.shouldAccept };
    if (typeof ce.expected === "string" && answerOk(ce.expected) && answerOk(ce.got)) return { word: ce.word, expected: ce.expected, got: ce.got };
  }
  const nh = isObj(f.nohalt) ? f.nohalt : null;
  if (nh && typeof nh.word === "string" && MACHINE_WORD.test(nh.word)) return { nohalt: { word: nh.word } };
  const is = isObj(f.issue) ? f.issue : null;
  if (is && MACHINE_ISSUES.has(is.code)) return { issue: { code: is.code, ...(between(is.max, 1, 24) ? { max: is.max } : {}) } };
  return null;
}

// AUTO-A15b — a machineTrace@1 question shows the student, after the results are released, each of their rows beside the true run's row
// (owner decision: the machine and the word were the question, so the run is no secret after the exam), which rows were right, and the
// verdict both ways. Built from the stored grade's traceFeedback and the student's own stored answer only; bounded.
const { rowLabel } = require("./shared-finalization/machineTraceQuestion");
function traceOf(g, answer) {
  const f = isObj(g.traceFeedback) ? g.traceFeedback : null;
  if (!f || !Array.isArray(f.rows) || !Array.isArray(f.truth) || f.truth.length !== f.rows.length || f.rows.length > 64) return null;
  const mine = isObj(answer) && answer.kind === "machineTrace" && Array.isArray(answer.rows) ? answer.rows : [];
  const verdictWord = v => (v === "accept" ? "accept" : v === "reject" ? "reject" : null);
  return {
    rows: f.truth.map((truth, k) => ({ mine: rowLabel(mine[k]), truth: String(truth).slice(0, 60), right: f.rows[k] === true })),
    verdict: { mine: verdictWord(isObj(answer) ? answer.verdict : null), truth: verdictWord(f.trueVerdict), right: f.verdict === true },
  };
}

function statusOf(g) {
  if (g.ignored === true) return "notCounted";
  if (g.manualReview === true || isObj(g.technicalFailure) && g.reviewed !== true) return "pending";
  const score = num(g.score), max = num(g.maxMarks);
  if (max > 0 && score >= max) return "full";
  if (score > 0) return "partial";
  return "zero";
}

/** PURE: the student-safe breakdown of one attempt → { sections: [...], questions: [...] } or null when there is nothing to show. */
function questionBreakdown(attempt) {
  const answers = attempt && isObj(attempt.answers) ? attempt.answers : {};
  const grades = attempt && Array.isArray(attempt.questionGrades) ? attempt.questionGrades.filter(isObj) : [];
  if (!grades.length) return null;
  const questions = grades.map((g, i) => {
    const status = statusOf(g);
    const item = { number: Number.isInteger(g.questionNumber) && g.questionNumber > 0 ? g.questionNumber : i + 1, sectionId: typeof g.sectionId === "string" ? g.sectionId.slice(0, 120) : "", status, maxMarks: num(g.maxMarks) };
    if (status !== "pending") item.score = num(g.score);
    const comment = typeof g.teacherComment === "string" ? g.teacherComment.trim().slice(0, MAX_COMMENT) : "";
    if (comment) item.comment = comment;
    const automaton = status === "pending" || status === "notCounted" ? null : automatonOf(g);
    if (automaton) item.automaton = automaton;
    const machine = status === "pending" || status === "notCounted" ? null : machineOf(g);
    if (machine) item.machine = machine;
    const trace = status === "pending" || status === "notCounted" ? null : traceOf(g, typeof g.questionId === "string" && Object.prototype.hasOwnProperty.call(answers, g.questionId) ? answers[g.questionId] : null);
    if (trace) item.trace = trace;
    return item;
  });
  const sections = (attempt && Array.isArray(attempt.sections) ? attempt.sections.filter(isObj) : []).map(s => ({
    id: typeof s.id === "string" ? s.id.slice(0, 120) : "",
    title: typeof s.title === "string" ? s.title.slice(0, 200) : "",
    // a capped section's total is not the sum of its questions; the stored section score is not recomputed after a review, so
    // only the fact is shown (the attempt total stays the one authority)
    capped: s.gradingPolicy === "capScore" || s.gradingPolicy === "firstNAnswered"
  }));
  return { sections, questions };
}

module.exports = { questionBreakdown, statusOf, automatonOf, machineOf, traceOf };
