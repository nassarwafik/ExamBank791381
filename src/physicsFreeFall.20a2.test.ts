import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FREE_FALL_PLUGIN_KEY, FREE_FALL_PLUGIN_VERSION, FREE_FALL_LIMITS, validateFreeFallConfig, heightAt, velocityAt, impactTime, impactSpeed, sampleTrajectory
} from "./physicsFreeFallModel";
import {
  FREE_FALL_ACTION_KINDS, FREE_FALL_CHECK_KINDS, PHYSICS_FREE_FALL_DESCRIPTOR_V1, physicsFreeFallPluginV1, normalizeFreeFallAction, replayFreeFall
} from "./physicsFreeFallPlugin";
import { resolveSmartSimPlugin, resolveSmartSimDescriptor, validateSmartSimQuestion, evaluateSmartSim, bindSmartSimAnswerToQuestion, projectSmartSimForStudent } from "./trustedSimPlugins";
import { freeFallClassroomConfig, freeFallClassroomChecks } from "./physicsFreeFall/freeFallTemplates";

// Phase 20A.2 — physicsFreeFall@1, the first PHYSICS production SmartSim plugin: a strict, bounded SI config (vertical 1D free fall,
// y = 0 is the ground, +y is up), a pure deterministic physics engine (no clock, randomness or DOM), SEMANTIC academic actions only
// (measurement / graph-point submissions — never play / pause / scrub / frames), a tiny canonical state rebuilt by replay, plugin-owned
// physics checks derived from the trusted public model, opt-in generic rules (numericNear@1 / pointNear@1), weighted partial credit.
// Certification pins are INDEPENDENT literals computed from y(t) = h0 + v0·t − ½gt² (never copied from the implementation).
// New-function tests (fail-first on the post-#265 baseline 44d0f21).
const here = path.dirname(fileURLToPath(import.meta.url));
const T_IMPACT_20M = 2.020305089104421;          // sqrt(2·20/9.8)
const V_IMPACT_20M = 19.79898987322333;          // sqrt(2·9.8·20)
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const cfg = (over: Record<string, unknown> = {}) => ({ ...freeFallClassroomConfig(), ...over });
const model = (h0: number, v0: number, g: number) => ({ initialHeight: h0, initialVelocity: v0, gravity: g });
const env = (config: unknown = freeFallClassroomConfig()) => ({ schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config });
const question = (checks: unknown[] = freeFallClassroomChecks(), scoring = "proportional", config: unknown = freeFallClassroomConfig()) => ({ examQuestionId: "ff", presentationType: "smartSim", questionTypeVersion: 1, text: "سقوط حر", marks: 12, smartSim: env(config), answer: { scoring, checks } });
const ans = (actions: unknown[], state: unknown = {}) => ({ kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions, state });
const grade = (q: ReturnType<typeof question>, actions: unknown[], state: unknown = {}) => evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: ans(actions, state), maxMarks: q.marks });
const set = (measurementId: string, value: number) => ({ type: "measurement.set", measurementId, value });
const point = (pointId: string, t: number, y: number) => ({ type: "graphPoint.set", pointId, t, y });
const PERFECT = [set("impactTime", 2.02), set("impactSpeed", 19.8), set("heightAt1s", 15.1), set("velocityAt1s", -9.8), point("impactPoint", 2.02, 0), point("pointAt1s", 1, 15.1)];

