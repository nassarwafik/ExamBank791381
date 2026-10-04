import { describe, it, expect } from "vitest";
import {
  NETWORK_CLI_SCORING_MODES, defaultNetworkCliConfig, defaultNetworkCliAnswerKey, validateNetworkCliQuestion, projectNetworkCliConfigForStudent,
  normalizeNetworkCliAnswer, bindNetworkCliAnswerToQuestion, initialStateOf, evaluateNetworkCliTarget, scoreNetworkCli, targetCheckCount, isNetworkCliAnswerAnswered,
  networkCliQuestionVersion, type NetworkCliAnswerKeyV1, type NetworkCliQuestionConfigV1
} from "./networkCliQuestion";
import { createDeviceState, replayCommands, serializeState } from "./networkCliEngine";

// Phase 18C — networkCli@1 question model: public config (device + initial state), PRIVATE target state under `answer`,
// finalization validation, the allow-list student projection, answer ingest bound to the published question (server-side
// replay of the command history), and canonical-state grading with per-check partial credit. New-function tests.
const CFG: NetworkCliQuestionConfigV1 = { device: "switch", initialState: { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} } };
const KEY: NetworkCliAnswerKeyV1 = { targetState: { hostname: "BR1-SW1", vlans: { "20": { name: "SALES" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 }, "g0/1": { mode: "trunk", nativeVlan: 99 }, "vlan20": { ipAddress: "192.168.20.2", subnetMask: "255.255.255.0", shutdown: false } } }, scoring: "proportional" };
const question = (over: Record<string, unknown> = {}) => ({ examQuestionId: "n1", presentationType: "networkCli", questionTypeVersion: 1, text: "اضبط المبدّل", marks: 10, networkCli: CFG, answer: KEY, ...over });
const FULL = ["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name SALES", "exit", "interface fastEthernet 0/5", "switchport mode access", "switchport access vlan 20", "exit", "interface gigabitEthernet 0/1", "switchport mode trunk", "switchport trunk native vlan 99", "exit", "interface vlan 20", "ip address 192.168.20.2 255.255.255.0", "no shutdown", "end"];
const EQUIVALENT = ["en", "conf t", "int fa0/5", "switchport access vlan 20", "switchport mode access", "int g0/1", "switchport trunk native vlan 99", "switchport mode trunk", "int vlan 20", "ip address 192.168.20.2 255.255.255.0", "exit", "vlan 20", "name SALES", "exit", "hostname BR1-SW1", "end", "show running-config"];
const answerOf = (commands: string[]) => { const r = replayCommands(CFG.initialState, commands); return { kind: "networkCli" as const, commands, state: r.session.state }; };

