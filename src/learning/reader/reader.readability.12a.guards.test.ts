/// <reference types="node" />
// Phase 12A — READER READABILITY guards (structural assertions on reader.css / visuals.css, read from disk because
// CSS is stubbed under Vitest). The Reader owns ONE typography scale (--eb-read-*): a clearly larger body, a
// comfortable line height, a three-level coloured heading system under the page title, labelled tinted callouts,
// roomier tables and lists, a bounded measure for prose-like blocks on desktop, and presentation mode never smaller
// than the normal Reader. The phone baseline / desktop-block contracts of reader.layout.guards.test.ts still hold.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const css = readFileSync(fileURLToPath(new URL("./reader.css", import.meta.url)), "utf8");
const visuals = readFileSync(fileURLToPath(new URL("../visuals/visuals.css", import.meta.url)), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
/** The (first) rule body whose selector list is exactly `selector`, whitespace-stripped. */
function rule(text: string, selector: string): string {
  const i = text.indexOf(selector + "{");
  if (i < 0) return "";
  return noSpaces(text.slice(i + selector.length + 1, text.indexOf("}", i)));
}
function mediaBlock(text: string, query: string): string {
  const start = text.indexOf("@media " + query);
  if (start < 0) return "";
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i); }
  return "";
}
const desktop = mediaBlock(css, "(min-width: 1024px)");
const base = rule(css, ".learning-reader");
const px = (body: string, token: string) => Number(body.match(new RegExp(token.replace(/[-]/g, "\\-") + ":(\\d+)px"))?.[1]);

