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

// Phase 20A.2 — the two production SmartSim pilots (physicsFreeFall@1, functionStudy2d@1) through the REAL server paths: finalization,
// student delivery (sanitizer), saveDraft / submit ingest (bind + replay; forged state discarded; presentation gestures refused), the
// authoritative grader, the teacher review endpoint, exact plugin / question-type versions failing closed, client / server parity on one
// TypeScript source, compact answers, and pins for networkTopology@1 / simulation@1 / the 24-type catalog.
// New-function tests (fail-first on the post-#265 baseline 44d0f21) except the labelled PINS.
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = require_("./fixtures/coding-17c.js");
const loadShared = name => require_("../src/lib/shared-finalization/" + name + ".js");
const g = (r, id) => r.questions.find(x => x.questionId === id);
const exam = questions => ({ examId: "E20A2", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const ff = () => import("../../src/physicsFreeFall/freeFallTemplates.ts");
const fs2d = () => import("../../src/functionStudy/functionStudyTemplates.ts");
const TWO_NINTHS = 0.2222222222222222;
const FF_PERFECT = [{ type: "measurement.set", measurementId: "impactTime", value: 2.02 }, { type: "measurement.set", measurementId: "impactSpeed", value: 19.8 }, { type: "measurement.set", measurementId: "heightAt1s", value: 15.1 },
  { type: "measurement.set", measurementId: "velocityAt1s", value: -9.8 }, { type: "graphPoint.set", pointId: "impactPoint", t: 2.02, y: 0 }, { type: "graphPoint.set", pointId: "pointAt1s", t: 1, y: 15.1 }];
const FN_PERFECT = [{ type: "domain.setExclusions", values: [-2, 1] }, { type: "intercepts.setX", points: [{ x: 2, y: 0 }] }, { type: "intercept.setY", y: 2 }, { type: "asymptotes.setVertical", values: [-2, 1] },
  { type: "asymptotes.setHorizontal", values: [0] }, { type: "extrema.set", points: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: TWO_NINTHS }] },
  { type: "intervals.set", intervals: [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] }];
async function pilots() {
  const a = await ff(), b = await fs2d();
  const node = (id, key, config, checks, marks, over = {}) => ({ examQuestionId: id, presentationType: "smartSim", questionTypeVersion: 1, text: "سؤال محاكاة", marks, smartSim: { schemaVersion: 1, pluginKey: key, pluginVersion: 1, config }, answer: { scoring: "proportional", checks }, ...over });
  return {
    ffQ: (over) => node("ff", "physicsFreeFall", a.freeFallClassroomConfig(), a.freeFallClassroomChecks(), 12, over),
    fnQ: (over) => node("fn", "functionStudy2d", b.rationalCertificationConfig(), b.rationalCertificationChecks(), 13, over)
  };
}
const ans = (key, actions, state = {}) => ({ kind: "smartSim", pluginKey: key, pluginVersion: 1, actions, state });

