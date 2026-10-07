import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { examA, PERSONAS as A_PERSONAS } from "./exams/A-network.js";
import { examC } from "./exams/C-computer-science.js";
import { examE } from "./exams/E-showcase.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { ledgerOf } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { A } from "./kit.js";
import { validateStructuredExam } from "../../../src/examQuality";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { duplicateQuestion, moveQuestion, changeSectionPolicy, stripAnswersForPreview, structuredExamCopy } from "../../../src/examBuilderState";

// Phase 20G — TEACHER lifecycle, GOVERNANCE / audit and the authoring FAILURE matrix, through the real Builder authorities and the real
// governance endpoint: every malformed exam fails CLOSED with an explicit reason — in the Builder (finalization blocker code) AND at the server
// (submit-review → 422 FINALIZATION_REFUSED, nothing published, nothing assignable). Draft → Review → Approved → Published, illegal / stale /
// replayed transitions, provenance events, and the immutable published copy a submission is graded against.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const codes = e => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);
const q = (e, s, i) => e.sections[s].questions[i];

// [case, exam factory, mutation, the ONE expected blocking code]
const FAILURES = [
  ["invalid marks (0)", examE, e => { q(e, 0, 0).marks = 0; }, "MARKS_PROBLEM"],
  ["invalid marks (negative)", examE, e => { q(e, 0, 0).marks = -3; }, "MARKS_PROBLEM"],
  ["invalid marks (not a number)", examE, e => { q(e, 0, 0).marks = "abc"; }, "MARKS_PROBLEM"],
  ["duplicate question ids", examE, e => { q(e, 0, 1).examQuestionId = q(e, 0, 0).examQuestionId; }, "DUPLICATE_ID"],
  ["unsupported type version (multipleChoice@2)", examE, e => { q(e, 0, 0).questionTypeVersion = 2; }, "UNSUPPORTED_QUESTION_TYPE_VERSION"],
  ["unsupported type version (coding@4)", examC, e => { q(e, 1, 0).questionTypeVersion = 4; }, "UNSUPPORTED_QUESTION_TYPE_VERSION"],
  ["unknown question type", examE, e => { q(e, 0, 0).presentationType = "essayPlus"; }, "UNKNOWN_QUESTION_TYPE"],
  ["unsupported SmartSim plugin version (physicsFreeFall@2)", examE, e => { Object.assign(q(e, 5, 1).smartSim, { pluginKey: "physicsFreeFall", pluginVersion: 2 }); }, "SMARTSIM_PLUGIN_UNKNOWN"],
  ["unknown SmartSim plugin identity", examE, e => { q(e, 5, 1).smartSim.pluginKey = "evilSim"; }, "SMARTSIM_PLUGIN_UNKNOWN"],
  ["unresolved assetRequest", () => examE({ resolved: false }), () => {}, "AI_ASSET_REQUEST_UNRESOLVED"],
  ["incompatible composite child (legacy compound)", examE, e => { q(e, 6, 1).composite.groups[0].parts[0] = { id: "zz", type: "compound", marks: 3, text: "x", parts: [] }; }, "COMPOSITE_CHILD_TYPE_REFUSED"],
  ["forbidden nested composite", examE, e => { q(e, 6, 1).composite.groups[0].parts[0] = { id: "zz", type: "composite", marks: 3, text: "x" }; }, "COMPOSITE_CHILD_TYPE_REFUSED"],
  ["impossible firstNAnswered (more required than questions)", examE, e => { Object.assign(e.sections[0], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 9, maxMarks: 6 }); }, "FIRSTN_EXCEEDS"],
  ["impossible firstNAnswered (zero required)", examE, e => { Object.assign(e.sections[0], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 0, maxMarks: 6 }); }, "FIRSTN_BAD_REQUIRED"],
  ["firstNAnswered without a section maximum", examE, e => { Object.assign(e.sections[0], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 2 }); delete e.sections[0].maxMarks; }, "MAXMARKS_REQUIRED"],
  ["firstNAnswered without an answer unit", examE, e => { Object.assign(e.sections[0], { gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 6 }); delete e.sections[0].answerUnit; }, "ANSWER_UNIT_REQUIRED"],
  ["composite firstN group with unequal part marks", examE, e => { q(e, 6, 1).composite.groups[1].parts[0].marks = 3; }, "COMPOSITE_FIRSTN_INVALID"],
  ["conflicting composite marks (question ≠ Σ groups)", examE, e => { q(e, 6, 1).marks = 16; }, "COMPOSITE_MARKS_MISMATCH"],
  ["private hidden tests smuggled into the PUBLIC coding config", examC, e => { q(e, 1, 0).coding.hiddenTests = [{ id: "x", input: "1", expectedOutput: "1", weight: 1 }]; }, "CODING_CONFIG_UNKNOWN_KEY"],
  ["executable field on a question (renderer path)", examE, e => { q(e, 0, 0).renderer = "./evil.js"; }, "EXECUTABLE_FIELD"],
  ["executable field on a question (script)", examE, e => { q(e, 0, 0).script = "alert(1)"; }, "EXECUTABLE_FIELD"],
  ["dangling composite context reference", examE, e => { q(e, 6, 1).composite.groups[0].parts[1].contextId = "ctxNope"; }, "COMPOSITE_CONTEXT_REF_DANGLING"],
  ["duplicate composite part ids", examE, e => { q(e, 6, 1).composite.groups[1].parts[1].id = "a1"; }, "COMPOSITE_ID_DUPLICATE"],
  ["an «all» section carrying a cap", examE, e => { e.sections[0].maxMarks = 5; }, "ALL_HAS_MAXMARKS"],
  ["no sections", examE, e => { e.sections = []; }, "NO_SECTIONS"]
];

