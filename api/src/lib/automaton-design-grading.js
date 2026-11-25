// AUTO-A8 (docs/enterprise-automata-lab-a4.md §11) — the exam grade of an automatonDesign@1 answer («صمّم أوتومات»). Server authority:
//   • the question's config and reference are read by the shared contract (shared-finalization/automatonDesignQuestion, compiled from
//     src/automatonDesignQuestion.ts); a config or reference that does not read is NOT the student's fault → FAIL CLOSED: 0 with teacher
//     review (manualReview), never an automatic mark (AGENTS.md §10 grading safety);
//   • the comparison is the book exercises' own judge (learning-automaton-design.js): the languages of the two machines, exactly, with the
//     shortest word on which they disagree. A judge that could not decide (its bounds reached) → fail closed as well;
//   • owner decision (2026-11-25): FULL MARKS OR ZERO — the reference's language → the question's marks; any other machine, or one that
//     breaks a public rule of the question (too many states, a symbol outside the alphabet, an incomplete DFA where one is asked…) → 0;
//   • no answer → 0 (not answered), as every auto-graded type.
// The separating word (`counterexample`) and the broken rule (`issue`) are returned beside the score. AUTO-A8b: `automatonFeedbackOf`
// turns them into the ONE stored shape — `automatonFeedback: { counterexample: { word, shouldAccept } } | { issue: { code, state?, symbol?,
// max? } }`, rebuilt field by field and bounded — which the grade keeps (assignment-grading.js) for the teacher's review and, once the
// results are released, the student's breakdown (student-question-breakdown.js). It names one word, or a public rule of the question —
// never the reference. Pure; never throws.
const { automatonDesignAuthority } = require("./shared-finalization/automatonDesignQuestion");
const { evaluateAutomatonDesign } = require("./learning-automaton-design");

const AUTOMATON_DESIGN_FAIL_CLOSED = Object.freeze({ score: 0, correct: false, manualReview: true });

function scoreAutomatonDesign({ config, answerKey, response, maxMarks }) {
  try {
    const max = Number.isFinite(maxMarks) ? Math.max(0, maxMarks) : 0;
    const auth = automatonDesignAuthority(config, answerKey);
    if (!auth) return { ...AUTOMATON_DESIGN_FAIL_CLOSED };
    const machine = response && typeof response === "object" && !Array.isArray(response) && response.kind === "automatonDesign" ? response.machine : undefined;
    if (machine === undefined) return { score: 0, correct: false, manualReview: false };
    const { machine: type, alphabet, maxStates } = auth.config;
    const verdict = evaluateAutomatonDesign(
      { kind: "automaton-design", rules: { machine: type, alphabet, maxStates, complete: auth.config.complete === true }, reference: auth.key.reference },
      { kind: "automaton-design", machine },
    );
    if (!verdict || verdict.status !== "judged") return { ...AUTOMATON_DESIGN_FAIL_CLOSED };
    if (verdict.correct === true) return { score: max, correct: true, manualReview: false };
    return {
      score: 0, correct: false, manualReview: false,
      ...(verdict.counterexample ? { counterexample: { word: verdict.counterexample.word, shouldAccept: verdict.counterexample.shouldAccept === true } } : {}),
      ...(verdict.issue ? { issue: { ...verdict.issue } } : {}),
    };
  } catch {
    return { ...AUTOMATON_DESIGN_FAIL_CLOSED };
  }
}

const ISSUE_CODES = new Set(["malformed", "no-states", "too-many-states", "no-start", "epsilon-in-dfa", "symbol-outside-alphabet", "two-arrows", "incomplete"]);
const WORD = /^[A-Za-z0-9#$*+@]{0,40}$/;
const SHORT = /^[A-Za-zε0-9#$*+@_]{1,8}$/;
/** The stored feedback of one graded answer, or null: the separating word, else the broken public rule — nothing else, bounded. */
function automatonFeedbackOf(r) {
  if (!r || typeof r !== "object" || r.correct === true || r.manualReview === true) return null;
  const ce = r.counterexample;
  if (ce && typeof ce === "object" && typeof ce.word === "string" && WORD.test(ce.word) && typeof ce.shouldAccept === "boolean") return { counterexample: { word: ce.word, shouldAccept: ce.shouldAccept } };
  const is = r.issue;
  if (is && typeof is === "object" && ISSUE_CODES.has(is.code)) {
    return { issue: { code: is.code, ...(typeof is.state === "string" && SHORT.test(is.state) ? { state: is.state } : {}), ...(typeof is.symbol === "string" && SHORT.test(is.symbol) ? { symbol: is.symbol } : {}), ...(Number.isInteger(is.max) && is.max > 0 && is.max <= 24 ? { max: is.max } : {}) } };
  }
  return null;
}

module.exports = { scoreAutomatonDesign, automatonFeedbackOf, AUTOMATON_DESIGN_FAIL_CLOSED };
