// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import PresentationStudio from "./PresentationStudio";
import RichContentEditor from "../richContent/RichContentEditor";
import { markdownToRichContent } from "../richContent/markdownToRichContent";
import { validateRichContent } from "../richContent/richContentModel";

// Phase 20D.1 — authoring: a lazy Presentation Studio with a REAL live preview, a block-based Rich Content editor (no contenteditable
// HTML) and a safe Markdown → RichContentV1 converter. Fail-first on 0b22080: none of these modules exist.
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 15; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");
type Obj = Record<string, unknown>;
const EXAM = () => ({ title: "امتحان", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "سؤال", marks: 2, options: [{ text: "أ" }, { text: "ب" }] }] }] });

function StudioHost({ initial, box }: { initial: Obj; box: { exam: Obj } }) {
  const [exam, setExam] = useState<Obj>(initial);
  return <PresentationStudio exam={exam as never} onChange={(up: (prev: Obj) => Obj) => setExam(prev => { const next = up(prev); box.exam = next; return next; })} onClose={() => {}} />;
}

describe("20D1-A1 Presentation Studio", () => {
  it("is a lazy builder panel; picking a preset writes exam.presentation (schemaVersion 1) and the live preview renders through the REAL student components", async () => {
    expect(read("src/StructuredExamBuilder.tsx")).toMatch(/lazy\(\(\) => import\("\.\/presentation\/PresentationStudio"\)\)/);
    const box = { exam: EXAM() as Obj };
    render(<StudioHost initial={EXAM()} box={box} />);
    await settle();
    for (const tab of ["القوالب", "الألوان", "الخطوط", "التخطيط", "المكوّنات", "أنواع الأسئلة", "الأقسام", "الطباعة", "إمكانية الوصول"]) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /مختبر الشبكات/ }));
    await settle();
    expect(box.exam.presentation).toEqual({ schemaVersion: 1, preset: "networkLab" });
    const preview = document.querySelector("[data-testid=xp-studio-preview]")!;
    expect(preview.querySelector(".exam-presentation[data-xp-preset=networkLab] article.iex-q")).toBeTruthy();
    for (const vp of ["سطح المكتب", "جهاز لوحي", "هاتف"]) expect(screen.getByRole("button", { name: vp })).toBeTruthy();
  });
  it("an inaccessible palette is warned clearly; resetting the whole presentation asks for confirmation first", async () => {
    const box = { exam: { ...EXAM(), presentation: { schemaVersion: 1, preset: "default", tokens: { colors: { text: "#EEEEEE" } } } } as Obj };
    render(<StudioHost initial={box.exam} box={box} />);
    await settle();
    expect(document.querySelector("[data-testid=xp-contrast-warning]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط العرض بالكامل" }));
    await settle();
    const dialog = screen.getAllByRole("dialog").at(-1)!;
    fireEvent.click(within(dialog).getByRole("button", { name: /إعادة الضبط|تأكيد/ }));
    await settle();
    expect(box.exam.presentation).toBeUndefined();
  });
});

describe("20D1-A2 Rich Content block editor", () => {
  function EditorHost({ box }: { box: { value: Obj | undefined } }) {
    const [value, setValue] = useState<Obj | undefined>(undefined);
    return <RichContentEditor value={value as never} onChange={(next: Obj | undefined) => { box.value = next; setValue(next); }} />;
  }
  it("adds paragraph and table blocks, edits table rows/columns, reorders, and always emits a VALID RichContentV1", async () => {
    const box: { value: Obj | undefined } = { value: undefined };
    render(<EditorHost box={box} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "+ فقرة" }));
    fireEvent.click(screen.getByRole("button", { name: "+ جدول" }));
    await settle();
    const blocks = () => (box.value as { blocks: Obj[] }).blocks;
    expect(blocks().map(b => b.type)).toEqual(["paragraph", "table"]);
    fireEvent.click(screen.getByRole("button", { name: "إضافة صف" }));
    fireEvent.click(screen.getByRole("button", { name: "إضافة عمود" }));
    await settle();
    const t = blocks()[1] as { rows: unknown[][] };
    expect(t.rows.length).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByRole("button", { name: /تحريك لأعلى/ })[1]);
    await settle();
    expect(blocks().map(b => b.type)).toEqual(["table", "paragraph"]);
    expect(validateRichContent(box.value).issues.filter(i => i.code !== "RICH_CONTENT_EMPTY" && i.severity === "error")).toEqual([]);
  });
  it("never uses contenteditable HTML", () => {
    expect(read("src/richContent/RichContentEditor.tsx")).not.toMatch(/contentEditable|contenteditable/);
  });
});

