import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { validateRichContent, RICH_BLOCK_TYPES } from "../../../src/richContent/richContentModel";
import { catalogForPrompt } from "../../../src/aiComposer/composerCatalog";
import { answered } from "../../../src/answerState";
import { chartTargets } from "../../../src/charts/chartData";

// Phase 21A.2 — COMPATIBILITY FREEZE (captured on the untouched baseline 6e4a5ef with CAPTURE_21A2=1, before any 21A.2 change). Function
// graphs are ADDITIVE: for every committed exam fixture (the 21A.1 chart acceptance exam included), every rich-content document, the import →
// export → canonical save round trip, finalization, the student projection and grading (blank + a deterministic synthetic answer set, chart
// selections included) must stay byte-for-byte what the baseline produced; the pre-21A.2 rich block vocabulary is still accepted with the
// same meaning; and the AI catalog prompt may change ONLY by the declared delta (catalog version token, the rich-block list gaining function
// graph support, new function-graph lines) — every other baseline line is unchanged.
const require_ = createRequire(import.meta.url);
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PINS = path.join(path.dirname(fileURLToPath(import.meta.url)), "freeze-21a2-pins.json");
const CAPTURE = process.env.CAPTURE_21A2 === "1";
const sha = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const dirs = fs.readdirSync(path.join(repo, "docs/fixtures")).filter(d => d !== "function-graphs-21a2" && d !== "function-surfaces-21b" && d !== "interactive-3d-21c" && d !== "physics-motion-21da1" && d !== "physics-lab-21da2" && d !== "function-surfaces-21da4" && d !== "mesh-models-21db3").sort();   // later phases' fixtures have no capture on this baseline
// The ONE declared fixture delta of 21A.2: the AI composer fixtures record the catalog of their last composer operation; a regenerated token
// is mapped back to its baseline value so every other byte of every fixture is still judged against the pins captured on 6e4a5ef.
const BASELINE_TOKEN = text => text.replace(/"AI_COMPOSER_CATALOG_V\d+"/g, '"AI_COMPOSER_CATALOG_V3"');
const fixtures = dirs.flatMap(d => fs.readdirSync(path.join(repo, "docs/fixtures", d)).filter(f => f.endsWith(".json")).sort().map(f => [d + "/" + f, JSON.parse(BASELINE_TOKEN(fs.readFileSync(path.join(repo, "docs/fixtures", d, f), "utf8")))]));
const qs = e => (e.sections || []).flatMap(s => s.questions || []);
const BASELINE_BLOCK_TYPES = ["heading", "paragraph", "unorderedList", "orderedList", "table", "image", "figure", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "columns", "math", "dataChart"];

/** Every RichContentV1-looking document anywhere in a value (cover, sections, questions, scenario / composite sources, parts). */
function richDocs(v, out = [], at = "$") {
  if (Array.isArray(v)) v.forEach((x, i) => richDocs(x, out, at + "[" + i + "]"));
  else if (v && typeof v === "object") {
    if (v.schemaVersion === 1 && Array.isArray(v.blocks)) out.push([at, v]);
    for (const k of Object.keys(v)) richDocs(v[k], out, at + "." + k);
  }
  return out;
}
/** A deterministic synthetic answer in a VALID answer shape (src/answerState.ts), keyed on the presentation type: questions cycle (by position)
 *  through a correct, a half-correct and a wrong answer, so the grading pins cover full, partial and zero scores — not only blank grading.
 *  Types answered by an interaction log or a program (smartSim, networkCli, coding, codeTemplate, hotspot) stay unanswered. */
