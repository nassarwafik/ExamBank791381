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
import { validateRichContent } from "../../../src/richContent/richContentModel";
import { validateChartSpec } from "../../../src/charts/chartSpec";
import { evaluateChartSelection, validateChartSelectionQuestion } from "../../../src/chartSelectionQuestion";

// Phase 21A.1 — the INTERACTIVE CHARTS MINI ACCEPTANCE EXAM (docs/fixtures/data-charts-21a1/…json, generated from the shared chart fixtures
// by scripts/generate-data-charts-21a1-fixture.mjs): the real structured-exam schema (schemaVersion 2, sections A–D, 40 marks) with ONE
// rainfall chart read by four questions through a scenario source (two of them chartSelection answers on the chart itself: multiple /
// partial and a contiguous range), a line chart with a missing value, a stacked area, a scatter point task, a histogram bin task, a composite
// whose shared source context is a bar + line combo with a chartSelection child, a horizontal stacked bar and a box plot — Arabic text mixed
// with numbers and units (mm, °C, GWh). Driven through the REAL platform: import / canonical save / export / re-import, finalization,
// save → load → governance → publish → assignment, sanitized delivery (charts byte-identical, no key), autosave / restore, the semantic
// chart answers, idempotent submit, hand-derived marks ledgers (PERFECT / PARTIAL / BLANK / ATTACKER), and teacher review.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("../certification-20g/platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE = path.join(repo, "docs/fixtures/data-charts-21a1/ExamBank_21A1_Interactive_Charts_Mini_Acceptance.json");
const load = () => JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const qs = e => e.sections.flatMap(s => s.questions);
const CANARY = "CHART21A1-PRIVATE";
const STUDENTS = { "ch-perfect": "طالب مثالي", "ch-partial": "طالب جزئي", "ch-blank": "طالب لم يجب", "ch-attacker": "طالب مهاجم" };

/** Every chart of an exam, keyed by where it lives: rich blocks (scenario sources, question stems, composite contexts) and the chart of
 *  every chartSelection config (standalone and composite child). */
function chartsOf(e) {
  const out = {};
  const blocks = (where, rc) => ((rc && rc.blocks) || []).forEach((b, i) => { if (b.type === "dataChart") out[where + "#" + i] = b.chart; });
  for (const s of e.sections) {
    for (const sc of s.scenarios || []) for (const src of sc.sources || []) blocks(s.id + "/" + sc.id + "/" + src.id, src.richContent);
    for (const q of s.questions) {
      blocks(q.examQuestionId, q.richContent);
      if (q.chartSelection) out[q.examQuestionId + ":selection"] = q.chartSelection.chart;
      for (const c of (q.composite && q.composite.contexts) || []) for (const src of c.sources || []) blocks(q.examQuestionId + "/" + c.id + "/" + src.id, src.richContent);
      for (const g of (q.composite && q.composite.groups) || []) for (const part of g.parts) if (part.chartSelection) out[q.examQuestionId + "." + part.id + ":selection"] = part.chartSelection.chart;
    }
  }
  return out;
}
/** The PUBLIC chartSelection configs (what the student must receive: the config without the key). */
function selectionConfigsOf(e) {
  const out = {};
  for (const q of qs(e)) {
    if (q.chartSelection) out[q.examQuestionId] = q.chartSelection;
    for (const g of (q.composite && q.composite.groups) || []) for (const part of g.parts) if (part.chartSelection) out[q.examQuestionId + "." + part.id] = part.chartSelection;
  }
  return out;
}
/** The exam without its chart STIMULI (rich dataChart blocks) — the chartSelection answer surfaces stay (they are the question). */
function withoutChartStimuli(e) {
  const x = JSON.parse(JSON.stringify(e));
  const strip = rc => { if (rc && Array.isArray(rc.blocks)) rc.blocks = rc.blocks.filter(b => b.type !== "dataChart"); };
  for (const s of x.sections) {
    for (const sc of s.scenarios || []) for (const src of sc.sources || []) strip(src.richContent);
    for (const q of s.questions) { strip(q.richContent); for (const c of (q.composite && q.composite.contexts) || []) for (const src of c.sources || []) strip(src.richContent); }
  }
  return x;
}

