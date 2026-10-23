// UX-R17c — the remaining legacy sheets on the purple-neutral palette, and the dead CSS (docs/enterprise-ux-r0-redesign-foundation.md
// R17c). Presentation only. These guards pin that the chrome sheets hold no slate, grey or white literal and no legacy-alias fallback;
// that every var() a stylesheet reads is defined (an undefined read renders its fallback, or drops the declaration) beyond a recorded
// list that may only shrink; that every custom property a stylesheet defines is read somewhere; that the focus rings these sheets draw
// meet 3:1; and that the shades that carry meaning, the reader's inverse labels and the student's exam placeholder did not move.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (s: string) => strip(s).replace(/\s+/g, " ");
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SOURCES = walk(path.join(process.cwd(), "src")).filter(f => /\.(css|tsx?|mjs|js)$/.test(f) && !/\.test\./.test(f))
  .map(f => ({ file: path.relative(path.join(process.cwd(), "src"), f).split(path.sep).join("/"), text: strip(readFileSync(f, "utf8")) }));
const CSS = SOURCES.filter(s => s.file.endsWith(".css"));

/** The chrome sheets R17c moves onto the palette (the editor and review surroundings, the old page parts, small shared sheets). */
const CHROME = ["governance/reviewInbox.css", "presets/presetLibrary.css", "questionTypes/questionTypes.css", "smartsim/smartsim.css", "page-parts.css",
  "messages/messages.css", "project794589.css", "review-pro.css", "review-workspace.css", "notifications/notifications.css"];
