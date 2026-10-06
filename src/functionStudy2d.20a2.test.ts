import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FUNCTION_STUDY_PLUGIN_KEY, FUNCTION_STUDY_PLUGIN_VERSION, FUNCTION_STUDY_LIMITS, validateFunctionStudyConfig, compileFunction, evaluateFunctionAt, sampleFunction } from "./functionStudyModel";
import { FUNCTION_STUDY_ACTION_KINDS, FUNCTION_STUDY_CHECK_KINDS, FUNCTION_STUDY_DESCRIPTOR_V1, functionStudy2dPluginV1, normalizeFunctionStudyAction, replayFunctionStudy } from "./functionStudyPlugin";
import { resolveSmartSimPlugin, resolveSmartSimDescriptor, validateSmartSimQuestion, evaluateSmartSim, bindSmartSimAnswerToQuestion, projectSmartSimForStudent } from "./trustedSimPlugins";
import { rationalCertificationConfig, rationalCertificationChecks } from "./functionStudy/functionStudyTemplates";

// Phase 20A.2 — functionStudy2d@1, the first MATHEMATICS production SmartSim plugin: the authored function is parsed and evaluated ONLY by
// the existing safe parametric engine (language 2: tokenizer → recursive-descent parser → AST → bounded evaluator; no eval / Function / JS),
// with exactly one declared variable x; the graph is deterministic, bounded, presentation-only sampling that breaks the path at evaluation
// errors and asymptote jumps; the student submits STRUCTURED analysis (exclusions, intercepts, asymptotes, extrema, monotonic intervals) as
// semantic actions; the canonical state is small, bounded, duplicate-free and canonically ordered; PRIVATE checks with explicit tolerances
// are the analytical authority (no symbolic CAS in v1). The certification facts for f(x) = (2x − 4)/((x − 1)(x + 2)) are INDEPENDENT
// literals (derived by hand, never by the implementation under test). New-function tests (fail-first on the post-#265 baseline 44d0f21).
const here = path.dirname(fileURLToPath(import.meta.url));
const CERT = "(2*x-4)/((x-1)*(x+2))";
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const cfg = (over: Record<string, unknown> = {}) => ({ ...rationalCertificationConfig(), ...over });
const env = (config: unknown = rationalCertificationConfig()) => ({ schemaVersion: 1, pluginKey: "functionStudy2d", pluginVersion: 1, config });
const question = (checks: unknown[] = rationalCertificationChecks(), scoring = "proportional", config: unknown = rationalCertificationConfig()) => ({ examQuestionId: "fs", presentationType: "smartSim", questionTypeVersion: 1, text: "دراسة دالة", marks: 13, smartSim: env(config), answer: { scoring, checks } });
const ans = (actions: unknown[], state: unknown = {}) => ({ kind: "smartSim", pluginKey: "functionStudy2d", pluginVersion: 1, actions, state });
const grade = (q: ReturnType<typeof question>, actions: unknown[], state: unknown = {}) => evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: ans(actions, state), maxMarks: q.marks }, { withDetails: true });
const TWO_NINTHS = 0.2222222222222222;
// the certification study, entered in a deliberately scrambled order (canonical state must not depend on it)
const PERFECT = [
  { type: "domain.setExclusions", values: [1, -2] },
  { type: "intercepts.setX", points: [{ x: 2, y: 0 }] },
  { type: "intercept.setY", y: 2 },
  { type: "asymptotes.setVertical", values: [1, -2] },
  { type: "asymptotes.setHorizontal", values: [0] },
  { type: "extrema.set", points: [{ kind: "max", x: 4, y: TWO_NINTHS }, { kind: "min", x: 0, y: 2 }] },
  { type: "intervals.set", intervals: [{ kind: "decreasing", from: 4, to: "+inf" }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: "-inf", to: -2 }, { kind: "increasing", from: 0, to: 1 }, { kind: "decreasing", from: -2, to: 0 }] }
];