// ── personas: answers and the hand-derived ledger ([auto, pending] per question) ───────────────────────────────────────────────────────
const sel = (chartId, ...targets) => ({ kind: "chartSelection", chartId, targets });
const PERFECT = {
  a1: A.choice(0), a2: A.numeric(120), a3: sel("rainfall-2020", "jan", "oct"), a4: sel("rainfall-2020", "may", "jun", "jul", "aug", "sep"),
  b1: A.choice(0), b2: sel("temp-week", "tmax/tue"), b3: A.numeric(29),
  c1: sel("height-mass", "p2"), c2: sel("scores", "b2"),
  d1: A.composite({ p1: sel("sales-combo", "q4"), p2: A.numeric(120) }), d2: A.choice(0), d3: A.numeric(60)
};
// a1 wrong option · a3 only October of {January, October} (partial: 3 × 1/2 = 1.5) · a4 the run stops at August (all-or-nothing: 0) · b2 the
// Monday maximum · c2 the neighbouring bin · d1.p2 wrong number · d2 wrong option · d3 the other class's median (65)
const PARTIAL = { ...PERFECT, a1: A.choice(1), a3: sel("rainfall-2020", "oct"), a4: sel("rainfall-2020", "may", "jun", "jul", "aug"), b2: sel("temp-week", "tmax/mon"),
  c2: sel("scores", "b1"), d1: A.composite({ p1: sel("sales-combo", "q4"), p2: A.numeric(100) }), d2: A.choice(1), d3: A.numeric(65) };
const LEDGER = {
  PERFECT: { a1: [3, 0], a2: [3, 0], a3: [3, 0], a4: [3, 0], b1: [3, 0], b2: [4, 0], b3: [3, 0], c1: [4, 0], c2: [4, 0], d1: [6, 0], d2: [2, 0], d3: [2, 0] },
  PARTIAL: { a1: [0, 0], a2: [3, 0], a3: [1.5, 0], a4: [0, 0], b1: [3, 0], b2: [0, 0], b3: [3, 0], c1: [4, 0], c2: [0, 0], d1: [3, 0], d2: [0, 0], d3: [0, 0] }
};
const PARTS = { PERFECT: { d1: { p1: [3, 0], p2: [3, 0] } }, PARTIAL: { d1: { p1: [3, 0], p2: [0, 0] } } };
const TOTAL = { PERFECT: 40, PARTIAL: 17.5 };
// ATTACKER — every chart answer is forged: more targets than allowed, a broken range, another question's chart, a duplicate, a chart answer
// on a choice / numeric question and on a composite's numeric child, a self-graded answer (score / correct / coordinates) on a WRONG point, a
// chart answer for a question that does not exist; plus a self-scored choice. The ingest binder refuses every forged chart answer (nothing
// stored, nothing graded) and rebuilds the rest to their contracts: the attacker earns nothing it did not answer correctly (here: 0).
const ATTACKER = {
  a1: sel("rainfall-2020", "oct"),
  a2: sel("rainfall-2020", "jan"),
  a3: sel("rainfall-2020", "jan", "feb", "mar", "oct"),
  a4: sel("rainfall-2020", "may", "jul"),
  b2: sel("rainfall-2020", "tmax/tue"),
  c1: { kind: "chartSelection", chartId: "height-mass", targets: ["p1"], score: 4, correct: true, x: 155, y: 95, manualReview: false },
  c2: sel("scores", "b2", "b2"),
  d1: A.composite({ p1: sel("sales-combo", "q9"), p2: sel("sales-combo", "q2") }),
  d2: { kind: "choice", index: 1, score: 2, correct: true },
  zz: sel("rainfall-2020", "oct")
};
const ATTACKER_REFUSED = [
  ["a1", "CHART_SELECTION_QUESTION_MISMATCH"], ["a2", "CHART_SELECTION_QUESTION_MISMATCH"], ["a3", "CHART_SELECTION_TOO_MANY"], ["a4", "CHART_SELECTION_RANGE_INVALID"],
  ["b2", "CHART_SELECTION_CHART_MISMATCH"], ["c2", "CHART_SELECTION_DUPLICATE"], ["d1.p1", "CHART_SELECTION_TARGET_UNKNOWN"], ["d1.p2", "CHART_SELECTION_QUESTION_MISMATCH"],
  ["zz", "CHART_SELECTION_QUESTION_MISMATCH"]
];
const ATTACKER_STORED = { c1: sel("height-mass", "p1"), d1: A.composite({}, {}), d2: A.choice(1) };

