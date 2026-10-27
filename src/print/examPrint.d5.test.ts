// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildExamPrintHtml, printExam, printableImageSrc, richPlainText } from "./examPrint";
import type { StructuredExam } from "../examTypes";

// D5 (item 9, owner decision) — the paper copy of an exam: a STUDENT PAPER (no key anywhere) and a separate ANSWER KEY. One escaped,
// self-contained print document; images only from data: / same-origin; interactive families print their prompt with a note.

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const exam = {
  examId: "e1", title: "اختبار <الوحدة> الأولى", metadata: { school: "مدرسة النور", subject: "علوم", grade: "التاسع", generalInstructions: "أجب عن جميع الأسئلة." },
  sections: [
    { id: "s1", title: "القسم الأول", instructions: "اقرأ جيدًا", gradingPolicy: "all", stimuli: { g1: { title: "نص القراءة", text: "كان يا ما كان" } }, questions: [
      { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة الأردن؟", marks: 2, groupId: "g1", options: [{ text: "إربد" }, { text: "عمّان" }, { text: "العقبة" }], answer: { correctOptionIndex: 1 }, image: { exists: true, visible: true, assets: [{ dataUrl: PNG }, { dataUrl: "https://evil.example/x.png" }] } },
      { examQuestionId: "q2", presentationType: "trueFalse", text: "الشمس نجم.", marks: 1, answer: { correct: true } },
      { examQuestionId: "q3", presentationType: "matching", text: "صل", marks: 3, fields: [{ id: "f1", label: "ماء", correct: "زاي-سائل" }, { id: "f2", label: "ثلج", correct: "ألف-صلب" }] },
      { examQuestionId: "q4", presentationType: "shortAnswer", text: "عرّف الخلية.", marks: 2, answer: { text: "SECRET-SHORT وحدة بناء الكائن الحي" } },
      { examQuestionId: "q5", presentationType: "numericResponse", text: "احسب", marks: 2, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.1, unit: "م/ث²" } }
    ] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "firstNAnswered", requiredAnswers: 1, questions: [
      { examQuestionId: "q6", displayNumber: "6أ", presentationType: "compound", text: "أجب عن الآتي", marks: 4, parts: [
        { id: "p1", type: "multipleChoice", text: "اختر", marks: 1, options: [{ text: "س" }, { text: "ص" }], answer: { correctOptionIndex: 0 } },
        { id: "p2", type: "shortAnswer", text: "اشرح", marks: 3, answer: { text: "SECRET-PART" } }
      ] },
      { examQuestionId: "q7", presentationType: "coding", text: "اكتب دالة", marks: 5, coding: { language: "python", starterCode: "def solve():\n    pass" }, answer: { hiddenTests: [{ input: "SECRET-HIDDEN-INPUT", expected: "SECRET-HIDDEN-OUT" }], referenceSolutions: ["SECRET-REFERENCE"] } },
      { examQuestionId: "q8", presentationType: "hotspot", text: "حدد المنطقة", marks: 2, answer: { regions: [{ id: "SECRET-REGION" }] } },
      { examQuestionId: "q9", presentationType: "openResponse", text: "ناقش", marks: 6, openResponse: { instructions: "اكتب فقرة" }, answer: { modelAnswer: "SECRET-MODEL", rubric: [{ guidance: "SECRET-GUIDANCE" }] } }
    ] }
  ]
} as unknown as StructuredExam;

