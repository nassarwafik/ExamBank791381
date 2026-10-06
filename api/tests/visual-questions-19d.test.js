import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 19D — hotspot@1 and labelDiagram@1 on the SERVER (the grading authority): the registered graders re-validate the published
// public config, the PRIVATE key and the canonical image through the shared strict authority before matching (malformed authority ⇒
// 0 + manual review; malformed student input ⇒ ordinary incorrect; an unsupported version never reaches the V1 grader), the draft /
// submit ingest binds every visual answer to its published question (normalized points only / known zone → known label only), the
// student sanitizer never leaks target geometry or the correct mapping, the REAL submission / delivery / review handlers round-trip,
// visual types are never compound parts, and the committed shared build behaves like the source. Fail-first on e0ec8e2.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const clone = x => JSON.parse(JSON.stringify(x));
const IMG = { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded", contentType: "image/png" }] };
const HCFG = { v: 1, mode: "multiple", selections: 3, alt: "مخطط شبكة فيه موجّه ومبدّل وجدار حماية" };
const HKEY = { scoring: "proportional", regions: [{ id: "target-router", shape: { kind: "rect", x: 0.137, y: 0.113, width: 0.181, height: 0.173 } }, { id: "target-switch", shape: { kind: "circle", cx: 0.617, cy: 0.311, r: 0.093 } }, { id: "target-firewall", shape: { kind: "polygon", points: [{ x: 0.413, y: 0.611 }, { x: 0.719, y: 0.607 }, { x: 0.557, y: 0.893 }] } }] };
const HIN = { router: { x: 0.2, y: 0.2 }, sw: { x: 0.62, y: 0.31 }, fw: { x: 0.55, y: 0.7 }, none: { x: 0.95, y: 0.05 } };
const HSECRETS = /target-router|target-switch|target-firewall|0\.137|0\.181|0\.617|0\.093|0\.413|0\.719|0\.557|"regions"/;   // hotspot-specific: checked on whole payloads
const HCANARIES = new RegExp(HSECRETS.source + '|"shape"|"scoring"|proportional');                                                    // + generic key tokens: checked on hotspot-only output
const LCFG = { v: 1, alt: "مخطط طبقات نموذج OSI", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, name: "العليا" }, { id: "z2", shape: { kind: "rect", x: 0.1, y: 0.3, width: 0.2, height: 0.1 } }, { id: "z3", shape: { kind: "circle", cx: 0.7, cy: 0.5, r: 0.1 } }], labels: [{ id: "l-app", text: "Application" }, { id: "l-net", text: "Network" }, { id: "l-phy", text: "Physical" }, { id: "l-ses", text: "Session" }] };
const LKEY = { scoring: "proportional", correctLabelByZone: { z1: "l-app", z2: "l-net", z3: "l-phy" } };
// Independent review — the student receives the label bank in a content-hash order, never in the authored (zone-following) order.
const LCFG_DELIVERED = { ...LCFG, labels: ["l-net", "l-app", "l-phy", "l-ses"].map(id => LCFG.labels.find(l => l.id === id)) };
const LCANARIES = /correctLabelByZone|"z1":"l-app"|"scoring"/;
const hq = (over = {}) => ({ examQuestionId: "h1", presentationType: "hotspot", questionTypeVersion: 1, text: "حدّد الأجهزة الثلاثة على المخطط.", marks: 3, image: clone(IMG), hotspot: clone(HCFG), answer: clone(HKEY), ...over });
const lq = (over = {}) => ({ examQuestionId: "d1", presentationType: "labelDiagram", questionTypeVersion: 1, text: "سمِّ الطبقات.", marks: 3, image: clone(IMG), labelDiagram: clone(LCFG), answer: clone(LKEY), ...over });
const exam = questions => ({ examId: "E19D", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const g = (r, id) => r.questions.find(x => x.questionId === id);
const pts = (...p) => ({ kind: "hotspot", points: p });
const fields = values => ({ kind: "fields", values });

describe("19D — catalog identity", () => {
  it("22 production types; hotspot@1 / labelDiagram@1 are auto-graded, partial-credit, image-requiring, interactive, never compound parts", () => {
    const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    expect(catalog.QUESTION_TYPE_CATALOG.length).toBe(24);
    expect(catalog.QUESTION_TYPE_CATALOG.slice(-4, -2).map(d => [d.key, d.version, d.label, d.legacy])).toEqual([["hotspot", 1, "تحديد منطقة على صورة", false], ["labelDiagram", 1, "تسمية أجزاء الرسم", false]]);
    for (const key of ["hotspot", "labelDiagram"]) {
      const c = catalog.questionTypeDefinition(key).capabilities;
      expect([c.autoGrading, c.partialCredit, c.requiresImage, c.interactive, c.compoundPart], key).toEqual([true, true, true, true, false]);
    }
    expect(catalog.compoundPartTypeKeys()).not.toContain("hotspot"); expect(catalog.compoundPartTypeKeys()).not.toContain("labelDiagram");
  });
});

describe("19D — registered graders (gradeExam)", () => {
  it("hotspot@1 is registered at exactly version 1: proportional partial credit, parts, maximum one-to-one matching", () => {
    expect(typeof resolveGrader("hotspot", 1)).toBe("function"); expect(resolveGrader("hotspot", 2)).toBeUndefined();
    expect(g(gradeExam(exam([hq()]), { h1: pts(HIN.router, HIN.sw) }), "h1")).toMatchObject({ score: 2, correct: false, manualReview: false, parts: { correct: 2, total: 3 } });
    expect(g(gradeExam(exam([hq()]), { h1: pts(HIN.fw, HIN.sw, HIN.router) }), "h1")).toMatchObject({ score: 3, correct: true, manualReview: false });
    expect(g(gradeExam(exam([hq()]), { h1: pts(HIN.router, HIN.router, HIN.router) }), "h1")).toMatchObject({ score: 1, parts: { correct: 1, total: 3 } });
    expect(g(gradeExam(exam([hq({ answer: { ...clone(HKEY), scoring: "allOrNothing" } })]), { h1: pts(HIN.router, HIN.sw, HIN.none) }), "h1")).toMatchObject({ score: 0, manualReview: false });
    expect(g(gradeExam(exam([hq()]), {}), "h1")).toMatchObject({ score: 0, manualReview: false });
  });
  it("labelDiagram@1 is registered at exactly version 1: correct zones / total zones", () => {
    expect(typeof resolveGrader("labelDiagram", 1)).toBe("function"); expect(resolveGrader("labelDiagram", 2)).toBeUndefined();
    expect(g(gradeExam(exam([lq()]), { d1: fields({ z1: "l-app", z2: "l-net", z3: "l-ses" }) }), "d1")).toMatchObject({ score: 2, correct: false, manualReview: false, parts: { correct: 2, total: 3 } });
    expect(g(gradeExam(exam([lq()]), { d1: fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }) }), "d1")).toMatchObject({ score: 3, correct: true });
    // Independent review — allOrNothing on the server: a partly right diagram earns nothing; a fully right one earns all marks.
    const aon = { answer: { ...clone(LKEY), scoring: "allOrNothing" } };
    expect(g(gradeExam(exam([lq(aon)]), { d1: fields({ z1: "l-app", z2: "l-net", z3: "l-ses" }) }), "d1")).toMatchObject({ score: 0, correct: false, manualReview: false });
    expect(g(gradeExam(exam([lq(aon)]), { d1: fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }) }), "d1")).toMatchObject({ score: 3, correct: true });
  });
  it("malformed PUBLISHED authority (key, config, geometry, image, unsupported version) ⇒ 0 + manual review — never the V1 grader for v2", () => {
    for (const bad of [{ answer: { ...clone(HKEY), scoring: "bonus" } }, { answer: { ...clone(HKEY), regions: HKEY.regions.slice(0, 1) } }, { answer: { scoring: "proportional", regions: [{ id: "a", shape: { kind: "rect", x: 120, y: 80, width: 200, height: 100 } }, HKEY.regions[1], HKEY.regions[2]] } }, { hotspot: { ...clone(HCFG), regions: HKEY.regions } }, { image: undefined }, { image: { ...clone(IMG), visible: false } }, { image: { exists: true, assets: clone(IMG.assets) } }, { questionTypeVersion: 2 }]) {
      const r = g(gradeExam(exam([hq(bad)]), { h1: pts(HIN.router, HIN.sw, HIN.fw) }), "h1");
      expect(r.score, JSON.stringify(bad).slice(0, 80)).toBe(0); expect(r.manualReview).toBe(true); expect(r.correct).toBe(false);
    }
    for (const bad of [{ answer: { ...clone(LKEY), scoring: "x" } }, { answer: { ...clone(LKEY), correctLabelByZone: { z1: "l-app", z2: "l-app", z3: "l-phy" } } }, { labelDiagram: { ...clone(LCFG), correctLabelByZone: LKEY.correctLabelByZone } }, { image: undefined }, { image: { exists: true, assets: clone(IMG.assets) } }, { questionTypeVersion: 2 }]) {
      const r = g(gradeExam(exam([lq(bad)]), { d1: fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }) }), "d1");
      expect(r.score, JSON.stringify(bad).slice(0, 80)).toBe(0); expect(r.manualReview).toBe(true);
    }
  });
  it("malformed STUDENT input under valid authority ⇒ ordinary 0 (no manual review); forged score / matched ids / mapping ignored", () => {
    for (const resp of [{ kind: "choice", index: 0 }, pts({ x: 431, y: 287 }), pts(HIN.router, HIN.sw, HIN.fw, HIN.none), { kind: "hotspot", points: [{ x: "0.2", y: 0.2 }] }]) {
      const r = g(gradeExam(exam([hq()]), { h1: resp }), "h1");
      expect(r.score).toBe(0); expect(r.manualReview).toBe(false);
    }
    expect(g(gradeExam(exam([hq()]), { h1: { ...pts(HIN.router), score: 3, correct: true, matched: ["target-router", "target-switch", "target-firewall"] } }), "h1")).toMatchObject({ score: 1, manualReview: false });
    for (const resp of [fields({ z1: "l-transport" }), fields({ z1: "l-app", z2: "l-app", z3: "l-app" }), { kind: "text", value: "Application" }])
      expect(g(gradeExam(exam([lq()]), { d1: resp }), "d1")).toMatchObject({ score: 0, manualReview: false });
    expect(g(gradeExam(exam([lq()]), { d1: { ...fields({ z1: "l-app" }), correctLabelByZone: { z1: "l-app" }, score: 3 } }), "d1")).toMatchObject({ score: 1 });
  });
});

