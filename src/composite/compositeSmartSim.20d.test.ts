import { describe, it, expect, afterEach } from "vitest";
import { registerSmartSimPlugin, type SmartSimPlugin, type SmartSimCheckBase } from "../trustedSimRegistry";
import { evaluateSmartSim, prepareSmartSimEvaluation, evaluatePreparedSmartSimChecks } from "../trustedSimPlugins";
import { freeFallClassroomConfig, freeFallClassroomChecks } from "../physicsFreeFall/freeFallTemplates";
import { net2TemplateById } from "../networkTopology2/net2Templates";

// Phase 20D — the trusted SmartSim core gains an ADDITIVE "prepare once / evaluate many" seam so ONE shared context (one public envelope,
// one student action stream) serves several independently scored parts: the envelope is validated and the actions replayed ONCE, then each
// part's PRIVATE key is validated against that SAME envelope and evaluated on the SAME server-derived state. evaluateSmartSim keeps its exact
// output (it is the composition of the two). Fail-first on caac213: prepareSmartSimEvaluation / evaluatePreparedSmartSimChecks do not exist.
type FakeConfig = { v: 1; start: number };
type FakeAction = { type: "inc" };
type FakeCheck = SmartSimCheckBase & { value: number };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const counters = { createRuntime: 0, applyAction: 0 };
const counting = (): SmartSimPlugin<FakeConfig, { count: number }, { count: number }, FakeAction, FakeCheck> => ({
  key: "countingSim", version: 1, label: "عداد (اختبار 20D)", maxActions: 50, checkKinds: ["count.equals"],
  descriptor: { descriptorVersion: 1, key: "countingSim", version: 1, label: "عداد (اختبار 20D)", domain: "general", sceneKinds: ["2d"], rendererFamilies: ["custom"], capabilities: ["scene.2d", "value.set"], actionKinds: ["inc"], checkKinds: ["count.equals"], genericRules: [], assetKinds: [], tools: ["select"], accessibility: ["keyboardAlternative"], supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false } },
  validateConfig: raw => (isObj(raw) && raw.v === 1 && Number.isInteger(raw.start) && Object.keys(raw).length === 2 ? { ok: true, config: { v: 1, start: raw.start as number } } : { ok: false, issues: [{ code: "X", message: "x" }] }),
  createRuntime: c => { counters.createRuntime++; return { count: c.start }; },
  normalizeAction: raw => (isObj(raw) && raw.type === "inc" && Object.keys(raw).length === 1 ? { ok: true, action: { type: "inc" } } : { ok: false, code: "X" }),
  applyAction: rt => { counters.applyAction++; return { count: rt.count + 1 }; },
  canonicalState: rt => ({ count: rt.count }),
  serializeState: s => JSON.stringify(s),
  validateCheck: raw => (Number.isInteger(raw.value) && Object.keys(raw).length === 5 ? { ok: true, check: { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as string, value: raw.value as number } } : { ok: false, issues: [{ code: "Y", message: "y" }] }),
  evaluateCheck: (c, s) => ({ expected: String(c.value), actual: String(s.count), passed: s.count === c.value })
});
const undo: (() => void)[] = [];
afterEach(() => { while (undo.length) undo.pop()!(); });

const FF_ENV = { schemaVersion: 1, pluginKey: "physicsFreeFall", pluginVersion: 1, config: freeFallClassroomConfig() };
const ffAnswer = (actions: unknown[], state: unknown = null) => ({ kind: "smartSim", pluginKey: "physicsFreeFall", pluginVersion: 1, actions, state });
const GOOD = [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }, { type: "measurement.set", measurementId: "impactSpeed", value: 19.8 }, { type: "measurement.set", measurementId: "heightAt1s", value: 15.1 }, { type: "graphPoint.set", pointId: "pointAt1s", t: 1, y: 15.1 }];
const roas = net2TemplateById("roas")!;
const NET_ENV = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: roas.config() };
const netAnswer = (actions: unknown[]) => ({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state: null });
const NET_ACTIONS = [{ type: "switch.command", deviceId: "sw1", command: "enable" }, { type: "switch.command", deviceId: "sw1", command: "configure terminal" }, { type: "switch.command", deviceId: "sw1", command: "vlan 10" }];