/** Kept on purpose: the student exam's unsupported-activity placeholder (the exam paper, R15). */
const KEPT = /\.iex-/;
const chrome = (s: string) => s.split("}").filter(r => r.includes("{") && !KEPT.test(r.slice(0, r.indexOf("{")))).join("}");
const hex6 = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h).toLowerCase();
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const isNeutral = (h: string) => {
  const [r, g, b] = rgb(h); const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  if ((mx - mn) * 255 < 6) return true;
  return b >= g && g >= r && (mx - mn) / (1 - Math.abs(2 * l - 1)) <= 0.5;
};
const lum = (h: string) => { const [r, g, b] = rgb(h).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Every custom property the app defines: a declaration in a stylesheet, or a name a script sets (a quoted "--name" literal). */
const DEFINED = new Set<string>();
for (const s of CSS) for (const m of s.text.matchAll(/(--[\w-]+)\s*:/g)) DEFINED.add(m[1]);
for (const s of SOURCES.filter(x => !x.file.endsWith(".css"))) for (const m of s.text.matchAll(/["'`](--[\w-]+)["'`]/g)) DEFINED.add(m[1]);
/** The exam presentation's --xp-* tokens are written at run time from the preset tables (presentationModel.ts builds the names). */
const RUNTIME = /^--xp-/;
const rootValue = (name: string): string => {
  const v = flat(read("src", "design-tokens.css")).match(new RegExp("(?:^|[;{ ])" + name + ":\\s*([^;]+);"))![1].trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/); return ref ? rootValue(ref[1]) : v;
};

describe("UX-R17c — the chrome sheets", () => {
  it("hold no slate, grey or white literal (fallbacks included) outside the exam's placeholder", () => {
    for (const f of CHROME) {
      const s = chrome(flat(read("src", ...f.split("/"))));
      const lits = (s.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(hex6);
      expect(lits.filter(isNeutral), f).toEqual([]);
      expect(s, f).not.toMatch(/rgba?\(\s*(15,\s*23,\s*42|255,\s*255,\s*255)\s*[,)]/);
    }
  });

  it("read the palette directly: no legacy alias with a literal fallback, no accent or focus variable that nothing defines", () => {
    for (const f of [...CHROME, "functionStudy/function-study.css"]) {
      expect(read("src", ...f.split("/")), f).not.toMatch(/var\(\s*--(line|line2|surface|surface2|surface-2|muted|accent[\w-]*|focus)\s*,/);
    }
  });

  // The inbox page's own rule (R11a, `.gov-inbox …`) already drew the grey pill; the base rule and the workflow step (also drawn by the
  // builder's governance panel, where the indigo fallback rendered) read undefined accent variables.
  it("the review inbox's selected tab is the grey pill and the current workflow step is marked in the primary", () => {
    const s = flat(read("src", "governance", "reviewInbox.css"));
    expect(s).toContain('.gov-inbox-tab[aria-selected="true"]{background:var(--eb-chrome-active);border-color:var(--eb-line-2);color:var(--eb-text-heading);font-weight:700}');
    expect(s).toContain(".gov-workflow li.is-current{border-color:var(--eb-primary);box-shadow:inset 3px 0 0 var(--eb-primary)}");
  });

  it("the focus rings of the question-type picker and the simulation drop zone meet 3:1 on white (WCAG 1.4.11)", () => {
    const resolve = (v: string): string => {
      const m = v.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/); if (!m) return v.trim();
      if (DEFINED.has(m[1])) return resolve(rootValue(m[1]));
      return resolve(m[2] ?? "");
    };
    const ringColour = (sheet: string, sel: string) => {
      const s = flat(read("src", ...sheet.split("/"))); const i = s.indexOf(sel + "{"); expect(i, sel).toBeGreaterThan(-1);
      const outline = s.slice(i, s.indexOf("}", i)).match(/outline:\s*([^;}]+)/)![1];
      return resolve(resolve(outline).split(/\s+/).pop()!);
    };
    for (const [sheet, sel] of [["questionTypes/questionTypes.css", ".qt-tab:focus-visible,.qt-card:focus-visible"], ["smartsim/smartsim.css", ".smartsim-drop:focus-visible"]]) {
      const c = ringColour(sheet, sel); expect(c, sel).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ratio(c, "#ffffff"), sel + " ring " + c).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("UX-R17c — dead CSS", () => {
  // Pre-existing undefined reads that belong to another open phase or need a design decision; the list may only shrink.
  // R17d collapsed the seven reads in structured-builder.css and defined --eb-fs-15 / --eb-fs-18; only the reader's contract is left.
  const KNOWN = new Set([
    "learning/reader/reader.css: --eb-measure",            // the prose measure contract, pinned by the reader guards
  ]);
  it("every var() a stylesheet reads is defined (outside the exam's run-time --xp-* tokens and the recorded list)", () => {
    const missing = new Set<string>();
    for (const s of CSS) for (const m of s.text.matchAll(/var\(\s*(--[\w-]+)/g)) if (!DEFINED.has(m[1]) && !RUNTIME.test(m[1])) missing.add(s.file + ": " + m[1]);
    expect([...missing].filter(x => !KNOWN.has(x)), "define it, or write the value it renders").toEqual([]);
    expect([...KNOWN].filter(x => !missing.has(x)), "fixed — remove it from KNOWN").toEqual([]);
  });

  it("every custom property a stylesheet defines is read somewhere (the dark rail's accent and 23 unused aliases are gone)", () => {
    const all = SOURCES.map(s => s.text).join("\n");
    const unread: string[] = [];
    for (const name of new Set(CSS.flatMap(s => [...s.text.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map(m => m[1])))) {
      const esc = name.replace(/[-]/g, "\\-");
      const reads = (all.match(new RegExp(esc + "(?![\\w-])", "g")) || []).length - (all.match(new RegExp(esc + "\\s*:", "g")) || []).length;
      if (reads <= 0) unread.push(name);
    }
    expect(unread).toEqual([]);
    expect(read("src", "design-tokens.css")).not.toMatch(/--eb-nav-accent\s*:/);
  });
});

describe("UX-R17c — what did not move", () => {
  it("the function-study widget: its content draws on the content tokens; the curve and the markers keep their hues (the dark look follows the switch since UX-R18c)", () => {
    const s = flat(read("src", "functionStudy", "function-study.css"));
    expect(s).toContain(".fnstudy-axis { stroke: var(--eb-content-muted); stroke-width: 1.5; }");
    expect(s).toContain(".fnstudy-note { margin: 0; color: var(--eb-content-muted); font-size: 0.92rem; }");
    expect(s).toContain(".fnstudy-curve { fill: none; stroke: #1d6fd6;");
    expect(s).toContain(".fnstudy-marker { fill: #c0392b; stroke: var(--eb-surface);");
    expect(s).toContain('.fnstudy-formula code { padding: 2px 6px; border-radius: 6px; background: var(--eb-content-ground); }');   // flips with the theme
  });

  it("the learning activities keep white labels on the primary (the reader's dark theme redefines --eb-surface)", () => {
    expect(flat(read("src", "learning", "activities", "activities.css"))).toContain(".learning-osi-layer.is-active .learning-osi-number{ background:var(--eb-primary); color:#fff; }");
    expect(flat(read("src", "learning", "reader", "reader-enterprise-l1.css"))).toMatch(/--eb-surface: var\(--eb-read-dark-surface\)/);
  });

  it("the status shades keep their hue and value, and the exam's placeholder keeps its literals", () => {
    expect(flat(read("src", "smartsim", "smartsim.css"))).toContain(".smartsim-error{border:1px solid #f3b4b4;background:#fff5f5;");
    expect(flat(read("src", "review-workspace.css"))).toContain(".rv-status.is-partial{ background:#f5f3ff; color:#5b21b6; border-color:#c4b5fd; }");
    expect(flat(read("src", "questionTypes", "questionTypes.css"))).toMatch(/\.iex-unsupported \{[^}]*border: 1px dashed #c9c9c9;[^}]*background: #f7f7f7;/);
  });

  it("the colour baseline: the converted sheets well below their old counts", () => {
    const base = JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files as Record<string, number>;
    const before: Record<string, number> = { "governance/reviewInbox.css": 32, "presets/presetLibrary.css": 10, "questionTypes/questionTypes.css": 23, "smartsim/smartsim.css": 22,
      "page-parts.css": 12, "functionStudy/function-study.css": 34, "project794589.css": 8, "review-pro.css": 11 };
    for (const [f, n] of Object.entries(before)) expect(base["src/" + f] ?? 0, f).toBeLessThan(n * 0.75);
    for (const f of ["page-parts.css", "messages/messages.css", "notifications/notifications.css"]) expect(base["src/" + f] ?? 0, f).toBe(0);
  });
});