describe("19D — server geometry edge cases (the compiled engine the grader uses)", () => {
  const key = regions => ({ scoring: "proportional", regions });
  const two = { ...clone(HCFG), selections: 2 };
  it("a rectangle extending past the image is malformed authority (manual review), never graded", () => {
    const r = g(gradeExam(exam([hq({ answer: key([{ id: "a", shape: { kind: "rect", x: 0.9, y: 0.1, width: 0.3, height: 0.1 } }, HKEY.regions[1], HKEY.regions[2]]) })]), { h1: pts(HIN.router, HIN.sw, HIN.fw) }), "h1");
    expect(r).toMatchObject({ score: 0, manualReview: true });
  });
  it("overlapping targets: one click never satisfies both; two clicks are matched optimally in any order", () => {
    const O = [{ id: "a", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.4, height: 0.4 } }, { id: "b", shape: { kind: "rect", x: 0.3, y: 0.3, width: 0.4, height: 0.4 } }];
    expect(g(gradeExam(exam([hq({ hotspot: two, answer: key(O) })]), { h1: pts({ x: 0.35, y: 0.35 }) }), "h1")).toMatchObject({ score: 1.5, parts: { correct: 1, total: 2 } });
    expect(g(gradeExam(exam([hq({ hotspot: two, answer: key(O) })]), { h1: pts({ x: 0.35, y: 0.35 }, { x: 0.15, y: 0.15 }) }), "h1")).toMatchObject({ score: 3, parts: { correct: 2, total: 2 } });
    expect(g(gradeExam(exam([hq({ hotspot: two, answer: key([...O].reverse()) })]), { h1: pts({ x: 0.15, y: 0.15 }, { x: 0.35, y: 0.35 }) }), "h1")).toMatchObject({ score: 3, parts: { correct: 2, total: 2 } });
  });
  it("boundary clicks count as inside on the server: a polygon edge the ray test alone misses and an exact circle circumference", () => {
    const P = [{ id: "p", shape: { kind: "polygon", points: [{ x: 0.4, y: 0.6 }, { x: 0.7, y: 0.6 }, { x: 0.55, y: 0.9 }] } }, { id: "c", shape: { kind: "circle", cx: 0.5, cy: 0.25, r: 0.125 } }];
    expect(g(gradeExam(exam([hq({ hotspot: two, answer: key(P) })]), { h1: pts({ x: 0.625, y: 0.75 }, { x: 0.625, y: 0.25 }) }), "h1")).toMatchObject({ score: 3, parts: { correct: 2, total: 2 } });
  });
});

