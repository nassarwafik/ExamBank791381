import { describe, it, expect } from "vitest";
import * as COV from "./assessmentBlueprintCoverage";
import { buildAssessmentProfile } from "./assessmentBlueprint";
import { networkingBlueprint, computerScienceBlueprint, mathematicsBlueprint, physicsBlueprint, chemistryBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1, BlueprintConstraint } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-B — F1..F4: the pure Live Coverage engine. Fail-first on baseline e6affe0.
type Meta = { primaryTopicId?: string; secondaryTopicIds?: string[]; objectiveIds?: string[]; difficulty?: number; cognitiveLevel?: string; capabilities?: string[] };
const q = (id: string, marks: number, meta?: Meta, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[], over: Partial<BuilderSection> = {}): BuilderSection => ({ id, title: "قسم " + id, gradingPolicy: "all", stimuli: {}, questions, ...over } as BuilderSection);
const examOf = (sections: BuilderSection[], blueprint?: AssessmentBlueprintV1): StructuredExam => ({ examId: "e", title: "t", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", ...(blueprint ? { blueprint } : {}), sections } as StructuredExam);
const c = (id: string, dimension: BlueprintConstraint["dimension"], ref: string, metric: "count" | "marks", unit: "absolute" | "percent", lim: Partial<Pick<BlueprintConstraint, "min" | "target" | "max" | "tolerance">>): BlueprintConstraint => ({ id, dimension, ref, metric, unit, ...lim });
const withC = (bp: AssessmentBlueprintV1, constraints: BlueprintConstraint[], targets?: { totalQuestions?: number; totalMarks?: number }): AssessmentBlueprintV1 => ({ ...bp, constraints, ...(targets ? { targets } : {}) });
const row = (r: COV.BlueprintCoverageReport, id: string) => r.constraints.find(x => x.id === id)!;
const NET = networkingBlueprint;

describe("F1 — relation semantics (deterministic, epsilon-aware, no rounding)", () => {
  const rel = (actual: number, lim: { min?: number; target?: number; max?: number; tolerance?: number }) => COV.evaluateConstraintRelation(actual, lim).relation;
  it("min only / max only / range", () => {
    expect(rel(3, { min: 4 })).toBe("below-min"); expect(rel(4, { min: 4 })).toBe("within-range"); expect(rel(9, { min: 4 })).toBe("within-range");
    expect(rel(9, { max: 8 })).toBe("above-max"); expect(rel(8, { max: 8 })).toBe("within-range");
    expect(rel(5, { min: 4, max: 6 })).toBe("within-range"); expect(rel(3, { min: 4, max: 6 })).toBe("below-min"); expect(rel(7, { min: 4, max: 6 })).toBe("above-max");
  });
  it("target only / target + tolerance / min + target + max — min and max win before target", () => {
    expect(rel(30, { target: 30 })).toBe("at-target"); expect(rel(22, { target: 30 })).toBe("below-target"); expect(rel(31, { target: 30 })).toBe("above-target");
    expect(rel(28, { target: 30, tolerance: 2 })).toBe("within-tolerance"); expect(rel(32, { target: 30, tolerance: 2 })).toBe("within-tolerance");
    expect(rel(27, { target: 30, tolerance: 2 })).toBe("below-target"); expect(rel(33, { target: 30, tolerance: 2 })).toBe("above-target");
    expect(rel(30, { target: 30, tolerance: 2 })).toBe("within-tolerance");
    expect(rel(2, { min: 4, target: 5, max: 6 })).toBe("below-min"); expect(rel(7, { min: 4, target: 5, max: 6 })).toBe("above-max");
    expect(rel(5, { min: 4, target: 5, max: 6 })).toBe("at-target"); expect(rel(4, { min: 4, target: 5, max: 6 })).toBe("below-target");
  });
  it("floating drift within the documented epsilon counts as equality; a real fractional difference does not", () => {
    expect(COV.COVERAGE_EPSILON).toBeGreaterThan(0); expect(COV.COVERAGE_EPSILON).toBeLessThanOrEqual(1e-6);
    expect(rel(0.1 + 0.2, { target: 0.3 })).toBe("at-target");
    expect(rel(100 - 1e-12, { target: 100 })).toBe("at-target");
    expect(rel(33.333333333333336, { target: 33.3333, tolerance: 0.001 })).toBe("within-tolerance");
    expect(rel(33.6, { target: 33.3, tolerance: 0.25 })).toBe("above-target");                       // rounding before comparison would hide this
    expect(rel(33.4, { target: 33.3 })).toBe("above-target");
  });
  it("delta / shortfall / excess are raw numbers (never rounded), null when not meaningful", () => {
    expect(COV.evaluateConstraintRelation(22, { target: 30 })).toMatchObject({ relation: "below-target", delta: -8, shortfall: null, excess: null });
    expect(COV.evaluateConstraintRelation(3, { min: 4, target: 5 })).toMatchObject({ relation: "below-min", delta: -2, shortfall: 1, excess: null });
    expect(COV.evaluateConstraintRelation(9, { max: 8 })).toMatchObject({ relation: "above-max", delta: null, shortfall: null, excess: 1 });
    expect(COV.evaluateConstraintRelation(2.5, { target: 2.25 }).delta).toBe(0.25);
  });
});

describe("F2 / F3 — actual value extraction: count / marks × absolute / percent", () => {
  const exam = examOf([
    sec("s1", [q("q1", 5, { primaryTopicId: "IP_ADDRESSING", difficulty: 3, cognitiveLevel: "apply", objectiveIds: ["obj-subnet", "obj-layers"], capabilities: ["cli", "calculation"] }),
                q("q2", 5, { primaryTopicId: "OSI_TCPIP", difficulty: 3, cognitiveLevel: "remember", objectiveIds: ["obj-layers"] }, { presentationType: "shortAnswer" }),
                q("q3", 10, { primaryTopicId: "IP_ADDRESSING", secondaryTopicIds: ["OSI_TCPIP", "SUBNET_CIDR"], difficulty: 5, capabilities: ["cli"] })]),
    sec("s2", [q("q4", 5, undefined, { topic: "VLAN_TRUNKING", origin: "bank", bankQuestionId: "B-1" }), q("q5", 5, undefined)], { gradingPolicy: "capScore", maxMarks: 6 })
  ]);
  // weights: s1 = 20 (all), s2 = 10 raw → official 6. totalQuestions 5, totalOfficialMarks 26, totalWeightMarks 30.
  const bp = withC(NET, [
    c("cnt-abs", "topic", "IP_ADDRESSING", "count", "absolute", { target: 3 }),
    c("cnt-pct", "topic", "IP_ADDRESSING", "count", "percent", { target: 50 }),
    c("mk-abs", "topic", "IP_ADDRESSING", "marks", "absolute", { min: 10, max: 20 }),
    c("mk-pct", "topic", "OSI_TCPIP", "marks", "percent", { target: 25, tolerance: 1 }),
    c("mk-pct-b", "topic", "SUBNET_CIDR", "marks", "percent", { min: 10 }),
    c("diff", "difficulty", "3", "count", "absolute", { min: 1, max: 2 }),
    c("type", "questionType", "multipleChoice", "count", "absolute", { max: 3 }),
    c("obj", "objective", "obj-layers", "marks", "absolute", { target: 10 }),
    c("cog", "cognitiveLevel", "apply", "count", "percent", { target: 20 }),
    c("cap", "capability", "cli", "marks", "percent", { target: 50 }),
    c("sec", "section", "s2", "marks", "absolute", { target: 6 }),
    c("sec-cnt", "section", "s1", "count", "percent", { target: 60 })
  ], { totalQuestions: 6, totalMarks: 30 });
  const r = COV.evaluateBlueprintCoverage(exam, bp);
  it("count absolute — bucket count; percent — bucket.count / totalQuestions × 100", () => {
    expect(row(r, "cnt-abs")).toMatchObject({ metric: "count", unit: "absolute", actual: 2, target: 3, relation: "below-target", delta: -1, count: 2 });
    expect(row(r, "cnt-pct")).toMatchObject({ actual: 40, denominator: 5, relation: "below-target", delta: -10 });
    expect(row(r, "diff")).toMatchObject({ actual: 2, relation: "within-range" });
    expect(row(r, "type")).toMatchObject({ actual: 4, max: 3, relation: "above-max", excess: 1 });
    expect(row(r, "cog")).toMatchObject({ actual: 20, relation: "at-target" });
    expect(row(r, "sec-cnt")).toMatchObject({ actual: 60, relation: "at-target", refLabel: "قسم s1" });
  });
  it("marks absolute — officialMarks (never raw q.marks / weightMarks); marks percent — officialMarks / totalOfficialMarks × 100", () => {
    expect(row(r, "mk-abs")).toMatchObject({ actual: 15, officialMarks: 15, weightMarks: 15, relation: "within-range" });
    expect(row(r, "mk-pct")).toMatchObject({ denominator: 26, relation: "below-target" });
    expect(row(r, "mk-pct").actual).toBeCloseTo((5 / 26) * 100, 12);
    expect(row(r, "sec")).toMatchObject({ actual: 6, officialMarks: 6, weightMarks: 10, relation: "at-target" });        // capScore: official 6, not 10
    expect(row(r, "obj")).toMatchObject({ actual: 10, relation: "at-target" });                                             // q1 + q2 both measure obj-layers
    expect(row(r, "cap").actual).toBeCloseTo((15 / 26) * 100, 12);
    expect(r.totalOfficialMarks).toBe(26); expect(r.totalQuestions).toBe(5);
    expect(buildAssessmentProfile(exam, bp).totalWeightMarks).toBe(30);                                                     // and the engine never used it as a denominator
  });
  it("total targets are first-class rows using totalQuestions and totalOfficialMarks", () => {
    expect(r.targetTotalQuestions).toBe(6); expect(r.targetTotalMarks).toBe(30);
    expect(r.totals).toHaveLength(2);
    expect(r.totals[0]).toMatchObject({ id: "total-questions", kind: "total-questions", metric: "count", unit: "absolute", actual: 5, target: 6, relation: "below-target", delta: -1 });
    expect(r.totals[1]).toMatchObject({ id: "total-marks", kind: "total-marks", metric: "marks", unit: "absolute", actual: 26, target: 30, relation: "below-target", delta: -4 });
  });
  it("primary topic is exclusive: secondary topics never inflate topic coverage; objectives and capabilities overlap intentionally", () => {
    expect(row(r, "mk-pct-b")).toMatchObject({ actual: 0, count: 0, officialMarks: 0, relation: "below-min", evidence: [] });   // SUBNET_CIDR only secondary on q3
    expect(row(r, "mk-pct").officialMarks).toBe(5);                                                                              // OSI_TCPIP: q2 only, not q3's secondary
    expect(row(r, "obj").evidence).toEqual(["q1", "q2"]);
    expect(row(r, "cap").evidence).toEqual(["q1", "q3"]);
    const objTotal = r.constraints.filter(x => x.dimension === "objective").reduce((s, x) => s + x.count, 0);
    expect(objTotal).toBe(2);
  });
  it("missing bucket = 0 (not undefined); evidence question ids in global exam order", () => {
    const r2 = COV.evaluateBlueprintCoverage(exam, withC(NET, [c("none", "topic", "NETWORK_BASICS", "count", "absolute", { min: 1 })]));
    expect(row(r2, "none")).toMatchObject({ actual: 0, count: 0, weightMarks: 0, officialMarks: 0, relation: "below-min", shortfall: 1, evidence: [] });
    expect(row(r, "cnt-abs").evidence).toEqual(["q1", "q3"]); expect(row(r, "type").evidence).toEqual(["q1", "q3", "q4", "q5"]);
  });
  it("unclassified questions and unmapped bank evidence are reported with ids", () => {
    expect(r.unclassified).toEqual({ count: 2, weightMarks: 10, officialMarks: 6, questionIds: ["q4", "q5"] });
    expect(r.unmappedBank).toEqual({ questionIds: ["q4"], byTopic: { VLAN_TRUNKING: ["q4"] } });
    expect(r.constraintCount).toBe(12);
  });
  it("capScore / firstNAnswered / compound / fractional official marks flow from the 13C-A profile unchanged", () => {
    const compound = { examQuestionId: "c1", presentationType: "compound", text: "مركب", marks: 99, parts: [{ id: "p1", type: "shortAnswer", text: "أ", marks: 2, answer: { text: "x" } }, { id: "p2", type: "shortAnswer", text: "ب", marks: 3, answer: { text: "y" } }], assessmentMeta: { primaryTopicId: "SUBNET_CIDR" } } as unknown as BuilderQuestion;
    const e = examOf([
      sec("f", [q("a", 2, { primaryTopicId: "IP_ADDRESSING" }), q("b", 2, { primaryTopicId: "IP_ADDRESSING" }), q("c", 2, { primaryTopicId: "OSI_TCPIP" })], { gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 4 }),
      sec("g", [compound, q("d", 5, { primaryTopicId: "IP_ADDRESSING" })], { gradingPolicy: "capScore", maxMarks: 5 })
    ]);
    const rr = COV.evaluateBlueprintCoverage(e, withC(NET, [c("ip", "topic", "IP_ADDRESSING", "marks", "percent", { target: 50 }), c("sub", "topic", "SUBNET_CIDR", "marks", "absolute", { target: 2.5 }), c("osi", "topic", "OSI_TCPIP", "marks", "absolute", { min: 1, max: 1.5 })]));
    expect(rr.totalOfficialMarks).toBe(9);
    expect(row(rr, "sub")).toMatchObject({ actual: 2.5, weightMarks: 5, relation: "at-target" });                              // 5 × 5 / 10
    expect(row(rr, "osi").actual).toBeCloseTo(4 / 3, 12); expect(row(rr, "osi").relation).toBe("within-range");
    expect(row(rr, "ip").actual).toBeCloseTo(((8 / 3 + 2.5) / 9) * 100, 12); expect(row(rr, "ip").relation).toBe("above-target");
  });
});

describe("zero denominators and invalid constraints never crash and never yield NaN / Infinity / silent zero", () => {
  it("count percent with zero questions → unassessable(zero-count-denominator); marks percent with zero official marks → unassessable(zero-marks-denominator)", () => {
    const empty = examOf([sec("s1", [])]);
    const r = COV.evaluateBlueprintCoverage(empty, withC(NET, [c("p", "topic", "IP_ADDRESSING", "count", "percent", { target: 50 }), c("m", "topic", "IP_ADDRESSING", "marks", "percent", { target: 50 }), c("a", "topic", "IP_ADDRESSING", "count", "absolute", { target: 2 })]));
    expect(row(r, "p")).toMatchObject({ relation: "unassessable", reason: "zero-count-denominator", actual: null, delta: null });
    expect(row(r, "m")).toMatchObject({ relation: "unassessable", reason: "zero-marks-denominator", actual: null });
    expect(row(r, "a")).toMatchObject({ actual: 0, relation: "below-target", delta: -2 });
    const zeroMarks = examOf([sec("s1", [q("q1", 0, { primaryTopicId: "IP_ADDRESSING" })])]);
    const r2 = COV.evaluateBlueprintCoverage(zeroMarks, withC(NET, [c("m", "topic", "IP_ADDRESSING", "marks", "percent", { target: 50 }), c("p", "topic", "IP_ADDRESSING", "count", "percent", { target: 100 })]));
    expect(row(r2, "m")).toMatchObject({ relation: "unassessable", reason: "zero-marks-denominator" });
    expect(row(r2, "p")).toMatchObject({ actual: 100, relation: "at-target" });
    for (const item of [...r.constraints, ...r2.constraints]) { expect(Number.isNaN(item.actual as number)).toBe(false); expect(item.actual === null || Number.isFinite(item.actual)).toBe(true); }
  });
  it("broken / malformed constraints → unassessable(blueprint-issue) carrying the structured issues, never actual 0", () => {
    const exam = examOf([sec("s1", [q("q1", 4, { primaryTopicId: "IP_ADDRESSING" })])]);
    const bad = withC(NET, [
      c("bt", "topic", "NOPE", "count", "absolute", { target: 1 }),
      c("bo", "objective", "no-obj", "count", "absolute", { target: 1 }),
      c("bs", "section", "gone", "count", "absolute", { target: 1 }),
      c("bd", "difficulty", "9", "count", "absolute", { target: 1 }),
      { id: "bu", dimension: "topic", ref: "IP_ADDRESSING", metric: "count", unit: "furlongs" as never, target: 1 },
      c("bc", "topic", "IP_ADDRESSING", "count", "absolute", { min: 5, max: 2 }),
      c("bp", "topic", "IP_ADDRESSING", "count", "percent", { target: 140 }),
      c("ok", "topic", "IP_ADDRESSING", "marks", "absolute", { target: 4 })                       // a different metric: not an equivalent duplicate of "bc"
    ]);
    const r = COV.evaluateBlueprintCoverage(exam, bad);
    const codes = (id: string) => row(r, id).issues.map(i => i.code);
    expect(row(r, "bt")).toMatchObject({ relation: "unassessable", reason: "blueprint-issue", actual: null }); expect(codes("bt")).toContain("BROKEN_TOPIC_REF");
    expect(codes("bo")).toContain("BROKEN_OBJECTIVE_REF"); expect(codes("bs")).toContain("BROKEN_SECTION_REF"); expect(codes("bd")).toContain("INVALID_DIFFICULTY");
    expect(codes("bu")).toContain("INVALID_UNIT"); expect(codes("bc")).toContain("CONTRADICTORY_LIMITS"); expect(codes("bp")).toContain("PERCENT_OUT_OF_RANGE");
    for (const id of ["bo", "bs", "bd", "bu", "bc", "bp"]) expect(row(r, id).relation).toBe("unassessable");
    expect(row(r, "ok")).toMatchObject({ actual: 4, relation: "at-target" });
    expect(r.issues.length).toBeGreaterThanOrEqual(7);
    expect(r.constraints.map(x => x.id)).toEqual(["bt", "bo", "bs", "bd", "bu", "bc", "bp", "ok"]);                        // blueprint order, deterministic
  });
  it("no blueprint / structurally invalid blueprint → a usable report with no constraint rows and no crash", () => {
    const exam = examOf([sec("s1", [q("q1", 4)])]);
    const none = COV.evaluateBlueprintCoverage(exam, undefined);
    expect(none.constraints).toEqual([]); expect(none.totals).toEqual([]); expect(none.totalQuestions).toBe(1); expect(none.unclassified.questionIds).toEqual(["q1"]);
    const broken = COV.evaluateBlueprintCoverage(exam, { schemaVersion: 7 } as never);
    expect(broken.constraints).toEqual([]); expect(broken.issues.map(i => i.code)).toContain("UNSUPPORTED_SCHEMA_VERSION");
  });
});

describe("F4 — evidence index (pure, runtime-derived, near-linear)", () => {
  it("indexes primary topic / objective / difficulty / type / cognitive / capability / section / unclassified / unmapped by question id in global order", () => {
    const exam = examOf([
      sec("s1", [q("q1", 5, { primaryTopicId: "IP_ADDRESSING", secondaryTopicIds: ["OSI_TCPIP"], difficulty: 3, cognitiveLevel: "apply", objectiveIds: ["obj-subnet"], capabilities: ["cli"] }), q("q2", 5, undefined, { topic: "VLAN", secondaryTopics: ["DHCP"] })]),
      sec("s2", [q("q3", 5, { primaryTopicId: "IP_ADDRESSING", objectiveIds: ["obj-subnet", "obj-layers"] }, { presentationType: "shortAnswer" })])
    ]);
    const idx = COV.buildAssessmentEvidenceIndex(exam, NET);
    expect(idx.order).toEqual(["q1", "q2", "q3"]);
    expect(idx.byTopic).toEqual({ IP_ADDRESSING: ["q1", "q3"] });                                    // OSI_TCPIP (secondary) absent
    expect(idx.byObjective).toEqual({ "obj-subnet": ["q1", "q3"], "obj-layers": ["q3"] });
    expect(idx.byDifficulty).toEqual({ "3": ["q1"], unspecified: ["q2", "q3"] });
    expect(idx.byType).toEqual({ multipleChoice: ["q1", "q2"], shortAnswer: ["q3"] });
    expect(idx.byCognitiveLevel).toEqual({ apply: ["q1"], unspecified: ["q2", "q3"] });
    expect(idx.byCapability).toEqual({ cli: ["q1"] });
    expect(idx.bySection).toEqual({ s1: ["q1", "q2"], s2: ["q3"] });
    expect(idx.unclassified).toEqual(["q2"]);
    expect(idx.unmappedBankTopics).toEqual({ VLAN: ["q2"], DHCP: ["q2"] });
  });
  it("does not mutate its inputs, is deterministic, and scales near-linearly (2000 questions × 40 constraints)", () => {
    const big = examOf([sec("s1", Array.from({ length: 2000 }, (_, i) => q("q" + i, 1 + (i % 3), { primaryTopicId: i % 2 ? "IP_ADDRESSING" : "OSI_TCPIP", difficulty: 1 + (i % 5), objectiveIds: i % 4 ? ["obj-subnet"] : ["obj-subnet", "obj-layers"] })))]);
    const bp = withC(NET, Array.from({ length: 40 }, (_, i) => c("c" + i, i % 2 ? "topic" : "difficulty", i % 2 ? "IP_ADDRESSING" : String(1 + (i % 5)), i % 3 ? "count" : "marks", i % 4 ? "absolute" : "percent", { target: 10 })), { totalQuestions: 2000, totalMarks: 4000 });
    const before = JSON.stringify(big), bpBefore = JSON.stringify(bp);
    const t0 = performance.now(); const a = COV.evaluateBlueprintCoverage(big, bp); const t1 = performance.now();
    const b = COV.evaluateBlueprintCoverage(big, bp);
    expect(t1 - t0).toBeLessThan(400);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(big)).toBe(before); expect(JSON.stringify(bp)).toBe(bpBefore);
    expect(a.constraints).toHaveLength(40); expect(a.totals[0].actual).toBe(2000);
  });
});

describe("subject-neutral: the SAME engine serves Networking, Computer Science, Mathematics, Physics and Chemistry", () => {
  it("Computer Science — hierarchy (Merge Sort under Sorting under Algorithms), objective and capability constraints, count targets", () => {
    const bp = withC(computerScienceBlueprint, [
      c("merge", "topic", "MERGE", "count", "absolute", { min: 1 }), c("alg", "topic", "ALG", "count", "absolute", { target: 1 }),
      c("o-merge", "objective", "o-merge", "count", "absolute", { target: 1 }), c("code", "capability", "code-tracing", "count", "percent", { min: 25 })
    ], { totalQuestions: 4 });
    const exam = examOf([sec("s1", [q("q1", 4, { primaryTopicId: "MERGE", objectiveIds: ["o-merge", "o-complexity"], capabilities: ["code-tracing"] }), q("q2", 4, { primaryTopicId: "ALG", objectiveIds: ["o-complexity"] }), q("q3", 2, { primaryTopicId: "TREES" })])], bp);
    const r = COV.evaluateBlueprintCoverage(exam);
    expect(row(r, "merge")).toMatchObject({ actual: 1, relation: "within-range", refLabel: "Merge Sort" });
    expect(row(r, "alg")).toMatchObject({ actual: 1, relation: "at-target" });                        // hierarchy is data: a MERGE question is not auto-counted for ALG
    expect(row(r, "o-merge")).toMatchObject({ actual: 1, relation: "at-target" });
    expect(row(r, "code").actual).toBeCloseTo(100 / 3, 12); expect(row(r, "code").relation).toBe("within-range");
    expect(r.totals[0]).toMatchObject({ actual: 3, target: 4, relation: "below-target" });
  });
  it("Mathematics — custom SOLO vocabulary and a 1..3 difficulty scale drive cognitive / difficulty rows and labels", () => {
    const bp = withC(mathematicsBlueprint, [c("rel", "cognitiveLevel", "relational", "count", "percent", { target: 50 }), c("hard", "difficulty", "3", "marks", "percent", { max: 40 }), c("bloom", "cognitiveLevel", "apply", "count", "absolute", { target: 1 })]);
    const exam = examOf([sec("s1", [q("q1", 6, { primaryTopicId: "LINEAR_EQ", cognitiveLevel: "relational", difficulty: 3 }), q("q2", 4, { primaryTopicId: "PYTHAGORAS", cognitiveLevel: "unistructural", difficulty: 1 })])], bp);
    const r = COV.evaluateBlueprintCoverage(exam);
    expect(row(r, "rel")).toMatchObject({ actual: 50, relation: "at-target", refLabel: "علائقي" });
    expect(row(r, "hard")).toMatchObject({ actual: 60, relation: "above-max", excess: 20, refLabel: "3 — صعب" });
    expect(row(r, "bloom")).toMatchObject({ relation: "unassessable", reason: "blueprint-issue" });   // Bloom "apply" is not in this blueprint's vocabulary
  });
  it("Physics — marks percent by topic and a section constraint with a capScore section", () => {
    const bp = withC(physicsBlueprint, [c("proj", "topic", "PROJECTILE", "marks", "percent", { target: 40, tolerance: 5 }), c("sec", "section", "part-b", "marks", "absolute", { min: 10 })]);
    const exam = examOf([sec("part-a", [q("q1", 6, { primaryTopicId: "PROJECTILE" }), q("q2", 4, { primaryTopicId: "WAVES" })]), sec("part-b", [q("q3", 8, { primaryTopicId: "MOTION" }), q("q4", 8, { primaryTopicId: "PROJECTILE" })], { gradingPolicy: "capScore", maxMarks: 10 })], bp);
    const r = COV.evaluateBlueprintCoverage(exam);
    expect(r.totalOfficialMarks).toBe(20);
    expect(row(r, "proj")).toMatchObject({ relation: "above-target", officialMarks: 11 });                                  // 6 + 8×10/16
    expect(row(r, "proj").actual).toBeCloseTo(55, 9); expect(row(r, "proj").delta).toBeCloseTo(15, 9);                       // raw float, rounded only for display
    expect(row(r, "sec")).toMatchObject({ actual: 10, relation: "within-range", refLabel: "قسم part-b" });
  });
  it("Chemistry — objective constraints overlap and an unmapped bank topic is reported, not guessed", () => {
    const bp = withC(chemistryBlueprint, [c("bal", "objective", "o-balance", "count", "absolute", { target: 2 }), c("mol", "objective", "o-moles", "count", "absolute", { target: 1 }), c("redox", "topic", "REDOX", "count", "absolute", { min: 1 })]);
    const exam = examOf([sec("s1", [q("q1", 3, { primaryTopicId: "REDOX", objectiveIds: ["o-balance", "o-moles"] }), q("q2", 3, { primaryTopicId: "STOICH", objectiveIds: ["o-balance"] }), q("q3", 3, undefined, { topic: "redox", origin: "bank", bankQuestionId: "B" })])], bp);
    const r = COV.evaluateBlueprintCoverage(exam);
    expect(row(r, "bal")).toMatchObject({ actual: 2, relation: "at-target", evidence: ["q1", "q2"] });
    expect(row(r, "mol")).toMatchObject({ actual: 1, relation: "at-target" });
    expect(row(r, "redox")).toMatchObject({ actual: 1, evidence: ["q1"] });                          // "redox" ≠ "REDOX": never fuzzy-mapped
    expect(r.unmappedBank).toEqual({ questionIds: ["q3"], byTopic: { redox: ["q3"] } });
  });
  it("Networking fixture — every constraint of the shipped fixture evaluates without a subject branch", () => {
    const exam = examOf([sec("s1", [q("q1", 5, { primaryTopicId: "SUBNET_CIDR", difficulty: 3 }), q("q2", 5, { primaryTopicId: "OSI_TCPIP", difficulty: 2 })])], NET);
    const r = COV.evaluateBlueprintCoverage(exam);
    expect(r.constraints).toHaveLength(NET.constraints.length);
    for (const item of r.constraints) expect(["below-min", "below-target", "within-tolerance", "at-target", "above-target", "above-max", "within-range", "unassessable"]).toContain(item.relation);
  });
  it("the report carries no score / grade / gate / rating and nothing subjective (13C-C boundary)", () => {
    const r = COV.evaluateBlueprintCoverage(examOf([sec("s1", [q("q1", 1)])], NET));
    expect(JSON.stringify(r)).not.toMatch(/score|grade|gate|rating|"pass"|"fail"|quality/i);
  });
});
