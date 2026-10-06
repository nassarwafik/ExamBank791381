import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SMART_SIM_LIMITS, registerSmartSimPlugin, resolveSmartSimPlugin, listSmartSimPlugins, smartSimPluginId, checkBoundedJson,
  type SmartSimPlugin, type SmartSimCheckBase
} from "./trustedSimRegistry";
import {
  SMART_SIM_TYPE_KEY, SMART_SIM_FAIL_CLOSED, validateSmartSimEnvelope, projectSmartSimForStudent, validateSmartSimAnswerKey, validateSmartSimQuestion,
  normalizeSmartSimAnswer, bindSmartSimAnswerToQuestion, replaySmartSimActions, evaluateSmartSim, scoreSmartSim, isSmartSimAnswerAnswered
} from "./trustedSimPlugins";

// Phase 20A — the TRUSTED SmartSim core: a code-owned plugin registry resolved by EXACT (pluginKey, pluginVersion), the smartSim@1
// question contract (strict public envelope, private weighted checks), replay-derived canonical state (the client's claimed state is
// never authority), generic weighted partial-credit scoring that fails closed, and a strict student projection. Domain-neutrality is
// proven with a TEST-ONLY fake plugin (an atom-counter, the shape a chemistry-balance plugin would have) — no networking involved.
// New-function tests (fail-first on a13252803: none of these modules exist).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type FakeConfig = { v: 1; start: number; max: number };
type FakeAction = { type: "inc" | "dec" | "set"; value?: number };
type FakeRuntime = { count: number };
type FakeState = { count: number };
type FakeCheck = SmartSimCheckBase & { value: number };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fakePlugin = (version = 1, label = "عدّاد ذرات (اختبار)"): SmartSimPlugin<FakeConfig, FakeRuntime, FakeState, FakeAction, FakeCheck> => ({
  key: "fakeCounter", version, label, maxActions: 50, checkKinds: ["count.equals", "count.atLeast"],
  // Phase 20A.1 — every registered plugin carries its code-owned descriptor (metadata only)
  descriptor: { descriptorVersion: 1, key: "fakeCounter", version, label, domain: "general", sceneKinds: ["2d"], rendererFamilies: ["custom"], capabilities: ["scene.2d", "value.set"], actionKinds: ["inc", "dec", "set"], checkKinds: ["count.equals", "count.atLeast"], genericRules: [], assetKinds: [], tools: ["select"], accessibility: ["keyboardAlternative"], supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false } },
  validateConfig(raw) {
    if (!isObj(raw) || Object.keys(raw).some(k => !["v", "start", "max"].includes(k)) || raw.v !== 1 || !Number.isInteger(raw.start) || !Number.isInteger(raw.max) || (raw.max as number) < 1) return { ok: false, issues: [{ code: "FAKE_CONFIG_INVALID", message: "bad config" }] };
    return { ok: true, config: { v: 1, start: raw.start as number, max: raw.max as number } };
  },
  createRuntime: config => ({ count: config.start }),
  normalizeAction(raw) {
    if (!isObj(raw) || !["inc", "dec", "set"].includes(raw.type as string) || Object.keys(raw).some(k => !["type", "value"].includes(k))) return { ok: false, code: "FAKE_ACTION_INVALID" };
    if (raw.type === "set" && !Number.isInteger(raw.value)) return { ok: false, code: "FAKE_ACTION_INVALID" };
    return { ok: true, action: raw.type === "set" ? { type: "set", value: raw.value as number } : { type: raw.type as "inc" | "dec" } };
  },
  applyAction: (rt, a, config) => ({ count: Math.max(0, Math.min(config.max, a.type === "inc" ? rt.count + 1 : a.type === "dec" ? rt.count - 1 : a.value!)) }),
  canonicalState: rt => ({ count: rt.count }),
  serializeState: s => JSON.stringify({ count: s.count }),
  validateCheck(raw) {
    if (!Number.isInteger(raw.value) || Object.keys(raw).some(k => !["id", "label", "weight", "kind", "value"].includes(k))) return { ok: false, issues: [{ code: "FAKE_CHECK_INVALID", message: "bad check" }] };
    return { ok: true, check: { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as string, value: raw.value as number } };
  },
  evaluateCheck: (c, s) => ({ expected: (c.kind === "count.atLeast" ? "≥ " : "") + c.value, actual: String(s.count), passed: c.kind === "count.atLeast" ? s.count >= c.value : s.count === c.value })
});
const undo: (() => void)[] = [];
afterEach(() => { while (undo.length) undo.pop()!(); });
const withFake = (version = 1) => { const p = fakePlugin(version); undo.push(registerSmartSimPlugin(p)); return p; };
const ENV = { schemaVersion: 1, pluginKey: "fakeCounter", pluginVersion: 1, config: { v: 1, start: 0, max: 10 } };
const KEY = { scoring: "proportional", checks: [{ id: "c-exact", label: "العدد 3", weight: 1, kind: "count.equals", value: 3 }, { id: "c-min", label: "العدد 2 على الأقل", weight: 3, kind: "count.atLeast", value: 2 }] };
const q = (over: Record<string, unknown> = {}) => ({ examQuestionId: "s1", presentationType: "smartSim", questionTypeVersion: 1, text: "وازن المعادلة", marks: 8, smartSim: ENV, answer: KEY, ...over });
const ans = (actions: unknown[], extra: Record<string, unknown> = {}) => ({ kind: "smartSim", pluginKey: "fakeCounter", pluginVersion: 1, actions, state: { count: 0 }, ...extra });
const deepFreeze = <T>(o: T): T => { if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

describe("20A-C1 — a code-owned plugin registry resolved by EXACT identity", () => {
  it("register / resolve by (key, version); duplicates refused; malformed registrations refused; no latest fallback; unregister restores", () => {
    const p = withFake();
    expect(resolveSmartSimPlugin("fakeCounter", 1)).toBe(p);
    expect(resolveSmartSimPlugin("fakeCounter", 2)).toBeUndefined();
    expect(resolveSmartSimPlugin("fakeCounter", "1")).toBeUndefined();
    expect(resolveSmartSimPlugin("fakeCounter", undefined)).toBeUndefined();
    expect(resolveSmartSimPlugin("FAKECOUNTER", 1)).toBeUndefined();
    expect(resolveSmartSimPlugin("nope", 1)).toBeUndefined();
    expect(() => registerSmartSimPlugin(fakePlugin(1))).toThrow(/already registered/);
    expect(() => registerSmartSimPlugin({ ...fakePlugin(1), key: "1bad" })).toThrow();
    expect(() => registerSmartSimPlugin({ ...fakePlugin(1), key: "__proto__" })).toThrow();
    expect(() => registerSmartSimPlugin({ ...fakePlugin(1), key: "other", version: 0 })).toThrow();
    expect(() => registerSmartSimPlugin({ ...fakePlugin(1), key: "other", version: 1.5 })).toThrow();
    expect(() => registerSmartSimPlugin({ ...fakePlugin(1), key: "other", applyAction: undefined } as never)).toThrow();
    expect(() => registerSmartSimPlugin({ ...fakePlugin(1), key: "other", maxActions: 5000 })).toThrow();
    expect(smartSimPluginId("fakeCounter", 1)).toBe("fakeCounter@1");
  });
  it("a v2 is ADDITIVE: v1 keeps resolving to v1 semantics forever; a published v1 question never runs under v2", () => {
    const v1 = withFake(1), v2 = withFake(2);
    expect(resolveSmartSimPlugin("fakeCounter", 1)).toBe(v1); expect(resolveSmartSimPlugin("fakeCounter", 2)).toBe(v2);
    expect(listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(expect.arrayContaining(["fakeCounter@1", "fakeCounter@2"]));
  });
  it("the PRODUCTION plugin set is exactly networkTopology@1 + the 20A.2 pilots physicsFreeFall@1 / functionStudy2d@1 (repository code), never anything exam data names", () => {
    expect(listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1"]);   // Phase 20A.2 extended the production set
    expect(resolveSmartSimPlugin("networkTopology", 1)?.label).toBeTruthy();
  });
  it("the bounded-JSON guard refuses prototype-sensitive keys at any depth, non-finite numbers, functions, excessive depth / size", () => {
    expect(checkBoundedJson({ a: [1, "x", { b: true, c: null }] })).toBeUndefined();
    for (const bad of [JSON.parse('{"__proto__":{"x":1}}'), { a: JSON.parse('{"constructor":1}') }, [{ prototype: 1 }], { n: NaN }, { n: Infinity }, { f: () => 1 }, { u: undefined }, { s: Symbol("x") }, { b: BigInt(1) }])
      expect(checkBoundedJson(bad), JSON.stringify(Object.keys(bad))).toBeTruthy();
    let deep: unknown = 1; for (let i = 0; i < SMART_SIM_LIMITS.depth + 2; i++) deep = [deep];
    expect(checkBoundedJson(deep)).toBe("SMARTSIM_JSON_TOO_DEEP");
    expect(checkBoundedJson({ s: "x".repeat(SMART_SIM_LIMITS.answerBytes) })).toBe("SMARTSIM_ANSWER_TOO_LARGE");
  });
});

describe("20A-C2 — the public envelope: data only, exact keys, exact plugin identity, strict config", () => {
  it("a valid envelope resolves its plugin and canonicalizes the config; the student projection is that canonical envelope", () => {
    withFake();
    const r = validateSmartSimEnvelope(ENV);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.envelope).toEqual(ENV); expect(r.plugin.key).toBe("fakeCounter"); }
    expect(projectSmartSimForStudent(ENV)).toEqual(ENV);
  });
  it("fails closed: unknown plugin, unsupported plugin version, schema v2, missing config, extra keys (module / component / grader / import / path / code) — no fallback", () => {
    withFake();
    const codes = (raw: unknown) => { const r = validateSmartSimEnvelope(raw); return r.ok ? [] : r.issues.map(i => i.code); };
    expect(codes({ ...ENV, pluginKey: "chemistryBalance" })).toContain("SMARTSIM_PLUGIN_UNKNOWN");
    expect(codes({ ...ENV, pluginVersion: 2 })).toContain("SMARTSIM_PLUGIN_UNKNOWN");
    expect(codes({ ...ENV, pluginVersion: "1" })).toContain("SMARTSIM_PLUGIN_UNKNOWN");
    expect(codes({ ...ENV, schemaVersion: 2 })).toContain("SMARTSIM_SCHEMA_UNSUPPORTED");
    expect(codes({ ...ENV, config: undefined })).toContain("FAKE_CONFIG_INVALID");
    expect(codes(null)).toEqual(["SMARTSIM_ENVELOPE_MISSING"]);
    for (const k of ["module", "component", "grader", "import", "path", "code", "src", "answer", "checks"]) expect(codes({ ...ENV, [k]: "x" }), k).toContain("SMARTSIM_ENVELOPE_UNKNOWN_KEY");
    expect(codes(JSON.parse('{"schemaVersion":1,"pluginKey":"fakeCounter","pluginVersion":1,"config":{"v":1,"start":0,"max":10},"__proto__":{"x":1}}'))).toContain("SMARTSIM_ENVELOPE_UNKNOWN_KEY");
    for (const bad of [{ ...ENV, pluginKey: "chemistryBalance" }, { ...ENV, pluginVersion: 2 }, { ...ENV, config: { ...ENV.config, target: 3 } }, { ...ENV, checks: [] }]) expect(projectSmartSimForStudent(bad)).toBeUndefined();
  });
});

describe("20A-C3 — the PRIVATE grading key: generic weighted checks + plugin parameters", () => {
  const keyCodes = (raw: unknown) => { const p = resolveSmartSimPlugin("fakeCounter", 1)!; const r = validateSmartSimAnswerKey(raw, p, ENV.config); return r.ok ? [] : r.issues.map(i => i.code); };
  it("a valid key normalizes: total weight, scoring mode, checks in authored order", () => {
    const p = withFake();
    const r = validateSmartSimAnswerKey(KEY, p, ENV.config);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.key.totalWeight).toBe(4); expect(r.key.scoring).toBe("proportional"); expect(r.key.checks.map(c => c.id)).toEqual(["c-exact", "c-min"]); }
  });
  it("refuses every malformed authority: duplicate id, bad weights, unknown kind, empty, too many, bad label, unknown scoring, unknown root key, plugin parameter errors", () => {
    withFake();
    const c = (over: Record<string, unknown>) => ({ ...KEY.checks[0], ...over });
    expect(keyCodes({ ...KEY, checks: [KEY.checks[0], c({ kind: "count.atLeast" })] })).toContain("SMARTSIM_CHECK_ID_DUPLICATE");
    for (const w of [0, -1, NaN, Infinity, "2", null, SMART_SIM_LIMITS.maxWeight + 1]) expect(keyCodes({ ...KEY, checks: [c({ weight: w })] }), String(w)).toContain("SMARTSIM_CHECK_WEIGHT_INVALID");
    expect(keyCodes({ ...KEY, checks: [c({ kind: "count.secret" })] })).toContain("SMARTSIM_CHECK_KIND_UNKNOWN");
    expect(keyCodes({ ...KEY, checks: [] })).toContain("SMARTSIM_CHECKS_EMPTY");
    expect(keyCodes({ ...KEY, checks: Array.from({ length: SMART_SIM_LIMITS.checks + 1 }, (_, i) => c({ id: "c" + i })) })).toContain("SMARTSIM_CHECKS_TOO_MANY");
    for (const label of ["", "   ", 7, "x".repeat(SMART_SIM_LIMITS.checkLabelChars + 1)]) expect(keyCodes({ ...KEY, checks: [c({ label })] })).toContain("SMARTSIM_CHECK_LABEL_INVALID");
    for (const id of ["", "has space", "__proto__", "x".repeat(70), 5]) expect(keyCodes({ ...KEY, checks: [c({ id })] }), String(id)).toContain("SMARTSIM_CHECK_ID_INVALID");
    expect(keyCodes({ ...KEY, scoring: "bestOf" })).toContain("SMARTSIM_SCORING_UNKNOWN");
    expect(keyCodes({ ...KEY, modelState: { count: 3 } })).toContain("SMARTSIM_ANSWER_KEY_INVALID");
    expect(keyCodes({ ...KEY, checks: [c({ value: "3" })] })).toContain("FAKE_CHECK_INVALID");
    expect(keyCodes(undefined)).toContain("SMARTSIM_ANSWER_KEY_INVALID");
    expect(keyCodes({ scoring: "proportional", checks: [JSON.parse('{"id":"x","label":"x","weight":1,"kind":"count.equals","value":1,"__proto__":{"polluted":true}}')] }).length).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("finalization: validateSmartSimQuestion blocks an unknown plugin / version, a bad envelope, a bad key, an unsupported question type version; a valid question has no issue", () => {
    withFake();
    expect(validateSmartSimQuestion(q())).toEqual([]);
    const codes = (node: Record<string, unknown>) => validateSmartSimQuestion(node).map(i => i.code);
    expect(codes(q({ smartSim: { ...ENV, pluginKey: "functionGraph" } }))).toContain("SMARTSIM_PLUGIN_UNKNOWN");
    expect(codes(q({ smartSim: { ...ENV, pluginVersion: 9 } }))).toContain("SMARTSIM_PLUGIN_UNKNOWN");
    expect(codes(q({ answer: { ...KEY, checks: [] } }))).toContain("SMARTSIM_CHECKS_EMPTY");
    expect(codes(q({ questionTypeVersion: 2 }))).toContain("SMARTSIM_VERSION_UNSUPPORTED");
    expect(validateSmartSimQuestion(q()).every(i => i.severity === "error")).toBe(true);
  });
});

describe("20A-C4 — the answer: bounded semantic actions; the SERVER re-derives state by replay", () => {
  it("normalize: exactly {kind, pluginKey, pluginVersion, actions, state}; client score / checks / passed are dropped; malformed shapes refused", () => {
    const r = normalizeSmartSimAnswer(ans([{ type: "inc" }], { score: 8, checks: KEY.checks, passed: true }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.answer).sort()).toEqual(["actions", "kind", "pluginKey", "pluginVersion", "state"]);
    for (const bad of [null, { kind: "smartSim" }, { ...ans([]), actions: "inc" }, { ...ans([]), pluginKey: 5 }, { ...ans([]), pluginVersion: 1.5 }, { ...ans([]), kind: "simulation" }]) expect(normalizeSmartSimAnswer(bad).ok).toBe(false);
    expect(normalizeSmartSimAnswer(ans(Array.from({ length: SMART_SIM_LIMITS.actions + 1 }, () => ({ type: "inc" }))))).toEqual({ ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" });
    expect(normalizeSmartSimAnswer(ans([JSON.parse('{"type":"inc","__proto__":{"x":1}}')])).ok).toBe(false);
    expect(normalizeSmartSimAnswer(ans([{ type: "set", value: NaN }])).ok).toBe(false);
    expect(normalizeSmartSimAnswer(ans([{ type: "inc" }], { state: { blob: "x".repeat(SMART_SIM_LIMITS.answerBytes) } }))).toEqual({ ok: false, code: "SMARTSIM_ANSWER_TOO_LARGE" });
  });
  it("bind: the claimed state is DISCARDED and replaced by the replayed state; a forged perfect state with no actions binds to the INITIAL state", () => {
    withFake();
    const r = bindSmartSimAnswerToQuestion(ans([{ type: "inc" }, { type: "inc" }, { type: "inc" }], { state: { count: 999 } }), q());
    expect(r).toEqual({ ok: true, answer: { kind: "smartSim", pluginKey: "fakeCounter", pluginVersion: 1, actions: [{ type: "inc" }, { type: "inc" }, { type: "inc" }], state: { count: 3 } } });
    const forged = bindSmartSimAnswerToQuestion(ans([], { state: { count: 3 } }), q());
    expect(forged.ok && forged.answer.state).toEqual({ count: 0 });
  });
  it("bind refuses: another question type, another plugin / version than the question's, an unknown / malformed action (nothing is partially applied), the plugin's own action cap", () => {
    withFake();
    expect(bindSmartSimAnswerToQuestion(ans([]), { ...q(), presentationType: "networkCli" })).toEqual({ ok: false, code: "SMARTSIM_QUESTION_MISMATCH" });
    expect(bindSmartSimAnswerToQuestion({ ...ans([]), pluginKey: "networkTopology" }, q())).toEqual({ ok: false, code: "SMARTSIM_PLUGIN_MISMATCH" });
    expect(bindSmartSimAnswerToQuestion({ ...ans([]), pluginVersion: 2 }, q())).toEqual({ ok: false, code: "SMARTSIM_PLUGIN_MISMATCH" });
    expect(bindSmartSimAnswerToQuestion(ans([{ type: "inc" }, { type: "explode" }]), q())).toEqual({ ok: false, code: "SMARTSIM_ACTION_INVALID" });
    expect(bindSmartSimAnswerToQuestion(ans(Array.from({ length: 51 }, () => ({ type: "inc" }))), q())).toEqual({ ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" });
    expect(bindSmartSimAnswerToQuestion(ans([]), q({ smartSim: { ...ENV, pluginKey: "gone" } }))).toEqual({ ok: false, code: "SMARTSIM_QUESTION_INVALID" });
  });
  it("replay is deterministic and pure: frozen inputs are never mutated; equivalent sequences give identical canonical state", () => {
    const p = withFake();
    const cfg = deepFreeze({ v: 1 as const, start: 0, max: 10 });
    const acts = deepFreeze([{ type: "inc" }, { type: "set", value: 5 }, { type: "dec" }]);
    const a = replaySmartSimActions(p, cfg, acts), b = replaySmartSimActions(p, cfg, acts), c = replaySmartSimActions(p, cfg, [{ type: "set", value: 4 }]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) { expect(p.serializeState(a.state)).toBe(p.serializeState(b.state)); expect(p.serializeState(a.state)).toBe(p.serializeState(c.state)); }
  });
});

describe("20A-C5 — weighted partial credit from plugin FACTS; the server score is the only score", () => {
  it("proportional = marks × passedWeight / totalWeight; facts carry {id, label, kind, expected, actual, passed, weight, points}", () => {
    withFake();
    const two = evaluateSmartSim({ envelope: ENV, answerKey: KEY, response: ans([{ type: "inc" }, { type: "inc" }]), maxMarks: 8 });
    expect(two.valid).toBe(true);
    expect(two.score).toBe(6); expect(two.correct).toBe(false); expect(two.manualReview).toBe(false);
    expect(two.checks).toEqual([
      { id: "c-exact", label: "العدد 3", kind: "count.equals", expected: "3", actual: "2", passed: false, weight: 1, points: 0, maxPoints: 2 },
      { id: "c-min", label: "العدد 2 على الأقل", kind: "count.atLeast", expected: "≥ 2", actual: "2", passed: true, weight: 3, points: 6, maxPoints: 6 }
    ]);
    expect(scoreSmartSim({ envelope: ENV, answerKey: KEY, response: ans([{ type: "set", value: 3 }]), maxMarks: 8 })).toEqual({ score: 8, correct: true, manualReview: false, parts: { correct: 2, total: 2 } });
  });
  it("allOrNothing: full or zero", () => {
    withFake();
    const k = { ...KEY, scoring: "allOrNothing" };
    expect(scoreSmartSim({ envelope: ENV, answerKey: k, response: ans([{ type: "inc" }, { type: "inc" }]), maxMarks: 8 }).score).toBe(0);
    expect(scoreSmartSim({ envelope: ENV, answerKey: k, response: ans([{ type: "set", value: 3 }]), maxMarks: 8 }).score).toBe(8);
  });
  it("forgery never earns marks: perfect claimed state + no actions = 0; checks / score / passed smuggled into the response are ignored", () => {
    withFake();
    expect(scoreSmartSim({ envelope: ENV, answerKey: KEY, response: ans([], { state: { count: 3 } }), maxMarks: 8 }).score).toBe(0);
    const smuggled = ans([], { state: { count: 3 }, score: 8, correct: true, checks: [{ id: "c-exact", passed: true, weight: 1000 }] });
    expect(scoreSmartSim({ envelope: ENV, answerKey: KEY, response: smuggled, maxMarks: 8 })).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 2 } });
  });
  it("fails CLOSED on a broken authority (no automatic mark, manual review) and ZERO on a broken student response", () => {
    withFake();
    for (const bad of [{ envelope: { ...ENV, pluginKey: "x" }, answerKey: KEY }, { envelope: { ...ENV, pluginVersion: 2 }, answerKey: KEY }, { envelope: ENV, answerKey: { ...KEY, checks: [] } }, { envelope: ENV, answerKey: { ...KEY, checks: [{ ...KEY.checks[0], weight: 0 }] } }, { envelope: ENV, answerKey: { ...KEY, checks: [KEY.checks[0], KEY.checks[0]] } }])
      expect(scoreSmartSim({ ...bad, response: ans([{ type: "set", value: 3 }]), maxMarks: 8 })).toEqual({ ...SMART_SIM_FAIL_CLOSED, parts: { correct: 0, total: 0 } });
    for (const resp of [undefined, { kind: "text", value: "3" }, ans([{ type: "boom" }]), { ...ans([{ type: "inc" }]), pluginKey: "other" }])
      expect(scoreSmartSim({ envelope: ENV, answerKey: KEY, response: resp, maxMarks: 8 })).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 2 } });
  });
  it("answered ⇔ at least one action (the reset-to-initial answer is unanswered)", () => {
    expect(isSmartSimAnswerAnswered(ans([{ type: "inc" }]))).toBe(true);
    expect(isSmartSimAnswerAnswered(ans([]))).toBe(false);
    expect(isSmartSimAnswerAnswered({ kind: "smartSim" })).toBe(false);
    expect(isSmartSimAnswerAnswered({ kind: "simulation", state: { a: 1 } })).toBe(false);
  });
});

describe("20A-C6 — architecture: domain-neutral, pure, code-owned", () => {
  const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const read = (f: string) => strip(fs.readFileSync(path.join(repo, f), "utf8"));
  it("the core never names a domain (no network / chemistry / math imports) and reaches no I/O, timers, randomness, dynamic code or dynamic import", () => {
    for (const f of ["src/trustedSimRegistry.ts", "src/trustedSimQuestion.ts"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/network|Topology|router|switch\b|\bchem|physics/i);   // \bchem: "schemaVersion" is not a domain word
      expect(s, f).not.toMatch(/\beval\s*\(|new Function|import\(|require\(|fetch\(|XMLHttpRequest|setTimeout|setInterval|Math\.random|Date\.now|document\.|window\.|from "react/);
    }
    expect(read("src/trustedSimPlugins.ts")).not.toMatch(/import\(|require\(/);
    expect(SMART_SIM_TYPE_KEY).toBe("smartSim");
  });
});