describe("19D — ingest binding (draft / submit)", () => {
  it("hotspot: rebuilt to normalized points; foreign fields stripped; invalid points / excess points / wrong question rejected; compound parts refused", () => {
    const { answers, rejected } = normalizeDraftAnswers({ h1: { kind: "hotspot", points: [{ x: 0.2, y: 0.2, target: "target-router" }], score: 3, matched: ["target-router"] } }, exam([hq()]));
    expect(rejected).toEqual([]); expect(answers.h1).toEqual(pts({ x: 0.2, y: 0.2 }));
    expect(normalizeDraftAnswers({ h1: pts({ x: 1.5, y: 0.2 }) }, exam([hq()]))).toEqual({ answers: {}, rejected: [{ id: "h1", code: "HOTSPOT_ANSWER_INVALID" }] });
    expect(normalizeDraftAnswers({ h1: pts(HIN.router, HIN.sw, HIN.fw, HIN.none) }, exam([hq()])).rejected).toEqual([{ id: "h1", code: "HOTSPOT_ANSWER_INVALID" }]);
    expect(normalizeDraftAnswers({ h1: fields({ a: "x" }) }, exam([hq()])).rejected).toEqual([{ id: "h1", code: "HOTSPOT_ANSWER_INVALID" }]);
    expect(normalizeDraftAnswers({ d1: pts(HIN.router) }, exam([lq()])).rejected).toEqual([{ id: "d1", code: "HOTSPOT_QUESTION_MISMATCH" }]);
    const compound = { examQuestionId: "c1", presentationType: "compound", text: "x", marks: 2, parts: [{ id: "p1", type: "shortAnswer", text: "a", marks: 2 }] };
    const r = normalizeDraftAnswers({ c1: { kind: "compound", parts: { p1: pts(HIN.router) } } }, exam([compound]));
    expect(r.rejected).toEqual([{ id: "c1.p1", code: "HOTSPOT_QUESTION_MISMATCH" }]); expect(r.answers.c1).toEqual({ kind: "compound", parts: {} });
    expect(normalizeDraftAnswers({ h1: { kind: "hotspot", points: [HIN.router], extra: 1 } }).answers.h1).toEqual(pts(HIN.router));   // unbound: shape only
  });
  it("labelDiagram: unknown zones stripped; unknown labels / reuse abuse / prototype keys rejected; legacy fields answers untouched", () => {
    const { answers, rejected } = normalizeDraftAnswers({ d1: { kind: "fields", values: { z1: "l-app", ghost: "l-net" }, score: 3 } }, exam([lq()]));
    expect(rejected).toEqual([]); expect(answers.d1).toEqual(fields({ z1: "l-app" }));
    expect(normalizeDraftAnswers({ d1: fields({ z1: "l-forged" }) }, exam([lq()])).rejected).toEqual([{ id: "d1", code: "LABEL_ANSWER_INVALID" }]);
    expect(normalizeDraftAnswers({ d1: fields({ z1: "l-app", z2: "l-app" }) }, exam([lq()])).rejected).toEqual([{ id: "d1", code: "LABEL_REUSE_NOT_ALLOWED" }]);
    expect(normalizeDraftAnswers({ d1: fields(JSON.parse('{"__proto__":"l-app"}')) }, exam([lq()])).rejected).toEqual([{ id: "d1", code: "LABEL_ANSWER_INVALID" }]);
    const matrix = { examQuestionId: "m1", presentationType: "matrix", text: "x", marks: 1, matrix: { rows: [{ id: "r1", label: "a" }], columns: [{ id: "c1", label: "b" }] }, answer: { correctColumnByRow: { r1: "c1" } } };
    const ans = fields({ r1: "c1", extra: "kept-as-before" });
    expect(normalizeDraftAnswers({ m1: ans }, exam([matrix])).answers.m1).toEqual(ans);
  });
  it("answered ⇔ at least one point (server mirror of the client predicate)", () => {
    expect(isResponseAnswered(pts(HIN.router))).toBe(true);
    expect(isResponseAnswered(pts())).toBe(false);
  });
});

