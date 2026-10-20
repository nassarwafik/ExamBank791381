// Phase UX-R0 — COLOUR RATCHET for the UX-R redesign. Every stylesheet's count of hard-coded colour literals (see
// scripts/ux-color-inventory.mjs) may only stay or go DOWN against scripts/ux-color-inventory.baseline.json, and a stylesheet
// that is not in the baseline must have none: new styling uses the --eb-* tokens, so the next token change reaches it. When a
// phase converts literals, it lowers the baseline with `node scripts/ux-color-inventory.mjs --write` in the same commit.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { BASELINE_FILE, countColorLiterals, inventory } from "./ux-color-inventory.mjs";

const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
const current = inventory();

describe("UX-R colour inventory — counter", () => {
  it("counts hex (3/4/6/8 digits) and rgb/rgba/hsl/hsla literals, ignores comments and token references", () => {
    const css = "/* was #64748b and rgb(1,2,3) */ .a{color:#fff;background:#0f172a80;border-color:#abcd}\n.b{box-shadow:0 1px 2px rgba(15,23,42,.05);color:hsl(0 0% 0%)}\n.c{color:var(--eb-ink);background:var(--eb-x, #123456)}";
    expect(countColorLiterals(css)).toBe(6);
    expect(countColorLiterals(".d{color:var(--eb-primary);grid-area:a1}")).toBe(0);
  });
  it("ignores a comment written inside a declaration value", () => {
    expect(countColorLiterals(".a{color:#fff /* was #64748b, then rgb(1,2,3) */;background:#000}")).toBe(2);
  });
  it("does not count id selectors, pseudo-classes or url fragments as colours", () => {
    expect(countColorLiterals("#root{margin:0} #add-button{width:1px} #fed:hover{top:0} .a:not(#fab){left:0} .b:hover #bad{top:0} .x{mask:url(#fade)} @media (min-width:1px){#bad{left:0}}")).toBe(0);
  });
  it("reads values inside nested at-rules and a last declaration without a semicolon", () => {
    expect(countColorLiterals("@media (max-width: 640px) { .a { color: #fff } .b { border: 1px solid rgba(0,0,0,.1); background: #000 } }")).toBe(3);
  });
});

describe("UX-R colour inventory — ratchet against the baseline", () => {
  it("the baseline total matches its per-file counts", () => {
    const sum = Object.values(baseline.files).reduce((s, n) => s + n, 0);
    expect(baseline.total).toBe(sum);
  });
  it("no stylesheet gained hard-coded colours", () => {
    const grew = Object.entries(current).filter(([f, n]) => f in baseline.files && n > baseline.files[f]).map(([f, n]) => f + ": " + baseline.files[f] + " → " + n);
    expect(grew, "use --eb-* tokens from src/design-tokens.css instead of colour literals").toEqual([]);
  });
  it("a stylesheet outside the baseline (a new one, or one already converted to zero) has no hard-coded colours", () => {
    const fresh = Object.entries(current).filter(([f, n]) => !(f in baseline.files) && n > 0).map(([f, n]) => f + ": " + n);
    expect(fresh, "new stylesheets use --eb-* tokens only").toEqual([]);
  });
});
