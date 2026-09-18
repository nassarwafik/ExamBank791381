// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import { readerCourse, ANSWER_KEY } from "./readerFixtures";

afterEach(cleanup);

const richPage = readerCourse.modules[0].lessons[0].pages[0];
const header: ReaderPageHeader = {
  courseId: "791381", pageTitle: "صفحة غنية", moduleTitle: "الوحدة الأولى", lessonTitle: "الدرس الأول",
  position: { index: 1, total: 7 }, source: richPage.source,
};
const renderReady = () => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: richPage }} />);

describe("Phase 3 — page renderer: header + source", () => {
  it("shows the page title (h2), reader position, and a distinct source-page reference (range + printed page)", () => {
    renderReady();
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    expect(screen.getByText("صفحة 1 من 7")).toBeTruthy();                 // reader position
    expect(screen.getByText(/المصدر: كتاب 791381 · الصفحات 124–125/)).toBeTruthy(); // source PDF pages, separate concept
    expect(screen.getByText("صفحة الكتاب المطبوعة: 122")).toBeTruthy();
    expect(screen.getByText("من الكتاب")).toBeTruthy();
  });
});

describe("Phase 3 — page renderer: block types in authored order", () => {
  it("renders every block type", () => {
    const { container } = renderReady();
    expect(screen.getByRole("heading", { level: 3, name: "عنوان داخلي" })).toBeTruthy();       // heading (level 2 → h3)
    expect(screen.getByText("الخلاصة")).toBeTruthy();                                          // callout label
    expect(screen.getByText("مثال محلول")).toBeTruthy();                                       // solved example
    expect(screen.getByText("00101100")).toBeTruthy();                                         // example result
    expect(container.querySelector(".learning-reader-tablewrap table thead")).toBeTruthy();    // semantic table in a scroll wrapper
    expect(container.querySelector(".learning-reader-codewrap pre code[dir=ltr]")?.textContent).toContain("vlan 10"); // code, ltr, contained
    expect(screen.getByRole("img", { name: "رسم توضيحي للمنافذ" })).toBeTruthy();               // image alt
    expect(screen.getByRole("img", { name: "مخطط بلا صورة" })).toBeTruthy();                    // diagram missing → labelled
    expect(screen.getByText("محاكاة تفاعلية")).toBeTruthy();                                    // simulation placeholder
  });

  it("preserves authored order (heading before example before practice before simulation)", () => {
    const { container } = renderReady();
    const html = container.innerHTML;
    expect(html.indexOf("عنوان داخلي")).toBeLessThan(html.indexOf("مثال محلول"));
    expect(html.indexOf("مثال محلول")).toBeLessThan(html.indexOf("جرّب بنفسك"));
    expect(html.indexOf("جرّب بنفسك")).toBeLessThan(html.indexOf("محاكاة تفاعلية"));
  });
});

describe("Phase 3 — page renderer: provenance is visible and correct", () => {
  it("book blocks carry no enrichment label; enrichment blocks are clearly labelled (non-color-only)", () => {
    const { container } = renderReady();
    const heading = screen.getByRole("heading", { level: 3, name: "عنوان داخلي" });
    expect(heading.closest(".learning-reader-block")?.classList.contains("is-book")).toBe(true);
    expect(heading.closest(".is-enrichment")).toBeNull();
    // enrichment subtype labels
    expect(screen.getByText("توضيح المعلم", { selector: ".learning-reader-enrichment-tag" })).toBeTruthy(); // clarification
    expect(screen.getByText("مثال إضافي")).toBeTruthy();     // extra example
    expect(screen.getByText("جرّب بنفسك")).toBeTruthy();     // practice
    expect(screen.getByText("محاكاة")).toBeTruthy();          // simulation
    // there are exactly four enrichment surfaces (clarification, example, practice, simulation)
    expect(container.querySelectorAll(".learning-reader-block.is-enrichment").length).toBe(4);
  });
});

describe("Phase 3 — page renderer: answer-key secrecy (CRITICAL)", () => {
  it("shows the practice question + option texts but NEVER the answer key or feedback", () => {
    const { container } = renderReady();
    expect(screen.getByText("أي وضع لجهاز واحد؟")).toBeTruthy();
    const practice = container.querySelector(".learning-reader-practice") as HTMLElement;
    expect(within(practice).getByText("Access")).toBeTruthy();  // option text (part of the question) is fine
    expect(within(practice).getByText("Trunk")).toBeTruthy();
    const html = container.innerHTML;
    expect(html).not.toContain(ANSWER_KEY.hint);
    expect(html).not.toContain(ANSWER_KEY.correctFeedback);
    expect(html).not.toContain(ANSWER_KEY.incorrectFeedback);
    expect(html).not.toContain(ANSWER_KEY.explanation);
    expect(html).not.toContain("correct");        // the `correct:true` flag must not leak as text/attr/prop
    expect(html).not.toContain("correctFeedback");
  });
});

describe("Phase 3 — page renderer: non-content states", () => {
  it("renders a professional 'قيد الإعداد' state (with title/module/lesson) when the body is unavailable — no topic explanation", () => {
    render(<LearningPageRenderer header={header} body={{ kind: "unavailable" }} />);
    expect(screen.getByText("المحتوى التفاعلي لهذه الصفحة قيد الإعداد")).toBeTruthy();
    expect(screen.getByText(/يجري تحويل هذه المادة من الكتاب/)).toBeTruthy();
    expect(screen.getByText("الوحدة الأولى")).toBeTruthy();
    expect(screen.getByText("الدرس الأول")).toBeTruthy();
  });

  it("renders a loading status and an error+retry state", () => {
    const { rerender } = render(<LearningPageRenderer header={header} body={{ kind: "loading" }} />);
    expect(screen.getByRole("status").textContent).toContain("جارٍ تحميل الصفحة");
    let retried = 0;
    rerender(<LearningPageRenderer header={header} body={{ kind: "error", onRetry: () => { retried++; } }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    screen.getByRole("button", { name: "إعادة المحاولة" }).click();
    expect(retried).toBe(1);
  });
});