describe("20A.2-S1 — registration, descriptors, shared build", () => {
  it("production plugins = functionStudy2d@1, networkTopology@1, physicsFreeFall@1 (code-owned; descriptors data-only; client = server catalog)", async () => {
    const reg = loadShared("trustedSimRegistry"); loadShared("trustedSimPlugins");
    expect(reg.listSmartSimPluginDescriptors().map(d => d.key + "@" + d.version)).toEqual(["functionStudy2d@1", "networkTopology@1", "physicsFreeFall@1"]);
    const ts = await import("../../src/trustedSimCatalog.ts");
    expect(loadShared("trustedSimCatalog").smartSimAuthoringCatalog()).toEqual(ts.smartSimAuthoringCatalog());
    for (const m of ["physicsFreeFallModel", "physicsFreeFallPlugin", "functionStudyModel", "functionStudyPlugin"]) {
      expect(SHARED_ENTRIES, m).toContain("src/" + m + ".ts");
      const code = fs.readFileSync(path.join(repo, "api/src/lib/shared-finalization", m + ".js"), "utf8");
      expect(code, m).not.toMatch(/\beval\(|new Function|fetch\(|XMLHttpRequest|import\(|Math\.random|Date\.now|setTimeout|setInterval|process\.|require\("(fs|http|https|net|child_process)"\)/);
    }
  });
  it("PIN — the question-type catalog stays at 24 and smartSim@1 is the only trusted simulator type; simulation@1 stays manual", () => {
    const cat = loadShared("questionTypeCatalog");
    expect(cat.QUESTION_TYPE_CATALOG.length).toBe(24);
    expect(resolveGrader("simulation", 1)({}, { kind: "simulation", state: { score: 100 } }, 10)).toEqual({ score: 0, manualReview: true, correct: false });
  });
});

describe("20A.2-S2 — finalization, delivery and grading through the real pipeline", () => {
  it("both certification presets finalize; gradeExam replays and scores them (12 / 12 and 13 / 13); zero actions score 0", async () => {
    const { ffQ, fnQ } = await pilots();
    expect(evaluateServerFinalization(exam([ffQ(), fnQ()])).canFinalize).toBe(true);
    const r = gradeExam(exam([ffQ(), fnQ()]), { ff: ans("physicsFreeFall", FF_PERFECT), fn: ans("functionStudy2d", FN_PERFECT) });
    expect(g(r, "ff")).toMatchObject({ score: 12, correct: true, manualReview: false });
    expect(g(r, "fn")).toMatchObject({ score: 13, correct: true, manualReview: false });
    const zero = gradeExam(exam([ffQ(), fnQ()]), { ff: ans("physicsFreeFall", []), fn: ans("functionStudy2d", []) });
    expect(g(zero, "ff").score).toBe(0); expect(g(zero, "fn").score).toBe(0);
  });
  it("forged perfect states with no actions earn 0; ingest stores the REPLAYED state", async () => {
    const { ffQ, fnQ } = await pilots();
    const ffForged = { v: 1, measurements: { impactTime: 2.0203, impactSpeed: 19.799, heightAt1s: 15.1, velocityAt1s: -9.8 }, points: { impactPoint: { t: 2.0203, y: 0 }, pointAt1s: { t: 1, y: 15.1 } } };
    const fnForged = { v: 1, domainExclusions: [-2, 1], xIntercepts: [{ x: 2, y: 0 }], yIntercept: { x: 0, y: 2 }, verticalAsymptotes: [-2, 1], horizontalAsymptotes: [0], extrema: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: TWO_NINTHS }], monotonicIntervals: [] };
    const r = gradeExam(exam([ffQ(), fnQ()]), { ff: ans("physicsFreeFall", [], ffForged), fn: ans("functionStudy2d", [], fnForged) });
    expect(g(r, "ff").score).toBe(0); expect(g(r, "fn").score).toBe(0);
    const ing = normalizeDraftAnswers({ ff: ans("physicsFreeFall", FF_PERFECT.slice(0, 1), ffForged), fn: ans("functionStudy2d", FN_PERFECT.slice(0, 1), fnForged) }, exam([ffQ(), fnQ()]));
    expect(ing.rejected).toEqual([]);
    expect(ing.answers.ff.state).toEqual({ v: 1, measurements: { impactTime: 2.02 }, points: {} });
    expect(ing.answers.fn.state).toMatchObject({ domainExclusions: [-2, 1], verticalAsymptotes: [], extrema: [] });
  });
  it("presentation gestures and play / pause / scrub never enter the academic record", async () => {
    const { ffQ, fnQ } = await pilots();
    for (const gesture of [{ type: "view.scrub", time: 1 }, { type: "camera.zoom", factor: 3 }, { type: "pointer.down", x: 1, y: 2 }])
      expect(normalizeDraftAnswers({ ff: ans("physicsFreeFall", [gesture, ...FF_PERFECT]), fn: ans("functionStudy2d", [gesture, ...FN_PERFECT]) }, exam([ffQ(), fnQ()])).rejected, gesture.type).toEqual([{ id: "ff", code: "SMARTSIM_ACTION_PRESENTATION_ONLY" }, { id: "fn", code: "SMARTSIM_ACTION_PRESENTATION_ONLY" }]);
    for (const play of [{ type: "simulation.play" }, { type: "simulation.pause" }, { type: "timeline.scrub", time: 1 }, { type: "animation.frame", frame: 3 }])
      expect(normalizeDraftAnswers({ ff: ans("physicsFreeFall", [play]) }, exam([ffQ()])).rejected, play.type).toEqual([{ id: "ff", code: "SMARTSIM_ACTION_INVALID" }]);
  });
  it("the student receives the public config only: structurally no check, tolerance, expected value or weight", async () => {
    const { ffQ, fnQ } = await pilots();
    const out = sanitizeExamForStudent(exam([ffQ(), fnQ()])).sections[0].questions;
    for (const q of out) {
      expect(q.answer).toEqual({});
      const walk = (v, k = "") => { expect(k).not.toMatch(/^(expected|tolerance|weight|checks|scoring)$/); if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk); };
      walk(q);
    }
    expect(Object.keys(out[1].smartSim.config).sort()).toEqual(["expression", "tasks", "v", "window"]);
    expect(JSON.stringify(out[1])).not.toMatch(/0\.2222|"\+inf"|"-inf"|decreasing|increasing/);
    expect(JSON.stringify(out[0])).not.toMatch(/2\.0203|19\.79|physics\.|pointNear|numericNear/);
  });
  it("exact versions fail closed: plugin v2, question-type v2 ⇒ 0 + manual review and blocked finalization", async () => {
    const { ffQ, fnQ } = await pilots();
    for (const q of [ffQ(), fnQ()]) {
      const v2 = { ...q, smartSim: { ...q.smartSim, pluginVersion: 2 } };
      expect(g(gradeExam(exam([v2]), { [q.examQuestionId]: ans(q.smartSim.pluginKey, []) }), q.examQuestionId)).toMatchObject({ score: 0, manualReview: true });
      expect(evaluateServerFinalization(exam([v2])).canFinalize).toBe(false);
      const qt2 = { ...q, questionTypeVersion: 2 };
      expect(g(gradeExam(exam([qt2]), { [q.examQuestionId]: ans(q.smartSim.pluginKey, []) }), q.examQuestionId)).toMatchObject({ score: 0, manualReview: true });
    }
  });
});