describe("M1–M5 — strict config; the SAFE parametric parser is the only expression authority", () => {
  it("M1 the certification preset validates (language 2, variable x); unknown keys / versions / nested data are refused", () => {
    expect(FUNCTION_STUDY_PLUGIN_KEY).toBe("functionStudy2d"); expect(FUNCTION_STUDY_PLUGIN_VERSION).toBe(1);
    const r = validateFunctionStudyConfig(rationalCertificationConfig());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.config.expression).toEqual({ language: 2, variable: "x", source: CERT }); expect(validateFunctionStudyConfig(r.config)).toEqual(r); }
    expect(codes(validateFunctionStudyConfig({ ...rationalCertificationConfig(), v: 2 }))).toContain("FUNCSTUDY_CONFIG_VERSION_UNSUPPORTED");
    for (const k of ["answer", "expected", "checks", "rules", "module", "component", "renderer"]) expect(codes(validateFunctionStudyConfig({ ...rationalCertificationConfig(), [k]: "x" })), k).toContain("FUNCSTUDY_CONFIG_UNKNOWN_KEY");
    expect(codes(validateFunctionStudyConfig(cfg({ expression: { language: 1, variable: "x", source: CERT } })))).toContain("FUNCSTUDY_EXPRESSION_INVALID");
    expect(codes(validateFunctionStudyConfig(cfg({ expression: { language: 2, variable: "t", source: "t*2" } })))).toContain("FUNCSTUDY_EXPRESSION_INVALID");
    expect(codes(validateFunctionStudyConfig(cfg({ expression: { language: 2, variable: "x", source: CERT, compiled: "x" } })))).toContain("FUNCSTUDY_EXPRESSION_INVALID");
    expect(codes(validateFunctionStudyConfig(cfg({ tasks: { ...rationalCertificationConfig().tasks, range: true } })))).toContain("FUNCSTUDY_TASKS_INVALID");
    expect(codes(validateFunctionStudyConfig(cfg({ tasks: Object.fromEntries(Object.keys(rationalCertificationConfig().tasks).map(k => [k, false])) })))).toContain("FUNCSTUDY_TASKS_EMPTY");
    expect(codes(validateFunctionStudyConfig(null))).toContain("FUNCSTUDY_CONFIG_INVALID");
  });
  it("M2 / M3 / M4 safe parsing: only x; unknown functions / identifiers are refused", () => {
    expect(compileFunction(CERT).ok).toBe(true);
    expect(compileFunction("sqrt(x^2+1) - log(abs(x)+1) + exp(-x) + pow(x, 2) + min(x, 1)").ok).toBe(true);
    expect(compileFunction("x + y")).toEqual({ ok: false, code: "FUNCSTUDY_VARIABLE_UNDECLARED" });
    expect(compileFunction("a*x")).toEqual({ ok: false, code: "FUNCSTUDY_VARIABLE_UNDECLARED" });
    expect(compileFunction("sin(x)")).toEqual({ ok: false, code: "EXPR_UNKNOWN_FUNCTION" });
    expect(compileFunction("x".repeat(501)).ok).toBe(false);
    expect(compileFunction("").ok).toBe(false);
    expect(codes(validateFunctionStudyConfig(cfg({ expression: { language: 2, variable: "x", source: "x + y" } })))).toContain("FUNCSTUDY_EXPRESSION_INVALID");
  });
  it("M5 executable / host syntax never survives: member access, globals, calls, strings, arrays, objects, assignment, statements", () => {
    for (const src of ["x.constructor", "globalThis", "window", "document", "process", "require(x)", "import(x)", "fetch(x)", "Math.random()", "alert(1)", "\"string\"", "[x]", "{x:1}", "x = 5", "x; 1", "this", "x => x", "x.__proto__", "constructor", "eval(x)", "Function(x)", "new Function", "`x`", "x?.y", "x[0]"])
      expect(compileFunction(src).ok, src).toBe(false);
    const code = fs.readFileSync(path.join(here, "functionStudyModel.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\beval\(|new Function|\bFunction\(|\bimport\(|\brequire\(|\bfetch\(|Math\.random|Date\.now/);       // \b: the exported name compileFunction( is not the Function constructor
    expect(code).toMatch(/from "\.\/parametricEngine"/);                                                       // the ONE expression engine
  });
  it("certification facts of the authored function, evaluated by the shared safe evaluator (independent literals)", () => {
    const c = compileFunction(CERT); if (!c.ok) throw new Error(c.code);
    expect(evaluateFunctionAt(c.ast, 0)).toEqual({ ok: true, value: 2 });
    expect(evaluateFunctionAt(c.ast, 2)).toEqual({ ok: true, value: 0 });
    const at4 = evaluateFunctionAt(c.ast, 4); expect(at4.ok && at4.value).toBeCloseTo(TWO_NINTHS, 14);
    expect(evaluateFunctionAt(c.ast, 1).ok).toBe(false); expect(evaluateFunctionAt(c.ast, -2).ok).toBe(false);
    const big = evaluateFunctionAt(c.ast, 1e6); expect(big.ok && Math.abs(big.value)).toBeLessThan(1e-5);       // y → 0 (horizontal asymptote)
  });
});

