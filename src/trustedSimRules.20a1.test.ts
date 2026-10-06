import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSmartSimRules, resolveSmartSimRule, isSmartSimRuleId, validateSmartSimRuleCheck, evaluateSmartSimRuleCheck, type SmartSimRuleView } from "./trustedSimRules";

// Phase 20A.1 — the GENERIC TRUSTED RULE library: a SMALL, code-owned, exactly versioned set of universal grading patterns. Each rule has
// a strict parameter validator (with reference checks against the plugin's neutral rule VIEW) and a pure, deterministic evaluator that
// returns FACTS, never marks. No expression language, no eval, no domain science; JSON can never add a rule.
// New-function tests (fail-first on the post-#264 baseline a48d108: the module does not exist).
const here = path.dirname(fileURLToPath(import.meta.url));
const VIEW: SmartSimRuleView = Object.freeze({
  ids: ["a", "b", "c", "dropTime", "impact", "mouth", "esophagus", "stomach"],
  selected: ["b", "c"],
  points: { impact: { x: 3, y: 0.01 } },
  values: { dropTime: 2.03 },
  sequence: ["mouth", "esophagus", "stomach"],
  relations: [{ kind: "connectedTo", from: "a", to: "b" }]
}) as SmartSimRuleView;
const G = { id: "k1", label: "فحص", weight: 1 };
const v = (kind: string, params: Record<string, unknown>) => validateSmartSimRuleCheck({ ...G, kind, ...params }, VIEW);
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const run = (kind: string, params: Record<string, unknown>, view: SmartSimRuleView = VIEW) => {
  const r = validateSmartSimRuleCheck({ ...G, kind, ...params }, view);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return evaluateSmartSimRuleCheck(r.check, view);
};

describe("20A.1-R1 — the rule registry: fixed in code, exactly versioned", () => {
  it("lists exactly seven @1 rules as data; resolves only exact ids", () => {
    const list = listSmartSimRules();
    expect(list.map(r => r.id)).toEqual(["numericNear@1", "objectNotSelected@1", "objectSelected@1", "orderEquals@1", "pointNear@1", "relationExists@1", "setEquals@1"]);
    expect(list.find(r => r.id === "pointNear@1")).toEqual({ id: "pointNear@1", kind: "pointNear", version: 1, params: ["pointId", "expected", "tolerance"] });
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    for (const id of list.map(r => r.id)) expect(resolveSmartSimRule(id), id).toBeDefined();
    for (const id of ["pointNear@2", "pointNear", "pointnear@1", "pointNear@1 ", "perfectScore@1", "eval@1", "__proto__", "constructor@1", "", 1, null]) {
      expect(resolveSmartSimRule(id), String(id)).toBeUndefined();
    }
    expect(isSmartSimRuleId("objectSelected@1")).toBe(true); expect(isSmartSimRuleId("objectSelected@2")).toBe(true); expect(isSmartSimRuleId("pc.address")).toBe(false);
  });
});

describe("20A.1-R2 — strict parameters and references (never an expression)", () => {
  it("valid parameters canonicalize to the generic keys + the rule's params", () => {
    expect(v("objectSelected@1", { objectId: "b" })).toEqual({ ok: true, check: { id: "k1", label: "فحص", weight: 1, kind: "objectSelected@1", objectId: "b" } });
    expect(v("pointNear@1", { pointId: "impact", expected: { x: 3, y: 0 }, tolerance: 0.05 }).ok).toBe(true);
    expect(v("orderEquals@1", { expectedIds: ["mouth", "esophagus", "stomach"] }).ok).toBe(true);
    expect(v("relationExists@1", { relation: "connectedTo", from: "a", to: "b" }).ok).toBe(true);
    expect(v("setEquals@1", { expectedIds: [] }).ok).toBe(true);
  });
  it("refuses unknown rules, missing / extra / mistyped params, non-finite numbers, expressions and dangling references", () => {
    expect(codes(v("perfectScore@1", { value: true }))).toContain("SMARTSIM_RULE_UNKNOWN");
    expect(codes(v("objectSelected@2", { objectId: "b" }))).toContain("SMARTSIM_RULE_UNKNOWN");
    expect(codes(v("objectSelected@1", {}))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("objectSelected@1", { objectId: "b", extra: 1 }))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("objectSelected@1", { objectId: "zz" }))).toContain("SMARTSIM_RULE_REFERENCE_UNKNOWN");
    expect(codes(v("objectSelected@1", { objectId: "__proto__" }))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    for (const p of [{ valueId: "dropTime", expected: "2", tolerance: 0.1 }, { valueId: "dropTime", expected: "x*2", tolerance: 0.1 }, { valueId: "dropTime", expected: NaN, tolerance: 0.1 }, { valueId: "dropTime", expected: 2, tolerance: -1 }, { valueId: "dropTime", expected: 2, tolerance: Infinity }, { valueId: "dropTime", expected: 2, tolerance: 2e6 }, { valueId: "dropTime", expected: 2 }])
      expect(codes(v("numericNear@1", p)), JSON.stringify(p)).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("numericNear@1", { valueId: "nope", expected: 2, tolerance: 0.1 }))).toContain("SMARTSIM_RULE_REFERENCE_UNKNOWN");
    for (const p of [{ pointId: "impact", expected: { x: 3 }, tolerance: 0.1 }, { pointId: "impact", expected: { x: 3, y: 0, w: 1 }, tolerance: 0.1 }, { pointId: "impact", expected: { x: 3, y: 0 }, tolerance: 0 }, { pointId: "impact", expected: [3, 0], tolerance: 0.1 }])
      expect(codes(v("pointNear@1", p)), JSON.stringify(p)).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("orderEquals@1", { expectedIds: [] }))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("orderEquals@1", { expectedIds: ["mouth", "mouth"] }))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("setEquals@1", { expectedIds: ["a", "zz"] }))).toContain("SMARTSIM_RULE_REFERENCE_UNKNOWN");
    expect(codes(v("setEquals@1", { expectedIds: Array.from({ length: 501 }, (_, i) => "a" + i) }))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(v("relationExists@1", { relation: "tangent", from: "a", to: "b" }))).toContain("SMARTSIM_RULE_PARAMS_INVALID");
    expect(codes(validateSmartSimRuleCheck({ ...G, kind: "objectSelected@1", objectId: "b" }, undefined as never))).toContain("SMARTSIM_RULE_VIEW_INVALID");
  });
});

