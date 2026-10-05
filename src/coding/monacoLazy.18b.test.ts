import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Phase 18B — SOURCE-LEVEL lazy-loading proof, complementary to the production bundle guard (scripts/check-bundle-budget.mjs,
// which proves the same on the emitted dist/ graph). A static import walker follows every `import … from "./relative"` and
// `export … from "./relative"` edge (never a dynamic `import()`), so it reproduces what a bundler puts into ONE static graph:
//   • the application entry (src/main.tsx) never reaches the coding editor, the workspace, the coding renderers or Monaco;
//   • the coding question chunks (CodingResponse / CodingQuestionEditor / CodingWorkspace) never reach the Monaco engine module;
//   • the workspace UI is lightweight: its static closure stays inside the coding / ui / model modules, no charting, no Monaco.

const SRC = path.resolve(__dirname, "..");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/[^"'\n]*$/gm, "");
const STATIC_EDGE = /(?:^|[;\n}])\s*(?:import|export)\s+(?:type\s+)?(?:[^;'"]*?\s+from\s+)?["']([^"']+)["']/g;
const resolve = (from: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + ".ts", base + ".tsx", base + ".js", base + ".mjs", path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
/** Every file reachable from `roots` through STATIC relative import edges (css / assets / bare packages are recorded as leaves). */
function staticClosure(roots: string[]) {
  const files = new Set<string>(), packages = new Set<string>(), queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const m of src.matchAll(STATIC_EDGE)) {
      const spec = m[1];
      if (!spec.startsWith(".")) { packages.add(spec); continue; }
      const target = resolve(file, spec);
      if (target) queue.push(target); else files.add(path.resolve(path.dirname(file), spec));
    }
  }
  const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
  return { files: [...files].map(rel), packages: [...packages] };
}
const at = (...p: string[]) => path.join(SRC, ...p);
const MONACO_ENGINE = "coding/editor/monacoEngine.ts";
const CODING_UI = [/^coding\/CodingEditor\.tsx$/, /^coding\/editor\//, /^coding\/workspace\//, /^questionTypes\/student\/CodingResponse\.tsx$/, /^questionTypes\/editors\/CodingQuestionEditor\.tsx$/];

describe("18B Monaco stays lazy — source-level import graph", () => {
  it("the application entry's static graph contains no coding editor / workspace / renderer module and no monaco-editor package", () => {
    const g = staticClosure([at("main.tsx")]);
    expect(g.files.length).toBeGreaterThan(50);                                                             // the walker really walked the app
    const reached = g.files.filter(f => CODING_UI.some(p => p.test(f)));
    expect(reached).toEqual([]);
    expect(g.packages.filter(p => p.startsWith("monaco-editor"))).toEqual([]);
    expect(g.files).not.toContain(MONACO_ENGINE);
  });
  it("the coding question chunks reach the Monaco engine ONLY through the loader's dynamic import()", () => {
    const g = staticClosure([at("questionTypes/student/CodingResponse.tsx"), at("questionTypes/editors/CodingQuestionEditor.tsx"), at("coding/workspace/CodingWorkspace.tsx")]);
    expect(g.files).toContain("coding/CodingEditor.tsx");
    expect(g.files).toContain("coding/workspace/CodingWorkspace.tsx");
    expect(g.files).toContain("coding/editor/editorEngine.ts");
    expect(g.files).not.toContain(MONACO_ENGINE);
    expect(g.packages.filter(p => p.startsWith("monaco-editor"))).toEqual([]);
    const loader = stripComments(fs.readFileSync(at("coding/editor/editorEngine.ts"), "utf8"));
    expect(loader).toMatch(/import\(\s*["']\.\/monacoEngine["']\s*\)/);
    expect(loader).not.toMatch(/^import .*monacoEngine/m);
  });
  it("the workspace UI is lightweight: no monaco, no chart, no exam page; its own sources stay small", () => {
    const g = staticClosure([at("coding/workspace/CodingWorkspace.tsx")]);
    expect(g.packages.filter(p => /monaco|chart/.test(p))).toEqual([]);
    expect(g.files.filter(f => /^(App|StudentExamPage|StudentPortal|TeacherPlatform|TeacherDashboard|AssignmentReview)\.tsx$/.test(f))).toEqual([]);
    for (const f of g.files) expect(f, f).toMatch(/^(coding\/|ui\/|codingQuestion\.ts$|codingLanguages\.ts$|codingTemplate\.ts$|questionTypeCatalog\.ts$|questionTypeAliases\.ts$|examTypes\.ts$|answerState\.ts$)/);
    const bytes = ["coding/workspace/CodingWorkspace.tsx", "coding/workspace/editorPreferences.ts", "coding/workspace/workspace.css"].reduce((n, f) => n + fs.statSync(at(f)).size, 0);
    expect(bytes).toBeLessThan(40 * 1024);
  });
  it("no workspace / editor module mentions Monaco in code (only the engine module and its adapter may)", () => {
    for (const f of ["coding/workspace/CodingWorkspace.tsx", "coding/workspace/editorPreferences.ts", "coding/CodingEditor.tsx", "questionTypes/student/CodingResponse.tsx", "questionTypes/editors/CodingQuestionEditor.tsx"]) {
      expect(stripComments(fs.readFileSync(at(f), "utf8")), f).not.toMatch(/monaco/i);
    }
  });
  it("the production bundle guard knows the workspace payload signature so the UI can never slip into the initial graph unnoticed", () => {
    const guard = fs.readFileSync(path.resolve(SRC, "..", "scripts", "check-bundle-budget.mjs"), "utf8");
    expect(guard).toMatch(/CODING_SIGNATURES = \[[^\]]*"cx-ws-toolbar"/);
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
  });
});
