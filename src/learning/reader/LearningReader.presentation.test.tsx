// @vitest-environment happy-dom
// Learning Reader — PRESENTATION MODE (وضع العرض): the same Reader promoted to an app-level full-viewport overlay.
// Enter / exit (button, Escape, F), السابق / التالي with the SAME navigation authority (disabled at the ends), the
// ordinal page indicator («n / total» — the Reader position, never the PDF page) with a direct page-number field
// (Enter / Go, Arabic-Indic digits, out-of-range feedback without a crash), the index drawer (module → lesson → page,
// current page highlighted, selection navigates and closes the drawer while presentation stays), keyboard navigation
// that never fires while typing (page field, CLI terminal line) or while a nested dialog is open, focus return to
// the toggle, best-effort native fullscreen, and no regression of the normal Reader.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import LearningReader, { type ReaderContentApi } from "./LearningReader";
import { makeImmediateApi } from "./readerFixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });

function mount(api: ReaderContentApi = makeImmediateApi()) {
  const onExit = vi.fn();
  const utils = render(<LearningReader courseId="791381" onExit={onExit} api={api} />);
  return { ...utils, onExit };
}
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const prevBtn = () => screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement;
const nextBtn = () => screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement;
const enterBtn = () => screen.getByRole("button", { name: "وضع العرض" }) as HTMLButtonElement;
const exitBtn = () => screen.getByRole("button", { name: "خروج من وضع العرض" }) as HTMLButtonElement;
const pageField = () => screen.getByLabelText("رقم الصفحة") as HTMLInputElement;
const root = () => document.querySelector(".learning-reader") as HTMLElement;
const key = (k: string, target: Element | Document = document.body, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { key: k, ...init });
async function openPresentation() {
  mount();
  await heading("صفحة غنية");
  fireEvent.click(enterBtn());
  await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
}

describe("1–3 · enter, exit, Escape", () => {
  it("enters presentation: the root becomes a modal overlay (role dialog), the sidebar / partial note / jump select leave the tree, the body scroll is locked, the toggle reads «خروج من وضع العرض»", async () => {
    mount();
    await heading("صفحة غنية");
    expect(root().classList.contains("is-presentation")).toBe(false);
    expect(root().getAttribute("role")).toBeNull();
    expect(screen.getByLabelText("انتقل إلى صفحة")).toBeTruthy();                      // the normal jump select
    expect(enterBtn().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(enterBtn());
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    expect(root().getAttribute("role")).toBe("dialog");
    expect(root().getAttribute("aria-modal")).toBe("true");
    expect(root().getAttribute("aria-label")).toBe("وضع العرض — كتاب 791381");
    expect(screen.queryByLabelText("انتقل إلى صفحة")).toBeNull();                       // replaced by the page-number field
    expect(screen.queryByText("يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا.")).toBeNull();
    expect(screen.queryByRole("button", { name: "العودة إلى نظرة الكتاب" })).toBeNull(); // only the presentation exit stays
    expect(document.body.style.overflow).toBe("hidden");
    expect(exitBtn().getAttribute("aria-pressed")).toBe("true");
    // the semantic tree of the page is unchanged: same layout > main > page
    expect(document.querySelector(".learning-reader-layout > main.learning-reader-main .learning-reader-page")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "تنقّل بين الصفحات" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الفهرس" })).toBeTruthy();
  });

  it("exits with the button: back to the normal layout, body scroll restored, focus returns to the toggle, page kept", async () => {
    await openPresentation();
    fireEvent.click(nextBtn());
    await heading("صفحة ٢");
    fireEvent.click(exitBtn());
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
    expect(root().getAttribute("role")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByLabelText("انتقل إلى صفحة")).toBeTruthy();
    expect(screen.getByRole("button", { name: "العودة إلى نظرة الكتاب" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "صفحة ٢" })).toBeTruthy();       // same page after exit
    await waitFor(() => expect(document.activeElement).toBe(enterBtn()));
  });

  it("Escape exits presentation (focus trap), but with the index drawer open Escape closes only the drawer", async () => {
    await openPresentation();
    fireEvent.click(screen.getByRole("button", { name: "الفهرس" }));
    const drawer = await screen.findByRole("dialog", { name: "فهرس الكتاب" });
    key("Escape", within(drawer).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "فهرس الكتاب" })).toBeNull());
    expect(root().classList.contains("is-presentation")).toBe(true);                    // still presenting
    key("Escape");
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
  });
});