describe("the Reader typography scale", () => {
  it("is defined ONCE on .learning-reader (phone/tablet) and stepped up in the desktop block; the body is clearly larger than the old 16px", () => {
    expect(px(base, "--eb-read-fs-body")).toBeGreaterThanOrEqual(18);
    expect(px(rule(desktop, ".learning-reader"), "--eb-read-fs-body")).toBeGreaterThan(px(base, "--eb-read-fs-body"));
    expect(base).toContain("--eb-read-lh:1.85");
    expect(px(base, "--eb-read-fs-title")).toBeGreaterThanOrEqual(26);
    expect(px(base, "--eb-read-fs-title-desktop")).toBeGreaterThanOrEqual(32);
    // a strictly descending heading scale under the title, each step ≥ the body
    const [h3, h4, h5, body] = ["--eb-read-fs-h3", "--eb-read-fs-h4", "--eb-read-fs-h5", "--eb-read-fs-body"].map(t => px(base, t));
    expect(h3).toBeGreaterThan(h4); expect(h4).toBeGreaterThan(h5); expect(h5).toBeGreaterThanOrEqual(body);
    expect(px(base, "--eb-read-fs-title")).toBeGreaterThan(h3);
    // tables / code / small text never fall back to the 12–13px of the old scale
    for (const t of ["--eb-read-fs-table", "--eb-read-fs-code", "--eb-read-fs-small"]) expect(px(base, t)).toBeGreaterThanOrEqual(15);
    expect(px(base, "--eb-read-fs-meta")).toBeGreaterThanOrEqual(14);
  });
  it("prose, callouts, examples, lists, tables and code all read from the scale (no hard-coded 12–14px token left on them)", () => {
    const content = [".learning-reader-text", ".learning-reader-callout-body", ".learning-reader-callout-label", ".learning-reader-example-steps",
      ".learning-reader-example-prompt,.learning-reader-example-result", ".learning-reader-list-text", ".learning-reader-list-term", ".learning-reader-table",
      ".learning-reader-code code", ".learning-reader-context", ".learning-reader-kicker", ".learning-reader-source", ".learning-reader-caption",
      ".learning-reader-state-text", ".learning-reader-training-note", ".learning-reader-training-label", ".learning-reader-practice-hint", ".learning-reader-toc-page"];
    for (const sel of content) {
      const body = sel.includes(",") ? noSpaces(css.slice(css.indexOf(sel.replace(/,/g, ", ")), css.indexOf("}", css.indexOf(sel.replace(/,/g, ", "))))) : rule(css, sel);
      expect(body, sel).not.toBe("");
      expect(body, sel).toMatch(/var\(--eb-read-fs-/);
      expect(body, sel).not.toMatch(/--eb-fs-1[2-6]\b/);
    }
    expect(rule(css, ".learning-reader-text")).toContain("line-height:var(--eb-read-lh)");
    expect(rule(css, ".learning-reader-callout-body")).toContain("font-size:var(--eb-read-fs-body)");   // same size as the prose around it
    expect(rule(css, ".learning-reader-blocks")).toContain("gap:var(--eb-read-gap)");
  });
});

describe("visual hierarchy — page title and three heading levels, coloured and distinct (never colour-only)", () => {
  it("the page title carries a primary accent bar; the kicker is coloured; the head has a tinted rule", () => {
    const title = rule(css, ".learning-reader-page-title");
    expect(title).toContain("font-size:var(--eb-read-fs-title)");
    expect(title).toContain("border-inline-start:5pxsolidvar(--eb-read-accent)");
    expect(rule(css, ".learning-reader-kicker")).toContain("color:var(--eb-read-accent-strong)");
    expect(rule(css, ".learning-reader-pagehead")).toContain("border-block-end:2pxsolidvar(--eb-primary-100)");
    expect(rule(desktop, ".learning-reader-page-title")).toContain("font-size:var(--eb-read-fs-title-desktop)");
  });
  it("level 2 = accent bar + primary colour, level 3 = deep-blue with underline, level 4 = navy semibold — different size, colour AND shape", () => {
    const l2 = rule(css, ".learning-reader-heading.is-level-2"), l3 = rule(css, ".learning-reader-heading.is-level-3"), l4 = rule(css, ".learning-reader-heading.is-level-4");
    expect(l2).toContain("font-size:var(--eb-read-fs-h3)"); expect(l2).toContain("color:var(--eb-read-accent-strong)"); expect(l2).toContain("border-inline-start:4pxsolidvar(--eb-read-accent)");
    expect(l3).toContain("font-size:var(--eb-read-fs-h4)"); expect(l3).toContain("color:var(--eb-read-accent-2)"); expect(l3).toContain("border-block-end:2pxsolidvar(--eb-read-accent-2-bg)");
    expect(l4).toContain("font-size:var(--eb-read-fs-h5)"); expect(l4).toContain("color:var(--eb-text-heading)"); expect(l4).toContain("font-weight:var(--eb-fw-semibold)");
    expect(new Set([l2, l3, l4]).size).toBe(3);
    // the accents resolve to real app tokens (no new raw colours)
    expect(base).toContain("--eb-read-accent:var(--eb-primary)");
    expect(base).toContain("--eb-read-accent-2:var(--eb-info-tx)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b(?![^{]*\*\/)/i);   // reader.css declares no raw hex colour (tokens only)
  });
  it("list titles use the sub-heading language; the RTL logical properties are used (no left/right)", () => {
    expect(rule(css, ".learning-reader-list-title")).toContain("color:var(--eb-read-accent-2)");
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(padding|margin|border)-(left|right)\s*:/);
  });
});

describe("containers — callouts, examples, enrichment, training", () => {
  it("every callout kind has a tint, a 4px accent bar and a label colour of its own; the body is the Reader body size", () => {
    const box = rule(css, ".learning-reader-callout");
    expect(box).toContain("padding:var(--eb-space-4)"); expect(box).toContain("border-inline-start:4pxsolid"); expect(box).toContain("border-radius:var(--eb-r-lg)");
    const labels = ["remember", "important", "warning", "tip"].map(k => rule(css, `.learning-reader-callout.kind-${k} .learning-reader-callout-label`));
    for (const l of labels) expect(l).toMatch(/^color:var\(--eb-(info|primary|warn|success)[-a-z]*\);$/);
    expect(new Set(labels).size).toBe(4);
    for (const k of ["remember", "important", "warning", "tip", "summary"]) expect(rule(css, ".learning-reader-callout.kind-" + k), k).toContain("border-inline-start-color:");
    expect(rule(css, ".learning-reader-callout-label")).toContain("font-size:var(--eb-read-fs-label)");
  });
  it("an example is its own green-accented card, distinct from the blue enrichment surface and from callouts", () => {
    const ex = rule(css, ".learning-reader-example");
    expect(ex).toContain("border-inline-start:4pxsolidvar(--eb-success)"); expect(ex).toContain("padding:var(--eb-space-4)"); expect(ex).toContain("border-radius:var(--eb-r-lg)");
    expect(rule(css, ".learning-reader-example-kicker")).toContain("color:var(--eb-success-tx)");
    expect(rule(css, ".learning-reader-block.is-enrichment")).toContain("border-inline-start:4pxsolidvar(--eb-primary)");
    expect(rule(css, ".learning-reader-block.is-enrichment")).toContain("padding:var(--eb-space-4)");
    expect(rule(css, ".learning-reader-training")).toContain("padding:var(--eb-space-4)");
    expect(rule(css, ".learning-reader-training.is-available")).toContain("border-inline-start-color:var(--eb-primary-strong)");
  });
  it("tables: larger cells, a tinted header row and zebra rows; only the wrapper scrolls (unchanged)", () => {
    expect(rule(css, ".learning-reader-table")).toContain("font-size:var(--eb-read-fs-table)");
    expect(rule(css, ".learning-reader-table th, .learning-reader-table td")).toContain("padding:var(--eb-space-3)var(--eb-space-4)");
    expect(rule(css, ".learning-reader-table th")).toContain("background:var(--eb-primary-050)");
    expect(rule(css, ".learning-reader-table tbody tr:nth-child(even) td")).toContain("background:var(--eb-surface-2)");
    expect(rule(css, ".learning-reader-tablewrap")).toContain("overflow-x:auto");
  });
});

describe("desktop measure and presentation minimums", () => {
  it("on desktop, prose-LIKE blocks get a bounded measure while tables, the cards grid and visuals keep the canvas", () => {
    const capped = noSpaces(desktop).match(/\.learning-reader-callout,\.learning-reader-example,[^{]*\{max-inline-size:var\(--eb-read-measure-wide\);\}/)?.[0] ?? "";
    expect(capped).not.toBe("");
    for (const s of [".learning-reader-callout", ".learning-reader-example", ".learning-reader-practice", ".learning-reader-training", ".learning-reader-list.variant-plain", ".learning-reader-list.variant-checklist", ".learning-reader-list.variant-ordered", ".learning-reader-block.is-enrichment:not(.is-selfframed)"]) expect(capped).toContain(s);
    for (const s of [".learning-reader-tablewrap", ".learning-reader-table", ".variant-cards", ".eb-visual", ".learning-reader-blocks", ".learning-reader-pagebody"]) expect(capped).not.toContain(s);
    expect(base).toContain("--eb-read-measure-wide:92ch");
    expect(rule(desktop, ".learning-reader-text")).toContain("max-inline-size:var(--eb-measure,72ch)");   // the prose measure contract is untouched
  });
  // (The presentation typography contract is verified numerically, per category and per width, in the next describe.)
});

// ── Presentation typography contract (independent-review fix) ─────────────────────────────────────────────────────
// "Presentation never reads smaller than normal reading" is checked the way a browser would decide it, not by reading
// the first number of a clamp(): a mini-cascade parses reader.css into rules (with their @media conditions), picks the
// WINNING font-size for each text category (highest specificity, then last in source order — so a grouped or generic
// presentation selector is judged exactly like a per-category one), resolves var() against the Reader tokens as they
// stand at that width (the ≥1024px block steps them up), and evaluates clamp()/max()/min()/calc() with px and vw at many
// viewport widths. Each category is compared with ITSELF in normal mode at the same width.
type CssRule = { selectors: string[]; decls: Map<string, string>; minWidth: number; applies: boolean; order: number };
function parseRules(text: string): CssRule[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: CssRule[] = [];
  let order = 0;
  const walk = (s: string, minWidth: number, applies: boolean) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf("{", i);
      if (open < 0) break;
      const header = s.slice(i, open).trim();
      let depth = 0, close = open;
      for (; close < s.length; close++) { if (s[close] === "{") depth++; else if (s[close] === "}" && --depth === 0) break; }
      const body = s.slice(open + 1, close);
      if (header.startsWith("@media")) {
        const mw = header.match(/^@media\s*\(min-width:\s*(\d+)px\)$/);
        walk(body, mw ? Number(mw[1]) : minWidth, applies && !!mw);   // any other media feature (reduced-motion…) is not typography
      } else if (header.startsWith("@")) {
        /* @keyframes etc. — no font sizes */
      } else {
        const decls = new Map<string, string>();
        for (const d of body.split(";")) { const c = d.indexOf(":"); if (c > 0) decls.set(d.slice(0, c).trim(), d.slice(c + 1).trim()); }
        out.push({ selectors: header.split(",").map(x => x.trim().replace(/\s+/g, " ")), decls, minWidth, applies, order: order++ });
      }
      i = close + 1;
    }
  };
  walk(src, 0, true);
  return out;
}
const specificity = (sel: string) => sel.split(" ").reduce((n, part) => n + (part.match(/\.[\w-]+/g)?.length ?? 0) * 100 + (/^[a-z]/.test(part) ? 1 : 0), 0);
/** The winning value of `prop` among rules that match one of `selectors` and apply at width `w` (cascade order). */
function winning(rules: CssRule[], selectors: string[], prop: string, w: number): string | undefined {
  let best: { spec: number; order: number; value: string } | undefined;
  for (const r of rules) {
    if (!r.applies || w < r.minWidth || !r.decls.has(prop)) continue;
    for (const sel of r.selectors) {
      if (!selectors.includes(sel)) continue;
      const cand = { spec: specificity(sel), order: r.order, value: r.decls.get(prop)! };
      if (!best || cand.spec > best.spec || (cand.spec === best.spec && cand.order > best.order)) best = cand;
    }
  }
  return best?.value;
}
const globalTokens = new Map<string, string>();
for (const m of readFileSync(fileURLToPath(new URL("../../design-tokens.css", import.meta.url)), "utf8").matchAll(/(--eb-[\w-]+)\s*:\s*([^;]+);/g)) globalTokens.set(m[1], m[2].trim());
/** Evaluate a CSS length expression to px at viewport width `w`; var() resolves against the Reader root at `w`. */
function evalPx(rules: CssRule[], expr: string, w: number, roots: string[]): number {
  let e = expr, guard = 0;
  while (/var\(/.test(e)) {
    if (++guard > 50) throw new Error("var() cycle in " + expr);
    e = e.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\)/, (_, name: string, fallback?: string) => {
      const v = winning(rules, roots, name, w) ?? globalTokens.get(name) ?? fallback;
      if (v === undefined) throw new Error("unresolved " + name + " in " + expr);
      return v;
    });
  }
  const js = e
    .replace(/\bcalc\(/g, "(")
    .replace(/\bclamp\(/g, "__clamp(")
    .replace(/\b(max|min)\(/g, "Math.$1(")
    .replace(/(\d*\.?\d+)vw\b/g, (_, n: string) => `(${n}*${w / 100})`)
    .replace(/(\d*\.?\d+)px\b/g, "$1");
  if (!/^[\d\s.+\-*/(),]*$/.test(js.replace(/Math\.(max|min)|__clamp/g, ""))) throw new Error("unsupported CSS expression: " + expr + " → " + js);
  return new Function("__clamp", "return " + js)((lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi))) as number;
}
const P = ".learning-reader.is-presentation";
/** Text categories Phase 12A enlarged, with the selectors that can set their size in NORMAL mode. */
const CATEGORIES: Record<string, string[]> = {
  "page title": [".learning-reader-page-title"],
  "paragraph": [".learning-reader-text"],
  "heading level 2": [".learning-reader-heading", ".learning-reader-heading.is-level-2"],
  "heading level 3": [".learning-reader-heading", ".learning-reader-heading.is-level-3"],
  "heading level 4": [".learning-reader-heading", ".learning-reader-heading.is-level-4"],
  "callout body": [".learning-reader-callout-body"],
  "list text": [".learning-reader-list-text"],
  "table": [".learning-reader-table"],
  "code": [".learning-reader-code code"],
};
const WIDTHS = [320, 390, 600, 768, 1000, 1023, 1024, 1100, 1280, 1366, 1440, 1920, 2560, 3840];
/** Font size (px) of a category at width `w`, normal or presentation. Presentation adds the prefixed selectors. */
function sizeOf(rules: CssRule[], category: string, w: number, presentation: boolean): number {
  const sels = CATEGORIES[category];
  const all = presentation ? [...sels, ...sels.map(s => P + " " + s)] : sels;
  const v = winning(rules, all, "font-size", w);
  if (!v) throw new Error("no font-size for " + category);
  return evalPx(rules, v, w, presentation ? [".learning-reader", P] : [".learning-reader"]);
}
const RULES = parseRules(css);
const shrinks = (rules: CssRule[], category: string) =>
  WIDTHS.filter(w => sizeOf(rules, category, w, true) < sizeOf(rules, category, w, false) - 1e-9)
    .map(w => `${w}px: ${sizeOf(rules, category, w, true).toFixed(2)} < ${sizeOf(rules, category, w, false).toFixed(2)}`);

describe("presentation typography — never smaller than normal reading, per category, at every width", () => {
  it("the checker itself is sound: it evaluates clamp/max/vw/var, honours the ≥1024px token step and picks the cascade winner", () => {
    const tiny = parseRules(".learning-reader{ --x:18px; } .a{ font-size:clamp(20px, 0.8vw + 14px, 30px); } .b.c{ font-size:max(var(--x), 1vw); } .b{ font-size:99px; } @media (min-width: 1024px){ .learning-reader{ --x:19px; } }");
    expect(evalPx(tiny, winning(tiny, [".a"], "font-size", 390)!, 390, [".learning-reader"])).toBe(20);
    expect(evalPx(tiny, winning(tiny, [".a"], "font-size", 1920)!, 1920, [".learning-reader"])).toBeCloseTo(29.36, 5);
    expect(evalPx(tiny, winning(tiny, [".b", ".b.c"], "font-size", 390)!, 390, [".learning-reader"])).toBe(18);     // .b.c beats a later .b
    expect(evalPx(tiny, winning(tiny, [".b", ".b.c"], "font-size", 1024)!, 1024, [".learning-reader"])).toBe(19);   // token stepped at 1024
    expect(evalPx(tiny, winning(tiny, [".b", ".b.c"], "font-size", 2560)!, 2560, [".learning-reader"])).toBeCloseTo(25.6, 5);
  });

  it("the Reader tokens really do step up at ≥1024px, so the widths above AND below the step are both exercised", () => {
    for (const t of ["--eb-read-fs-body", "--eb-read-fs-card", "--eb-read-fs-h3", "--eb-read-fs-h4", "--eb-read-fs-h5", "--eb-read-fs-table", "--eb-read-fs-title"]) {
      const below = evalPx(RULES, `var(${t})`, 1023, [".learning-reader"]), above = evalPx(RULES, `var(${t})`, 1024, [".learning-reader"]);
      expect(above, t).toBeGreaterThan(below);
    }
    // and normal-mode sizes follow them (the checker compares against these, not against base-only values)
    expect(sizeOf(RULES, "paragraph", 1024, false)).toBeGreaterThan(sizeOf(RULES, "paragraph", 1023, false));
    expect(sizeOf(RULES, "page title", 1024, false)).toBe(32);
    expect(sizeOf(RULES, "heading level 2", 1024, false)).toBe(24);
  });

  for (const category of Object.keys(CATEGORIES)) {
    it(`${category}: presentation ≥ normal at every width from 320 to 3840px`, () => {
      expect(shrinks(RULES, category)).toEqual([]);
    });
  }

  it("presentation keeps the three heading levels DISTINCT and ordered (title > level 2 > level 3 > level 4) at every width", () => {
    for (const w of WIDTHS) {
      const [t, l2, l3, l4] = ["page title", "heading level 2", "heading level 3", "heading level 4"].map(c => sizeOf(RULES, c, w, true));
      expect(t, `${w}px title>L2`).toBeGreaterThan(l2);
      expect(l2, `${w}px L2>L3`).toBeGreaterThan(l3);
      expect(l3, `${w}px L3>L4`).toBeGreaterThan(l4);
      expect(l4, `${w}px L4≥paragraph`).toBeGreaterThanOrEqual(sizeOf(RULES, "paragraph", w, true));
    }
  });

  it("presentation still GROWS with the screen (a projector-sized page reads larger than normal reading in every category)", () => {
    for (const category of Object.keys(CATEGORIES)) expect(sizeOf(RULES, category, 1920, true), category).toBeGreaterThan(sizeOf(RULES, category, 1920, false));
  });

  it("regression fixture: the reviewed-HEAD presentation rules (one generic heading clamp, a 17px callout floor) are caught", () => {
    const reviewed = css.slice(0, css.indexOf("/* ---------- Presentation mode")) +
      `${P} .learning-reader-heading{ font-size:clamp(20px, 0.8vw + 14px, 30px); }
       ${P} .learning-reader-callout-body, ${P} .learning-reader-list-text, ${P} .learning-reader-table{ font-size:clamp(17px, 0.5vw + 13px, 21px); }` +
      css.slice(css.indexOf("@media (min-width: 1024px)"));
    const old = parseRules(reviewed);
    expect(shrinks(old, "heading level 2")).toContain("390px: 20.00 < 22.00");
    expect(shrinks(old, "callout body")).toContain("390px: 17.00 < 18.00");
    // and the generic clamp flattens the levels on a wide screen
    expect(sizeOf(old, "heading level 2", 1920, true)).toBe(sizeOf(old, "heading level 4", 1920, true));
  });
});

describe("visual figure chrome reads from the same scale", () => {
  it("the figure title / caption use the Reader label / small sizes with safe fallbacks; the figure has roomier padding", () => {
    expect(rule(visuals, ".eb-visual-title")).toContain("font-size:var(--eb-read-fs-label,16px)");
    expect(rule(visuals, ".eb-visual-caption")).toContain("font-size:var(--eb-read-fs-small,15px)");
    expect(rule(visuals, ".eb-visual-figure")).toContain("padding:var(--eb-space-4)");
  });
});
