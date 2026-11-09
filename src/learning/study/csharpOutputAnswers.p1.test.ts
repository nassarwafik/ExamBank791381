// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — PIN: a «ما ناتج البرنامج؟» answer of the book 899371 is a shortInput,
// judged on the server (learning-study.js evaluateStudyResponse) against a key stored normalised by the authoring side
// (eligibility.ts normalizeStudyText). The existing normalisation already fits C# output, with no change:
//   • case is ignored, so C#'s «True» / «False» are accepted as typed «true» / «false»;
//   • runs of whitespace — including line breaks — are one space, so a two-line output «5⏎3.5» may be typed «5 3.5»;
//   • anything else is exact: «2» is not «2.5», «False» is not «True», a missing number is wrong.
// Decision Q10 (owner, 2026-11-09, plan §18): a learner typing on an Arabic keyboard writes digits as «٩ ٤ ١١» (or the
// Persian forms «۹ ۴ ۱۱») and a decimal point as «٫»; they are the same answer as «9 4 11» / «5.66». The three normalisers
// (server learning-study.js, key builder eligibility.ts, local evaluator.ts) fold them alike.
// The keys below are the real outputs of the book's code, proven by execution in P0 (docs/enterprise-899371-learning/probes).
import { describe, it, expect } from "vitest";
import { normalizeStudyText } from "./eligibility";
import { localEvaluator } from "../practice/evaluator";
// @ts-expect-error — the server evaluator is an untyped CommonJS module; it is imported here on purpose to judge as the API does.
import * as study from "../../../api/src/lib/learning-study.js";

const evaluate = (study as unknown as { evaluateStudyResponse: (k: unknown, r: unknown) => boolean }).evaluateStudyResponse;
const judge = (printed: string, typed: string) => evaluate({ kind: "shortInput", answer: normalizeStudyText(printed) }, { kind: "shortInput", text: typed });

describe("C# outputs as shortInput answers", () => {
  it.each([
    ["False", "false"], ["True", "TRUE"], ["9 4 11", "  9   4 11 "], ["5\n3.5", "5 3.5"], ["s :=22", "s :=22"], ["ZAB", "zab"], ["x := 2 and y := 6", "x := 2 and y := 6"],
  ])("the output %j is accepted as %j", (printed, typed) => {
    expect(judge(printed, typed)).toBe(true);
  });

  it.each([
    ["2", "2.5"], ["False", "True"], ["9 4 11", "9 4"], ["s :=22", "s := 22"], ["5.66", "5.656854249492381"], ["9 4 11", ""],
  ])("the output %j is NOT accepted as %j", (printed, typed) => {
    expect(judge(printed, typed)).toBe(false);
  });

  it.each([
    ["9 4 11", "٩ ٤ ١١"], ["9 4 11", "۹ ۴ ۱۱"], ["5.66", "٥٫٦٦"], ["48", "٤٨"], ["x := 2 and y := 6", "x := ٢ and y := ٦"], ["192.168.1.0", "١٩٢.١٦٨.١.٠"],
  ])("Q10: the output %j is accepted as %j (Arabic-Indic digits fold)", (printed, typed) => {
    expect(judge(printed, typed)).toBe(true);
  });

  it.each([
    ["2", "٢٫٥"], ["48", "٤٩"], ["9 4 11", "٩ ٤"],
  ])("Q10: folding changes no meaning — %j is still NOT accepted as %j", (printed, typed) => {
    expect(judge(printed, typed)).toBe(false);
  });

  it("Q10: the server, the key builder and the local evaluator normalise alike", () => {
    const local = (key: string, typed: string) => localEvaluator.evaluate({ kind: "shortInput", prompt: "?", answer: key }, { kind: "shortInput", text: typed }).status;
    for (const [key, typed, right] of [["48", "٤٨", true], ["5.66", "٥٫٦٦", true], ["٤٨", "48", true], ["2", "٢٫٥", false]] as const) {
      expect(judge(key, typed), key + " / " + typed).toBe(right);
      expect(local(key, typed), "local " + key + " / " + typed).toBe(right ? "correct" : "incorrect");
    }
    expect(normalizeStudyText(" ٩ ٤ ١١ ")).toBe("9 4 11");
  });
});