describe("M6 / M7 — deterministic, bounded, presentation-only sampling", () => {
  it("M6 window and sample-count bounds; never millions of points", () => {
    expect(FUNCTION_STUDY_LIMITS).toMatchObject({ sampleMin: 50, sampleMax: 2000 });
    for (const w of [{ xMin: 0, xMax: 0, yMin: -1, yMax: 1, sampleCount: 100 }, { xMin: 1, xMax: -1, yMin: -1, yMax: 1, sampleCount: 100 }, { xMin: -1e9, xMax: 1, yMin: -1, yMax: 1, sampleCount: 100 },
      { xMin: -1, xMax: 1, yMin: NaN, yMax: 1, sampleCount: 100 }, { xMin: -1, xMax: 1, yMin: -1, yMax: 1, sampleCount: 1_000_000 }, { xMin: -1, xMax: 1, yMin: -1, yMax: 1, sampleCount: 10 }, { xMin: -1, xMax: 1, yMin: -1, yMax: 1, sampleCount: 100.5 }, { xMin: -1, xMax: 1, yMin: -1, yMax: 1, sampleCount: 100, zoom: 2 }])
      expect(codes(validateFunctionStudyConfig(cfg({ window: w }))), JSON.stringify(w)).toContain("FUNCSTUDY_WINDOW_INVALID");
    const r = validateFunctionStudyConfig(rationalCertificationConfig()); if (!r.ok) throw new Error("cfg");
    const s = sampleFunction(r.config);
    expect(s.evaluated).toBe(r.config.window.sampleCount);
    expect(s.segments.reduce((n, seg) => n + seg.length, 0)).toBeLessThanOrEqual(FUNCTION_STUDY_LIMITS.sampleMax);
    expect(sampleFunction(r.config)).toEqual(s);
  });
  it("M7 an evaluation error (x = 1, x = −2 hit exactly) splits the path; an asymptote jump is never drawn as one segment", () => {
    const r = validateFunctionStudyConfig(cfg({ window: { xMin: -2, xMax: 2, yMin: -10, yMax: 10, sampleCount: 401 } })); if (!r.ok) throw new Error("cfg");
    const s = sampleFunction(r.config);
    for (const seg of s.segments) for (const p of seg) { expect(p.x).not.toBe(1); expect(p.x).not.toBe(-2); }
    expect(s.segments.some(seg => seg.some(p => p.x < 1) && seg.some(p => p.x > 1))).toBe(false);
    // f = 1/x on an even grid that straddles 0 without hitting it: no segment may connect the −∞ branch to the +∞ branch
    const h = validateFunctionStudyConfig(cfg({ expression: { language: 2, variable: "x", source: "1/x" }, window: { xMin: -1, xMax: 1, yMin: -5, yMax: 5, sampleCount: 100 } })); if (!h.ok) throw new Error("cfg");
    expect(sampleFunction(h.config).segments.some(seg => seg.some(p => p.x < 0) && seg.some(p => p.x > 0))).toBe(false);
  });
});