describe("F1–F3 — strict, bounded, exact-version configuration", () => {
  it("F1 the classroom preset validates and canonicalizes; unknown keys / nested objects / versions are refused", () => {
    expect(FREE_FALL_PLUGIN_KEY).toBe("physicsFreeFall"); expect(FREE_FALL_PLUGIN_VERSION).toBe(1);
    const r = validateFreeFallConfig(freeFallClassroomConfig());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.config.model).toEqual(model(20, 0, 9.8)); expect(validateFreeFallConfig(r.config)).toEqual(r); }
    expect(codes(validateFreeFallConfig({ ...freeFallClassroomConfig(), extra: 1 }))).toContain("FREEFALL_CONFIG_UNKNOWN_KEY");
    expect(codes(validateFreeFallConfig({ ...freeFallClassroomConfig(), v: 2 }))).toContain("FREEFALL_CONFIG_VERSION_UNSUPPORTED");
    expect(codes(validateFreeFallConfig(cfg({ model: { ...model(20, 0, 9.8), mass: 1 } })))).toContain("FREEFALL_MODEL_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ model: { ...model(20, 0, 9.8), gravity: { value: 9.8 } } })))).toContain("FREEFALL_MODEL_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ view: { maxTime: 3, showVelocityGraph: true, component: "X" } })))).toContain("FREEFALL_VIEW_INVALID");
    expect(codes(validateFreeFallConfig(null))).toContain("FREEFALL_CONFIG_INVALID");
    for (const k of ["rules", "answer", "checks", "expected", "module", "renderer"]) expect(codes(validateFreeFallConfig({ ...freeFallClassroomConfig(), [k]: "x" })), k).toContain("FREEFALL_CONFIG_UNKNOWN_KEY");
  });
  it("F2 finite, bounded inputs: NaN / Infinity / zero or negative gravity / negative height / absurd values / too-short maxTime are refused (never clamped)", () => {
    for (const m of [model(NaN, 0, 9.8), model(20, Infinity, 9.8), model(20, 0, 0), model(20, 0, -9.8), model(-1, 0, 9.8), model(1e9, 0, 9.8), model(20, 5000, 9.8), model(20, 0, 1e6), model(0, 0, 9.8), model(0, -5, 9.8), model("20" as never, 0, 9.8)])
      expect(codes(validateFreeFallConfig(cfg({ model: m }))), JSON.stringify(m)).toContain("FREEFALL_MODEL_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ view: { maxTime: 1.5, showVelocityGraph: true } })))).toContain("FREEFALL_VIEW_TOO_SHORT");      // impact at ≈ 2.02 s
    for (const v of [{ maxTime: 0, showVelocityGraph: true }, { maxTime: 1e9, showVelocityGraph: true }, { maxTime: NaN, showVelocityGraph: true }, { maxTime: 3, showVelocityGraph: "yes" }])
      expect(codes(validateFreeFallConfig(cfg({ view: v }))), JSON.stringify(v)).toContain("FREEFALL_VIEW_INVALID");
    expect(FREE_FALL_LIMITS).toMatchObject({ heightMax: 10000, velocityAbsMax: 1000, gravityMin: 0.1, gravityMax: 100, maxTimeMax: 600 });
  });
  it("F1 tasks: declared semantic ids, bounded labels, known units, no duplicates; at least one task", () => {
    const t = freeFallClassroomConfig().tasks;
    expect(codes(validateFreeFallConfig(cfg({ tasks: { ...t, measurements: [...t.measurements, t.measurements[0]] } })))).toContain("FREEFALL_TASK_ID_DUPLICATE");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { ...t, points: [{ id: "impactTime", label: "x" }] } })))).toContain("FREEFALL_TASK_ID_DUPLICATE");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { measurements: [{ id: "__proto__", label: "x", unit: "s" }], points: [] } })))).toContain("FREEFALL_TASK_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { measurements: [{ id: "a", label: "x", unit: "km/h" }], points: [] } })))).toContain("FREEFALL_TASK_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { measurements: [{ id: "a", label: "x".repeat(81), unit: "s" }], points: [] } })))).toContain("FREEFALL_TASK_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { measurements: [{ id: "a", label: "x", unit: "s", expected: 2 }], points: [] } })))).toContain("FREEFALL_TASK_INVALID");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { measurements: [], points: [] } })))).toContain("FREEFALL_TASKS_EMPTY");
    expect(codes(validateFreeFallConfig(cfg({ tasks: { measurements: Array.from({ length: 13 }, (_, i) => ({ id: "m" + i, label: "x", unit: "s" })), points: [] } })))).toContain("FREEFALL_TASKS_TOO_MANY");
  });
  it("F3 exact plugin version: physicsFreeFall@1 resolves; @2 / '1' / case variants never do", () => {
    expect(resolveSmartSimPlugin("physicsFreeFall", 1)).toBe(physicsFreeFallPluginV1);
    for (const [k, v] of [["physicsFreeFall", 2], ["physicsFreeFall", "1"], ["PhysicsFreeFall", 1], ["physicsFreeFall", 0]] as const) expect(resolveSmartSimPlugin(k, v), k + "@" + String(v)).toBeUndefined();
    expect(validateSmartSimQuestion({ ...question(), smartSim: { ...env(), pluginVersion: 2 } }).map(i => i.code)).toContain("SMARTSIM_PLUGIN_UNKNOWN");
  });
});

