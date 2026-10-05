import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { evaluateServerFinalization } from "../src/lib/server-finalization.js";

// Phase 20B — the networkTopology@1 vertical slice on the SERVER, through the REAL handlers: the student receives the public topology
// only; saveDraft / submit replay the semantic actions per device (PC settings, switch CLI on the networkCli@1 engine, router CLI) from
// the published initial state and store the derived state; the grader evaluates the private weighted checks — including reachability
// DERIVED by the connectivity engine — with partial credit; the teacher review receives the server-computed checks, points, device
// states and per-device histories; finalization blocks invalid topologies / checks. New-function tests (fail-first on a13252803).
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const tplLoad = () => import("../../src/networkTopology/networkTopologyTemplates.ts");
const M24 = "255.255.255.0";
const pcSet = (id, address, mask, gateway) => [{ type: "pc.setAddress", deviceId: id, value: address }, { type: "pc.setMask", deviceId: id, value: mask }, ...(gateway ? [{ type: "pc.setGateway", deviceId: id, value: gateway }] : [])];
const sw = (id, ...commands) => commands.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id, ...commands) => commands.map(command => ({ type: "router.command", deviceId: id, command }));
const PCS = [...pcSet("pc1", "192.168.10.10", M24, "192.168.10.254"), ...pcSet("pc2", "192.168.10.20", M24, "192.168.10.254"), ...pcSet("pc3", "192.168.20.10", M24, "192.168.20.254"), ...pcSet("pc4", "192.168.20.20", M24, "192.168.20.254")];
const SWITCHES = [...sw("sw1", "enable", "configure terminal", "hostname BR1-SW1", "end"), ...sw("sw2", "enable", "configure terminal", "hostname BR1-SW2", "end")];
const ROUTER = rt("r1", "enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0", "no shutdown", "end");
const FULL = [...PCS, ...SWITCHES, ...ROUTER];
const PARTIAL = [...PCS.filter(a => !(a.deviceId === "pc4" && a.type === "pc.setGateway")), ...SWITCHES, ...rt("r1", "enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0")];
const CANARIES = /BR1-SW1|BR1-SW2|192\.168\.10\.254|reach-pc|"checks"|"weight"|"scoring"|twoLan/;
async function fixture() {
  const t = await tplLoad();
  const env = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: t.routerTwoSwitchesFourPcsTemplate() };
  const key = { scoring: "proportional", checks: t.twoLanDemoChecks() };
  const q = (over = {}) => ({ examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "اضبط الشبكة بحيث تتصل الشبكتان", marks: 23, smartSim: env, answer: key, ...over });
  const exam = questions => ({ title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
  return { t, env, key, q, exam };
}
const ans = (actions, state = {}) => ({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions, state });
const g = (r, id = "t1") => r.questions.find(x => x.questionId === id);

describe("20B-S1 — authoritative grading of the canonical two-LAN exercise", () => {
  it("full configuration = 23 / 23; partial = 15 / 23 by weight; a perfect forged state with no actions = 0", async () => {
    const { q, exam } = await fixture();
    expect(g(gradeExam(exam([q()]), { t1: ans(FULL) }))).toMatchObject({ score: 23, correct: true, manualReview: false, parts: { correct: 17, total: 17 } });
    expect(g(gradeExam(exam([q()]), { t1: ans(PARTIAL) }))).toMatchObject({ score: 15, correct: false, manualReview: false, parts: { correct: 13, total: 17 } });
    const ok = normalizeDraftAnswers({ t1: ans(FULL) }, exam([q()])).answers.t1;
    expect(g(gradeExam(exam([q()]), { t1: ans([], ok.state) }))).toMatchObject({ score: 0, manualReview: false });
  });
  it("router commands sent to a switch / switch commands to a router / PC values on a switch are refused at ingest — never applied", async () => {
    const { q, exam } = await fixture();
    for (const bad of [[{ type: "router.command", deviceId: "sw1", command: "enable" }], [{ type: "switch.command", deviceId: "r1", command: "enable" }], [{ type: "pc.setAddress", deviceId: "sw2", value: "10.0.0.1" }], [{ type: "pc.setAddress", deviceId: "pc1", value: "1.2.3.400" }], [{ type: "mouseDown", deviceId: "pc1", x: 5 }]])
      expect(normalizeDraftAnswers({ t1: ans(bad) }, exam([q()])).rejected).toEqual([{ id: "t1", code: "SMARTSIM_ACTION_INVALID" }]);
    expect(normalizeDraftAnswers({ t1: ans(sw("sw1", ...Array.from({ length: 301 }, () => "enable"))) }, exam([q()])).rejected).toEqual([{ id: "t1", code: "NETTOPO_DEVICE_COMMANDS_TOO_MANY" }]);
  });
});

describe("20B-S2 — the student payload carries the public topology only", () => {
  it("sanitizeExamForStudent: the envelope with the canonical topology; no check, weight, expected address / hostname; the private key is blanked", async () => {
    const { q, exam, env } = await fixture();
    const out = sanitizeExamForStudent(exam([q()])).sections[0].questions[0];
    expect(out.smartSim).toEqual(env); expect(out.answer).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(CANARIES);
    const smuggled = { ...env, config: { ...env.config, devices: env.config.devices.map((d, i) => (i === 0 ? { ...d, expectedIp: "192.168.10.254" } : d)) } };
    expect(sanitizeExamForStudent(exam([q({ smartSim: smuggled })])).sections[0].questions[0].smartSim).toBeUndefined();
  });
});

describe("20B-S3 — end to end through the REAL handlers (delivery → draft → submit → teacher review)", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-20b", role: "teacher" } });
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: studentAuth, requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const quiet = logs => ({ logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) });
  const seed = async () => { const f = await fixture(); return { ...f, ctx: F.seed({ a: F.assignment({ examSnapshot: f.exam([f.q()]), totalMarks: 23, questionCount: 1 }) }) }; };
  it("delivery: the student receives the topology and nothing private", async () => {
    const { ctx, env } = await seed();
    const r = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.assignment.exam.sections[0].questions[0].smartSim).toEqual(env);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(CANARIES);
  });
  it("saveDraft stores the SERVER-derived state; submit grades the replayed state (forged claim ignored); nothing private in responses or logs", async () => {
    const { ctx } = await seed();
    const logs = [];
    const forgedState = { v: 1, pcs: { pc1: { address: "192.168.10.10", mask: M24, gateway: "192.168.10.254" } }, switches: {}, routers: {} };
    const d = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { t1: ans(PCS.slice(0, 2), forgedState) }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx), quiet(logs));
    expect(d.status).toBe(200);
    const draft = ctx.getJson(F.SUB).draftAnswers.t1;
    expect(draft.actions).toEqual(PCS.slice(0, 2)); expect(draft.state.pcs.pc1).toEqual({ address: "192.168.10.10", mask: M24 });
    const s = await submission().handler(F.studentRequest(F.submitBody({ t1: { ...ans(PARTIAL, forgedState), score: 23, checks: [] } })), deps(ctx), quiet(logs));
    expect(s.status).toBe(200); expect(s.jsonBody.ok).toBe(true);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.score).toBe(15);
    expect(attempt.answers.t1.state.routers.r1.interfaces["g0/0"]).toEqual({ ipAddress: "192.168.10.254", subnetMask: M24, shutdown: false });
    expect(JSON.stringify(s.jsonBody)).not.toMatch(CANARIES); expect(JSON.stringify(logs)).not.toMatch(/reach-pc|"checks"/);
  });
  it("teacher review: server-computed checks with pass / fail and points, reachability evidence, device states and per-device histories", async () => {
    const { ctx } = await seed();
    await submission().handler(F.studentRequest(F.submitBody({ t1: ans(PARTIAL) })), deps(ctx), quiet([]));
    const rv = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
    expect(rv.status).toBe(200);
    const rq = rv.jsonBody.questions.find(x => x.questionId === "t1");
    expect(rq.type).toBe("smartSim");
    const r = rq.smartSimReview;
    expect(r).toMatchObject({ valid: true, score: 15, maxMarks: 23, totalWeight: 23, passedWeight: 15 });
    expect(r.checks.filter(c => !c.passed).map(c => c.id)).toEqual(["pc4-gw", "r1-g01-up", "reach-pc1-pc3", "reach-pc2-pc4"]);
    expect(r.checks.find(c => c.id === "r1-g00-ip")).toMatchObject({ points: 2, maxPoints: 2, passed: true });
    expect(r.checks.find(c => c.id === "reach-pc1-pc3").evidence).toContain("NO_ROUTE_TO_DESTINATION");
    expect(r.state.routers.r1.interfaces["g0/1"]).toEqual({ ipAddress: "192.168.20.254", subnetMask: M24 });
    expect(r.transcripts.r1.map(e => e.input)).toEqual(["enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0"]);
    expect(r.transcripts.sw2.map(e => e.prompt)).toEqual(["Switch>", "Switch#", "Switch(config)#", "BR1-SW2(config)#"]);
  });
});

