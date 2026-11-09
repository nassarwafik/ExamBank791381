// @vitest-environment happy-dom
// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — the Reader's `code` block in C#:
//   • the content validator accepts `csharp` (and still refuses an unknown language);
//   • a csharp block shows the code EXACTLY (its <code> text is the block's code), highlighted by text spans, with line numbers in a
//     separate gutter hidden from assistive technology, scrollable by keyboard, and a «نسخ الكود» control that copies the exact code;
//   • the existing languages (cli / text / config) keep their established markup — no gutter, no tokens, no copy control.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import { PlainCSharpCode } from "./CodeBlockView";
import { validateLearningCourseContent } from "../content/validation";
import { CODE_LANGUAGES, type ContentPage, type LearningCourseContent } from "../content/types";
import { cloneCourse } from "../content/content.fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const CS = "static void Main(string[] args)\n{\nint a = 7; // متغير\nConsole.WriteLine(\"a = \" + a);\n}";
const header: ReaderPageHeader = { courseId: "x", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 }, source: { kind: "book", bookId: "x" } as never };
const show = (language: string, code: string) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: pageWith(language, code) }} />);
const pageWith = (language: string, code: string): ContentPage => ({
  id: "x-m01-l01-p01", moduleId: "x-m01", lessonId: "x-m01-l01", order: 1, title: "صفحة", layout: "standard",
  source: { kind: "book", bookId: "x" },
  blocks: [{ id: "b1", type: "code", origin: "book", language, code } as never],
} as unknown as ContentPage);

describe("content validation", () => {
  it("accepts a csharp code block and still refuses an unknown language", () => {
    expect(CODE_LANGUAGES).toContain("csharp");
    const course = cloneCourse() as LearningCourseContent;
    const block = course.modules.flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks))).find(b => b.type === "code") as { language: string } | undefined;
    expect(block).toBeDefined();
    block!.language = "csharp";
    expect(validateLearningCourseContent(course).filter(i => i.code === "unsupported-block-type")).toEqual([]);
    block!.language = "python";
    expect(validateLearningCourseContent(course).map(i => i.code)).toContain("unsupported-block-type");
  });
});

describe("a csharp code block in the Reader", () => {
  it("shows the exact code at once, then highlighted by text spans", async () => {
    const { container } = show("csharp", CS);
    expect((container.querySelector(".learning-reader-codewrap code") as HTMLElement).textContent).toBe(CS);   // before the panel loads
    await screen.findByRole("button", { name: "نسخ الكود" });
    const code = container.querySelector(".learning-reader-codewrap code") as HTMLElement;
    expect(code.textContent).toBe(CS);
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(code.className).toContain("lang-csharp");
    expect([...code.querySelectorAll(".cs-tok-keyword")].map(e => e.textContent)).toEqual(["static", "void", "string", "int"]);
    expect(code.querySelector(".cs-tok-type")?.textContent).toBe("Console");
    expect(code.querySelector(".cs-tok-string")?.textContent).toBe("\"a = \"");
    expect(code.querySelector(".cs-tok-comment")?.textContent).toBe("// متغير");
    expect(code.innerHTML).not.toMatch(/<(?!\/?span\b)[a-z]/i);   // spans only: nothing in the code is markup
  });

  it("before the panel arrives, the plain code is already keyboard-scrollable and named (axe scrollable-region-focusable, §18)", async () => {
    // the fallback itself (the lazy panel, once loaded by an earlier test, would replace it at once)
    const { container } = render(<PlainCSharpCode code={CS} />);
    const pre = container.querySelector(".learning-reader-codewrap pre") as HTMLElement;
    expect(pre.querySelector("code")!.textContent).toBe(CS);
    expect(pre.getAttribute("tabindex")).toBe("0");
    expect(pre.getAttribute("aria-label")).toBe("كود C#");
  });

  it("numbers the lines in a gutter that assistive technology skips, and the code is keyboard-scrollable", async () => {
    const { container } = show("csharp", CS);
    await screen.findByRole("button", { name: "نسخ الكود" });
    const gutter = container.querySelector(".learning-reader-code-gutter") as HTMLElement;
    expect(gutter.getAttribute("aria-hidden")).toBe("true");
    expect(gutter.textContent).toBe("1\n2\n3\n4\n5");
    const pre = container.querySelector(".learning-reader-codewrap pre") as HTMLElement;
    expect(pre.getAttribute("tabindex")).toBe("0");
    expect(pre.getAttribute("aria-label")).toBe("كود C#، 5 أسطر");
  });

  it("copies the exact code and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    show("csharp", CS);
    const button = await screen.findByRole("button", { name: "نسخ الكود" });
    await act(async () => { fireEvent.click(button); });
    expect(writeText).toHaveBeenCalledWith(CS);
    expect(screen.getByRole("status").textContent).toBe("تم نسخ الكود");
  });

  it("says when copying is not possible instead of failing silently", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    show("csharp", CS);
    const button = await screen.findByRole("button", { name: "نسخ الكود" });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("status").textContent).toBe("تعذّر النسخ، حدّد الكود وانسخه يدويًا");
  });
});

describe("the established languages keep their markup", () => {
  it.each(["cli", "text", "config"])("%s: no gutter, no tokens, no copy control", language => {
    const { container } = show(language, "Switch(config)# vlan 10");
    const wrap = container.querySelector(".learning-reader-codewrap") as HTMLElement;
    expect(wrap.innerHTML).toBe(`<pre class="learning-reader-code"><code dir="ltr" class="lang-${language}">Switch(config)# vlan 10</code></pre>`);
    expect(screen.queryByRole("button", { name: "نسخ الكود" })).toBeNull();
  });
});
