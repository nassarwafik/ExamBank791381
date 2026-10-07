import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { runGeneration, runModify } from "../../../src/aiComposer/composerRun";
import { applyComposerPatch } from "../../../src/aiComposer/composerPatch";
import { COMPOSER_FIXTURES, fixtureScript } from "../../../src/aiComposer/testing/composerFixtures";
import * as F from "../../../src/aiComposer/testing/composerFakeAi";
import { openExamHistory, updateExamHistory, undoExamHistory, examDeepEqual } from "../../../src/examHistory";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { authoringQuestionTypeVersion } from "../../../src/questionTypeCatalog";
import { examA } from "./exams/A-network.js";
import { examC } from "./exams/C-computer-science.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { CANARY } from "./kit.js";
import { IMG } from "./exams/E-showcase.js";

// Phase 20G — AI COMPOSER certification, deterministic scripted model only (no provider is called, no provider secret is read). Mode A (generate
// exam) runs through the REAL endpoint handler and client orchestration and then through the REAL platform: governance (server finalization),
// assignment, sanitized student delivery, grading. Modes B–E (modify exam, generate section, replace question, improve content) run on the
// CERTIFIED exams, whose private keys carry canaries: the provider prompt never contains them, the AI never owns marks / ids / versions, scope is
// locked, a stale patch applies nothing, selective apply leaves other regions intact, undo restores byte-for-byte and the diff is the real change.
// The endpoint has no publish / assign / grade stage: AI output reaches students only through the teacher and governance.
const require_ = createRequire(import.meta.url);
const composerApi = require_("../../src/functions/ai-exam-composer.js");
const { createPlatform } = require_("./platform.js");
const NOW = "2026-10-07T00:00:00.000Z";
function transportFor(script) {
  const ai = F.scriptedAi(script);
  const t = async body => (await composerApi.handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-20g" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null, now: () => NOW })).jsonBody;
  return { t, calls: ai.calls };
}
async function modify(exam, mode, scope, instruction, patchJson) {
  const { t, calls } = transportFor({ ai_exam_patch: [patchJson] });
  const r = await runModify(t, { exam, mode, scope, instruction, report: () => {}, nonce: "cert20" });
  return { r, calls };
}
const allQs = e => e.sections.flatMap(s => s.questions);
const without = (e, ids) => JSON.stringify(e.sections.map(s => ({ ...s, questions: s.questions.filter(q => !ids.includes(q.examQuestionId)) })));
const PROMPT_SECRETS = new RegExp([CANARY, "Class2026", "hiddenTests", "expectedOutput", "referenceSolutions", "\"checks\"", "correctOptionIndex", "modelAnswer", "guidance", "SUM=3000000", "gnikrowten"].join("|"));

describe("20G AI composer — mode A: generate exam → governance → assignment → student → grading", () => {
  for (const f of COMPOSER_FIXTURES) {
    it(f.name + ": the generated exam survives the WHOLE platform; AI never owns marks, ids or versions; nothing private reaches the student", async () => {
      const { t, calls } = transportFor(fixtureScript(f));
      const r = await runGeneration(t, f.intent, { examId: "CERT20G-AI-" + f.name, report: () => {}, nonce: "c20g" + f.name.charCodeAt(0).toString(36) });
      expect(r.ok, JSON.stringify(r.failure)).toBe(true);
      const exam = r.result.exam;
      // marks: exactly the requested total, distributed by CODE (plan marks are validated, never trusted as a total)
      expect(allQs(exam).reduce((n, q) => n + q.marks, 0)).toBe(f.intent.totalMarks);
      // ids: code-assigned from the generation nonce, unique; versions: the catalog's AUTHORING version for every family
      const ids = allQs(exam).map(q => q.examQuestionId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^aic20g/);
      for (const q of allQs(exam)) expect(q.questionTypeVersion ?? 1, q.presentationType).toBe(authoringQuestionTypeVersion(q.presentationType));
      // the provider saw catalog-constrained prompts only — never a secret, never student data
      for (const c of calls) expect(c.prompt).not.toMatch(/OPENAI_API_KEY|studentId|password|CERT20G-PRIVATE/);
      // an unresolved asset request (fixture E) is the teacher's TODO: resolve it (attach the image, drop the request) before governance
      for (const q of allQs(exam)) if (q.assetRequest) { q.image = IMG(); delete q.assetRequest; }
      expect(evaluateExamFinalization(exam).blockers.map(b => b.message)).toEqual([]);
      const p = createPlatform({ students: { "ai-s": "طالب" } });
      const { aid } = await publishAndAssign(p, exam);
      const run = await takeExam(p, aid, "ai-s", {}, { chunks: 1 });
      expect(run.delivery.status).toBe(200);
      expect(scanProjection(run.delivery.jsonBody, { secrets: ["إرشاد سري للمعلم", "إجابة نموذجية سرية"] })).toEqual([]);
      expect(JSON.stringify(run.delivery.jsonBody)).not.toMatch(/aiComposer|assetRequest/);
      expect(run.submit.status).toBe(200);
      expect(attemptInvariants(run.attempt, f.intent.totalMarks)).toEqual([]);
      expect(run.attempt.score).toBe(0);
    });
  }
  it("the composer endpoint has no publish / assign / grade stage and refuses unknown request fields (the AI cannot act on the platform)", async () => {
    for (const stage of ["publish", "assign", "grade", "approve", "submit"]) {
      const r = await composerApi.handler({ json: async () => ({ stage }) }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), callTextJson: async () => { throw new Error("provider must not be called"); }, reserveComposerCall: async () => ({ allowed: true }), container: null });
      expect([r.status, r.jsonBody.code], stage).toEqual([400, "STAGE_UNKNOWN"]);
    }
    const unauth = await composerApi.handler({ json: async () => ({ stage: "plan" }) }, { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), callTextJson: async () => { throw new Error("no"); } });
    expect(unauth.status).toBe(401);
  });
});