describe("defaults and validation (every problem blocks finalization)", () => {
  it("a new question: switch, default initial state, EMPTY private target (blocked until the teacher sets at least one check), proportional scoring", () => {
    expect(defaultNetworkCliConfig()).toEqual(CFG);
    expect(defaultNetworkCliAnswerKey()).toEqual({ targetState: {}, scoring: "proportional" });
    expect(NETWORK_CLI_SCORING_MODES).toEqual(["proportional", "allOrNothing"]);
    expect(validateNetworkCliQuestion({ networkCli: defaultNetworkCliConfig(), answer: defaultNetworkCliAnswerKey() }).map(i => i.code)).toEqual(["NETCLI_TARGET_EMPTY"]);
    expect(validateNetworkCliQuestion(question())).toEqual([]);
    expect(targetCheckCount(KEY.targetState)).toBe(10);
  });
  it("refuses a missing / malformed config, unknown keys, bad initial state, bad target values and unknown scoring — with paths", () => {
    const codes = (node: Record<string, unknown>) => validateNetworkCliQuestion(node).map(i => i.code);
    expect(codes({ answer: KEY })).toEqual(["NETCLI_CONFIG_MISSING"]);
    expect(codes(question({ networkCli: { device: "router", initialState: CFG.initialState } }))).toContain("NETCLI_DEVICE_UNSUPPORTED");
    expect(codes(question({ networkCli: { ...CFG, extra: 1 } }))).toContain("NETCLI_CONFIG_UNKNOWN_KEY");
    expect(codes(question({ networkCli: { device: "switch", initialState: { ...CFG.initialState, hostname: "1bad" } } }))).toContain("NETCLI_INITIAL_STATE_INVALID");
    expect(codes(question({ networkCli: { device: "switch", initialState: { ...CFG.initialState, interfaces: { "f0/1": { ipAddress: "10.0.0.1", subnetMask: "255.0.0.0" } } } } }))).toContain("NETCLI_INITIAL_STATE_INVALID");
    expect(codes(question({ answer: { targetState: { hostname: "bad name" } } }))).toContain("NETCLI_TARGET_HOSTNAME_INVALID");
    expect(codes(question({ answer: { targetState: { vlans: { "1": {} } } } }))).toContain("NETCLI_TARGET_VLAN_INVALID");
    expect(codes(question({ answer: { targetState: { vlans: { "20": { name: "a b" } } } } }))).toContain("NETCLI_TARGET_VLAN_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "f0/99": { mode: "access" } } } } }))).toContain("NETCLI_TARGET_INTERFACE_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "vlan10": { mode: "access" } } } } }))).toContain("NETCLI_TARGET_INTERFACE_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "f0/1": { ipAddress: "10.0.0.1", subnetMask: "255.0.0.0" } } } } }))).toContain("NETCLI_TARGET_INTERFACE_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "f0/1": { accessVlan: 5000 } } } } }))).toContain("NETCLI_TARGET_INTERFACE_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "f0/1": { mode: "dynamic" } } } } }))).toContain("NETCLI_TARGET_INTERFACE_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "f0/1": { shutdown: "no" } } } } }))).toContain("NETCLI_TARGET_INTERFACE_INVALID");
    expect(codes(question({ answer: { targetState: { interfaces: { "f0/1": {} } } } }))).toContain("NETCLI_TARGET_EMPTY");
    expect(codes(question({ answer: { targetState: { hostname: "X" }, scoring: "bonus" } }))).toContain("NETCLI_SCORING_UNKNOWN");
    expect(codes(question({ answer: { targetState: { hostname: "X", extra: 1 } } }))).toContain("NETCLI_TARGET_UNKNOWN_KEY");
    expect(codes(question({ answer: {} }))).toEqual(["NETCLI_TARGET_MISSING"]);
    const paths = validateNetworkCliQuestion(question({ answer: { targetState: { interfaces: { "f0/1": { accessVlan: 0 } } } } })).map(i => i.path);
    expect(paths).toContain("answer.targetState.interfaces.f0/1");
    for (const i of validateNetworkCliQuestion(question({ networkCli: {} }))) expect(i.severity).toBe("error");
  });
  it("interface names in the target may use any accepted spelling; the validator and grader canonicalize (FastEthernet0/5 ≡ fa0/5 ≡ f0/5)", () => {
    expect(validateNetworkCliQuestion(question({ answer: { targetState: { interfaces: { "FastEthernet0/5": { mode: "access" }, "Vlan 20": { shutdown: false } } } } }))).toEqual([]);
    const r = scoreNetworkCli({ config: CFG, answerKey: { targetState: { interfaces: { "FastEthernet0/5": { mode: "access" } } } }, response: answerOf(FULL), maxMarks: 4 });
    expect(r.score).toBe(4);
  });
  it("the question type version is normalized by the ONE catalog authority: absent / 1 → 1, 2 or garbage → unsupported (blocking)", () => {
    expect(networkCliQuestionVersion({ questionTypeVersion: undefined })).toBe(1); expect(networkCliQuestionVersion({ questionTypeVersion: 1 })).toBe(1);
    expect(networkCliQuestionVersion({ questionTypeVersion: 2 })).toBeUndefined(); expect(networkCliQuestionVersion({ questionTypeVersion: "1" })).toBeUndefined();
    expect(validateNetworkCliQuestion(question({ questionTypeVersion: 2 })).map(i => i.code)).toContain("NETCLI_VERSION_UNSUPPORTED");
  });
});

