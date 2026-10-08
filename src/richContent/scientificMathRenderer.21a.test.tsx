// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import RichMath from "./RichMath";
import RichContentRenderer from "./RichContentRenderer";
import * as M from "./richMath";
import { MATH_FEATURES } from "./mathFeatures";
import { oldGrammarCandidates, scientificV2Candidates } from "./testing/mathCorpus";

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
  it("\\ddot renders the fixed double-dot accent ¨ over its base (reviewer mutant R08)", () => {
    const o = mathOf("\\ddot{x}").querySelector("mover")!;
    expect([o.getAttribute("accent"), o.lastElementChild!.textContent]).toEqual(["true", "¨"]);
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
    // the whole RTL range, not only the basic Arabic block (reviewer mutant R12): Hebrew, Arabic Supplement, Arabic Presentation Forms-B
    for (const t of ["שלום", "ݐݑ", "ﻻ"]) expect(mathOf("\\text{" + t + "}").querySelector("mtext")!.getAttribute("dir"), t).toBe("rtl");
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
    // MathML Core has no columnalign in Chromium: these text-align rules ARE the cases / aligned alignment (reviewer mutants R24 / R25)
    expect(screen).toMatch(/mtable\.xp-math-cases > mtr > mtd\{ text-align:left; \}/);
    expect(screen).toMatch(/mtable\.xp-math-aligned > mtr > mtd:first-child\{ text-align:right; \}/);
    expect(screen).toMatch(/mtable\.xp-math-aligned > mtr > mtd:last-child\{ text-align:left; \}/);
    // the display block IS the scroll box (reviewer mutant N14) and never shows a vertical scroller (review fix 2)
    expect(screen).toMatch(/\.xp-rich \.xp-math-block\{[^}]*max-width:100%[^}]*overflow-x:auto/);
    expect(screen).toMatch(/\.xp-rich \.xp-math-block\{[^}]*overflow-y:hidden/);
    expect(screen).toMatch(/\.xp-math-host:has\(mtable\):not\(\.xp-math-block > \*\)\{[^}]*overflow-x:auto; overflow-y:hidden/);
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/:is\([^)]*\.xp-math-block[^)]*\)\{ break-inside:avoid; \}/);                    // reviewer mutant R22
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


describe("21A-R5 display formula accessibility (review fix 1): the 20D.1 markup unless the formula actually scrolls", () => {
  const block = () => document.querySelector(".xp-math-block") as HTMLElement;
  const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
  it("a formula that fits keeps the plain 20D.1 block: no role, no label, no tab stop (no landmark or extra Tab per formula)", async () => {
    render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: "x^{2}" }, { type: "math", source: "\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}" }] }} />);
    await settle();
    for (const b of document.querySelectorAll(".xp-math-block")) {
      expect([b.getAttribute("role"), b.getAttribute("aria-label"), b.getAttribute("tabindex")]).toEqual([null, null, null]);
      expect(b.querySelector("math")).toBeTruthy();
    }
  });
  it("a formula wider than its block becomes a labelled, keyboard-focusable group (role=group, not a landmark), and reverts when it fits again", async () => {
    let wide = true;
    const sw = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("xp-math-block") && wide ? 914 : 0; });
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("xp-math-block") ? 328 : 0; });
    const observers: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class { cb: () => void; constructor(cb: () => void) { this.cb = cb; observers.push(cb); } observe() { this.cb(); } disconnect() {} });
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: "\\begin{pmatrix} a & b & c & d & e & f & g & h \\end{pmatrix}" }] }} />);
      await settle();
      expect([block().getAttribute("role"), block().getAttribute("aria-label"), block().getAttribute("tabindex")]).toEqual(["group", "صيغة رياضية قابلة للتمرير", "0"]);
      wide = false;
      await act(async () => { for (const cb of observers) cb(); });
      expect([block().getAttribute("role"), block().getAttribute("tabindex")]).toEqual([null, null]);
    } finally { sw.mockRestore(); cw.mockRestore(); vi.unstubAllGlobals(); }
  });
});