describe("20G AI composer — modes B–E on CERTIFIED exams (private keys present, canaried)", () => {
  it("B modify exam (section scope): mark redistribution changes ONLY that section's marks; the prompt never carries a private value; still finalizable", async () => {
    const exam = examA();
    const { r, calls } = await modify(exam, "modifyExam", { kind: "section", sectionId: "a-s1" }, "أعد توزيع علامات القسم الأول: 4 و 4 و 3 و 4 و 2 و 4.", F.patch([["a1-1", 4], ["a1-2", 4], ["a1-3", 3], ["a1-4", 4], ["a1-5", 2], ["a1-6", 4]].map(([questionId, marks]) => F.op("updateQuestionMarks", { questionId, marks }))));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(calls.length).toBe(1);
    for (const c of calls) expect(c.prompt).not.toMatch(PROMPT_SECRETS);
    const a = applyComposerPatch(exam, r.result.patch, { now: NOW, request: "b" });
    expect(a.ok).toBe(true);
    expect(allQs(a.exam).slice(0, 6).map(q => q.marks)).toEqual([4, 4, 3, 4, 2, 4]);
    expect(JSON.stringify(a.exam.sections.slice(1))).toBe(JSON.stringify(exam.sections.slice(1)));
    expect(allQs(a.exam).map(q => q.answer)).toEqual(allQs(exam).map(q => q.answer));          // keys untouched
    expect(r.result.diff.map(d => d.changes[0].field)).toEqual(Array(6).fill("العلامة"));
    expect(evaluateExamFinalization(a.exam).canFinalize).toBe(true);
  });
  it("C generate section (exam scope): ONE new section with code-assigned ids; every existing section byte-identical; the new questions validate", async () => {
    const exam = examA();
    const { r } = await modify(exam, "generateSection", { kind: "exam" }, "أضف قسمًا قصيرًا عن DNS من سؤالين.", F.patch([F.op("addSection", { section: { title: "DNS", instructions: "", itemMarks: [3, 2], items: [F.item("multipleChoice", { question: F.mcq("ما منفذ DNS؟", ["53", "80"]) }), F.item("trueFalse", { question: F.tf("DNS يحوّل الأسماء إلى عناوين.", true) })] } })]));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const a = applyComposerPatch(exam, r.result.patch, { now: NOW, request: "c" });
    expect(a.ok).toBe(true);
    expect(a.exam.sections).toHaveLength(5);
    expect(JSON.stringify(a.exam.sections.slice(0, 4))).toBe(JSON.stringify(exam.sections));
    const added = a.exam.sections[4];
    expect(added.questions.map(q => q.examQuestionId)).toEqual(["aicert20-ms1-1", "aicert20-ms1-2"]);
    expect(added.questions.map(q => q.marks)).toEqual([3, 2]);
    expect(evaluateExamFinalization(a.exam).blockers.map(b => b.message)).toEqual([]);
  });
  it("D replace question: only the target changes (id kept, marks code-assigned); applying the same patch to an EDITED exam is STALE and applies nothing", async () => {
    const exam = examA();
    const { r } = await modify(exam, "replaceQuestion", { kind: "question", questionId: "a1-1" }, "استبدل السؤال الأول بسؤال صح/خطأ.", F.patch([F.op("replaceQuestion", { questionId: "a1-1", marks: 2, item: F.item("trueFalse", { question: F.tf("IPv4 = 32 بت.", true) }) })]));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const a = applyComposerPatch(exam, r.result.patch, { now: NOW, request: "d" });
    expect(a.ok).toBe(true);
    expect(allQs(a.exam)[0]).toMatchObject({ examQuestionId: "a1-1", presentationType: "trueFalse", marks: 2 });
    expect(without(a.exam, ["a1-1"])).toBe(without(exam, ["a1-1"]));
    const edited = examA(); edited.sections[2].questions[0].text += " (عدّلها المعلم)";
    const stale = applyComposerPatch(edited, r.result.patch, { now: NOW, request: "d" });
    expect(stale).toMatchObject({ ok: false, code: "STALE_REVISION" });
  });
  it("E improve content: text only; a marks / key change or an op on ANOTHER question is refused (scope + protected-field lock); hidden coding tests never sent, preserved byte-for-byte", async () => {
    const exam = examC();
    const before = JSON.stringify(allQs(exam)[6].answer);
    const ok = await modify(exam, "improveContent", { kind: "question", questionId: "c2-1" }, "حسّن صياغة السؤال فقط.", F.patch([F.op("updateQuestionText", { questionId: "c2-1", text: "اكتب برنامج Python يقرأ عددين صحيحين في سطر واحد ويطبع SUM=<المجموع>." })]));
    expect(ok.r.ok, JSON.stringify(ok.r)).toBe(true);
    expect(ok.calls.length).toBe(1);
    for (const c of ok.calls) expect(c.prompt).not.toMatch(PROMPT_SECRETS);
    const a = applyComposerPatch(exam, ok.r.result.patch, { now: NOW, request: "e" });
    expect(a.ok).toBe(true);
    expect(JSON.stringify(allQs(a.exam)[6].answer)).toBe(before);
    expect(allQs(a.exam)[6].marks).toBe(15);
    const marks = await modify(exam, "improveContent", { kind: "question", questionId: "c2-1" }, "حسّن صياغة السؤال.", F.patch([F.op("updateQuestionMarks", { questionId: "c2-1", marks: 20 })]));
    expect(marks.r.ok).toBe(false);
    const other = await modify(exam, "improveContent", { kind: "question", questionId: "c2-1" }, "حسّن صياغة السؤال.", F.patch([F.op("updateQuestionText", { questionId: "c2-2", text: "x" })]));
    expect(other.r.ok).toBe(false);
  });
  it("selective apply: of a two-operation patch, applying operation 0 only changes exactly that; undo restores the exam byte-for-byte (one history step)", async () => {
    const exam = examA();
    const { r } = await modify(exam, "modifyExam", { kind: "exam" }, "عدّل نص سؤالين.", F.patch([F.op("updateQuestionText", { questionId: "a1-1", text: "كم بتًا في عنوان IPv4؟" }), F.op("updateQuestionText", { questionId: "a1-5", text: "10.0.0.1 عنوان خاص؟" })]));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const a = applyComposerPatch(exam, r.result.patch, { now: NOW, request: "s", selected: [0] });
    expect(a.ok).toBe(true);
    expect(allQs(a.exam)[0].text).toBe("كم بتًا في عنوان IPv4؟");
    expect(allQs(a.exam)[4].text).toBe(allQs(exam)[4].text);
    let h = openExamHistory(exam);
    h = updateExamHistory(h, () => a.exam);
    expect(examDeepEqual(h.present, exam)).toBe(false);
    h = undoExamHistory(h);
    expect(JSON.stringify(h.present)).toBe(JSON.stringify(exam));
  });
  it("raw HTML / script / javascript: URLs: a rich-content patch carrying them is REFUSED (every repair attempt too); markup typed into plain text stays inert text", async () => {
    const exam = examA();
    const hostile = F.patch([F.op("updateQuestionRichContent", { questionId: "a1-1", richMode: "append", richBlocks: [F.rb("paragraph", { text: "<script>alert(1)</script><a href=\"javascript:alert(1)\">x</a>" })] })]);
    const { t, calls } = transportFor({ ai_exam_patch: [hostile, hostile, hostile, hostile] });
    const r = await runModify(t, { exam, mode: "improveContent", scope: { kind: "question", questionId: "a1-1" }, instruction: "أضف رابطًا.", report: () => {}, nonce: "cert20" });
    expect(r.ok).toBe(false);
    expect(r.failure.kind).toBe("validation");
    expect(r.failure.issues.map(i => i.code)).toEqual(["AI_RICH_CONTENT_INVALID"]);
    expect(calls.length).toBe(3);                                              // the original + the bounded repair attempts, all refused
    // plain text is never interpreted: no production component renders HTML (no dangerouslySetInnerHTML / innerHTML / srcdoc sink exists)
    const plain = await modify(exam, "improveContent", { kind: "question", questionId: "a1-1" }, "حسّن.", F.patch([F.op("updateQuestionText", { questionId: "a1-1", text: "<img src=x onerror=alert(1)> كم بتًا؟" })]));
    expect(plain.r.ok).toBe(true);
    const a = applyComposerPatch(exam, plain.r.result.patch, { now: NOW, request: "h" });
    expect(typeof allQs(a.exam)[0].text).toBe("string");
    const fs = require_("node:fs"), path = require_("node:path");
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [path.join(d, e.name)] : []);
    const sinks = walk(path.resolve(__dirname, "../../../src")).filter(f => /dangerouslySetInnerHTML\s*=|\.innerHTML\s*=|srcdoc\s*=/.test(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(sinks).toEqual([]);
  });
});
