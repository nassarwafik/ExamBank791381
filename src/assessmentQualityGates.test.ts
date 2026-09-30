import { describe, it, expect } from "vitest";
import * as GATES from "./assessmentQualityGates";
import { validateAssessmentQualityPolicy } from "./assessmentQualityPolicy";
import { evaluateBlueprintCoverage } from "./assessmentBlueprintCoverage";
import { networkingBlueprint, computerScienceBlueprint, mathematicsBlueprint, physicsBlueprint, chemistryBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1, BlueprintConstraint } from "./assessmentTypes";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";

// Phase 13C-C — F3: the pure Quality Gate engine consumes the 13C-B coverage report (never questions) and a policy.
const q = (id: string, marks: number, meta?: Record<string, unknown>, over: Record<string, unknown> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...(meta ? { assessmentMeta: meta } : {}), ...over } as unknown as BuilderQuestion);
const sec = (id: string, questions: BuilderQuestion[], over: Partial<BuilderSection> = {}): BuilderSection => ({ id, title: "قسم " + id, gradingPolicy: "all", stimuli: {}, questions, ...over } as BuilderSection);
const examOf = (sections: BuilderSection[], blueprint: AssessmentBlueprintV1): StructuredExam => ({ examId: "e", title: "t", status: "draft", schemaVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z", blueprint, sections } as StructuredExam);
const bpWith = (bp: AssessmentBlueprintV1, constraints: BlueprintConstraint[], targets?: AssessmentBlueprintV1["targets"], policy?: unknown): AssessmentBlueprintV1 => ({ ...bp, constraints, ...(targets ? { targets } : {}), ...(policy ? { qualityPolicy: policy as never } : {}) });
const pol = (rules: unknown[], enabled = true) => ({ schemaVersion: 1, enabled, rules });
const cov = (rules: unknown[], relations: string[] = ["below-min", "below-target"], effect = "block-finalization", id = "r1", constraintId = "ipv4") => [{ id, enabled: true, source: { kind: "constraint", constraintId }, relations, effect }, ...rules];
const run = (exam: StructuredExam) => {
  const bp = exam.blueprint!;
  const coverage = evaluateBlueprintCoverage(exam);
  const policyIssues = validateAssessmentQualityPolicy(bp.qualityPolicy, bp);
  return { coverage, report: GATES.evaluateAssessmentQualityGates({ coverage, policy: bp.qualityPolicy, policyIssues }) };
};
// IP_ADDRESSING 2 of 8 marks = 25% (below min 30); OSI 6/8 = 75%
const NET = (policy: unknown) => bpWith(networkingBlueprint, [
  { id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30, target: 40 },
  { id: "osi", dimension: "topic", ref: "OSI_TCPIP", metric: "marks", unit: "percent", min: 10, max: 80 },
  { id: "d3", dimension: "difficulty", ref: "3", metric: "count", unit: "absolute", target: 1 }
], { totalQuestions: 3, totalMarks: 10 }, policy);
const netExam = (policy: unknown) => examOf([sec("s1", [q("q1", 2, { primaryTopicId: "IP_ADDRESSING", difficulty: 3 }), q("q2", 6, { primaryTopicId: "OSI_TCPIP" }), q("q3", 0, undefined, { topic: "VLAN", origin: "bank", bankQuestionId: "B" })])], NET(policy));

describe("F3 — gate engine: relations trigger exactly what the policy declares", () => {
  it("a relation not listed does not trigger; listed → warning or blocker per effect; at-target / within-range only when explicitly configured", () => {
    const { report } = run(netExam(pol(cov([
      { id: "w-osi", enabled: true, source: { kind: "constraint", constraintId: "osi" }, relations: ["above-max"], effect: "warning" },
      { id: "w-osi-range", enabled: true, source: { kind: "constraint", constraintId: "osi" }, relations: ["within-range"], effect: "warning" },
      { id: "b-d3", enabled: true, source: { kind: "constraint", constraintId: "d3" }, relations: ["at-target"], effect: "block-finalization" },
      { id: "w-d3", enabled: true, source: { kind: "constraint", constraintId: "d3" }, relations: ["below-target", "above-target"], effect: "warning" }
    ]))));
    const byId = Object.fromEntries(report.rules.map(r => [r.ruleId, r]));
    expect(byId.r1).toMatchObject({ triggered: true, effect: "block-finalization", relation: "below-min", coverageId: "ipv4" }); expect(byId.r1.actual).toBeCloseTo(25, 9);
    expect(byId["w-osi"]).toMatchObject({ triggered: false, relation: "within-range" });
    expect(byId["w-osi-range"]).toMatchObject({ triggered: true, effect: "warning" });                 // explicitly configured
    expect(byId["b-d3"]).toMatchObject({ triggered: true, effect: "block-finalization", relation: "at-target" });
    expect(byId["w-d3"]).toMatchObject({ triggered: false });
    expect(report.blockers.map(r => r.ruleId)).toEqual(["r1", "b-d3"]); expect(report.warnings.map(r => r.ruleId)).toEqual(["w-osi-range"]);
    expect(report).toMatchObject({ enabled: true, blockerCount: 2, warningCount: 1, canFinalize: false });
    expect(byId.r1.evidence).toEqual(["q1"]);                                                         // copied from the coverage row
    expect(byId.r1.message).toMatch(/عنونة IPv4/); expect(byId.r1.message).toMatch(/25%/); expect(byId.r1.message).toMatch(/تمنع الاعتماد/); expect(byId.r1.message).toMatch(/أقل من الحد الأدنى/);
  });
  it("the same row may carry a warning and a blocker rule; disabled rule ignored; disabled policy adds nothing but stays visible", () => {
    const { report } = run(netExam(pol(cov([{ id: "r1-warn", enabled: true, source: { kind: "constraint", constraintId: "ipv4" }, relations: ["below-min"], effect: "warning" }, { id: "off", enabled: false, source: { kind: "constraint", constraintId: "ipv4" }, relations: ["below-min"], effect: "block-finalization" }]))));
    expect(report.blockers.map(r => r.ruleId)).toEqual(["r1"]); expect(report.warnings.map(r => r.ruleId)).toEqual(["r1-warn"]);
    expect(report.rules.find(r => r.ruleId === "off")).toMatchObject({ enabled: false, triggered: false });
    const off = run(netExam(pol(cov([]), false)));
    expect(off.report).toMatchObject({ enabled: false, blockerCount: 0, warningCount: 0, canFinalize: true, blockers: [], warnings: [] });
    expect(off.report.rules).toHaveLength(1);                                                        // still listed for the UI, not enforced
    const none = GATES.evaluateAssessmentQualityGates({ coverage: run(netExam(undefined)).coverage, policy: undefined, policyIssues: [] });
    expect(none).toMatchObject({ enabled: false, canFinalize: true, rules: [], blockerCount: 0, warningCount: 0 });
  });
  it("unassessable rows trigger only when configured; a broken enabled rule is a blocking policy issue; a broken disabled rule is visible but not blocking", () => {
    const broken = bpWith(networkingBlueprint, [{ id: "bad", dimension: "topic", ref: "NOPE", metric: "count", unit: "absolute", target: 1 }, { id: "ok", dimension: "topic", ref: "IP_ADDRESSING", metric: "count", unit: "absolute", target: 1 }], undefined,
      pol([{ id: "u", enabled: true, source: { kind: "constraint", constraintId: "bad" }, relations: ["unassessable"], effect: "block-finalization" }, { id: "n", enabled: true, source: { kind: "constraint", constraintId: "bad" }, relations: ["below-target"], effect: "block-finalization" }]));
    const { report } = run(examOf([sec("s1", [q("q1", 1, { primaryTopicId: "IP_ADDRESSING" })])], broken));
    expect(report.rules.find(r => r.ruleId === "u")).toMatchObject({ triggered: true, relation: "unassessable" });
    expect(report.rules.find(r => r.ruleId === "n")).toMatchObject({ triggered: false, relation: "unassessable" });
    expect(report.canFinalize).toBe(false);
    const gone = bpWith(networkingBlueprint, [], undefined, pol([{ id: "g", enabled: true, source: { kind: "constraint", constraintId: "deleted" }, relations: ["below-min"], effect: "warning" }]));
    const r2 = run(examOf([sec("s1", [q("q1", 1)])], gone)).report;
    expect(r2.policyIssues.map(i => i.code)).toEqual(["BROKEN_CONSTRAINT_REF"]); expect(r2.policyBlockers).toHaveLength(1); expect(r2.canFinalize).toBe(false); expect(r2.blockerCount).toBe(1);
    expect(r2.rules[0]).toMatchObject({ ruleId: "g", triggered: false, issues: [expect.objectContaining({ code: "BROKEN_CONSTRAINT_REF" })] });
    const goneOff = bpWith(networkingBlueprint, [], undefined, pol([{ id: "g", enabled: false, source: { kind: "constraint", constraintId: "deleted" }, relations: ["below-min"], effect: "warning" }]));
    const r3 = run(examOf([sec("s1", [q("q1", 1)])], goneOff)).report;
    expect(r3.policyIssues).toHaveLength(1); expect(r3.policyBlockers).toHaveLength(0); expect(r3.canFinalize).toBe(true);
    const malformed = bpWith(networkingBlueprint, [], undefined, { schemaVersion: 9, enabled: true, rules: [] });
    const r4 = run(examOf([sec("s1", [q("q1", 1)])], malformed)).report;
    expect(r4.canFinalize).toBe(false); expect(r4.policyBlockers.map(i => i.code)).toEqual(["UNSUPPORTED_POLICY_SCHEMA"]);
  });
  it("total targets: below / above / at target, unassessable invalid target may block when configured", () => {
    const mk = (targets: Record<string, unknown>, rules: unknown[]) => run(examOf([sec("s1", [q("q1", 4, { primaryTopicId: "IP_ADDRESSING" }), q("q2", 6)])], bpWith(networkingBlueprint, [], targets as never, pol(rules)))).report;
    let r = mk({ totalQuestions: 3, totalMarks: 10 }, [{ id: "tq", enabled: true, source: { kind: "total-questions" }, relations: ["below-target"], effect: "block-finalization" }, { id: "tm", enabled: true, source: { kind: "total-marks" }, relations: ["at-target"], effect: "warning" }]);
    expect(r.rules.find(x => x.ruleId === "tq")).toMatchObject({ triggered: true, relation: "below-target", actual: 2, coverageId: "total-questions" });
    expect(r.rules.find(x => x.ruleId === "tm")).toMatchObject({ triggered: true, relation: "at-target", actual: 10 });
    expect(r.canFinalize).toBe(false); expect(r.warningCount).toBe(1);
    r = mk({ totalQuestions: 1, totalMarks: 4 }, [{ id: "tq", enabled: true, source: { kind: "total-questions" }, relations: ["above-target"], effect: "warning" }, { id: "tm", enabled: true, source: { kind: "total-marks" }, relations: ["below-target"], effect: "block-finalization" }]);
    expect(r.rules.find(x => x.ruleId === "tq")).toMatchObject({ triggered: true, relation: "above-target" }); expect(r.rules.find(x => x.ruleId === "tm")).toMatchObject({ triggered: false, relation: "above-target" }); expect(r.canFinalize).toBe(true);
    r = mk({ totalQuestions: -1 }, [{ id: "tq", enabled: true, source: { kind: "total-questions" }, relations: ["unassessable"], effect: "block-finalization" }]);
    expect(r.rules[0]).toMatchObject({ triggered: true, relation: "unassessable" }); expect(r.canFinalize).toBe(false);
  });
});

describe("F9 — unclassified / unmapped-bank threshold rules use the factual 13C-B fields and the one relation helper", () => {
  const exam = (policy: unknown) => examOf([sec("s1", [q("q1", 5, { primaryTopicId: "IP_ADDRESSING" }), q("q2", 5, undefined, { topic: "VLAN", origin: "bank", bankQuestionId: "B1" }), q("q3", 2, undefined, { topic: "DHCP", origin: "bank", bankQuestionId: "B2" })], { gradingPolicy: "capScore", maxMarks: 6 })], bpWith(networkingBlueprint, [], undefined, policy));
  // unclassified: q2, q3 → count 2, official marks (5+2)×6/12 = 3.5 ; unmapped: q2, q3
  it("count and officialMarks thresholds; max reached is fine, exceeded triggers; evidence order preserved; warning vs blocker", () => {
    const { report } = run(exam(pol([
      { id: "uc0", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "block-finalization" },
      { id: "uc2", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 2, effect: "block-finalization" },
      { id: "ucm", enabled: true, source: { kind: "unclassified" }, metric: "officialMarks", max: 3, effect: "warning" },
      { id: "ub0", enabled: true, source: { kind: "unmapped-bank" }, metric: "count", max: 0, effect: "warning" },
      { id: "ub5", enabled: true, source: { kind: "unmapped-bank" }, metric: "count", max: 5, effect: "block-finalization" }
    ])));
    const byId = Object.fromEntries(report.rules.map(r => [r.ruleId, r]));
    expect(byId.uc0).toMatchObject({ triggered: true, relation: "above-max", actual: 2, evidence: ["q2", "q3"], effect: "block-finalization" });
    expect(byId.uc0.message).toMatch(/2 أسئلة غير مصنفة/); expect(byId.uc0.message).toMatch(/الحد الأقصى المسموح حسب السياسة: 0/);
    expect(byId.uc2).toMatchObject({ triggered: false, relation: "within-range" });
    expect(byId.ucm).toMatchObject({ triggered: true, effect: "warning" }); expect(byId.ucm.actual).toBeCloseTo(3.5, 9);
    expect(byId.ub0).toMatchObject({ triggered: true, effect: "warning", evidence: ["q2", "q3"], actual: 2 });
    expect(byId.ub5).toMatchObject({ triggered: false });
    expect(report.blockers.map(r => r.ruleId)).toEqual(["uc0"]); expect(report.warnings.map(r => r.ruleId)).toEqual(["ucm", "ub0"]);
  });
  it("zero unclassified / unmapped never trigger; nothing is fuzzy-mapped or repaired", () => {
    const clean = examOf([sec("s1", [q("q1", 5, { primaryTopicId: "IP_ADDRESSING" })])], bpWith(networkingBlueprint, [], undefined, pol([{ id: "uc0", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "block-finalization" }, { id: "ub0", enabled: true, source: { kind: "unmapped-bank" }, metric: "count", max: 0, effect: "block-finalization" }])));
    const { report, coverage } = run(clean);
    expect(report.rules.map(r => r.triggered)).toEqual([false, false]); expect(report.canFinalize).toBe(true);
    const lower = examOf([sec("s1", [q("q1", 5, undefined, { topic: "ip_addressing" })])], clean.blueprint!);
    expect(run(lower).report.rules.map(r => r.triggered)).toEqual([true, true]);                 // "ip_addressing" ≠ "IP_ADDRESSING": stays unmapped
    expect(coverage.unclassified.count).toBe(0);
  });
});

describe("architecture: consumes the coverage report only, deterministic, no mutation, no arithmetic of its own", () => {
  it("identical input → identical output; inputs untouched; rules evaluated in policy order; O(r + rows) index (no per-rule row scans) is a structural guard elsewhere", () => {
    const e = netExam(pol(cov([{ id: "uc", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "warning" }])));
    const coverage = evaluateBlueprintCoverage(e); const policy = e.blueprint!.qualityPolicy; const issues = validateAssessmentQualityPolicy(policy, e.blueprint!);
    const before = JSON.stringify({ coverage, policy });
    const a = GATES.evaluateAssessmentQualityGates({ coverage, policy, policyIssues: issues }); const b = GATES.evaluateAssessmentQualityGates({ coverage, policy, policyIssues: issues });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); expect(JSON.stringify({ coverage, policy })).toBe(before);
    expect(a.rules.map(r => r.ruleId)).toEqual(["r1", "uc"]);
    expect(JSON.stringify(a)).not.toMatch(/score|grade|rating|"pass"|"fail"/i);
  });
  it("official marks flow from the coverage row (capScore): a marks gate sees 6-mark official values, never raw q.marks or weight", () => {
    const capped = examOf([sec("s1", [q("q1", 5, { primaryTopicId: "IP_ADDRESSING" }), q("q2", 5, { primaryTopicId: "OSI_TCPIP" })], { gradingPolicy: "capScore", maxMarks: 6 })],
      bpWith(networkingBlueprint, [{ id: "ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "absolute", min: 4 }], undefined, pol(cov([], ["below-min"]))));
    const { report } = run(capped);
    expect(report.rules[0]).toMatchObject({ triggered: true, actual: 3, relation: "below-min" });         // 5 × 6 / 10 = 3 official marks (< 4); raw 5 would not trigger
  });
});

describe("five subjects — the same engine, only Blueprint data differs", () => {
  it("Networking IPv4 minimum block; CS objective warning; Mathematics SOLO relational block; Physics projectile marks-percent block; Chemistry balancing objective warning", () => {
    const net = run(netExam(pol(cov([])))).report; expect(net.blockers.map(r => r.ruleId)).toEqual(["r1"]);
    const cs = run(examOf([sec("s1", [q("q1", 4, { primaryTopicId: "MERGE", objectiveIds: ["o-complexity"] }), q("q2", 4, { primaryTopicId: "TREES" })])],
      bpWith(computerScienceBlueprint, [{ id: "alg-obj", dimension: "objective", ref: "o-complexity", metric: "count", unit: "absolute", min: 2 }], undefined, pol([{ id: "w", enabled: true, source: { kind: "constraint", constraintId: "alg-obj" }, relations: ["below-min"], effect: "warning" }])))).report;
    expect(cs.warnings.map(r => r.ruleId)).toEqual(["w"]); expect(cs.canFinalize).toBe(true); expect(cs.warnings[0].message).toMatch(/يحلل التعقيد الزمني/);
    const math = run(examOf([sec("s1", [q("q1", 6, { primaryTopicId: "LINEAR_EQ", cognitiveLevel: "unistructural" }), q("q2", 4, { primaryTopicId: "PYTHAGORAS", cognitiveLevel: "relational" })])],
      bpWith(mathematicsBlueprint, [{ id: "rel", dimension: "cognitiveLevel", ref: "relational", metric: "count", unit: "percent", target: 60, tolerance: 5 }], undefined, pol([{ id: "b", enabled: true, source: { kind: "constraint", constraintId: "rel" }, relations: ["below-target"], effect: "block-finalization" }])))).report;
    expect(math.blockers.map(r => r.ruleId)).toEqual(["b"]); expect(math.blockers[0].message).toMatch(/علائقي/); expect(math.blockers[0].actual).toBe(50);
    const phys = run(examOf([sec("s1", [q("q1", 2, { primaryTopicId: "PROJECTILE" }), q("q2", 8, { primaryTopicId: "WAVES" })])],
      bpWith(physicsBlueprint, [{ id: "proj", dimension: "topic", ref: "PROJECTILE", metric: "marks", unit: "percent", min: 25 }], undefined, pol([{ id: "b", enabled: true, source: { kind: "constraint", constraintId: "proj" }, relations: ["below-min"], effect: "block-finalization" }])))).report;
    expect(phys.blockers).toHaveLength(1); expect(phys.blockers[0].actual).toBe(20); expect(phys.canFinalize).toBe(false);
    const chem = run(examOf([sec("s1", [q("q1", 3, { primaryTopicId: "REDOX", objectiveIds: ["o-balance"] }), q("q2", 3, { primaryTopicId: "STOICH", objectiveIds: ["o-moles"] })])],
      bpWith(chemistryBlueprint, [{ id: "bal", dimension: "objective", ref: "o-balance", metric: "count", unit: "absolute", target: 2 }, { id: "redox", dimension: "topic", ref: "REDOX", metric: "count", unit: "absolute", min: 1 }], undefined,
        pol([{ id: "w", enabled: true, source: { kind: "constraint", constraintId: "bal" }, relations: ["below-target"], effect: "warning" }, { id: "b", enabled: true, source: { kind: "constraint", constraintId: "redox" }, relations: ["below-min"], effect: "block-finalization" }])))).report;
    expect(chem.warnings.map(r => r.ruleId)).toEqual(["w"]); expect(chem.blockers).toEqual([]); expect(chem.canFinalize).toBe(true);
  });
});