describe("20D1-A3 Markdown → RichContentV1 (safe subset, lazy, builder only)", () => {
  it("headings, paragraphs, bold/italic/code, lists, blockquote, rule, fenced code and pipe tables become structured blocks", () => {
    const md = "## معطيات الشبكة\n\nاضبط **الأمر** `switchport mode trunk` *بعناية*.\n\n- أولًا\n- ثانيًا\n\n1. خطوة\n2. خطوة ثانية\n\n> العلم نور\n\n---\n\n```python\nprint(1)\n```\n\n| الجهاز | VLAN |\n|---|---|\n| PC1 | 10 |\n| PC2 | 20 |\n";
    const r = markdownToRichContent(md);
    expect(r.ok).toBe(true);
    expect(validateRichContent(r.value).issues.filter(i => i.severity === "error")).toEqual([]);
    expect(r.value!.blocks.map((b: { type: string }) => b.type)).toEqual(["heading", "paragraph", "unorderedList", "orderedList", "quote", "divider", "code", "table"]);
    const table = r.value!.blocks[7] as { columnHeaders: string[]; rows: string[][] };
    expect(table.columnHeaders).toEqual(["الجهاز", "VLAN"]);
    expect(table.rows).toEqual([["PC1", "10"], ["PC2", "20"]]);
    const para = r.value!.blocks[1] as { runs: { text: string; marks?: string[] }[] };
    expect(para.runs.find(x => x.text === "الأمر")!.marks).toEqual(["bold"]);
    expect(para.runs.find(x => x.text === "switchport mode trunk")!.marks).toEqual(["code"]);
  });
  it("raw HTML is never passed through; remote images are never loaded; script fences are plain code", () => {
    const r = markdownToRichContent("<script>alert(1)</script>\n\n![x](https://evil.example/x.png)\n\n<iframe src=x></iframe>\n\n```html\n<b>x</b>\n```");
    const json = JSON.stringify(r.value ?? {});
    expect(json).not.toContain("<script>");
    expect(json).not.toContain("<iframe");
    expect(json).not.toContain("https://evil.example");
    expect(r.warnings.length).toBeGreaterThan(0);
    if (r.value) expect(validateRichContent(r.value).issues.filter(i => i.severity === "error")).toEqual([]);
  });
  it("the converter and the editor are lazy (never in the student runtime, never in the initial graph)", () => {
    const composer = read("src/QuestionComposer.tsx");
    expect(composer).toMatch(/lazy\(\(\) => import\("\.\/richContent\/RichContentEditor"\)\)/);
    for (const f of ["src/StudentQuestionCard.tsx", "src/StudentExamPage.tsx", "src/ExamPreview.tsx"]) expect(read(f)).not.toMatch(/markdownToRichContent|RichContentEditor|PresentationStudio/);
  });
});

describe("20D1-A4 bundle guard", () => {
  it("the bundle guard knows the presentation / rich-content signatures and the budget is unchanged", () => {
    const guard = read("scripts/check-bundle-budget.mjs");
    expect(guard).toMatch(/PRESENTATION_SIGNATURES/);
    for (const s of ["xp-studio", "rc-editor", "RICH_CONTENT_RAW_HTML", "MARKDOWN_HTML_REFUSED", "mfrac"]) expect(guard).toContain('"' + s + '"');
    expect(guard).toMatch(/INITIAL_JS_GZIP_BUDGET_KB = 125;/);
    const card = read("src/StudentQuestionCard.tsx");
    expect(card).toMatch(/lazy\(\(\)=>import\("\.\/richContent\/RichPrompt"\)\)/);
    expect(card).not.toMatch(/from "\.\/richContent\/richContentModel"|from "\.\/presentation\/presentationModel"/);
  });
});