describe("21A-R6 the overflow observers (review fix 2): wiring, re-check on lazy arrival, tolerance, focus retention, cleanup", () => {
  type Obs = { cb: () => void; targets: Element[]; opts?: unknown; active: boolean };
  const block = () => document.querySelector(".xp-math-block") as HTMLElement;
  const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
  const WIDE = "\\begin{pmatrix} a & b & c & d & e & f & g & h \\end{pmatrix}";
  function harness() {
    const ros: Obs[] = [], mos: Obs[] = [];
    let sw = 0;
    const spies = [
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("xp-math-block") && this.querySelector("math") ? sw : 0; }),
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("xp-math-block") ? 328 : 0; })
    ];
    vi.stubGlobal("ResizeObserver", class { o: Obs; constructor(cb: () => void) { this.o = { cb, targets: [], active: false }; ros.push(this.o); } observe(t: Element) { this.o.targets.push(t); this.o.active = true; this.o.cb(); } disconnect() { this.o.targets = []; this.o.active = false; } });
    vi.stubGlobal("MutationObserver", class { o: Obs; constructor(cb: () => void) { this.o = { cb, targets: [], active: false }; mos.push(this.o); } observe(t: Element, opts: unknown) { this.o.targets = [t]; this.o.opts = opts; this.o.active = true; } disconnect() { this.o.active = false; } });
    return { ros, mos, setWidth: (w: number) => { sw = w; }, restore: () => { for (const s of spies) s.mockRestore(); vi.unstubAllGlobals(); } };
  }
  const fire = async (list: Obs[]) => act(async () => { for (const o of list.filter(x => x.active)) o.cb(); });
  const attrs = () => [block().getAttribute("role"), block().getAttribute("tabindex")];

  it("a DOM mutation (the lazy formula arriving / changing) re-checks; the block AND the <math> element are observed (reviewer mutants N01, N02)", async () => {
    const h = harness();
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: WIDE }] }} />);
      await settle();
      expect(attrs()).toEqual([null, null]);                                                    // fits so far
      const mo = h.mos.find(o => o.active)!;
      expect([mo.targets[0], mo.opts]).toEqual([block(), { childList: true, subtree: true }]);
      h.setWidth(914);
      await fire(h.mos);                                                                          // only the mutation path re-checks here
      expect(attrs()).toEqual(["group", "0"]);
      const observed = h.ros.filter(o => o.active).flatMap(o => o.targets);
      expect(observed).toContain(block());
      expect(observed.some(t => t.tagName.toLowerCase() === "math")).toBe(true);
    } finally { h.restore(); }
  });
  it("the 1 px sub-pixel tolerance: clientWidth + 1 still fits, clientWidth + 2 overflows (reviewer mutant N04)", async () => {
    const h = harness();
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: WIDE }] }} />);
      await settle();
      h.setWidth(329); await fire(h.ros);
      expect(attrs()).toEqual([null, null]);
      h.setWidth(330); await fire(h.ros);
      expect(attrs()).toEqual(["group", "0"]);
    } finally { h.restore(); }
  });
  it("a FOCUSED group is kept when the formula starts to fit (no focus loss); leaving it re-checks and reverts", async () => {
    const h = harness();
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: WIDE }] }} />);
      await settle();
      h.setWidth(914); await fire(h.ros);
      act(() => block().focus());
      expect(document.activeElement).toBe(block());
      h.setWidth(0); await fire(h.ros);                                                           // the viewport widened: it fits now
      expect(attrs()).toEqual(["group", "0"]);
      expect(document.activeElement).toBe(block());
      act(() => block().blur());
      expect(attrs()).toEqual([null, null]);
    } finally { h.restore(); }
  });
  it("observers are disconnected on a source change and on unmount — none leak (reviewer mutant N03; the editor preview re-renders per keystroke)", async () => {
    const h = harness();
    try {
      const doc = (source: string) => ({ schemaVersion: 1 as const, blocks: [{ type: "math" as const, source }] });
      const view = render(<RichContentRenderer content={doc(WIDE)} />);
      await settle();
      for (const s of ["x^{2}", "\\frac{a}{b}", WIDE, "y"]) { view.rerender(<RichContentRenderer content={doc(s)} />); await settle(); }
      expect(h.ros.filter(o => o.active)).toHaveLength(1);
      expect(h.mos.filter(o => o.active)).toHaveLength(1);
      expect(h.ros.length).toBeGreaterThanOrEqual(5);
      view.unmount();
      expect([h.ros.filter(o => o.active).length, h.mos.filter(o => o.active).length]).toEqual([0, 0]);
    } finally { h.restore(); }
  });
  it("INLINE grids: the scroll-box host is out of the Tab order while it fits (tabIndex -1: a browser would make any scroller a Tab stop), a labelled group when it overflows; inline formulas without a grid keep the 20D.1 host", async () => {
    const h = harness();
    const hostSw = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("xp-math-host") && wideInline ? 500 : 0; });
    const hostCw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("xp-math-host") ? 300 : 0; });
    let wideInline = false;
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "أ " }, { math: WIDE }, { text: " ب " }, { math: "x^{2}" }] }] }} />);
      await settle();
      const [grid, plain] = [...document.querySelectorAll("p .xp-math-host")] as HTMLElement[];
      expect(grid.querySelector("mtable")).toBeTruthy();
      expect([grid.getAttribute("role"), grid.getAttribute("tabindex")]).toEqual([null, "-1"]);
      expect([plain.getAttribute("role"), plain.getAttribute("tabindex"), plain.getAttributeNames().sort()]).toEqual([null, null, ["class"]]);
      wideInline = true;
      await fire(h.ros);
      expect([grid.getAttribute("role"), grid.getAttribute("aria-label"), grid.getAttribute("tabindex")]).toEqual(["group", "صيغة رياضية قابلة للتمرير", "0"]);
    } finally { hostSw.mockRestore(); hostCw.mockRestore(); h.restore(); }
  });
});

