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

module.exports = { scoreMachineDesign, rulesOf, MACHINE_DESIGN_FAIL_CLOSED };
