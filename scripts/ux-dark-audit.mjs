#!/usr/bin/env node
// UX-R18b — STATIC DARK-MODE AUDIT of the stylesheets (docs/enterprise-ux-r0-redesign-foundation.md R18b). A colour written as a
// literal does not follow the light-dark() tokens of design-tokens-dark.css, so in the dark theme it can leave a light island (a
// light background), unreadable text (dark text on the dark page, or white text on a token fill that turns light) or a bright
// hairline. This script finds every such declaration and checks that the sheet answers it with a dark rule: the same selector
// under :root[data-theme="dark"], setting the same property from tokens. Literals that read the same in both themes (a saturated
// fill with white text, a dark shadow) need nothing. UX-R18c: neither do a selector rooted in a light island (the exam paper, the
// 3D scene) nor a declaration a later rule of the same sheet overrides with tokens (it never renders).
//   node scripts/ux-dark-audit.mjs                 → the unanswered declarations of every sheet under src/, grouped by sheet
// The guards are src/designSystem/darkSheets.ux-r18b.test.ts (every sheet in DARK_SCOPE has no unanswered declaration) and
// darkSheets.ux-r18c.test.ts (the scope is every sheet; the islands; no sheet follows the device's colour scheme).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DARK = ':root[data-theme="dark"]';
/** UX-R18c — the form every dark answer takes: :where() adds no specificity, so the answer beats the literal it answers (the same
 *  selector, later in its sheet) and still loses to whatever overrides that selector in light (a later sheet, a more specific rule). */
export const DARK_WHERE = ":where(" + DARK + ")";
/** The selector a dark rule answers ("" when the selector is not a dark rule). */
export const darkBase = s => (s.startsWith(DARK_WHERE + " ") ? s.slice(DARK_WHERE.length + 1) : s.startsWith(DARK + " ") ? s.slice(DARK.length + 1) : "");
const isDark = s => s.startsWith(DARK) || s.startsWith(DARK_WHERE);

/** Every stylesheet under src/ (UX-R18c: the dark look is done everywhere; R18b covered the teacher's pages and the builder). */
export const DARK_SCOPE = (function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir).sort()) { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) walk(p, out); else if (n.endsWith(".css")) out.push(path.relative(ROOT, p).split(path.sep).join("/")); }
  return out;
})(path.join(ROOT, "src"));

// ---- colour maths ----
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FN = /\b(?:rgba?|hsla?)\([^)]*\)/g;
function parseColor(c) {
  c = c.trim().toLowerCase();
  if (c[0] === "#") {
    let h = c.slice(1); if (h.length <= 4) h = [...h].map(x => x + x).join("");
    const n = parseInt(h.slice(0, 6), 16); const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(c); if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean).map(p => (p.endsWith("%") ? parseFloat(p) * (m[1].startsWith("h") ? 1 : 2.55) : parseFloat(p)));
  if (m[1].startsWith("rgb")) return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  const [h, s, l] = [parts[0], parts[1] / 100, parts[2] / 100], k = n => (n + h / 30) % 12, f = n => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: parts[3] ?? 1 };
}
export function luminance({ r, g, b }) { return [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
// Named colours (the colour inventory counts #hex and functions only, so a «white» escaped it): the basic keywords and the pale ones.
const NAMED = { white: "#ffffff", black: "#000000", silver: "#c0c0c0", gray: "#808080", grey: "#808080", red: "#ff0000", green: "#008000", blue: "#0000ff", orange: "#ffa500", yellow: "#ffff00", purple: "#800080",
  whitesmoke: "#f5f5f5", snow: "#fffafa", ghostwhite: "#f8f8ff", aliceblue: "#f0f8ff", ivory: "#fffff0", gainsboro: "#dcdcdc", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", beige: "#f5f5dc", linen: "#faf0e6", azure: "#f0ffff", honeydew: "#f0fff0", mintcream: "#f5fffa", lavender: "#e6e6fa" };
const NAMED_RE = new RegExp("(?<![\\w-])(" + Object.keys(NAMED).join("|") + ")(?![\\w-])", "gi");
const literalsOf = v => { const s = v.replace(/var\(\s*--[\w-]+\s*,[^()]*(\([^()]*\))?[^()]*\)/g, "").replace(/var\(\s*--[\w-]+\s*\)/g, ""); return [...s.matchAll(new RegExp(HEX.source + "|" + FN.source, "g"))].map(m => parseColor(m[0])).concat([...s.matchAll(NAMED_RE)].map(m => parseColor(NAMED[m[1].toLowerCase()]))).filter(Boolean); };

// ---- a small CSS rule reader (comments removed; nested @media / @supports kept as context) ----
export function parseRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = []; const stack = []; let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const head = buf.trim(); buf = "";
      if (head.startsWith("@")) { stack.push(head); continue; }
      const end = text.indexOf("}", i); const body = text.slice(i + 1, end); i = end;
      const decls = [];
      for (const d of body.split(";")) { const k = d.indexOf(":"); if (k > 0) decls.push({ prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim() }); }
      rules.push({ selectors: head.split(",").map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean), decls, context: stack.join(" ") });
    } else if (ch === "}") { stack.pop(); buf = ""; }
    else buf += ch;
  }
  return rules;
}

