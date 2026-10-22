/// <reference types="node" />
// Phase UX-R1 — guards of the redesign palette (docs/enterprise-ux-r0-redesign-foundation.md §3.1).
//  1. The approved values are what design-tokens.css ships (pins: a value change is a design decision, made here on purpose).
//  2. The pairs the redesign relies on meet WCAG AA: text on the deep purple primary and on its hover step, link text on the
//     primary tints, placeholder text, and the dark rail's labels (the rail stays dark until R2).
//  3. No stylesheet still RENDERS the old blue primary family. A literal written as the fallback of a variable that IS defined
//     (`var(--eb-primary, #2563eb)`) never renders and is allowed; a bare literal, or the fallback of a variable that nothing
//     defines (`var(--accent, #1d4ed8)`), renders and fails. Documented exceptions: the function-graph content palette, the
//     reader's light island inside its dark theme (R9b) and the exam presentation presets.
//  4. Every var(--eb-*) read without a fallback in any stylesheet is defined (an undefined var() silently drops the declaration;
//     R1 adds --eb-primary-200 / -300 and --eb-nav-accent). Seven reads were already undefined at the R0 baseline; they are
//     listed by name with the phase that fixes them, and the list may only shrink.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(css|tsx?)$/.test(name)) out.push(full);
  }
  return out;
};
const all = files(SRC).map(f => ({ file: relative(SRC, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));
const sheets = all.filter(f => f.file.endsWith(".css")).map(f => ({ ...f, text: f.text.replace(/\/\*[\s\S]*?\*\//g, "") }));
const tokens = sheets.find(s => s.file === "design-tokens.css")!.text;
const hex = (name: string) => {
  const m = new RegExp("--eb-" + name + ":\\s*(#[0-9a-fA-F]{6})\\b").exec(tokens);
  if (!m) throw new Error("--eb-" + name + " is not a literal hex colour");
  return m[1].toLowerCase();
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("UX-R1 — approved palette (pins)", () => {
  const APPROVED: Record<string, string> = {
    primary: "#2a0a4e", "primary-strong": "#4a2380", "primary-050": "#f3effa", "primary-100": "#ebe5f4", "primary-200": "#d9cfea", "primary-300": "#8b74b8",
    navy: "#1c1330", ink: "#241b38", text: "#2d2740", muted: "#5f5a6e", placeholder: "#6c6879", faint: "#a9a5b4",
    line: "#e9e8ee", "line-2": "#dedce6", bg: "#f7f6fa", surface: "#ffffff", "surface-2": "#f5f4f8", "nav-bg": "#1c1330", "nav-accent": "#b9a3e3",
  };
  for (const [name, value] of Object.entries(APPROVED)) it(`--eb-${name} is ${value}`, () => expect(hex(name)).toBe(value));
  it("radius scale is the flat one (controls 6 px, cards 8 px)", () => {
    expect(tokens).toMatch(/--eb-r-sm:\s*6px;\s*--eb-r:\s*8px;/);
  });
});

describe("UX-R1 — contrast of the pairs the redesign relies on (WCAG AA)", () => {
  const AA = 4.5;
  it("white text on the primary and on its hover step", () => {
    expect(ratio("#ffffff", hex("primary"))).toBeGreaterThanOrEqual(AA);
    expect(ratio("#ffffff", hex("primary-strong"))).toBeGreaterThanOrEqual(AA);
  });
  it("primary and primary-strong as link text on white and on both primary tints", () => {
    for (const fg of ["primary", "primary-strong"]) for (const bg of ["surface", "bg", "primary-050", "primary-100"]) expect(ratio(hex(fg), hex(bg)), fg + " on " + bg).toBeGreaterThanOrEqual(AA);
  });
  it("placeholder text on white and on the hover fill", () => {
    expect(ratio(hex("placeholder"), hex("surface"))).toBeGreaterThanOrEqual(AA);
    expect(ratio(hex("placeholder"), hex("surface-2"))).toBeGreaterThanOrEqual(AA);
  });
  it("the dark rail: labels ≥ 7:1, secondary labels and the accent ≥ AA on both ends of its gradient", () => {
    for (const bg of ["nav-bg", "navy-2"]) {
      expect(ratio(hex("nav-text"), hex(bg)), "nav-text on " + bg).toBeGreaterThanOrEqual(7);
      expect(ratio(hex("nav-text-muted"), hex(bg)), "nav-text-muted on " + bg).toBeGreaterThanOrEqual(AA);
      expect(ratio(hex("nav-accent"), hex(bg)), "nav-accent on " + bg).toBeGreaterThanOrEqual(AA);
    }
  });
  it("the hover step stays visibly distinct from the primary (a hover that cannot be seen is no hover)", () => {
    expect(ratio(hex("primary"), hex("primary-strong"))).toBeGreaterThanOrEqual(1.4);
  });
});

describe("UX-R1 — no stylesheet renders the old blue primary family", () => {
  const OLD = "#(?:2563eb|1d4ed8|1e40af|1e3a8a|1f4fb0|eef4ff|eff6ff|e4edfc|dbeafe|bfdbfe|93c5fd|60a5fa|3b82f6)(?![\\w-])|rgba?\\(\\s*(?:37\\s*,\\s*99\\s*,\\s*235|59\\s*,\\s*130\\s*,\\s*246|29\\s*,\\s*78\\s*,\\s*216)\\s*,[^)]*\\)";
  const EXCEPTIONS = [/^functionGraphs\/function-graph\.css$/, /^learning\/reader\/reader-enterprise-l1\.css$/, /^presentation\//, /^design-tokens\.css$/];
  const defined = new Set<string>();
  for (const f of all) for (const m of f.text.matchAll(f.file.endsWith(".css") ? /(--[\w-]+)\s*:/g : /["'](--[\w-]+)["']\s*[:\]]/g)) defined.add(m[1]);
  it("bare literals and fallbacks of undefined variables are gone (fallbacks of defined variables never render)", () => {
    const offenders: string[] = [];
    for (const s of sheets) {
      if (EXCEPTIONS.some(r => r.test(s.file))) continue;
      for (const m of s.text.matchAll(new RegExp("(var\\(\\s*(--[\\w-]+)\\s*,\\s*)?(" + OLD + ")", "gi"))) {
        if (m[1] && defined.has(m[2])) continue;
        offenders.push(s.file + ": " + m[0]);
      }
    }
    expect(offenders, "use --eb-primary / -strong / -050 / -100 / -200 / -300").toEqual([]);
  });
});

describe("UX-R1 — every --eb-* token read without a fallback is defined", () => {
  // Pre-existing at the R0 baseline 56ce097 (the declaration is dropped today); each is fixed by the phase that owns the page,
  // which then removes it here. The list may only shrink.
  const KNOWN_UNDEFINED = new Set([
    "learning/activities/activities.css: --eb-fs-18",  // R9b
    "projects/performance.css: --eb-fs-15",            // R10
    "projects-pro.css: --eb-fs-15",                    // R10
    "studentexam-pro.css: --eb-text-muted",            // R15
    "studentexam-pro.css: --eb-fs-sm",                 // R15
  ]);
  it("no stylesheet reads an undefined --eb-* token beyond the recorded pre-existing ones", () => {
    const definedEb = new Set<string>();
    for (const s of sheets) for (const m of s.text.matchAll(/(--eb-[\w-]+)\s*:/g)) definedEb.add(m[1]);
    for (const f of all.filter(f => !f.file.endsWith(".css"))) for (const m of f.text.matchAll(/["'](--eb-[\w-]+)["']\s*[:\]]/g)) definedEb.add(m[1]);
    const missing = new Set<string>();
    for (const s of sheets) for (const m of s.text.matchAll(/var\((--eb-[\w-]+)\s*\)/g)) if (!definedEb.has(m[1])) missing.add(s.file + ": " + m[1]);
    expect([...missing].filter(x => !KNOWN_UNDEFINED.has(x)), "define the token in design-tokens.css").toEqual([]);
    expect([...KNOWN_UNDEFINED].filter(x => !missing.has(x)), "fixed — remove it from KNOWN_UNDEFINED").toEqual([]);
  });
});
