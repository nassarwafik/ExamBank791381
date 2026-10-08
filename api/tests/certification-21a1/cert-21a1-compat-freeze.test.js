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

// Phase 21A.1 — COMPATIBILITY FREEZE (captured on the untouched baseline ff13899 with CAPTURE_21A1=1, before any 21A.1 change). Charts are
// ADDITIVE: for every committed exam fixture, every rich-content document, the import → export → canonical save round trip, finalization,
// the student projection and grading (blank + a deterministic synthetic answer set) must stay byte-for-byte what the baseline produced; the
// pre-21A.1 rich block vocabulary is still accepted with the same meaning; and the AI catalog prompt may change ONLY by the declared delta
// (catalog version token, the rich-block list gaining chart support, new chart lines) — every other baseline line is unchanged.
const require_ = createRequire(import.meta.url);
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PINS = path.join(path.dirname(fileURLToPath(import.meta.url)), "freeze-21a1-pins.json");
const CAPTURE = process.env.CAPTURE_21A1 === "1";
const sha = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const dirs = fs.readdirSync(path.join(repo, "docs/fixtures")).filter(d => d !== "data-charts-21a1").sort();
// The ONE declared fixture delta of 21A.1: the AI composer fixtures record the catalog of their last composer operation, regenerated from
// AI_COMPOSER_CATALOG_V2 to _V3 (WRITE_20F_FIXTURES=1; nothing else in them changed). The token is mapped back to its baseline value so every
// other byte of every fixture is still judged against the pins captured on ff13899.
const BASELINE_TOKEN = text => text.replace(/"AI_COMPOSER_CATALOG_V3"/g, '"AI_COMPOSER_CATALOG_V2"');
const fixtures = dirs.flatMap(d => fs.readdirSync(path.join(repo, "docs/fixtures", d)).filter(f => f.endsWith(".json")).sort().map(f => [d + "/" + f, JSON.parse(BASELINE_TOKEN(fs.readFileSync(path.join(repo, "docs/fixtures", d, f), "utf8")))]));
const qs = e => (e.sections || []).flatMap(s => s.questions || []);
const BASELINE_BLOCK_TYPES = ["heading", "paragraph", "unorderedList", "orderedList", "table", "image", "figure", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "columns", "math"];

/** Every RichContentV1-looking document anywhere in a value (cover, sections, questions, scenario / composite sources, parts). */
function richDocs(v, out = [], at = "$") {
  if (Array.isArray(v)) v.forEach((x, i) => richDocs(x, out, at + "[" + i + "]"));
  else if (v && typeof v === "object") {
    if (v.schemaVersion === 1 && Array.isArray(v.blocks)) out.push([at, v]);
    for (const k of Object.keys(v)) richDocs(v[k], out, at + "." + k);
  }
  return out;
}
/** A deterministic synthetic answer set: the first option for choice-like questions, a fixed text / numeric otherwise. */
function syntheticAnswers(exam) {
  const out = {};
  for (const q of qs(exam)) {
    const id = q.examQuestionId || q.id;
    if (!id) continue;
    if (Array.isArray(q.options) && q.options.length) out[id] = { kind: "choice", optionIndex: 0 };
    else if (q.type === "trueFalse" || q.presentationType === "trueFalse") out[id] = { kind: "choice", optionIndex: 0 };
    else if (q.type === "numericResponse" || q.type === "parametricNumeric") out[id] = { kind: "numeric", value: "1" };
    else out[id] = { kind: "text", text: "1" };
  }
  return out;
}
function snapshot(name, exam) {
  const docs = richDocs(exam).map(([at, d]) => { const r = validateRichContent(d); return [at, r.ok ? sha(r.value) : r.issues.map(i => i.code + "@" + i.path)]; });
  const imp = parseStructuredExamJson(JSON.stringify(exam), name);
  const saved = imp.exam ? toSavedStructuredExam(imp.exam) : null;
  const fin = evaluateExamFinalization(JSON.parse(JSON.stringify(exam)));
  const ctx = { parametric: { assignmentId: "freeze-21a1", studentId: "s", attemptNumber: 1 } };
  return {
    rich: sha(docs),
    richCount: docs.length,
    importErrors: imp.parseErrors,
    saved: saved ? sha({ questions: qs(saved), sections: saved.sections.map(s => [s.id, s.gradingPolicy, s.maxMarks ?? null, s.requiredAnswers ?? null, s.scenarios ?? null, s.instructionsRichContent ?? null]), cover: saved.coverPage ?? null }) : null,
    canonical: sha(canonicalizeExamContent(JSON.parse(JSON.stringify(exam)))),
    finalization: sha({ can: fin.canFinalize, blockers: fin.blockers.map(b => b.id), warnings: (fin.warnings || []).map(w => w.id) }),
    student: sha(sanitizeExamForStudent(JSON.parse(JSON.stringify(exam)), ctx)),
    gradeBlank: sha(gradeExam(JSON.parse(JSON.stringify(exam)), {}, ctx)),
    gradeSynthetic: sha(gradeExam(JSON.parse(JSON.stringify(exam)), syntheticAnswers(exam), ctx))
  };
}
const promptLines = () => catalogForPrompt().split("\n");

describe("21A.1-FREEZE compatibility pins (captured on the untouched baseline ff13899)", () => {
  const pins = CAPTURE ? { fixtures: {}, prompt: [] } : JSON.parse(fs.readFileSync(PINS, "utf8"));
  it("the corpus is every committed exam fixture (at least 27)", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(27);
    if (!CAPTURE) expect(fixtures.map(f => f[0])).toEqual(Object.keys(pins.fixtures));
  });
  for (const [name, exam] of fixtures) {
    it(name + ": rich content, import / export / canonical save, finalization, student projection and grading are byte-for-byte the baseline", () => {
      const got = snapshot(name, exam);
      if (CAPTURE) { pins.fixtures[name] = got; return; }
      expect(got).toEqual(pins.fixtures[name]);
    });
  }
  it("every pre-21A.1 rich block kind is still a valid block kind with its meaning (the vocabulary is only extended)", () => {
    for (const t of BASELINE_BLOCK_TYPES) expect(RICH_BLOCK_TYPES, t).toContain(t);
    expect(RICH_BLOCK_TYPES.slice(0, BASELINE_BLOCK_TYPES.length)).toEqual(BASELINE_BLOCK_TYPES);
  });
  it("the AI catalog prompt changes only by the declared delta: version token, the rich-block list gaining chart support, new chart lines", () => {
    const now = promptLines();
    if (CAPTURE) { pins.prompt = now; return; }
    const base = pins.prompt;
    const norm = l => l.replace(/AI_COMPOSER_CATALOG_V\d+/g, "AI_COMPOSER_CATALOG_V*");
    for (const line of base) {
      if (line.startsWith("Rich blocks:")) { const nowLine = now.find(l => l.startsWith("Rich blocks:")); expect(nowLine.startsWith(line.replace(/\.$/, ""))).toBe(true); continue; }
      expect(now.map(norm), line.slice(0, 60)).toContain(norm(line));
    }
    const added = now.filter(l => !base.map(norm).includes(norm(l)) && !l.startsWith("Rich blocks:"));
    for (const l of added) expect(l, l.slice(0, 60)).toMatch(/^(Charts|Chart selection)\b/);
  });
  it("capture writes the pins (CAPTURE_21A1=1 only)", () => {
    if (CAPTURE) fs.writeFileSync(PINS, JSON.stringify(pins, null, 1) + "\n");
    expect(fs.existsSync(PINS)).toBe(true);
  });
});
