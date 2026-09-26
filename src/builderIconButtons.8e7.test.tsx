// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import StructuredQuestionEditor from "./StructuredQuestionEditor";
import QuestionBodyEditor from "./QuestionBodyEditor";
import QuestionFieldEditor from "./QuestionFieldEditor";
import TableFillEditor from "./TableFillEditor";
import CliFillEditor from "./CliFillEditor";
import CompoundQuestionEditor from "./CompoundQuestionEditor";
import StimulusEditor from "./StimulusEditor";
import ExamSectionEditor from "./ExamSectionEditor";
import { newQuestion, newField, newPart, buildMatchingPatch } from "./examBuilderState";
import type { BuilderSection } from "./examTypes";

// Phase 8E-7 — the builders' compact glyph buttons (↑ ↓ ⧉ × 🗑 ↩) carried their label ONLY in `title`. A button's
// accessible name comes from its content first, so assistive tech announced the glyph («×», «↑»), and `title` was the
// sole human label — a tooltip is not a name. Each glyph button now has an `aria-label` equal to its former title
// (the tooltip stays). Nothing visual changes.

afterEach(cleanup);

const names = (...labels: string[]) => { for (const l of labels) expect(screen.getAllByRole("button", { name: l }).length, l).toBeGreaterThan(0); };
const noGlyphNames = () => {
  for (const b of screen.getAllByRole("button")) {
    const text = (b.textContent || "").trim();
    const name = b.getAttribute("aria-label") || text;
    expect(/\p{L}/u.test(name), `glyph-only accessible name «${name}»`).toBe(true); // a real word, not just ↑ × ⧉ …
    if (b.hasAttribute("title")) expect(b.hasAttribute("aria-label") || /\p{L}/u.test(text), `title-only button «${b.getAttribute("title")}»`).toBe(true);
  }
};

describe("Phase 8E-7 — builder glyph buttons have real accessible names", () => {
  it("StructuredQuestionEditor: preview / move up / move down / duplicate / delete + the collapse toggle exposes its state", () => {
    render(<StructuredQuestionEditor question={newQuestion("multipleChoice")} index={0} total={2} sectionOptions={[{ id: "s1", title: "القسم الأول" }]} currentSectionId="s1" groupOptions={[]} onChange={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onDuplicate={vi.fn()} onMoveToSection={vi.fn()} onPreview={vi.fn()} />);
    names("معاينة الطالب", "أعلى", "أسفل", "تكرار", "حذف");
    const collapse = screen.getByRole("button", { name: "طيّ" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(collapse);
    expect(screen.getByRole("button", { name: "فتح" }).getAttribute("aria-expanded")).toBe("false");
    noGlyphNames();
  });

  it("QuestionBodyEditor: MCQ option move/delete and matching-pair delete", () => {
    const mcq = newQuestion("multipleChoice", { options: [{ text: "أ" }, { text: "ب" }, { text: "ج" }] });
    render(<QuestionBodyEditor node={mcq} type="multipleChoice" onChange={vi.fn()} />);
    names("أعلى", "أسفل", "حذف");
    noGlyphNames();
    cleanup();
    const matching = newQuestion("matching", buildMatchingPatch([{ left: "أ", right: "1" }, { left: "ب", right: "2" }]));
    render(<QuestionBodyEditor node={matching} type="matching" onChange={vi.fn()} />);
    names("حذف");
    noGlyphNames();
  });

  it("CompoundQuestionEditor: part move up / move down / duplicate / delete", () => {
    const q = newQuestion("compound", { parts: [newPart("multipleChoice"), newPart("shortAnswer")] });
    render(<CompoundQuestionEditor question={q} onChange={vi.fn()} />);
    names("أعلى", "أسفل", "تكرار", "حذف");
    noGlyphNames();
  });

  it("StimulusEditor: delete stimulus", () => {
    render(<StimulusEditor stimuli={{ st1: { title: "مخطط", text: "" } }} onChange={vi.fn()} />);
    names("حذف");
    noGlyphNames();
  });

  it("QuestionFieldEditor (statements + blanks): move up / move down / delete per row", () => {
    const tf = newQuestion("multiTrueFalse");
    render(<QuestionFieldEditor node={tf} type="multiTrueFalse" onChange={vi.fn()} />);
    names("أعلى", "أسفل", "حذف");
    noGlyphNames();
    cleanup();
    const fill = newQuestion("fillBlank");
    render(<QuestionFieldEditor node={fill} type="fillBlank" onChange={vi.fn()} />);
    names("أعلى", "أسفل", "حذف");
    noGlyphNames();
  });

  it("TableFillEditor: delete column / delete row / un-mark answer cell", () => {
    const q = newQuestion("tableFill", { tableHeaders: ["أ", "ب"], tableRows: [["", ""], ["", ""]], fields: [newField({ row: 0, column: 1, kind: "text" })] });
    render(<TableFillEditor question={q} onChange={vi.fn()} />);
    names("حذف العمود", "حذف الصف", "إلغاء كخلية جواب");
    noGlyphNames();
  });

  it("CliFillEditor: delete field", () => {
    const q = newQuestion("cliFill", { cli: "ping [[f1]]", fields: [newField({ id: "f1" })] });
    render(<CliFillEditor question={q} onChange={vi.fn()} />);
    names("حذف الحقل");
    noGlyphNames();
  });

  it("ExamSectionEditor: move up / move down", () => {
    const section = { id: "s1", title: "القسم", instructions: "", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [] } as unknown as BuilderSection;
    render(<ExamSectionEditor section={section} index={0} total={2} sectionOptions={[{ id: "s1", title: "القسم" }]} patch={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onAddQuestion={vi.fn()} onQuestionChange={vi.fn()} onQuestionDelete={vi.fn()} onQuestionMove={vi.fn()} onQuestionDuplicate={vi.fn()} onQuestionMoveToSection={vi.fn()} onPreviewQuestion={vi.fn()} />);
    names("أعلى", "أسفل");
    noGlyphNames();
  });

  it("App.tsx legacy builder: every question-order glyph button carries an aria-label equal to its title", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
    const start = src.indexOf('className="question-order-actions"');
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, src.indexOf("</div>", start));
    const buttons = block.match(/<button[\s\S]*?>/g) || [];
    expect(buttons.length).toBe(4);
    for (const b of buttons) {
      const title = b.match(/title="([^"]+)"/)?.[1];
      expect(title, b).toBeTruthy();
      expect(b.match(/aria-label=\{?"?([^"}]+)"?\}?/)?.[1], "aria-label on " + title).toBe(title);
    }
  });
});
