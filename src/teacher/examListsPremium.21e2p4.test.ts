/// <reference types="node" />
// Phase 21E.2 — Premium Visual Redesign, slice 4 (the teacher's exam lists: the access bar, «الامتحانات المحفوظة», «القوالب المحفوظة»).
// CSS is stubbed under Vitest, so these are structural guards on the sheet read from disk. Behaviour (lists render, open / delete-cancel,
// touch sizes, overflow) is certified in real Chromium by scripts/capture-visual-gate-21e2p4.mjs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const sheet = read("src", "teacher", "exam-lists-premium.css");
const builderPro = read("src", "builder-pro.css");
const appCss = read("src", "App.css");
const appTsx = readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const tokens = readFileSync(path.join(root, "src", "design-tokens.css"), "utf8");

function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ selector: m[1].replace(/@[^{]*$/, "").replace(/^[^]*;\s*/, "").trim(), body: m[2] });
  return out;
}
const splitList = (list: string) => { const out: string[] = []; let depth = 0, cur = "";
  for (const ch of list) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out; };
const selectors = rules(sheet).flatMap(r => splitList(r.selector).map(selector => ({ selector, body: r.body })));
const block = (query: string) => { const i = sheet.indexOf(query); if (i < 0) return ""; const open = sheet.indexOf("{", i); let depth = 0;
  for (let k = open; k < sheet.length; k++) { if (sheet[k] === "{") depth++; else if (sheet[k] === "}" && --depth === 0) return sheet.slice(open + 1, k); } return ""; };
const specificity = (sel: string) => { const ids = (sel.match(/#[\w-]+/g) || []).length; const cls = (sel.replace(/::[\w-]+/g, "").match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const el = (sel.replace(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?|#[\w-]+/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length + (/::[\w-]+/.test(sel) ? 1 : 0);
  return ids * 10000 + cls * 100 + el; };
const props = (body: string) => new Set(body.split(";").map(d => d.split(":")[0].trim()).filter(Boolean));
const token = (name: string) => { const m = tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")); if (!m) throw new Error("token " + name); return m[1]; };
const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("21E.2 premium slice 4 — loaded after App.css, scoped to the exam lists", () => {
  it("builder-pro.css @imports the sheet before any rule, and App.tsx loads App.css before builder-pro.css (nothing else loads them)", () => {
    const firstRule = builderPro.search(/[^\s;]+[^{};]*\{/);
    const imp = builderPro.indexOf('@import "./teacher/exam-lists-premium.css"');
    expect(imp).toBeGreaterThan(-1); expect(imp).toBeLessThan(firstRule);
    expect(appTsx.indexOf('import "./App.css"')).toBeGreaterThan(-1);
    expect(appTsx.indexOf('import "./App.css"')).toBeLessThan(appTsx.indexOf('import "./builder-pro.css"'));
  });
  it("every selector belongs to the access bar or the two list panels", () => {
    for (const { selector } of selectors) expect(selector, selector).toMatch(/^\.(saved-exams-access|saved-exams-panel|templates-panel|saved-exams-heading|saved-exams-list|saved-exams-empty|saved-exam-(item|main|actions))\b/);
  });
  it("each rule is at least as specific as any App.css rule for the same element and property (the fixed load order breaks ties for this sheet)", () => {
    // only App.css rules of the exam lists themselves can match these elements (a bare `button` target elsewhere cannot)
    const legacy = rules(appCss).flatMap(r => splitList(r.selector).map(sel => ({ sel, props: props(r.body) }))).filter(l => /saved-exam|templates-panel/.test(l.sel));
    // compare like with like: the same target element in the same state (`:hover`, `:disabled`, …)
    const split = (sel: string) => { const last = sel.replace(/::[\w-]+/g, "").trim().split(/\s+/).pop()!; const state = (last.match(/:[\w-]+(\([^)]*\))?/g) || []).sort().join("");
      return { target: last.replace(/:[\w-]+(\([^)]*\))?/g, ""), state }; };
    let compared = 0;
    for (const { selector, body } of selectors) {
      if (/::/.test(selector)) continue;                       // pseudo-elements have no App.css counterpart
      const mine = split(selector), mineProps = props(body);
      for (const l of legacy) {
        const theirs = split(l.sel);
        if (theirs.target !== mine.target || theirs.state !== mine.state || ![...l.props].some(p => mineProps.has(p))) continue;
        compared++;
        expect(specificity(selector), selector + " vs App.css " + l.sel).toBeGreaterThanOrEqual(specificity(l.sel));
      }
    }
    expect(compared).toBeGreaterThan(10);                     // not vacuous: the lists' own App.css rules are really compared
  });
});

describe("21E.2 premium slice 4 — hierarchy, legibility, focus, touch", () => {
  it("a row's main action is filled and delete is quiet but red", () => {
    const open = selectors.find(s => s.selector === ".saved-exam-actions .saved-open-button")?.body ?? "";
    expect(open).toMatch(/background:\s*var\(--eb-primary-strong\)/); expect(open).toMatch(/color:\s*var\(--eb-surface\)/);
    const del = selectors.find(s => s.selector === ".saved-exam-actions .saved-delete-button")?.body ?? "";
    expect(del).toMatch(/background:\s*var\(--eb-surface\)/); expect(del).toMatch(/color:\s*var\(--eb-danger-tx\)/);
  });
  it("text meets 4.5:1 on its background", () => {
    for (const [fg, bg] of [["eb-surface", "eb-primary-strong"], ["eb-surface", "eb-navy-2"], ["eb-danger-tx", "eb-surface"], ["eb-danger-tx", "eb-danger-bg"], ["eb-ink", "eb-surface-2"], ["eb-muted", "eb-surface"], ["eb-muted", "eb-surface-2"], ["eb-primary-strong", "eb-primary-050"]]) {
      expect(contrast(token(fg), token(bg)), fg + " on " + bg).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("never hides a control; every button keeps a focus ring", () => {
    expect(sheet).not.toMatch(/display:\s*none|visibility:\s*hidden|pointer-events:\s*none|outline:\s*(none|0)\b/);
    for (const s of [".saved-exams-access button:focus-visible", ".saved-exams-heading > button:focus-visible", ".saved-exam-actions button:focus-visible"]) {
      expect(selectors.some(x => x.selector === s && /outline:\s*var\(--eb-focus-ring\)/.test(x.body)), s).toBe(true);
    }
  });
  it("the document tile is decoration only (empty content) and is never focusable or interactive", () => {
    const tile = selectors.find(s => s.selector === ".saved-exam-item::before")?.body ?? "";
    expect(tile).toMatch(/content:\s*""/);
    expect(sheet).not.toMatch(/cursor:\s*pointer/);
  });
  it("touch: every list action and access-bar button is a 44 px target", () => {
    expect(block("@media (pointer: coarse)")).toMatch(/\.saved-exams-access button, \.saved-exams-heading > button, \.saved-exam-actions button \{ min-height: 44px; \}/);
  });
  it("token-only colours, no physical margin / padding / border sides, reduced-motion fallbacks", () => {
    expect(sheet.replace(/\b(Canvas|CanvasText|ButtonText)\b/g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
    expect(sheet).not.toMatch(/(^|[;{\s])(margin|padding|border)-(left|right)\b|(^|[;{\s])(left|right)\s*:|text-align:\s*(left|right)/);
    const reduced = block("@media (prefers-reduced-motion: reduce)");
    const animated = selectors.filter(s => /transition:\s*(?!none)/.test(s.body)).map(s => s.selector.split(":")[0].trim());
    for (const sel of new Set(animated)) expect(reduced, sel).toContain(sel);
  });
});
