// @vitest-environment happy-dom
// Phase 21E L2-A — the Reader's normal-mode chrome, behaviourally:
//   • keyboard paging in NORMAL reading (audit L-9 / L2-3): ArrowLeft / PageDown → next, ArrowRight / PageUp → previous
//     (RTL), but only while focus rests on the reading surface (the content root a click focuses, or the page title a
//     page change focuses). A focused control of any kind — toolbar / TOC button, select, a lesson widget, a scrollable
//     region — keeps its own arrow keys, and so does the page outside the reader;
//   • the one-time release note: dismissing it hides it, keeps keyboard focus inside the reader (on the reading surface,
//     never <body>), and is remembered per course on this device; unavailable storage never hides the note or crashes;
//   • the compact toolbar keeps every control's accessible name (the phone layout only hides the label visually).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { makeImmediateApi } from "./readerFixtures";

const NOTE = "يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا.";
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* ignore */ } });

function mount(courseId = "791381") {
  return render(<LearningReader courseId={courseId} onExit={vi.fn()} api={makeImmediateApi()} />);
}
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const surface = () => document.querySelector(".learning-reader-main") as HTMLElement;
const key = (k: string, target: Element) => fireEvent.keyDown(target, { key: k });
const stillOn = async (name: string) => { await waitFor(() => {}); expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy(); };

describe("21E L2-A — keyboard paging in normal reading", () => {
  it("pages one step per key from the reading surface and the page title, in RTL direction", async () => {
    mount();
    await heading("صفحة غنية");
    key("ArrowLeft", surface()); await heading("صفحة ٢");
    key("PageDown", surface()); await heading("صفحة ٣");
    // a page change focuses the new page title — paging continues from there
    const title = document.getElementById("learning-reader-page-title")!;
    key("ArrowRight", title); await heading("صفحة ٢");
    key("PageUp", document.getElementById("learning-reader-page-title")!); await heading("صفحة غنية");
    key("ArrowRight", surface()); await stillOn("صفحة غنية");                       // first page: previous is a no-op
  });

  it("never pages while focus is on a control: toolbar / TOC button, the jump select, a lesson widget, a focusable region, or outside the reader", async () => {
    mount();
    await heading("صفحة غنية");
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

describe("21E L2-A — one-time release note", () => {
  it("dismissal hides the note, moves focus to the reading surface, and is remembered for this course on this device", async () => {
    const first = mount();
    await heading("صفحة غنية");
    expect(screen.getByText(NOTE)).toBeTruthy();
    const dismiss = screen.getByRole("button", { name: "إخفاء تنبيه محتوى الكتاب" });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(document.activeElement).toBe(surface());
    first.unmount();

    mount();                                                                            // same course, same device
    await heading("صفحة غنية");
    expect(screen.queryByText(NOTE)).toBeNull();
    cleanup();

    mount("794589");                                                                    // another course still shows it
    await waitFor(() => expect(screen.getByText(NOTE)).toBeTruthy());
  });

  it("unavailable storage keeps the note visible and dismissal still works for this view", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount();
    await heading("صفحة غنية");
    expect(screen.getByText(NOTE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء تنبيه محتوى الكتاب" }));
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

describe("21E L2-A — compact toolbar keeps accessible names", () => {
  it("back, TOC, reading-settings (L2-C), motion and presentation controls keep their full names; labels are wrapped, never removed", async () => {
    mount();
    await heading("صفحة غنية");
    for (const name of ["العودة", "الفهرس", "إعدادات القراءة", "وضع العرض"]) {
      expect(screen.getByRole("button", { name: new RegExp("^" + name) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /حركة الرسوم$/ })).toBeTruthy();
    const labels = [...document.querySelectorAll(".learning-reader-topbar .learning-reader-btn-label")].map(l => l.textContent);
    expect(labels).toHaveLength(5);
    expect(labels.every(Boolean)).toBe(true);
  });
});
