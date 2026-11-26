import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isStructuredExam } from "./examTypes";
import { parseStructuredExamJson } from "./structuredExamImport";
import { toSavedStructuredExam } from "./examBuilderState";
import { evaluateExamFinalization } from "./examFinalization";
import { catalogCategories, categoryLabel, type LibraryCatalogItem } from "./examLibrary";

// AUTO-A15b — the app's side of «تتبّع الآلات» (TR899271-01…05, scripts/build-899271-automata-trace.mjs): the category, last; each item opens
// in the structured builder — the builder's own import reads it with no error, saves and reads it back with every machine and word exact, and
// the builder's finalization lets it through.
const LIB = path.join(__dirname, "..", "api", "src", "data", "exam-library");
const IDS = [1, 2, 3, 4, 5].map(n => "TR899271-0" + n);
const item = (id: string) => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
type Q = Record<string, unknown>;
const qs = (e: { sections: { questions: Q[] }[] }) => e.sections.flatMap(s => s.questions).map(q => [q.examQuestionId, q.presentationType, q.marks, q.text, q.machineTrace, q.answer]);

describe("AUTO-A15b — «تتبّع الآلات» in the app", () => {
  it("the category «تتبّع الآلات · الأتمتة» comes last", () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8")) as LibraryCatalogItem[];
    expect(catalogCategories(catalog).at(-1)).toBe("trace-899271");
    expect(categoryLabel("trace-899271")).toBe("تتبّع الآلات · الأتمتة");
  });
  for (const id of IDS) it(id + ": the structured builder imports, saves and finalizes it with every machine and word exact", () => {
    const e = item(id).examSnapshot;
    expect(isStructuredExam(e)).toBe(true);
    const imp = parseStructuredExamJson(JSON.stringify(e), id + ".json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(i => i.severity === "error")]).toEqual([true, [], []]);
    expect(qs(imp.exam as never)).toEqual(qs(e));
    expect(qs(parseStructuredExamJson(JSON.stringify(toSavedStructuredExam(imp.exam!)), "re.json").exam as never)).toEqual(qs(e));
    expect(evaluateExamFinalization(imp.exam!).blockers.map(b => b.message)).toEqual([]);
  });
});
