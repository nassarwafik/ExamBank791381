/// <reference types="node" />
// Phase 21E.2 — Premium Visual Redesign, slice 1 (structured builder). CSS is stubbed under Vitest, so these are structural
// guards on the sheet read from disk: they pin what the presentation-only sheet must never do to behaviour that earlier phases
// certified (the 21E.1 slice 2 toast reserve, the 21E.2 sticky-toolbar rule, focus after deletion / «تراجع»), plus the
// design-system rules it promises (token-only colours, RTL logical properties, reduced motion, WCAG 1.4.11 field boundary).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();
const sheetRaw = readFileSync(path.join(root, "src", "builder", "builder-premium.css"), "utf8");
const sheet = sheetRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readFileSync(path.join(root, "src", "design-tokens.css"), "utf8");

/** Top-level and nested rules as { selector, body } (at-rule wrappers are flattened; their own headers are skipped). */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ selector: m[1].replace(/@[^{]*$/, "").trim().replace(/^.*\{/, "").trim(), body: m[2] });
  return out;
}
const all = rules(sheet);
const token = (name: string) => { const m = tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")); if (!m) throw new Error("token " + name); return m[1]; };
const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("21E.2 premium slice 1 — the builder sheet is loaded, and loaded last", () => {
  it("StructuredExamBuilder imports builder-premium.css after structured-builder.css and builder-issues.css", () => {
    const src = readFileSync(path.join(root, "src", "StructuredExamBuilder.tsx"), "utf8");
    const a = src.indexOf('import "./structured-builder.css"'), b = src.indexOf('import "./builder/builder-issues.css"'), c = src.indexOf('import "./builder/builder-premium.css"');
    expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(-1); expect(c).toBeGreaterThan(Math.max(a, b));
  });
  it("styles the question-type summary (qt-meta) inside the builder — it rendered as a bare <dl> list before", () => {
    expect(all.some(r => /\.sb-builder \.qt-meta\b(?![\w-])/.test(r.selector) && /display:\s*flex/.test(r.body))).toBe(true);
    expect(all.some(r => /\.sb-builder \.qt-meta dd\b/.test(r.selector) && /border-radius:\s*var\(--eb-pill\)/.test(r.body))).toBe(true);
  });
});

describe("21E.2 premium slice 1 — never changes certified behaviour", () => {
  it("never sets padding on the builder overlay (the 21E.1 slice 2 toast reserve owns padding-block-end)", () => {
    const overlay = all.filter(r => r.selector.includes("structured-builder-overlay"));
    expect(overlay.length).toBeGreaterThan(0);
    for (const r of overlay) expect(r.body).not.toMatch(/(^|;|\s)(scroll-)?padding/);
  });
  it("never positions the toolbar (builder-toolbar.css alone decides where it may stick)", () => {
    for (const r of all.filter(r => r.selector.includes("sb-toolbar"))) expect(r.body).not.toMatch(/(^|;|\s)(position|top|inset|z-index)\s*:/);
  });
  it("keeps a visible focus outline on question cards (focus after a deletion / «تراجع» lands on them)", () => {
    const focus = all.find(r => /\.sb-question:focus\b/.test(r.selector));
    expect(focus?.body).toMatch(/outline:\s*2px solid var\(--eb-primary\)/);
    expect(sheet).not.toMatch(/\.sb-(question|section)[^{]*\{[^}]*outline:\s*(none|0)/);
  });
  it("never clips section or question content (menus and pickers render inside cards)", () => {
    for (const r of all.filter(r => /\.sb-(section|question)\b/.test(r.selector))) expect(r.body).not.toMatch(/overflow\s*:\s*(hidden|clip)/);
  });
});

describe("21E.2 premium slice 1 — design-system rules", () => {
  it("is token-only: no literal colours (hex, rgb, hsl) outside custom-property references", () => {
    expect(sheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sheet).not.toMatch(/\b(rgba?|hsla?)\(/);
  });
  it("uses RTL logical properties only (no physical left / right)", () => {
    expect(sheet).not.toMatch(/(^|[;{\s])(margin|padding|border)-(left|right)\b/);
    expect(sheet).not.toMatch(/(^|[;{\s])(left|right)\s*:/);
    expect(sheet).not.toMatch(/text-align:\s*(left|right)/);
  });
  it("every transition has a prefers-reduced-motion fallback", () => {
    const reduced = sheet.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\}\s*\}/);
    expect(reduced?.[1]).toMatch(/transition:\s*none/);
    const animated = all.filter(r => /transition:\s*(?!none)/.test(r.body)).flatMap(r => r.selector.split(",").map(s => s.trim().split(":")[0].trim()));
    for (const sel of new Set(animated)) expect(reduced?.[1] ?? "", sel).toContain(sel);
  });
  it("title fields stay identifiable as fields: a dashed underline in a token with ≥ 3:1 on the surface (WCAG 1.4.11)", () => {
    for (const sel of [".sb-builder .sb-toolbar .sb-exam-title", ".sb-builder .sb-title-input"]) {
      const r = all.find(x => x.selector === sel);
      expect(r?.body, sel).toMatch(/border-block-end:\s*1px dashed var\(--eb-placeholder\)/);
    }
    expect(contrast(token("eb-placeholder"), token("eb-surface"))).toBeGreaterThanOrEqual(3);
  });
  it("keeps per-question and per-section controls at 44 px on touch screens", () => {
    const coarse = sheet.match(/@media \(pointer: coarse\)\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? "";
    expect(coarse).toMatch(/\.sb-builder \.sb-icon-btn[^{]*\{[^}]*min-width:\s*44px;\s*height:\s*44px/);
  });
});