describe("F4 / F24 — the descriptor states exactly what the code does", () => {
  it("F4 descriptor: physics domain, 2D, its four semantic actions, five physics checks, opt-in numericNear@1 / pointNear@1", () => {
    const d = resolveSmartSimDescriptor("physicsFreeFall", 1)!;
    expect(d).toEqual(PHYSICS_FREE_FALL_DESCRIPTOR_V1);
    expect(d).toMatchObject({ domain: "physics", sceneKinds: ["2d"], genericRules: ["numericNear@1", "pointNear@1"], assetKinds: [] });
    expect([...d.actionKinds]).toEqual(["measurement.set", "measurement.clear", "graphPoint.set", "graphPoint.clear"]);
    expect([...d.checkKinds]).toEqual(["physics.impactTime", "physics.impactSpeed", "physics.heightAtTime", "physics.velocityAtTime", "physics.pointOnTrajectory"]);
    for (const c of ["scene.2d", "simulation.play", "simulation.pause", "simulation.scrub", "graph.2d", "point.place", "value.set"]) expect(d.capabilities).toContain(c);
    expect(d.supports).toMatchObject({ twoDimensional: true, threeDimensional: false, partialCredit: true, offline: true });
    expect([...FREE_FALL_CHECK_KINDS]).toEqual([...d.checkKinds]);
  });
  it("F24 actionKinds ↔ normalizer: every declared kind has an accepted example; every other type (incl. play / pause / scrub / frames) is refused", () => {
    const c = freeFallClassroomConfig();
    const accepted: Record<string, unknown> = { "measurement.set": set("impactTime", 2), "measurement.clear": { type: "measurement.clear", measurementId: "impactTime" }, "graphPoint.set": point("impactPoint", 2, 0), "graphPoint.clear": { type: "graphPoint.clear", pointId: "impactPoint" } };
    expect(Object.keys(accepted).sort()).toEqual([...FREE_FALL_ACTION_KINDS].sort());
    expect([...FREE_FALL_ACTION_KINDS]).toEqual([...PHYSICS_FREE_FALL_DESCRIPTOR_V1.actionKinds]);
    for (const [k, a] of Object.entries(accepted)) expect(normalizeFreeFallAction(a, c).ok, k).toBe(true);
    for (const t of ["simulation.play", "simulation.pause", "timeline.scrub", "animation.frame", "playback.restart", "view.zoom", "camera.pan", "pointer.move", "hover.enter", "measurement.setAll", "value.set", "object.select"])
      expect(normalizeFreeFallAction({ type: t, measurementId: "impactTime", value: 1 }, c).ok, t).toBe(false);
  });
});

