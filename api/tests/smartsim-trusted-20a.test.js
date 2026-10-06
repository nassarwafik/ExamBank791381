import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 20A — the trusted SmartSim core on the SERVER: smartSim@1 is a registered, version-bound grader; the draft / submit ingest binds
// every smartSim answer to its published question and stores the REPLAYED state (the client's claim is discarded); the student sanitizer
// rebuilds the public envelope strictly and never ships the private checks; the framework is domain-neutral (a TEST-ONLY plugin registered
// into the server's own shared registry grades through the same pipeline); simulation@1 stays an untrusted, manual, opaque sandbox type;
// networkCli@1 is byte / behaviour compatible (golden pins recorded on the baseline). Fail-first on a13252803 except the labelled PINS.
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
const ncliEngine = require_("../src/lib/shared-finalization/networkCliEngine.js");
const ncliQuestion = require_("../src/lib/shared-finalization/networkCliQuestion.js");
const loadShared = name => require_("../src/lib/shared-finalization/" + name + ".js");

const g = (r, id) => r.questions.find(x => x.questionId === id);
const exam = questions => ({ examId: "E20A", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });

// ── a TEST-ONLY plugin registered into the SERVER's shared registry (chemistry-balance shaped: H2 + O2 → H2O coefficients) ─────────
const balancePlugin = () => ({
  key: "testBalance", version: 1, label: "موازنة (اختبار)", maxActions: 20, checkKinds: ["balanced", "coefficient"],
  // Phase 20A.1 — every registered plugin carries its code-owned descriptor (metadata only)
  descriptor: { descriptorVersion: 1, key: "testBalance", version: 1, label: "موازنة (اختبار)", domain: "chemistry", sceneKinds: ["2d"], rendererFamilies: ["custom"], capabilities: ["scene.2d", "value.set"], actionKinds: ["setCoefficient"], checkKinds: ["balanced", "coefficient"], genericRules: [], assetKinds: [], tools: ["select"], accessibility: ["keyboardAlternative"], supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false } },
  validateConfig: raw => (raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).join() === "species" && Array.isArray(raw.species) && raw.species.length === 3 ? { ok: true, config: { species: [...raw.species] } } : { ok: false, issues: [{ code: "BAL_CONFIG_INVALID", message: "x" }] }),
  createRuntime: () => ({ coefficients: [1, 1, 1] }),
  normalizeAction: raw => (raw && typeof raw === "object" && Object.keys(raw).sort().join() === "index,type,value" && raw.type === "setCoefficient" && [0, 1, 2].includes(raw.index) && Number.isInteger(raw.value) && raw.value >= 1 && raw.value <= 9 ? { ok: true, action: { type: "setCoefficient", index: raw.index, value: raw.value } } : { ok: false, code: "BAL_ACTION_INVALID" }),
  applyAction: (rt, a) => ({ coefficients: rt.coefficients.map((c, i) => (i === a.index ? a.value : c)) }),
  canonicalState: rt => ({ coefficients: [...rt.coefficients] }),
  serializeState: s => JSON.stringify(s),
  validateCheck: raw => (Object.keys(raw).every(k => ["id", "label", "weight", "kind", "index", "value"].includes(k)) ? { ok: true, check: { ...raw } } : { ok: false, issues: [{ code: "BAL_CHECK_INVALID", message: "x" }] }),
  evaluateCheck: (c, s) => {
    if (c.kind === "balanced") { const [h2, o2, h2o] = s.coefficients; const ok = 2 * h2 === 2 * h2o && 2 * o2 === h2o; return { expected: "balanced", actual: ok ? "balanced" : "unbalanced", passed: ok }; }
    return { expected: String(c.value), actual: String(s.coefficients[c.index]), passed: s.coefficients[c.index] === c.value };
  }
});
const BAL_ENV = { schemaVersion: 1, pluginKey: "testBalance", pluginVersion: 1, config: { species: ["H2", "O2", "H2O"] } };
const BAL_KEY = { scoring: "proportional", checks: [{ id: "bal", label: "المعادلة موزونة", weight: 3, kind: "balanced" }, { id: "h2o", label: "معامل H2O", weight: 1, kind: "coefficient", index: 2, value: 2 }] };
const balQ = (over = {}) => ({ examQuestionId: "b1", presentationType: "smartSim", questionTypeVersion: 1, text: "وازن", marks: 4, smartSim: BAL_ENV, answer: BAL_KEY, ...over });
const balAns = (actions, extra = {}) => ({ kind: "smartSim", pluginKey: "testBalance", pluginVersion: 1, actions, state: { coefficients: [2, 1, 2] }, ...extra });
const set = (index, value) => ({ type: "setCoefficient", index, value });
const undo = [];
afterEach(() => { while (undo.length) undo.pop()(); });
const withBalance = () => { undo.push(loadShared("trustedSimRegistry").registerSmartSimPlugin(balancePlugin())); };