describe("19D — student sanitizer secrecy", () => {
  it("hotspot: the public config and the canonical image reach the student; target geometry, ids, count-free key data never do", () => {
    const out = sanitizeExamForStudent(exam([hq()]));
    const node = out.sections[0].questions[0];
    expect(node.hotspot).toEqual(HCFG);
    expect(node.image).toEqual(IMG);
    expect(node.answer).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(HCANARIES);
  });
  it("a config smuggling targets is withheld entirely (fail closed)", () => {
    const out = sanitizeExamForStudent(exam([hq({ hotspot: { ...clone(HCFG), regions: HKEY.regions } })]));
    expect(out.sections[0].questions[0].hotspot).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(HCANARIES);
  });
  it("labelDiagram: zones and labels are public; the correct mapping never reaches the student; smuggled mappings withheld", () => {
    const out = sanitizeExamForStudent(exam([lq()]));
    expect(out.sections[0].questions[0].labelDiagram).toEqual(LCFG_DELIVERED);
    expect(out.sections[0].questions[0].labelDiagram.labels.map(l => l.id)).not.toEqual(LCFG.labels.map(l => l.id));
    expect(JSON.stringify(out)).not.toMatch(LCANARIES);
    const sm = sanitizeExamForStudent(exam([lq({ labelDiagram: { ...clone(LCFG), zones: [{ ...LCFG.zones[0], answer: "l-app" }, LCFG.zones[1], LCFG.zones[2]] } })]));
    expect(sm.sections[0].questions[0].labelDiagram).toBeUndefined();
  });
  it("independent review: an image whose `visible` flag is absent is never delivered, so it is refused at finalization and grading fails closed", () => {
    const image = { exists: true, assets: clone(IMG.assets) };
    const out = sanitizeExamForStudent(exam([hq({ image }), lq({ image })]));
    for (const n of out.sections[0].questions) expect(n.image.assets).toBeUndefined();
    const shared = require_("../src/lib/shared-finalization/hotspotQuestion.js");
    expect(shared.validateHotspotQuestion(hq({ image })).map(i => i.code)).toEqual(["VISUAL_IMAGE_HIDDEN"]);
    const r = gradeExam(exam([hq({ image }), lq({ image })]), { h1: pts(HIN.router, HIN.sw, HIN.fw), d1: fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }) });
    for (const id of ["h1", "d1"]) { expect(g(r, id).score).toBe(0); expect(g(r, id).manualReview).toBe(true); }
  });
  it("a bank image keeps its durable identity in the snapshot and passes the visual image contract", () => {
    const bank = { exists: true, visible: true, assets: [{ id: "b1", origin: "bank", blobName: "bank/net.png", contentType: "image/png" }] };
    const shared = require_("../src/lib/shared-finalization/hotspotQuestion.js");
    expect(shared.validateHotspotQuestion(hq({ image: bank }))).toEqual([]);
    expect(sanitizeExamForStudent(exam([hq({ image: bank })])).sections[0].questions[0].hotspot).toEqual(HCFG);
  });
});

