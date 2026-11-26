// AUTO-A11a (docs/enterprise-automata-lab-a4.md §16) — the exam grade of a machineDesign@1 answer («تصميم آلة: مكدّس أو تورنغ»). Server
// authority:
//   • the question's config and reference are read by the shared contract (shared-finalization/machineDesignQuestion, compiled from
//     src/machineDesignQuestion.ts); a config or reference that does not read is NOT the student's fault → FAIL CLOSED: 0 with teacher
//     review (manualReview), never an automatic mark (AGENTS.md §10 grading safety);
//   • the comparison is the book exercises' own judge (learning-machine-design.js): both machines on every word up to a length, in the
//     book's engine. A judge that could not decide (`unavailable`: no word the reference decides, a bound reached) → fail closed as well;
//   • owner decisions (2026-11-25):
//       – agreement on every word up to length N (for a function: every input of its domain) → the question's FULL MARKS, with
//         `agreesUpTo: { length, words, skipped? }` kept beside the score for the teacher's note (A11b) — the check is not a proof;
//       – a certain separating word (`counterexample`) or a broken public rule (`issue`) → 0;
//       – a Turing machine that does not halt (within the engine's step limit) on a word where the reference does (`nohalt`) is NOT a
//         certain wrong → teacher review (manualReview), never an automatic zero;
//   • no answer → 0 (not answered), as every auto-graded type.
// AUTO-A11b: `machineFeedbackOf` turns the grader's result into the ONE stored shape — `machineFeedback` — rebuilt field by field and
// bounded, which the grade keeps (assignment-grading.js) for the teacher's review and, once the results are released, the student's
// breakdown (student-question-breakdown.js):
//   { agreesUpTo: { length, words, skipped? } }                       full marks — the length the check went to (not a proof)
//   { counterexample: { word, shouldAccept } }                        a language: the shortest word on which the machines disagree
//   { counterexample: { word, expected, got } }                       a function: the expected answer and the machine's (null: none)
//   { issue: { code, max? } }                                         a public rule of the question the machine broke
//   { nohalt: { word } }                                              a Turing machine that did not halt — kept although the grade awaits
//                                                                     the teacher: it is exactly what the teacher needs to decide
// It names one word and at most two short answers, or a public rule — never the reference, never a model machine. A fail-closed grade
// (unreadable rules / reference, an undecided judge) has none.
// Pure; never throws.
const { machineDesignAuthority } = require("./shared-finalization/machineDesignQuestion");
const { evaluateMachineDesign } = require("./learning-machine-design");

const MACHINE_DESIGN_FAIL_CLOSED = Object.freeze({ score: 0, correct: false, manualReview: true });

/** The judge's rules for a canonical config (the judge reads `mode` as "recognize" | "compute"). */
function rulesOf(config) {
  return {
    machine: config.machine, alphabet: config.alphabet, maxStates: config.maxStates, mode: config.mode === "compute" ? "compute" : "recognize",
    ...(config.leftEnd === true ? { leftEnd: true } : {}), ...(Number.isInteger(config.maxLength) ? { maxLength: config.maxLength } : {}),
  };
}

function scoreMachineDesign({ config, answerKey, response, maxMarks }) {
  try {
    const max = Number.isFinite(maxMarks) ? Math.max(0, maxMarks) : 0;
    const auth = machineDesignAuthority(config, answerKey);
    if (!auth) return { ...MACHINE_DESIGN_FAIL_CLOSED };
    const machine = response && typeof response === "object" && !Array.isArray(response) && response.kind === "machineDesign" ? response.machine : undefined;
    if (machine === undefined) return { score: 0, correct: false, manualReview: false };
    const verdict = evaluateMachineDesign(
      { kind: "machine-design", rules: rulesOf(auth.config), reference: auth.key.reference },
      { kind: "machine-design", machine },
    );
    if (!verdict || verdict.status !== "judged") return { ...MACHINE_DESIGN_FAIL_CLOSED };
    if (verdict.correct === true) {
      const a = verdict.agreesUpTo;
      return { score: max, correct: true, manualReview: false, ...(a ? { agreesUpTo: { length: a.length, words: a.words, ...(a.skipped ? { skipped: a.skipped } : {}) } } : {}) };
    }
    if (verdict.nohalt) return { ...MACHINE_DESIGN_FAIL_CLOSED, nohalt: { word: verdict.nohalt.word } };   // not a certain wrong: the teacher decides
    const ce = verdict.counterexample;
    return {
      score: 0, correct: false, manualReview: false,
      ...(ce ? { counterexample: "shouldAccept" in ce ? { word: ce.word, shouldAccept: ce.shouldAccept === true } : { word: ce.word, expected: ce.expected ?? null, got: ce.got ?? null } } : {}),
      ...(verdict.issue ? { issue: { ...verdict.issue } } : {}),
    };
  } catch {
    return { ...MACHINE_DESIGN_FAIL_CLOSED };
  }
}

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const WORD = /^[A-Za-z0-9#*+@]{0,10}$/;                                  // a word over the question's alphabet, up to the judge's longest
const ISSUES = new Set(["malformed", "too-many-states"]);                // the judge's public-rule issues
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
/** A function's answer as stored: a short string without control characters, or null (no answer between two $). */
const answerOk = v => v === null || (typeof v === "string" && v.length <= 40 && !/[\u0000-\u001f$]/.test(v));
/** The stored feedback of one graded answer, or null — rebuilt field by field and bounded. */
function machineFeedbackOf(r) {
  if (!isObj(r)) return null;
  if (r.correct === true) {
    const a = r.agreesUpTo;
    if (!isObj(a) || !int(a.length, 1, 10) || !int(a.words, 1, 2000) || (a.skipped !== undefined && !int(a.skipped, 1, 2000))) return null;
    return { agreesUpTo: { length: a.length, words: a.words, ...(a.skipped !== undefined ? { skipped: a.skipped } : {}) } };
  }
  if (isObj(r.nohalt) && typeof r.nohalt.word === "string" && WORD.test(r.nohalt.word)) return { nohalt: { word: r.nohalt.word } };
  if (r.manualReview === true) return null;                             // fail closed: nothing was judged
  const ce = r.counterexample;
  if (isObj(ce) && typeof ce.word === "string" && WORD.test(ce.word)) {
    if (typeof ce.shouldAccept === "boolean") return { counterexample: { word: ce.word, shouldAccept: ce.shouldAccept } };
    if (answerOk(ce.expected) && answerOk(ce.got) && ce.expected !== null) return { counterexample: { word: ce.word, expected: ce.expected, got: ce.got } };
  }
  const is = r.issue;
  if (isObj(is) && ISSUES.has(is.code)) return { issue: { code: is.code, ...(int(is.max, 1, 24) ? { max: is.max } : {}) } };
  return null;
}

module.exports = { scoreMachineDesign, machineFeedbackOf, rulesOf, MACHINE_DESIGN_FAIL_CLOSED };