describe("M8–M14 / M26 — semantic actions and the canonical state", () => {
  it("M26 actionKinds ↔ normalizer: every declared kind has an accepted example; everything else is refused", () => {
    const r = validateFunctionStudyConfig(rationalCertificationConfig()); if (!r.ok) throw new Error("cfg");
    const examples: Record<string, unknown> = Object.fromEntries(PERFECT.map(a => [a.type, a]));
    expect(Object.keys(examples).sort()).toEqual([...FUNCTION_STUDY_ACTION_KINDS].sort());
    expect([...FUNCTION_STUDY_ACTION_KINDS]).toEqual([...FUNCTION_STUDY_DESCRIPTOR_V1.actionKinds]);
    for (const [k, a] of Object.entries(examples)) expect(normalizeFunctionStudyAction(a, r.config).ok, k).toBe(true);
    for (const t of ["camera.zoom", "view.pan", "graph.zoom", "point.drag", "probe.move", "object.select", "value.set", "domain.add", "measurement.set"]) expect(normalizeFunctionStudyAction({ type: t, values: [1] }, r.config).ok, t).toBe(false);
  });
  it("M8 / M10 strict shapes: exact keys, finite bounded numbers, strict enums, ∞ tokens only where allowed, no duplicates, bounded lists", () => {
    const r = validateFunctionStudyConfig(rationalCertificationConfig()); if (!r.ok) throw new Error("cfg");
    for (const bad of [
      { type: "domain.setExclusions", values: [1, 1] }, { type: "domain.setExclusions", values: [NaN] }, { type: "domain.setExclusions", values: [1e9] }, { type: "domain.setExclusions", values: ["1"] }, { type: "domain.setExclusions", values: Array.from({ length: 21 }, (_, i) => i) },
      { type: "domain.setExclusions", values: [1], note: "<b>x</b>" }, { type: "intercepts.setX", points: [{ x: 2, y: 0, label: "x" }] }, { type: "intercepts.setX", points: [{ x: 2, y: 0 }, { x: 2, y: 0 }] },
      { type: "intercept.setY", y: Infinity }, { type: "intercept.setY", y: "2" }, { type: "asymptotes.setVertical", values: [Infinity] }, { type: "asymptotes.setHorizontal", values: [0, -0] },
      { type: "extrema.set", points: [{ kind: "saddle", x: 0, y: 2 }] }, { type: "extrema.set", points: [{ kind: "min", x: 0 }] },
      { type: "intervals.set", intervals: [{ kind: "increasing", from: 1, to: 1 }] }, { type: "intervals.set", intervals: [{ kind: "increasing", from: 4, to: 1 }] }, { type: "intervals.set", intervals: [{ kind: "increasing", from: "+inf", to: 1 }] },
      { type: "intervals.set", intervals: [{ kind: "increasing", from: 0, to: "-inf" }] }, { type: "intervals.set", intervals: [{ kind: "rising", from: 0, to: 1 }] }, { type: "intervals.set", intervals: [{ kind: "increasing", from: -Infinity, to: 1 }] },
      { type: "intervals.set", intervals: [{ kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 0, to: 1 }] }, { type: "intervals.set", intervals: [{ kind: "increasing", from: "-infinity", to: 1 }] }])
      expect(normalizeFunctionStudyAction(bad, r.config).ok, JSON.stringify(bad)).toBe(false);
    // an action for a task group the author disabled is refused
    const noAsym = validateFunctionStudyConfig(cfg({ tasks: { ...rationalCertificationConfig().tasks, verticalAsymptotes: false } })); if (!noAsym.ok) throw new Error("cfg");
    expect(normalizeFunctionStudyAction({ type: "asymptotes.setVertical", values: [1] }, noAsym.config).ok).toBe(false);
  });
  it("M9 / M11–M14 the canonical state is small, sorted where order is meaningless, and independent of entry order", () => {
    const r = validateFunctionStudyConfig(rationalCertificationConfig()); if (!r.ok) throw new Error("cfg");
    const a = replayFunctionStudy(r.config, PERFECT);
    expect(a.ok).toBe(true); if (!a.ok) return;
    expect(a.state).toEqual({
      v: 1, domainExclusions: [-2, 1], xIntercepts: [{ x: 2, y: 0 }], yIntercept: { x: 0, y: 2 }, verticalAsymptotes: [-2, 1], horizontalAsymptotes: [0],
      extrema: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: TWO_NINTHS }],
      monotonicIntervals: [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }]
    });
    const reversed = replayFunctionStudy(r.config, [...PERFECT].reverse());
    expect(reversed.ok && JSON.stringify(reversed.state)).toBe(JSON.stringify(a.state));
    // a later action REPLACES its group (idempotent, bounded); y-intercept can be cleared
    const later = replayFunctionStudy(r.config, [...PERFECT, { type: "asymptotes.setVertical", values: [3] }, { type: "intercept.setY", y: null }]);
    expect(later.ok && later.state).toMatchObject({ verticalAsymptotes: [3], yIntercept: null });
    const empty = replayFunctionStudy(r.config, []);
    expect(empty.ok && empty.state).toEqual({ v: 1, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], monotonicIntervals: [] });
  });
});

