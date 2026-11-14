// @vitest-environment happy-dom
// The «النتيجة» line of a worked example.
//
// The line was built for a short technical value (`192.168.1.0/24`, `[3,5]`, `O(n)`): left-to-right, in the monospace face.
// Authors also write the result as an Arabic SENTENCE («الكابل الأنسب هو STP.», «حالة القبول: q2.»). Drawn left-to-right, such a
// sentence starts from the wrong side and its parts change places («IP تغيّر، أما MAC فبقي ثابتًا.»), and the monospace face spaces
// its letters apart. So a result that holds Arabic letters is ordinary right-to-left text of the page; a result without any
// stays exactly as it was. Code inside a sentence keeps its own direction through the Unicode isolates the author wrote.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const header: ReaderPageHeader = { courseId: "791381", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 }, source: { kind: "book", sourceId: "791381", pdfPageStart: 1 } };
const resultOf = (result: string, mode?: "solved" | "practice") => {
  const page: ContentPage = { id: "p", title: "صفحة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 1 }, blocks: [{ id: "b1", type: "example", origin: "book", ...(mode ? { mode } : {}), steps: [{ text: "خطوة" }], result }] };
  const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);
  const line = container.querySelector(".learning-reader-example-result");
  return line ? { tag: line.children[0].textContent, value: line.children[1] as HTMLElement } : null;
};

describe("the «النتيجة» line of a worked example", () => {
  it.each([
    "الكابل الأنسب هو STP.",                                   // 791381
    "IP تغيّر، أما MAC فبقي ثابتًا.",                              // 791381 — a sentence that begins with a Latin word
    "2048 بايت = 2 KB",                                        // 791381s — begins with a number
    "حالة القبول: q2.",                                         // 899271
    "تعيد العملية ⁦24⁩. مهمّتها: مجموع الأعداد.",          // 899271d — code inside the Unicode isolates
    "⁦[3,5]⁩، والراصّة فارغة.",                         // begins with a code run
  ])("an Arabic sentence is ordinary right-to-left text, not left-to-right monospace: %s", sentence => {
    const r = resultOf(sentence)!;
    expect(r.tag).toBe("النتيجة");
    expect(r.value.textContent).toBe(sentence);
    expect(r.value.getAttribute("dir")).toBeNull();                       // it takes the page's direction (right-to-left)
    expect(r.value.classList.contains("learning-reader-mono")).toBe(false);
  });

  it.each(["192.168.20.0/24", "255.255.255.192", "⁦[3,5]⁩", "O(n)", "A · B"])("a technical value stays left-to-right in the monospace face: %s", value => {
    const r = resultOf(value)!;
    expect(r.value.textContent).toBe(value);
    expect(r.value.getAttribute("dir")).toBe("ltr");
    expect(r.value.classList.contains("learning-reader-mono")).toBe(true);
  });

  it("a practice example still shows no result", () => {
    expect(resultOf("الكابل الأنسب هو STP.", "practice")).toBeNull();
  });
});
