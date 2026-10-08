// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import RichContentEditor from "./RichContentEditor";
import { MATH_FEATURE_LABELS } from "./mathFeatureLabels";
import MathSnippetPalette from "./MathSnippetPalette";
import { MATH_FEATURES } from "./mathFeatures";
import { parseMath } from "./richMath";
import { parseInlineMarkdown, markdownToRichContent } from "./markdownToRichContent";
import { validateRichContent, RICH_LIMITS, type RichBlock, type RichContentV1 } from "./richContentModel";

// Phase 21A — Builder AUTHORING of Scientific Math v2: a multi-line LTR source field (grids span lines), the ONE parser's live verdict, a
// trusted preview through the SAME renderer the student sees, and a snippet palette that can only insert parser-proven syntax at the caret.
// Fail-first on 60ddadc: the source field is a single-line <input> (a pasted matrix loses its line breaks), there is no preview and no palette.
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
const errorsOf = (v: unknown) => validateRichContent(v).issues.filter(i => i.severity === "error");

function EditorHost({ onValue, initial, disabled }: { onValue: (v: RichContentV1 | undefined) => void; initial?: RichContentV1; disabled?: boolean }) {
  const [value, setValue] = useState<RichContentV1 | undefined>(initial);
  return <RichContentEditor value={value} disabled={disabled} onChange={next => { onValue(next); setValue(next); }} />;
}
const mount = (source?: string, disabled?: boolean) => {
  const box: { value: RichContentV1 | undefined; emits: number } = { value: undefined, emits: 0 };
  const initial: RichContentV1 | undefined = source === undefined ? undefined : { schemaVersion: 1, blocks: [{ type: "math", source }] };
  box.value = initial;
  render(<div dir="rtl" lang="ar"><EditorHost onValue={v => { box.value = v; box.emits++; }} initial={initial} disabled={disabled} /></div>);
  return box;
};
const field = (n = 1) => screen.getByLabelText("صيغة الكتلة " + n) as HTMLTextAreaElement;
const sourceOf = (v: RichContentV1 | undefined, i = 0) => (v!.blocks[i] as Extract<RichBlock, { type: "math" }>).source;
const preview = () => document.querySelector(".rc-math-editor .rc-math-preview");
const MATRIX = "\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}";
const byId = (id: string) => MATH_FEATURES.find(f => f.id === id)!;
async function openPalette() {
  const toggle = screen.getByRole("button", { name: "نماذج الصيغ العلمية" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  await settle();
  return screen.getByRole("group", { name: "نماذج الصيغ الرياضية" });
}
const snippet = (palette: HTMLElement, id: string) => palette.querySelector(`button.rc-math-snippet[data-feature="${id}"]`) as HTMLButtonElement;

describe("21A-ED1 the math source field", () => {
  it("is a multi-line LTR textarea (inside an RTL page) with the same accessible name; the default block is valid and previewed", async () => {
    const box = mount();
    fireEvent.click(within(screen.getByRole("group", { name: "إضافة كتلة" })).getByRole("button", { name: "+ صيغة" }));
    await settle();
    const f = field();
    expect([f.tagName, f.getAttribute("dir"), f.getAttribute("lang"), f.getAttribute("spellcheck")]).toEqual(["TEXTAREA", "ltr", "en", "false"]);
    expect(f.closest("[dir=rtl]")).toBeTruthy();
    expect(f.maxLength).toBe(RICH_LIMITS.mathChars);
    expect(screen.getByText("✓ صيغة صالحة")).toBeTruthy();
    expect(preview()!.querySelector("math")!.getAttribute("dir")).toBe("ltr");
    expect(errorsOf(box.value)).toEqual([]);
  });
  it("the textarea grows with the source: 2 rows minimum, one row per line, 8 at most (reviewer mutant V19, review fix 3)", async () => {
    mount("x^{2}");
    await settle();
    expect(field().getAttribute("rows")).toBe("2");
    cleanup();
    mount("\\begin{aligned}\nV &= IR \\\\\nP &= VI\n\\end{aligned}");
    await settle();
    expect(field().getAttribute("rows")).toBe("4");
    cleanup();
    mount(Array.from({ length: 12 }, (_, i) => "x_{" + i + "}").join("\n"));
    await settle();
    expect(field().getAttribute("rows")).toBe("8");
  });
  it("pasting a multi-line matrix keeps its exact source (line breaks included), validates live and previews a real MathML table", async () => {
    const box = mount("x");
    fireEvent.change(field(), { target: { value: MATRIX } });
    await settle();
    expect(sourceOf(box.value)).toBe(MATRIX);
    expect(field().value).toBe(MATRIX);
    expect(Number(field().getAttribute("rows"))).toBe(4);
    expect(screen.getByText("✓ صيغة صالحة")).toBeTruthy();
    const t = preview()!.querySelector("math mtable")!;
    expect(t.querySelectorAll("mtr")).toHaveLength(2);
    expect([t.previousElementSibling!.textContent, t.nextElementSibling!.textContent]).toEqual(["(", ")"]);
    expect(preview()!.querySelector("math")!.getAttribute("alttext")).toBe(MATRIX);
    expect(errorsOf(box.value)).toEqual([]);
  });
  it("an invalid v2 source shows the parser's reason, NO preview, and the document reports RICH_CONTENT_MATH (typing is never blocked)", async () => {
    const box = mount("x");
    for (const bad of ["\\begin{array}{cc} a & b \\end{array}", "a & b", "\\begin{matrix} a & b \\\\ c \\end{matrix}", "\\begin{pmatrix} a \\end{bmatrix}", "\\begin{matrix} \\begin{matrix} a \\end{matrix} \\end{matrix}", "\\mathbb{A}"]) {
      fireEvent.change(field(), { target: { value: bad } });
      await settle();
      expect(sourceOf(box.value), bad).toBe(bad);
      expect(document.querySelector(".rc-math-editor .rc-math-bad")!.textContent!.length, bad).toBeGreaterThan(0);
      expect(preview(), bad).toBeNull();
      expect(errorsOf(box.value).map(i => i.code), bad).toContain("RICH_CONTENT_MATH");
    }
  });
  it("the hint documents the v2 language literally (environments, separators, number sets)", () => {
    mount("x");
    const hint = document.querySelector(".rc-math-editor .rc-hint")!.textContent!;
    for (const s of ["\\begin{pmatrix}", "\\end{pmatrix}", "cases", "aligned", "&", "\\\\", "\\mathbb{R}", "\\mathrm"]) expect(hint, s).toContain(s);
  });
});

describe("21A-ED2 the snippet palette", () => {
  it("is closed by default, opens lazily, and offers exactly one labelled button per code-owned feature, grouped", async () => {
    mount("x");
    expect(document.querySelector(".rc-math-palette")).toBeNull();
    const p = await openPalette();
    expect(screen.getByRole("button", { name: "إخفاء النماذج" }).getAttribute("aria-expanded")).toBe("true");
    const buttons = [...p.querySelectorAll("button.rc-math-snippet")] as HTMLButtonElement[];
    expect(buttons.map(b => b.dataset.feature)).toEqual(MATH_FEATURES.map(f => f.id).sort((a, b) => order(a) - order(b)));
    for (const b of buttons) {
      const f = byId(b.dataset.feature!);
      expect([b.textContent, b.title, b.type]).toEqual([MATH_FEATURE_LABELS[f.id], f.example, "button"]);
    }
    expect(p.querySelectorAll(".rc-math-group")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "إخفاء النماذج" }));
    expect(document.querySelector(".rc-math-palette")).toBeNull();
  });
  it("matrix, cases, derivative and chemistry snippets insert their exact source; one click = one emitted change (one undo step)", async () => {
    for (const id of ["matrices", "cases", "derivatives", "chemicalEquations", "equilibrium", "determinants", "aligned", "numberSets"]) {
      const box = mount("");
      const p = await openPalette();
      const before = box.emits;
      fireEvent.click(snippet(p, id));
      await settle();
      expect(sourceOf(box.value), id).toBe(byId(id).example);
      expect(box.emits - before, id).toBe(1);
      expect(parseMath(sourceOf(box.value)).ok, id).toBe(true);
      expect(errorsOf(box.value), id).toEqual([]);
      cleanup();
    }
  });
  it("inserts AT THE CARET with a single space of glue, replaces a selection, and leaves the caret after the snippet", async () => {
    const box = mount("y = ");
    const p = await openPalette();
    const f = field();
    f.setSelectionRange(4, 4);
    fireEvent.click(snippet(p, "derivatives"));
    await settle();
    expect(sourceOf(box.value)).toBe("y = \\frac{dy}{dx}");                                      // "y = " already ends in a space: no glue
    expect(field().selectionStart).toBe(sourceOf(box.value).length);
    field().setSelectionRange(0, 1);                                                               // replace the selected "y"
    fireEvent.click(snippet(p, "vectors"));
    await settle();
    expect(sourceOf(box.value)).toBe("\\vec{F} = m\\vec{a} = \\frac{dy}{dx}");
    field().setSelectionRange(sourceOf(box.value).length, sourceOf(box.value).length);
    fireEvent.click(snippet(p, "matrices"));
    await settle();
    expect(sourceOf(box.value)).toBe("\\vec{F} = m\\vec{a} = \\frac{dy}{dx} " + byId("matrices").example);   // glue after "}"
    expect(parseMath(sourceOf(box.value)).ok).toBe(true);
  });
  it("never exceeds the 2,000-character bound: an insert that would overflow is refused and the source is unchanged", async () => {
    const long = "x".repeat(RICH_LIMITS.mathChars - 5);
    const box = mount(long);
    const p = await openPalette();
    const before = box.emits;
    fireEvent.click(snippet(p, "matrices"));
    await settle();
    expect(sourceOf(box.value)).toBe(long);
    expect(box.emits).toBe(before);
  });
  it("a MIDDLE insertion leaves the caret right after the snippet (reviewer mutant R16)", async () => {
    const box = mount("x = 1");
    const p = await openPalette();
    field().setSelectionRange(1, 1);                                                                // after "x"
    fireEvent.click(snippet(p, "derivatives"));
    await settle();
    const ex = byId("derivatives").example;
    expect(sourceOf(box.value)).toBe("x " + ex + " = 1");
    expect([field().selectionStart, field().selectionEnd]).toEqual([2 + ex.length, 2 + ex.length]);
    expect(document.activeElement).toBe(field());
  });
  it("an insert that lands EXACTLY on 2,000 characters is accepted; one more character is refused (reviewer mutant R14)", async () => {
    const ex = byId("matrices").example;
    const exact = "y".repeat(RICH_LIMITS.mathChars - ex.length - 1) + " ";                          // ends in a space: no glue
    let box = mount(exact);
    let p = await openPalette();
    fireEvent.click(snippet(p, "matrices"));
    await settle();
    expect(sourceOf(box.value).length).toBe(RICH_LIMITS.mathChars);
    cleanup();
    const over = "y".repeat(RICH_LIMITS.mathChars - ex.length);                                    // needs one glue space: 2,001
    box = mount(over);
    p = await openPalette();
    fireEvent.click(snippet(p, "matrices"));
    await settle();
    expect(sourceOf(box.value)).toBe(over);
  });
  it("every palette button honours `disabled` and inserts nothing (reviewer mutant R17)", () => {
    const calls: string[] = [];
    render(<MathSnippetPalette onInsert={s => calls.push(s)} disabled />);
    const buttons = [...document.querySelectorAll("button.rc-math-snippet")] as HTMLButtonElement[];
    expect(buttons.length).toBe(MATH_FEATURES.length);
    for (const b of buttons) { expect(b.disabled, b.dataset.feature).toBe(true); fireEvent.click(b); }
    expect(calls).toEqual([]);
  });
  it("is disabled with the editor", async () => {
    mount("x", true);
    expect((screen.getByRole("button", { name: "نماذج الصيغ العلمية" }) as HTMLButtonElement).disabled).toBe(true);
    expect(field().disabled).toBe(true);
  });
});