describe("19D — end to end through the REAL handlers", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-19d", role: "teacher" } });
  const assignment = (questions = [hq(), lq()]) => F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] }, totalMarks: 6, questionCount: 2 });
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: studentAuth, requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const obsInto = logs => ({ logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) });
  it("delivery: the student receives the image + public configs and never the targets / mapping", async () => {
    const ctx = F.seed({ a: assignment() });
    const r = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(r.status).toBe(200);
    const [h, d] = r.jsonBody.assignment.exam.sections[0].questions;
    expect(h.hotspot).toEqual(HCFG); expect(h.image.assets[0].dataUrl).toBe(IMG.assets[0].dataUrl); expect(d.labelDiagram).toEqual(LCFG_DELIVERED);
    expect(JSON.stringify(h)).not.toMatch(HCANARIES); expect(JSON.stringify(r.jsonBody)).not.toMatch(HSECRETS); expect(JSON.stringify(r.jsonBody)).not.toMatch(LCANARIES);
  });
  it("saveDraft then submit: bound answers stored, graded by the server, nothing private in responses or logs; review shows the overlays' data", async () => {
    const ctx = F.seed({ a: assignment() });
    const logs = [];
    const d = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { h1: { ...pts(HIN.router), score: 3 }, d1: fields({ z1: "l-app", ghost: "x" }) }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx), obsInto(logs));
    expect(d.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.h1).toEqual(pts(HIN.router)); expect(ctx.getJson(F.SUB).draftAnswers.d1).toEqual(fields({ z1: "l-app" }));
    const s = await submission().handler(F.studentRequest(F.submitBody({ h1: pts(HIN.router, HIN.sw), d1: fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }) })), deps(ctx), obsInto(logs));
    expect(s.status).toBe(200); expect(s.jsonBody.ok).toBe(true);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.answers.h1).toEqual(pts(HIN.router, HIN.sw)); expect(attempt.score).toBe(2 + 3);
    expect(JSON.stringify(s.jsonBody)).not.toMatch(HSECRETS); expect(JSON.stringify(logs)).not.toMatch(HSECRETS); expect(JSON.stringify(logs)).not.toMatch(LCANARIES);
    const rv = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
    expect(rv.status).toBe(200);
    const hr = rv.jsonBody.questions.find(x => x.questionId === "h1"), dr = rv.jsonBody.questions.find(x => x.questionId === "d1");
    expect(hr.hotspot).toEqual(HCFG); expect(hr.image.assets[0].dataUrl).toBe(IMG.assets[0].dataUrl); expect(hr.expectedAnswer).toEqual(HKEY); expect(hr.studentAnswer).toEqual(pts(HIN.router, HIN.sw));
    expect(dr.labelDiagram).toEqual(LCFG); expect(dr.image.assets[0].dataUrl).toBe(IMG.assets[0].dataUrl); expect(dr.expectedAnswer).toEqual(LKEY);
  });
  it("a snapshot with corrupted target geometry yields 0 automatic marks and leaves the hotspot pending manual review", async () => {
    const ctx = F.seed({ a: assignment([hq({ answer: { ...clone(HKEY), regions: [{ id: "a", shape: { kind: "circle", cx: 0.5, cy: 0.5, r: 7 } }, HKEY.regions[1], HKEY.regions[2]] } }), lq()]) });
    const r = await submission().handler(F.studentRequest(F.submitBody({ h1: pts(HIN.router, HIN.sw, HIN.fw), d1: fields({ z1: "l-app", z2: "l-net", z3: "l-phy" }) })), deps(ctx), obsInto([]));
    expect(r.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.score).toBe(3); expect(attempt.manualReviewMarks).toBe(3); expect(attempt.finalized).toBe(false);
  });
});

