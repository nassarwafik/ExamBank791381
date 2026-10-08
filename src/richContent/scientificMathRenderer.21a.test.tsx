// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { render, cleanup } from "@testing-library/react";
import RichMath from "./RichMath";
import * as M from "./richMath";
import { MATH_FEATURES } from "./mathFeatures";
import { oldGrammarCandidates } from "./testing/mathCorpus";

// Phase 21A — the MathML renderer for Scientific Math v2. React builds every element from the CLOSED AST: grids are real MathML tables
// (mtable / mtr / mtd), fences are fixed code-owned characters per environment, no source text ever names an element or an attribute.
// Fail-first on 60ddadc: no mtable support. The OLD-GRAMMAR renderer freeze (digest of the rendered MathML for the 20D.1 corpus) was
// captured on 60ddadc (CAPTURE_21A_RENDER=1) and must not move: 21A is expansion, not restyling.
afterEach(cleanup);
const here = path.dirname(fileURLToPath(import.meta.url));
const mathOf = (source: string, display = false) => { const { container } = render(<RichMath source={source} display={display} />); return container; };
const ARABIC = /[\u0590-\u08FF]/;
const ELEMENTS = new Set(["math", "mrow", "mi", "mn", "mo", "mtext", "mfrac", "msqrt", "mroot", "msub", "msup", "msubsup", "mover", "mspace", "mtable", "mtr", "mtd"]);
const ATTRIBUTES = new Set(["class", "dir", "alttext", "display", "mathvariant", "largeop", "width", "accent", "fence", "stretchy", "columnalign"]);

describe("21A-R1 grids render as MathML tables with fixed code-owned fences", () => {
  it("matrix → mtable / mtr / mtd with the exact shape; no HTML table, div or span inside math", () => {
    const c = mathOf("\\begin{matrix} a & b & c \\\\ d & e & f \\end{matrix}");
    const t = c.querySelector("math mtable")!;
    expect(t).toBeTruthy();
    expect([...t.querySelectorAll(":scope > mtr")].map(r => r.querySelectorAll(":scope > mtd").length)).toEqual([3, 3]);
    expect(t.querySelector("mtr > mtd > mrow > mi")!.textContent).toBe("a");
    expect(c.querySelector("math table, math div, math span, math tr, math td")).toBeNull();
  });
  it("pmatrix ( ), bmatrix [ ], vmatrix | |, Vmatrix ‖ ‖ — fences are mo[fence][stretchy] siblings around the mtable", () => {
    for (const [env, open, close] of [["pmatrix", "(", ")"], ["bmatrix", "[", "]"], ["vmatrix", "|", "|"], ["Vmatrix", "‖", "‖"]]) {
      const c = mathOf(`\\begin{${env}} a & b \\\\ c & d \\end{${env}}`);
      const t = c.querySelector("mtable")!;
      const prev = t.previousElementSibling!, next = t.nextElementSibling!;
      expect([prev.tagName.toLowerCase(), prev.textContent, prev.getAttribute("fence"), prev.getAttribute("stretchy")], env).toEqual(["mo", open, "true", "true"]);
      expect([next.tagName.toLowerCase(), next.textContent, next.getAttribute("fence")], env).toEqual(["mo", close, "true"]);
    }
    const plain = mathOf("\\begin{matrix} a \\end{matrix}").querySelector("mtable")!;
    expect(plain.previousElementSibling).toBeNull();
    expect(plain.nextElementSibling).toBeNull();
  });
  it("cases: a fixed left brace { and NO right fence; left-aligned columns; aligned: right / left column alignment", () => {
    const t = mathOf("f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}").querySelector("mtable")!;
    expect([t.previousElementSibling!.tagName.toLowerCase(), t.previousElementSibling!.textContent]).toEqual(["mo", "{"]);
    expect(t.nextElementSibling).toBeNull();
    expect(t.getAttribute("columnalign")).toBe("left left");
    expect(t.getAttribute("class")).toBe("xp-math-cases");
    const a = mathOf("\\begin{aligned} V &= IR \\\\ &= 5 \\end{aligned}").querySelector("mtable")!;
    expect(a.getAttribute("columnalign")).toBe("right left");
    expect(a.getAttribute("class")).toBe("xp-math-aligned");
    expect(a.querySelectorAll("mtr")[1].querySelectorAll("mtd")).toHaveLength(2);                                  // the empty continuation lhs is a real cell
  });
  it("number sets and multiple integrals render as fixed characters", () => {
    expect(mathOf("\\mathbb{R}").querySelector("mi")!.textContent).toBe("ℝ");
    const op = mathOf("\\iint_{D} f \\, dA").querySelector("mo")!;
    expect([op.textContent, op.getAttribute("largeop")]).toEqual(["∬", "true"]);
  });
});