const FAMILY = p => (p === "background" || p === "background-color" || p === "background-image" ? "background"
  : p === "color" ? "color" : /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(p) || p === "outline" || p === "outline-color" ? "border"
  : p === "fill" ? "fill" : p === "stroke" ? "stroke" : null);
// Selectors rooted in a light island (design-tokens-dark.css: the exam paper and its previews) render light by design: no answer needed.
export const ISLAND = /^(\.eb-light-island|\.interactive-exam-page|\.iex-navigator|\.exam-presentation|\.exam-theme-[\w-]+)(?![\w-])/;
// The parts of the 3D viewer's scene (.i3d-scene is an island): drawn only inside it.
export const ISLAND_PARTS = /^\.i3d-(bg|face|line|line-crease|line-silhouette|edge-target|edge-hit|vertex-target)(?![\w-])/;
const INK_MIX = /color-mix\(in srgb,\s*var\(--eb-(content-ink|navy|navy-2|ink|text|text-heading)\)/;
// Token labels that turn DARK in dark (the page grounds: a light label on a coloured fill in light).
const DARKENING_LABEL = /var\(--eb-(surface|surface-2|bg|bg-tint)\)/;
// Token backgrounds that turn LIGHT in dark (white text on them becomes unreadable there).
const LIGHTENING_FILL = /var\(--eb-(primary|primary-strong|navy|navy-2|ink|text|text-heading|content-accent|content-accent-strong|chrome-text)\)/;

/** Why a declaration needs a dark answer, or null. */
export function needOf(rule, decl) {
  const fam = FAMILY(decl.prop); if (!fam) return null;
  const cols = literalsOf(decl.value).filter(c => c.a >= 0.35); if (!cols.length) return null;
  const L = cols.map(luminance);
  if (fam === "background") {
    if (L.some(l => l >= 0.45)) return "light background";
    // a dark literal fill under a token label that turns dark in dark (white-on-colour in light, dark-on-dark in dark)
    return rule.decls.some(d => d.prop === "color" && DARKENING_LABEL.test(d.value)) ? "dark fill under a label that turns dark" : null;
  }
  if (fam === "border") return L.some(l => l >= 0.55) ? "light line" : null;
  if (fam === "fill" || fam === "stroke") return L.some(l => l >= 0.6) ? "light " + fam : L.some(l => l <= 0.08) ? "dark " + fam : null;
  // text: dark text vanishes on the dark page; white text vanishes on a token fill that turns light
  if (L.some(l => l <= 0.2)) {
    const bg = rule.decls.find(d => FAMILY(d.prop) === "background");
    const bgLits = bg ? literalsOf(bg.value) : [];
    if (bgLits.length && bgLits.every(c => luminance(c) >= 0.45) && rule.decls.some(d => FAMILY(d.prop) === "background" && needOf(rule, d))) return "dark text";   // answered with its background
    if (bgLits.length && bgLits.every(c => luminance(c) < 0.45)) return null;                                                                                          // dark literal fill: reads the same
    return "dark text";
  }
  if (L.some(l => l >= 0.7)) { const bg = rule.decls.find(d => FAMILY(d.prop) === "background"); return bg && LIGHTENING_FILL.test(bg.value) ? "white text on a fill that turns light" : null; }
  return null;
}

/** The declarations of one sheet that need a dark answer and have none. */
export function auditSheet(css) {
  const rules = parseRules(css);
  const answered = new Set();
  for (const r of rules) for (const s of r.selectors) if (darkBase(s)) for (const d of r.decls) { if (FAMILY(d.prop)) answered.add(darkBase(s) + "|" + FAMILY(d.prop)); if (d.prop === "background-image" || d.prop === "background") answered.add(darkBase(s) + "|background"); }
  // A declaration a LATER top-level rule of the same sheet overrides (the same selector, the same property family, tokens only)
  // never renders in either theme: superseded[selector|family] = the index of the last such rule.
  const superseded = new Map();
  rules.forEach((r, i) => { if (r.context || r.selectors.some(isDark)) return; for (const d of r.decls) if (FAMILY(d.prop) && !literalsOf(d.value).length) for (const s of r.selectors) superseded.set(s + "|" + FAMILY(d.prop), i); });
  const open = [];
  for (const [i, r] of rules.entries()) {
    if (r.selectors.some(isDark)) continue;
    if (/\bprint\b/.test(r.context)) continue;                                   // print is always light
    for (const d of r.decls) {
      // a shadow mixed from the heading ink glows in dark (that ink turns light): shadows read --eb-scrim, which stays dark
      if (d.prop === "box-shadow" && INK_MIX.test(d.value)) { open.push({ selectors: r.selectors, prop: d.prop, value: d.value, need: "shadow mixed from an ink that turns light", context: r.context }); continue; }
      const need = needOf(r, d); if (!need) continue;
      const missing = r.selectors.filter(s => !ISLAND.test(s) && !ISLAND_PARTS.test(s) && !answered.has(s + "|" + FAMILY(d.prop)) && !(superseded.get(s + "|" + FAMILY(d.prop)) > i));
      if (missing.length) open.push({ selectors: missing, prop: d.prop, value: d.value, need, context: r.context });
    }
  }
  return open;
}

/** Every dark rule of a sheet sets its colours from tokens only (no literal, so the colour inventory never grows). */
export function darkRuleLiterals(css) {
  return parseRules(css).filter(r => r.selectors.some(isDark)).flatMap(r => r.decls.filter(d => FAMILY(d.prop) && literalsOf(d.value).length).map(d => r.selectors[0] + " { " + d.prop + ": " + d.value + " }"));
}

/** UX-R18c — the dark rules of a sheet not written in the :where() form (they would outrank the light theme's own overrides). */
export function darkRulesNotWhere(css) {
  return parseRules(css).flatMap(r => r.selectors.filter(s => s.startsWith(DARK + " ")));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = DARK_SCOPE;
  let total = 0;
  for (const f of files) {
    const open = auditSheet(fs.readFileSync(path.join(ROOT, f), "utf8")); total += open.length;
    if (!open.length) continue;
    console.log("\n" + f + " — " + open.length);
    for (const o of open) console.log("  " + o.need.padEnd(38) + o.selectors.join(", ").slice(0, 90) + "  { " + o.prop + ": " + o.value.slice(0, 60) + " }" + (o.context ? "  @" + o.context.slice(0, 40) : ""));
  }
  console.log("\n" + total + " unanswered in " + files.length + " sheets");
}
