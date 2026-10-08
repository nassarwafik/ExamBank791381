import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam, legacyToStructured } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { resolveQuestionTypeKeyOrAlias } from "../../../src/questionTypeAliases";
import { scanProjection } from "./scan.js";
import { A } from "./kit.js";
import { publishAndAssign } from "./lifecycle.js";

// Phase 20G — IMPORT / EXPORT semantics, BACKWARD COMPATIBILITY and the PRIVACY SWEEP over EVERY committed exam fixture (20D composite, 20D.1
// presentation, 20E SmartSim, 20F AI composer, 20G certification): export → serialize → import → canonical save → finalize again keeps every
// question byte-for-byte (identity, version — never upgraded, never stamped —, marks, structure, policy, composite relations, rich content,
// SmartSim identity, private teacher data, assets, coding policy, rubric, parametric contract); the server's canonical revision differs only by
// the inert per-question bookkeeping; the student projection of every fixture is clean. Legacy data keeps its V1 meaning.
const require_ = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { createPlatform } = require_("./platform.js");
const FIXTURE_DIRS = ["composite-20d", "presentation-20d1", "smartsim-20e", "ai-composer-20f", "certification-20g", "scientific-math-21a"];   // 21A: the Scientific Math mini acceptance exam
const fixtures = FIXTURE_DIRS.flatMap(d => fs.readdirSync(path.join(repo, "docs/fixtures", d)).filter(f => f.endsWith(".json")).map(f => [d + "/" + f, JSON.parse(fs.readFileSync(path.join(repo, "docs/fixtures", d, f), "utf8"))]));
const qs = e => e.sections.flatMap(s => s.questions);
// private markers the older fixtures plant in their teacher-only fields (in addition to the 20G canary)
const LEGACY_SECRETS = ["PRIVATE-GUIDANCE", "MODEL-ANSWER", "REFERENCE-SOLUTION", "HIDDEN-TITLE", "إرشاد سري للمعلم", "إجابة نموذجية سرية"];
const strip = q => { const { history: _h, redoStack: _r, ...rest } = q; return rest; };

describe("20G import / export round trip over every committed fixture", () => {
  it("there are at least 26 fixtures to certify", () => { expect(fixtures.length).toBeGreaterThanOrEqual(26); });
  for (const [name, exam] of fixtures) {
    it(name + ": export → import → canonical save keeps every question byte-for-byte; marks and policies identical; versions never upgraded", () => {
      const imp = parseStructuredExamJson(JSON.stringify(exam), name);
      expect(imp.parseErrors).toEqual([]);
      expect(qs(imp.exam)).toEqual(qs(exam));
      expect(imp.exam.sections.map(s => [s.id, s.gradingPolicy, s.maxMarks ?? null, s.requiredAnswers ?? null])).toEqual(exam.sections.map(s => [s.id, s.gradingPolicy, s.maxMarks ?? null, s.requiredAnswers ?? null]));
      const saved = toSavedStructuredExam(imp.exam);
      expect(qs(saved)).toEqual(qs(exam));
      expect(examOfficialStats(saved).totalMarks).toBe(examOfficialStats(exam).totalMarks);
      const versions = qs(exam).map(q => q.questionTypeVersion);
      expect(qs(saved).map(q => q.questionTypeVersion)).toEqual(versions);
      // the server's canonical content (saved working copy / immutable revision) differs ONLY by the inert bookkeeping
      expect(qs(canonicalizeExamContent(exam)).map(strip)).toEqual(qs(exam));
      // finalization decides the same on the original and on the round-tripped exam
      const a = evaluateExamFinalization(exam), b = evaluateExamFinalization(JSON.parse(JSON.stringify(saved)));
      expect(b.blockers.map(x => x.id)).toEqual(a.blockers.map(x => x.id));
    });
  }
});

describe("20G privacy sweep — the student projection of EVERY fixture", () => {
  for (const [name, exam] of fixtures) {
    it(name + ": no answer key, rubric, guidance, model answer, hidden test, check, AI metadata or asset request reaches the student", () => {
      const projection = sanitizeExamForStudent(exam, { parametric: { assignmentId: "sweep", studentId: "s", attemptNumber: 1 } });
      expect(scanProjection(projection, { secrets: LEGACY_SECRETS })).toEqual([]);
      expect(JSON.stringify(projection)).not.toMatch(/"aiComposer"|"assetRequest"/);
    });
  }
});

