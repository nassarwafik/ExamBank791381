import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 18C — networkCli@1 on the SERVER: the authoritative grader compares canonical device STATE re-derived by replaying the
// command history (never the transcript, never a client-claimed state), the draft / submit ingest binds every networkCli answer
// to the published question and stores the server-derived state, the student sanitizer never leaks the target, the real
// submission handler round-trips, the committed shared build is byte-identical in behaviour to the TypeScript source, and the
// engine modules reach no process / filesystem / network API. New-function tests (fail-first on 86f334b8: no such grader).
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shared = require_("../src/lib/shared-finalization/networkCliQuestion.js");
const engine = require_("../src/lib/shared-finalization/networkCliEngine.js");
const F = require_("./fixtures/coding-17c.js");

const CFG = { device: "switch", initialState: { v: 1, device: "switch", hostname: "LAB-SW", vlans: {}, interfaces: {} } };
const KEY = { targetState: { hostname: "BR1-SW1", vlans: { "20": { name: "SALES-SECRET" } }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 }, "g0/1": { mode: "trunk", nativeVlan: 99 }, "vlan20": { ipAddress: "192.168.20.2", subnetMask: "255.255.255.0", shutdown: false } } }, scoring: "proportional" };
const CANARIES = /BR1-SW1|SALES-SECRET|192\.168\.20\.2|targetState|"scoring"/;
const q = (over = {}) => ({ examQuestionId: "n1", presentationType: "networkCli", questionTypeVersion: 1, text: "اضبط المبدّل", marks: 10, networkCli: CFG, answer: KEY, ...over });
const exam = (questions, section = {}) => ({ examId: "E18C", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", ...section, questions }] });
const FULL = ["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name SALES-SECRET", "exit", "interface fastEthernet 0/5", "switchport mode access", "switchport access vlan 20", "exit", "interface gigabitEthernet 0/1", "switchport mode trunk", "switchport trunk native vlan 99", "exit", "interface vlan 20", "ip address 192.168.20.2 255.255.255.0", "no shutdown", "end"];
const EQUIVALENT = ["en", "conf t", "int g0/1", "switchport trunk native vlan 99", "switchport mode trunk", "int vlan 20", "ip address 192.168.20.2 255.255.255.0", "exit", "vlan 20", "name SALES-SECRET", "exit", "int fa0/5", "switchport access vlan 20", "switchport mode access", "exit", "hostname BR1-SW1", "end", "show running-config"];
const answerOf = (commands, initial = CFG.initialState) => ({ kind: "networkCli", commands, state: engine.replayCommands(initial, commands).session.state });
const g = (r, id = "n1") => r.questions.find(x => x.questionId === id);

describe("18C — the authoritative server grader grades canonical STATE", () => {
  it("networkCli@1 has a registered grader; two different valid sequences reaching the target earn identical full marks; extra configuration costs nothing", () => {
    expect(typeof resolveGrader("networkCli", 1)).toBe("function");
    const a = g(gradeExam(exam([q()]), { n1: answerOf(FULL) })), b = g(gradeExam(exam([q()]), { n1: answerOf(EQUIVALENT) }));
    expect(a.score).toBe(10); expect(a.correct).toBe(true); expect(a.manualReview).toBe(false); expect(a.parts).toEqual({ correct: 10, total: 10 });
    expect(b.score).toBe(10); expect(b.correct).toBe(true);
    expect(g(gradeExam(exam([q()]), { n1: answerOf([...FULL, "configure terminal", "vlan 77", "interface fa0/9", "shutdown"]) })).score).toBe(10);
  });
  it("partial mismatch: proportional credit per check; allOrNothing is full or zero; the effective administrative state is graded", () => {
    const partial = answerOf(["enable", "configure terminal", "hostname BR1-SW1", "vlan 20", "name sales-secret", "exit", "interface fa0/5", "switchport mode access", "switchport access vlan 20", "exit", "interface gi0/1", "switchport mode trunk", "exit", "interface vlan 20", "ip address 192.168.20.2 255.255.0.0"]);
    const r = g(gradeExam(exam([q()]), { n1: partial }));
    expect(r.parts).toEqual({ correct: 7, total: 10 }); expect(r.score).toBe(7); expect(r.correct).toBe(false); expect(r.manualReview).toBe(false);
    expect(g(gradeExam(exam([q({ answer: { ...KEY, scoring: "allOrNothing" } })]), { n1: partial })).score).toBe(0);
    expect(g(gradeExam(exam([q({ answer: { ...KEY, scoring: "allOrNothing" } })]), { n1: answerOf(FULL) })).score).toBe(10);
    const shut = q({ marks: 3, answer: { targetState: { interfaces: { "vlan1": { shutdown: false }, "f0/24": { shutdown: true } } } } });
    expect(g(gradeExam(exam([shut]), { n1: answerOf(["enable", "configure terminal", "interface vlan 1", "no shutdown", "interface fa0/24", "shutdown"]) })).score).toBe(3);
    expect(g(gradeExam(exam([shut]), { n1: answerOf([]) })).score).toBe(0);
  });
  it("a forged / tampered state in the response never earns marks: the grader replays the history from the question's initial state", () => {
    const forged = { kind: "networkCli", commands: ["enable"], state: answerOf(FULL).state };
    expect(g(gradeExam(exam([q()]), { n1: forged })).score).toBe(0);
    const smuggled = { kind: "networkCli", commands: FULL, state: answerOf(FULL).state, score: 10, passed: true, correct: true };
    expect(g(gradeExam(exam([q({ answer: { targetState: { hostname: "OTHER" } } })]), { n1: smuggled })).score).toBe(0);
    const preconfigured = q({ networkCli: { device: "switch", initialState: { ...CFG.initialState, hostname: "BR1-SW1", vlans: { "20": { name: "SALES-SECRET" } } } } });
    expect(g(gradeExam(exam([preconfigured]), { n1: { kind: "networkCli", commands: ["enable"], state: CFG.initialState } })).parts).toEqual({ correct: 3, total: 10 });
  });
  it("fails closed: networkCli@2 → score 0 + manual review + unsupportedType; another response kind → 0; a compound part of this type → never graded by the plugin", () => {
    const v2 = g(gradeExam(exam([q({ questionTypeVersion: 2 })]), { n1: answerOf(FULL) }));
    expect(v2.score).toBe(0); expect(v2.manualReview).toBe(true); expect(v2.correct).toBe(false);
    expect(resolveGrader("networkCli", 2)).toBeUndefined(); expect(resolveGrader("networkCli", undefined)).toBe(resolveGrader("networkCli", 1));
    expect(g(gradeExam(exam([q()]), { n1: { kind: "text", value: FULL.join("\n") } })).score).toBe(0);
    expect(g(gradeExam(exam([q()]), { n1: { kind: "fields", values: { hostname: "BR1-SW1" } } })).score).toBe(0);
    const broken = g(gradeExam(exam([q({ networkCli: { device: "router" } })]), { n1: answerOf(FULL) }));
    expect(broken.score).toBe(0); expect(broken.manualReview).toBe(true);
    const hostile = { kind: "networkCli", commands: ["hostname BR1-SW1; rm -rf /", "`id`", "$(whoami)", "show run | include x", "enable && hostname BR1-SW1"], state: CFG.initialState };
    expect(g(gradeExam(exam([q()]), { n1: hostile })).score).toBe(0);
  });
});

describe("18C — draft / submit ingest binds the answer to the published question and stores the SERVER-derived state", () => {
  it("bound: the claimed state is replaced by the replayed state; extra client keys are dropped; the stored shape is exactly {kind, commands, state}", () => {
    const forged = { kind: "networkCli", commands: ["enable", "configure terminal", "vlan 30"], state: answerOf(FULL).state, score: 10 };
    const { answers, rejected } = normalizeDraftAnswers({ n1: forged }, exam([q()]));
    expect(rejected).toEqual([]);
    expect(Object.keys(answers.n1)).toEqual(["kind", "commands", "state"]);
    expect(answers.n1.state).toEqual({ v: 1, device: "switch", hostname: "LAB-SW", vlans: { "30": {} }, interfaces: {} });
    expect(answers.n1.commands).toEqual(["enable", "configure terminal", "vlan 30"]);
    expect(isResponseAnswered(answers.n1)).toBe(true);
  });
  it("bound: answers on another question, an unknown id, an unsupported version, an oversize history or a malformed shape are DROPPED with a precise code", () => {
    const ok = answerOf(["enable"]);
    const r = normalizeDraftAnswers({ sa1: ok, zz: ok, n2: ok, big: { ...ok, commands: Array.from({ length: 301 }, () => "enable") }, long: { ...ok, commands: ["x".repeat(201)] }, bad: { kind: "networkCli", commands: "enable", state: {} } },
      exam([q(), q({ examQuestionId: "n2", questionTypeVersion: 2 }), { examQuestionId: "sa1", presentationType: "shortAnswer", text: "x", marks: 1, answer: { text: "x" } }]));
    expect(Object.keys(r.answers)).toEqual([]);
    expect(r.rejected.map(x => x.id + ":" + x.code).sort()).toEqual(["bad:NETCLI_ANSWER_INVALID", "big:NETCLI_HISTORY_TOO_LARGE", "long:NETCLI_ANSWER_INVALID", "n2:NETCLI_QUESTION_MISMATCH", "sa1:NETCLI_QUESTION_MISMATCH", "zz:NETCLI_QUESTION_MISMATCH"]);
    const comp = normalizeDraftAnswers({ c1: { kind: "compound", parts: { p1: ok, p2: { kind: "text", value: "x" } } } }, exam([{ examQuestionId: "c1", presentationType: "compound", text: "c", marks: 2, parts: [{ id: "p1", type: "networkCli", marks: 1 }, { id: "p2", type: "shortAnswer", marks: 1 }] }]));
    expect(comp.answers.c1.parts).toEqual({ p2: { kind: "text", value: "x" } }); expect(comp.rejected).toEqual([{ id: "c1.p1", code: "NETCLI_QUESTION_MISMATCH" }]);
  });
  it("shell metacharacters, prototype-pollution keys and control characters are stored as TEXT (or refused) — nothing is executed and no prototype changes", () => {
    const hostile = { kind: "networkCli", commands: ["hostname X; rm -rf /", "show run | tee /etc/passwd", "`id`", "$(curl evil)", "enable > /dev/null", "vlan 10 && reboot", "hostname \u0000\u001b[31m"], state: CFG.initialState };
    const { answers } = normalizeDraftAnswers({ n1: hostile }, exam([q()]));
    expect(answers.n1.commands).toEqual(hostile.commands); expect(answers.n1.state).toEqual(CFG.initialState);
    const polluted = { kind: "networkCli", commands: ["enable"], state: JSON.parse('{"v":1,"device":"switch","hostname":"LAB-SW","vlans":{},"interfaces":{},"__proto__":{"polluted":true}}') };
    const r = normalizeDraftAnswers({ n1: polluted }, exam([q()]));
    expect(r.answers.n1).toBeUndefined(); expect(r.rejected).toEqual([{ id: "n1", code: "NETCLI_ANSWER_INVALID" }]);
    expect({}.polluted).toBeUndefined(); expect(Object.prototype.polluted).toBeUndefined();
    const protoCmd = normalizeDraftAnswers({ n1: answerOf(["enable", "configure terminal", "hostname __proto__", "vlan 20", "name constructor", "interface vlan 20", "ip address 10.0.0.1 255.0.0.0"]) }, exam([q()]));
    expect(protoCmd.answers.n1.state.hostname).toBe("LAB-SW"); expect(protoCmd.answers.n1.state.vlans["20"]).toEqual({ name: "constructor" });
    expect(({}).constructor).toBe(Object); expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });
});

describe("18C — the student projection never carries the target", () => {
  it("sanitizeExamForStudent keeps ONLY {device, initialState} and blanks answer; smuggled keys inside the public object are dropped; every canary is absent", () => {
    const smuggled = q({ networkCli: { ...CFG, targetState: KEY.targetState, initialState: { ...CFG.initialState, expectedHostname: "BR1-SW1", interfaces: { "f0/1": { mode: "access", correctVlan: 20 } } } }, teacherNote: "BR1-SW1" });
    const s = sanitizeExamForStudent(exam([smuggled, q({ examQuestionId: "n2" })]));
    const [s1, s2] = s.sections[0].questions;
    expect(s1.networkCli).toEqual({ device: "switch", initialState: { v: 1, device: "switch", hostname: "LAB-SW", vlans: {}, interfaces: { "f0/1": { mode: "access" } } } });
    expect(s1.answer).toEqual({}); expect(s2.networkCli).toEqual(CFG); expect(s2.answer).toEqual({});
    expect(JSON.stringify(s)).not.toMatch(CANARIES);
    expect(sanitizeExamForStudent(exam([q({ networkCli: { device: "router", initialState: CFG.initialState } })])).sections[0].questions[0].networkCli).toBeUndefined();   // malformed → dropped (fail closed)
  });
  it("isResponseAnswered mirrors the client: ≥ 1 non-blank command", () => {
    expect(isResponseAnswered({ kind: "networkCli", commands: ["enable"], state: CFG.initialState })).toBe(true);
    expect(isResponseAnswered({ kind: "networkCli", commands: [" "], state: CFG.initialState })).toBe(false);
    expect(isResponseAnswered({ kind: "networkCli", commands: [], state: CFG.initialState })).toBe(false);
    expect(isResponseAnswered({ kind: "networkCli" })).toBe(false);
  });
});

describe("18C — end to end through the REAL submission handler", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const assignment = () => F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [q(), { examQuestionId: "sa1", presentationType: "shortAnswer", text: "x", marks: 2, answer: { text: "x" } }] }] }, totalMarks: 12, questionCount: 2 });
  it("submit: a forged state is replaced by the replayed one, the attempt is graded on canonical state, and no response / stored field leaks the target", async () => {
    const ctx = F.seed({ a: assignment() });
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const logs = [], obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
    const forged = { kind: "networkCli", commands: FULL.slice(0, 3), state: answerOf(FULL).state, score: 10 };
    const r = await submission().handler(F.studentRequest(F.submitBody({ n1: forged, sa1: { kind: "text", value: "x" } })), deps, obs);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    const doc = ctx.getJson(F.SUB);
    const attempt = doc.attempts.find(a => a.attemptNumber === 1);
    expect(attempt.answers.n1).toEqual({ kind: "networkCli", commands: FULL.slice(0, 3), state: { v: 1, device: "switch", hostname: "BR1-SW1", vlans: {}, interfaces: {} } });
    expect(attempt.score).toBe(1 + 2);                                                              // hostname check only (1 of 10 → 1 mark) + the short answer
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/SALES-SECRET|192\.168\.20\.2|targetState/);
    expect(JSON.stringify(logs)).not.toMatch(/SALES-SECRET|192\.168\.20\.2|targetState/);
  });
  it("saveDraft: the same binding — the stored draft holds the server-derived state", async () => {
    const ctx = F.seed({ a: assignment() });
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const r = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { n1: { kind: "networkCli", commands: ["enable", "configure terminal", "vlan 20", "name SALES-SECRET"], state: CFG.initialState } }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps, { logInfo() {}, logWarn() {}, logError() {} });
    expect(r.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.n1.state).toEqual({ v: 1, device: "switch", hostname: "LAB-SW", vlans: { "20": { name: "SALES-SECRET" } }, interfaces: {} });
  });
});