describe("4–6 · previous / next, ends, indicator", () => {
  it("السابق / التالي use the same reading order; disabled on the first / last page; the indicator shows the READER ordinal", async () => {
    await openPresentation();
    expect(prevBtn().disabled).toBe(true);
    expect(nextBtn().disabled).toBe(false);
    expect(pageField().value).toBe("1");
    expect(screen.getByText("/ 7")).toBeTruthy();
    expect(screen.getByText("صفحة 1 من 7")).toBeTruthy();                                // the page head (not the PDF 124)
    fireEvent.click(nextBtn()); await heading("صفحة ٢");
    expect(pageField().value).toBe("2");
    for (let i = 0; i < 5; i++) fireEvent.click(nextBtn());
    await heading("صفحة ٧");
    expect(nextBtn().disabled).toBe(true);
    expect(prevBtn().disabled).toBe(false);
    expect(pageField().value).toBe("7");
    fireEvent.click(prevBtn()); await heading("صفحة ٦");
    expect(pageField().value).toBe("6");
    expect(screen.getByText("صفحة 6 من 7")).toBeTruthy();
  });
});

describe("7–8 · direct page jump", () => {
  it("Enter jumps to the typed ordinal; the Go button too; Arabic-Indic digits are accepted; the field is LTR", async () => {
    await openPresentation();
    expect(pageField().getAttribute("dir")).toBe("ltr");
    expect(pageField().getAttribute("inputmode")).toBe("numeric");
    fireEvent.change(pageField(), { target: { value: "5" } });
    fireEvent.submit(pageField().closest("form")!);
    await heading("صفحة ٥");
    expect(pageField().value).toBe("5");
    fireEvent.change(pageField(), { target: { value: "٣" } });                           // Arabic-Indic three
    fireEvent.click(screen.getByRole("button", { name: "انتقل" }));
    await heading("صفحة ٣");
    fireEvent.change(pageField(), { target: { value: " 7 " } });
    fireEvent.submit(pageField().closest("form")!);
    await heading("صفحة ٧");
    expect(root().classList.contains("is-presentation")).toBe(true);
  });

  it("out-of-range or non-numeric input: no crash, no navigation, a simple alert; it clears when the learner types again or navigates", async () => {
    await openPresentation();
    for (const bad of ["0", "8", "999", "abc", "", "-1", "2.5"]) {
      fireEvent.change(pageField(), { target: { value: bad } });
      fireEvent.submit(pageField().closest("form")!);
      expect(screen.getByRole("alert").textContent).toBe("أدخل رقم صفحة بين 1 و 7.");
      expect(pageField().getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();  // unchanged
      fireEvent.change(pageField(), { target: { value: bad + "x" } });                  // typing again clears the feedback
      expect(screen.queryByRole("alert")).toBeNull();
    }
    fireEvent.change(pageField(), { target: { value: "42" } });
    fireEvent.submit(pageField().closest("form")!);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(nextBtn());
    await heading("صفحة ٢");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pageField().value).toBe("2");                                                // resynced to the real position
  });
});

describe("9–10, 13 · index drawer", () => {
  it("opens hierarchically (module → lesson → page) with the current page highlighted; choosing a page navigates, closes the drawer and keeps presentation", async () => {
    await openPresentation();
    fireEvent.click(screen.getByRole("button", { name: "الفهرس" }));
    const drawer = await screen.findByRole("dialog", { name: "فهرس الكتاب" });
    expect(root().getAttribute("aria-modal")).toBe("true");
    expect(within(drawer).getByRole("button", { name: "الوحدة الأولى" })).toBeTruthy();
    expect(within(drawer).getByText("الدرس الأول")).toBeTruthy();
    const current = within(drawer).getByRole("button", { name: "صفحة غنية" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.classList.contains("is-active")).toBe(true);
    expect(within(drawer).getByRole("button", { name: "الوحدة الثانية" }).getAttribute("aria-expanded")).toBe("true");   // modules open by default
    fireEvent.click(within(drawer).getByRole("button", { name: "صفحة ٥" }));
    await heading("صفحة ٥");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "فهرس الكتاب" })).toBeNull());
    expect(root().classList.contains("is-presentation")).toBe(true);
    expect(pageField().value).toBe("5");
    // reopen: the highlight moved to the new page
    fireEvent.click(screen.getByRole("button", { name: "الفهرس" }));
    const again = await screen.findByRole("dialog", { name: "فهرس الكتاب" });
    expect(within(again).getByRole("button", { name: "صفحة ٥" }).getAttribute("aria-current")).toBe("page");
    expect(within(again).getByRole("button", { name: "صفحة غنية" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(within(again).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "فهرس الكتاب" })).toBeNull());
    expect(root().classList.contains("is-presentation")).toBe(true);
  });
});

