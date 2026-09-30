import { describe, it, expect } from "vitest";
import * as QP from "./assessmentQualityPolicy";
import { networkingBlueprint, computerScienceBlueprint, mathematicsBlueprint, physicsBlueprint, chemistryBlueprint } from "./assessmentBlueprintFixtures";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";

// Phase 13C-C — F1 (versioned policy model) / F2 (policy validator) / F9 (unclassified + unmapped rules) / helpers. Fail-first on bd10c72.
const codes = (issues: { code: string }[]) => issues.map(i => i.code);
const bpWith = (bp: AssessmentBlueprintV1, constraints: AssessmentBlueprintV1["constraints"], targets?: AssessmentBlueprintV1["targets"]): AssessmentBlueprintV1 => ({ ...bp, constraints, ...(targets ? { targets } : {}) });
const NET = bpWith(networkingBlueprint, [{ id: "topic-ipv4", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", min: 30, target: 40 }, { id: "d3", dimension: "difficulty", ref: "3", metric: "count", unit: "absolute", max: 5 }], { totalQuestions: 20, totalMarks: 100 });
const rule = (over: Record<string, unknown>) => ({ id: "gate-topic-ipv4", enabled: true, source: { kind: "constraint", constraintId: "topic-ipv4" }, relations: ["below-min", "below-target"], effect: "block-finalization", ...over });
const policy = (rules: unknown[], over: Record<string, unknown> = {}) => ({ schemaVersion: 1, enabled: true, rules, ...over });

describe("F1 — versioned policy model", () => {
  it("emptyQualityPolicy() is schemaVersion 1, enabled false, no rules; rule ids are fresh and stable-looking", () => {
    expect(QP.emptyQualityPolicy()).toEqual({ schemaVersion: 1, enabled: false, rules: [] });
    expect(QP.ASSESSMENT_QUALITY_POLICY_SCHEMA_VERSION).toBe(1);
    const a = QP.newQualityRuleId(), b = QP.newQualityRuleId();
    expect(a).not.toBe(b); expect(a).toMatch(/^qr/);
  });
  it("the model carries no score / grade / rating vocabulary and supports exactly two effects", () => {
    expect([...QP.QUALITY_EFFECTS]).toEqual(["warning", "block-finalization"]);
    expect(JSON.stringify(QP.emptyQualityPolicy())).not.toMatch(/score|grade|rating|rank/i);
  });
});

describe("F2 — pure policy validator (stable ids are authority, labels are display only)", () => {
  it("valid: empty policy, disabled policy, a complete coverage rule, total rules with configured targets, unclassified / unmapped threshold rules", () => {
    expect(QP.validateAssessmentQualityPolicy(QP.emptyQualityPolicy(), NET)).toEqual([]);
    expect(QP.validateAssessmentQualityPolicy(policy([rule({})], { enabled: false }), NET)).toEqual([]);
    expect(QP.validateAssessmentQualityPolicy(policy([rule({})]), NET)).toEqual([]);
    expect(QP.validateAssessmentQualityPolicy(policy([
      { id: "tq", enabled: true, source: { kind: "total-questions" }, relations: ["below-target"], effect: "warning" },
      { id: "tm", enabled: true, source: { kind: "total-marks" }, relations: ["above-target", "below-target"], effect: "block-finalization", note: "ملاحظة" },
      { id: "uc", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "block-finalization" },
      { id: "ucm", enabled: true, source: { kind: "unclassified" }, metric: "officialMarks", max: 2.5, effect: "warning" },
      { id: "ub", enabled: false, source: { kind: "unmapped-bank" }, metric: "count", max: 3, effect: "warning" }
    ]), NET)).toEqual([]);
  });
  it("structural policy problems: unsupported schema, non-object, malformed enabled flag, non-array rules", () => {
    expect(codes(QP.validateAssessmentQualityPolicy({ schemaVersion: 2, enabled: true, rules: [] }, NET))).toEqual(["UNSUPPORTED_POLICY_SCHEMA"]);
    expect(codes(QP.validateAssessmentQualityPolicy("x", NET))).toEqual(["INVALID_POLICY"]);
    expect(codes(QP.validateAssessmentQualityPolicy(policy([], { enabled: "yes" }), NET))).toContain("INVALID_ENABLED");
    expect(codes(QP.validateAssessmentQualityPolicy(policy("nope" as never), NET))).toContain("INVALID_RULES");
  });
  it("rule problems: empty / missing id, duplicate id, malformed enabled, malformed / unsupported source, broken constraint ref, missing total target", () => {
    expect(QP.validateAssessmentQualityPolicy(policy([rule({ id: "" })]), NET)).toContainEqual(expect.objectContaining({ code: "MISSING_RULE_ID", path: "rules[0].id" }));
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({}), rule({})]), NET))).toContain("DUPLICATE_RULE_ID");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ enabled: "on" })]), NET))).toContain("INVALID_RULE_ENABLED");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ source: "constraint" })]), NET))).toContain("INVALID_SOURCE");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ source: { kind: "vibes" } })]), NET))).toContain("UNSUPPORTED_SOURCE_KIND");
    expect(QP.validateAssessmentQualityPolicy(policy([rule({ source: { kind: "constraint", constraintId: "gone" } })]), NET)).toContainEqual(expect.objectContaining({ code: "BROKEN_CONSTRAINT_REF", ruleId: "gate-topic-ipv4" }));
    const noTargets = { ...NET, targets: undefined };
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "tq", enabled: true, source: { kind: "total-questions" }, relations: ["below-target"], effect: "warning" }]), noTargets))).toContain("MISSING_TOTAL_TARGET");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "tm", enabled: true, source: { kind: "total-marks" }, relations: ["below-target"], effect: "warning" }]), { ...NET, targets: { totalQuestions: 20 } }))).toContain("MISSING_TOTAL_TARGET");
    expect(codes(QP.validateAssessmentQualityPolicy(policy(["not-an-object"]), NET))).toContain("INVALID_RULE");
  });
  it("relation / effect / threshold problems: empty relations, unknown relation, invalid effect, invalid metric, invalid or negative threshold, invalid note", () => {
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ relations: [] })]), NET))).toContain("EMPTY_RELATIONS");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ relations: "below-min" })]), NET))).toContain("INVALID_RELATIONS");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ relations: ["below-min", "kinda-low"] })]), NET))).toContain("UNKNOWN_RELATION");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ effect: "shame" })]), NET))).toContain("INVALID_EFFECT");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "uc", enabled: true, source: { kind: "unclassified" }, metric: "weight", max: 0, effect: "warning" }]), NET))).toContain("INVALID_METRIC");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "ub", enabled: true, source: { kind: "unmapped-bank" }, metric: "officialMarks", max: 0, effect: "warning" }]), NET))).toContain("INVALID_METRIC");   // unmapped is count-only
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "uc", enabled: true, source: { kind: "unclassified" }, metric: "count", max: -1, effect: "warning" }]), NET))).toContain("INVALID_THRESHOLD");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "uc", enabled: true, source: { kind: "unclassified" }, metric: "count", max: "0", effect: "warning" }]), NET))).toContain("INVALID_THRESHOLD");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([{ id: "uc", enabled: true, source: { kind: "unclassified" }, metric: "count", effect: "warning" }]), NET))).toContain("INVALID_THRESHOLD");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ note: 5 })]), NET))).toContain("INVALID_NOTE");
    expect(codes(QP.validateAssessmentQualityPolicy(policy([rule({ relations: ["below-min"], metric: "count", max: 3 })]), NET))).toEqual([]);      // extra threshold fields on a coverage rule are ignored, not errors
  });
  it("deleting the referenced constraint breaks the rule (never auto-deleted); renaming a topic / objective label changes nothing", () => {
    const withRule = { ...NET, qualityPolicy: policy([rule({})]) } as AssessmentBlueprintV1;
    const deleted = { ...withRule, constraints: withRule.constraints.filter(c => c.id !== "topic-ipv4") };
    expect(deleted.qualityPolicy!.rules).toHaveLength(1);
    expect(codes(QP.validateAssessmentQualityPolicy(deleted.qualityPolicy, deleted))).toEqual(["BROKEN_CONSTRAINT_REF"]);
    const renamed = { ...withRule, topics: withRule.topics.map(t => (t.id === "IP_ADDRESSING" ? { ...t, label: "عنونة الإنترنت الإصدار الرابع" } : t)), constraints: withRule.constraints.map(c => ({ ...c })) };
    expect(QP.validateAssessmentQualityPolicy(renamed.qualityPolicy, renamed)).toEqual([]);
  });
  it("the five subject fixtures each accept a policy on their own constraints with zero issues (no subject branch)", () => {
    const cs = bpWith(computerScienceBlueprint, [{ id: "obj-alg", dimension: "objective", ref: "o-complexity", metric: "count", unit: "absolute", min: 2 }]);
    const math = bpWith(mathematicsBlueprint, [{ id: "solo-rel", dimension: "cognitiveLevel", ref: "relational", metric: "count", unit: "percent", target: 40, tolerance: 10 }]);
    const phys = bpWith(physicsBlueprint, [{ id: "proj", dimension: "topic", ref: "PROJECTILE", metric: "marks", unit: "percent", min: 25 }]);
    const chem = bpWith(chemistryBlueprint, [{ id: "redox", dimension: "topic", ref: "REDOX", metric: "count", unit: "absolute", min: 1 }, { id: "bal", dimension: "objective", ref: "o-balance", metric: "count", unit: "absolute", target: 2 }]);
    for (const [bp, cid] of [[cs, "obj-alg"], [math, "solo-rel"], [phys, "proj"], [chem, "bal"]] as const) {
      expect(QP.validateAssessmentQualityPolicy(policy([rule({ id: "r-" + cid, source: { kind: "constraint", constraintId: cid } })]), bp), cid).toEqual([]);
    }
  });
});