describe("F5–F9 — the trusted physics engine (pure, deterministic)", () => {
  it("F5 impact time / speed for the 20 m classroom drop match the independent certification pins", () => {
    const m = model(20, 0, 9.8);
    expect(impactTime(m)).toBeCloseTo(T_IMPACT_20M, 12);
    expect(impactSpeed(m)).toBeCloseTo(V_IMPACT_20M, 12);
    expect(heightAt(m, impactTime(m))).toBeCloseTo(0, 9);
  });
  it("F6 initial velocity: thrown up (v0 = +10) / down (v0 = −10) from 20 m, and launched from the ground (h0 = 0, v0 = 20)", () => {
    expect(impactTime(model(20, 10, 9.8))).toBeCloseTo((10 + Math.sqrt(100 + 392)) / 9.8, 12);                // 3.2838…
    expect(impactTime(model(20, -10, 9.8))).toBeCloseTo((-10 + Math.sqrt(100 + 392)) / 9.8, 12);              // 1.2430…
    expect(impactTime(model(0, 20, 9.8))).toBeCloseTo(40 / 9.8, 12);                                         // returns to the ground
    expect(impactSpeed(model(0, 20, 9.8))).toBeCloseTo(20, 12);
    expect(impactSpeed(model(20, 10, 9.8))).toBeCloseTo(Math.sqrt(100 + 392), 12);                            // energy: v² = v0² + 2gh
  });
  it("F7 / F8 height and velocity at a time (y = h0 + v0·t − ½gt², v = v0 − gt)", () => {
    const m = model(20, 0, 9.8);
    expect(heightAt(m, 1)).toBeCloseTo(15.1, 12); expect(velocityAt(m, 1)).toBeCloseTo(-9.8, 12);
    expect(heightAt(model(10, 5, 10), 2)).toBeCloseTo(0, 12); expect(velocityAt(model(10, 5, 10), 2)).toBeCloseTo(-15, 12);
    expect(heightAt(m, 0)).toBe(20); expect(velocityAt(m, 0)).toBe(0);
  });
  it("F9 the POSITIVE root is chosen (never the negative one); results are finite for every bound corner", () => {
    expect(impactTime(model(20, -10, 9.8))).toBeGreaterThan(0);
    for (const m of [model(10000, 1000, 0.1), model(10000, -1000, 100), model(0.001, 0, 100), model(0, 0.01, 0.1)]) { expect(Number.isFinite(impactTime(m))).toBe(true); expect(impactTime(m)).toBeGreaterThan(0); expect(Number.isFinite(impactSpeed(m))).toBe(true); }
  });
  it("presentation sampling is bounded and deterministic (never an academic input)", () => {
    const s = sampleTrajectory(model(20, 0, 9.8), 3, 50000);
    expect(s.length).toBeLessThanOrEqual(2001);
    expect(sampleTrajectory(model(20, 0, 9.8), 3, 100)).toEqual(sampleTrajectory(model(20, 0, 9.8), 3, 100));
    const code = fs.readFileSync(path.join(here, "physicsFreeFallModel.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/Date\.now|performance\.now|Math\.random|requestAnimationFrame|setTimeout|setInterval|document\.|window\.|fetch\(|eval\(|new Function/);
  });
});

describe("F10–F13 — semantic actions, replay and forged state", () => {
  it("F10 strict action shapes: exact keys, declared ids, finite bounded values, time within the view", () => {
    const c = freeFallClassroomConfig();
    for (const bad of [set("nope", 1), { ...set("impactTime", 1), unit: "s" }, set("impactTime", NaN), set("impactTime", Infinity), set("impactTime", 1e9), { type: "measurement.set", measurementId: "impactTime", value: "2" },
      point("impactTime", 1, 1), point("impactPoint", -1, 0), point("impactPoint", 99, 0), point("impactPoint", 1, NaN), { ...point("impactPoint", 1, 1), screenX: 3 }, set("impactPoint", 1), { type: "measurement.clear", measurementId: "impactTime", value: 1 }, null, [], "measurement.set"])
      expect(normalizeFreeFallAction(bad, c).ok, JSON.stringify(bad)).toBe(false);
  });
  it("F12 replay is deterministic; the canonical state is tiny (measurements + points only, sorted; no time / frames / camera)", () => {
    const c = freeFallClassroomConfig();
    const a = replayFreeFall(c, [set("impactTime", 2.1), set("impactTime", 2.02), point("impactPoint", 2.02, 0), set("heightAt1s", 15.1), { type: "measurement.clear", measurementId: "heightAt1s" }]);
    const b = replayFreeFall(c, [point("impactPoint", 2.02, 0), set("impactTime", 2.02)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.state).toEqual({ v: 1, measurements: { impactTime: 2.02 }, points: { impactPoint: { t: 2.02, y: 0 } } });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(Object.keys(a.state).sort()).toEqual(["measurements", "points", "v"]);
  });
  it("F13 a forged perfect state with no actions earns 0; ingest binding replaces the claimed state", () => {
    const q = question();
    const forged = { v: 1, measurements: { impactTime: T_IMPACT_20M, impactSpeed: V_IMPACT_20M, heightAt1s: 15.1, velocityAt1s: -9.8 }, points: { impactPoint: { t: T_IMPACT_20M, y: 0 }, pointAt1s: { t: 1, y: 15.1 } } };
    expect(grade(q, [], forged)).toMatchObject({ score: 0, valid: true });
    const bound = bindSmartSimAnswerToQuestion(ans([set("impactTime", 2.02)], forged), q);
    expect(bound.ok && (bound.answer.state as { measurements: unknown }).measurements).toEqual({ impactTime: 2.02 });
  });
  it("F11 presentation gestures are refused: core-guarded prefixes give PRESENTATION_ONLY; play / pause / scrub / frames are not plugin actions", () => {
    const q = question();
    for (const g of [{ type: "view.scrub", time: 1 }, { type: "camera.zoom", factor: 2 }, { type: "pointer.move", x: 1 }]) expect(bindSmartSimAnswerToQuestion(ans([g, ...PERFECT]), q), g.type).toEqual({ ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" });
    for (const g of [{ type: "simulation.play" }, { type: "simulation.pause" }, { type: "timeline.scrub", time: 1.5 }, { type: "animation.frame", frame: 42 }]) expect(bindSmartSimAnswerToQuestion(ans([g, ...PERFECT]), q), g.type).toEqual({ ok: false, code: "SMARTSIM_ACTION_INVALID" });
  });
});

describe("F14–F19 — checks, scoring, unanswered / reset", () => {
  it("F15 / F14 the classroom preset grades a correct study 12 / 12 with plugin-owned physics checks AND generic rules", () => {
    const q = question();
    expect(validateSmartSimQuestion(q)).toEqual([]);
    const r = evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: ans(PERFECT), maxMarks: 12 }, { withDetails: true });
    expect(r).toMatchObject({ valid: true, score: 12, correct: true, totalWeight: 12, passedWeight: 12 });
    expect(r.checks.map(c => c.kind).sort()).toEqual(["numericNear@1", "physics.heightAtTime", "physics.impactSpeed", "physics.impactTime", "physics.pointOnTrajectory", "pointNear@1"]);
    expect(r.state).toEqual({ v: 1, measurements: { heightAt1s: 15.1, impactSpeed: 19.8, impactTime: 2.02, velocityAt1s: -9.8 }, points: { impactPoint: { t: 2.02, y: 0 }, pointAt1s: { t: 1, y: 15.1 } } });
  });
  it("F15 physics checks derive the expected value from the public model and use the PRIVATE tolerance", () => {
    const q = question([{ id: "t", label: "زمن", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.0001 }]);
    expect(grade(q, [set("impactTime", 2.0203)]).score).toBe(12);                                               // |2.0203 − 2.020305…| ≈ 5e-6
    expect(grade(q, [set("impactTime", 2.02)]).score).toBe(0);                                                  // ≈ 3.05e-4: outside ±0.0001
    const v = question([{ id: "v", label: "سرعة", weight: 1, kind: "physics.velocityAtTime", measurementId: "velocityAt1s", time: 1, tolerance: 0.05 }]);
    expect(grade(v, [set("velocityAt1s", -9.8)]).score).toBe(12); expect(grade(v, [set("velocityAt1s", 9.8)]).score).toBe(0);
    const s = question([{ id: "s", label: "سرعة الارتطام", weight: 1, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.05 }]);
    expect(grade(s, [set("impactSpeed", 19.8)]).score).toBe(12); expect(grade(s, [set("impactSpeed", -19.8)]).score).toBe(0);   // a SPEED is a magnitude
    const p = question([{ id: "p", label: "نقطة", weight: 1, kind: "physics.pointOnTrajectory", pointId: "pointAt1s", tolerance: 0.1 }]);
    expect(grade(p, [point("pointAt1s", 1.5, 8.975)]).score).toBe(12); expect(grade(p, [point("pointAt1s", 1, 18)]).score).toBe(0);
  });
  it("checks are validated strictly against the config (declared ids, time inside the experiment, finite tolerances)", () => {
    const issues = (c: Record<string, unknown>) => validateSmartSimQuestion(question([c])).map(i => i.code);
    expect(issues({ id: "x", label: "x", weight: 1, kind: "physics.impactTime", measurementId: "nope", tolerance: 0.1 })).toContain("FREEFALL_CHECK_INVALID");
    expect(issues({ id: "x", label: "x", weight: 1, kind: "physics.heightAtTime", measurementId: "heightAt1s", time: 5, tolerance: 0.1 })).toContain("FREEFALL_CHECK_INVALID");
    expect(issues({ id: "x", label: "x", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0 })).toContain("FREEFALL_CHECK_INVALID");
    expect(issues({ id: "x", label: "x", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: NaN })).toContain("SMARTSIM_CHECK_INVALID");
    expect(issues({ id: "x", label: "x", weight: 1, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.1, expected: 2 })).toContain("FREEFALL_CHECK_INVALID");
    expect(issues({ id: "x", label: "x", weight: 1, kind: "physics.pointOnTrajectory", pointId: "impactTime", tolerance: 0.1 })).toContain("FREEFALL_CHECK_INVALID");
    expect(issues({ id: "x", label: "x", weight: 1, kind: "objectSelected@1", objectId: "impactTime" })).toContain("SMARTSIM_CHECK_KIND_UNKNOWN");       // not opted in
  });
  it("F16 / F17 proportional partial credit by weight; allOrNothing is full or zero", () => {
    const q = question();
    expect(grade(q, [set("impactTime", 2.02), set("impactSpeed", 19.8)])).toMatchObject({ score: 6, passedWeight: 6, correct: false });
    const all = question(freeFallClassroomChecks(), "allOrNothing");
    expect(grade(all, PERFECT).score).toBe(12);
    expect(grade(all, PERFECT.slice(0, 5)).score).toBe(0);
  });
  it("F19 unanswered / reset: zero actions is unanswered and scores 0 (no free initial credit); a reset (no actions) equals a fresh answer", () => {
    const q = question();
    const fresh = grade(q, []);
    expect(fresh.score).toBe(0); expect(fresh.passedWeight).toBe(0);
    const resetAfterWork = grade(q, []);
    expect(resetAfterWork).toEqual(fresh);
  });
  it("the student projection is the public config only (no check, tolerance, expected value or weight)", () => {
    const p = projectSmartSimForStudent(env());
    expect(p).toEqual({ schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: freeFallClassroomConfig() });
    expect(JSON.stringify(p)).not.toMatch(/tolerance|weight|physics\.|pointNear|numericNear|"expected"/);
  });
});
