// @vitest-environment happy-dom
// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — a C# trace table (tableFill + a csharp codeStimulus, the planned form of
// the book's «تتبّع بجدول متابعة») renders in the Reader's exam item through the student exam's own question card: the program is
// shown EXACTLY, left to right, named for assistive technology; the table's empty cells are the answer fields; «تحقّق» sends only
// the typed values. The served exam is the real sanitizer's projection (no key reaches the view).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import LearningPageRenderer, { type ReaderPageHeader } from "../reader/LearningPageRenderer";
import type { ContentBlock, ContentPage } from "../content/types";
import type { ExamItemCheckResponse, ExamItemLoadResponse } from "../training/types";
import type { Question } from "../../StudentQuestionCard";
import * as sanitizer from "../../../api/src/lib/student-exam-sanitize.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

const SOURCE = readFileSync(join(process.cwd(), "docs", "enterprise-899371-learning", "probes", "c04-h-q1", "Program.cs"), "utf8");
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { id: string; questions: Question[] }[] } }).sanitizeExamForStudent;
const served = (): ExamItemLoadResponse => ({
  ok: true, actor: "student",
  item: { itemId: "trace1", label: "تتبّع: جملة الشرط", moduleId: "791381s-m10", questionCount: 1, totalMarks: 4 },
  exam: sanitize({ sections: [{ id: "s1", title: "س", gradingPolicy: "all", stimuli: {}, questions: [{
    examQuestionId: "t1", presentationType: "tableFill", questionTypeVersion: 1, marks: 4, text: "تتبّع البرنامج بالمدخلات a=5, b=2, c=7 وأكمل جدول المتابعة.",
    codeStimulus: { language: "csharp", source: SOURCE, label: "ف4 بيتية س1" },
    tableHeaders: ["a", "b", "c", "المخرج"], tableRows: [["5", "2", "", ""]],
    fields: [{ id: "c-after", kind: "text", row: 0, column: 2, correct: "7" }, { id: "out", kind: "text", row: 0, column: 3, correct: "7" }],
  }] }] }),
});
const graded = (): ExamItemCheckResponse => ({ ok: true, actor: "student", persisted: false, result: { score: 4, totalMarks: 4, percentage: 100, questions: [
  { questionId: "t1", answered: true, correct: true, manualReview: false, score: 4, maxMarks: 4, parts: { correct: 2, total: 2 } },
] } });
const block: ContentBlock = { id: "m04-x-trace1", type: "exam-item", origin: "teacher-enrichment", itemId: "trace1", label: "تتبّع: جملة الشرط" };
const page: ContentPage = { id: "c-p1", title: "تدريبات الوحدة", order: 1, layout: "practice", source: { kind: "book", sourceId: "c", pdfPageStart: 1 }, blocks: [block] };
const header: ReaderPageHeader = { courseId: "791381s", pageTitle: page.title, moduleTitle: "الوحدة", lessonTitle: "تدريبات الوحدة", position: { index: 1, total: 1 }, source: page.source };

describe("a C# trace table in the exam item", () => {
  it("shows the exact program, the table's answer cells, and sends only the typed values", async () => {
    const host = { load: vi.fn(async () => served()), check: vi.fn(async () => graded()) };
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} examItems={host} />);
    fireEvent.click(screen.getByRole("button", { name: /حلّ السؤال/ }));
    const view = await screen.findByTestId("exam-item-view", {}, { timeout: 4000 });

    const code = await within(view).findByTestId("code-stimulus", {}, { timeout: 4000 });   // the card loads the stimulus view lazily
    const pre = code.querySelector("pre") as HTMLElement;
    expect(pre.textContent).toBe(SOURCE);
    expect(pre.getAttribute("dir")).toBe("ltr");
    expect(pre.getAttribute("aria-label")).toBe("ف4 بيتية س1 (C#)");
    expect(JSON.stringify(served())).not.toContain("\"correct\"");

    const inputs = within(view).getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: "7" } });
    fireEvent.change(inputs[1], { target: { value: "7" } });
    fireEvent.click(within(view).getByRole("button", { name: /تحقّق/ }));
    await vi.waitFor(() => expect(host.check).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText(/4\s*\/\s*4|4 من 4/)).length).toBeGreaterThan(0);
    const sent = host.check.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(JSON.stringify(sent)).toContain("\"kind\":\"fields\"");
    expect(JSON.stringify(sent)).toContain("\"c-after\":\"7\"");
    expect(JSON.stringify(sent)).not.toMatch(/score|correct/);
  });
});
