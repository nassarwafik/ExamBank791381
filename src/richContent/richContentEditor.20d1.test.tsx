// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import RichContentEditor from "./RichContentEditor";
import { markdownToRichContent, parseInlineMarkdown, runsToInlineMarkdown } from "./markdownToRichContent";
import { validateRichContent, RICH_LIMITS, type RichBlock, type RichContentV1 } from "./richContentModel";
import QuestionComposer from "../QuestionComposer";
import CompositeEditor from "../questionTypes/editors/CompositeEditor";
import { newQuestion, mergePatch } from "../examBuilderState";
import type { BuilderQuestion, QuestionBody } from "../examTypes";
import { compositeArabicExam } from "../composite/compositeFixtures";

// Phase 20D.1 — focused behaviour of the rich-content AUTHORING workstream: the safe Markdown subset converter, the block editor (no
// editable HTML, always a structurally valid document, confirmed destructive actions, bounds) and the builder integrations.
afterEach(cleanup);
type Obj = Record<string, unknown>;
const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
const errorsOf = (v: unknown) => validateRichContent(v).issues.filter(i => i.severity === "error");
const md = (s: string) => markdownToRichContent(s);
const runsOf = (b: RichBlock) => (b as { runs: { text?: string; math?: string; marks?: string[] }[] }).runs;

describe("20D1-MD markdownToRichContent — inline syntax", () => {
  it("nested emphasis: strong containing italic, triple delimiters, italic containing strong, code inside strong", () => {
    expect(parseInlineMarkdown("**قوي *مائل* قوي**")).toEqual([{ text: "قوي ", marks: ["bold"] }, { text: "مائل", marks: ["bold", "italic"] }, { text: " قوي", marks: ["bold"] }]);
    expect(parseInlineMarkdown("***كلاهما***")).toEqual([{ text: "كلاهما", marks: ["bold", "italic"] }]);
    expect(parseInlineMarkdown("*a **b** c*")).toEqual([{ text: "a ", marks: ["italic"] }, { text: "b", marks: ["bold", "italic"] }, { text: " c", marks: ["italic"] }]);
    expect(parseInlineMarkdown("**`x = 1`**")).toEqual([{ text: "x = 1", marks: ["bold", "code"] }]);
    expect(parseInlineMarkdown("_مائل_ و snake_case_name")).toEqual([{ text: "مائل", marks: ["italic"] }, { text: " و snake_case_name" }]);
    expect(parseInlineMarkdown("5 * 3 = 15 و **غير مغلق")).toEqual([{ text: "5 * 3 = 15 و **غير مغلق" }]);
    expect(parseInlineMarkdown("~~محذوف~~ نص")).toEqual([{ text: "محذوف نص" }]);
  });
  it("every RichMark has a spelling and the editor round-trip is stable", () => {
    expect(parseInlineMarkdown("++خط++ H~2~O x^2^")).toEqual([{ text: "خط", marks: ["underline"] }, { text: " H" }, { text: "2", marks: ["sub"] }, { text: "O x" }, { text: "2", marks: ["sup"] }]);
    for (const s of ["اضبط **الأمر** `switchport mode trunk` *بعناية*.", "قيمة $x^{2}$ ثم \\*نجمة\\*", "++a++ ~b~ ^c^ ***d***", "price 5$ and $ 6"]) {
      const runs = parseInlineMarkdown(s);
      expect(parseInlineMarkdown(runsToInlineMarkdown(runs))).toEqual(runs);
    }
    expect(runsToInlineMarkdown([{ text: "5 * 3" }])).toBe("5 * 3");
    expect(runsToInlineMarkdown([{ text: "**literal**" }])).toBe("\\*\\*literal\\*\\*");
  });
  it("inline math is a math run only when the allow-listed parser accepts it; currency stays text", () => {
    expect(parseInlineMarkdown("السرعة $\\frac{d}{t}$ فقط")).toEqual([{ text: "السرعة " }, { math: "\\frac{d}{t}" }, { text: " فقط" }]);
    const codes: string[] = [];
    expect(parseInlineMarkdown("$\\href{x}{y}$", c => codes.push(c))).toEqual([{ text: "$\\href{x}{y}$" }]);
    expect(codes).toContain("MARKDOWN_MATH_REFUSED");
    expect(parseInlineMarkdown("السعر 5$ أو 6$")).toEqual([{ text: "السعر 5$ أو 6$" }]);
  });
});

