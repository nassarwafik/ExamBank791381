import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isStructuredExam } from "./examTypes";
import { parseStructuredExamJson } from "./structuredExamImport";
import { toSavedStructuredExam } from "./examBuilderState";
import { evaluateExamFinalization } from "./examFinalization";
import { catalogCategories, categoryLabel, type LibraryCatalogItem } from "./examLibrary";

// AUTO-A13 — the app's side of «مختبر الآلات» (the 4 Exam Library items AU899271-01…04, scripts/build-899271-automata-lab.mjs):
//   • the library page names its category, after every other category;
//   • «فتح نسخة في الباني» (App: handleCopyLibraryExamToBuilder) opens a STRUCTURED exam in the structured builder — where
//     automatonDesign@1 / machineDesign@1 live — so each item is one: it reads in the builder's own import with no error, saves and
//     reads back with every rule and key exact, and the builder's finalization (the same source the server runs) lets it through.
const LIB = path.join(__dirname, "..", "api", "src", "data", "exam-library");
const IDS = ["AU899271-01", "AU899271-02", "AU899271-03", "AU899271-04"];
const item = (id: string) => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
type Q = { examQuestionId: string; automatonDesign?: unknown; machineDesign?: unknown; answer?: unknown };
const qs = (e: { sections: { questions: Q[] }[] }) => e.sections.flatMap(s => s.questions);
const pick = (q: Q) => [q.examQuestionId, q.automatonDesign ?? q.machineDesign, q.answer];

describe("AUTO-A13 — «مختبر الآلات» in the app", () => {
  it("the category «مختبر الآلات · الأتمتة» comes after every other category but «أسئلة نظرية · الأتمتة» (AUTO-A14)", () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8")) as LibraryCatalogItem[];
    expect(catalogCategories(catalog)).toEqual(["foundation", "infra", "comprehensive", "advanced", "final", "coding-899371", "automata-899271", "theory-899271"]);
    expect(categoryLabel("automata-899271")).toBe("مختبر الآلات · الأتمتة");
  });

  for (const id of IDS) it(id + ": a structured exam the builder imports, saves and finalizes with every rule and key exact", () => {
    const e = item(id).examSnapshot;
    expect(isStructuredExam(e)).toBe(true);
    const imp = parseStructuredExamJson(JSON.stringify(e), id + ".json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(i => i.severity === "error")]).toEqual([true, [], []]);
    expect(qs(imp.exam as never).map(pick)).toEqual(qs(e).map(pick));
    const saved = toSavedStructuredExam(imp.exam!);
    const again = parseStructuredExamJson(JSON.stringify(saved), "re-export.json");
    expect(qs(again.exam as never).map(pick)).toEqual(qs(e).map(pick));
    expect(evaluateExamFinalization(imp.exam!).blockers.map(b => b.message)).toEqual([]);
  });
});