describe("21A1-MINI authoring: the fixture is a real, finalizable exam that exercises the chart platform", () => {
  it("schemaVersion 2, sections A–D (40 marks), four chart answer surfaces + one composite child, every chart valid under the ONE chart authority", () => {
    const e = load();
    expect([e.schemaVersion, e.examId, e.sections.map(s => s.id)]).toEqual([2, "EXAMBANK-21A1-CHARTS-MINI", ["sec-a", "sec-b", "sec-c", "sec-d"]]);
    const s = examOfficialStats(e);
    expect([s.totalMarks, ...s.sections.map(x => x.totalMarks)]).toEqual([40, 12, 10, 8, 10]);
    expect([...new Set(qs(e).map(q => q.presentationType))].sort()).toEqual(["chartSelection", "composite", "multipleChoice", "numericResponse"]);
    const charts = chartsOf(e);
    expect(Object.keys(charts).length).toBe(12);
    for (const [where, c] of Object.entries(charts)) expect(validateChartSpec(c).issues, where).toEqual([]);
    expect([...new Set(Object.values(charts).map(c => c.kind + (c.stacked ? "+stacked" : "") + (c.orientation === "horizontal" ? "+horizontal" : "")))].sort())
      .toEqual(["area+stacked", "bar", "bar+stacked+horizontal", "boxplot", "combo", "histogram", "line", "scatter"]);
    for (const q of qs(e)) {
      expect(q.text.trim().length, q.examQuestionId).toBeGreaterThan(0);
      if (q.richContent) expect(validateRichContent(q.richContent).ok, q.examQuestionId).toBe(true);
      if (q.presentationType === "chartSelection") expect(validateChartSelectionQuestion(q), q.examQuestionId).toEqual([]);
    }
    expect(evaluateExamFinalization(e).blockers.map(b => b.message)).toEqual([]);
  });
  it("one chart read by several questions: the rainfall scenario source serves a1–a4 (the two selection questions use the SAME chart identity)", () => {
    const e = load();
    const sc = e.sections[0].scenarios[0];
    expect(sc.questionIds).toEqual(["a1", "a2", "a3", "a4"]);
    const stimulus = sc.sources[0].richContent.blocks.find(b => b.type === "dataChart").chart;
    expect(e.sections[0].questions.filter(q => q.chartSelection).map(q => q.chartSelection.chart)).toEqual([stimulus, stimulus]);
    expect(stimulus.series[0].values).toEqual([120, 95, 82, 40, 12.5, 0, 0, 3, 18, 135, 88, 60]);    // real zeros, not missing values
    const line = qs(e).find(q => q.examQuestionId === "b1").richContent.blocks[1].chart;
    expect(line.series[0].values[2]).toBeNull();                                                      // a MISSING value stays missing
  });
  it("import / export is EXACT: import → canonical save → export → import keeps every chart and every chartSelection config byte-for-byte", () => {
    const e = load();
    const imp = parseStructuredExamJson(JSON.stringify(e), "ExamBank_21A1_Interactive_Charts_Mini_Acceptance.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(i => i.severity === "error")]).toEqual([true, [], []]);
    expect(qs(imp.exam)).toEqual(qs(e));
    expect(chartsOf(imp.exam)).toEqual(chartsOf(e));
    const saved = toSavedStructuredExam(imp.exam);
    expect(chartsOf(saved)).toEqual(chartsOf(e));
    expect(selectionConfigsOf(saved)).toEqual(selectionConfigsOf(e));
    const again = parseStructuredExamJson(JSON.stringify(saved), "re-export.json");
    expect(chartsOf(again.exam)).toEqual(chartsOf(e));
    expect(qs(again.exam).map(q => q.answer)).toEqual(qs(e).map(q => q.answer));
    expect(chartsOf(canonicalizeExamContent(e))).toEqual(chartsOf(e));
  });
  it("NO GRADING CHANGE from a chart stimulus: the same answers grade identically with and without the chart blocks (data is presentation for stimuli)", () => {
    const e = load(), bare = withoutChartStimuli(e);
    expect(Object.keys(chartsOf(bare))).toEqual(["a3:selection", "a4:selection", "b2:selection", "c1:selection", "c2:selection", "d1.p1:selection"]);
    for (const answers of [PERFECT, PARTIAL, {}]) expect(gradeExam(e, answers)).toEqual(gradeExam(bare, answers));
    expect(gradeExam(e, PERFECT).score).toBe(40);
  });
  it("the student projection keeps every chart and every public selection config exactly, and leaks no key, note or canary", () => {
    const e = load();
    const p = sanitizeExamForStudent(e, { parametric: { assignmentId: "sweep", studentId: "s", attemptNumber: 1 } });
    expect(chartsOf(p)).toEqual(chartsOf(e));
    expect(selectionConfigsOf(p)).toEqual(selectionConfigsOf(e));
    expect(scanProjection(p, { secrets: [CANARY, "correctOptionIndex", "allOrNothing", "\"partial\""] })).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/"correct"|"scoring"|tmax\/tue"\]|"q4"\]/);
  });
});

describe("21A1-MINI full platform lifecycle", () => {
  let p, aid, published;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    published = await publishAndAssign(p, load());
    aid = published.aid;
    runs.PERFECT = await takeExam(p, aid, "ch-perfect", PERFECT, { chunks: 3 });
    runs.PARTIAL = await takeExam(p, aid, "ch-partial", PARTIAL);
  }, 120000);

  it("save → load → governance → publish → assignment keep every chart byte-for-byte (working copy and immutable snapshot)", () => {
    const e = load();
    expect(published.pub.ok).toBe(true);
    expect(chartsOf(published.loaded)).toEqual(chartsOf(e));
    expect(chartsOf(p.assignmentOf(aid).examSnapshot)).toEqual(chartsOf(e));
    expect(qs(p.assignmentOf(aid).examSnapshot).map(q => q.answer)).toEqual(qs(e).map(q => q.answer));
  });
  it("delivery: the student receives every chart and selection surface exactly (pre-start hides the body), and nothing private", () => {
    const e = load();
    for (const [name, r] of Object.entries(runs)) {
      expect(r.preStart.status, name).toBe(200);
      expect(JSON.stringify(r.preStart.jsonBody), name).not.toContain("rainfall-2020");
      const delivered = r.delivery.jsonBody.assignment.exam;
      expect(chartsOf(delivered), name).toEqual(chartsOf(e));
      expect(selectionConfigsOf(delivered), name).toEqual(selectionConfigsOf(e));
      expect(scanProjection(r.delivery.jsonBody, { secrets: [CANARY, "correctOptionIndex", "allOrNothing"] }), name).toEqual([]);
      expect(JSON.stringify(r.delivery.jsonBody), name).not.toMatch(/"correct"|"scoring"/);
    }
  });
  it("autosave / restore of the semantic chart answers is exact; submit is idempotent; ledgers = hand-derived; attempt invariants hold", () => {
    for (const [name, r] of Object.entries(runs)) {
      for (const x of r.restores) expect(x.restored, name).toEqual(x.expected.answers);
      expect(r.restores.at(-1).restored.a3, name).toEqual(r.answers.a3);                              // stored exactly as the chart emitted it
      expect([r.submit.status, r.duplicateSubmit.status], name).toEqual([200, 409]);
      const L = ledgerOf(r.attempt);
      expect(L.questions, name).toEqual(LEDGER[name]);
      expect(L.parts, name).toEqual(PARTS[name]);
      expect([r.attempt.score, r.attempt.totalMarks, r.attempt.finalized], name).toEqual([TOTAL[name], 40, true]);
      expect(attemptInvariants(r.attempt, 40), name).toEqual([]);
    }
  });
  it("a blank submission scores 0 and is final: an unanswered chart question is an ordinary unanswered question (never a review, never a forged zero)", async () => {
    const s = p.student("ch-blank");
    await s.start(aid);
    const sub = await s.submit(aid, {});
    expect(sub.status).toBe(200);
    expect(ledgerOf(s.attempt(aid)).questions).toEqual(Object.fromEntries(Object.keys(LEDGER.PERFECT).map(id => [id, [0, 0]])));
    expect([s.attempt(aid).score, s.attempt(aid).manualReviewMarks, s.attempt(aid).finalized]).toEqual([0, 0, true]);
    expect(attemptInvariants(s.attempt(aid), 40)).toEqual([]);
  });
  it("ATTACKER: every forged chart answer is refused at ingest with its classified code, nothing forged is stored or graded, the delivery leaks nothing", async () => {
    const snapshot = p.assignmentOf(aid).examSnapshot;
    const n = normalizeDraftAnswers(ATTACKER, snapshot);
    expect(n.rejected.map(r => [r.id, r.code]).sort()).toEqual([...ATTACKER_REFUSED].sort());
    expect(n.answers).toEqual(ATTACKER_STORED);
    const s = p.student("ch-attacker");
    expect((await s.start(aid)).status).toBe(200);
    const d = await s.deliver(aid);
    expect(scanProjection(d.jsonBody, { secrets: [CANARY, "correctOptionIndex"] })).toEqual([]);
    expect((await s.draft(aid, ATTACKER)).status).toBe(200);
    expect((await s.state(aid)).jsonBody.state.draftAnswers).toEqual(ATTACKER_STORED);
    expect((await s.submit(aid, ATTACKER)).status).toBe(200);
    const att = s.attempt(aid);
    expect(att.answers).toEqual(ATTACKER_STORED);
    expect(ledgerOf(att).questions).toEqual(Object.fromEntries(Object.keys(LEDGER.PERFECT).map(id => [id, [0, 0]])));
    expect([att.score, att.manualReviewMarks, att.finalized]).toEqual([0, 0, true]);
    expect(attemptInvariants(att, 40)).toEqual([]);
    expect(JSON.stringify(att)).not.toMatch(/"x":155|"score":4,"correct":true/);
  });
  it("teacher review: the chart question carries its config, the key and the stored semantic answer; the review evaluation marks ✓ / ✗ / missed", async () => {
    const rv = await p.teacher.reviewGet(aid, "ch-partial");
    expect(rv.status).toBe(200);
    const byId = Object.fromEntries(rv.jsonBody.questions.map(q => [q.questionId, q]));
    for (const [id, [auto]] of Object.entries(LEDGER.PARTIAL)) expect(byId[id].autoGrade.score, id).toBe(auto);
    const a3 = byId.a3, e = load();
    expect([a3.type, a3.chartSelection, a3.expectedAnswer, a3.studentAnswer]).toEqual(["chartSelection", e.sections[0].questions[2].chartSelection, { scoring: "partial", correct: ["jan", "oct"] }, sel("rainfall-2020", "oct")]);
    const ev = evaluateChartSelection(a3.chartSelection, a3.expectedAnswer, a3.studentAnswer);
    expect(ev.ok && [ev.correct, ev.total, ev.exact, ev.results.filter(x => x.mark).map(x => [x.key, x.mark])]).toEqual([1, 2, false, [["jan", "missed"], ["oct", "correct"]]]);
    expect(byId.d1.composite.groups[0].parts[0].chartSelection.chart.id).toBe("sales-combo");
    const saved = await p.teacher.saveReview(aid, "ch-partial", {}, 1, "مراجعة أسئلة الرسوم البيانية");
    expect([saved.status, saved.jsonBody.result.score, saved.jsonBody.result.finalized]).toEqual([200, 17.5, true]);
  });
});