describe("20D1-MD markdownToRichContent — blocks", () => {
  it("heading levels (no h1 in content), setext heading, fenced code languages, cli / console fences, unknown language → text", () => {
    const r = md("# أ\n\n## ب\n\n### ج\n\n##### د\n\nعنوان\n===\n\n```cli\nshow vlan\n```\n\n```console\n$ ls\n```\n\n```rust\nfn main(){}\n```\n\n```py\nprint(1)\n```");
    expect(r.ok).toBe(true);
    expect(errorsOf(r.value)).toEqual([]);
    const b = r.value!.blocks;
    expect(b.slice(0, 5).map(x => (x as { level: number }).level)).toEqual([2, 2, 3, 4, 2]);
    expect(b.slice(5).map(x => x.type)).toEqual(["cli", "cli", "code", "code"]);
    expect(b[7]).toEqual({ type: "code", language: "text", source: "fn main(){}" });
    expect((b[8] as { language: string }).language).toBe("python");
    expect(r.warningCodes).toContain("MARKDOWN_CODE_LANGUAGE");
  });
  it("ragged pipe tables are padded / truncated to the header width with a warning; inline marks make run cells; escaped pipes survive", () => {
    const r = md("| أ | ب | ج |\n|:--|:-:|--:|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |\n| **x** | a \\| b | `c` |");
    expect(r.ok).toBe(true);
    expect(errorsOf(r.value)).toEqual([]);
    const t = r.value!.blocks[0] as { columnHeaders: string[]; rows: unknown[][] };
    expect(t.columnHeaders).toEqual(["أ", "ب", "ج"]);
    expect(t.rows[0]).toEqual(["1", "2", ""]);
    expect(t.rows[1]).toEqual(["1", "2", "3"]);
    expect(t.rows[2]).toEqual([{ runs: [{ text: "x", marks: ["bold"] }] }, "a | b", { runs: [{ text: "c", marks: ["code"] }] }]);
    expect(r.warningCodes).toContain("MARKDOWN_TABLE_RAGGED");
  });
  it("raw HTML is refused: block tags dropped, script / style containers dropped WITH their content, inline tags stripped, text kept", () => {
    const r = md("<div>\nنص ظاهر\n</div>\n\n<script>\nalert(1)\n</script>\n\nقبل <b>غامق</b> بعد <img src=x onerror=alert(2)>\n\n<style>p{color:red}</style>\n\n<!-- تعليق -->");
    const json = JSON.stringify(r.value);
    expect(r.ok).toBe(true);
    expect(errorsOf(r.value)).toEqual([]);
    expect(json).not.toMatch(/<|alert|onerror|color:red|تعليق/);
    expect(json).toContain("نص ظاهر");
    expect(runsOf(r.value!.blocks[1])).toEqual([{ text: "قبل غامق بعد" }]);
    expect(r.warningCodes).toContain("MARKDOWN_HTML_REFUSED");
  });
  it("images are never loaded (a text note); links keep only their text; reference definitions are dropped — no URL survives", () => {
    const r = md("![مخطط الشبكة](https://evil.example/a.png)\n\nاقرأ [الدليل](https://evil.example/doc) و ![](http://x.example/i.png)\n\n[ref]: https://evil.example/ref");
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.value)).not.toMatch(/https?:|evil\.example/);
    expect(runsOf(r.value!.blocks[0])).toEqual([{ text: "[صورة: مخطط الشبكة]" }]);
    expect(runsOf(r.value!.blocks[1])).toEqual([{ text: "اقرأ الدليل و [صورة]" }]);
    expect(r.warningCodes).toEqual(expect.arrayContaining(["MARKDOWN_IMAGE_REFUSED", "MARKDOWN_LINK_TEXT_ONLY"]));
  });
  it("display math becomes a math block only when parseMath accepts it, else a paragraph + warning", () => {
    const ok = md("$$\n\\frac{1}{2} g t^{2}\n$$\n\n$$\\sqrt{x}$$");
    expect(ok.value!.blocks).toEqual([{ type: "math", source: "\\frac{1}{2} g t^{2}" }, { type: "math", source: "\\sqrt{x}" }]);
    const bad = md("$$\\href{https://x}{y}$$");
    expect(bad.value!.blocks[0].type).toBe("paragraph");
    expect(bad.warningCodes).toContain("MARKDOWN_MATH_REFUSED");
    expect(errorsOf(bad.value)).toEqual([]);
  });
  it("GitHub alerts become callouts, nested lists are flattened, loose lists stay one list, prose that looks like markup is neutralized", () => {
    const r = md("> [!WARNING]\n> انتبه للجهد\n\n- أ\n  - أ1\n\n- ب\n\nإذا كان x < a فإن …");
    expect(r.ok).toBe(true);
    expect(errorsOf(r.value)).toEqual([]);
    expect(r.value!.blocks[0]).toEqual({ type: "callout", variant: "warning", runs: [{ text: "انتبه للجهد" }] });
    expect((r.value!.blocks[1] as { items: unknown[] }).items).toHaveLength(3);
    expect(runsOf(r.value!.blocks[2])[0].text).toContain("x ＜ a");
    expect(r.warningCodes).toEqual(expect.arrayContaining(["MARKDOWN_NESTED_LIST", "MARKDOWN_TEXT_ADJUSTED"]));
  });
  it("respects RICH_LIMITS: block count, table columns, list items (split, never lost), empty input", () => {
    const many = md(Array.from({ length: 260 }, (_, i) => "فقرة " + i).join("\n\n"));
    expect(many.value!.blocks).toHaveLength(RICH_LIMITS.blocks);
    expect(many.warningCodes).toContain("MARKDOWN_LIMIT");
    expect(errorsOf(many.value)).toEqual([]);
    const wide = md("|" + Array.from({ length: 20 }, (_, i) => " h" + i + " |").join("") + "\n|" + "---|".repeat(20) + "\n|" + " x |".repeat(20));
    expect((wide.value!.blocks[0] as { columnHeaders: string[] }).columnHeaders).toHaveLength(RICH_LIMITS.tableColumns);
    const list = md(Array.from({ length: 150 }, (_, i) => "- " + i).join("\n"));
    expect(list.value!.blocks.map(b => (b as { items: unknown[] }).items.length)).toEqual([100, 50]);
    expect(md("   \n\n")).toEqual({ ok: false, warnings: [expect.any(String)], warningCodes: ["MARKDOWN_EMPTY"] });
    expect(md("<script>x</script>").ok).toBe(false);
  });
});