describe("20A.1-R3 — pure evaluators return FACTS (expected / actual / passed / evidence), never marks", () => {
  it("objectSelected / objectNotSelected / setEquals (order-insensitive) / orderEquals (order-sensitive)", () => {
    expect(run("objectSelected@1", { objectId: "b" })).toMatchObject({ passed: true, expected: "selected", actual: "selected" });
    expect(run("objectSelected@1", { objectId: "a" })).toMatchObject({ passed: false, actual: "not selected" });
    expect(run("objectNotSelected@1", { objectId: "a" }).passed).toBe(true);
    expect(run("objectNotSelected@1", { objectId: "b" }).passed).toBe(false);
    expect(run("setEquals@1", { expectedIds: ["c", "b"] })).toMatchObject({ passed: true, expected: "b, c", actual: "b, c" });
    expect(run("setEquals@1", { expectedIds: ["b"] }).passed).toBe(false);
    expect(run("orderEquals@1", { expectedIds: ["mouth", "esophagus", "stomach"] }).passed).toBe(true);
    expect(run("orderEquals@1", { expectedIds: ["esophagus", "mouth", "stomach"] }).passed).toBe(false);
    expect(run("relationExists@1", { relation: "connectedTo", from: "a", to: "b" }).passed).toBe(true);
    expect(run("relationExists@1", { relation: "connectedTo", from: "b", to: "a" }).passed).toBe(false);
    expect(run("relationExists@1", { relation: "contains", from: "a", to: "b" }).passed).toBe(false);
  });
  it("numericNear / pointNear (2D and 3D) use an inclusive tolerance; a missing answer or a dimension mismatch fails", () => {
    expect(run("numericNear@1", { valueId: "dropTime", expected: 2.02, tolerance: 0.05 })).toMatchObject({ passed: true, actual: "2.03" });
    expect(run("numericNear@1", { valueId: "dropTime", expected: 2.5, tolerance: 0.05 }).passed).toBe(false);
    expect(run("numericNear@1", { valueId: "dropTime", expected: 2.03, tolerance: 0 }).passed).toBe(true);
    expect(run("numericNear@1", { valueId: "c", expected: 1, tolerance: 1 })).toMatchObject({ passed: false, actual: "—" });
    expect(run("pointNear@1", { pointId: "impact", expected: { x: 3, y: 0 }, tolerance: 0.02 }).passed).toBe(true);
    expect(run("pointNear@1", { pointId: "impact", expected: { x: 3.1, y: 0 }, tolerance: 0.05 }).passed).toBe(false);
    expect(run("pointNear@1", { pointId: "impact", expected: { x: 3, y: 0, z: 0 }, tolerance: 1 }).passed).toBe(false);
    const v3 = { ...VIEW, points: { impact: { x: 1, y: 2, z: 2 } } } as SmartSimRuleView;
    expect(run("pointNear@1", { pointId: "impact", expected: { x: 1, y: 2, z: 2.04 }, tolerance: 0.05 }, v3).passed).toBe(true);
    expect(run("pointNear@1", { pointId: "a", expected: { x: 0, y: 0 }, tolerance: 1 })).toMatchObject({ passed: false, actual: "—" });
  });
  it("deterministic and pure: frozen inputs are never mutated; equal inputs give equal facts", () => {
    const frozenView = JSON.parse(JSON.stringify(VIEW));
    const deepFreeze = (o: unknown): unknown => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
    deepFreeze(frozenView);
    const a = run("setEquals@1", { expectedIds: ["b", "c"] }, frozenView), b = run("setEquals@1", { expectedIds: ["b", "c"] }, frozenView);
    expect(a).toEqual(b);
    expect(frozenView).toEqual(VIEW);
  });
  it("the rule module holds no expression language, no dynamic code and no domain science", () => {
    const code = fs.readFileSync(path.join(here, "trustedSimRules.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/eval\(|new Function|Function\(|import\(|require\(|fetch\(|Math\.random|Date\.now/);
    expect(code).not.toMatch(/\b(router|gravity|newton|atom|valence|organ|liver|terrain|watershed|asymptote)\b/i);
  });
});