describe("pure helpers — policy edits are id-based, immutable and reference-stable on no-op", () => {
  it("add / update / remove / enable; unchanged results return the same blueprint reference; broken refs are kept for validation", () => {
    const bp = NET;
    const r = rule({});
    const added = QP.addQualityRule(bp, r as never);
    expect(added.qualityPolicy).toEqual({ schemaVersion: 1, enabled: false, rules: [r] });
    expect(bp.qualityPolicy).toBeUndefined();                                                     // input untouched
    const enabled = QP.setQualityPolicyEnabled(added, true);
    expect(enabled.qualityPolicy!.enabled).toBe(true);
    expect(QP.setQualityPolicyEnabled(enabled, true)).toBe(enabled);                                // no-op → same reference
    const updated = QP.updateQualityRule(enabled, "gate-topic-ipv4", { effect: "warning" });
    expect(updated.qualityPolicy!.rules[0]).toMatchObject({ effect: "warning", relations: ["below-min", "below-target"] });
    expect(QP.updateQualityRule(updated, "gate-topic-ipv4", { effect: "warning" })).toBe(updated);
    expect(QP.updateQualityRule(updated, "missing", { effect: "warning" })).toBe(updated);
    const removed = QP.removeQualityRule(updated, "gate-topic-ipv4");
    expect(removed.qualityPolicy!.rules).toEqual([]);
    expect(QP.removeQualityRule(removed, "gate-topic-ipv4")).toBe(removed);
    const withoutConstraint = { ...updated, constraints: [] };
    expect(withoutConstraint.qualityPolicy!.rules).toHaveLength(1);                                // helpers never prune rules for a vanished constraint
    expect(QP.withQualityPolicy(bp, p => p)).toBe(bp);
  });
});