describe("20A.2-S3 — end to end through the REAL handlers (delivery → saveDraft → submit → teacher review)", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } }), requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-20a2", role: "teacher" } }), getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const quiet = logs => ({ logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) });
  it("both pilots: delivery is private-free; saveDraft stores the replayed state; submit grades by replay; the review shows server-computed facts", async () => {
    const { ffQ, fnQ } = await pilots();
    const ctx = F.seed({ a: F.assignment({ examSnapshot: exam([ffQ(), fnQ()]), totalMarks: 25, questionCount: 2 }) });
    const d = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(d.status).toBe(200);
    expect(JSON.stringify(d.jsonBody)).not.toMatch(/tolerance|"expected"|physics\.impactTime|monotonic\.intervals|0\.2222/);
    const logs = [];
    const s1 = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { ff: ans("physicsFreeFall", FF_PERFECT.slice(0, 2), { v: 1, measurements: { impactSpeed: 999 }, points: {} }) }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx), quiet(logs));
    expect(s1.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.ff.state).toEqual({ v: 1, measurements: { impactSpeed: 19.8, impactTime: 2.02 }, points: {} });
    const s2 = await submission().handler(F.studentRequest(F.submitBody({ ff: ans("physicsFreeFall", FF_PERFECT.slice(0, 2)), fn: ans("functionStudy2d", FN_PERFECT, { forged: true }) })), deps(ctx), quiet(logs));
    expect(s2.status).toBe(200); expect(s2.jsonBody.ok).toBe(true);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.score).toBe(6 + 13);
    expect(JSON.stringify(s2.jsonBody)).not.toMatch(/tolerance|"expected"/); expect(JSON.stringify(logs)).not.toMatch(/"expected"|tolerance/);
    const rv = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
    expect(rv.status).toBe(200);
    const rff = rv.jsonBody.questions.find(x => x.questionId === "ff").smartSimReview, rfn = rv.jsonBody.questions.find(x => x.questionId === "fn").smartSimReview;
    expect(rff).toMatchObject({ valid: true, score: 6, maxMarks: 12, passedWeight: 6, totalWeight: 12 });
    expect(rff.state).toEqual({ v: 1, measurements: { impactSpeed: 19.8, impactTime: 2.02 }, points: {} });
    expect(rff.checks.filter(c => c.passed).map(c => c.id).sort()).toEqual(["impact-speed", "impact-time"]);
    expect(rfn).toMatchObject({ valid: true, score: 13, maxMarks: 13 });
    expect(rfn.state.monotonicIntervals.length).toBe(5);
  });
});

