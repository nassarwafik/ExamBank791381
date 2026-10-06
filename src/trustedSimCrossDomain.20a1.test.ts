import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerSmartSimPlugin } from "./trustedSimRegistry";
import { registerSmartSimAsset } from "./trustedSimAssets";
import { validateSmartSimEnvelope, validateSmartSimQuestion, evaluateSmartSim, bindSmartSimAnswerToQuestion, projectSmartSimForStudent } from "./trustedSimPlugins";
import { resolveSmartSimUi } from "./trustedSim/smartSimUiRegistry";
import * as universal from "./trustedSimSemanticActions";
import {
  createUniversalTestPlugin, CROSS_DOMAIN_FIXTURES, TEST_ASSETS, SELECTION_SPEC, SELECTION_CONFIG, ANATOMY_3D_SPEC, ANATOMY_3D_CONFIG, FREE_FALL_SPEC, FREE_FALL_CONFIG,
  SURFACE_3D_SPEC, SURFACE_3D_CONFIG, PERIODIC_TABLE_SPEC, PERIODIC_TABLE_CONFIG, TERRAIN_SPEC, TERRAIN_CONFIG, EQUATION_SPEC, EQUATION_CONFIG, type UniversalTestPluginSpec
} from "./trustedSimUniversalFixtures";

// Phase 20A.1 — CROSS-DOMAIN proofs through the SAME smartSim@1 authority (envelope → strict config → semantic actions → replay →
// canonical state → typed checks incl. opt-in generic rules → weighted score). TEST-ONLY plugins built from the universal helpers
// stand in for future physics / mathematics 3D / chemistry / biology 3D / geography simulators: none is a production plugin, none
// needs a core change. Presentation (camera) never reaches grading; forged client state never earns marks; unknown rules fail closed.
// New-function tests (fail-first on the post-#264 baseline a48d108: the modules do not exist).
const here = path.dirname(fileURLToPath(import.meta.url));
const undo: (() => void)[] = [];
afterEach(() => { while (undo.length) undo.pop()!(); });
const use = (spec: UniversalTestPluginSpec) => { undo.push(registerSmartSimPlugin(createUniversalTestPlugin(universal, spec))); };
const assets = () => { for (const a of TEST_ASSETS) undo.push(registerSmartSimAsset(a)); };
const env = (spec: UniversalTestPluginSpec, config: unknown) => ({ schemaVersion: 1, pluginKey: spec.key, pluginVersion: spec.version ?? 1, config });
const question = (spec: UniversalTestPluginSpec, config: unknown, checks: unknown[], scoring = "proportional") => ({ examQuestionId: "q1", presentationType: "smartSim", questionTypeVersion: 1, marks: 10, smartSim: env(spec, config), answer: { scoring, checks } });
const ans = (spec: UniversalTestPluginSpec, actions: unknown[], state: unknown = {}) => ({ kind: "smartSim", pluginKey: spec.key, pluginVersion: spec.version ?? 1, actions, state });
const grade = (q: ReturnType<typeof question>, response: unknown) => evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response, maxMarks: q.marks });
const ck = (id: string, kind: string, params: Record<string, unknown>, weight = 1) => ({ id, label: "فحص " + id, weight, kind, ...params });
const codes = (issues: { code: string }[]) => issues.map(i => i.code);

