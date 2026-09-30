import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// Phase 13C-C — SOURCE guards: dependency direction Blueprint/Profile → Coverage → Quality Policy → Finalization (never
// reversed); the gate engine consumes the coverage report only; no score; no subject branch; H1 / H2 hardening pinned.
const read = (f: string) => readFileSync(f, "utf8");
const code = (src: string) => src.split("\n").filter(l => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")); }).join("\n");
const imports = (src: string) => Array.from(code(src).matchAll(/from\s+["']([^"']+)["']/g)).map(m => m[1]);

describe("dependency direction and isolation", () => {
  it("the quality engine imports only coverage / policy / types / format modules — never the grader, the bank, the generator, React, the API or the exam state", () => {
    for (const f of ["src/assessmentQualityGates.ts", "src/assessmentQualityPolicy.ts"]) {
      expect(existsSync(f), f).toBe(true);
      // questionTypeCatalog is the pure, React-free canonical type vocabulary (16A / Review Fix 1: live labels replace the frozen snapshot)
      for (const dep of imports(read(f))) expect(dep, f + " → " + dep).toMatch(/^\.\/(assessmentBlueprintCoverage|assessmentQualityPolicy|assessmentTypes|assessmentBlueprint|coverageFormat|examTypes|questionTypeCatalog)$/);
      expect(code(read(f)), f).not.toMatch(/\bfetch\s*\(|from\s+["']react["']|api\/|bankQuestion|BankQuestionPicker|generate-exam/i);
    }
  });
  it("coverage and policy never import the gate engine or finalization; finalization is the only module that combines examQuality with the gates", () => {
    for (const f of ["src/assessmentBlueprintCoverage.ts", "src/assessmentQualityPolicy.ts", "src/assessmentBlueprint.ts", "src/examQuality.ts"]) {
      expect(imports(read(f)), f).not.toEqual(expect.arrayContaining([expect.stringMatching(/assessmentQualityGates|examFinalization/)]));
    }
    const fin = imports(read("src/examFinalization.ts"));
    expect(fin).toEqual(expect.arrayContaining(["./examQuality", "./assessmentBlueprintCoverage", "./assessmentQualityPolicy", "./assessmentQualityGates"]));
  });
  it("the gate engine never reads questions, sections, raw marks or weightMarks and never re-implements the relation math (source of truth = coverage rows)", () => {
    const src = code(read("src/assessmentQualityGates.ts"));
    expect(src).not.toMatch(/\.sections\b|\.questions\b|questionMaxMarks|q\.marks|weightMarks|computeTotalMarks|buildAssessmentProfile/);
    expect(src).not.toMatch(/COVERAGE_EPSILON|Math\.abs\(|<=\s*tolerance|\b\d+e-\d+\b|[<>]=?\s*rule\.max\b|rule\.max\s*[<>+-]/);   // no second float comparison of any kind
    expect(src).toMatch(/evaluateConstraintRelation\(/);                                              // thresholds CALL the ONE relation helper (an import alone is not enough)
  });
});

describe("phase boundary and neutrality", () => {
  it("no score / grade / rating identifiers; no subject branch in policy, gates, finalization or the panels", () => {
    for (const f of ["src/assessmentQualityGates.ts", "src/assessmentQualityPolicy.ts", "src/examFinalization.ts", "src/structuredSavePolicy.ts", "src/QualityPolicyPanel.tsx", "src/FinalizationPanel.tsx"]) {
      expect(existsSync(f), f).toBe(true);
      const src = code(read(f));
      expect(src, f).not.toMatch(/\b(score|grade|grading|rating|rank|quality[A-Z]\w*Score)\w*\s*[:=(]/);
      expect(src, f).not.toMatch(/791381|networking|physics|chemistry|mathematics|computer-?science|BASIC|INFRASTRUCTURE/i);
    }
  });
  it("H1 — no global mutable diagnostics in the production assessment module; H2 — no per-row .find() label lookups in the coverage engine", () => {
    const bp = code(read("src/assessmentBlueprint.ts"));
    expect(bp).not.toMatch(/assessmentMetaDiagnostics|contextsPrepared\s*\+=/);
    const cov = code(read("src/assessmentBlueprintCoverage.ts"));
    expect(cov).not.toMatch(/\.find\(/);
    expect(cov).toMatch(/prepareCoverageLabels|labelIndex|LabelIndex/);
  });
  it("the legacy generator stays untouched by 13C-C", () => {
    for (const f of ["api/src/functions/generate-exam.js", "api/src/lib/exam-question-selection.js", "api/src/functions/interpret-exam-request.js"]) expect(code(read(f)), f).not.toMatch(/quality|finaliz|blueprint/i);
  });
});