describe("M15–M18 / M27 — grading the certification study", () => {
  it("M27 the certification preset finalizes; the exact certification study earns 13 / 13 with every check passing", () => {
    const q = question();
    expect(validateSmartSimQuestion(q)).toEqual([]);
    const r = grade(q, PERFECT);
    expect(r).toMatchObject({ valid: true, score: 13, correct: true, totalWeight: 13, passedWeight: 13 });
    expect(r.checks.map(c => c.kind).sort()).toEqual([...FUNCTION_STUDY_CHECK_KINDS].sort());
  });
  it("M27 the private key encodes exactly the independent certification facts", () => {
    const byKind = Object.fromEntries(rationalCertificationChecks().map(c => [c.kind, c]));
    expect(byKind["domain.exclusions"]).toMatchObject({ expected: [-2, 1] });
    expect(byKind["intercepts.x"]).toMatchObject({ expected: [{ x: 2, y: 0 }] });
    expect(byKind["intercept.y"]).toMatchObject({ expected: 2 });
    expect(byKind["asymptotes.vertical"]).toMatchObject({ expected: [-2, 1] });
    expect(byKind["asymptotes.horizontal"]).toMatchObject({ expected: [0] });
    expect(byKind["extrema.points"]).toMatchObject({ expected: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: TWO_NINTHS }] });
    expect(byKind["monotonic.intervals"]).toMatchObject({ expected: [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] });
  });
  it("mathematical comparison: order-independent sets, kind-sensitive extrema / intervals, separated intervals across a singularity, explicit tolerance", () => {
    const q = question();
    const replace = (type: string, a: Record<string, unknown>) => PERFECT.map(x => (x.type === type ? { type, ...a } : x));
    const failed = (actions: unknown[]) => grade(q, actions).checks.filter(c => !c.passed).map(c => c.kind);
    expect(failed(replace("asymptotes.setVertical", { values: [-2] }))).toEqual(["asymptotes.vertical"]);                                    // missing one
    expect(failed(replace("asymptotes.setVertical", { values: [-2, 1, 3] }))).toEqual(["asymptotes.vertical"]);                              // an extra one
    expect(failed(replace("asymptotes.setVertical", { values: [-2.004, 1.003] }))).toEqual([]);                                              // within ±0.01
    expect(failed(replace("extrema.set", { points: [{ kind: "max", x: 0, y: 2 }, { kind: "min", x: 4, y: TWO_NINTHS }] }))).toEqual(["extrema.points"]);   // kinds swapped
    expect(failed(replace("intervals.set", { intervals: [{ kind: "decreasing", from: "-inf", to: 0 }, { kind: "increasing", from: 0, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] }))).toEqual(["monotonic.intervals"]);   // merged across −2 and 1
    expect(failed(replace("intervals.set", { intervals: [{ kind: "increasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] }))).toEqual(["monotonic.intervals"]);  // one kind wrong
    expect(failed(replace("intercept.setY", { y: 2.5 }))).toEqual(["intercept.y"]);
    expect(failed(replace("domain.setExclusions", { values: [-2, 1, 0] }))).toEqual(["domain.exclusions"]);
  });
  it("M17 / M18 proportional partial credit; allOrNothing; M23 zero actions = unanswered = 0 (no free initial credit)", () => {
    const q = question();
    expect(grade(q, PERFECT.slice(0, 3))).toMatchObject({ score: 4, passedWeight: 4, correct: false });                                    // exclusions 2 + x-int 1 + y-int 1
    expect(grade(question(rationalCertificationChecks(), "allOrNothing"), PERFECT).score).toBe(13);
    expect(grade(question(rationalCertificationChecks(), "allOrNothing"), PERFECT.slice(0, 6)).score).toBe(0);
    expect(grade(q, [])).toMatchObject({ score: 0, passedWeight: 0 });
  });
  it("M15 a forged perfect state with no actions earns 0; binding replaces the claimed state with the replay", () => {
    const q = question();
    const r = validateFunctionStudyConfig(rationalCertificationConfig()); if (!r.ok) throw new Error("cfg");
    const perfect = replayFunctionStudy(r.config, PERFECT); if (!perfect.ok) throw new Error("replay");
    expect(grade(q, [], perfect.state).score).toBe(0);
    const b = bindSmartSimAnswerToQuestion(ans([PERFECT[0]], perfect.state), q);
    expect(b.ok && (b.answer.state as { verticalAsymptotes: unknown }).verticalAsymptotes).toEqual([]);
    expect(bindSmartSimAnswerToQuestion(ans([{ type: "camera.zoom", factor: 2 }, ...PERFECT]), q)).toEqual({ ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" });
  });
  it("private checks are validated strictly (duplicates, ∞ placement, tolerance, disabled task groups, unknown kinds)", () => {
    const issues = (c: Record<string, unknown>, config: unknown = rationalCertificationConfig()) => validateSmartSimQuestion(question([c], "proportional", config)).map(i => i.code);
    const base = { id: "k", label: "فحص", weight: 1 };
    expect(issues({ ...base, kind: "asymptotes.vertical", expected: [1, 1], tolerance: 0.01 })).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ ...base, kind: "asymptotes.vertical", expected: [1], tolerance: -1 })).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ ...base, kind: "asymptotes.vertical", expected: [1], tolerance: 0.01, extra: 1 })).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ ...base, kind: "monotonic.intervals", expected: [{ kind: "increasing", from: 1, to: "-inf" }], tolerance: 0.01 })).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ ...base, kind: "extrema.points", expected: [{ kind: "peak", x: 0, y: 0 }], tolerance: 0.01 })).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ ...base, kind: "asymptotes.vertical", expected: [1], tolerance: 0.01 }, cfg({ tasks: { ...rationalCertificationConfig().tasks, verticalAsymptotes: false } }))).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ ...base, kind: "pointNear@1", pointId: "x", expected: { x: 0, y: 0 }, tolerance: 1 })).toContain("SMARTSIM_CHECK_KIND_UNKNOWN");
  });
});