describe("21A-ED3 the feature catalog is proven, labelled and closed", () => {
  it("every feature example is accepted by the ONE parser, as a math block AND as an inline math run, and every feature has a label", () => {
    const ids = MATH_FEATURES.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(MATH_FEATURE_LABELS).sort()).toEqual([...ids].sort());
    for (const f of MATH_FEATURES) {
      expect(parseMath(f.example).ok, f.id).toBe(true);
      expect(f.example.length).toBeLessThanOrEqual(RICH_LIMITS.mathChars);
      expect(MATH_FEATURE_LABELS[f.id].trim().length, f.id).toBeGreaterThan(0);
      expect(errorsOf({ schemaVersion: 1, blocks: [{ type: "math", source: f.example }] }), f.id).toEqual([]);
      expect(errorsOf({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "أ " }, { math: f.example }] }] }), f.id).toEqual([]);
    }
    expect(Object.isFrozen(MATH_FEATURES) && Object.isFrozen(MATH_FEATURES[0]) && Object.isFrozen(MATH_FEATURE_LABELS)).toBe(true);
  });
  it("the catalog covers the required capability families", () => {
    const groups = new Set(MATH_FEATURES.map(f => f.group));
    expect([...groups].sort()).toEqual(["basic", "calculus", "complex", "geometry", "linearAlgebra", "science"]);
    const all = MATH_FEATURES.map(f => f.example).join(" ");
    for (const s of ["\\begin{pmatrix}", "\\begin{vmatrix}", "\\begin{cases}", "\\begin{aligned}", "\\partial", "\\iint", "\\lim", "\\sum", "\\Re", "\\Im", "\\arg", "\\overline", "\\mathbb{R}", "\\mathbb{C}", "\\rightleftharpoons", "\\mathrm", "\\vec", "\\angle", "\\perp", "\\times 10^"]) {
      expect(all, s).toContain(s);
    }
  });
});