describe("student projection: allow-list rebuild of the PUBLIC configuration only", () => {
  it("keeps device + canonical initial state; drops anything else, including smuggled target / secret-looking keys; malformed → undefined", () => {
    const smuggled = { ...CFG, targetState: KEY.targetState, expectedHostname: "X", initialState: { ...CFG.initialState, hostname: "LAB", answerKey: { x: 1 }, interfaces: { "f0/1": { mode: "access", accessVlan: 10, correct: true } } } } as unknown;
    const p = projectNetworkCliConfigForStudent(smuggled);
    expect(p).toEqual({ device: "switch", initialState: { v: 1, device: "switch", hostname: "LAB", vlans: { "10": {} }, interfaces: { "f0/1": { mode: "access", accessVlan: 10 } } } });
    expect(JSON.stringify(p)).not.toMatch(/target|expected|answerKey|correct|SALES|BR1-SW1/);
    expect(projectNetworkCliConfigForStudent(null)).toBeUndefined(); expect(projectNetworkCliConfigForStudent({ device: "switch" })).toBeUndefined();
    expect(projectNetworkCliConfigForStudent({ device: "switch", initialState: { v: 2, device: "switch", hostname: "X", vlans: {}, interfaces: {} } })).toBeUndefined();
  });
  it("an initial state whose access ports name VLANs that are not in the VLAN database implies them (a real switch shows them as created)", () => {
    const p = projectNetworkCliConfigForStudent({ device: "switch", initialState: { v: 1, device: "switch", hostname: "SW", vlans: {}, interfaces: { "f0/2": { accessVlan: 30 } } } })!;
    expect(p.initialState.vlans).toEqual({ "30": {} });
    expect(serializeState(initialStateOf({ device: "switch", initialState: p.initialState }))).toBe(serializeState(p.initialState));
  });
});