describe("11–12 · keyboard", () => {
  it("ArrowLeft / PageDown → next, ArrowRight / PageUp → previous (RTL reading), no-ops at the ends; F toggles the mode", async () => {
    mount();
    await heading("صفحة غنية");
    key("ArrowLeft");                                                                    // normal mode: no navigation shortcuts
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    key("f");
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    key("ArrowRight");                                                                   // first page: previous is a no-op
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    key("ArrowLeft"); await heading("صفحة ٢");
    key("PageDown"); await heading("صفحة ٣");
    key("ArrowRight"); await heading("صفحة ٢");
    key("PageUp"); await heading("صفحة غنية");
    fireEvent.change(pageField(), { target: { value: "7" } }); fireEvent.submit(pageField().closest("form")!);
    await heading("صفحة ٧");
    key("ArrowLeft");                                                                    // last page: next is a no-op
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة ٧" })).toBeTruthy();
    key("F", document.body, { code: "KeyF" });
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
    expect(screen.getByRole("heading", { level: 2, name: "صفحة ٧" })).toBeTruthy();      // page kept
  });

  it("shortcuts never fire while typing: the page-number field, a textarea, a select, an editable element, or with a modifier", async () => {
    await openPresentation();
    const field = pageField();
    field.focus();
    key("ArrowLeft", field); key("ArrowRight", field); key("PageDown", field); key("f", field); key("F", field, { code: "KeyF" });
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    expect(root().classList.contains("is-presentation")).toBe(true);
    // other editable targets inside the overlay
    const main = document.querySelector("main.learning-reader-main")!;
    for (const html of ['<textarea data-t="ta"></textarea>', '<select data-t="sel"><option>x</option></select>', '<div data-t="ce" contenteditable="true"></div>', '<div data-t="tb" role="textbox"></div>']) {
      main.insertAdjacentHTML("beforeend", html);
      const el = main.querySelector("[data-t]")!;
      key("ArrowLeft", el); key("f", el);
      el.remove();
    }
    key("ArrowLeft", document.body, { ctrlKey: true }); key("f", document.body, { metaKey: true }); key("ArrowLeft", document.body, { altKey: true });
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    expect(root().classList.contains("is-presentation")).toBe(true);
    // with the index drawer open the arrows are owned by the drawer (no page change behind it)
    fireEvent.click(screen.getByRole("button", { name: "الفهرس" }));
    const drawer = await screen.findByRole("dialog", { name: "فهرس الكتاب" });
    key("ArrowLeft", within(drawer).getByRole("button", { name: "إغلاق" })); key("f", within(drawer).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    expect(root().classList.contains("is-presentation")).toBe(true);
  });
});

describe("native fullscreen is best-effort", () => {
  it("a refused requestFullscreen leaves the overlay fully usable; exitFullscreen is never called for a session the reader does not own", async () => {
    const req = vi.fn(() => Promise.reject(new Error("denied")));
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: req });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    await openPresentation();
    expect(req).toHaveBeenCalledTimes(1);
    fireEvent.click(nextBtn()); await heading("صفحة ٢");                                 // usable
    fireEvent.click(exitBtn());
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
    expect(exit).not.toHaveBeenCalled();
  });

  it("a granted session is released on exit, and the browser leaving fullscreen on its own (fullscreenchange) ends presentation too", async () => {
    let fs: Element | null = null;
    const req = vi.fn(() => { fs = document.documentElement; return Promise.resolve(); });
    const exit = vi.fn(() => { fs = null; return Promise.resolve(); });
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: req });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fs });
    await openPresentation();
    await waitFor(() => expect(req).toHaveBeenCalledTimes(1));
    fireEvent.click(exitBtn());
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
    expect(root().classList.contains("is-presentation")).toBe(false);
    // second round: the browser exits fullscreen itself (its own Escape / UI)
    fireEvent.click(enterBtn());
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    await waitFor(() => expect(req).toHaveBeenCalledTimes(2));
    await act(async () => { fs = null; document.dispatchEvent(new Event("fullscreenchange")); });
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
    expect(exit).toHaveBeenCalledTimes(1);                                               // nothing to release
  });
});

describe("15 · normal Reader — no regression", () => {
  it("without entering presentation nothing changes: no dialog role, the select jump and the static position, no keyboard navigation, the exit button", async () => {
    const { onExit } = mount();
    await heading("صفحة غنية");
    expect(root().getAttribute("role")).toBeNull();
    expect(screen.getByLabelText("انتقل إلى صفحة")).toBeTruthy();
    expect(screen.queryByLabelText("رقم الصفحة")).toBeNull();
    expect(document.querySelector(".learning-reader-navpos")!.textContent).toBe("1 / 7");
    key("ArrowLeft"); key("PageDown");
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى نظرة الكتاب" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
