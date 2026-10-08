import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { publishAndAssign, takeExam } from "../certification-20g/lifecycle.js";
import { ledgerOf, attemptInvariants } from "../certification-20g/ledger.js";
import { scanProjection } from "../certification-20g/scan.js";
import { A } from "../certification-20g/kit.js";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseMath, MATH_ENVIRONMENTS } from "../../../src/richContent/richMath";
import { validateRichContent } from "../../../src/richContent/richContentModel";

// Phase 21A — the SCIENTIFIC MATH MINI ACCEPTANCE EXAM (docs/fixtures/scientific-math-21a/ExamBank_21A_Scientific_Math_Mini_Acceptance.json):
// the real structured-exam schema (schemaVersion 2, sections A–D, 40 marks, mcq / numericResponse / shortAnswer / fillBlank, every question
// with a plain `text` fallback AND RichContentV1 carrying v2 math: pmatrix, vmatrix, cases (Arabic \text), aligned (multi-line), \iint,
// partial derivatives, limits, \Re \Im \arg \overline, \mathbb, units, \rightleftharpoons) driven through the REAL platform: import / export
// round trip, finalization, save → load → governance → publish → assignment, sanitized delivery (rich content byte-identical), autosave /
// restore, submit, hand-derived marks ledger, teacher review, and grading INVARIANCE (rich content never changes a score).
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("../certification-20g/platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE = path.join(repo, "docs/fixtures/scientific-math-21a/ExamBank_21A_Scientific_Math_Mini_Acceptance.json");
const load = () => JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const qs = e => e.sections.flatMap(s => s.questions);
const CANARY = "SCI21A-PRIVATE";
const STUDENTS = { "sm-perfect": "طالب مثالي", "sm-partial": "طالب جزئي", "sm-blank": "طالب لم يجب" };

/** Every math source of an exam (blocks + inline runs) from cover, sections and questions. */
function mathSources(e) {
  const out = [];
  const walk = rc => { for (const b of (rc && rc.blocks) || []) { if (b.type === "math") out.push(b.source); for (const r of b.runs || []) if (typeof r.math === "string") out.push(r.math); } };
  walk(e.coverPage && e.coverPage.instructionsRichContent);
  for (const s of e.sections) { walk(s.instructionsRichContent); for (const q of s.questions) walk(q.richContent); }
  return out;
}
const richOf = e => ({ cover: e.coverPage && e.coverPage.instructionsRichContent, sections: e.sections.map(s => s.instructionsRichContent), questions: qs(e).map(q => q.richContent) });
const withoutRich = e => { const x = JSON.parse(JSON.stringify(e)); delete x.coverPage.instructionsRichContent; for (const s of x.sections) { delete s.instructionsRichContent; for (const q of s.questions) delete q.richContent; } return x; };

// ── personas: answers and the hand-derived ledger ([auto, pending] per question) ───────────────────────────────────────────────────────
const PERFECT = { a1: A.choice(0), a2: A.numeric(13), a3: A.fields({ x: "3", y: "2" }), b1: A.numeric(10), b2: A.choice(0), b3: A.text("1"), b4: A.choice(0),
  c1: A.choice(0), c2: A.numeric(5), c3: A.fields({ arg: "45", set: "R" }), d1: A.choice(0), d2: A.numeric(3), d3: A.numeric(24), d4: A.text("أوم") };
// a1 wrong option · a3 y wrong (1 of 2 blanks) · b2 wrong · c2 wrong (7) · c3 set wrong (1 of 2) · d3 wrong exponent (23)
const PARTIAL = { ...PERFECT, a1: A.choice(1), a3: A.fields({ x: "3", y: "1" }), b2: A.choice(3), c2: A.numeric(7), c3: A.fields({ arg: "45", set: "Q" }), d3: A.numeric(23) };
const LEDGER = {
  PERFECT: { a1: [3, 0], a2: [3, 0], a3: [4, 0], b1: [3, 0], b2: [3, 0], b3: [2, 0], b4: [2, 0], c1: [3, 0], c2: [3, 0], c3: [4, 0], d1: [2, 0], d2: [3, 0], d3: [3, 0], d4: [2, 0] },
  PARTIAL: { a1: [0, 0], a2: [3, 0], a3: [2, 0], b1: [3, 0], b2: [0, 0], b3: [2, 0], b4: [2, 0], c1: [3, 0], c2: [0, 0], c3: [2, 0], d1: [2, 0], d2: [3, 0], d3: [0, 0], d4: [2, 0] }
};
const TOTAL = { PERFECT: 40, PARTIAL: 24 };

describe("21A-MINI authoring: the fixture is a real, finalizable exam that exercises Scientific Math v2", () => {
  it("schemaVersion 2, sections A–D (10 marks each, 40 total), only proven families, every question has a text fallback AND rich content", () => {
    const e = load();
    expect([e.schemaVersion, e.examId, e.sections.map(s => s.id)]).toEqual([2, "EXAMBANK-21A-SCI-MATH-MINI", ["sec-a", "sec-b", "sec-c", "sec-d"]]);
    const s = examOfficialStats(e);
    expect([s.totalMarks, ...s.sections.map(x => x.totalMarks)]).toEqual([40, 10, 10, 10, 10]);
    expect([...new Set(qs(e).map(q => q.presentationType))].sort()).toEqual(["fillBlank", "multipleChoice", "numericResponse", "shortAnswer"]);
    for (const q of qs(e)) {
      expect(q.text.trim().length, q.examQuestionId).toBeGreaterThan(0);
      expect(validateRichContent(q.richContent).ok, q.examQuestionId).toBe(true);
    }
    expect(evaluateExamFinalization(e).blockers.map(b => b.message)).toEqual([]);
  });
  it("every math source parses; the exam covers grids (pmatrix / vmatrix / cases / aligned), multi-line sources, number sets, \\iint, complex parts, chemistry and units", () => {
    const src = mathSources(load());
    expect(src.length).toBeGreaterThanOrEqual(30);
    for (const s of src) expect(parseMath(s).ok, s).toBe(true);
    const all = src.join("\n");
    for (const env of ["pmatrix", "vmatrix", "cases", "aligned"]) expect(all, env).toContain("\\begin{" + env + "}");
    expect(MATH_ENVIRONMENTS).toEqual(expect.arrayContaining(["pmatrix", "vmatrix", "cases", "aligned"]));
    for (const c of ["\\mathbb{R}", "\\mathbb{C}", "\\iint", "\\partial", "\\lim", "\\Re", "\\Im", "\\arg", "\\overline", "\\rightleftharpoons", "\\mathrm{mol}", "\\Omega", "\\vec", "\\angle", "\\text{إذا كان }"]) expect(all, c).toContain(c);
    expect(src.some(s => s.includes("\n"))).toBe(true);
  });
  it("import / export is EXACT: import → canonical save → export → import keeps every rich document (cover, sections, questions) byte-for-byte", () => {
    const e = load();
    const imp = parseStructuredExamJson(JSON.stringify(e), "ExamBank_21A_Scientific_Math_Mini_Acceptance.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(i => i.severity === "error")]).toEqual([true, [], []]);
    expect(qs(imp.exam)).toEqual(qs(e));
    const saved = toSavedStructuredExam(imp.exam);
    expect(richOf(saved)).toEqual(richOf(e));
    const again = parseStructuredExamJson(JSON.stringify(saved), "re-export.json");
    expect(richOf(again.exam)).toEqual(richOf(e));
    expect(mathSources(again.exam)).toEqual(mathSources(e));
    expect(qs(canonicalizeExamContent(e)).map(q => q.richContent)).toEqual(qs(e).map(q => q.richContent));
  });
  it("NO GRADING CHANGE: the same answers grade identically with and without the rich content (math is presentation only)", () => {
    const e = load(), bare = withoutRich(e);
    for (const answers of [PERFECT, PARTIAL, {}]) expect(gradeExam(e, answers)).toEqual(gradeExam(bare, answers));
    expect(gradeExam(e, PERFECT).score).toBe(40);
  });
  it("the student projection keeps every rich document exactly and leaks no key, note or canary", () => {
    const e = load();
    const p = sanitizeExamForStudent(e, { parametric: { assignmentId: "sweep", studentId: "s", attemptNumber: 1 } });
    expect(richOf(p)).toEqual(richOf(e));
    expect(scanProjection(p, { secrets: [CANARY] })).toEqual([]);
  });
});

describe("21A-MINI full platform lifecycle", () => {
  let p, aid, published;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    published = await publishAndAssign(p, load());
    aid = published.aid;
    runs.PERFECT = await takeExam(p, aid, "sm-perfect", PERFECT, { chunks: 3 });
    runs.PARTIAL = await takeExam(p, aid, "sm-partial", PARTIAL);
  }, 120000);

  it("save → load → publish → assignment keep every rich document byte-for-byte (working copy and immutable snapshot)", () => {
    const e = load();
    expect(richOf(published.loaded)).toEqual(richOf(e));
    expect(richOf(p.assignmentOf(aid).examSnapshot)).toEqual(richOf(e));
  });
  it("delivery: the student receives every formula exactly (pre-start hides the body), and nothing private", () => {
    const e = load();
    for (const [name, r] of Object.entries(runs)) {
      expect(r.preStart.status, name).toBe(200);
      expect(JSON.stringify(r.preStart.jsonBody), name).not.toContain("\\begin{pmatrix}");
      const delivered = r.delivery.jsonBody.assignment.exam;
      expect(qs(delivered).map(q => q.richContent), name).toEqual(qs(e).map(q => q.richContent));
      expect(delivered.sections.map(s => s.instructionsRichContent), name).toEqual(e.sections.map(s => s.instructionsRichContent));
      expect(mathSources(delivered), name).toEqual(mathSources(e));                                                    // cover + sections + questions
      expect(scanProjection(r.delivery.jsonBody, { secrets: [CANARY, "correctOptionIndex"] }), name).toEqual([]);
    }
  });
  it("autosave / restore is exact; submit is idempotent; ledgers = hand-derived; attempt invariants hold", () => {
    for (const [name, r] of Object.entries(runs)) {
      for (const x of r.restores) expect(x.restored, name).toEqual(x.expected.answers);
      expect([r.submit.status, r.duplicateSubmit.status], name).toEqual([200, 409]);
      expect(ledgerOf(r.attempt).questions, name).toEqual(LEDGER[name]);
      expect([r.attempt.score, r.attempt.totalMarks, r.attempt.finalized], name).toEqual([TOTAL[name], 40, true]);
      expect(attemptInvariants(r.attempt, 40), name).toEqual([]);
    }
  });
  it("a blank submission: auto-graded families score 0, while blank shortAnswer / fillBlank go to TEACHER REVIEW (never a manufactured zero)", async () => {
    const s = p.student("sm-blank");
    await s.start(aid);
    const sub = await s.submit(aid, {});
    expect(sub.status).toBe(200);
    // hand-derived: a3 (4) + c3 (4) fillBlank and b3 (2) + d4 (2) shortAnswer pending = 12; everything else [0, 0]
    const expected = Object.fromEntries(Object.keys(LEDGER.PERFECT).map(id => [id, [0, 0]]));
    Object.assign(expected, { a3: [0, 4], c3: [0, 4], b3: [0, 2], d4: [0, 2] });
    expect(ledgerOf(s.attempt(aid)).questions).toEqual(expected);
    expect([s.attempt(aid).score, s.attempt(aid).manualReviewMarks, s.attempt(aid).finalized]).toEqual([0, 12, false]);
    expect(attemptInvariants(s.attempt(aid), 40)).toEqual([]);
  });
  it("teacher review: every question is listed with its stored auto grade; the review keeps the plain-text fallback (recorded limitation)", async () => {
    const rv = await p.teacher.reviewGet(aid, "sm-partial");
    expect(rv.status).toBe(200);
    const byId = Object.fromEntries(rv.jsonBody.questions.map(q => [q.questionId, q]));
    for (const [id, [auto]] of Object.entries(LEDGER.PARTIAL)) expect(byId[id].autoGrade.score, id).toBe(auto);
    expect(byId.a1.text).toBe(load().sections[0].questions[0].text);
    expect("richContent" in byId.a1).toBe(false);                          // PIN: the review view shows `text` (20D.1 behaviour, unchanged in 21A)
    const saved = await p.teacher.saveReview(aid, "sm-partial", {}, 1, "مراجعة الترميز العلمي");
    expect([saved.status, saved.jsonBody.result.score, saved.jsonBody.result.finalized]).toEqual([200, 24, true]);
  });
});