describe("19D — validation, compound refusal and shared build parity", () => {
  it("finalization validators are registered; visual types are refused as compound parts", () => {
    const v = require_("../src/lib/shared-finalization/questionTypeValidation.js");
    expect(v.validateQuestionTypeNode(hq(), "hotspot", 1).filter(i => i.severity === "error")).toEqual([]);
    expect(v.validateQuestionTypeNode(lq(), "labelDiagram", 1).filter(i => i.severity === "error")).toEqual([]);
    expect(v.validateQuestionTypeNode(hq({ image: undefined }), "hotspot", 1).map(i => i.code)).toContain("VISUAL_IMAGE_MISSING");
    expect(v.validateQuestionTypeNode({ id: "p1", type: "hotspot", text: "x", marks: 1 }, "hotspot", undefined, { part: true }).map(i => i.code)).toContain("TYPE_NOT_COMPOUND_CAPABLE");
    expect(v.validateQuestionTypeNode({ id: "p1", type: "labelDiagram", text: "x", marks: 1 }, "labelDiagram", undefined, { part: true }).map(i => i.code)).toContain("TYPE_NOT_COMPOUND_CAPABLE");
  });
  it("the committed CommonJS mirror is in the shared build and agrees with the source", async () => {
    for (const f of ["src/visualGeometry.ts", "src/hotspotQuestion.ts", "src/labelDiagramQuestion.ts"]) expect(SHARED_ENTRIES).toContain(f);
    const sh = require_("../src/lib/shared-finalization/hotspotQuestion.js"), sl = require_("../src/lib/shared-finalization/labelDiagramQuestion.js"), sg = require_("../src/lib/shared-finalization/visualGeometry.js");
    const th = await import("../../src/hotspotQuestion.ts"), tl = await import("../../src/labelDiagramQuestion.ts"), tg = await import("../../src/visualGeometry.ts");
    for (const [key, resp] of [[HKEY, pts(HIN.router, HIN.sw)], [{ ...HKEY, scoring: "allOrNothing" }, pts(HIN.router)], [{ ...HKEY, scoring: "x" }, pts()], [HKEY, pts({ x: 2, y: 2 })]]) {
      const input = { config: HCFG, answerKey: key, image: IMG, response: resp, maxMarks: 3 };
      expect(sh.scoreHotspot(input)).toEqual(th.scoreHotspot(input));
      expect(sh.validateHotspotAnswerKey(key, HCFG)).toEqual(th.validateHotspotAnswerKey(key, HCFG));
    }
    for (const resp of [fields({ z1: "l-app" }), fields({ z1: "l-app", z2: "l-app" }), fields({})]) {
      const input = { config: LCFG, answerKey: LKEY, image: IMG, response: resp, maxMarks: 3 };
      expect(sl.scoreLabelDiagram(input)).toEqual(tl.scoreLabelDiagram(input));
    }
    for (const s of [HKEY.regions[2].shape, { kind: "polygon", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.1, y: 0.5 }] }]) expect(sg.validateVisualShape(s)).toEqual(tg.validateVisualShape(s));
  });
});