describe("20A.2-S4 — client / server parity, compact answers, backward compatibility", () => {
  it("config validation, replay and evaluation are identical in src/ and in the generated shared build", async () => {
    const pairs = [["physicsFreeFallModel", "validateFreeFallConfig"], ["functionStudyModel", "validateFunctionStudyConfig"]];
    const { ffQ, fnQ } = await pilots();
    const corpus = [ffQ().smartSim.config, fnQ().smartSim.config, { v: 1 }, null, { ...fnQ().smartSim.config, expression: { language: 2, variable: "x", source: "x.constructor" } }, { ...ffQ().smartSim.config, model: { initialHeight: -1, initialVelocity: 0, gravity: 9.8 } }];
    for (const [mod, fn] of pairs) { const ts = await import("../../src/" + mod + ".ts"); for (const c of corpus) expect(loadShared(mod)[fn](c), mod + " " + JSON.stringify(c).slice(0, 80)).toEqual(ts[fn](c)); }
    const ffTs = await import("../../src/physicsFreeFallPlugin.ts"), fnTs = await import("../../src/functionStudyPlugin.ts");
    expect(loadShared("physicsFreeFallPlugin").replayFreeFall(ffQ().smartSim.config, FF_PERFECT)).toEqual(ffTs.replayFreeFall(ffQ().smartSim.config, FF_PERFECT));
    const fnCfg = loadShared("functionStudyModel").validateFunctionStudyConfig(fnQ().smartSim.config).config;
    expect(loadShared("functionStudyPlugin").replayFunctionStudy(fnCfg, FN_PERFECT)).toEqual(fnTs.replayFunctionStudy(fnCfg, FN_PERFECT));
    const fm = await import("../../src/functionStudyModel.ts");
    expect(loadShared("functionStudyModel").sampleFunction(fnCfg)).toEqual(fm.sampleFunction(fnCfg));
    const ffModel = await import("../../src/physicsFreeFallModel.ts"), m = { initialHeight: 20, initialVelocity: 3, gravity: 9.81 };
    for (const f of ["impactTime", "impactSpeed"]) expect(loadShared("physicsFreeFallModel")[f](m)).toBe(ffModel[f](m));
  });
  it("representative answers are compact (certification answers well under 4 KB serialized)", async () => {
    const { ffQ, fnQ } = await pilots();
    const ing = normalizeDraftAnswers({ ff: ans("physicsFreeFall", FF_PERFECT), fn: ans("functionStudy2d", FN_PERFECT) }, exam([ffQ(), fnQ()]));
    const sizes = { ff: JSON.stringify(ing.answers.ff).length, fn: JSON.stringify(ing.answers.fn).length };
    expect(sizes.ff).toBeLessThan(4096); expect(sizes.fn).toBeLessThan(4096);
  });
  it("PIN — networkTopology@1 still grades the two-LAN exercise 23 / 23 next to the new plugins", async () => {
    const t = await import("../../src/networkTopology/networkTopologyTemplates.ts");
    const M24 = "255.255.255.0";
    const pc = (id, a, gw) => [{ type: "pc.setAddress", deviceId: id, value: a }, { type: "pc.setMask", deviceId: id, value: M24 }, { type: "pc.setGateway", deviceId: id, value: gw }];
    const cmd = (kind, id, ...c) => c.map(command => ({ type: kind + ".command", deviceId: id, command }));
    const FULL = [...pc("pc1", "192.168.10.10", "192.168.10.254"), ...pc("pc2", "192.168.10.20", "192.168.10.254"), ...pc("pc3", "192.168.20.10", "192.168.20.254"), ...pc("pc4", "192.168.20.20", "192.168.20.254"),
      ...cmd("switch", "sw1", "enable", "configure terminal", "hostname BR1-SW1", "end"), ...cmd("switch", "sw2", "enable", "configure terminal", "hostname BR1-SW2", "end"),
      ...cmd("router", "r1", "enable", "configure terminal", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0", "no shutdown", "end")];
    const node = { examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "شبكة", marks: 23, smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: t.routerTwoSwitchesFourPcsTemplate() }, answer: { scoring: "proportional", checks: t.twoLanDemoChecks() } };
    expect(g(gradeExam(exam([node]), { t1: ans("networkTopology", FULL) }), "t1")).toMatchObject({ score: 23, correct: true });
  });
});