function syntheticAnswer(q, n) {
  const pt = q.presentationType || q.type, a = q.answer || {}, mode = n % 3;   // 0 correct · 1 half correct · 2 wrong
  const fieldsOf = pairs => ({ kind: "fields", values: Object.fromEntries(pairs.map(([id, good], i) => [id, mode === 0 || (mode === 1 && i % 2 === 0) ? good : typeof good === "boolean" ? !good : "1"])) });
  switch (pt) {
    case "multipleChoice": case "trueFalse": {
      const count = Array.isArray(q.options) && q.options.length ? q.options.length : 2;
      const good = Number.isInteger(a.correctOptionIndex) ? a.correctOptionIndex : a.correct === false ? 1 : 0;
      return { kind: "choice", index: mode === 0 ? good : (good + 1) % count };
    }
    case "multipleSelect": {
      const ids = (q.options || []).map(o => o.id), good = a.correctOptionIds || [], bad = ids.filter(id => !good.includes(id));
      return { kind: "multiChoice", optionIds: mode === 0 ? good : mode === 1 ? good.slice(0, 1).concat(bad.slice(0, 1)) : bad };
    }
    case "numericResponse": return { kind: "numeric", value: mode === 0 && a.expected !== undefined ? String(a.expected) : "-987654" };
    case "parametricNumeric": return { kind: "numeric", value: "1" };
    case "shortAnswer": return { kind: "text", value: mode === 0 && typeof a.text === "string" ? a.text : "1" };
    case "openResponse": return { kind: "text", value: "synthetic response " + n };
    case "ordering": return { kind: "sequence", values: mode === 0 ? [...(a.values || [])] : [...(a.values || [])].reverse() };
    case "multiTrueFalse": case "matching": case "fillBlank": case "wordBank": case "cliFill": case "tableFill": return fieldsOf((q.fields || []).map(f => [f.id, f.correct]));
    case "matrix": return fieldsOf(Object.entries(a.correctColumnByRow || {}));
    case "categorization": return fieldsOf(Object.entries(a.correctCategoryByItem || {}));
    case "labelDiagram": return fieldsOf(Object.entries(a.correctLabelByZone || {}));
    case "inlineCloze": return fieldsOf(Object.entries(a.blanks || {}).map(([id, b]) => [id, b.correctOptionId ?? (b.accepted || [])[0]]));
    case "chartSelection": {
      const cs = q.chartSelection || {}, good = Array.isArray(a.correct) ? a.correct : [];
      if (!cs.chart || !cs.target) return undefined;
      const others = chartTargets(cs.chart, cs.target).map(t => t.key).filter(k => !good.includes(k));
      return { kind: "chartSelection", chartId: cs.chart.id, targets: mode === 0 ? [...good] : mode === 1 ? good.slice(0, 1) : others.slice(0, 1) };
    }
    case "compound": return { kind: "compound", parts: Object.fromEntries((q.parts || []).map((p, i) => [p.id, syntheticAnswer(p, n + i)]).filter(([, v]) => v)) };
    case "composite": return { kind: "composite", parts: Object.fromEntries(((q.composite && q.composite.groups) || []).flatMap(g => g.parts || []).map((p, i) => [p.id, syntheticAnswer(p, n + i)]).filter(([, v]) => v)), contexts: {} };
    default: return undefined;
  }
}
function syntheticAnswers(exam) {
  const out = {};
  qs(exam).forEach((q, n) => { const id = q.examQuestionId || q.id; const ans = id ? syntheticAnswer(q, n) : undefined; if (ans) out[id] = ans; });
  return out;
}
function snapshot(name, exam) {
  const docs = richDocs(exam).map(([at, d]) => { const r = validateRichContent(d); return [at, r.ok ? sha(r.value) : r.issues.map(i => i.code + "@" + i.path)]; });
  const imp = parseStructuredExamJson(JSON.stringify(exam), name);
  const saved = imp.exam ? toSavedStructuredExam(imp.exam) : null;
  const fin = evaluateExamFinalization(JSON.parse(JSON.stringify(exam)));
  const ctx = { parametric: { assignmentId: "freeze-21a2", studentId: "s", attemptNumber: 1 } };
  const synthetic = gradeExam(JSON.parse(JSON.stringify(exam)), syntheticAnswers(exam), ctx);
  return {
    rich: sha(docs),
    richCount: docs.length,
    importErrors: imp.parseErrors,
    saved: saved ? sha({ questions: qs(saved), sections: saved.sections.map(s => [s.id, s.gradingPolicy, s.maxMarks ?? null, s.requiredAnswers ?? null, s.scenarios ?? null, s.instructionsRichContent ?? null]), cover: saved.coverPage ?? null }) : null,
    canonical: sha(canonicalizeExamContent(JSON.parse(JSON.stringify(exam)))),
    finalization: sha({ can: fin.canFinalize, blockers: fin.blockers.map(b => b.id), warnings: (fin.warnings || []).map(w => w.id) }),
    student: sha(sanitizeExamForStudent(JSON.parse(JSON.stringify(exam)), ctx)),
    gradeBlank: sha(gradeExam(JSON.parse(JSON.stringify(exam)), {}, ctx)),
    gradeSynthetic: sha(synthetic),
    syntheticScore: [synthetic.score, synthetic.totalMarks, synthetic.manualReviewMarks]
  };
}
const promptLines = () => catalogForPrompt().split("\n");

