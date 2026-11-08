import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// PREVIEW-1 — the shared teacher preview (ExamPreview) is opened from three places: the classic builder's «معاينة هذا التنسيق»,
// the structured builder's «معاينة الامتحان» and the assignment composer's content preview. Its full-screen overlay styles used to
// live only in structured-builder.css, which loads with the structured builder's chunk; opened from the assignments page (or the
// classic builder) before that chunk had loaded, the preview fell into the page flow under the composer, unstyled. The preview
// must carry its own overlay styles, whatever page opens it.
const SRC = path.join(process.cwd(), "src");
const read = (file: string) => readFileSync(file, "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every stylesheet a module brings in by itself: its own `import "./x.css"` lines and their `@import`s, transitively. */
function stylesOf(moduleFile: string): string[] {
  const out: string[] = [];
  const visit = (cssFile: string) => {
    if (out.includes(cssFile) || !existsSync(cssFile)) return;
    out.push(cssFile);
    for (const m of strip(read(cssFile)).matchAll(/@import\s+(?:url\()?["']([^"']+\.css)["']/g)) visit(path.resolve(path.dirname(cssFile), m[1]));
  };
  for (const m of read(moduleFile).matchAll(/^import\s+["']([^"']+\.css)["'];?/gm)) visit(path.resolve(path.dirname(moduleFile), m[1]));
  return out;
}
const rule = (css: string, selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = strip(css).match(new RegExp("(?:^|[}\\s,])" + esc + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
};

describe("PREVIEW-1 — ExamPreview carries its own overlay styles", () => {
  const sheets = stylesOf(path.join(SRC, "ExamPreview.tsx"));
  const css = sheets.map(read).join("\n");

  it("ExamPreview.tsx imports a stylesheet (not only the builder's chunk)", () => {
    expect(sheets.length).toBeGreaterThan(0);
  });

  it("the overlay is a fixed, full-screen, scrollable layer above the page", () => {
    const body = rule(css, ".sb-preview-overlay");
    expect(body).not.toBeNull();
    expect(body).toMatch(/position\s*:\s*fixed/);
    expect(body).toMatch(/inset\s*:\s*0/);
    expect(body).toMatch(/z-index\s*:\s*\d+/);
    expect(body).toMatch(/overflow(?:-y)?\s*:\s*auto/);
  });

  it("the header stays on top while the exam scrolls, and its close button is styled", () => {
    expect(rule(css, ".sb-preview-head")).toMatch(/position\s*:\s*sticky/);
    expect(rule(css, ".sb-preview-head .sb-btn")).toMatch(/cursor\s*:\s*pointer/);
    expect(rule(css, ".sb-preview-note")).not.toBeNull();
  });

  it("the structured builder and the import dialogs keep the same overlay (one definition, shared)", () => {
    const builder = stylesOf(path.join(SRC, "StructuredExamBuilder.tsx")).map(read).join("\n");
    expect(rule(builder, ".sb-preview-overlay")).toMatch(/position\s*:\s*fixed/);
    for (const f of ["SmartStructuredExamImportWizard.tsx", "StructuredExamImportDialog.tsx"]) {
      expect(rule(stylesOf(path.join(SRC, f)).map(read).join("\n"), ".sb-preview-overlay")).toMatch(/position\s*:\s*fixed/);
    }
    const defs = (strip(read(path.join(SRC, "structured-builder.css"))).match(/(^|[}\s,])\.sb-preview-overlay\s*\{/g) || []).length;
    expect(defs).toBe(0);
  });
});
