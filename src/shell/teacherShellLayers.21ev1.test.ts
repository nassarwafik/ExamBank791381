/// <reference types="node" />
// Phase 21E-V1 — teacher shell layer and focus guards (CSS is stubbed under Vitest, so these read the sheets from disk).
//
// 1. The teacher content column (`.eb-shell-main` / `<main id="eb-main" class="eb-shell-content">`) must NOT create a
//    stacking context. Pages render their own full-screen layers IN PLACE inside it — the Reader's presentation mode
//    (`.learning-reader.is-presentation`, fixed, --eb-z-modal) and its index drawer (`.learning-reader-drawer-root`, fixed,
//    z 50). A stacking context on the column traps those layers below the sticky sidebar (--eb-z-nav): on desktop the
//    sidebar painted over the full-screen presentation and stayed clickable (independent review of #316). Layout /
//    paint containment, transforms and filters would also make the column the containing block of `position: fixed`.
// 2. The sidebar's keyboard focus ring is drawn INSIDE the link: the scrolling `.eb-nav` (overflow-y: auto) clips
//    anything outside it, which cut the ring's sides (and the first link's top edge) off.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : cssFiles(p);
    return name.endsWith(".css") ? [p] : [];
  });
}

/** Innermost `selector { declarations }` blocks (rules nested in @media / @supports included). */
function rules(css: string): Array<{ selector: string; decls: string }> {
  const out: Array<{ selector: string; decls: string }> = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), decls: m[2] });
  return out;
}

/** Split on top-level commas / whitespace combinators (parentheses kept intact). */
function splitTop(s: string, sep: RegExp): string[] {
  const parts: string[] = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (depth === 0 && sep.test(ch)) { if (cur.trim()) parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// The compound that a selector finally styles (descendant rules such as `.eb-shell-content select` style the select).
const subject = (selector: string) => { const c = splitTop(selector, /[\s>+~]/); return c[c.length - 1] ?? ""; };
const CONTENT_COLUMN = /(?:\.eb-shell-content|\.eb-shell-main|#eb-main)(?![\w-])/;

/** Declarations that make an element a stacking context (or a containing block for fixed descendants). */
function stackingTriggers(decls: string): string[] {
  const found: string[] = [];
  for (const d of decls.split(";")) {
    const i = d.indexOf(":"); if (i < 0) continue;
    const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1).trim().toLowerCase();
    const is = (p: string, ok: (v: string) => boolean) => { if (prop === p && !ok(val)) found.push(prop + ": " + val); };
    is("isolation", v => v === "auto");
    is("z-index", v => v === "auto");
    is("position", v => v === "static" || v === "relative");
    for (const p of ["transform", "translate", "rotate", "scale", "filter", "backdrop-filter", "perspective", "clip-path", "mask", "mask-image"]) is(p, v => v === "none");
    is("opacity", v => Number(v) >= 1);
    is("mix-blend-mode", v => v === "normal");
    is("contain", v => !/\b(layout|paint|strict|content)\b/.test(v));
    is("container-type", v => v === "normal");
    is("will-change", v => !/\b(transform|opacity|filter|isolation|z-index|position|perspective|translate|rotate|scale)\b/.test(v));
  }
  return found;
}

describe("21E-V1 — the teacher content column never creates a stacking context", () => {
  it("no stylesheet gives .eb-shell-main / .eb-shell-content / #eb-main a stacking-context property", () => {
    const offenders: string[] = [];
    let styled = 0;
    for (const file of cssFiles(SRC)) {
      for (const { selector, decls } of rules(readFileSync(file, "utf8"))) {
        for (const sel of splitTop(selector, /,/)) {
          if (!CONTENT_COLUMN.test(subject(sel))) continue;
          styled++;
          for (const t of stackingTriggers(decls)) offenders.push(`${file.slice(SRC.length)} ${sel} → ${t}`);
        }
      }
    }
    expect(styled, "the guard must actually see the content-column rules").toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("the guard recognises the defect it exists for (and ignores descendant rules)", () => {
    expect(stackingTriggers("flex:1 1 auto; isolation: isolate")).toEqual(["isolation: isolate"]);
    expect(stackingTriggers("transform: translateZ(0); container-type: inline-size")).toHaveLength(2);
    expect(stackingTriggers("flex: 1 1 auto; min-width: 0; position: relative")).toEqual([]);
    expect(CONTENT_COLUMN.test(subject(".eb-shell-content select.student-status-select"))).toBe(false);
    expect(CONTENT_COLUMN.test(subject("@media (max-width: 1023px) .eb-shell .eb-shell-content"))).toBe(true);
  });

  it("the Reader's in-place full-screen layers sit above the sidebar's layer", () => {
    const tokens = read("design-tokens.css");
    const z = (name: string) => Number(tokens.match(new RegExp("--" + name + "\\s*:\\s*(\\d+)"))![1]);
    const reader = stripComments(read("learning/reader/reader.css"));
    const present = reader.match(/\.learning-reader\.is-presentation\s*\{([^}]*)\}/)![1];
    expect(present).toMatch(/position\s*:\s*fixed/);
    expect(present).toMatch(/z-index\s*:\s*var\(--eb-z-modal/);
    const drawerZ = Number(reader.match(/\.learning-reader-drawer-root\s*\{[^}]*z-index\s*:\s*(\d+)/)![1]);
    expect(z("eb-z-modal")).toBeGreaterThan(z("eb-z-drawer"));
    expect(drawerZ).toBeGreaterThan(z("eb-z-nav"));
  });
});

describe("21E-V1 — sidebar keyboard focus stays visible inside the scrolling navigation", () => {
  it(".eb-nav-link:focus-visible draws its ring inside the link (negative outline offset)", () => {
    const shell = stripComments(read("shell.css"));
    expect(shell).toMatch(/\.eb-nav:not\(\.eb-nav-footer\)\s*\{[^}]*overflow-y\s*:\s*auto/);   // the clipping container
    const focus = rules(shell).filter(r => splitTop(r.selector, /,/).includes(".eb-nav-link:focus-visible"));
    expect(focus.length).toBeGreaterThan(0);
    const last = focus[focus.length - 1].decls;
    expect(last).toMatch(/outline\s*:\s*2px\s+solid/);
    const offset = last.match(/outline-offset\s*:\s*(-?\d+)px/);
    expect(offset, "outline-offset must be set in px").not.toBeNull();
    expect(Number(offset![1])).toBeLessThanOrEqual(-2);
  });
});