describe("20G backward compatibility — stored semantics never migrate", () => {
  it("a legacy exam WITHOUT questionTypeVersion keeps V1 meaning end to end (finalize, publish, grade) and is never stamped with a version", async () => {
    const legacy = { examId: "LEGACY-V1", title: "قديم", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "s", gradingPolicy: "all", stimuli: {}, questions: [
      { examQuestionId: "l1", presentationType: "multipleChoice", text: "?", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } },
      { examQuestionId: "l2", presentationType: "trueFalse", text: "?", marks: 1, answer: { correct: true } },
      { examQuestionId: "l3", presentationType: "compound", text: "مركّب", marks: 3, parts: [{ id: "p1", type: "shortAnswer", text: "?", marks: 1, answer: { text: "TCP" } }, { id: "p2", type: "multipleChoice", text: "?", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] }] }] };
    expect(evaluateExamFinalization(legacy).canFinalize).toBe(true);
    const p = createPlatform({ students: { "lg-s": "طالب" } });
    const { aid } = await publishAndAssign(p, legacy);
    const snap = p.assignmentOf(aid).examSnapshot;
    expect(qs(snap).map(q => q.questionTypeVersion)).toEqual([undefined, undefined, undefined]);
    const s = p.student("lg-s");
    await s.start(aid);
    const sub = await s.submit(aid, { l1: A.choice(1), l2: A.choice(0), l3: A.compound({ p1: A.text("tcp"), p2: A.choice(0) }) });
    expect(sub.jsonBody.result).toMatchObject({ score: 6, totalMarks: 6, finalized: true });
  });
  it("a legacy FLAT exam (top-level questions[]) converts to one structured section with the same grading", () => {
    const flat = { examId: "FLAT", title: "flat", questions: [{ id: "f1", presentationType: "multipleChoice", text: "?", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }, { id: "f2", type: "shortAnswer", text: "?", marks: 3, answer: { text: "x" } }] };
    const structured = legacyToStructured(flat);
    expect(structured.sections).toHaveLength(1);
    const answers = { f1: A.choice(0), f2: A.text("x") };
    expect(gradeExam(structured, answers).score).toBe(gradeExam(flat, answers).score);
    expect(gradeExam(flat, answers)).toMatchObject({ score: 5, totalMarks: 5 });
  });
  it("legacy import aliases resolve to canonical keys (never a silent guess); unknown spellings stay unknown", () => {
    expect(["mcq", "TF", "essay", "table", "cli", "multitf", "compound"].map(resolveQuestionTypeKeyOrAlias)).toEqual(["multipleChoice", "trueFalse", "shortAnswer", "tableFill", "cliFill", "multiTrueFalse", "compound"]);
    expect(resolveQuestionTypeKeyOrAlias("mcqq")).toBeUndefined();
  });
  it("coding version families keep their historical contracts: coding@1 compile error = 0 (no policy field), coding@2 / @3 require an explicit policy", () => {
    const cfg = { allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [] };
    const node = (v, answer) => ({ examQuestionId: "c", presentationType: "coding", questionTypeVersion: v, text: "?", marks: 2, coding: cfg, answer });
    const ex = n => ({ examId: "CV", title: "t", sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [n] }] });
    const HT = [{ id: "h", input: "1", expectedOutput: "1", weight: 1 }];
    expect(evaluateExamFinalization(ex(node(1, { gradingMode: "hiddenTests", comparator: "exact", hiddenTests: HT, referenceSolutions: {} }))).canFinalize).toBe(true);
    expect(evaluateExamFinalization(ex(node(1, { gradingMode: "hiddenTests", comparator: "exact", hiddenTests: HT, referenceSolutions: {}, compileErrorPolicy: "manualReview" }))).canFinalize).toBe(false);
    expect(evaluateExamFinalization(ex(node(2, { gradingMode: "hiddenTests", comparator: "exact", hiddenTests: HT, referenceSolutions: {} }))).canFinalize).toBe(false);
    expect(evaluateExamFinalization(ex(node(2, { gradingMode: "hiddenTests", comparator: "exact", hiddenTests: HT, referenceSolutions: {}, compileErrorPolicy: "zero" }))).canFinalize).toBe(true);
  });
  it("SmartSim identities are EXACT: networkTopology@1 still grades its frozen exercise; a version mismatch on the answer is refused at ingest", async () => {
    const v1 = await import("../../../src/networkTopology/networkTopologyTemplates.ts");
    const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
    const q = { examQuestionId: "v1", presentationType: "smartSim", questionTypeVersion: 1, text: "v1", marks: 23, smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: v1.routerTwoSwitchesFourPcsTemplate() }, answer: { scoring: "proportional", checks: v1.twoLanDemoChecks() } };
    const e = { examId: "V1", title: "t", sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [q] }] };
    const asV2 = normalizeDraftAnswers({ v1: A.sim("networkTopology", 2, []) }, e);
    expect(asV2.answers).toEqual({});
    expect(asV2.rejected[0].code).toBe("SMARTSIM_PLUGIN_MISMATCH");
    const ok = normalizeDraftAnswers({ v1: A.sim("networkTopology", 1, [{ type: "pc.setAddress", deviceId: "pc1", value: "192.168.10.10" }]) }, e);
    expect(gradeExam(e, ok.answers).questions[0]).toMatchObject({ score: 1, manualReview: false });
  });
});