describe("M16 / M20 / M21 / M28 — identity, descriptor and privacy", () => {
  it("M20 / M21 exact identity: functionStudy2d@1 only; its descriptor states its real behaviour", () => {
    expect(resolveSmartSimPlugin("functionStudy2d", 1)).toBe(functionStudy2dPluginV1);
    for (const [k, v] of [["functionStudy2d", 2], ["functionStudy2d", "1"], ["functionStudy2D", 1]] as const) expect(resolveSmartSimPlugin(k, v), k + "@" + String(v)).toBeUndefined();
    expect(validateSmartSimQuestion({ ...question(), smartSim: { ...env(), pluginVersion: 2 } }).map(i => i.code)).toContain("SMARTSIM_PLUGIN_UNKNOWN");
    const d = resolveSmartSimDescriptor("functionStudy2d", 1)!;
    expect(d).toEqual(FUNCTION_STUDY_DESCRIPTOR_V1);
    expect(d).toMatchObject({ domain: "mathematics", sceneKinds: ["2d"], genericRules: [], assetKinds: [] });
    expect(d.rendererFamilies).toContain("graph2d"); expect(d.capabilities).toEqual(expect.arrayContaining(["scene.2d", "graph.2d", "point.place", "value.set"]));
    expect([...d.checkKinds]).toEqual([...FUNCTION_STUDY_CHECK_KINDS]);
  });
  it("M16 / M28 the student projection is the PUBLIC config only: expression, window and task switches — structurally no private answer field", () => {
    const p = projectSmartSimForStudent(env())!;
    expect(p.config).toEqual(rationalCertificationConfig());
    const cfgOut = p.config as Record<string, unknown>;
    expect(Object.keys(cfgOut).sort()).toEqual(["expression", "tasks", "v", "window"]);
    expect(Object.values(cfgOut.tasks as Record<string, unknown>).every(v => typeof v === "boolean")).toBe(true);
    expect(Object.keys(cfgOut.window as object).sort()).toEqual(["sampleCount", "xMax", "xMin", "yMax", "yMin"]);
    const walk = (v: unknown, k = ""): void => { expect(k).not.toMatch(/^(expected|tolerance|weight|checks|answer|scoring|kind)$/i); if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk); };
    walk(p);
    expect(JSON.stringify(p)).not.toMatch(/0\.2222|"\+inf"|"-inf"|"min"|"max"|decreasing|increasing/);
  });
});

