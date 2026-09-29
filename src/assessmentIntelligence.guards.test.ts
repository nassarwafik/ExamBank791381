import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// Phase 13C-B — SOURCE guards pinning the phase boundaries: the legacy 791381 generator is NOT generalized; the live
// intelligence core has no quality score / gate and no subject branch; nothing analytical is persisted into the exam.
const read = (f: string) => readFileSync(f, "utf8");
const code = (src: string) => src.split("\n").filter(l => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")); }).join("\n");

describe("legacy 791381 generator stays legacy (explicit 13C-B non-goal)", () => {
  it("generate-exam / exam-question-selection / interpret-exam-request never read the canonical Blueprint and keep their explicit BASIC / INFRASTRUCTURE shape", () => {
    for (const f of ["api/src/functions/generate-exam.js", "api/src/lib/exam-question-selection.js", "api/src/functions/interpret-exam-request.js"]) {
      const src = code(read(f));
      expect(src, f).not.toMatch(/blueprint|assessmentMeta|AssessmentBlueprint|evaluateBlueprintCoverage/i);
    }
    expect(read("api/src/functions/generate-exam.js")).toMatch(/\[\s*"BASIC",\s*"INFRASTRUCTURE"\s*\]/);
  });
  it("the coverage engine never imports the generator, the bank, the network or React", () => {
    const src = code(read("src/assessmentBlueprintCoverage.ts"));
    expect(src).not.toMatch(/from\s+["'][^"']*(generate|bank|fetch|api\/|react)[^"']*["']/i);
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("13C-C boundary: factual only", () => {
  it("the engine and the panel contain no score / grade / gate / rating / publish-block vocabulary as identifiers", () => {
    for (const f of ["src/assessmentBlueprintCoverage.ts", "src/BlueprintCoveragePanel.tsx"]) {
      expect(existsSync(f), f).toBe(true);
      const src = code(read(f));
      expect(src, f).not.toMatch(/\b(score|grade|grading|rating|gate|blockPublish|canPublish|quality)[A-Za-z]*\s*[:=(]/);
    }
  });
  it("no subject branch in the live intelligence core", () => {
    for (const f of ["src/assessmentBlueprintCoverage.ts", "src/BlueprintCoveragePanel.tsx", "src/assessmentBulkClassify.ts", "src/bankPickerFocus.ts"]) {
      const src = code(read(f));
      expect(src, f).not.toMatch(/791381|networking|physics|chemistry|mathematics|computer-?science|BASIC|INFRASTRUCTURE/i);
    }
  });
});