// ── the block editor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
function EditorHost({ onValue, initial }: { onValue: (v: RichContentV1 | undefined) => void; initial?: RichContentV1 }) {
  const [value, setValue] = useState<RichContentV1 | undefined>(initial);
  return <RichContentEditor value={value} onChange={next => { onValue(next); setValue(next); }} />;
}
const mountEditor = (initial?: RichContentV1) => {
  const box: { value: RichContentV1 | undefined } = { value: initial };
  const r = render(<EditorHost onValue={v => { box.value = v; }} initial={initial} />);
  return { ...r, box };
};
const rootToolbar = () => screen.getByRole("group", { name: "إضافة كتلة" });
const types = (v: RichContentV1 | undefined) => (v?.blocks ?? []).map(b => b.type);
async function answerDialog(label: RegExp) {
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
  await settle();
}

describe("20D1-ED Rich Content block editor", () => {
  it("every toolbar button (but the image picker) adds a structurally VALID block; the document always validates", async () => {
    const { box } = mountEditor();
    await settle();
    const names = ["+ فقرة", "+ عنوان", "+ قائمة", "+ قائمة مرقمة", "+ جدول", "+ كود", "+ CLI", "+ اقتباس", "+ تنبيه", "+ فاصل", "+ قيم", "+ عمودان", "+ صيغة"];
    for (const n of names) {
      fireEvent.click(within(rootToolbar()).getByRole("button", { name: n }));
      expect(errorsOf(box.value), n).toEqual([]);
    }
    expect(types(box.value)).toEqual(["paragraph", "heading", "unorderedList", "orderedList", "table", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "columns", "math"]);
    expect(within(rootToolbar()).getByRole("button", { name: "+ صورة" })).toBeTruthy();
    expect(document.querySelector(".rc-editor [contenteditable]")).toBeNull();
    await settle();
    expect(document.querySelector(".rc-preview .xp-rich")).toBeTruthy();
  });

  it("prose fields convert the safe inline syntax into marks and keep the author's spelling", async () => {
    const { box } = mountEditor();
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ فقرة" }));
    const field = screen.getByLabelText("نص الكتلة 1") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "اضبط _بعناية_ **الأمر** <b>x</b>" } });
    expect(runsOf(box.value!.blocks[0])).toEqual([{ text: "اضبط " }, { text: "بعناية", marks: ["italic"] }, { text: " " }, { text: "الأمر", marks: ["bold"] }, { text: " x" }]);
    expect((screen.getByLabelText("نص الكتلة 1") as HTMLTextAreaElement).value).toBe("اضبط _بعناية_ **الأمر** <b>x</b>");
    expect(screen.getByText(/وسوم HTML لا تُقبل/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "" } });
    expect(box.value!.blocks).toHaveLength(1);                                   // incomplete blocks are emitted as typed (typing never blocked)
    expect(screen.getByLabelText("مشكلات الكتلة 1").textContent).toMatch(/فارغ/);
  });

  it("table: add / remove rows and columns, header + row-header toggles, responsive mode, marked cells", async () => {
    const { box } = mountEditor();
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ جدول" }));
    const t = () => box.value!.blocks[0] as Extract<RichBlock, { type: "table" }>;
    fireEvent.click(screen.getByRole("button", { name: "إضافة صف" }));
    fireEvent.click(screen.getByRole("button", { name: "إضافة عمود" }));
    expect(t().rows).toEqual([["", "", ""], ["", "", ""]]);
    expect(t().columnHeaders).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("الخلية 1،1 في الكتلة 1"), { target: { value: "**PC1**" } });
    fireEvent.change(screen.getByLabelText("الخلية 1،2 في الكتلة 1"), { target: { value: "10" } });
    expect(t().rows[0].slice(0, 2)).toEqual([{ runs: [{ text: "PC1", marks: ["bold"] }] }, "10"]);
    fireEvent.click(screen.getByLabelText("العمود الأول رؤوس صفوف"));
    fireEvent.change(screen.getByLabelText("نمط عرض الكتلة 1"), { target: { value: "stack" } });
    expect(t()).toMatchObject({ rowHeaders: true, responsive: "stack" });
    fireEvent.click(screen.getByRole("button", { name: "حذف العمود 3 من الكتلة 1" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف الصف 2 من الكتلة 1" }));
    expect(t().rows).toEqual([[{ runs: [{ text: "PC1", marks: ["bold"] }] }, "10"]]);
    fireEvent.click(screen.getByLabelText("صف رؤوس الأعمدة"));
    expect("columnHeaders" in t()).toBe(false);
    expect(errorsOf(box.value)).toEqual([]);
  });

  it("columns are ONE level deep: a column offers no '+ عمودان' and its type select offers no columns", async () => {
    const { box } = mountEditor();
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ عمودان" }));
    const col1 = screen.getByRole("group", { name: "إضافة كتلة إلى العمود 1" });
    expect(within(col1).queryByRole("button", { name: "+ عمودان" })).toBeNull();
    fireEvent.click(within(col1).getByRole("button", { name: "+ كود" }));
    const cols = (box.value!.blocks[0] as Extract<RichBlock, { type: "columns" }>).columns;
    expect(cols[0].blocks.map(b => b.type)).toEqual(["paragraph", "code"]);
    const nestedType = screen.getByLabelText("نوع الكتلة 1 من العمود 1") as HTMLSelectElement;
    expect([...nestedType.options].map(o => o.value)).not.toContain("columns");
    expect(errorsOf(box.value)).toEqual([]);
  });

  it("delete is confirmed (cancel keeps the block); deleting the last block emits undefined (the field is removed)", async () => {
    const { box } = mountEditor();
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ اقتباس" }));
    fireEvent.click(screen.getByRole("button", { name: "حذف — الكتلة 1" }));
    await answerDialog(/إلغاء/);
    expect(types(box.value)).toEqual(["quote"]);
    fireEvent.click(screen.getByRole("button", { name: "حذف — الكتلة 1" }));
    await answerDialog(/حذف الكتلة/);
    expect(box.value).toBeUndefined();
  });

  it("type change keeps text silently between prose types and asks before losing content", async () => {
    const { box } = mountEditor();
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ فقرة" }));
    fireEvent.change(screen.getByLabelText("نص الكتلة 1"), { target: { value: "سطر 1\nسطر **2**" } });
    fireEvent.change(screen.getByLabelText("نوع الكتلة 1"), { target: { value: "orderedList" } });
    await settle();
    expect(box.value!.blocks[0]).toEqual({ type: "orderedList", items: [{ runs: [{ text: "سطر 1" }] }, { runs: [{ text: "سطر " }, { text: "2", marks: ["bold"] }] }] });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(screen.getByLabelText("نوع الكتلة 1"), { target: { value: "divider" } });
    await answerDialog(/إلغاء/);
    expect(box.value!.blocks[0].type).toBe("orderedList");
    fireEvent.change(screen.getByLabelText("نوع الكتلة 1"), { target: { value: "table" } });
    await answerDialog(/تغيير النوع/);
    expect(box.value!.blocks[0].type).toBe("table");
  });

  it("move / duplicate / collapse; math shows the parser's verdict live", async () => {
    const { box } = mountEditor();
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ صيغة" }));
    fireEvent.click(within(rootToolbar()).getByRole("button", { name: "+ كود" }));
    fireEvent.click(screen.getByRole("button", { name: "تكرار — الكتلة 2" }));
    expect(types(box.value)).toEqual(["math", "code", "code"]);
    fireEvent.click(screen.getByRole("button", { name: "تحريك لأسفل — الكتلة 1" }));
    expect(types(box.value)).toEqual(["code", "math", "code"]);
    fireEvent.click(screen.getByRole("button", { name: "طيّ — الكتلة 1" }));
    expect(screen.getByRole("button", { name: "فتح — الكتلة 1" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("✓ صيغة صالحة")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("صيغة الكتلة 2"), { target: { value: "\\href{x}{y}" } });
    expect(document.querySelector(".rc-math-bad")!.textContent!.length).toBeGreaterThan(0);
    expect(errorsOf(box.value).map(i => i.code)).toContain("RICH_CONTENT_MATH");
  });

  it("images: raster only (an SVG is refused with a message), alt text is required", async () => {
    const { box } = mountEditor();
    const input = document.querySelector(".rc-toolbar input[type=file]") as HTMLInputElement;
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'], "a.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [svg] } });
    await settle();
    expect(screen.getByRole("alert").textContent).toMatch(/PNG أو JPEG أو WEBP/);
    expect(box.value).toBeUndefined();
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "a.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [png] } });
    await settle();
    expect(types(box.value)).toEqual(["image"]);
    expect(errorsOf(box.value).map(i => i.code)).toEqual(["RICH_CONTENT_IMAGE"]);   // alt missing
    fireEvent.change(screen.getByLabelText("الوصف البديل لـالكتلة 1"), { target: { value: "مخطط" } });
    fireEvent.change(screen.getByLabelText("تعليق الكتلة 1 (اختياري)"), { target: { value: "الشكل *1*" } });
    expect(box.value!.blocks[0]).toMatchObject({ type: "figure", alt: "مخطط", caption: [{ text: "الشكل " }, { text: "1", marks: ["italic"] }] });
    expect(errorsOf(box.value)).toEqual([]);
  });

  it("add buttons are disabled at the block limit; an external value change re-syncs the editor", async () => {
    const full: RichContentV1 = { schemaVersion: 1, blocks: Array.from({ length: RICH_LIMITS.blocks }, () => ({ type: "divider" as const })) };
    mountEditor(full);
    expect((within(rootToolbar()).getByRole("button", { name: "+ فقرة" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    function Ext() {
      const [v, setV] = useState<RichContentV1 | undefined>({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "أول" }] }] });
      return <><button type="button" onClick={() => setV({ schemaVersion: 1, blocks: [{ type: "heading", level: 2, runs: [{ text: "خارجي" }] }] })}>استبدال</button><RichContentEditor value={v} onChange={setV} /></>;
    }
    render(<Ext />);
    expect((screen.getByLabelText("نص الكتلة 1") as HTMLTextAreaElement).value).toBe("أول");
    fireEvent.click(screen.getByRole("button", { name: "استبدال" }));
    expect((screen.getByLabelText("نص الكتلة 1") as HTMLInputElement).value).toBe("خارجي");
  });
});

// ── builder integration ────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("20D1-INT builder integration", () => {
  it("QuestionComposer: converting the plain text shows a PREVIEW first; confirming writes richContent only (text untouched)", async () => {
    const onChange = vi.fn();
    const q = newQuestion("shortAnswer", { text: "## معطيات\n\nاحسب **السرعة** <script>x</script>" });
    render(<QuestionComposer question={q} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "تحويل النص إلى محتوى منسق" }));
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("rc-convert-preview").textContent).toContain("السرعة");
    expect(within(dialog).getByTestId("rc-convert-warnings").textContent).toMatch(/HTML/);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "اعتماد المحتوى المنسق" }));
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0] as Obj;
    expect(Object.keys(patch)).toEqual(["richContent"]);
    expect(errorsOf(patch.richContent)).toEqual([]);
    expect((patch.richContent as RichContentV1).blocks.map(b => b.type)).toEqual(["heading", "paragraph"]);
  });

  it("QuestionComposer: the toggle opens the lazy editor; the fallback action fills an EMPTY text only; parametric / compound get no rich editor", async () => {
    const onChange = vi.fn();
    const rich: RichContentV1 = { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "نص منسق" }] }] };
    const { rerender } = render(<QuestionComposer question={{ ...newQuestion("shortAnswer", { text: "" }), richContent: rich } as unknown as BuilderQuestion} onChange={onChange} />);
    await settle();
    expect(document.querySelector(".rc-editor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "استخدام نص المحتوى كنص بديل" }));
    await settle();
    expect(onChange).toHaveBeenLastCalledWith({ text: "نص منسق" });
    rerender(<QuestionComposer question={{ ...newQuestion("shortAnswer", { text: "نص صريح" }), richContent: rich } as unknown as BuilderQuestion} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "استخدام نص المحتوى كنص بديل" })).toBeNull();
    cleanup();
    render(<QuestionComposer question={newQuestion("parametricNumeric")} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "محتوى منسق للسؤال" })).toBeNull();
    expect(screen.getByText(/المحتوى المنسق غير متاح لأسئلة القوالب العددية/)).toBeTruthy();
    cleanup();
    render(<QuestionComposer question={newQuestion("compound")} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "محتوى منسق للسؤال" })).toBeNull();
  });

  it("CompositeEditor: a part's richContent survives a type change, and is dropped when the part becomes parametricNumeric", async () => {
    const question = compositeArabicExam().sections[0].questions[0] as unknown as Obj;
    const rich: RichContentV1 = { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "بند منسق" }] }] };
    const groups = (question.composite as { groups: { parts: Obj[] }[] }).groups;
    groups[0].parts[0] = { ...groups[0].parts[0], richContent: rich };
    const box = { q: question };
    function Host() {
      const [q, setQ] = useState<Obj>(question);
      return <CompositeEditor node={q as unknown as QuestionBody} onChange={patch => setQ(prev => { const next = mergePatch(prev, patch as Obj); box.q = next; return next; })} />;
    }
    render(<Host />);
    await settle();
    const part0 = () => (box.q.composite as { groups: { parts: Obj[] }[] }).groups[0].parts[0];
    fireEvent.change(screen.getByLabelText("نوع البند أ"), { target: { value: "shortAnswer" } });
    await answerDialog(/تغيير النوع/);
    expect(part0().type).toBe("shortAnswer");
    expect(part0().richContent).toEqual(rich);
    fireEvent.change(screen.getByLabelText("نوع البند أ"), { target: { value: "parametricNumeric" } });
    if (screen.queryByRole("dialog")) await answerDialog(/تغيير النوع/);
    expect(part0().type).toBe("parametricNumeric");
    expect("richContent" in part0()).toBe(false);
  });
});

describe("20D.1 internal review — Markdown converter stays linear on adversarial bracket runs", () => {
  it("300 000 characters of unmatched image / link openers convert in well under the test timeout (was quadratic: per-position slice + unbounded scan)", () => {
    for (const md of ["![".repeat(150000), "[".repeat(300000), "[a](".repeat(75000)]) {
      const t = performance.now();
      const r = markdownToRichContent(md);
      expect(r).toHaveProperty("warnings");
      expect(performance.now() - t).toBeLessThan(4000);
    }
  });
  it("the bounded matchers still convert ordinary links / images (text kept, URL dropped)", () => {
    const r = markdownToRichContent("نص [رابط](https://x) و ![صورة](https://y.png)");
    expect(JSON.stringify(r.value)).toContain("نص رابط و [صورة: صورة]");
    expect(JSON.stringify(r.value)).not.toMatch(/https:/);
  });
});