describe("mutation-driven strengthening (round 1 survivors F3 / F11 / F12)", () => {
  it("F3 a domain GAP without a jump (√(x² − 1) on [−2, 2]) is never bridged by one segment", () => {
    const r = validateFunctionStudyConfig(cfg({ expression: { language: 2, variable: "x", source: "sqrt(x^2-1)" }, window: { xMin: -2, xMax: 2, yMin: -1, yMax: 3, sampleCount: 401 } })); if (!r.ok) throw new Error("cfg");
    const s = sampleFunction(r.config);
    expect(s.segments.length).toBe(2);
    expect(s.segments.some(seg => seg.some(p => p.x < 0) && seg.some(p => p.x > 0))).toBe(false);
  });
  it("F11 an infinite endpoint only matches the same infinity; a finite end where +∞ is expected fails (and vice versa)", () => {
    const q = question();
    const failed = (intervals: unknown[]) => grade(q, PERFECT.map(x => (x.type === "intervals.set" ? { type: "intervals.set", intervals } : x))).checks.filter(c => !c.passed).map(c => c.kind);
    const good = [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }];
    expect(failed([...good, { kind: "decreasing", from: 4, to: 10 }])).toEqual(["monotonic.intervals"]);
    expect(failed([{ kind: "decreasing", from: -10, to: -2 }, ...good.slice(1), { kind: "decreasing", from: 4, to: "+inf" }])).toEqual(["monotonic.intervals"]);
    expect(failed([...good, { kind: "decreasing", from: 4, to: "+inf" }])).toEqual([]);
  });
  it("F12 an EMPTY expected answer is refused for every list check (an empty initial state would otherwise earn free credit)", () => {
    const issues = (c: Record<string, unknown>) => validateSmartSimQuestion(question([c])).map(i => i.code);
    for (const kind of ["domain.exclusions", "intercepts.x", "asymptotes.vertical", "asymptotes.horizontal", "extrema.points", "monotonic.intervals"])
      expect(issues({ id: "k", label: "فحص", weight: 1, kind, expected: [], tolerance: 0.01 }), kind).toContain("FUNCSTUDY_CHECK_INVALID");
    expect(issues({ id: "k", label: "فحص", weight: 1, kind: "intercept.y", expected: null, tolerance: 0.01 })).toContain("FUNCSTUDY_CHECK_INVALID");
  });
  it("an author's expected set in any order is compared as a set (the key is not required to be sorted)", () => {
    const q = question([{ id: "va", label: "تقارب", weight: 1, kind: "asymptotes.vertical", expected: [1, -2], tolerance: 0.01 }, { id: "ex", label: "قصوى", weight: 1, kind: "extrema.points", expected: [{ kind: "max", x: 4, y: TWO_NINTHS }, { kind: "min", x: 0, y: 2 }], tolerance: 0.01 }]);
    expect(grade(q, PERFECT).score).toBe(13);
  });
});

