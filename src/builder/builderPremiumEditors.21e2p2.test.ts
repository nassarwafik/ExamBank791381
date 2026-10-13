/// <reference types="node" />
// Phase 21E.2 — Premium Visual Redesign, slice 2 (question editors). CSS is stubbed under Vitest, so these are structural guards
// on the sheet read from disk. Behaviour (stored answers shown, choosing / adding options, no overflow, one-line option rows,
// 44 px answer targets on touch) is certified in real Chromium by scripts/capture-visual-gate-21e2p2.mjs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const root = process.cwd();
const raw = readFileSync(path.join(root, "src", "builder", "builder-premium-editors.css"), "utf8");
const sheet = raw.replace(/\/\*[\s\S]*?\*\//g, "");
const slice1 = readFileSync(path.join(root, "src", "builder", "builder-premium.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readFileSync(path.join(root, "src", "design-tokens.css"), "utf8");

function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ selector: m[1].replace(/^[\s\S]*\{/, "").replace(/@[^{]*$/, "").trim(), body: m[2] });
  return out;
}
const all = rules(sheet);
/** Split a selector list at TOP-LEVEL commas only (`:is(th, td)` stays one selector). */
const splitList = (list: string) => { const out: string[] = []; let depth = 0, cur = "";
  for (const ch of list) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim()); return out; };
const block = (query: string) => { const i = sheet.indexOf(query); if (i < 0) return ""; const open = sheet.indexOf("{", i); let depth = 0;
  for (let k = open; k < sheet.length; k++) { if (sheet[k] === "{") depth++; else if (sheet[k] === "}" && --depth === 0) return sheet.slice(open + 1, k); } return ""; };
const token = (name: string) => { const m = tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")); if (!m) throw new Error("token " + name); return m[1]; };
const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("21E.2 premium slice 2 — loaded through the slice 1 sheet, no component edited", () => {
  it("builder-premium.css @imports the editors sheet before any rule (an @import after a rule is dropped by the browser)", () => {
    const firstRule = slice1.search(/[^\s;]+[^{};]*\{/);
    const imp = slice1.indexOf('@import "./builder-premium-editors.css"');
    expect(imp).toBeGreaterThan(-1);
    expect(imp).toBeLessThan(firstRule);
  });
  it("every rule is scoped to question bodies inside the builder (.sb-builder .sb-q-body)", () => {
    for (const r of all) for (const sel of splitList(r.selector)) expect(sel, sel).toMatch(/^\.sb-builder \.sb-q-body\b/);
  });
});

describe("21E.2 premium slice 2 — the correct answer is marked by form and colour, legibly", () => {
  it("the chosen answer pill and its row change border AND background (not colour alone), and the row badge fills", () => {
    const pill = all.find(r => r.selector === ".sb-builder .sb-q-body .sb-radio:has(input:checked)");
    expect(pill?.body).toMatch(/border-color:\s*var\(--eb-success\)/);
    expect(pill?.body).toMatch(/background:\s*var\(--eb-success-bg\)/);
    expect(pill?.body).toMatch(/font-weight:\s*var\(--eb-fw-bold\)/);
    const row = all.find(r => r.selector === ".sb-builder .sb-q-body .sb-option-row:has(.sb-radio input:checked)");
    expect(row?.body).toMatch(/box-shadow:\s*0 0 0 1px var\(--eb-success\)/);
    expect(all.some(r => r.selector.includes(".sb-option-row:has(.sb-radio input:checked)::before") && /background:\s*var\(--eb-success-tx\)/.test(r.body))).toBe(true);
  });
  it("success text meets 4.5:1 on its tint and on white; the badge text meets 4.5:1 on the success fill", () => {
    expect(contrast(token("eb-success-tx"), token("eb-success-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("eb-success-tx"), token("eb-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("eb-surface"), token("eb-success-tx"))).toBeGreaterThanOrEqual(4.5);
  });
  it("answer table cells carry a non-colour cue (an inset top edge; a Highlight border in forced colours)", () => {
    expect(all.find(r => r.selector === ".sb-builder .sb-q-body .sb-grid td.sb-cell-answer")?.body).toMatch(/box-shadow:\s*inset 0 3px 0 var\(--eb-success\)/);
    expect(block("@media (forced-colors: active)")).toMatch(/td\.sb-cell-answer[^}]*border-block-start:\s*3px solid Highlight/);
  });
});

describe("21E.2 premium slice 2 — never hides or clips, keeps focus and touch rules", () => {
  it("never hides, clips or removes a control", () => {
    expect(sheet).not.toMatch(/display:\s*none|visibility:\s*hidden|overflow\s*:\s*(hidden|clip)|pointer-events:\s*none/);
    expect(sheet).not.toMatch(/outline:\s*(none|0)\b/);
  });
  it("keeps a visible focus indicator for the answer pills (whose native radio sits inside a label) and the buttons", () => {
    expect(all.find(r => r.selector === ".sb-builder .sb-q-body .sb-radio:has(input:focus-visible)")?.body).toMatch(/outline:\s*var\(--eb-focus-ring\)/);
    expect(all.find(r => r.selector === ".sb-builder .sb-q-body .sb-btn:focus-visible")?.body).toMatch(/outline:\s*var\(--eb-focus-ring\)/);
  });
  it("the generated option number is border-box (content-box padding pushed «×» onto a second line at 390 px)", () => {
    const badge = all.find(r => r.selector.includes(".sb-option-row::before") && r.selector.includes(".sb-field-index"));
    expect(badge?.body).toMatch(/box-sizing:\s*border-box/);
  });
  it("on touch every answer pill and in-question button is a 44 px target", () => {
    const coarse = block("@media (pointer: coarse)");
    expect(coarse).toMatch(/\.sb-builder \.sb-q-body \.sb-radio \{ min-height: 44px; \}/);
    expect(coarse).toMatch(/\.sb-builder \.sb-q-body \.sb-btn \{ min-height: 44px; \}/);
  });
  it("token-only, logical properties only", () => {
    expect(sheet.replace(/\b(Highlight|CanvasText)\b/g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/);
    expect(sheet).not.toMatch(/(^|[;{\s])(margin|padding|border)-(left|right)\b|(^|[;{\s])(left|right)\s*:|text-align:\s*(left|right)/);
  });
  it("every transition has a prefers-reduced-motion fallback", () => {
    const reduced = block("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toMatch(/transition:\s*none/);
    const animated = all.filter(r => /transition:\s*(?!none)/.test(r.body)).flatMap(r => splitList(r.selector).map(s => s.split(":")[0].trim()));
    for (const sel of new Set(animated)) expect(reduced, sel).toContain(sel);
  });
});