describe("21A-ED4 inline math and conversions", () => {
  it("inline $…$ in a prose field accepts v2 constructs on one line and refuses separators outside a grid", () => {
    expect(parseInlineMarkdown("المصفوفة $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ حيث $x \\in \\mathbb{R}$")).toEqual([
      { text: "المصفوفة " }, { math: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" }, { text: " حيث " }, { math: "x \\in \\mathbb{R}" }
    ]);
    const codes: string[] = [];
    expect(parseInlineMarkdown("$a & b$", c => codes.push(c))).toEqual([{ text: "$a & b$" }]);
    expect(codes).toContain("MARKDOWN_MATH_REFUSED");
  });
  it("display $$…$$ Markdown spanning lines becomes ONE math block with the exact inner source", () => {
    const r = markdownToRichContent("قبل\n\n$$\n" + MATRIX + "\n$$\n\nبعد");
    expect(r.ok).toBe(true);
    expect(r.value!.blocks.map(b => b.type)).toEqual(["paragraph", "math", "paragraph"]);
    expect(sourceOf(r.value, 1)).toBe(MATRIX);
    expect(errorsOf(r.value)).toEqual([]);
  });
  it("prose typed in the editor with inline v2 math stores math runs", async () => {
    const box = mount();
    fireEvent.click(within(screen.getByRole("group", { name: "إضافة كتلة" })).getByRole("button", { name: "+ فقرة" }));
    fireEvent.change(screen.getByLabelText("نص الكتلة 1"), { target: { value: "لكل $z \\in \\mathbb{C}$: $\\Re(z) = a$" } });
    expect((box.value!.blocks[0] as Extract<RichBlock, { type: "paragraph" }>).runs).toEqual([{ text: "لكل " }, { math: "z \\in \\mathbb{C}" }, { text: ": " }, { math: "\\Re(z) = a" }]);
    expect(errorsOf(box.value)).toEqual([]);
  });
  it("math → paragraph → math is exact for a multi-line grid (the round trip asks before the formatted conversion back)", async () => {
    const box = mount(MATRIX);
    fireEvent.change(screen.getByLabelText("نوع الكتلة 1"), { target: { value: "paragraph" } });
    await settle();
    expect(box.value!.blocks[0]).toEqual({ type: "paragraph", runs: [{ math: MATRIX }] });
    expect(errorsOf(box.value)).toEqual([]);
    fireEvent.change(screen.getByLabelText("نوع الكتلة 1"), { target: { value: "math" } });
    await settle();
    const dialog = screen.queryByRole("dialog");
    if (dialog) { fireEvent.click(within(dialog).getByRole("button", { name: /تغيير النوع/ })); await settle(); }
    expect(box.value!.blocks[0]).toEqual({ type: "math", source: MATRIX });
    expect(field().value).toBe(MATRIX);
  });
});

const GROUP_ORDER = ["basic", "calculus", "linearAlgebra", "complex", "science", "geometry"];
function order(id: string) { const f = byId(id); return GROUP_ORDER.indexOf(f.group) * 100 + MATH_FEATURES.indexOf(f); }