describe("21A.2-FREEZE compatibility pins (captured on the untouched baseline 6e4a5ef)", () => {
  const pins = CAPTURE ? { fixtures: {}, prompt: [] } : JSON.parse(fs.readFileSync(PINS, "utf8"));
  it("the corpus is every committed exam fixture (at least 28: the 21A.1 chart exam included)", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(28);
    if (!CAPTURE) expect(fixtures.map(f => f[0])).toEqual(Object.keys(pins.fixtures));
  });
  it("the synthetic answer set is made of VALID answers and exercises grading: full, partial and zero scores across the corpus", () => {
    const ctx = { parametric: { assignmentId: "freeze-21a2", studentId: "s", attemptNumber: 1 } };
    let answers = 0, full = 0, partial = 0, zero = 0, differs = 0;
    for (const [name, exam] of fixtures) {
      const syn = syntheticAnswers(exam);
      for (const [id, ans] of Object.entries(syn)) { answers++; expect(answered(ans), name + " " + id + " " + JSON.stringify(ans).slice(0, 80)).toBe(true); }
      const graded = gradeExam(JSON.parse(JSON.stringify(exam)), syn, ctx);
      if (sha(graded) !== sha(gradeExam(JSON.parse(JSON.stringify(exam)), {}, ctx))) differs++;
      for (const g of graded.questions) { if (g.manualReview) continue; if (g.score === g.maxMarks && g.maxMarks > 0) full++; else if (g.score > 0) partial++; else zero++; }
    }
    expect(answers).toBeGreaterThanOrEqual(100);
    // most baseline fixtures grade differently from blank; the others are answered only by simulations (left unanswered here), parametric
    // values the synthetic "1" misses, wrong answers or open responses — each graded like blank
    expect(differs).toBeGreaterThanOrEqual(20);
    expect(Math.min(full, partial, zero), JSON.stringify({ answers, full, partial, zero })).toBeGreaterThanOrEqual(5);
  });
  for (const [name, exam] of fixtures) {
    it(name + ": rich content, import / export / canonical save, finalization, student projection and grading are byte-for-byte the baseline", () => {
      const got = snapshot(name, exam);
      if (CAPTURE) { pins.fixtures[name] = got; return; }
      expect(got).toEqual(pins.fixtures[name]);
    });
  }
  it("every pre-21A.2 rich block kind is still a valid block kind with its meaning (the vocabulary is only extended)", () => {
    for (const t of BASELINE_BLOCK_TYPES) expect(RICH_BLOCK_TYPES, t).toContain(t);
    expect(RICH_BLOCK_TYPES.slice(0, BASELINE_BLOCK_TYPES.length)).toEqual(BASELINE_BLOCK_TYPES);
  });
  it("the AI catalog prompt changes only by the declared delta: version token, the rich-block list gaining function-graph support, new graph lines", () => {
    const now = promptLines();
    if (CAPTURE) { pins.prompt = now; return; }
    const base = pins.prompt;
    const norm = l => l.replace(/AI_COMPOSER_CATALOG_V\d+/g, "AI_COMPOSER_CATALOG_V*");
    for (const line of base) {
      if (line.startsWith("Rich blocks:")) { const nowLine = now.find(l => l.startsWith("Rich blocks:")); expect(nowLine.startsWith(line.replace(/\.$/, ""))).toBe(true); continue; }
      expect(now.map(norm), line.slice(0, 60)).toContain(norm(line));
    }
    const added = now.filter(l => !base.map(norm).includes(norm(l)) && !l.startsWith("Rich blocks:"));
    for (const l of added) expect(l, l.slice(0, 60)).toMatch(/^(Function graphs)\b/);
  });
  it("capture writes the pins (CAPTURE_21A2=1 only)", () => {
    if (CAPTURE) fs.writeFileSync(PINS, JSON.stringify(pins, null, 1) + "\n");
    expect(fs.existsSync(PINS)).toBe(true);
  });
});