describe("20D-SS1 evaluateSmartSim === prepare + evaluatePrepared (byte-identical, every branch)", () => {
  const key = (checks: unknown[], scoring?: string) => (scoring ? { scoring, checks } : { checks });
  const inputs: [string, Record<string, unknown>, { withDetails?: boolean }][] = [
    ["valid, partial", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: ffAnswer(GOOD), maxMarks: 12 }, {}],
    ["valid, allOrNothing", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks(), "allOrNothing"), response: ffAnswer(GOOD), maxMarks: 12 }, {}],
    ["with details", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: ffAnswer(GOOD), maxMarks: 7 }, { withDetails: true }],
    ["net2 with transcripts", { envelope: NET_ENV, answerKey: key(roas.checks()), response: netAnswer(NET_ACTIONS), maxMarks: 10 }, { withDetails: true }],
    ["invalid envelope", { envelope: { ...FF_ENV, pluginVersion: 9 }, answerKey: key(freeFallClassroomChecks()), response: ffAnswer(GOOD), maxMarks: 5 }, {}],
    ["invalid key", { envelope: FF_ENV, answerKey: key([{ id: "x", label: "x", weight: 1, kind: "nope" }]), response: ffAnswer(GOOD), maxMarks: 5 }, {}],
    ["invalid key + invalid response", { envelope: FF_ENV, answerKey: { checks: [] }, response: "junk", maxMarks: 5 }, {}],
    ["no response", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: undefined, maxMarks: 5 }, {}],
    ["wrong plugin identity", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: netAnswer([]), maxMarks: 5 }, {}],
    ["replay refused", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: ffAnswer([{ type: "camera.pan" }]), maxMarks: 5 }, {}],
    ["forged state claims full marks", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: ffAnswer([], { v: 1, measurements: { impactTime: 2.02 }, points: {} }), maxMarks: 5 }, {}],
    ["negative max", { envelope: FF_ENV, answerKey: key(freeFallClassroomChecks()), response: ffAnswer(GOOD), maxMarks: -3 }, {}]
  ];
  for (const [name, input, options] of inputs) it(name, () => {
    const prepared = prepareSmartSimEvaluation({ envelope: input.envelope, response: input.response });
    const direct = evaluateSmartSim(input as never, options);
    expect(JSON.stringify(evaluatePreparedSmartSimChecks(prepared, { answerKey: input.answerKey, maxMarks: input.maxMarks as number }, options))).toBe(JSON.stringify(direct));
  });
});

describe("20D-SS2 one replay serves many independently validated private keys", () => {
  it("the actions are normalized and replayed ONCE however many linked parts are evaluated", () => {
    undo.push(registerSmartSimPlugin(counting()));
    counters.createRuntime = 0; counters.applyAction = 0;
    const prepared = prepareSmartSimEvaluation({ envelope: { schemaVersion: 1, pluginKey: "countingSim", pluginVersion: 1, config: { v: 1, start: 0 } }, response: { kind: "smartSim", pluginKey: "countingSim", pluginVersion: 1, actions: [{ type: "inc" }, { type: "inc" }, { type: "inc" }], state: { count: 99 } } });
    const ev = (value: number, marks: number) => evaluatePreparedSmartSimChecks(prepared, { answerKey: { checks: [{ id: "c", label: "c", weight: 1, kind: "count.equals", value }] }, maxMarks: marks });
    const [a, b, c] = [ev(3, 4), ev(2, 4), ev(3, 2)];
    expect([a.score, b.score, c.score]).toEqual([4, 0, 2]);
    expect(counters).toEqual({ createRuntime: 1, applyAction: 3 });
  });
  it("each part's key is validated against the SHARED envelope (a key naming an unknown measurement fails closed for THAT part only)", () => {
    const prepared = prepareSmartSimEvaluation({ envelope: FF_ENV, response: ffAnswer(GOOD) });
    const ok = evaluatePreparedSmartSimChecks(prepared, { answerKey: { checks: [freeFallClassroomChecks()[0]] }, maxMarks: 3 });
    const bad = evaluatePreparedSmartSimChecks(prepared, { answerKey: { checks: [{ ...freeFallClassroomChecks()[0], measurementId: "nope" }] }, maxMarks: 3 });
    expect(ok).toMatchObject({ valid: true, score: 3, manualReview: false });
    expect(bad).toMatchObject({ valid: false, score: 0, manualReview: true });
  });
  it("a response whose actions do not REPLAY is scored on NO state (0, no fabricated check facts) — never on an empty / default state", () => {
    undo.push(registerSmartSimPlugin(counting()));
    const env = { schemaVersion: 1, pluginKey: "countingSim", pluginVersion: 1, config: { v: 1, start: 0 } };
    const prepared = prepareSmartSimEvaluation({ envelope: env, response: { kind: "smartSim", pluginKey: "countingSim", pluginVersion: 1, actions: [{ type: "inc" }, { type: "dec" }], state: { count: 0 } } });
    const r = evaluatePreparedSmartSimChecks(prepared, { answerKey: { checks: [{ id: "c", label: "c", weight: 1, kind: "count.equals", value: 0 }] }, maxMarks: 4 });
    expect(r).toMatchObject({ valid: true, score: 0, passedWeight: 0, checks: [] });
  });
  it("the prepared object is code-owned: frozen, and a forged / copied / foreign object is refused (fail closed, never graded)", () => {
    const prepared = prepareSmartSimEvaluation({ envelope: FF_ENV, response: ffAnswer(GOOD) });
    expect(Object.isFrozen(prepared)).toBe(true);
    const k = { answerKey: { checks: freeFallClassroomChecks() }, maxMarks: 12 };
    for (const forged of [{ ...prepared }, JSON.parse(JSON.stringify(prepared)), { ok: true, state: { v: 1, measurements: { impactTime: 2.02 }, points: {} } }, null, undefined])
      expect(evaluatePreparedSmartSimChecks(forged as never, k)).toMatchObject({ valid: false, score: 0, manualReview: true });
  });
});
