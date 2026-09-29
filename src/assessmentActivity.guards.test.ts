import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Phase 13C-A — SOURCE guards: no executable path from content, static trusted loading, lazy host (M13 / M17 / §27).
const read = (f: string) => readFileSync(f, "utf8");
const code = (src: string) => src.split("\n").filter(l => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")); }).join("\n");

describe("no arbitrary code execution in the assessment activity modules", () => {
  const files = ["src/assessmentActivity.ts", "src/AssessmentActivityContext.tsx", "src/AssessmentActivityHost.tsx", "src/assessmentBlueprint.ts", "src/assessmentTypes.ts"];
  it("never uses eval / new Function / script injection / content-driven dynamic import", () => {
    for (const f of files) {
      const src = code(read(f));
      expect(src, f).not.toMatch(/\beval\s*\(/);
      expect(src, f).not.toMatch(/new\s+Function\s*\(/);
      expect(src, f).not.toMatch(/import\s*\(\s*[^"'\s)]/);                    // import( <non-literal> ) is content-driven
      expect(src, f).not.toMatch(/import\s*\(\s*`/);                           // template-string import path
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\b|srcdoc\s*[:=]\s*[^"',\]]|document\.write|createElement\(["']script/);
    }
  });
  it("the production assessment-safe registry is a literal list (no content key builds an import path); host chunk is loaded ONLY through a literal lazy import", () => {
    const activity = code(read("src/assessmentActivity.ts"));
    expect(activity).toMatch(/ASSESSMENT_SAFE_ACTIVITIES[^=]*=\s*\[/);
    const ctx = code(read("src/AssessmentActivityContext.tsx"));
    expect(ctx).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/AssessmentActivityHost["']\s*\)/);
    expect(ctx).not.toMatch(/^import\s+\w+\s+from\s+["']\.\/AssessmentActivityHost["']/m);
  });
  it("M17 — the student section renderer never eager-imports the host or the learning activity engine", () => {
    const section = code(read("src/StructuredExamSection.tsx"));
    expect(section).not.toMatch(/from\s+["']\.\/AssessmentActivityHost["']/);
    expect(section).not.toMatch(/from\s+["']\.\/learning\/activities\/(LearningActivityHost|engine|builtins)["']/);
    expect(section).toMatch(/from\s+["']\.\/AssessmentActivityContext["']/);
    const ctx = code(read("src/AssessmentActivityContext.tsx"));
    expect(ctx).not.toMatch(/from\s+["']\.\/learning\/activities\/(LearningActivityHost|builtins)["']/);
  });
});
