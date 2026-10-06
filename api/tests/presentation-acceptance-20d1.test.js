import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { parseStructuredExamJson } from "../../src/structuredExamImport";
import { validatePresentation } from "../../src/presentation/presentationModel";
import { validateRichContent } from "../../src/richContent/richContentModel";

// Phase 20D.1 — acceptance fixtures A–F (docs/fixtures/presentation-20d1/*.json): importable through the real JSON import path with
// zero parse / validation errors, round-trip byte-stable, projected to the student strictly (canonical presentation + rich content,
// never an answer key), and academically inert (grades identical with every presentation / rich field removed). F is the legacy pin:
// no new key appears anywhere in its student payload.
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/fixtures/presentation-20d1");
const NAMES = ["A-classic-arabic", "B-network-lab", "C-physics", "D-cs", "E-showcase", "F-legacy"];
const read = n => fs.readFileSync(path.join(DIR, n + ".json"), "utf8");
const clone = x => JSON.parse(JSON.stringify(x));
const NEW_KEYS = new Set(["presentation", "richContent", "instructionsRichContent"]);
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (NEW_KEYS.has(k) ? undefined : v)));
const questions = e => e.sections.flatMap(s => s.questions);
// a full, correct answer sheet derived from the teacher keys (MCQ / multiTrueFalse / tableFill / cliFill only in these fixtures)
function perfectAnswers(exam) {
  const out = {};
  for (const q of questions(exam)) {
    if (q.presentationType === "multipleChoice") out[q.examQuestionId] = { kind: "choice", index: q.answer.correctOptionIndex };
    else out[q.examQuestionId] = { kind: "fields", values: Object.fromEntries(q.fields.map(f => [f.id, typeof f.correct === "boolean" ? (f.correct ? "true" : "false") : f.correct])) };
  }
  return out;
}

describe("20D1-ACC acceptance fixtures A–F", () => {
  for (const name of NAMES) {
    it(name + ": imports through the real JSON path with no parse error, no parse warning and no validation error", () => {
      const r = parseStructuredExamJson(read(name), name + ".json");
      expect(r.canOpen).toBe(true);
      expect(r.parseErrors).toEqual([]);
      expect(r.parseWarnings).toEqual([]);
      expect(r.validationErrors.map(i => i.code + "@" + (i.path ?? ""))).toEqual([]);
    });

    it(name + ": import → export → import round trip keeps presentation and every rich document byte-identical", () => {
      const first = parseStructuredExamJson(read(name)).exam;
      const second = parseStructuredExamJson(JSON.stringify(first)).exam;
      const pick = e => JSON.stringify({ p: e.presentation, c: e.coverPage?.instructionsRichContent, s: e.sections.map(s => ({ p: s.presentation, i: s.instructionsRichContent, q: s.questions.map(q => [q.richContent, q.presentation]) })) });
      expect(pick(second)).toBe(pick(first));
      expect(pick(first)).toBe(pick(JSON.parse(read(name))));
    });

    it(name + ": student projection is strict — canonical presentation / rich content, no answer key, no teacher field", () => {
      const src = JSON.parse(read(name));
      const out = sanitizeExamForStudent(clone(src));
      const json = JSON.stringify(out);
      expect(json).not.toMatch(/correctOptionIndex|"correct"/);
      for (const q of questions(out)) expect(q.answer ?? {}).toEqual({});   // the existing projection keeps an EMPTY answer placeholder only
      if (src.presentation) expect(out.presentation).toEqual(validatePresentation(src.presentation).value);
      else expect(out).not.toHaveProperty("presentation");
      const srcQ = questions(src), outQ = questions(out);
      srcQ.forEach((q, i) => {
        if (q.richContent) expect(outQ[i].richContent).toEqual(validateRichContent(q.richContent).value);
        else expect(outQ[i]).not.toHaveProperty("richContent");
        expect(outQ[i].text).toBe(q.text);      // the plain stem always travels (fallback / search / accessibility)
      });
    });

    it(name + ": grading is inert — perfect and empty sheets grade identically with every presentation / rich field removed", () => {
      const src = JSON.parse(read(name));
      for (const answers of [perfectAnswers(src), {}]) expect(gradeExam(clone(src), answers)).toEqual(gradeExam(strip(src), answers));
      const g = gradeExam(clone(src), perfectAnswers(src));
      expect(g.score).toBe(g.totalMarks);
    });
  }

  it("F-legacy (pin): no presentation / rich key exists in the source or in its student payload", () => {
    const src = JSON.parse(read("F-legacy"));
    const out = sanitizeExamForStudent(clone(src));
    const keys = new Set();
    JSON.stringify([src, out], (k, v) => { keys.add(k); return v; });
    for (const k of NEW_KEYS) expect(keys.has(k), k).toBe(false);
    expect(out.presentationTheme).toBe("classic");
  });

  it("the fixtures together exercise five presets + the legacy path, every rich block type and the section / question overrides", () => {
    const all = NAMES.map(n => JSON.parse(read(n)));
    const blockTypes = new Set();
    JSON.stringify(all, (k, v) => { if (v && typeof v === "object" && typeof v.type === "string") blockTypes.add(v.type); return v; });
    for (const t of ["heading", "paragraph", "unorderedList", "orderedList", "table", "image", "figure", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "columns", "math"]) expect(blockTypes.has(t), t).toBe(true);
    expect(all.map(e => e.presentation?.preset ?? null)).toEqual(["classicPaper", "networkLab", "scienceLab", "developerWorkspace", "modernAcademic", null]);
    expect(all.some(e => e.sections.some(s => s.presentation))).toBe(true);
    expect(all.some(e => questions(e).some(q => q.presentation))).toBe(true);
  });
});