describe("20G failure matrix — every malformed exam fails closed with an explicit reason (Builder AND server)", () => {
  for (const [name, mk, mutate, code] of FAILURES) {
    it(name + " ⇒ " + code + "; governance review refuses it (422), nothing is published or assignable", async () => {
      const e = mk(); mutate(e);
      expect(codes(e)).toEqual([code]);
      expect(evaluateExamFinalization(e).canFinalize).toBe(false);
      const p = createPlatform();
      const pub = await p.teacher.publish(e);
      expect(pub.ok).toBe(false);
      const last = pub.steps.at(-1);
      expect([last.status, last.jsonBody.code]).toEqual([422, "FINALIZATION_REFUSED"]);
      expect(last.jsonBody.details.structuralErrors).toBe(1);
      expect(JSON.stringify(last.jsonBody)).not.toMatch(/CERT20G-PRIVATE|correctOptionIndex|hiddenTests/);   // the refusal carries counts only
      expect((await p.teacher.assign(e.examId)).status).toBe(409);
    });
  }
  it("malformed imports are refused with parse errors (never a half-imported exam); a legacy exam without versions imports as V1", () => {
    expect(parseStructuredExamJson("{not json", "bad.json").parseErrors.length).toBeGreaterThan(0);
    expect(parseStructuredExamJson(JSON.stringify({ title: "x", sections: "nope" }), "bad.json").canOpen).toBe(false);
    const legacy = examE(); for (const s of legacy.sections) for (const x of s.questions) if (x.presentationType === "multipleChoice") delete x.questionTypeVersion;
    const imp = parseStructuredExamJson(JSON.stringify(legacy), "legacy.json");
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    expect(imp.exam.sections[0].questions[0].questionTypeVersion).toBeUndefined();                // never upgraded / never stamped
  });
  it("grading fails CLOSED on an unknown type / unsupported version / unknown plugin that reached a snapshot by a non-governed path: teacher review, never a zero", () => {
    for (const [name, mk, mutate] of FAILURES.filter(f => /unknown question type|unsupported type version \(multipleChoice|plugin/.test(f[0]))) {
      const e = mk(); mutate(e);
      const target = name.includes("plugin") ? q(e, 5, 1) : q(e, 0, 0);
      const g = gradeExam(e, { [target.examQuestionId]: name.includes("plugin") ? A.sim("physicsFreeFall", 2, []) : A.choice(1) }).questions.find(x => x.questionId === target.examQuestionId);
      expect([g.score, g.manualReview], name).toEqual([0, true]);
    }
  });
});

describe("20G teacher lifecycle — create / load / edit / duplicate / reorder / policy / preview / finalize / govern / assign / provenance", () => {
  it("edits in the Builder keep the exam finalizable and the marks exact; the preview carries no private value", () => {
    let e = examA();
    e = { ...e, sections: duplicateQuestion(e.sections, "a-s4", "a4-1") };                       // a composite duplicate: fresh ids, same content
    e = { ...e, sections: duplicateQuestion(e.sections, "a-s3", "a3-1") };                       // a cliFill duplicate (D4: placeholders remapped)
    e = { ...e, sections: moveQuestion(e.sections, "a-s1", "a1-6", -5) };                         // reorder
    e.sections[0] = { ...e.sections[0], ...changeSectionPolicy(e.sections[0], "capScore"), maxMarks: 20 };
    expect(evaluateExamFinalization(e).blockers.map(b => b.message)).toEqual([]);
    expect(e.sections[0].questions[0].examQuestionId).toBe("a1-6");
    const dupComposite = e.sections[3].questions[1];
    expect(dupComposite.examQuestionId).not.toBe("a4-1");
    expect(JSON.stringify(dupComposite.composite.groups.map(g => g.parts.map(p => p.text)))).toBe(JSON.stringify(e.sections[3].questions[0].composite.groups.map(g => g.parts.map(p => p.text))));
    const preview = stripAnswersForPreview(e);
    expect(scanProjection(preview, { secrets: ["Class2026"] })).toEqual([]);
    const copy = structuredExamCopy(examA());
    expect(evaluateExamFinalization(copy).canFinalize).toBe(true);
    expect(new Set(copy.sections.flatMap(s => s.questions.map(x => x.examQuestionId))).size).toBe(16);
  });
  it("Draft → Review → Approved → Published; illegal / stale / replayed commands; provenance events name the actor and never carry exam content", async () => {
    const p = createPlatform();
    const e = examA();
    const en = await p.teacher.governance({ action: "enable", examId: e.examId, exam: e });
    expect(en.jsonBody.manifest.lifecycleState).toBe("draft");
    const illegal = await p.teacher.governance({ action: "publish", examId: e.examId, expectedStateVersion: en.jsonBody.manifest.stateVersion });
    expect([illegal.status, illegal.jsonBody.code]).toEqual([409, "ILLEGAL_TRANSITION"]);
    const sr = await p.teacher.governance({ action: "submit-review", examId: e.examId, revisionId: en.jsonBody.manifest.latestRevisionId, expectedStateVersion: en.jsonBody.manifest.stateVersion, requestId: "rq-fixed" });
    expect(sr.jsonBody.manifest.lifecycleState).toBe("in-review");
    const replay = await p.teacher.governance({ action: "submit-review", examId: e.examId, revisionId: en.jsonBody.manifest.latestRevisionId, expectedStateVersion: en.jsonBody.manifest.stateVersion, requestId: "rq-fixed" });
    expect([replay.status, replay.jsonBody.replayed]).toEqual([200, true]);
    const stale = await p.teacher.governance({ action: "approve", examId: e.examId, expectedStateVersion: en.jsonBody.manifest.stateVersion });
    expect([stale.status, stale.jsonBody.code]).toEqual([409, "STALE_STATE"]);
    const ap = await p.teacher.governance({ action: "approve", examId: e.examId, expectedStateVersion: sr.jsonBody.manifest.stateVersion });
    const pb = await p.teacher.governance({ action: "publish", examId: e.examId, expectedStateVersion: ap.jsonBody.manifest.stateVersion });
    expect(pb.jsonBody.manifest.lifecycleState).toBe("published");
    const ev = await p.teacher.governance({ action: "events", examId: e.examId });
    expect(ev.status).toBe(200);
    const events = ev.jsonBody.events || ev.jsonBody.items;
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(events)).toMatch(/teacher-20g-cert/);
    expect(JSON.stringify(events)).not.toMatch(/CERT20G-PRIVATE|correctOptionIndex|"sections"/);
  });
  it("the IMMUTABLE published copy: a submission is graded against the revision it was assigned; a later revision never rewrites it", async () => {
    const p = createPlatform({ students: { "gov-s": "طالب" } });
    const { aid, assignment } = await publishAndAssign(p, examA());
    expect(assignment.source).toMatchObject({ kind: "governed-revision", revisionNumber: 1 });
    const bytes = JSON.stringify(p.assignmentOf(aid));
    // the teacher returns to draft and publishes revision 2 where a1-1's key changes
    const st = (await p.teacher.status("CERT20G-A-NET")).jsonBody.manifest;
    const back = await p.teacher.governance({ action: "return-to-draft", examId: "CERT20G-A-NET", expectedStateVersion: st.stateVersion });
    const v2 = examA(); v2.sections[0].questions[0].answer = { correctOptionIndex: 2 };
    let m = (await p.teacher.governance({ action: "create-revision", examId: "CERT20G-A-NET", exam: v2, expectedStateVersion: back.jsonBody.manifest.stateVersion })).jsonBody.manifest;
    for (const action of ["submit-review", "approve", "publish"]) m = (await p.teacher.governance({ action, examId: "CERT20G-A-NET", expectedStateVersion: m.stateVersion, ...(action === "submit-review" ? { revisionId: m.latestRevisionId } : {}) })).jsonBody.manifest;
    expect(m.lifecycleState).toBe("published");
    expect(JSON.stringify(p.assignmentOf(aid))).toBe(bytes);
    // the student of the ORIGINAL assignment is graded by revision 1's key
    const run = await takeExam(p, aid, "gov-s", A_PERSONAS.FULL.answers, { chunks: 1 });
    expect(ledgerOf(run.attempt).questions["a1-1"]).toEqual([2, 0]);
    // a NEW assignment binds revision 2
    const a2 = await p.teacher.assign("CERT20G-A-NET");
    expect(a2.jsonBody.assignment.source.revisionNumber).toBe(2);
  });
});
