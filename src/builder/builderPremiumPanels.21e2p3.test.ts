/// <reference types="node" />
// Phase 21E.2 — Premium Visual Redesign, slice 3 (builder panels: «مستكشف الأسئلة», the bulk-selection bar, «فحص الجاهزية للاعتماد»).
// CSS is stubbed under Vitest, so these are structural guards on the sheet read from disk. Behaviour (navigator lists / filters /
// selects, the bulk bar's count and position rule, readiness sections and «عرض الأسئلة», touch sizes, overflow) is certified in
// real Chromium by scripts/capture-visual-gate-21e2p3.mjs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();
const sheet = readFileSync(path.join(root, "src", "builder", "builder-premium-panels.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const slice1 = readFileSync(path.join(root, "src", "builder", "builder-premium.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const legacy = readFileSync(path.join(root, "src", "structured-builder.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readFileSync(path.join(root, "src", "design-tokens.css"), "utf8");

function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ selector: m[1].replace(/@[^{]*$/, "").trim(), body: m[2] });
  return out;
}
const splitList = (list: string) => { const out: string[] = []; let depth = 0, cur = "";
  for (const ch of list) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out; };
const all = rules(sheet);
const selectors = all.flatMap(r => splitList(r.selector).map(selector => ({ selector, body: r.body })));
const block = (query: string) => { const i = sheet.indexOf(query); if (i < 0) return ""; const open = sheet.indexOf("{", i); let depth = 0;
  for (let k = open; k < sheet.length; k++) { if (sheet[k] === "{") depth++; else if (sheet[k] === "}" && --depth === 0) return sheet.slice(open + 1, k); } return ""; };
/** (classes + attributes + pseudo-classes) count — enough to compare two class-only selectors. */
const specificity = (sel: string) => (sel.replace(/:is\(|:where\(|::[\w-]+/g, "").match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || []).length;
const token = (name: string) => { const m = tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")); if (!m) throw new Error("token " + name); return m[1]; };
const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("21E.2 premium slice 3 — loaded through the slice 1 sheet, scoped to the three panels", () => {
  it("builder-premium.css @imports the panels sheet before any rule", () => {
    const firstRule = slice1.search(/[^\s;]+[^{};]*\{/);
    const imp = slice1.indexOf('@import "./builder-premium-panels.css"');
    expect(imp).toBeGreaterThan(-1); expect(imp).toBeLessThan(firstRule);
  });
  it("every selector belongs to the navigator, the bulk bar or the readiness dialog", () => {
    for (const { selector } of selectors) expect(selector, selector).toMatch(/^(\.sb-builder \.sb-navigator|\.sb-navigator|\.sb-builder \.sb-bulk-bar|\.sb-fin-dialog|\.eb-dialog\.sb-fin-dialog)\b/);
  });
  it("each rule is more specific than the legacy rule it restyles (structured-builder.css also loads in later chunks and wins ties)", () => {
    const props = (body: string) => new Set(body.split(";").map(d => d.split(":")[0].trim()).filter(Boolean));
    const legacyRules = rules(legacy).flatMap(r => splitList(r.selector).map(sel => ({ sel, props: props(r.body) })));
    for (const { selector, body } of selectors) {
      const mine = props(body);
      const last = selector.split(/\s+/).pop()!.replace(/:(hover|focus|focus-visible|focus-within|disabled|not\([^)]*\))/g, "");
      // only legacy rules that set at least one of the same properties can win a tie that matters
      const competing = legacyRules.filter(l => (l.sel.split(/\s+/).pop() === last) && [...l.props].some(p => mine.has(p))).map(l => l.sel);
      // A legacy rule that only matches inside the navigator DIALOG (a portal, never inside .sb-builder) cannot compete with a
      // rule scoped to .sb-builder, and vice versa.
      // A legacy rule competes only if every ancestor it requires can be one of these panels' own elements (or it has none) —
      // e.g. `.sb-nav-actions .sb-btn` does, `.sb-template-controls .sb-input` (inside a section) cannot.
      const family = /sb-navigator|sb-nav-/.test(selector) ? "nav" : /sb-bulk/.test(selector) ? "bulk" : "fin";   // this rule's own panel
      const ancestorsArePanel = (l: string) => l.split(/\s+/).slice(0, -1).every(part => new RegExp("^\\.sb-" + family + "[\\w-]*").test(part));
      const coMatch = (l: string) => ancestorsArePanel(l) && !(selector.startsWith(".sb-builder ") && l.includes("sb-navigator-dialog-shell"));
      for (const l of competing.filter(coMatch)) expect(specificity(selector), selector + " vs legacy " + l).toBeGreaterThan(specificity(l));
    }
  });
});

describe("21E.2 premium slice 3 — never changes certified behaviour", () => {
  it("never touches the navigator's sticky / scroll rules nor the bulk bar's position", () => {
    for (const { selector, body } of selectors.filter(s => /\.sb-navigator$|\.sb-bulk-bar$/.test(s.selector))) expect(body, selector).not.toMatch(/(^|;|\s)(position|top|inset|z-index|max-height|overflow[\w-]*)\s*:/);
  });
  it("never hides a control and keeps every focus indicator", () => {
    expect(sheet).not.toMatch(/display:\s*none|visibility:\s*hidden|pointer-events:\s*none|outline:\s*(none|0)\b/);
    for (const s of [".sb-navigator .sb-nav-jump:focus-visible", ".sb-navigator .sb-link-btn:focus-visible", ".eb-dialog.sb-fin-dialog .sb-btn:focus-visible"]) {
      expect(selectors.some(x => x.selector === s && /outline:\s*var\(--eb-focus-ring\)/.test(x.body)), s).toBe(true);
    }
  });
  it("readiness tone is an edge, a tint and a labelled pill — never colour alone", () => {
    expect(selectors.find(s => s.selector === ".sb-fin-dialog .sb-fin-item.is-blocker")?.body).toMatch(/border-inline-start:\s*4px solid var\(--eb-danger\)/);
    expect(selectors.find(s => s.selector === ".sb-fin-dialog .sb-fin-item.is-warning")?.body).toMatch(/border-inline-start:\s*4px solid var\(--eb-warn\)/);
    expect(selectors.find(s => s.selector === ".sb-fin-dialog .sb-fin-effect")?.body).toMatch(/background:\s*var\(--eb-surface\)/);
  });
  it("text on these tints and pills meets 4.5:1", () => {
    for (const [fg, bg] of [["eb-danger-tx", "eb-surface"], ["eb-warn-tx", "eb-surface"], ["eb-ink", "eb-danger-bg"], ["eb-ink", "eb-warn-bg"], ["eb-muted", "eb-danger-bg"], ["eb-muted", "eb-warn-bg"],
      ["eb-surface", "eb-primary-strong"], ["eb-primary-strong", "eb-primary-050"], ["eb-success-tx", "eb-success-bg"], ["eb-danger-tx", "eb-primary-050"]]) {
      expect(contrast(token(fg), token(bg)), fg + " on " + bg).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("touch: 44 px rows / buttons / links, 24 px checkboxes; the «تحديد الظاهر» row beats the legacy 40 px rule", () => {
    const coarse = block("@media (pointer: coarse)");
    expect(coarse).toMatch(/\.sb-navigator \.sb-nav-jump[\s\S]*min-height: 44px/);
    expect(coarse).toMatch(/\.sb-navigator \.sb-nav-actions \.sb-btn \{ min-height: 44px; \}/);
    expect(coarse).toMatch(/\.sb-navigator \.sb-nav-check \{ width: 24px; height: 24px; \}/);
  });
  it("token-only, logical properties only, reduced-motion fallbacks", () => {
    expect(sheet.replace(/\b(Highlight|CanvasText)\b/g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
    expect(sheet).not.toMatch(/(^|[;{\s])(margin|padding|border)-(left|right)\b|(^|[;{\s])(left|right)\s*:|text-align:\s*(left|right)/);
    const reduced = block("@media (prefers-reduced-motion: reduce)");
    const animated = selectors.filter(s => /transition:\s*(?!none)/.test(s.body)).map(s => s.selector.split(":")[0].trim());
    for (const sel of new Set(animated)) expect(reduced, sel).toContain(sel);
  });
});