describe("the student paper", () => {
  const html = buildExamPrintHtml(exam, "student");
  it("carries the header, the name line, the instructions, every section and question with its official marks", () => {
    expect(html).toContain("<title>اختبار &lt;الوحدة&gt; الأولى</title>");
    expect(html).not.toContain("<الوحدة>");
    expect(html).toContain("مدرسة النور");
    expect(html).toContain("اسم الطالب:");
    expect(html).toContain("أجب عن جميع الأسئلة.");
    expect(html).toContain("القسم الأول");
    expect(html).toContain("أجب عن 1 فقط من أسئلة هذا القسم.");
    expect(html).toContain("<dd>27</dd>");                                                  // total marks: 2+1+3+2+2+4+5+2+6
    expect(html).toContain('<span class="q-num">6أ</span>');                                  // a teacher's display number wins
    expect(html).toContain("علامتان");
    expect(html).toContain("ب)</b>");                                                         // compound part labels
    expect(html).toContain("نص القراءة");                                                      // the section stimulus, once
  });
  it("never carries an answer: no key box, no correct value, no hidden test, rubric or model answer", () => {
    expect(html).not.toContain('class="key"');
    expect(html).not.toContain("مفتاح الإجابات");
    expect(html).not.toMatch(/SECRET-/);
    expect(html).not.toContain("9.8");
  });
  it("lists the matching answers in a fixed alphabetical order, not in key order", () => {
    const pool = html.slice(html.indexOf('<ul class="pool">'));
    expect(pool.indexOf("ألف-صلب")).toBeLessThan(pool.indexOf("زاي-سائل"));
  });
  it("shows only printable images (data: / same-origin), never an external URL", () => {
    expect(html).toContain('src="' + PNG + '"');
    expect(html).not.toContain("evil.example");
  });
  it("interactive and coding questions print their prompt with a note; the starter code is shown", () => {
    expect(html).toContain("حدد المنطقة");
    expect(html).toContain("سؤال تفاعلي — يُجاب عنه على المنصة.");
    expect(html).toContain("def solve():");
    expect(html).toContain("اكتب فقرة");
  });
  it("contains no script and no external resource", () => {
    expect(html).not.toMatch(/<script|<link|https?:\/\//i);
  });
});

describe("the answer key", () => {
  const html = buildExamPrintHtml(exam, "key");
  it("is marked as the teacher's key and shows each answer", () => {
    expect(html).toContain("مفتاح الإجابات — للمعلم فقط");
    expect(html).not.toContain("اسم الطالب:");
    expect(html).toContain("ب) عمّان");
    expect(html).toContain("<b>الإجابة: </b>صح");
    expect(html).toContain("← <b>زاي-سائل</b>");
    expect(html).toContain("SECRET-SHORT وحدة بناء الكائن الحي");
    expect(html).toContain("9.8 ± 0.1");
    expect(html).toContain("SECRET-PART");
    expect(html).toContain("SECRET-MODEL");
  });
  it("never prints coding hidden tests or reference solutions, a rubric's private guidance or interactive targets", () => {
    expect(html).not.toMatch(/SECRET-HIDDEN|SECRET-REFERENCE|SECRET-GUIDANCE|SECRET-REGION/);
    expect(html).toContain("يُصحَّح باختبارات مخفية على المنصة.");
  });
});

describe("helpers", () => {
  it("printable images: data:image and same-origin paths only", () => {
    expect(printableImageSrc(PNG)).toBe(PNG);
    expect(printableImageSrc("/api/question-image?blob=a&sig=b")).toBe("/api/question-image?blob=a&sig=b");
    for (const bad of ["https://x/y.png", "//x/y.png", "javascript:alert(1)", "data:text/html,<b>", "", null, 3]) expect(printableImageSrc(bad)).toBeNull();
  });
  it("a rich stem prints as its plain text", () => {
    expect(richPlainText({ schemaVersion: 1, blocks: [{ type: "heading", text: "عنوان" }, { type: "list", items: [{ text: "أول" }, { text: "ثانٍ" }] }, { type: "code", source: "x = 1" }] })).toBe("عنوان\nأول\nثانٍ\nx = 1");
  });
  it("a legacy markdown table in the stem prints as a table", () => {
    const t = buildExamPrintHtml({ examId: "t", title: "ت", sections: [{ id: "s", title: "س", gradingPolicy: "all", questions: [{ examQuestionId: "q", presentationType: "shortAnswer", text: "أكمل الجدول\n| أ | ب |\n|---|---|\n| 1 | 2 |", marks: 1 }] }] } as unknown as StructuredExam, "student");
    expect(t).toContain('<table class="grid"><thead><tr><th>أ</th><th>ب</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(t).toContain('<p class="stem">أكمل الجدول</p>');
  });
});

describe("printing", () => {
  afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll("iframe").forEach(f => f.remove()); });
  it("prints the chosen document from a hidden iframe, after its images, and removes it afterwards", async () => {
    const print = vi.fn(), append = document.body.appendChild.bind(document.body);
    const add = vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(n: T) => { const r = append(n); const w = (n as unknown as HTMLIFrameElement).contentWindow as unknown as { print?: () => void } | null; if (w) w.print = print; return r; });   // (happy-dom has no print dialog)
    vi.useFakeTimers();
    try {
      expect(printExam(exam, "key")).toBe(true);
      const frame = add.mock.results[0].value as HTMLIFrameElement;
      expect(frame.getAttribute("aria-hidden")).toBe("true");
      expect(frame.contentDocument?.body.textContent).toContain("مفتاح الإجابات — للمعلم فقط");
      expect(print).not.toHaveBeenCalled();                                                    // waits for the images (or 3 s at most)
      await vi.advanceTimersByTimeAsync(3000);
      expect(print).toHaveBeenCalledTimes(1);
      frame.contentWindow!.dispatchEvent(new Event("afterprint"));
      await vi.advanceTimersByTimeAsync(1);
      expect(frame.isConnected).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("gives up cleanly (no frame left) when the browser offers no print", () => {
    expect(printExam(exam, "student")).toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
