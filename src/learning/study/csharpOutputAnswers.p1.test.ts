// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — PIN: a «ما ناتج البرنامج؟» answer of the book 899371 is a shortInput,
// judged on the server (learning-study.js evaluateStudyResponse) against a key stored normalised by the authoring side
// (eligibility.ts normalizeStudyText). The existing normalisation already fits C# output, with no change:
//   • case is ignored, so C#'s «True» / «False» are accepted as typed «true» / «false»;
//   • runs of whitespace — including line breaks — are one space, so a two-line output «5⏎3.5» may be typed «5 3.5»;
//   • anything else is exact: «2» is not «2.5», «False» is not «True», a missing number is wrong.
// Not normalised (recorded for the owner, plan §13.4): Arabic-Indic digits («٩ ٤ ١١») are NOT the same as «9 4 11».
// The keys below are the real outputs of the book's code, proven by execution in P0 (docs/enterprise-899371-learning/probes).
import { describe, it, expect } from "vitest";
import { normalizeStudyText } from "./eligibility";
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

  it("does not fold Arabic-Indic digits (an open owner decision, plan §13.4)", () => {
    expect(judge("9 4 11", "٩ ٤ ١١")).toBe(false);
  });
});
