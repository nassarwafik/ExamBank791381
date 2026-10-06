import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { evaluateServerFinalization } from "../src/lib/server-finalization.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 20C — networkTopology@2 through the REAL server paths: teacher finalization → student projection (sanitizer) → saveDraft → restore
// → submit → server replay → gradeExam → teacher assignment review, for several curriculum labs; client / server parity on one TypeScript
// source (shared build), representative answer sizes, exact versions, and the frozen v1 / simulation@1 / catalog pins.
// New-function tests (fail-first on 686afbc) except the labelled PINS.
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = require_("./fixtures/coding-17c.js");
const loadShared = name => require_("../src/lib/shared-finalization/" + name + ".js");
const g = (r, id) => r.questions.find(x => x.questionId === id);
const exam = questions => ({ examId: "E20C", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const tpls = () => import("../../src/networkTopology2/net2Templates.ts");
const CONF = ["enable", "configure terminal"];
const sw = (id, ...c) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id, ...c) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const host = (id, ...c) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const ROAS = [...sw("sw1", ...CONF, "vlan 10", "vlan 20", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
  "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end"),
  ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end")];
const DHCP = rt("r1", ...CONF, "ip dhcp excluded-address 192.168.1.1 192.168.1.10", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "dns-server 192.168.1.1", "end");
const VTP = [...sw("sw1", ...CONF, "vtp domain SCHOOL", "vlan 30", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end"),
  ...sw("sw2", ...CONF, "vtp domain SCHOOL", "vtp mode client", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end")];
const WIRELESS = [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }];
const weight = checks => checks.reduce((n, c) => n + c.weight, 0);
async function labs() {
  const t = await tpls();
  const q = (id, over = {}) => { const x = t.net2TemplateById(id); return { examQuestionId: id, presentationType: "smartSim", questionTypeVersion: 1, text: "مختبر شبكات", marks: weight(x.checks()), smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: x.config() }, answer: { scoring: "proportional", checks: x.checks() }, ...over }; };
  return { t, q };
}
const ans = (actions, state = {}) => ({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state });

describe("20C-S1 — registration, shared build, pins", () => {
  it("networkTopology@2 is a production plugin in the server build; every pure v2 module is shared and free of dynamic code / I/O", () => {
    const reg = loadShared("trustedSimRegistry"); loadShared("trustedSimPlugins");
    expect(reg.listSmartSimPluginDescriptors().map(d => d.key + "@" + d.version)).toEqual(["functionStudy2d@1", "networkTopology@1", "networkTopology@2", "physicsFreeFall@1"]);
    for (const m of ["net2Common", "net2Model", "net2SwitchCli", "net2RouterCli", "net2Network", "net2Host", "net2Plugin"]) {   // Review Fix 1: net2Common scanned too
      expect(SHARED_ENTRIES, m).toContain("src/" + m + ".ts");
      const code = fs.readFileSync(path.join(repo, "api/src/lib/shared-finalization", m + ".js"), "utf8");
      expect(code, m).not.toMatch(/\beval\(|new Function|\bfetch\(|XMLHttpRequest|\bimport\(|Math\.random|Date\.now|setTimeout|setInterval|process\.|require\("(fs|http|https|net|dns|child_process|dgram)"\)/);
    }
  });
  it("PIN — the catalog stays 24, simulation@1 stays manual, networkTopology@1 still grades its exercise unchanged", async () => {
    expect(loadShared("questionTypeCatalog").QUESTION_TYPE_CATALOG.length).toBe(25);   /* 20D adds composite (after compound) */
    expect(resolveGrader("simulation", 1)({}, { kind: "simulation", state: { score: 100 } }, 10)).toEqual({ score: 0, manualReview: true, correct: false });
    const v1 = await import("../../src/networkTopology/networkTopologyTemplates.ts");
    const node = { examQuestionId: "v1", presentationType: "smartSim", questionTypeVersion: 1, text: "v1", marks: 23, smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: v1.routerTwoSwitchesFourPcsTemplate() }, answer: { scoring: "proportional", checks: v1.twoLanDemoChecks() } };
    expect(g(gradeExam(exam([node]), { v1: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: [], state: {} } }), "v1")).toMatchObject({ score: 0, manualReview: false });
  });
});

describe("20C-S2 — finalization, projection, ingest and grading through the real pipeline", () => {
  it("every curriculum template finalizes; solutions score full marks by server replay; zero actions score 0", async () => {
    const { t, q } = await labs();
    expect(evaluateServerFinalization(exam(t.NET2_TEMPLATES.map(x => q(x.id)))).canFinalize).toBe(true);
    const r = gradeExam(exam([q("roas"), q("dhcp"), q("vtp"), q("wireless")]), { roas: ans(ROAS), dhcp: ans(DHCP), vtp: ans(VTP), wireless: ans(WIRELESS) });
    for (const id of ["roas", "dhcp", "vtp", "wireless"]) expect(g(r, id), id).toMatchObject({ correct: true, manualReview: false });
    const zero = gradeExam(exam([q("roas"), q("wireless")]), { roas: ans([]), wireless: ans([]) });
    expect(g(zero, "roas").score).toBe(0); expect(g(zero, "wireless").score).toBe(0);
  });
  it("ingest stores the REPLAYED state; forged leases / associations / VTP and topology / presentation actions never enter the record", async () => {
    const { q } = await labs();
    const forged = { v: 2, devices: { r1: { hostname: "HACK" } }, ops: { adapters: { "pc1/eth0": { status: "dhcp", address: "192.168.1.250" } }, vtp: { sw2: { revision: 99, vlans: [1, 30] } } } };
    const ing = normalizeDraftAnswers({ dhcp: ans(DHCP.slice(0, 5), forged) }, exam([q("dhcp")]));
    expect(ing.rejected).toEqual([]);
    expect(JSON.stringify(ing.answers.dhcp.state)).not.toMatch(/HACK|192\.168\.1\.250/);
    for (const [bad, code] of [[{ type: "device.add", id: "x", kind: "router" }, "SMARTSIM_ACTION_INVALID"], [{ type: "link.delete", id: "u" }, "SMARTSIM_ACTION_INVALID"], [{ type: "camera.zoom", factor: 2 }, "SMARTSIM_ACTION_PRESENTATION_ONLY"]])
      expect(normalizeDraftAnswers({ dhcp: ans([bad, ...DHCP]) }, exam([q("dhcp")])).rejected, bad.type).toEqual([{ id: "dhcp", code }]);
  });
  it("the student receives the public topology only: structurally no check, weight, scoring or expected value", async () => {
    const { t, q } = await labs();
    const out = sanitizeExamForStudent(exam(t.NET2_TEMPLATES.map(x => q(x.id)))).sections[0].questions;
    for (const node of out) {
      expect(node.answer).toEqual({});
      const walk = (v, k = "") => { expect(k).not.toMatch(/^(checks|weight|scoring|expected|tolerance)$/); if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk); };
      walk(node);
      expect(node.smartSim.pluginVersion).toBe(2);
    }
    expect(JSON.stringify(out)).not.toMatch(/Exam2026!|"reachability"|dhcpLease/);                                    // the private expected passphrase never ships
  });
  it("exact versions fail closed: plugin v3, config v3, question-type v2 ⇒ 0 + manual review; finalization blocks", async () => {
    const { q } = await labs();
    for (const node of [q("roas", { smartSim: { ...q("roas").smartSim, pluginVersion: 3 } }), q("roas", { smartSim: { ...q("roas").smartSim, config: { ...q("roas").smartSim.config, v: 3 } } }), q("roas", { questionTypeVersion: 2 })]) {
      expect(g(gradeExam(exam([node]), { roas: ans(ROAS) }), "roas")).toMatchObject({ score: 0, manualReview: true });
      expect(evaluateServerFinalization(exam([node])).canFinalize).toBe(false);
    }
  });
});

describe("20C-S3 — end to end through the REAL handlers (delivery → saveDraft → restore → submit → teacher review)", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } }), requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-20c", role: "teacher" } }), getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const quiet = logs => ({ logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) });
  it("RoaS + DHCP + wireless labs: private-free delivery, draft restore by replay, submit grades by replay, review shows server facts and evidence", async () => {
    const { q } = await labs();
    const nodes = [q("roas"), q("dhcp"), q("wireless")];
    const ctx = F.seed({ a: F.assignment({ examSnapshot: exam(nodes), totalMarks: nodes.reduce((n, x) => n + x.marks, 0), questionCount: 3 }) });
    const d = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(d.status).toBe(200);
    expect(JSON.stringify(d.jsonBody)).not.toMatch(/"checks"|"weight"|Exam2026!|dhcpLease/);
    const logs = [];
    const draft = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { dhcp: ans([...DHCP, ...host("pc1", "ipconfig")], { forged: true }) }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx), quiet(logs));
    expect(draft.status).toBe(200);
    const stored = ctx.getJson(F.SUB).draftAnswers.dhcp;
    expect(stored.state.ops.adapters["pc1/eth0"]).toMatchObject({ status: "dhcp", address: "192.168.1.11" });     // restore = the server's replay
    expect(stored.actions.length).toBe(DHCP.length + 1);
    const s = await submission().handler(F.studentRequest(F.submitBody({ roas: ans(ROAS), dhcp: ans(DHCP), wireless: ans(WIRELESS.slice(0, 2)) })), deps(ctx), quiet(logs));
    expect(s.status).toBe(200); expect(s.jsonBody.ok).toBe(true);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.score).toBeGreaterThan(nodes[0].marks + nodes[1].marks);
    expect(attempt.score).toBeLessThan(nodes.reduce((n, x) => n + x.marks, 0));                                      // wireless only partly done
    expect(JSON.stringify(logs)).not.toMatch(/Exam2026!|"expected"/);
    const rv = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
    expect(rv.status).toBe(200);
    const rr = rv.jsonBody.questions.find(x => x.questionId === "roas").smartSimReview, rd = rv.jsonBody.questions.find(x => x.questionId === "dhcp").smartSimReview;
    expect(rr).toMatchObject({ valid: true, score: nodes[0].marks });
    expect(rr.checks.find(c => c.kind === "reachability").evidence.join(" ")).toMatch(/REACHABLE/);
    expect(rd.state.ops.dhcpBindings.r1.map(b => b.address)).toEqual(["192.168.1.11", "192.168.1.12"]);
    expect(rd.transcripts.r1.length).toBe(DHCP.length);
  });
});