describe("21A-R2 RTL / LTR and accessibility", () => {
  it("math is an LTR element with the exact source as alttext (multi-line sources included); display math is display=block", () => {
    const src = "\\begin{aligned}\nV &= IR \\\\\nP &= VI\n\\end{aligned}";
    const m = mathOf(src, true).querySelector("math")!;
    expect([m.getAttribute("dir"), m.getAttribute("display"), m.getAttribute("alttext")]).toEqual(["ltr", "block", src]);
  });
  it("Arabic \\text gets its natural RTL direction; Latin \\text keeps none; identifiers are never RTL", () => {
    const c = mathOf("\\text{السرعة} = \\frac{d}{t}");
    const t = c.querySelector("mtext")!;
    expect([t.textContent, t.getAttribute("dir")]).toEqual(["السرعة", "rtl"]);
    expect(mathOf("\\text{if } x").querySelector("mtext")!.getAttribute("dir")).toBeNull();
    for (const mi of c.querySelectorAll("mi")) expect(mi.getAttribute("dir")).toBeNull();
    const cases = mathOf("\\begin{cases} x^2 & \\text{إذا كان } x \\ge 0 \\\\ -x & \\text{إذا كان } x < 0 \\end{cases}");
    expect([...cases.querySelectorAll("mtext")].map(m => m.getAttribute("dir"))).toEqual(["rtl", "rtl"]);
  });
  it("inline math is an LTR isolate and display math does not clip in print (CSS)", () => {
    const css = fs.readFileSync(path.join(here, "rich-content.css"), "utf8");
    expect(css).toMatch(/\.xp-math\s*\{[^}]*unicode-bidi:\s*isolate/);
    expect(css).toMatch(/\.xp-math\s*\{[^}]*direction:\s*ltr/);
    expect(css).toMatch(/@media print[\s\S]*\.xp-math-block[\s\S]*overflow:\s*visible/);
    expect(css).toMatch(/mtable/);
  });
  it("wide formulas never clip: display math and inline grids are sized to their content and scroll LTR inside their own box (Chromium sizes <math> to the available width)", () => {
    const css = fs.readFileSync(path.join(here, "rich-content.css"), "utf8");
    const screen = css.slice(0, css.indexOf("@media print"));
    expect(screen).toMatch(/\.xp-math-block\{[^}]*direction:ltr[^}]*padding-block:/);
    expect(screen).toMatch(/\.xp-math-block \.xp-math\{[^}]*inline-size:max-content[^}]*max-inline-size:none[^}]*margin-inline:auto/);
    expect(screen).toMatch(/\.xp-math-host:has\(mtable\):not\(\.xp-math-block > \*\)\{[^}]*display:inline-block[^}]*max-inline-size:100%[^}]*overflow-x:auto[^}]*direction:ltr/);
    expect(screen).toMatch(/\.xp-math-host:not\(\.xp-math-block > \*\) > \.xp-math:has\(mtable\)\{[^}]*inline-size:max-content/);
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/:is\([^)]*\.xp-math-host[^)]*\)\{ overflow:visible/);
    expect(print).toMatch(/:is\(\.xp-math-block,\.xp-math-host\)\{[^}]*max-inline-size:none/);
  });
  it("an HTML-looking formula (accepted by the 20D.1 grammar as relations) renders as inert MathML text — no element is ever created from it", () => {
    const s = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const c = mathOf(s);
    const m = c.querySelector("math")!;
    expect(m.getAttribute("alttext")).toBe(s);
    expect(c.querySelector("script, img, style, iframe, svg")).toBeNull();
    for (const e of m.querySelectorAll("*")) expect(ELEMENTS.has(e.tagName.toLowerCase()), e.tagName).toBe(true);
    expect([...m.querySelectorAll("mo")].map(o => o.textContent)).toContain("<");
  });
  it("invalid v2 source never disappears: it renders as readable LTR source text", () => {
    for (const s of ["\\begin{array} a & b \\end{array}", "a & b", "\\begin{matrix} a && b \\end{matrix}", "\\begin{matrix} a"]) {
      const c = mathOf(s);
      expect(c.querySelector("math")).toBeNull();
      const code = c.querySelector("code.xp-math-src")!;
      expect([code.textContent, code.getAttribute("dir")]).toEqual([s, "ltr"]);
    }
  });
});

