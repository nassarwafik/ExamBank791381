/// <reference types="node" />
// UX-R18a — the dark half of every colour token (docs/enterprise-ux-r0-redesign-foundation.md R18a). These guards pin:
//  1. design-tokens-dark.css loads right after design-tokens.css, and its light-dark() block sits inside @supports, so a browser
//     without light-dark() keeps the light values (an unsupported light-dark() would otherwise blank every colour it reaches).
//  2. The LIGHT half of each redeclared token is exactly the value design-tokens.css ships: the light theme renders as before.
//  3. Every colour token design-tokens.css defines with a literal has a dark half, except the set kept in both themes on purpose.
//  4. The theme: light by default, dark only for data-theme="dark" (owner decision: one toggle between dark and normal, the
//     device's preference not followed), light in print and in a light island.
//  5. In dark, every pair the light palette checks holds (text AA, the chrome's ink ≥ 7:1, strokes ≥ 3:1), with the roles kept:
//     the secondary steps are dimmer than the text, the primary carries the page-ground colour as its label.
//  6. The colour inventory counts neither token file.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (f: string) => readFileSync(join(SRC, f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim().toLowerCase();
const light = strip(read("design-tokens.css"));
const darkSrc = strip(read("design-tokens-dark.css"));

/** The first declaration of each token in a text. */
const decls = (text: string) => { const out = new Map<string, string>(); for (const m of text.matchAll(/(--eb-[\w-]+)\s*:\s*([^;]+);/g)) if (!out.has(m[1])) out.set(m[1], m[2].trim()); return out; };
const lightTokens = decls(light);
const supports = /@supports \(color: light-dark\(#000, #fff\)\) \{([\s\S]*)\}\s*$/.exec(darkSrc);
const darkTokens = decls(supports ? supports[1] : "");

/** Replace each light-dark(a, b) by a (light) or b (dark); commas inside rgba() stay. */
function project(value: string, half: 0 | 1): string {
  let out = "", i = 0;
  while (i < value.length) {
    const at = value.indexOf("light-dark(", i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let depth = 0, j = at + "light-dark(".length, start = j; const parts: string[] = [];
    for (; j < value.length; j++) {
      const c = value[j];
      if (c === "(") depth++;
      else if (c === ")") { if (depth === 0) break; depth--; }
      else if (c === "," && depth === 0) { parts.push(value.slice(start, j)); start = j + 1; }
    }
    parts.push(value.slice(start, j));
    out += parts[half].trim(); i = j + 1;
  }
  return out;
}
/** A token's value in one theme, aliases followed (var(--eb-x) → x's value in that theme). */
function themed(name: string, half: 0 | 1, depth = 0): string {
  const raw = darkTokens.get("--eb-" + name) ?? lightTokens.get("--eb-" + name);
  if (!raw) throw new Error("--eb-" + name + " undefined");
  const v = project(raw, half).trim(); const ref = /^var\(--eb-([\w-]+)\)$/.exec(v);
  return (ref && depth < 4 ? themed(ref[1], half, depth + 1) : v).toLowerCase();
}
const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dark = (n: string) => { const v = themed(n, 1); if (!/^#[0-9a-f]{6}$/.test(v)) throw new Error("--eb-" + n + " dark is not a hex colour: " + v); return v; };

// Kept in both themes on purpose: the dark rail / toast surfaces and their labels (already dark), the inverse focus ring (white on
// a dark surface) and the medal accents (the same metals in both themes).
const KEPT = new Set(["--eb-nav-bg", "--eb-nav-text", "--eb-nav-text-muted", "--eb-nav-hover", "--eb-nav-border", "--eb-focus-ring-inverse", "--eb-medal-gold", "--eb-medal-silver", "--eb-medal-bronze"]);

describe("UX-R18a — the dark token file", () => {
  it("loads right after design-tokens.css", () => {
    expect(read("main.tsx")).toContain("import './design-tokens.css'\nimport './design-tokens-dark.css'\n");
  });

  it("redeclares the colour tokens only inside @supports (color: light-dark(…)), each as light-dark(<light>, <dark>)", () => {
    expect(supports, "the @supports block").not.toBeNull();
    expect(darkTokens.size).toBeGreaterThan(30);
    for (const [name, value] of darkTokens) expect(value, name).toContain("light-dark(");
    expect(decls(darkSrc.replace(supports![0], "")).size, "no token outside @supports").toBe(0);
  });

  it("the light half of every redeclared token is exactly what design-tokens.css ships", () => {
    for (const [name, value] of darkTokens) {
      expect(lightTokens.has(name), name + " is not a design-tokens.css token").toBe(true);
      expect(norm(project(value, 0)), name).toBe(norm(lightTokens.get(name)!));
    }
  });

  it("every colour token written with a literal has a dark half, except the set kept in both themes", () => {
    const literal = [...lightTokens].filter(([, v]) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(v)).map(([n]) => n);
    expect(literal.length).toBeGreaterThan(40);
    expect(literal.filter(n => !darkTokens.has(n) && !KEPT.has(n)), "give it a dark half (or keep it on purpose)").toEqual([]);
    expect([...KEPT].filter(n => darkTokens.has(n)), "a kept token has a dark half — remove it from KEPT").toEqual([]);
  });
});

describe("UX-R18a — the theme", () => {
  const flat = darkSrc.replace(/\s+/g, " ");
  it("is light by default and dark only for data-theme=\"dark\" (owner decision: the device's own preference is not followed)", () => {
    expect(flat).toContain(":root { color-scheme: light; }");
    expect(flat).toContain(':root[data-theme="dark"] { color-scheme: dark; }');
    expect(flat).not.toContain("prefers-color-scheme");
  });
  it("is light in print and inside a light island", () => {
    expect(flat).toMatch(/@media print \{ :root\[data-theme\] \{ color-scheme: light; \} \}/);
    expect(flat).toContain(".eb-light-island { color-scheme: light; }");
  });
});

describe("UX-R18a — dark contrast: every pair the light palette checks", () => {
  const AA = 4.5;
  it("the primary carries the button label (--eb-surface) and both primary steps read as link text on every ground", () => {
    for (const p of ["primary", "primary-strong"]) expect(ratio(dark("surface"), dark(p)), "surface on " + p).toBeGreaterThanOrEqual(AA);
    for (const fg of ["primary", "primary-strong"]) for (const bg of ["surface", "surface-2", "bg", "primary-050", "primary-100"]) expect(ratio(dark(fg), dark(bg)), fg + " on " + bg).toBeGreaterThanOrEqual(AA);
    expect(ratio(dark("primary"), dark("primary-strong")), "the hover step is visible").toBeGreaterThanOrEqual(1.4);
    for (const bg of ["surface", "surface-2", "bg"]) expect(ratio(dark("primary"), dark(bg)), "focus ring on " + bg).toBeGreaterThanOrEqual(3);
  });
  it("text tokens on the grounds; the heading ink ≥ 7:1", () => {
    for (const bg of ["bg", "surface", "surface-2"]) {
      expect(ratio(dark("navy"), dark(bg)), "navy on " + bg).toBeGreaterThanOrEqual(7);
      for (const fg of ["ink", "text"]) expect(ratio(dark(fg), dark(bg)), fg + " on " + bg).toBeGreaterThanOrEqual(AA);
    }
    for (const bg of ["surface", "surface-2"]) expect(ratio(dark("placeholder"), dark(bg)), "placeholder on " + bg).toBeGreaterThanOrEqual(AA);
  });
  it("muted is AA on every ground and tint, dimmer than the text and brighter than faint (the roles of 21E.1 F6, in dark)", () => {
    for (const bg of ["bg", "bg-tint", "surface", "surface-2", "primary-050", "primary-100", "success-bg", "warn-bg", "danger-bg", "info-bg"]) expect(ratio(dark("muted"), dark(bg)), "muted on " + bg).toBeGreaterThanOrEqual(AA);
    expect(lum(dark("muted"))).toBeLessThan(lum(dark("text")));
    expect(ratio(dark("muted"), dark("text"))).toBeGreaterThanOrEqual(1.3);
    expect(lum(dark("muted"))).toBeGreaterThan(lum(dark("faint")));
  });
  it("the chrome (UX-R2): its ink ≥ 7:1 and its secondary text AA on the bar, the hover, the active pill and the search field", () => {
    for (const bg of ["chrome-bg", "chrome-hover", "chrome-active", "chrome-field"]) {
      expect(ratio(dark("chrome-text"), dark(bg)), "chrome-text on " + bg).toBeGreaterThanOrEqual(7);
      expect(ratio(dark("chrome-text-muted"), dark(bg)), "chrome-text-muted on " + bg).toBeGreaterThanOrEqual(AA);
    }
  });
  it("the content family (UX-R16a): text AA on every content ground, the axis ≥ 3:1, the control colour AAA with the ground as its label", () => {
    for (const bg of ["surface", "content-ground", "content-ground-2"]) {
      for (const fg of ["content-ink", "content-text", "content-muted"]) expect(ratio(dark(fg), dark(bg)), fg + " on " + bg).toBeGreaterThanOrEqual(AA);
      expect(ratio(dark("content-axis"), dark(bg)), "axis on " + bg).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(dark("content-accent"), dark("surface"))).toBeGreaterThanOrEqual(7);
  });
  it("status: each text colour AA on its tint and on the surface; each fill ≥ 3:1 on the surface", () => {
    for (const s of ["success", "warn", "danger", "info"]) {
      expect(ratio(dark(s + "-tx"), dark(s + "-bg")), s + "-tx on " + s + "-bg").toBeGreaterThanOrEqual(AA);
      expect(ratio(dark(s + "-tx"), dark("surface")), s + "-tx on surface").toBeGreaterThanOrEqual(AA);
      expect(ratio(dark(s), dark("surface")), s + " on surface").toBeGreaterThanOrEqual(3);
    }
  });
});

describe("UX-R18a — the capture harness", () => {
  it("THEME=dark stores the dark choice and sets <html data-theme=\"dark\"> before the app starts (light by default)", () => {
    const h = readFileSync(join(SRC, "..", "scripts", "capture-visual-baseline-ux-r.mjs"), "utf8");
    expect(h).toContain('const theme = process.env.THEME === "dark" ? "dark" : "light";');
    expect(h).toContain('try { localStorage.setItem("examBankTheme", "dark"); } catch {}');
    expect(h).toContain('const set = () => document.documentElement.setAttribute("data-theme", "dark");');
  });
});

describe("UX-R18a — the colour inventory", () => {
  it("counts neither token file (literals are their job)", () => {
    expect(readFileSync(join(SRC, "..", "scripts", "ux-color-inventory.mjs"), "utf8")).toContain('export const TOKEN_FILES = new Set(["src/design-tokens.css", "src/design-tokens-dark.css"]);');
  });
});