describe("21A-R7 review fix 3: print releases every scroll box, every grid spelling is an inline grid, the blur / focus / fallback paths", () => {
  type Obs = { cb: () => void; targets: Element[]; active: boolean };
  const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
  const WIDE = "\\begin{pmatrix} a & b & c & d & e & f & g & h \\end{pmatrix}";
  const SMALL = "\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}";
  /** Box sizes per element ([scrollWidth, clientWidth]) and recording ResizeObserver / MutationObserver stubs. */
  function harness(size: (el: HTMLElement) => [number, number]) {
    const ros: Obs[] = [];
    const spies = [
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) { return size(this)[0]; }),
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return size(this)[1]; })
    ];
    vi.stubGlobal("ResizeObserver", class { o: Obs; constructor(cb: () => void) { this.o = { cb, targets: [], active: false }; ros.push(this.o); } observe(t: Element) { this.o.targets.push(t); this.o.active = true; this.o.cb(); } disconnect() { this.o.targets = []; this.o.active = false; } });
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
    return { fire: async () => act(async () => { for (const o of ros.filter(x => x.active)) o.cb(); }), restore: () => { for (const s of spies) s.mockRestore(); vi.unstubAllGlobals(); } };
  }
  const state = (el: Element) => [el.getAttribute("role"), el.getAttribute("tabindex")];

  // ---- MINOR-1: print. A print override only wins if its selector is at least as specific as the screen rule it releases (it comes later).
  type Spec = [number, number, number];
  const splitTop = (list: string) => { const out: string[] = []; let depth = 0, cur = ""; for (const ch of list) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const add = (a: Spec, b: Spec): Spec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const cmp = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  /** Selectors Level 4 specificity for the selector shapes this stylesheet uses (classes, type selectors, *, :is / :not / :has / :where). */
  function specificity(sel: string): Spec {
    let s: Spec = [0, 0, 0];
    for (let i = 0; i < sel.length;) {
      const ch = sel[i];
      if (ch === ".") { s = add(s, [0, 1, 0]); i++; while (i < sel.length && /[\w-]/.test(sel[i])) i++; }
      else if (ch === "#") { s = add(s, [1, 0, 0]); i++; while (i < sel.length && /[\w-]/.test(sel[i])) i++; }
      else if (ch === "[") { s = add(s, [0, 1, 0]); i = sel.indexOf("]", i) + 1; }
      else if (ch === ":") {
        const elementPseudo = sel[i + 1] === ":"; i += elementPseudo ? 2 : 1;
        let name = ""; while (i < sel.length && /[\w-]/.test(sel[i])) name += sel[i++];
        if (sel[i] === "(") {
          let depth = 0, j = i; for (; j < sel.length; j++) { if (sel[j] === "(") depth++; if (sel[j] === ")" && --depth === 0) break; }
          const args = splitTop(sel.slice(i + 1, j)); i = j + 1;
          if (name === "where") continue;
          if (["is", "not", "has"].includes(name)) s = add(s, args.map(specificity).sort(cmp).pop()!);
          else s = add(s, [0, 1, 0]);
        } else s = add(s, elementPseudo ? [0, 0, 1] : [0, 1, 0]);
      }
      else if (/[a-zA-Z]/.test(ch)) { s = add(s, [0, 0, 1]); while (i < sel.length && /[\w-]/.test(sel[i])) i++; }
      else i++;                                                                                     // combinators, whitespace, *
    }
    return s;
  }
  const rulesOf = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selectors: splitTop(m[1].trim()), body: m[2] }));
  it("the specificity helper agrees with the spec on this stylesheet's shapes", () => {
    expect(specificity(".xp-rich .xp-math-host:has(mtable):not(.xp-math-block > *)")).toEqual([0, 3, 1]);
    expect(specificity(".xp-rich :is(.xp-table-wrap,.xp-code,.xp-cli,.xp-math-block,.xp-math-host)")).toEqual([0, 2, 0]);
    expect(specificity(".xp-rich .xp-math-block")).toEqual([0, 2, 0]);
    expect(specificity(".xp-rich :where(.a,.b) td::before")).toEqual([0, 1, 2]);
  });
  it("PRINT releases every math scroll box: for each screen rule that makes one scroll, a later print rule at least as specific sets overflow visible and lifts the width cap (reviewer MINOR-1, mutant V12)", () => {
    const css = fs.readFileSync(path.join(here, "rich-content.css"), "utf8");
    const at = css.indexOf("@media print");
    const screenRules = rulesOf(css.slice(0, at).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ""));
    const printRules = rulesOf(css.slice(at + css.slice(at).indexOf("{") + 1));
    const scrollBoxes = screenRules.filter(r => /overflow-x:\s*auto/.test(r.body)).flatMap(r => r.selectors.filter(s => /xp-math/.test(s)).map(sel => ({ sel, body: r.body })));
    expect(scrollBoxes.map(b => b.sel).sort()).toEqual([".xp-rich .xp-math-block", ".xp-rich .xp-math-host:has(mtable):not(.xp-math-block > *)"]);
    const key = (sel: string) => (sel.match(/\.xp-math-(block|host)/) || [""])[0];
    const releases = (sel: string, decl: RegExp) => printRules.some(r => decl.test(r.body) && r.selectors.some(p => (p === sel || (/:is\(/.test(p) && p.includes(key(sel)))) && cmp(specificity(p), specificity(sel)) >= 0));
    for (const { sel, body } of scrollBoxes) {
      expect(releases(sel, /(^|[\s;])overflow:\s*visible/), sel + " overflow").toBe(true);
      if (/max-inline-size:\s*100%/.test(body)) expect(releases(sel, /max-inline-size:\s*none/), sel + " max-inline-size").toBe(true);
      if (/max-width:\s*100%/.test(body)) expect(releases(sel, /max-width:\s*none/), sel + " max-width").toBe(true);
    }
  });

  // ---- MINOR-2 / V03: the parser skips whitespace between \begin and its brace, so `\begin {pmatrix}` IS a grid; every spelling of every
  // environment must get the inline-grid host. Property: a rendered inline host is out of the Tab order (fits) exactly when it holds a grid.
  it("every valid spelling of every environment is an inline grid; nothing else is (property over spaced spellings, feature examples and generated corpora)", async () => {
    const spaced: string[] = [];
    for (const env of M.MATH_ENVIRONMENTS) for (const gap of [" ", "\t", "\n", "\r\n", "\r", "  \n\t"]) spaced.push(`\\begin${gap}{${env}} a & b \\\\ c & d \\end${gap}{${env}}`);
    const v2 = scientificV2Candidates(31337), old = oldGrammarCandidates(31338);
    const generated = [...Array.from({ length: 120 }, () => v2().source), ...Array.from({ length: 300 }, () => old())];
    const sources = [...spaced, ...MATH_FEATURES.map(f => f.example), ...generated].filter(s => M.parseMath(s).ok);
    expect(sources.length).toBeGreaterThan(spaced.length + MATH_FEATURES.length + 100);
    const h = harness(() => [0, 0]);
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: sources.flatMap(s => [{ text: " و " }, { math: s }]) }] }} />);
      await settle();
      const hosts = [...document.querySelectorAll("p .xp-math-host")];
      expect(hosts).toHaveLength(sources.length);
      hosts.forEach((host, i) => {
        const grid = !!host.querySelector("mtable");
        expect(grid, sources[i]).toBe(JSON.stringify(M.parseMath(sources[i])).includes('"k":"grid"'));
        expect(state(host), sources[i]).toEqual(grid ? [null, "-1"] : [null, null]);
      });
      for (const s of spaced) expect(hosts[sources.indexOf(s)].querySelector("mtable"), JSON.stringify(s)).toBeTruthy();
    } finally { h.restore(); }
  });
  it("a wide `\\begin {pmatrix}` inline grid is the labelled scroll group like its `\\begin{pmatrix}` twin (reviewer MINOR-2)", async () => {
    const spacedWide = WIDE.replace("\\begin{", "\\begin {").replace("\\end{", "\\end {");
    const h = harness(el => (el.classList.contains("xp-math-host") ? [500, 300] : [0, 0]));
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ math: WIDE }, { text: " و " }, { math: spacedWide }] }] }} />);
      await settle();
      const [a, b] = [...document.querySelectorAll("p .xp-math-host")];
      expect([state(a), a.getAttribute("aria-label")]).toEqual([["group", "0"], "صيغة رياضية قابلة للتمرير"]);
      expect([state(b), b.getAttribute("aria-label")]).toEqual([["group", "0"], "صيغة رياضية قابلة للتمرير"]);
    } finally { h.restore(); }
  });

  // ---- NIT-2: nothing measured → nothing removed from the browser's own Tab order (an overflowing grid must stay reachable).
  it("without ResizeObserver nothing is measured, so an inline grid keeps the browser's default (no tabIndex -1), also after a blur (reviewer NIT-2)", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "أ " }, { math: WIDE }] }, { type: "math", source: WIDE }] }} />);
      await settle();
      const host = document.querySelector("p .xp-math-host")!;
      expect(host.querySelector("mtable")).toBeTruthy();
      expect(state(host)).toEqual([null, null]);
      fireEvent.focusOut(host);
      expect(state(host)).toEqual([null, null]);
      expect(state(document.querySelector(".xp-math-block")!)).toEqual([null, null]);
    } finally { vi.unstubAllGlobals(); }
  });

  // ---- MINOR-3: the blur / focus paths (reviewer mutants V01, V02, V05)
  it("leaving a group that STILL overflows keeps it a reachable group (blur re-checks, it does not just drop it) — display and inline (V02)", async () => {
    const h = harness(el => (el.classList.contains("xp-math-block") || (el.classList.contains("xp-math-host") && !el.closest(".xp-math-block")) ? [914, 328] : [0, 0]));
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: WIDE }, { type: "paragraph", runs: [{ math: WIDE }] }] }} />);
      await settle();
      for (const sel of [".xp-math-block", "p .xp-math-host"]) {
        const box = document.querySelector(sel) as HTMLElement;
        expect(state(box), sel).toEqual(["group", "0"]);
        act(() => box.focus()); act(() => box.blur());
        expect(state(box), sel).toEqual(["group", "0"]);
      }
    } finally { h.restore(); }
  });
  it("an INLINE grid group keeps focus when it starts to fit and reverts to tabIndex -1 when left (V05)", async () => {
    let wide = true;
    const h = harness(el => (el.classList.contains("xp-math-host") ? [wide ? 500 : 0, 300] : [0, 0]));
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ math: WIDE }] }] }} />);
      await settle();
      const host = document.querySelector("p .xp-math-host") as HTMLElement;
      expect(state(host)).toEqual(["group", "0"]);
      act(() => host.focus());
      wide = false; await h.fire();
      expect([state(host), document.activeElement === host]).toEqual([["group", "0"], true]);
      act(() => host.blur());
      expect(state(host)).toEqual([null, "-1"]);
    } finally { h.restore(); }
  });
  it("a focused inline grid that never overflowed is NOT promoted to a group by a resize (only a kept group is retained) (V01)", async () => {
    const h = harness(() => [0, 0]);
    try {
      render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ math: SMALL }] }] }} />);
      await settle();
      const host = document.querySelector("p .xp-math-host") as HTMLElement;
      act(() => host.focus());                                                                      // a click / script focus (tabIndex -1)
      expect(document.activeElement).toBe(host);
      await h.fire(); await h.fire();
      expect(state(host)).toEqual([null, "-1"]);
    } finally { h.restore(); }
  });

  // ---- V06 / V04: display math is display=block through the renderer; the inline grid shows its exact source while the chunk loads
  it("a math BLOCK renders display math (display=block) through the renderer; inline runs never do (V06)", async () => {
    render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "math", source: "\\sum_{i=1}^{n} i" }, { type: "paragraph", runs: [{ math: "x^{2}" }, { text: " و " }, { math: SMALL }] }] }} />);
    await settle();
    expect(document.querySelector(".xp-math-block math")!.getAttribute("display")).toBe("block");
    const inline = [...document.querySelectorAll("p math")];
    expect(inline).toHaveLength(2);
    for (const m of inline) expect(m.getAttribute("display")).not.toBe("block");
  });
  it("while the lazy renderer chunk loads, an inline grid and a display formula show their exact source as LTR text (V04)", async () => {
    vi.resetModules();
    const { default: Fresh } = await import("./RichContentRenderer");                             // a fresh lazy() that has never resolved
    const { container } = render(<Fresh content={{ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "أ " }, { math: SMALL }] }, { type: "math", source: "x^{2}" }] }} />);
    expect([...container.querySelectorAll("code.xp-math-src")].map(c => [c.textContent, c.getAttribute("dir")])).toEqual([[SMALL, "ltr"], ["x^{2}", "ltr"]]);
    await settle();
    expect(container.querySelectorAll("math")).toHaveLength(2);
    expect(container.querySelector("code.xp-math-src")).toBeNull();
  });
});