describe("20A-S1 — smartSim@1 is a registered, version-bound authoritative grader", () => {
  it("catalog: 24 types, smartSim last, auto / partial / interactive / offline, not compound; grader for v1 only; the production plugin set is networkTopology@1 + the 20A.2 pilots", () => {
    expect(catalog.QUESTION_TYPE_CATALOG.length).toBe(25);   /* 20D adds composite (after compound) */
    expect(catalog.QUESTION_TYPE_CATALOG.at(-1).key).toBe("smartSim");
    expect(catalog.questionTypeDefinition("smartSim")).toMatchObject({ version: 1, gradingMode: "auto", legacy: false, responseKinds: ["smartSim"] });
    expect(catalog.questionTypeDefinition("smartSim").capabilities).toMatchObject({ autoGrading: true, partialCredit: true, compoundPart: false, interactive: true, offline: true });
    expect(typeof resolveGrader("smartSim", 1)).toBe("function"); expect(resolveGrader("smartSim", 2)).toBeUndefined();
    expect(loadShared("trustedSimPlugins").listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2"]);   // Phase 20C added networkTopology@2 (a NEW exact identity; v1 unchanged)
  });
  it("domain-neutral: a test-only plugin registered in the server registry is graded by gradeExam with weighted partial credit from replayed state", () => {
    withBalance();
    expect(g(gradeExam(exam([balQ()]), { b1: balAns([set(0, 2), set(2, 2)]) }), "b1")).toMatchObject({ score: 4, correct: true, manualReview: false, parts: { correct: 2, total: 2 } });
    expect(g(gradeExam(exam([balQ()]), { b1: balAns([set(2, 2)]) }), "b1")).toMatchObject({ score: 1, correct: false, manualReview: false });
    expect(g(gradeExam(exam([balQ()]), { b1: balAns([], { score: 4, correct: true }) }), "b1")).toMatchObject({ score: 0, manualReview: false });
  });
  it("fails closed: unknown plugin (the test plugin unregistered), unsupported plugin version, broken key, questionTypeVersion 2 ⇒ 0 + manual review; never another plugin, never full credit", () => {
    expect(g(gradeExam(exam([balQ()]), { b1: balAns([set(0, 2), set(2, 2)]) }), "b1")).toMatchObject({ score: 0, manualReview: true });
    withBalance();
    expect(g(gradeExam(exam([balQ({ smartSim: { ...BAL_ENV, pluginVersion: 2 } })]), { b1: balAns([set(0, 2)]) }), "b1")).toMatchObject({ score: 0, manualReview: true });
    expect(g(gradeExam(exam([balQ({ answer: { ...BAL_KEY, checks: [BAL_KEY.checks[0], BAL_KEY.checks[0]] } })]), { b1: balAns([set(0, 2), set(2, 2)]) }), "b1")).toMatchObject({ score: 0, manualReview: true });
    expect(g(gradeExam(exam([balQ({ answer: { ...BAL_KEY, checks: [{ ...BAL_KEY.checks[0], weight: Infinity }] } })]), { b1: balAns([set(0, 2), set(2, 2)]) }), "b1")).toMatchObject({ score: 0, manualReview: true });
    expect(g(gradeExam(exam([balQ({ questionTypeVersion: 2 })]), { b1: balAns([set(0, 2), set(2, 2)]) }), "b1")).toMatchObject({ score: 0, manualReview: true });
  });
});

describe("20A-S2 — ingest binds to the published question and stores the SERVER-derived state", () => {
  it("bound: claimed state replaced by replay; client score / checks / passed dropped; exact stored shape", () => {
    withBalance();
    const r = normalizeDraftAnswers({ b1: balAns([set(2, 2)], { state: { coefficients: [2, 1, 2] }, score: 4, checks: BAL_KEY.checks, passed: true }) }, exam([balQ()]));
    expect(r.rejected).toEqual([]);
    expect(r.answers.b1).toEqual({ kind: "smartSim", pluginKey: "testBalance", pluginVersion: 1, actions: [set(2, 2)], state: { coefficients: [1, 1, 2] } });
  });
  it("refused with a precise code: another question type, unknown id, mismatching plugin, malformed action, compound part, oversized / prototype-polluted payload", () => {
    withBalance();
    const sa = { examQuestionId: "sa1", presentationType: "shortAnswer", text: "x", marks: 1, answer: { text: "x" } };
    const comp = { examQuestionId: "c1", presentationType: "compound", text: "c", marks: 2, parts: [{ id: "p1", type: "shortAnswer", text: "x", marks: 2 }] };
    const r = normalizeDraftAnswers({
      sa1: balAns([set(0, 2)]), ghost: balAns([]), b1: { ...balAns([]), pluginKey: "networkTopology" },
      c1: { kind: "compound", parts: { p1: balAns([]) } }
    }, exam([balQ(), sa, comp]));
    expect(r.rejected).toEqual(expect.arrayContaining([{ id: "sa1", code: "SMARTSIM_QUESTION_MISMATCH" }, { id: "ghost", code: "SMARTSIM_QUESTION_MISMATCH" }, { id: "b1", code: "SMARTSIM_PLUGIN_MISMATCH" }, { id: "c1.p1", code: "SMARTSIM_QUESTION_MISMATCH" }]));
    expect(normalizeDraftAnswers({ b1: balAns([set(5, 2)]) }, exam([balQ()])).rejected).toEqual([{ id: "b1", code: "SMARTSIM_ACTION_INVALID" }]);
    expect(normalizeDraftAnswers({ b1: balAns(Array.from({ length: 21 }, () => set(0, 1))) }, exam([balQ()])).rejected).toEqual([{ id: "b1", code: "SMARTSIM_ACTIONS_TOO_MANY" }]);
    expect(normalizeDraftAnswers({ b1: JSON.parse('{"kind":"smartSim","pluginKey":"testBalance","pluginVersion":1,"actions":[{"type":"setCoefficient","index":0,"value":2,"__proto__":{"polluted":1}}],"state":{}}') }, exam([balQ()])).rejected[0].id).toBe("b1");
    expect(({}).polluted).toBeUndefined();
    const onSmartSimQ = normalizeDraftAnswers({ b1: { kind: "text", value: "2 1 2" } }, exam([balQ()]));
    expect(onSmartSimQ.rejected).toEqual([{ id: "b1", code: "SMARTSIM_ANSWER_INVALID" }]);
  });
  it("isResponseAnswered mirrors the client: ≥ 1 action", () => {
    expect(isResponseAnswered(balAns([set(0, 2)]))).toBe(true);
    expect(isResponseAnswered(balAns([]))).toBe(false);
    expect(isResponseAnswered({ kind: "smartSim" })).toBe(false);
  });
});

describe("20A-S3 — the student projection: strict public envelope, private key never shipped", () => {
  it("sanitizeExamForStudent keeps exactly {schemaVersion, pluginKey, pluginVersion, config}; a smuggled field anywhere withholds the whole envelope; unknown plugins are withheld", () => {
    withBalance();
    const out = sanitizeExamForStudent(exam([balQ({ teacherNote: "CANARY-NOTE-20A" })])).sections[0].questions[0];
    expect(out.smartSim).toEqual(BAL_ENV); expect(out.answer).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(/المعادلة موزونة|"checks"|"weight"|"scoring"|CANARY-NOTE-20A/);   // the legacy sanitizer keeps a blanked teacherNote key ("")
    for (const bad of [{ ...BAL_ENV, checks: BAL_KEY.checks }, { ...BAL_ENV, config: { ...BAL_ENV.config, answer: [2, 1, 2] } }, { ...BAL_ENV, pluginKey: "unknownLab" }, { ...BAL_ENV, pluginVersion: 7 }, { ...BAL_ENV, grader: "./x.js" }])
      expect(sanitizeExamForStudent(exam([balQ({ smartSim: bad })])).sections[0].questions[0].smartSim).toBeUndefined();
  });
});

describe("20A-S4 — simulation@1 stays an UNTRUSTED, sandboxed, manual, opaque type (security pins)", () => {
  const simQ = (over = {}) => ({ examQuestionId: "m1", presentationType: "simulation", questionTypeVersion: 1, text: "sim", marks: 5, simulation: { packageId: "pkg-1", version: 1 }, ...over });
  it("PIN — the simulation@1 grader is 0 + manual review whatever the state, the question or a smuggled trusted-plugin claim says", () => {
    const smuggled = { kind: "simulation", state: { pluginKey: "networkTopology", pluginVersion: 1, actions: [], score: 5, passed: true, SMARTSIM_SCORE: 5 } };
    const r = g(gradeExam(exam([simQ({ smartSim: BAL_ENV, answer: BAL_KEY })]), { m1: smuggled }), "m1");
    expect(r).toMatchObject({ score: 0, manualReview: true });
  });
  it("a simulation answer stays an opaque bounded state (pin); NEW: a smartSim-shaped answer can never ride on a simulation question", () => {
    const r = normalizeDraftAnswers({ m1: { kind: "simulation", state: { step: 3, score: 5 } } }, exam([simQ()]));
    expect(r.answers.m1).toEqual({ kind: "simulation", state: { step: 3, score: 5 } });
    expect(normalizeDraftAnswers({ m1: balAns([set(0, 2)]) }, exam([simQ()])).rejected).toEqual([{ id: "m1", code: "SMARTSIM_QUESTION_MISMATCH" }]);
  });
  it("no exam data or uploaded package can register / select a trusted plugin: registration needs repository code (functions), the sandbox attribute is unchanged, the simulation host never names the trusted registry", () => {
    const reg = loadShared("trustedSimRegistry");
    expect(() => reg.registerSmartSimPlugin(JSON.parse(JSON.stringify(balancePlugin())))).toThrow();
    expect(() => reg.registerSmartSimPlugin({ key: "networkTopology", version: 1 })).toThrow();
    const host = fs.readFileSync(path.join(repo, "src/smartsim/SimulationSandboxHost.tsx"), "utf8");
    expect(host).toMatch(/sandbox="allow-scripts"/);
    for (const f of ["src/smartsim/SimulationSandboxHost.tsx", "src/smartsim/smartsimBridge.ts", "src/smartsimState.ts", "src/smartsimManifest.ts", "src/questionTypes/student/SimulationResponse.tsx"]) expect(fs.readFileSync(path.join(repo, f), "utf8"), f).not.toMatch(/trustedSim|smartSimQuestion|networkTopology/);
    expect(resolveGrader("simulation", 1)(simQ(), { kind: "smartSim" }, 5)).toEqual({ score: 0, manualReview: true, correct: false });
  });
});

describe("20A-S5 — networkCli@1 is byte / behaviour compatible (golden PINS recorded on a13252803)", () => {
  const INIT = { v: 1, device: "switch", hostname: "LAB-SW", vlans: {}, interfaces: {} };
  const FULL = ["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name SALES-SECRET", "exit", "interface fastEthernet 0/5", "switchport mode access", "switchport access vlan 20", "exit", "interface gigabitEthernet 0/1", "switchport mode trunk", "switchport trunk native vlan 99", "exit", "interface vlan 20", "ip address 192.168.20.2 255.255.255.0", "no shutdown", "end"];
  const KEY = { targetState: { hostname: "BR1-SW1", vlans: { "20": { name: "SALES-SECRET" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 }, "g0/1": { mode: "trunk", nativeVlan: 99 }, "vlan20": { ipAddress: "192.168.20.2", subnetMask: "255.255.255.0", shutdown: false } } }, scoring: "proportional" };
  it("PIN — canonical serialization, prompts / statuses, show-command output and per-check ids are unchanged", () => {
    const r = ncliEngine.replayCommands(INIT, FULL);
    expect(ncliEngine.serializeState(r.session.state)).toBe('{"v":1,"device":"switch","hostname":"BR1-SW1","vlans":{"20":{"name":"SALES-SECRET"}},"interfaces":{"f0/5":{"mode":"access","accessVlan":20},"g0/1":{"mode":"trunk","nativeVlan":99},"vlan20":{"ipAddress":"192.168.20.2","subnetMask":"255.255.255.0"}}}');
    expect(r.entries.map(x => x.prompt + "|" + x.result.status)).toEqual(["LAB-SW>|ok", "LAB-SW#|ok", "LAB-SW(config)#|ok", "BR1-SW1(config)#|ok", "BR1-SW1(config-vlan)#|ok", "BR1-SW1(config-vlan)#|ok", "BR1-SW1(config)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config-if)#|ok", "BR1-SW1(config-if)#|ok"]);
    const shows = ncliEngine.showRunningConfig(r.session.state).join("\n") + ncliEngine.showVlanBrief(r.session.state).join("\n") + ncliEngine.showIpInterfaceBrief(r.session.state).join("\n") + ncliEngine.showInterfacesTrunk(r.session.state).join("\n");
    expect(crypto.createHash("sha256").update(shows).digest("hex")).toBe("ccb8c8f38e2c3088d909b899180df64ad1cfb1fc6761e0328e8da1d43acd37a7");
    expect(ncliQuestion.evaluateNetworkCliTarget(KEY.targetState, r.session.state).map(c => c.id + "=" + c.ok)).toEqual(["hostname=true", "vlan:20:exists=true", "vlan:20:name=true", "if:f0/5:mode=true", "if:f0/5:accessVlan=true", "if:g0/1:mode=true", "if:g0/1:nativeVlan=true", "if:vlan20:shutdown=true", "if:vlan20:ipAddress=true", "if:vlan20:subnetMask=true"]);
  });
  it("PIN — grading, answer shape and ingest binding of networkCli@1 are unchanged", () => {
    const q = { examQuestionId: "n1", presentationType: "networkCli", questionTypeVersion: 1, text: "x", marks: 10, networkCli: { device: "switch", initialState: INIT }, answer: KEY };
    const half = FULL.slice(0, 9);
    const resp = { kind: "networkCli", commands: half, state: ncliEngine.replayCommands(INIT, half).session.state };
    expect(g(gradeExam(exam([q]), { n1: resp }), "n1")).toMatchObject({ score: 5, correct: false, manualReview: false, parts: { correct: 5, total: 10 } });
    const bound = normalizeDraftAnswers({ n1: { ...resp, state: INIT, score: 10 } }, exam([q]));
    expect(bound.answers.n1).toEqual(resp);
    expect(sanitizeExamForStudent(exam([q])).sections[0].questions[0].networkCli).toEqual({ device: "switch", initialState: INIT });
  });
});

describe("20A-S6 — shared build parity and purity", () => {
  const strip = t => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  it("the trusted core and the network plugin are compiled from the SAME TypeScript (SHARED_ENTRIES) and behave identically", async () => {
    for (const f of ["src/trustedSimRegistry.ts", "src/trustedSimQuestion.ts", "src/trustedSimPlugins.ts", "src/routerCliEngine.ts", "src/networkTopologyModel.ts", "src/networkConnectivity.ts", "src/networkTopologyPlugin.ts"]) expect(SHARED_ENTRIES).toContain(f);
    const ts = await import("../../src/trustedSimPlugins.ts");
    const tpl = await import("../../src/networkTopology/networkTopologyTemplates.ts");
    const env = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: tpl.routerTwoSwitchesFourPcsTemplate() };
    const key = { scoring: "proportional", checks: tpl.twoLanDemoChecks() };
    const actions = [{ type: "pc.setAddress", deviceId: "pc1", value: "192.168.10.10" }, { type: "router.command", deviceId: "r1", command: "enable" }];
    const resp = { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions, state: {} };
    expect(loadShared("trustedSimPlugins").evaluateSmartSim({ envelope: env, answerKey: key, response: resp, maxMarks: 23 })).toEqual(ts.evaluateSmartSim({ envelope: env, answerKey: key, response: resp, maxMarks: 23 }));
  });
  it("no process / filesystem / network / dynamic-code / timer / randomness API in the new pure modules or their committed server copies", () => {
    for (const base of ["trustedSimRegistry", "trustedSimQuestion", "trustedSimPlugins", "routerCliEngine", "networkTopologyModel", "networkConnectivity", "networkTopologyPlugin"])
      for (const f of ["src/" + base + ".ts", "api/src/lib/shared-finalization/" + base + ".js"]) {
        const s = strip(fs.readFileSync(path.join(repo, f), "utf8"));
        expect(s, f).not.toMatch(/\beval\s*\(|new Function|child_process|\.spawn\(|execSync|execFile|\bprocess\.|node:fs|require\("fs"|node:net|node:http|fetch\(|XMLHttpRequest|WebSocket|import\(|setTimeout|setInterval|Math\.random|Date\.now/);
      }
  });
});
