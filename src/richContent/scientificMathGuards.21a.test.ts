import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./richMath";

// Phase 21A — STATIC guards for Scientific Math v2. They extend the 20D.1 source guard (no HTML sinks in the rich-content runtime) with
// the math-specific invariants: React-created MathML only from a closed element vocabulary, no third-party TeX engine, no dynamic code
// or network in the parser, no raw-TeX escape hatch, and the bundle guard knows the new lazy surfaces with the budget UNCHANGED.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const MATH_RUNTIME = ["src/richContent/richMath.ts", "src/richContent/mathFeatures.ts", "src/richContent/RichMath.tsx", "src/richContent/MathSnippetPalette.tsx"];
const HTML_SINKS = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|srcdoc|\beval\(|new Function\(/;

describe("21A-G1 source security guard (extends 20D1-RR2)", () => {
  it("no HTML sink, dynamic code, network, dynamic import or input-built RegExp in the parser, the catalog, the renderer or the palette", () => {
    for (const f of MATH_RUNTIME) {
      const src = read(f);
      expect(src, f).not.toMatch(HTML_SINKS);
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|\bimport\(|\brequire\(|new RegExp\(/);
    }
    for (const f of ["src/richContent/richMath.ts", "src/richContent/mathFeatures.ts"]) expect(read(f), f).not.toMatch(/from "react"|document\.|window\./);
  });
  it("the renderer creates MathML ONLY through the closed `el` vocabulary plus the fixed <math> root; no name or attribute is computed from source", () => {
    const src = read("src/richContent/RichMath.tsx");
    const calls = [...src.matchAll(/createElement\(([^,]+),/g)].map(m => m[1].trim());
    expect(calls).toEqual(["name", '"math"']);                                                 // the `el` helper (typed closed union) and the root
    const names = [...src.matchAll(/\bel\("([a-z]+)"/g)].map(m => m[1]);
    expect(new Set(names)).toEqual(new Set(["mrow", "mi", "mn", "mo", "mtext", "mfrac", "msqrt", "mroot", "msub", "msup", "msubsup", "mover", "mspace", "mtable", "mtr", "mtd"]));
    expect(src).not.toMatch(/\bel\([^"]/);                                                     // every el(...) call names a literal element
    expect(src).not.toMatch(/\[\s*n\.(v|env)\s*\]\s*:/);                                         // no computed attribute keys from AST values
  });
  it("no third-party TeX / MathML engine is a dependency or an import anywhere in src", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter(d => /katex|mathjax|temml|mathlive|asciimath|mathquill|latex/i.test(d))).toEqual([]);
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(d, e.name)] : []));
    for (const f of walk(path.join(root, "src"))) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/from ["'](katex|mathjax|temml|mathlive|mathjax-full|better-react-mathjax)/);
  });
  it("the language has no raw / escape-hatch command: no \\href \\url \\html \\style \\class \\def \\newcommand \\input \\include \\array \\color", () => {
    for (const c of ["href", "url", "html", "htmlClass", "htmlId", "htmlStyle", "style", "class", "def", "gdef", "let", "newcommand", "renewcommand", "input", "include", "array", "color", "textcolor", "require", "operatorname", "mathrm{"]) {
      expect(M.MATH_COMMANDS, c).not.toContain(c);
    }
    expect(Object.isFrozen(M.MATH_COMMANDS) && Object.isFrozen(M.MATH_ENVIRONMENTS) && Object.isFrozen(M.MATH_GRID_LIMITS)).toBe(true);
  });
});

describe("21A-G2 bundle guard", () => {
  it("knows the Scientific Math v2 lazy surfaces, keeps the 20D.1 signatures and the 125 KB budget is unchanged", () => {
    const guard = read("scripts/check-bundle-budget.mjs");
    for (const s of ["xp-studio", "rc-editor", "RICH_CONTENT_RAW_HTML", "MARKDOWN_HTML_REFUSED", "mfrac", "PRESENTATION_CONTRAST", "xp-math-aligned", "rc-math-palette", "rightleftharpoons"]) {
      expect(guard, s).toContain('"' + s + '"');
    }
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
    expect(read("src/richContent/RichMath.tsx")).toContain('"xp-math-aligned"');
    expect(read("src/richContent/MathSnippetPalette.tsx")).toContain('"rc-math-palette"');
    expect(read("src/richContent/richMath.ts")).toMatch(/\brightleftharpoons:/);
  });
  it("the palette is a lazy chunk of the lazy editor; the student surfaces never import the editor, the palette or the feature catalog", () => {
    expect(read("src/richContent/RichContentEditor.tsx")).toMatch(/lazy\(\(\) => import\("\.\/MathSnippetPalette"\)\)/);
    expect(read("src/richContent/RichContentEditor.tsx")).not.toMatch(/from "\.\/MathSnippetPalette"|from "\.\/mathFeatures"/);
    for (const f of ["src/StudentQuestionCard.tsx", "src/StudentExamPage.tsx", "src/ExamPreview.tsx", "src/richContent/RichContentRenderer.tsx", "src/richContent/RichMath.tsx", "src/richContent/richMath.ts", "src/richContent/richContentModel.ts"]) {
      expect(read(f), f).not.toMatch(/MathSnippetPalette|mathFeatures/);
    }
  });
});