describe("18C — shared build parity and architecture guards", () => {
  const strip = t => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const read = f => strip(fs.readFileSync(path.join(repo, f), "utf8"));
  it("the committed CommonJS engine / question model exist, are named in SHARED_ENTRIES, and behave identically to the TypeScript source", async () => {
    expect(SHARED_ENTRIES).toContain("src/networkCliEngine.ts"); expect(SHARED_ENTRIES).toContain("src/networkCliQuestion.ts");
    const ts = await import("../../src/networkCliEngine.ts");
    const tsq = await import("../../src/networkCliQuestion.ts");
    for (const cmds of [FULL, EQUIVALENT, ["enable", "configure terminal", "interface vlan 10", "ip address 10.0.0.300 255.0.0.0", "hostname `id`", "?"]]) {
      const a = ts.replayCommands(CFG.initialState, cmds), b = engine.replayCommands(CFG.initialState, cmds);
      expect(ts.serializeState(a.session.state)).toBe(engine.serializeState(b.session.state));
      expect(a.entries.map(e => e.prompt + "|" + e.result.status + "|" + e.result.output.join("\\n"))).toEqual(b.entries.map(e => e.prompt + "|" + e.result.status + "|" + e.result.output.join("\\n")));
    }
    expect(tsq.scoreNetworkCli({ config: CFG, answerKey: KEY, response: answerOf(EQUIVALENT), maxMarks: 10 })).toEqual(shared.scoreNetworkCli({ config: CFG, answerKey: KEY, response: answerOf(EQUIVALENT), maxMarks: 10 }));
    expect(tsq.validateNetworkCliQuestion(q({ answer: { targetState: {} } })).map(i => i.code)).toEqual(shared.validateNetworkCliQuestion(q({ answer: { targetState: {} } })).map(i => i.code));
  });
  it("no process / filesystem / network / dynamic-code API in the engine, the question model or their server consumers' new code; the API never imports the Reader", () => {
    for (const f of ["src/networkCliEngine.ts", "src/networkCliQuestion.ts", "api/src/lib/shared-finalization/networkCliEngine.js", "api/src/lib/shared-finalization/networkCliQuestion.js"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/\beval\s*\(|new Function|Function\(|child_process|\.spawn\(|execSync|execFile|\bprocess\.|node:fs|require\("fs"|node:net|node:http|fetch\(|XMLHttpRequest|WebSocket|import\(|setTimeout|setInterval|Math\.random|Date\.now/);
      expect(s, f).not.toMatch(/learning\/cli/);
    }
    for (const f of ["api/src/lib/question-type-graders.js", "api/src/lib/draft-answers.js", "api/src/lib/student-exam-sanitize.js", "api/src/lib/exam-structure.js"]) expect(read(f), f).not.toMatch(/learning\/cli|child_process|\beval\s*\(|new Function/);
    const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    expect(catalog.QUESTION_TYPE_CATALOG.length).toBe(23);                                         // 19A adds inlineCloze · 19B adds parametricNumeric · 19D adds hotspot / labelDiagram · 19E adds openResponse
    expect(catalog.questionTypeDefinition("networkCli")).toMatchObject({ version: 1, gradingMode: "auto", legacy: false, responseKinds: ["networkCli"] });
    expect(catalog.questionTypeDefinition("networkCli").capabilities).toMatchObject({ autoGrading: true, partialCredit: true, compoundPart: false, interactive: true, offline: true });
  });
  it("the production invariant of 16A §12 holds: the auto-graded networkCli@1 has an authoritative server grader for every supported version", () => {
    const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    const d = catalog.questionTypeDefinition("networkCli");
    for (let v = 1; v <= d.version; v++) expect(typeof resolveGrader("networkCli", v), "networkCli@" + v).toBe("function");
    expect(resolveGrader("networkCli", d.version + 1)).toBeUndefined();
  });
});

describe("18C RF1 — a corrupted PUBLISHED snapshot can never produce automatic credit (fail-first on 98d9454)", () => {
  const FAIL = { score: 0, correct: false, manualReview: true };
  it("gradeExam: VLAN 1 target / unknown scoring / mixed valid + unknown target field ⇒ 0 marks, manual review, the question's marks pending", () => {
    for (const answer of [{ targetState: { vlans: { "1": {} } }, scoring: "proportional" }, { targetState: { hostname: "LAB-SW" }, scoring: "bonus" }, { targetState: { hostname: "LAB-SW", unexpectedField: true } }, { targetState: { interfaces: { "f0/5": { mode: "access" }, "FastEthernet0/5": { mode: "access" } } } }]) {
      const r = gradeExam(exam([q({ answer })]), { n1: answerOf(["enable"]) });
      expect(g(r), JSON.stringify(answer)).toMatchObject(FAIL);
      expect(r.manualReviewMarks, JSON.stringify(answer)).toBe(10);
      expect(g(gradeExam(exam([q({ answer })]), { n1: answerOf(FULL) })), JSON.stringify(answer)).toMatchObject(FAIL);
    }
    expect(g(gradeExam(exam([q({ answer: { targetState: { hostname: "LAB-SW" } } })]), { n1: answerOf(["enable"]) }))).toMatchObject({ score: 10, correct: true, manualReview: false });   // the same target without the corruption
  });
  it("REAL submission handler: a snapshot whose private key targets VLAN 1 yields 0 automatic marks + pending manual review, never full credit", async () => {
    const submission = () => require_("../src/functions/student-submission.js");
    const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
    const corrupted = q({ answer: { targetState: { vlans: { "1": {} } }, scoring: "proportional" } });
    const a = F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [corrupted, { examQuestionId: "sa1", presentationType: "shortAnswer", text: "x", marks: 2, answer: { text: "x" } }] }] }, totalMarks: 12, questionCount: 2 });
    const ctx = F.seed({ a });
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const r = await submission().handler(F.studentRequest(F.submitBody({ n1: { kind: "networkCli", commands: ["enable"], state: CFG.initialState }, sa1: { kind: "text", value: "x" } })), deps, { logInfo() {}, logWarn() {}, logError() {} });
    expect(r.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 1);
    expect(attempt.score).toBe(2); expect(attempt.manualReviewMarks).toBe(10); expect(attempt.finalized).toBe(false);
    const unknownScoring = q({ answer: { targetState: { hostname: "LAB-SW" }, scoring: "bonus" } });
    const r2 = gradeExam(exam([unknownScoring]), { n1: answerOf(["enable"]) });
    expect(g(r2)).toMatchObject(FAIL); expect(r2.manualReviewMarks).toBe(10);
  });
  it("shared build parity: the committed CommonJS validator refuses exactly what the TypeScript source refuses", async () => {
    const tsq = await import("../../src/networkCliQuestion.ts");
    for (const key of [KEY, { targetState: { vlans: { "1": {} } } }, { targetState: { hostname: "X" }, scoring: "bonus" }, { targetState: { hostname: "X", unexpectedField: 1 } }, { targetState: { interfaces: { "f0/5": {}, "FastEthernet0/5": { mode: "access" } } } }]) {
      const a = tsq.validateNetworkCliAnswerKey(key), b = shared.validateNetworkCliAnswerKey(key);
      expect(a.ok, JSON.stringify(key)).toBe(b.ok);
      expect((a.ok ? [] : a.issues.map(i => i.code)).sort()).toEqual((b.ok ? [] : b.issues.map(i => i.code)).sort());
    }
  });
});

describe("18C RF2 — a corrupted PUBLISHED public config can never produce automatic credit (fail-first on 624775e)", () => {
  const FAIL = { score: 0, correct: false, manualReview: true };
  const MALFORMED = [{ ...CFG, unexpectedField: true }, { device: "switch", initialState: { ...CFG.initialState, unexpectedStateField: true } }, { device: "switch", initialState: { ...CFG.initialState, vlans: { "20": { name: "SALES", expected: true } } } }, { device: "switch", initialState: { ...CFG.initialState, interfaces: { "f0/1": { mode: "access", secretExpectedVlan: 20 } } } }];
  it("gradeExam: unknown config-root / state / VLAN / interface field ⇒ 0 marks, manual review, the question's marks pending; the valid config still grades", () => {
    for (const networkCli of MALFORMED) {
      const r = gradeExam(exam([q({ networkCli, answer: { targetState: { hostname: "LAB-SW" } } })]), { n1: answerOf(["enable"]) });
      expect(g(r), JSON.stringify(networkCli)).toMatchObject(FAIL); expect(r.manualReviewMarks, JSON.stringify(networkCli)).toBe(10);
    }
    expect(g(gradeExam(exam([q({ answer: { targetState: { hostname: "LAB-SW" } } })]), { n1: answerOf(["enable"]) }))).toMatchObject({ score: 10, correct: true, manualReview: false });
  });
  it("REAL submission handler: a snapshot whose public config carries an unknown field ⇒ 0 automatic marks, marks pending manual review, not finalized; the field never reaches the student response, the stored answer or the logs", async () => {
    const submission = () => require_("../src/functions/student-submission.js");
    const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
    const corrupted = q({ networkCli: { ...CFG, unexpectedField: "CANARY-PUBLIC-UNKNOWN", initialState: { ...CFG.initialState, interfaces: { "f0/1": { mode: "access", secretExpectedVlan: "CANARY-NESTED" } } } }, answer: { targetState: { hostname: "LAB-SW" } } });
    const a = F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [corrupted, { examQuestionId: "sa1", presentationType: "shortAnswer", text: "x", marks: 2, answer: { text: "x" } }] }] }, totalMarks: 12, questionCount: 2 });
    const ctx = F.seed({ a });
    const logs = [], obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const r = await submission().handler(F.studentRequest(F.submitBody({ n1: { kind: "networkCli", commands: ["enable"], state: CFG.initialState }, sa1: { kind: "text", value: "x" } })), deps, obs);
    expect(r.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(x => x.attemptNumber === 1);
    expect(attempt.score).toBe(2); expect(attempt.manualReviewMarks).toBe(10); expect(attempt.finalized).toBe(false);
    expect(JSON.stringify(attempt.answers.n1)).not.toMatch(/CANARY/); expect(JSON.stringify(r.jsonBody)).not.toMatch(/CANARY/); expect(JSON.stringify(logs)).not.toMatch(/CANARY/);
    expect(JSON.stringify(sanitizeExamForStudent(a.examSnapshot))).not.toMatch(/CANARY|unexpectedField|secretExpectedVlan/);
  });
  it("shared build parity: the committed CommonJS public-config validator refuses exactly what the TypeScript source refuses", async () => {
    const tsq = await import("../../src/networkCliQuestion.ts");
    for (const config of [CFG, ...MALFORMED, { device: "router", initialState: CFG.initialState }, null]) {
      const a = tsq.validateNetworkCliConfig(config), b = shared.validateNetworkCliConfig(config);
      expect(a.ok, JSON.stringify(config)).toBe(b.ok);
      expect((a.ok ? [] : a.issues.map(i => i.code)).sort()).toEqual((b.ok ? [] : b.issues.map(i => i.code)).sort());
      if (a.ok && b.ok) expect(a.config).toEqual(b.config);
    }
  });
});