describe("21A-R3 closed vocabulary: only fixed element names and attribute names ever appear", () => {
  it("rendering every advertised feature example and grid environment creates only allow-listed MathML elements and attributes", () => {
    const sources = [...MATH_FEATURES.map(f => f.example), ...M.MATH_ENVIRONMENTS.map(e => `\\begin{${e}} a & b \\\\ c & d \\end{${e}}`.replace(/(cases|aligned)\} a & b \\\\ c & d/, "$1} a & b \\\\ c & d"))];
    const seenEl = new Set<string>();
    for (const s of sources) {
      const m = mathOf(s).querySelector("math")!;
      expect(m, s).toBeTruthy();
      for (const e of [m, ...m.querySelectorAll("*")]) {
        seenEl.add(e.tagName.toLowerCase());
        expect(ELEMENTS.has(e.tagName.toLowerCase()), s + " → <" + e.tagName + ">").toBe(true);
        for (const a of e.getAttributeNames()) expect(ATTRIBUTES.has(a), s + " → @" + a).toBe(true);
      }
      cleanup();
    }
    for (const e of ["mtable", "mtr", "mtd", "mfrac", "msubsup"]) expect(seenEl, e).toContain(e);
  });
});

describe("21A-R4 renderer freeze — the 20D.1 MathML is byte-stable (captured on 60ddadc)", () => {
  // 1,500 accepted old-grammar expressions (no Arabic \text, no v2 construct) in 6 independent slices of 250 (seeds 21002…21007).
  const SLICES = 6, PER_SLICE = 250;
  const PINS: string[] = [
    "60d803ca51b9b8c7e1b0b0412fdc725d5ac82286cfffb2f3ba04e98bc4beaa25",
    "542d7fef1f6c068330634032fff4af296775eb2a95dcbfa46076634c2a3420fd",
    "3e9955f28959b9b7fc93e6b0f80fe29593c56cf4cb173f5a83970f6add2d0ee5",
    "1a4c5d46940ee169913845f8726daff63aa0069f5ab0e9d0b15202467c05dd27",
    "890d09085e653a8473a2f982ecd1ffaf8b663f40915c53fe764b408f14b2890b",
    "60457ba81d3ce91f3ac3806c355038811475afaa1bcdefa78eaa0d8f78806037"
  ];
  for (let k = 0; k < SLICES; k++) {
    it(`slice ${k + 1}/${SLICES} (250 expressions, seed ${21002 + k}) renders to identical MathML`, () => {
      const next = oldGrammarCandidates(21002 + k);
      const h = createHash("sha256");
      let count = 0;
      for (let i = 0; count < PER_SLICE && i < 5000; i++) {
        const s = next();
        if (!M.parseMath(s).ok || /\\(begin|mathbb|iint|iiint)/.test(s) || /\\text\{[^}]*[\u0590-\u08FF]/.test(s)) continue;
        const c = mathOf(s);
        h.update(c.innerHTML).update("\u0001");
        count++;
        cleanup();
      }
      expect(count).toBe(PER_SLICE);
      const got = h.digest("hex");
      if (process.env.CAPTURE_21A_RENDER === "1") { console.log("RENDER_PIN", k, JSON.stringify(got)); return; }
      expect(got).toBe(PINS[k]);
    });
  }
  it("the sliced renderer freeze covers 1,500 expressions", () => {
    expect(SLICES * PER_SLICE).toBe(1500);
    if (process.env.CAPTURE_21A_RENDER !== "1") expect(PINS).toHaveLength(SLICES);
    expect(ARABIC.test("ع")).toBe(true);
  });
});
