import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isStructuredExam } from "./examTypes";
import { parseStructuredExamJson } from "./structuredExamImport";
import { toSavedStructuredExam } from "./examBuilderState";
import { evaluateExamFinalization } from "./examFinalization";
import { catalogCategories, categoryLabel, type LibraryCatalogItem } from "./examLibrary";

// AUTO-A14 — the app's side of «أسئلة نظرية» (the 6 Exam Library items AT899271-01…06, scripts/build-899271-automata-theory.mjs):
//   • the library page names its category, last;
//   • «فتح نسخة في الباني» opens each item in the structured builder: it reads in the builder's own import with no error, saves and reads
//     back with every key, choice and machine table exact, and the builder's finalization (the same source the server runs) lets it through.
const LIB = path.join(__dirname, "..", "api", "src", "data", "exam-library");
const IDS = [1, 2, 3, 4, 5, 6].map(n => "AT899271-0" + n);
const item = (id: string) => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
type Q = Record<string, unknown> & { examQuestionId: string };
const qs = (e: { sections: { questions: Q[] }[] }) => e.sections.flatMap(s => s.questions);
const KEPT = ["examQuestionId", "presentationType", "marks", "text", "options", "fields", "wordBank", "categorization", "answer", "richContent"];
const pick = (q: Q) => KEPT.map(k => q[k] ?? null);

describe("AUTO-A14 — «أسئلة نظرية» in the app", () => {
  it("the category «أسئلة نظرية · الأتمتة» comes last", () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8")) as LibraryCatalogItem[];
    expect(catalogCategories(catalog).slice(-3)).toEqual(["automata-899271", "theory-899271", "trace-899271"]);   // AUTO-A15b's trace exams last
    expect(categoryLabel("theory-899271")).toBe("أسئلة نظرية · الأتمتة");
  });

  for (const id of IDS) it(id + ": a structured exam the builder imports, saves and finalizes with every key, choice and machine table exact", () => {
    const e = item(id).examSnapshot;
    expect(isStructuredExam(e)).toBe(true);
    const imp = parseStructuredExamJson(JSON.stringify(e), id + ".json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(i => i.severity === "error")]).toEqual([true, [], []]);
    expect(qs(imp.exam as never).map(pick)).toEqual(qs(e).map(pick));
    const again = parseStructuredExamJson(JSON.stringify(toSavedStructuredExam(imp.exam!)), "re-export.json");
    expect(qs(again.exam as never).map(pick)).toEqual(qs(e).map(pick));
    expect(evaluateExamFinalization(imp.exam!).blockers.map(b => b.message)).toEqual([]);
  });
});
