import { describe, it, expect } from "vitest";
import { evaluateExamFinalization } from "./examFinalization";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";
// @ts-expect-error — CommonJS server module without type declarations (the server finalization authority).
import { evaluateServerFinalization, summarizeFinalization } from "../api/src/lib/server-finalization.js";
// @ts-expect-error — generated CommonJS build of the SAME TypeScript source (scripts/build-shared-finalization.mjs).
import * as generated from "../api/src/lib/shared-finalization/examFinalization.js";

// Phase 14A §16/§47 — ONE canonical finalization source. The server does not re-implement the math: it runs a generated
// CommonJS build of src/examFinalization.ts and its chain. This suite pins frontend and server to identical decisions
// on the representative cases. Fail-first on 6918ce1 (server modules absent).

const mcq = (id: string, marks: number, meta?: Record<string, unknown>, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[], over: Partial<BuilderSection> = {}): BuilderSection => ({ id, title: "قسم", gradingPolicy: "all", stimuli: {}, questions, ...over } as BuilderSection);
const exam = (sections: BuilderSection[], blueprint?: AssessmentBlueprintV1): StructuredExam => ({ examId: "e", title: "امتحان", status: "draft", schemaVersion: 2, ...(blueprint ? { blueprint } : {}), sections } as StructuredExam);
const BP = (policy?: unknown, constraints?: unknown[]): AssessmentBlueprintV1 => ({ ...networkingBlueprint, constraints: (constraints ?? [{ id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30 }]) as never, ...(policy ? { qualityPolicy: policy as never } : {}) });
const OMIT = Symbol("omit");
const rule = (effect: string, enabled: unknown = true, constraintId = "ipv4") => ({ id: "r", ...(enabled === OMIT ? {} : { enabled }), source: { kind: "constraint", constraintId }, relations: ["below-min"], effect });
const pol = (rules: unknown[], enabled = true) => ({ schemaVersion: 1, enabled, rules });
const ip = (id: string, marks: number) => mcq(id, marks, { primaryTopicId: "IP_ADDRESSING" });
const osi = (id: string, marks: number) => mcq(id, marks, { primaryTopicId: "OSI_TCPIP" });
const compound = (id: string, partMarks: number[]): BuilderQuestion => ({ examQuestionId: id, presentationType: "compound", text: "مركّب", marks: 10, assessmentMeta: { primaryTopicId: "IP_ADDRESSING" },
  parts: partMarks.map((m, i) => ({ id: id + "-p" + i, type: "shortAnswer", text: "جزء", marks: m, answer: { text: "x" } })) } as unknown as BuilderQuestion);

const cases: [string, StructuredExam][] = [
  ["valid exam, no blueprint", exam([sec("s1", [mcq("q1", 2), mcq("q2", 6)])])],
  ["structural error (no auto-grade key)", exam([sec("s1", [mcq("q1", 2, undefined, { answer: undefined })])])],
  ["quality gate warning only (ipv4 25% < 30)", exam([sec("s1", [ip("q1", 2), osi("q2", 6)])], BP(pol([rule("warning")])))],
  ["triggered blocker (ipv4 25% < 30)", exam([sec("s1", [ip("q1", 2), osi("q2", 6)])], BP(pol([rule("block-finalization")])))],
  ["malformed enabled rule fails closed (Review Fix 1)", exam([sec("s1", [ip("q1", 6), osi("q2", 2)])], BP(pol([rule("block-finalization", "on")])))],
  ["missing enabled rule fails closed", exam([sec("s1", [ip("q1", 6), osi("q2", 2)])], BP(pol([rule("block-finalization", OMIT)])))],
  ["explicitly disabled rule stays non-enforced", exam([sec("s1", [ip("q1", 2), osi("q2", 6)])], BP(pol([rule("block-finalization", false)])))],
  ["disabled policy adds nothing", exam([sec("s1", [ip("q1", 2), osi("q2", 6)])], BP(pol([rule("block-finalization")], false)))],
  ["capScore section: official marks are the cap shared pro rata (ipv4 weight 6 of 12 → 4 of 8 official → 50% ≥ 30)", exam([sec("s1", [ip("q1", 6), osi("q2", 6)], { gradingPolicy: "capScore", maxMarks: 8 })], BP(pol([rule("block-finalization")])))],
  ["firstNAnswered section with required config", exam([sec("s1", [ip("q1", 4), ip("q2", 4), osi("q3", 4)], { gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 8, answerUnit: "question" })], BP(pol([rule("block-finalization")])))],
  ["compound marks: parts 3+3+2 = 8 official (not q.marks 10) → ipv4 80% ≥ 30", exam([sec("s1", [compound("c1", [3, 3, 2]), osi("q2", 2)])], BP(pol([rule("block-finalization")])))],
  ["broken blueprint reference (constraint deleted) on an enabled rule blocks", exam([sec("s1", [ip("q1", 6), osi("q2", 2)])], BP(pol([rule("block-finalization", true, "deleted")])))],
  ["broken blueprint reference on a disabled rule is visible but not blocking", exam([sec("s1", [ip("q1", 6), osi("q2", 2)])], BP(pol([rule("block-finalization", false, "deleted")])))],
  ["unsupported policy schema blocks while enforced", exam([sec("s1", [ip("q1", 6), osi("q2", 2)])], BP({ schemaVersion: 9, enabled: true, rules: [] }))]
];

const strip = (d: unknown) => JSON.parse(JSON.stringify(d));

describe("14A §47 — frontend / server finalization parity", () => {
  it("every representative case yields the identical decision object on both sides (blockers, warnings, policy issues, coverage, canFinalize)", () => {
    for (const [name, e] of cases) {
      const fe = strip(evaluateExamFinalization(e));
      const be = strip(evaluateServerFinalization(e));
      expect(be, name).toEqual(fe);
    }
  });
  it("the expected verdicts hold (so the parity is not a trivial equality of two wrong answers)", () => {
    const verdicts = cases.map(([, e]) => evaluateServerFinalization(e).canFinalize);
    expect(verdicts).toEqual([true, false, true, false, false, false, true, true, true, true, true, false, true, false]);
    const capScore = evaluateServerFinalization(cases[8][1]);
    expect(capScore.coverage.constraints[0].actual).toBeCloseTo(50, 5);                    // official marks: 4 of the 8-mark cap (never raw q.marks 6 of 12)
    const cmp = evaluateServerFinalization(cases[10][1]);
    expect(cmp.coverage.totals.find((t: { kind: string }) => t.kind === "total-marks").actual).toBe(10);   // 8 (parts) + 2, never 10 + 2
  });
  it("the server module IS the generated build of the frontend source (same export, same function body semantics) — no third implementation", () => {
    expect(typeof generated.evaluateExamFinalization).toBe("function");
    expect(evaluateServerFinalization(cases[3][1])).toEqual(strip(generated.evaluateExamFinalization(cases[3][1])));
  });
  it("summarizeFinalization exposes counts only — no exam body, no answer keys", () => {
    const s = summarizeFinalization(evaluateServerFinalization(cases[3][1]));
    expect(s).toEqual({ canFinalize: false, structuralErrors: 0, structuralWarnings: 0, qualityBlockers: 1, qualityWarnings: 0, policyBlockers: 0, blockerIds: ["r"] });
    expect(JSON.stringify(s)).not.toMatch(/correctOptionIndex|سؤال/);
  });
});