describe("answer ingest: bounded shape, bound to the published question, state re-derived by replay (client claims are never trusted)", () => {
  it("normalizeNetworkCliAnswer keeps exactly {kind, commands, state} within bounds; drops garbage, non-string commands, oversize histories, forged extra keys", () => {
    const a = normalizeNetworkCliAnswer({ kind: "networkCli", commands: ["enable", "configure terminal", "hostname X"], state: { v: 1, device: "switch", hostname: "X", vlans: {}, interfaces: {} }, score: 10, passed: true });
    expect(a.ok).toBe(true); if (a.ok) { expect(Object.keys(a.answer)).toEqual(["kind", "commands", "state"]); expect(a.answer.commands).toEqual(["enable", "configure terminal", "hostname X"]); }
    expect(normalizeNetworkCliAnswer({ kind: "networkCli", commands: ["enable", 42], state: CFG.initialState }).ok).toBe(false);
    expect(normalizeNetworkCliAnswer({ kind: "networkCli", commands: ["x".repeat(201)], state: CFG.initialState }).ok).toBe(false);
    expect(normalizeNetworkCliAnswer({ kind: "networkCli", commands: Array.from({ length: 301 }, () => "enable"), state: CFG.initialState }).ok).toBe(false);
    expect(normalizeNetworkCliAnswer({ kind: "networkCli", commands: "enable", state: CFG.initialState }).ok).toBe(false);
    expect(normalizeNetworkCliAnswer({ kind: "networkCli", commands: [], state: JSON.parse('{"v":1,"device":"switch","hostname":"X","vlans":{"__proto__":{}},"interfaces":{}}') }).ok).toBe(false);
    expect(normalizeNetworkCliAnswer({ kind: "code", commands: [], state: CFG.initialState }).ok).toBe(false);
    expect(normalizeNetworkCliAnswer(null).ok).toBe(false);
    const noState = normalizeNetworkCliAnswer({ kind: "networkCli", commands: ["enable"] });
    expect(noState.ok).toBe(false);                                                                  // the canonical state is part of the contract
  });
  it("bindNetworkCliAnswerToQuestion replays the history from the question's initial state and REPLACES the claimed state with the derived one", () => {
    const forged = { kind: "networkCli", commands: ["enable"], state: { v: 1, device: "switch", hostname: "BR1-SW1", vlans: { "20": { name: "SALES" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 } } } };
    const r = bindNetworkCliAnswerToQuestion(forged, question());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.answer.state.hostname).toBe("Switch"); expect(r.answer.state.vlans).toEqual({}); expect(r.answer.state.interfaces).toEqual({}); expect(r.answer.commands).toEqual(["enable"]); }
    const honest = bindNetworkCliAnswerToQuestion(answerOf(FULL), question());
    expect(honest.ok).toBe(true); if (honest.ok) expect(serializeState(honest.answer.state)).toBe(serializeState(answerOf(FULL).state));
    const withInitial = bindNetworkCliAnswerToQuestion({ kind: "networkCli", commands: ["enable", "configure terminal", "vlan 30"], state: CFG.initialState }, question({ networkCli: { device: "switch", initialState: { ...CFG.initialState, hostname: "LAB-SW", vlans: { "10": { name: "A" } } } } }));
    expect(withInitial.ok).toBe(true); if (withInitial.ok) { expect(withInitial.answer.state.hostname).toBe("LAB-SW"); expect(Object.keys(withInitial.answer.state.vlans)).toEqual(["10", "30"]); }
  });
  it("binding fails closed for another type, an unsupported version, a malformed config or a malformed answer", () => {
    expect(bindNetworkCliAnswerToQuestion(answerOf(FULL), { presentationType: "coding", coding: {} })).toEqual({ ok: false, code: "NETCLI_QUESTION_MISMATCH" });
    expect(bindNetworkCliAnswerToQuestion(answerOf(FULL), question({ questionTypeVersion: 2 })).ok).toBe(false);
    expect(bindNetworkCliAnswerToQuestion(answerOf(FULL), question({ networkCli: { device: "switch" } })).ok).toBe(false);
    expect(bindNetworkCliAnswerToQuestion({ kind: "networkCli", commands: "enable", state: CFG.initialState }, question()).ok).toBe(false);
    expect(bindNetworkCliAnswerToQuestion(answerOf(FULL), undefined).ok).toBe(false);
  });
  it("answered ⇔ at least one non-empty command (mirror of answerState / exam-structure)", () => {
    expect(isNetworkCliAnswerAnswered({ kind: "networkCli", commands: ["enable"], state: CFG.initialState })).toBe(true);
    expect(isNetworkCliAnswerAnswered({ kind: "networkCli", commands: [], state: CFG.initialState })).toBe(false);
    expect(isNetworkCliAnswerAnswered({ kind: "networkCli", commands: ["  "], state: CFG.initialState })).toBe(false);
    expect(isNetworkCliAnswerAnswered(null)).toBe(false);
  });
});