describe("20B-S4 — server finalization blocks invalid topologies and checks (the canonical gate, no second publish gate)", () => {
  it("a valid question finalizes; no devices / a broken link / a check on a missing device / zero checks / an unknown plugin version block", async () => {
    const { q, exam, env, key } = await fixture();
    expect(evaluateServerFinalization(exam([q()])).canFinalize).toBe(true);
    const codes = node => evaluateServerFinalization(exam([node])).structuralErrors.map(i => i.code);
    expect(codes(q({ smartSim: { ...env, config: { v: 1, devices: [], links: [] } } }))).toContain("NETTOPO_NO_DEVICES");
    expect(codes(q({ smartSim: { ...env, config: { ...env.config, links: [...env.config.links, { id: "bad", a: { deviceId: "pc1", port: "eth0" }, b: { deviceId: "pc2", port: "eth0" } }] } } }))).toContain("NETTOPO_PORT_IN_USE");
    expect(codes(q({ answer: { ...key, checks: [...key.checks, { id: "ghost", label: "x", weight: 1, kind: "pc.address", deviceId: "pc9", value: "10.0.0.1" }] } }))).toContain("NETTOPO_CHECK_DEVICE_UNKNOWN");
    expect(codes(q({ answer: { ...key, checks: [] } }))).toContain("SMARTSIM_CHECKS_EMPTY");
    expect(codes(q({ smartSim: { ...env, pluginVersion: 2 } }))).toContain("SMARTSIM_PLUGIN_UNKNOWN");
  });
});
