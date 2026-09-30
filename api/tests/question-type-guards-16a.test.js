import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase 16A §38 — architecture / security guards: code-owned catalog and registries, exam JSON can never name executable
// modules, no eval / Function / iframe / external script, unknown types fail closed, the activity descriptor stays
// context-only (never scored), lazy advanced editors / palette, Blueprint and import derive from the catalog, no scattered
// per-type branches in the central files. Fail-first on 6468cc7 (modules absent).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = t => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = f => strip(fs.readFileSync(path.join(repo, f), "utf8"));
const exists = f => fs.existsSync(path.join(repo, f));

describe("16A guards — catalog and registries are code-owned", () => {
  it("catalog / scoring / validation / defaults are pure modules compiled into the shared server build; no eval / Function / dynamic import from data", () => {
    for (const f of ["src/questionTypeCatalog.ts", "src/questionTypeAliases.ts", "src/questionTypeScoring.ts", "src/questionTypeValidation.ts", "src/questionTypeDefaults.ts"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/\beval\s*\(|new Function|Function\(|import\(|require\(|from "react|document\.|window\.|fetch\(|<iframe|srcdoc\s*[=:]|innerHTML|dangerouslySetInnerHTML/);
      expect(exists("api/src/lib/shared-finalization/" + path.basename(f, ".ts") + ".js"), f).toBe(true);
    }
    const build = read("scripts/build-shared-finalization.mjs");
    expect(build).toMatch(/questionTypeScoring/);
  });
  it("runtime registries map a type KEY to code the repository owns; nothing in them derives a module / component / path from question data", () => {
    for (const f of ["src/questionTypes/authoringRegistry.tsx", "src/questionTypes/studentRegistry.tsx", "api/src/lib/question-type-graders.js"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/import\(\s*[^"'`]|import\(\s*`[^`]*\$\{|require\(\s*[^"']|\[question\.(component|module|renderer|grader)\]|\.component\b|\.module\b|\.renderer\b|\.srcdoc\b/);
      expect(s, f).not.toMatch(/\beval\s*\(|new Function|<iframe|srcdoc|dangerouslySetInnerHTML|innerHTML/);
    }
    const lazyImports = [...read("src/questionTypes/authoringRegistry.tsx").matchAll(/import\("([^"]+)"\)/g)].map(m => m[1]);
    expect(lazyImports.length).toBeGreaterThanOrEqual(4);
    for (const p of lazyImports) expect(p).toMatch(/^\.\/[A-Za-z0-9_./-]+$/);                       // literal relative paths only
  });
  it("persisted question data can never select code: the validator rejects executable field names on a question / part / config", () => {
    const { validateQuestionTypeNode } = require(path.join(repo, "api/src/lib/shared-finalization/questionTypeValidation.js"));
    for (const field of ["component", "module", "path", "import", "renderer", "grader", "script", "html", "srcdoc", "eval", "src", "url"]) {
      const issues = validateQuestionTypeNode({ options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], answer: { correctOptionIds: ["a"], scoring: "allOrNothing" }, [field]: "x" }, "multipleSelect", 1);
      expect(issues.map(i => i.code), field).toContain("EXECUTABLE_FIELD");
    }
  });
});

describe("16A guards — fail-closed dispatch and no scattered per-type branches", () => {
  it("the central authoring body host, student card, compound renderer and server grader carry NO hard-coded branch for the Wave 1 or synthetic types", () => {
    const central = { "src/QuestionBodyEditor.tsx": read("src/QuestionBodyEditor.tsx"), "src/StudentQuestionCard.tsx": read("src/StudentQuestionCard.tsx"), "src/CompoundQuestion.tsx": read("src/CompoundQuestion.tsx"), "src/CompoundQuestionEditor.tsx": read("src/CompoundQuestionEditor.tsx"), "src/QuestionComposer.tsx": read("src/QuestionComposer.tsx"), "src/StudentExamPage.tsx": read("src/StudentExamPage.tsx"), "src/StructuredExamSection.tsx": read("src/StructuredExamSection.tsx"), "api/src/lib/assignment-grading.js": read("api/src/lib/assignment-grading.js") };
    for (const [f, s] of Object.entries(central)) expect(s, f).not.toMatch(/multipleSelect|numericResponse|"matrix"|categorization|synthetic/);
    expect(read("src/StudentQuestionCard.tsx")).toMatch(/resolveStudentRenderer|studentRegistry/);
    expect(read("src/QuestionBodyEditor.tsx")).toMatch(/resolveAuthoringEditor|authoringRegistry/);
    expect(read("api/src/lib/assignment-grading.js")).toMatch(/resolveGrader/);
    expect(read("api/src/lib/assignment-grading.js")).toMatch(/unknownTypeResult/);
  });
  it("Blueprint and structured import derive their question-type vocabulary from the catalog (no stale literal lists)", () => {
    expect(read("src/assessmentBlueprint.ts")).not.toMatch(/"multipleChoice",\s*"trueFalse"/);
    const imp = read("src/structuredExamImport.ts");
    expect(imp).not.toMatch(/const CANONICAL_TYPES = \[/); expect(imp).toMatch(/questionTypeCatalog/);
    expect(imp).not.toMatch(/mcq: "multipleChoice"/);                                                  // aliases live in questionTypeAliases (catalog family)
    // unknown imported types are kept verbatim and reported — never coerced to shortAnswer / multipleChoice
    expect(imp).toMatch(/UNSUPPORTED_QUESTION_TYPE/); expect(imp).not.toMatch(/known \? type : "shortAnswer"|: "multipleChoice";\s*\/\/ fallback/);
  });
  it("examTypes derives the public lists from the catalog instead of a second hand-maintained list", () => {
    const s = read("src/examTypes.ts");
    expect(s).toMatch(/questionTypeCatalog/);
    expect(s).not.toMatch(/Object\.freeze\(\[\s*"multipleChoice"/); expect(s).not.toMatch(/multipleChoice:\s*"اختيار من متعدد"/);
  });
});

describe("16A guards — activity context stays context-only; lazy loading; no executable content", () => {
  it("AssessmentActivityDescriptor is never scored: no grader / response / marks path reads `activity`", () => {
    expect(read("api/src/lib/assignment-grading.js")).not.toMatch(/\.activity\b/);
    expect(read("api/src/lib/question-type-graders.js")).not.toMatch(/\.activity\b/);
    expect(read("src/questionTypeScoring.ts")).not.toMatch(/activity/);
    const act = read("src/assessmentActivity.ts");
    expect(act).not.toMatch(/score|grade|marks|response/i);
    expect(read("src/questionTypeCatalog.ts")).not.toMatch(/AssessmentActivityDescriptor/);
  });
  it("the Question Type Palette and the four advanced editors are lazy (dynamic import only) from every builder-side importer; student renderers are lazy from the card", () => {
    const srcFiles = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = name => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    for (const name of ["QuestionTypePalette", "editors/MultipleSelectEditor", "editors/NumericResponseEditor", "editors/MatrixEditor", "editors/CategorizationEditor", "student/MultipleSelectResponse", "student/NumericResponseInput", "student/MatrixResponse", "student/CategorizationResponse"]) {
      expect(staticImporters(name), name + " must only be reached through import()").toEqual([]);
      expect(exists("src/questionTypes/" + name + ".tsx"), name).toBe(true);
    }
    expect(read("src/ExamSectionEditor.tsx")).toMatch(/lazy\(\(\) => import\("\.\/questionTypes\/QuestionTypePalette"\)\)/);
  });
  it("no iframe / external URL / HTML execution / script injection in the Wave 1 renderers and editors", () => {
    const dir = path.join(repo, "src/questionTypes");
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p); } };
    walk(dir);
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const s = strip(fs.readFileSync(f, "utf8"));
      expect(s, f).not.toMatch(/<iframe|srcdoc|dangerouslySetInnerHTML|innerHTML|document\.createElement\("script"|\beval\s*\(|new Function|https?:\/\/(?!schemas)|window\.open|location\.href/);
    }
  });
});
