// @vitest-environment happy-dom
// 791381s Phase 8C-2 (docs/enterprise-791381s-enrichment-plan.md §11.4, §18) — the ADVANCED exam item in the Reader:
//   • the `exam-item` block is metadata only (validator) and renders a card; without a host it stays static (no network);
//   • «حلّ السؤال» mounts the lazy view, which loads the SANITIZED exam from the host and renders it through the student exam's
//     own question card (a registered type answers through onAnswer);
//   • «تحقّق» sends ONLY the answers map; the official grader's verdict shows per question with words (never colour only),
//     the part counts, the explanation of an answered question and the score line; an edit clears it; «أعد المحاولة» empties;
//   • a failed load offers a retry; a failed check is an error line — never a wrong verdict;
//   • the transport calls /api/learning-exam-item/{course}/{item}[/check] with the actor's own headers.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "../reader/LearningPageRenderer";
import { validateLearningCourseContent } from "../content/validation";
import { cloneCourse } from "../content/content.fixtures";
import type { ContentBlock, ContentPage } from "../content/types";
import type { ExamItemCheckResponse, ExamItemHost, ExamItemLoadResponse } from "../training/types";
import { createTrainingClient } from "../training/trainingClient";
import type { Question } from "../../StudentQuestionCard";
import * as sanitizer from "../../../api/src/lib/student-exam-sanitize.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: { id: string; questions: Question[] }[] } }).sanitizeExamForStudent;
const served = (): ExamItemLoadResponse => ({
  ok: true, actor: "student",
  item: { itemId: "adv1", label: "تدريب متقدّم: طبقة النقل", moduleId: "791381s-m10", questionCount: 2, totalMarks: 3 },
  exam: sanitize({ sections: [{ id: "s1", title: "س", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما بروتوكول التصفّح؟", marks: 1, options: [{ text: "HTTP" }, { text: "FTP" }], answer: { correctOptionIndex: 0 } },
    { examQuestionId: "q2", presentationType: "multipleSelect", questionTypeVersion: 1, text: "أي البروتوكولات في طبقة النقل؟", marks: 2, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "allOrNothing" } },
  ] }] }),
});
const graded = (): ExamItemCheckResponse => ({ ok: true, actor: "student", persisted: false, result: { score: 1, totalMarks: 3, percentage: 33, questions: [
  { questionId: "q1", answered: true, correct: true, manualReview: false, score: 1, maxMarks: 1, explanation: "HTTP لتصفّح المواقع." },
  { questionId: "q2", answered: true, correct: false, manualReview: false, score: 0, maxMarks: 2, parts: { correct: 1, total: 2 }, explanation: "TCP و UDP بروتوكولا طبقة النقل." },
] } });
const block: ContentBlock = { id: "m10-l02-p01-x-adv1", type: "exam-item", origin: "teacher-enrichment", itemId: "adv1", label: "تدريب متقدّم: طبقة النقل" };
const page: ContentPage = { id: "c-p1", title: "تدريبات الوحدة", order: 1, layout: "practice", source: { kind: "book", sourceId: "c", pdfPageStart: 1 }, blocks: [block] };
const header: ReaderPageHeader = { courseId: "791381s", pageTitle: page.title, moduleTitle: "الوحدة", lessonTitle: "تدريبات الوحدة", position: { index: 1, total: 1 }, source: page.source };
const show = (host?: ExamItemHost) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} examItems={host} />);
const open = async () => { fireEvent.click(screen.getByRole("button", { name: /حلّ السؤال/ })); return screen.findByTestId("exam-item-view", {}, { timeout: 4000 }); };
const answerBoth = async () => {
  fireEvent.click(within(screen.getByText("ما بروتوكول التصفّح؟").closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
  const boxes = within(await screen.findByRole("group", { name: /أي البروتوكولات/ })).getAllByRole("checkbox");
  fireEvent.click(boxes[0]); fireEvent.click(boxes[2]);
};

describe("the exam-item block", () => {
  const codes = (b: ContentBlock) => { const c = cloneCourse(); c.modules[0].lessons[0].pages[0].blocks = [b]; return validateLearningCourseContent(c).map(i => i.code); };
  it("is metadata only (id, type, origin, itemId, label), teacher enrichment, with a safe item id", () => {
    expect(codes(block)).toEqual([]);
    for (const bad of [{ ...block, itemId: "../x" }, { ...block, label: " " }, { ...block, question: "x" }, { ...block, answer: 1 }, { ...block, origin: "book" }]) {
      expect(codes(bad as ContentBlock), JSON.stringify(bad)).toContain("exam-item-invalid");
    }
  });
  it("without a host the card is static: the label and a note, no button, no network", () => {
    show(undefined);
    expect(screen.getByText("تدريب متقدّم: طبقة النقل")).toBeTruthy();
    expect(screen.getByText(/يُحلّ هذا السؤال تفاعليًا من داخل المنصة/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /حلّ السؤال/ })).toBeNull();
  });
});

describe("the lazy item view", () => {
  it("loads the sanitized exam; «تحقّق» sends ONLY the answers; the verdict per question with words, parts, explanations and the score", async () => {
    const host = { load: vi.fn(async () => served()), check: vi.fn(async () => graded()) };
    const { container } = show(host);
    await open();
    expect(host.load).toHaveBeenCalledWith("adv1");
    expect(container.innerHTML).not.toMatch(/correctOptionIds|correctOptionIndex"?:\s*0|allOrNothing/);
    await answerBoth();
    expect(screen.getByText(/أجبت عن/, { selector: ".learning-examitem-count" }).textContent).toContain("2");
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await screen.findByText(/نتيجتك:/);
    expect(host.check).toHaveBeenCalledWith("adv1", { q1: { kind: "choice", index: 0 }, q2: { kind: "multiChoice", optionIds: ["o1", "o3"] } });
    const rows = [...container.querySelectorAll(".learning-examitem-q")];
    expect(rows[0].className).toContain("is-right");
    expect(rows[0].textContent).toContain("صحيح");
    expect(rows[1].className).toContain("is-wrong");
    expect(rows[1].textContent).toContain("غير صحيح");
    expect(rows[1].textContent).toContain("1 / 2");
    expect(screen.getByText("TCP و UDP بروتوكولا طبقة النقل.")).toBeTruthy();
    expect(screen.getByText(/نتيجتك:/).textContent).toContain("1 / 3");
    expect(screen.getByText(/لا تُسجَّل علامة/)).toBeTruthy();
    // an edit clears the verdict; «أعد المحاولة» empties the answers
    fireEvent.click(within(await screen.findByRole("group", { name: /أي البروتوكولات/ })).getAllByRole("checkbox")[1]);
    expect(container.querySelector(".learning-examitem-q.is-wrong")).toBeNull();
    expect(screen.queryByText(/نتيجتك:/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(screen.getByText(/أجبت عن/, { selector: ".learning-examitem-count" }).textContent).toContain("0");
    expect((screen.getByRole("button", { name: "تحقّق" }) as HTMLButtonElement).disabled).toBe(true);
  }, 30000);

  it("a failed load offers «إعادة المحاولة»; a failed check is an error line — never a wrong verdict", async () => {
    let fail = true;
    const host = { load: vi.fn(async () => { if (fail) throw new Error("تعذّر فتح السؤال حاليًا."); return served(); }), check: vi.fn(async () => { throw new Error("تعذّر فتح هذا السؤال حاليًا. حاول مرة أخرى لاحقًا."); }) };
    const { container } = show(host);
    fireEvent.click(screen.getByRole("button", { name: /حلّ السؤال/ }));
    await screen.findByText("تعذّر فتح السؤال حاليًا.");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByTestId("exam-item-view");
    await answerBoth();
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await screen.findByText(/حاول مرة أخرى لاحقًا/);
    expect(container.querySelector(".learning-examitem-q.is-wrong, .learning-examitem-q.is-right")).toBeNull();
  }, 30000);
});

describe("the transport", () => {
  it("GET /api/learning-exam-item/{course}/{item} and POST …/check { answers } with the actor's headers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return { ok: true, json: async () => ({ ok: true }) } as Response; }));
    const c = createTrainingClient({ "x-student-token": "tok", Authorization: "Bearer tok" });
    await c.examItems!.load("791381s", "adv1");
    await c.examItems!.check("791381s", "adv1", { q1: { kind: "choice", index: 0 } });
    expect(calls[0].url).toBe("/api/learning-exam-item/791381s/adv1");
    expect(calls[1].url).toBe("/api/learning-exam-item/791381s/adv1/check");
    expect(calls[1].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ answers: { q1: { kind: "choice", index: 0 } } });
    const sentHeaders = (calls[0].init && calls[0].init.headers) as Record<string, string>;
    expect(sentHeaders["x-student-token"]).toBe("tok");
    vi.unstubAllGlobals();
  });
});
