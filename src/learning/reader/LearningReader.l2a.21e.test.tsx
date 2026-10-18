// @vitest-environment happy-dom
// Phase 21E L2-A — the Reader's normal-mode chrome, behaviourally:
//   • keyboard paging in NORMAL reading (audit L-9 / L2-3): ArrowLeft / PageDown → next, ArrowRight / PageUp → previous
//     (RTL), but only while focus rests on the reading surface (the content root a click focuses, or the page title a
//     page change focuses). A focused control of any kind — toolbar / TOC button, select, a lesson widget, a scrollable
//     region — keeps its own arrow keys, and so does the page outside the reader;
//   • (Phase L.0) the stale «gradual release» note is gone — the book is complete apart from its introduction;
//   • the compact toolbar keeps every control's accessible name (the phone layout only hides the label visually).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { makeImmediateApi } from "./readerFixtures";

const NOTE = "يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا.";
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* ignore */ } });

function mount(courseId = "791381", onPageChange?: (pageId: string) => void) {
  return render(<LearningReader courseId={courseId} onExit={vi.fn()} api={makeImmediateApi()} onPageChange={onPageChange} />);
}
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const surface = () => document.querySelector(".learning-reader-main") as HTMLElement;
const key = (k: string, target: Element) => fireEvent.keyDown(target, { key: k });
const stillOn = async (name: string) => { await waitFor(() => {}); expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy(); };
// The page title comes from the manifest in the same commit that selects the page, but the Reader wires that page's key
// listener in the following effect pass — the same pass that reports the page through `onPageChange`. A key pressed in
// between is lost (the CI flake of this file), so a key is pressed only once the page has been reported.
const tracker = () => {
  const reported = vi.fn<(pageId: string) => void>();
  const on = async (name: string, pageId: string) => { await heading(name); await waitFor(() => expect(reported).toHaveBeenLastCalledWith(pageId)); };
  return { reported, on };
};

describe("21E L2-A — keyboard paging in normal reading", () => {
  it("pages one step per key from the reading surface and the page title, in RTL direction", async () => {
    const { reported, on } = tracker();
    mount("791381", reported);
    await on("صفحة غنية", "p1");
    key("ArrowLeft", surface()); await on("صفحة ٢", "p2");
    key("PageDown", surface()); await on("صفحة ٣", "p3");
    // a page change focuses the new page title — paging continues from there
    const title = document.getElementById("learning-reader-page-title")!;
    key("ArrowRight", title); await on("صفحة ٢", "p2");
    key("PageUp", document.getElementById("learning-reader-page-title")!); await on("صفحة غنية", "p1");
    key("ArrowRight", surface()); await stillOn("صفحة غنية");                       // first page: previous is a no-op
  });

  it("never pages while focus is on a control: toolbar / TOC button, the jump select, a lesson widget, a focusable region, or outside the reader", async () => {
    const { reported, on } = tracker();
    mount("791381", reported);
    await on("صفحة غنية", "p1");                                                 // the listener is live, so a no-op proves the guard
    const targets: Element[] = [
      screen.getByRole("button", { name: "التالي" }),
      screen.getByRole("button", { name: "الفهرس" }),
      screen.getByLabelText("انتقل إلى صفحة"),
      document.body,
    ];
    // A focusable non-button region inside the page (e.g. a horizontally scrollable table or a canvas widget).
    const region = document.createElement("div");
    region.tabIndex = 0;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", "جدول قابل للتمرير");
    document.querySelector(".learning-reader-page")!.appendChild(region);
    targets.push(region);
    // Forward keys only (from the first page a backward key is a no-op anyway, and it could mask a forward step).
    for (const t of targets) {
      for (const k of ["ArrowLeft", "PageDown"]) { key(k, t); await stillOn("صفحة غنية"); }
    }
  });
});

describe("L.0 — the stale release note is gone (it replaced the 21E L2-A one-time note)", () => {
  it("normal reading shows no «gradual release» note and no control to dismiss one, for any course", async () => {
    for (const courseId of ["791381", "794589"]) {
      mount(courseId);
      await heading("صفحة غنية");
      expect(screen.queryByText(NOTE)).toBeNull();
      expect(screen.queryByRole("button", { name: "إخفاء تنبيه محتوى الكتاب" })).toBeNull();
      cleanup();
    }
  });
});

describe("21E L2-A — compact toolbar keeps accessible names", () => {
  it("back, TOC, reading-settings (L2-C), motion and presentation controls keep their full names; labels are wrapped, never removed", async () => {
    mount();
    await heading("صفحة غنية");
    for (const name of ["العودة", "الفهرس", "إعدادات القراءة", "وضع التركيز", "وضع العرض", "طباعة الصفحة"]) {
      expect(screen.getByRole("button", { name: new RegExp("^" + name) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /حركة الرسوم$/ })).toBeTruthy();
    const labels = [...document.querySelectorAll(".learning-reader-topbar .learning-reader-btn-label")].map(l => l.textContent);
    expect(labels).toHaveLength(8);                                           // L.1 adds «وضع التركيز» and «المزيد» (phones); L.5 «طباعة الصفحة»
    expect(labels.every(Boolean)).toBe(true);
  });
});

describe("L.0 — the reader names the book by its title", () => {
  it("the toolbar shows the manifest title, not «كتاب <number>»", async () => {
    mount();
    await heading("صفحة غنية");
    const title = document.querySelector(".learning-reader-topbar .learning-reader-booktitle")!;
    expect(title.textContent).toBe("كتاب اختبار القارئ");                                // the fixture manifest's title
    expect(title.textContent).not.toContain("791381");
  });
});