describe("20A.1-X1 — the end-to-end proof: JSON → action → replay → canonical state → generic rule → score", () => {
  const CHECKS = [ck("sel-b", "objectSelected@1", { objectId: "b" }, 2), ck("not-a", "objectNotSelected@1", { objectId: "a" }), ck("only-b", "setEquals@1", { expectedIds: ["b"] }), ck("one", "selection.count", { count: 1 })];
  it("a valid question finalizes; selecting B earns full marks; a partial answer earns weighted partial credit", () => {
    use(SELECTION_SPEC);
    const q = question(SELECTION_SPEC, SELECTION_CONFIG, CHECKS);
    expect(validateSmartSimQuestion(q)).toEqual([]);
    expect(grade(q, ans(SELECTION_SPEC, [{ type: "object.select", objectId: "b" }]))).toMatchObject({ valid: true, score: 10, correct: true, totalWeight: 5, passedWeight: 5 });
    const partial = grade(q, ans(SELECTION_SPEC, [{ type: "object.select", objectId: "a" }, { type: "object.select", objectId: "b" }]));
    expect(partial).toMatchObject({ valid: true, score: 4, passedWeight: 2, totalWeight: 5, correct: false });   // {a, b} selected: only sel-b (weight 2 of 5)
    expect(partial.checks.map(c => [c.id, c.passed, c.points])).toEqual([["sel-b", true, 4], ["not-a", false, 0], ["only-b", false, 0], ["one", false, 0]]);
  });
  it("the server derives the state: a forged perfect state with no actions earns 0; ingest binding replaces the claimed state", () => {
    use(SELECTION_SPEC);
    const q = question(SELECTION_SPEC, SELECTION_CONFIG, CHECKS);
    const forged = { v: 1, selected: ["b"], points: {}, values: {}, sequence: [] };
    // a forged state earns NOTHING beyond the initial state (only "A not selected" holds initially: 1 of 5 weight)
    const initial = grade(q, ans(SELECTION_SPEC, [])).score;
    expect(initial).toBe(2);
    expect(grade(q, ans(SELECTION_SPEC, [], forged))).toMatchObject({ score: initial, passedWeight: 1 });
    const bound = bindSmartSimAnswerToQuestion(ans(SELECTION_SPEC, [{ type: "object.select", objectId: "c" }], forged), q);
    expect(bound).toEqual({ ok: true, answer: { kind: "smartSim", pluginKey: "testSelection", pluginVersion: 1, actions: [{ type: "object.select", objectId: "c" }], state: { v: 1, selected: ["c"], points: {}, values: {}, sequence: [] } } });
  });
  it("camera / gestures never reach grading: presentation actions are refused; two cameras grade identically", () => {
    use(SURFACE_3D_SPEC);
    const checks = [ck("crit", "pointNear@1", { pointId: "critical1", expected: { x: 0, y: 0, z: 1 }, tolerance: 0.05 })];
    const place = { type: "point.place", pointId: "critical1", position: { x: 0, y: 0.01, z: 1 } };
    const qa = question(SURFACE_3D_SPEC, SURFACE_3D_CONFIG, checks);
    const qb = question(SURFACE_3D_SPEC, { ...SURFACE_3D_CONFIG, scene: { ...SURFACE_3D_CONFIG.scene, camera: { position: { x: -9, y: 2, z: -4 }, target: { x: 1, y: 1, z: 1 }, fov: 90 } } }, checks);
    expect(grade(qa, ans(SURFACE_3D_SPEC, [place])).score).toBe(10);
    expect(grade(qb, ans(SURFACE_3D_SPEC, [place])).score).toBe(10);
    for (const gesture of [{ type: "camera.rotate", x: 30, y: 10 }, { type: "camera.zoom", factor: 2 }, { type: "pointer.down", screenX: 10, screenY: 20 }]) {
      expect(bindSmartSimAnswerToQuestion(ans(SURFACE_3D_SPEC, [gesture, place]), qa), gesture.type).toEqual({ ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" });
      expect(grade(qa, ans(SURFACE_3D_SPEC, [gesture, place])).score, gesture.type).toBe(0);
    }
  });
  it("JSON never grants grading authority: unknown / unversioned / future / non-opted-in rules fail closed (manual review)", () => {
    use(SELECTION_SPEC);
    for (const bad of [ck("x", "perfectScore", { value: true }), ck("x", "perfectScore@1", { value: true }), ck("x", "objectSelected", { objectId: "b" }), ck("x", "objectSelected@2", { objectId: "b" }), ck("x", "pointNear@1", { pointId: "b", expected: { x: 0, y: 0 }, tolerance: 1 })]) {
      const q = question(SELECTION_SPEC, SELECTION_CONFIG, [...CHECKS, bad]);
      expect(codes(validateSmartSimQuestion(q)), bad.kind).toContain("SMARTSIM_CHECK_KIND_UNKNOWN");
      expect(grade(q, ans(SELECTION_SPEC, [{ type: "object.select", objectId: "b" }])), bad.kind).toMatchObject({ valid: false, score: 0, manualReview: true });
    }
    const dangling = question(SELECTION_SPEC, SELECTION_CONFIG, [ck("x", "objectSelected@1", { objectId: "zz" })]);
    expect(codes(validateSmartSimQuestion(dangling))).toContain("SMARTSIM_RULE_REFERENCE_UNKNOWN");
  });
  it("exact plugin version: a registered v2 never grades a v1 question, and v1 keeps its semantics", () => {
    use(SELECTION_SPEC); use({ ...SELECTION_SPEC, version: 2, label: "اختيار v2", genericRules: ["objectSelected@1"] });
    const q = question(SELECTION_SPEC, SELECTION_CONFIG, CHECKS);
    expect(grade(q, ans(SELECTION_SPEC, [{ type: "object.select", objectId: "b" }])).score).toBe(10);
    expect(grade(q, ans({ ...SELECTION_SPEC, version: 2 }, [{ type: "object.select", objectId: "b" }])).score).toBe(0);    // a v2 answer never binds to v1
  });
});

describe("20A.1-X2 — future subjects fit the SAME architecture (test-only fixtures, no core change)", () => {
  it.each(CROSS_DOMAIN_FIXTURES.map(f => [f.name, f] as const))("%s: the envelope validates, the projection is the canonical public config, undeclared capabilities fail", (_name, f) => {
    assets(); use(f.spec);
    const e = env(f.spec, f.config);
    const r = validateSmartSimEnvelope(e);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(projectSmartSimForStudent(e)).toBeDefined();
    const undeclared = f.spec.sceneKinds.includes("3d") ? "measure.angle" : "camera.rotate";
    const bad = validateSmartSimEnvelope(env(f.spec, { ...f.config, requiredCapabilities: [...((f.config as { requiredCapabilities?: string[] }).requiredCapabilities ?? []), undeclared] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(codes(bad.issues)).toContain("SMARTSIM_CAPABILITY_UNDECLARED");
    expect(resolveSmartSimUi(f.spec.key, 1)).toBeUndefined();                                                 // no UI is registered for a test plugin: the host shows "unavailable"
  });
  it("physics / free fall: a value and a placed point are graded with numericNear@1 / pointNear@1 — no Newtonian equation in the core", () => {
    use(FREE_FALL_SPEC);
    const q = question(FREE_FALL_SPEC, FREE_FALL_CONFIG, [ck("t", "numericNear@1", { valueId: "dropTime", expected: 2.02, tolerance: 0.05 }, 2), ck("p", "pointNear@1", { pointId: "impact", expected: { x: 0, y: 0 }, tolerance: 0.1 })]);
    expect(validateSmartSimQuestion(q)).toEqual([]);
    expect(grade(q, ans(FREE_FALL_SPEC, [{ type: "value.set", valueId: "dropTime", value: 2 }, { type: "point.place", pointId: "impact", position: { x: 0.05, y: 0 } }])).score).toBe(10);
    expect(grade(q, ans(FREE_FALL_SPEC, [{ type: "value.set", valueId: "dropTime", value: 3 }])).score).toBeCloseTo(0, 10);
  });
  it("chemistry: periodic-table selection by stable element symbols (setEquals@1); equation coefficients as semantic values (numericNear@1)", () => {
    use(PERIODIC_TABLE_SPEC); use(EQUATION_SPEC);
    const pt = question(PERIODIC_TABLE_SPEC, PERIODIC_TABLE_CONFIG, [ck("alkali", "setEquals@1", { expectedIds: ["Li", "Na", "K"] })]);
    expect(grade(pt, ans(PERIODIC_TABLE_SPEC, ["K", "Li", "Na"].map(id => ({ type: "object.select", objectId: id })))).score).toBe(10);
    expect(grade(pt, ans(PERIODIC_TABLE_SPEC, ["K", "Li", "H"].map(id => ({ type: "object.select", objectId: id })))).score).toBe(0);
    const eq = question(EQUATION_SPEC, EQUATION_CONFIG, [ck("h2", "numericNear@1", { valueId: "h2", expected: 2, tolerance: 0 }), ck("o2", "numericNear@1", { valueId: "o2", expected: 1, tolerance: 0 }), ck("h2o", "numericNear@1", { valueId: "h2o", expected: 2, tolerance: 0 })]);
    expect(grade(eq, ans(EQUATION_SPEC, [{ type: "value.set", valueId: "h2", value: 2 }, { type: "value.set", valueId: "o2", value: 1 }, { type: "value.set", valueId: "h2o", value: 2 }])).score).toBe(10);
  });
  it("biology 3D: the organ's SEMANTIC id is the authority over a trusted mesh; the canonical state is tiny and asset-free", () => {
    assets(); use(ANATOMY_3D_SPEC);
    const q = question(ANATOMY_3D_SPEC, ANATOMY_3D_CONFIG, [ck("liver", "objectSelected@1", { objectId: "liver" }), ck("not-heart", "objectNotSelected@1", { objectId: "heart" })]);
    expect(validateSmartSimQuestion(q)).toEqual([]);
    const r = evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: ans(ANATOMY_3D_SPEC, [{ type: "object.select", objectId: "liver" }]), maxMarks: 10 }, { withDetails: true });
    expect(r.score).toBe(10);
    expect(r.state).toEqual({ v: 1, selected: ["liver"], points: {}, values: {}, sequence: [] });             // no mesh, no asset, no camera, no triangle ids
    const unknownAsset = { ...ANATOMY_3D_CONFIG, scene: { ...ANATOMY_3D_CONFIG.scene, objects: ANATOMY_3D_CONFIG.scene.objects.map(o => (o.id === "body" ? { ...o, asset: { assetKey: "human-body", assetVersion: 2 } } : o)) } };
    const bad = validateSmartSimEnvelope(env(ANATOMY_3D_SPEC, unknownAsset));
    expect(bad.ok).toBe(false); if (!bad.ok) expect(codes(bad.issues)).toContain("SMARTSIM_ASSET_UNKNOWN");
  });
  it("geography 3D terrain: a placed summit marker is graded by pointNear@1 in 3D; terrain triangles / pixels are never answers", () => {
    assets(); use(TERRAIN_SPEC);
    const q = question(TERRAIN_SPEC, TERRAIN_CONFIG, [ck("summit", "pointNear@1", { pointId: "summit", expected: { x: 0.41, y: 0.62, z: 1208 }, tolerance: 5 })]);
    expect(grade(q, ans(TERRAIN_SPEC, [{ type: "point.place", pointId: "summit", position: { x: 0.41, y: 0.62, z: 1205 } }])).score).toBe(10);
    expect(bindSmartSimAnswerToQuestion(ans(TERRAIN_SPEC, [{ type: "point.place", pointId: "summit", position: { x: 0.41, y: 0.62, z: 1205 }, triangleId: 99812 }]), q)).toEqual({ ok: false, code: "SMARTSIM_ACTION_INVALID" });
  });
  it("the fixtures module is TEST-ONLY: no application module imports it", () => {
    const files: string[] = [];
    const scan = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) scan(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) && e.name !== "trustedSimUniversalFixtures.ts") files.push(p); } };
    scan(here);
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/trustedSimUniversalFixtures/);
  });
});