describe("20C-S4 — client / server parity on one source, answer sizes", () => {
  it("validation, replay (state + transcripts) and reachability are identical in src/ and in the generated shared build", async () => {
    const { t } = await labs();
    const tsModel = await import("../../src/net2Model.ts"), tsPlugin = await import("../../src/net2Plugin.ts");
    const shModel = loadShared("net2Model"), shPlugin = loadShared("net2Plugin");
    const runs = [["roas", ROAS], ["dhcp", DHCP], ["vtp", VTP], ["wireless", WIRELESS], ["capstone", []]];
    for (const [id, actions] of runs) {
      const raw = t.net2TemplateById(id).config();
      expect(shModel.validateNet2Config(raw), id).toEqual(tsModel.validateNet2Config(raw));
      const c = tsModel.validateNet2Config(raw).config;
      expect(JSON.stringify(shPlugin.replayNet2(c, actions)), id).toBe(JSON.stringify(tsPlugin.replayNet2(c, actions)));
    }
    for (const bad of [null, { v: 2, devices: [{ id: "__proto__", kind: "pc" }], links: [] }, { v: 2, devices: [], links: [], answer: 1 }]) expect(shModel.validateNet2Config(bad)).toEqual(tsModel.validateNet2Config(bad));
  });
  it("representative answers stay small (actions + canonical state)", async () => {
    const { q } = await labs();
    const ing = normalizeDraftAnswers({ roas: ans(ROAS), dhcp: ans(DHCP), vtp: ans(VTP), wireless: ans(WIRELESS) }, exam([q("roas"), q("dhcp"), q("vtp"), q("wireless")]));
    expect(ing.rejected).toEqual([]);
    for (const id of ["roas", "dhcp", "vtp", "wireless"]) expect(JSON.stringify(ing.answers[id]).length, id).toBeLessThan(65536);
  });
});