describe("grading canonical STATE, never the transcript", () => {
  it("two different valid command sequences that reach the target score identically (full marks); extra configuration does not cost marks", () => {
    const a = scoreNetworkCli({ config: CFG, answerKey: KEY, response: answerOf(FULL), maxMarks: 10 });
    const b = scoreNetworkCli({ config: CFG, answerKey: KEY, response: answerOf(EQUIVALENT), maxMarks: 10 });
    expect(a).toEqual({ score: 10, correct: true, manualReview: false, parts: { correct: 10, total: 10 } });
    expect(b).toEqual(a);
    const extra = scoreNetworkCli({ config: CFG, answerKey: KEY, response: answerOf([...FULL, "configure terminal", "vlan 77", "name EXTRA", "interface fa0/9", "shutdown"]), maxMarks: 10 });
    expect(extra.score).toBe(10);
  });
  it("partial mismatch: each check is one dimension; proportional = marks × passed / total; allOrNothing = full or zero; the per-check report names what failed", () => {
    const partial = answerOf(["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name sales", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20", "exit", "interface gi0/1", "switchport mode trunk", "exit", "interface vlan 20", "ip address 192.168.20.2 255.255.0.0"]);
    const r = scoreNetworkCli({ config: CFG, answerKey: KEY, response: partial, maxMarks: 10 });
    expect(r.parts).toEqual({ correct: 7, total: 10 }); expect(r.score).toBe(7); expect(r.correct).toBe(false); expect(r.manualReview).toBe(false);
    const checks = evaluateNetworkCliTarget(KEY.targetState, partial.state);
    expect(checks.map(c => c.id + ":" + (c.ok ? "ok" : "no"))).toEqual(["hostname:ok", "vlan:20:exists:ok", "vlan:20:name:no", "if:f0/5:mode:ok", "if:f0/5:accessVlan:ok", "if:g0/1:mode:ok", "if:g0/1:nativeVlan:no", "if:vlan20:shutdown:ok", "if:vlan20:ipAddress:ok", "if:vlan20:subnetMask:no"]);
    const failedName = checks.find(c => c.id === "vlan:20:name")!;
    expect(failedName.expected).toBe("SALES"); expect(failedName.actual).toBe("sales");                 // exact, case-sensitive like the device
    expect(checks.find(c => c.id === "if:g0/1:nativeVlan")!.actual).toBe("1");
    expect(scoreNetworkCli({ config: CFG, answerKey: { ...KEY, scoring: "allOrNothing" }, response: partial, maxMarks: 9 }).score).toBe(0);
    expect(scoreNetworkCli({ config: CFG, answerKey: { ...KEY, scoring: "allOrNothing" }, response: answerOf(FULL), maxMarks: 9 }).score).toBe(9);
    expect(scoreNetworkCli({ config: CFG, answerKey: KEY, response: answerOf(["enable", "show vlan brief"]), maxMarks: 9 }).score).toBe(0);
  });
  it("administrative state is graded as the EFFECTIVE value (Vlan1 is shut by default; ports are up by default)", () => {
    const key: NetworkCliAnswerKeyV1 = { targetState: { interfaces: { "vlan1": { shutdown: false }, "f0/24": { shutdown: true }, "f0/1": { shutdown: false } } } };
    expect(scoreNetworkCli({ config: CFG, answerKey: key, response: answerOf([]), maxMarks: 3 }).parts).toEqual({ correct: 1, total: 3 });
    expect(scoreNetworkCli({ config: CFG, answerKey: key, response: answerOf(["enable", "configure terminal", "interface vlan 1", "no shutdown", "interface fa0/24", "shutdown"]), maxMarks: 3 }).score).toBe(3);
  });
  it("the grader re-derives the state from the command history — a forged state in the response never earns marks; the initial state is the question's", () => {
    const forged = { kind: "networkCli", commands: ["enable"], state: answerOf(FULL).state };
    expect(scoreNetworkCli({ config: CFG, answerKey: KEY, response: forged, maxMarks: 10 }).score).toBe(0);
    const preconfigured = { device: "switch" as const, initialState: createDeviceState({ hostname: "BR1-SW1", vlans: { "20": { name: "SALES" } } }) };
    const r = scoreNetworkCli({ config: preconfigured, answerKey: KEY, response: { kind: "networkCli", commands: ["enable"], state: preconfigured.initialState }, maxMarks: 10 });
    expect(r.parts).toEqual({ correct: 3, total: 10 });                                               // hostname + VLAN 20 exists + its name come from the initial state
  });
  it("fails CLOSED (score 0, manual review) for a malformed config, an empty target or a response of another kind — never a crash, never credit", () => {
    expect(scoreNetworkCli({ config: { device: "switch" }, answerKey: KEY, response: answerOf(FULL), maxMarks: 10 })).toMatchObject({ score: 0, manualReview: true, correct: false });
    expect(scoreNetworkCli({ config: CFG, answerKey: { targetState: {} }, response: answerOf(FULL), maxMarks: 10 })).toMatchObject({ score: 0, manualReview: true });
    expect(scoreNetworkCli({ config: CFG, answerKey: KEY, response: { kind: "text", value: "hostname BR1-SW1" }, maxMarks: 10 })).toMatchObject({ score: 0, manualReview: false, correct: false });
    expect(scoreNetworkCli({ config: CFG, answerKey: KEY, response: undefined, maxMarks: 10 })).toMatchObject({ score: 0, manualReview: false });
    expect(scoreNetworkCli({ config: CFG, answerKey: KEY, response: { kind: "networkCli", commands: ["enable; rm -rf /", "`id`", "$(whoami)", "a | b"], state: CFG.initialState }, maxMarks: 10 }).score).toBe(0);
  });
});
