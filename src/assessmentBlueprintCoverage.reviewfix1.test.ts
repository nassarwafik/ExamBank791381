import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as COV from "./assessmentBlueprintCoverage";
import * as BP from "./assessmentBlueprint";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1, BlueprintConstraint } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-B — Independent Review Fix 1: R2 (invalid total targets are never analysed as real targets) and R3 (the
// claimed O(n + c) is structurally true: no per-question taxonomy rebuild, no per-constraint issue rescans, no post-hoc
// unmapped reconstruction). Fail-first on ffea5b0.
const q = (id: string, marks: number, meta?: Record<string, unknown>, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[]): BuilderSection => ({ id, title: "قسم " + id, gradingPolicy: "all", stimuli: {}, questions } as BuilderSection);
const examOf = (sections: BuilderSection[]): StructuredExam => ({ examId: "e", title: "t", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", sections } as StructuredExam);
const withT = (targets: Record<string, unknown>): AssessmentBlueprintV1 => ({ ...networkingBlueprint, constraints: [], targets } as unknown as AssessmentBlueprintV1);
const exam5 = examOf([sec("s1", [q("q1", 2, { primaryTopicId: "IP_ADDRESSING" }), q("q2", 2), q("q3", 2), q("q4", 2), q("q5", 2)])]);
const totalRow = (r: COV.BlueprintCoverageReport, id: string) => r.totals.find(t => t.id === id);

describe("R2 — invalid total targets are unassessable rows tied to their INVALID_TARGET issue, never authoritative targets", () => {
  it("negative totalQuestions → unassessable(blueprint-issue) with INVALID_TARGET; the overview target is not exposed", () => {
    const r = COV.evaluateBlueprintCoverage(exam5, withT({ totalQuestions: -1 }));
    const row = totalRow(r, "total-questions")!;
    expect(row).toMatchObject({ kind: "total-questions", relation: "unassessable", reason: "blueprint-issue", actual: null, delta: null });
    expect(row.issues.map(i => i.code)).toEqual(["INVALID_TARGET"]); expect(row.issues[0].path).toBe("targets.totalQuestions");
    expect(row.target).toBeUndefined(); expect(r.targetTotalQuestions).toBeUndefined();
    expect(r.totalQuestions).toBe(5);                                                                // the fact itself is still reported
    expect(r.issues.map(i => i.code)).toContain("INVALID_TARGET");
  });
  it("negative totalMarks → unassessable; NaN / Infinity / string / object targets → unassessable with the issue preserved (never coerced, never repaired)", () => {
    expect(totalRow(COV.evaluateBlueprintCoverage(exam5, withT({ totalMarks: -5 })), "total-marks")).toMatchObject({ relation: "unassessable", reason: "blueprint-issue", actual: null });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "10", { n: 10 }]) {
      const r = COV.evaluateBlueprintCoverage(exam5, withT({ totalQuestions: bad }));
      const row = totalRow(r, "total-questions")!;
      expect(row, String(bad)).toMatchObject({ relation: "unassessable", reason: "blueprint-issue" });
      expect(row.issues.map(i => i.code), String(bad)).toContain("INVALID_TARGET");
      expect(r.targetTotalQuestions, String(bad)).toBeUndefined();
      expect(JSON.stringify(r)).not.toMatch(/"target":0/);
    }
    const junk = COV.evaluateBlueprintCoverage(exam5, withT({ totalQuestions: "x" } as never));
    expect(junk.totals).toHaveLength(1); expect(junk.totals[0].relation).toBe("unassessable");
  });
  it("an invalid total target never yields below / above / at-target; a valid zero target follows canonical semantics; valid positive targets are unchanged", () => {
    for (const bad of [-1, -0.5, Number.NaN, "5"]) expect(["below-target", "above-target", "at-target"]).not.toContain(totalRow(COV.evaluateBlueprintCoverage(exam5, withT({ totalQuestions: bad })), "total-questions")!.relation);
    const zero = COV.evaluateBlueprintCoverage(exam5, withT({ totalQuestions: 0, totalMarks: 0 }));
    expect(zero.issues).toEqual([]);                                                                   // 0 is a valid (if odd) target in the canonical validator
    expect(totalRow(zero, "total-questions")).toMatchObject({ actual: 5, target: 0, relation: "above-target", delta: 5 });
    expect(totalRow(zero, "total-marks")).toMatchObject({ actual: 10, target: 0, relation: "above-target", delta: 10 });
    const ok = COV.evaluateBlueprintCoverage(exam5, withT({ totalQuestions: 6, totalMarks: 10 }));
    expect(totalRow(ok, "total-questions")).toMatchObject({ actual: 5, target: 6, relation: "below-target", delta: -1 });
    expect(totalRow(ok, "total-marks")).toMatchObject({ actual: 10, target: 10, relation: "at-target", delta: 0 });
    expect(ok.targetTotalQuestions).toBe(6); expect(ok.targetTotalMarks).toBe(10);
  });
  it("the report's issue list is exactly the canonical validation result the Blueprint panel counts", () => {
    const bp = { ...withT({ totalQuestions: -1 }), constraints: [{ id: "bt", dimension: "topic", ref: "NOPE", metric: "count", unit: "absolute", target: 1 } as BlueprintConstraint] };
    const r = COV.evaluateBlueprintCoverage(exam5, bp);
    const canonical = BP.validateBlueprintForExam(bp, exam5);
    expect(r.issues).toEqual(canonical); expect(r.issues).toHaveLength(2);
    expect(r.totals[0].issues).toHaveLength(1); expect(r.constraints[0].issues).toHaveLength(1);
  });
});

describe("R3 — near-linear structure: prepared taxonomy context, indexed issues, in-pass unmapped list", () => {
  const code = (src: string) => src.split("\n").filter(l => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")); }).join("\n");
  it("R3-C — one prepared AssessmentMetaContext per evaluation is shared by the profile and the evidence index; two-argument callers stay compatible and exact", () => {
    const bp = { ...networkingBlueprint, topics: Array.from({ length: 400 }, (_, i) => ({ id: "T" + i, label: "t" + i })) };
    const ctx = BP.prepareAssessmentMetaContext(bp);
    expect(ctx.topicIds.size).toBe(400); expect(ctx.topicIds.has("T7")).toBe(true);
    const bankQ = q("b", 1, undefined, { topic: "T7", secondaryTopics: ["T8", "nope"] });
    expect(BP.effectiveAssessmentMeta(bankQ, bp, ctx)).toEqual(BP.effectiveAssessmentMeta(bankQ, bp));                   // same semantics with or without the context
    expect(BP.effectiveAssessmentMeta(bankQ, bp, ctx).primaryTopicId).toBe("T7"); expect(BP.effectiveAssessmentMeta(bankQ, bp, ctx).unmappedBankTopics).toEqual(["nope"]);
    expect(BP.effectiveAssessmentMeta(q("x", 1, undefined, { topic: "t7" }), bp, ctx).primaryTopicId).toBeUndefined();    // still exact, never fuzzy
    const big = examOf([sec("s1", Array.from({ length: 3000 }, (_, i) => q("q" + i, 1, undefined, { topic: "T" + (i % 400) })))]);
    BP.assessmentMetaDiagnostics.contextsPrepared = 0;
    COV.evaluateBlueprintCoverage(big, bp);
    expect(BP.assessmentMetaDiagnostics.contextsPrepared).toBe(1);                                                        // not 3000, not 6000
    BP.assessmentMetaDiagnostics.contextsPrepared = 0;
    BP.buildAssessmentProfile(big, bp); expect(BP.assessmentMetaDiagnostics.contextsPrepared).toBe(1);
    BP.assessmentMetaDiagnostics.contextsPrepared = 0;
    COV.buildAssessmentEvidenceIndex(big, bp); expect(BP.assessmentMetaDiagnostics.contextsPrepared).toBe(1);
    BP.assessmentMetaDiagnostics.contextsPrepared = 0;
    BP.effectiveAssessmentMeta(bankQ, bp); BP.effectiveAssessmentMeta(bankQ, bp);
    expect(BP.assessmentMetaDiagnostics.contextsPrepared).toBe(2);                                                        // the legacy 2-arg path prepares per call (documented)
  });
  it("R3-A — the evidence index carries the ordered, de-duplicated unmapped question list from the same pass", () => {
    const exam = examOf([sec("s1", [q("q1", 1, undefined, { topic: "U1", secondaryTopics: ["U2", "U3"] }), q("q2", 1, { primaryTopicId: "IP_ADDRESSING" }), q("q3", 1, undefined, { topic: "U1" })])]);
    const idx = COV.buildAssessmentEvidenceIndex(exam, networkingBlueprint);
    expect(idx.unmappedQuestionIds).toEqual(["q1", "q3"]);                                                                // q1 once despite 3 unmapped topics
    expect(idx.unmappedBankTopics).toEqual({ U1: ["q1", "q3"], U2: ["q1"], U3: ["q1"] });
    expect(COV.evaluateBlueprintCoverage(exam, networkingBlueprint).unmappedBank.questionIds).toEqual(["q1", "q3"]);
  });
  it("R3-B — constraint issues come from a one-time index: id-keyed and path-keyed issues both reach their row, duplicate ids stay flagged on every holder", () => {
    const bp: AssessmentBlueprintV1 = { ...networkingBlueprint, constraints: [
      { id: "dup", dimension: "topic", ref: "IP_ADDRESSING", metric: "count", unit: "absolute", target: 1 },
      { id: "dup", dimension: "topic", ref: "OSI_TCPIP", metric: "count", unit: "absolute", target: 1 },
      { id: 42 as never, dimension: "topic", ref: "NOPE", metric: "count", unit: "absolute", target: 1 },                   // malformed id → path-only issues
      { id: "fine", dimension: "topic", ref: "SUBNET_CIDR", metric: "marks", unit: "absolute", min: 1 }
    ] };
    const r = COV.evaluateBlueprintCoverage(exam5, bp);
    expect(r.constraints.map(c => c.relation)).toEqual(["unassessable", "unassessable", "unassessable", "below-min"]);
    expect(r.constraints[0].issues.map(i => i.code)).toContain("DUPLICATE_CONSTRAINT_ID"); expect(r.constraints[1].issues.map(i => i.code)).toContain("DUPLICATE_CONSTRAINT_ID");
    expect(r.constraints[2].issues.map(i => i.code)).toEqual(expect.arrayContaining(["INVALID_CONSTRAINT_ID", "BROKEN_TOPIC_REF"]));
    expect(r.constraints[2].id).toBe("constraints[2]");
    expect(r.constraints[3].issues).toEqual([]);
  });
  it("structural guard: the engine has no per-constraint issue rescan, no nested unmapped reconstruction, and no per-question taxonomy rebuild", () => {
    const src = code(readFileSync("src/assessmentBlueprintCoverage.ts", "utf8"));
    expect(src).not.toMatch(/issues\.filter\(/);
    expect(src).not.toMatch(/\.some\([^\n]*\.includes\(/);
    expect(src).not.toMatch(/Object\.values\(evidence\.unmappedBankTopics\)/);
    expect(src).toMatch(/prepareAssessmentMetaContext\(/);
    const bpSrc = code(readFileSync("src/assessmentBlueprint.ts", "utf8"));
    expect(bpSrc).toMatch(/export function prepareAssessmentMetaContext/);
  });
  it("worst case (3000 questions × unique unmapped topics × 500 topics × 300 constraints with 150 broken refs) evaluates with one prepared context, exact results and bounded time", () => {
    const topics = Array.from({ length: 500 }, (_, i) => ({ id: "T" + i, label: "t" + i }));
    const constraints: BlueprintConstraint[] = Array.from({ length: 300 }, (_, i) => ({ id: "c" + i, dimension: "topic", ref: i % 2 ? "T" + (i % 500) : "BROKEN" + i, metric: i % 3 ? "count" : "marks", unit: i % 4 ? "absolute" : "percent", target: 5 }));
    const bp: AssessmentBlueprintV1 = { ...networkingBlueprint, topics, objectives: [], constraints, targets: { totalQuestions: 3000, totalMarks: 3000 } };
    const exam = examOf([sec("s1", Array.from({ length: 3000 }, (_, i) => q("q" + i, 1, i % 2 ? { primaryTopicId: "T" + (i % 500) } : undefined, { topic: "UNMAPPED-" + i })))]);
    BP.assessmentMetaDiagnostics.contextsPrepared = 0;
    const t0 = performance.now(); const r = COV.evaluateBlueprintCoverage(exam, bp); const ms = performance.now() - t0;
    expect(BP.assessmentMetaDiagnostics.contextsPrepared).toBe(1);
    expect(r.unmappedBank.questionIds).toHaveLength(1500); expect(r.unmappedBank.questionIds[0]).toBe("q0"); expect(Object.keys(r.unmappedBank.byTopic)).toHaveLength(1500);
    expect(r.constraints).toHaveLength(300); expect(r.constraints.filter(c => c.relation === "unassessable")).toHaveLength(150); expect(r.issues).toHaveLength(150);
    expect(r.totals[0]).toMatchObject({ actual: 3000, relation: "at-target" });
    expect(ms).toBeLessThan(1500);                                                                                            // smoke only; the structural assertions above are the proof
  });
});
