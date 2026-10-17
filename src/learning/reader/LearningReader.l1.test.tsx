// @vitest-environment happy-dom
// Phase L.1 — the professional Reader, behaviourally:
//   • the index takes no room unless docked: below 1280px (and in focus mode) «الفهرس» opens the overlay drawer; from
//     1280px it docks / folds the side column, and the choice is remembered on this device;
//   • focus mode flags <html data-eb-reading-focus> (the shell's chrome steps aside), Escape and the toggle leave it, and
//     unmounting the Reader always clears the flag;
//   • «التالي» keeps its name and is described by the next page's title;
//   • the page head names the unit and lesson, never «كتاب <number>», and keeps the source behind «مصدر الصفحة»;
//   • a unit-opener page lists the unit's lessons (real book content), each opening its first page;
//   • a horizontal swipe turns the page in the RTL direction, never from a control or a vertical scroll;
//   • the «داكن» reading theme applies and is remembered.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { makeImmediateApi } from "./readerFixtures";

const originalMatchMedia = window.matchMedia;
function viewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return { matches: min ? width >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
  }) as typeof window.matchMedia;
}
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
  try { localStorage.clear(); } catch { /* ignore */ }
  document.documentElement.removeAttribute("data-eb-reading-focus");
});

const mount = () => render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} />);
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const root = () => document.querySelector(".learning-reader") as HTMLElement;
const tocToggle = () => screen.getByRole("button", { name: "الفهرس" });
const focusToggle = () => screen.getByRole("button", { name: /وضع التركيز$/ });

describe("L.1 — the index takes no room unless the reader docks it", () => {
  it("below 1280px «الفهرس» opens the overlay drawer and the root reports data-toc=drawer", async () => {
    viewport(1024);
    mount();
    await heading("صفحة غنية");
    expect(root().getAttribute("data-toc")).toBe("drawer");
    expect(tocToggle().getAttribute("aria-controls")).toBe("learning-reader-drawer");
    fireEvent.click(tocToggle());
    expect(screen.getByRole("dialog", { name: "فهرس الكتاب" })).toBeTruthy();
    expect(tocToggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("from 1280px it is docked by default; the toggle folds and unfolds it (no drawer) and the choice survives a remount", async () => {
    viewport(1440);
    const first = mount();
    await heading("صفحة غنية");
    expect(root().getAttribute("data-toc")).toBe("docked");
    expect(tocToggle().getAttribute("aria-controls")).toBe("learning-reader-sidebar");
    expect(tocToggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(tocToggle());
    expect(root().getAttribute("data-toc")).toBe("drawer");
    expect(tocToggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "فهرس الكتاب" })).toBeNull();
    first.unmount();
    mount();
    await heading("صفحة غنية");
    expect(root().getAttribute("data-toc")).toBe("drawer");                       // remembered on this device
    fireEvent.click(tocToggle());
    expect(root().getAttribute("data-toc")).toBe("docked");
  });

  it("blocked storage keeps the index docked and the toggle working for the view", async () => {
    viewport(1440);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount();
    await heading("صفحة غنية");
    expect(root().getAttribute("data-toc")).toBe("docked");
    fireEvent.click(tocToggle());
    expect(root().getAttribute("data-toc")).toBe("drawer");
  });
});

describe("L.1 — focus mode", () => {
  it("flags the document, undocks the index, and leaves by the toggle or Escape", async () => {
    viewport(1440);
    mount();
    await heading("صفحة غنية");
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(false);
    fireEvent.click(focusToggle());
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(true);
    expect(root().hasAttribute("data-focus")).toBe(true);
    expect(focusToggle().getAttribute("aria-pressed")).toBe("true");
    expect(focusToggle().textContent).toBe("الخروج من وضع التركيز");
    expect(root().getAttribute("data-toc")).toBe("drawer");                        // the page gets the whole width
    fireEvent.click(tocToggle());
    expect(screen.getByRole("dialog", { name: "فهرس الكتاب" })).toBeTruthy();       // the index is the drawer here
    fireEvent.keyDown(screen.getByRole("dialog", { name: "فهرس الكتاب" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "فهرس الكتاب" })).toBeNull());
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(true);   // Escape closed the drawer only
    fireEvent.keyDown(document.querySelector(".learning-reader-main")!, { key: "Escape" });
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(false);
    expect(root().getAttribute("data-toc")).toBe("docked");
    fireEvent.click(focusToggle());
    fireEvent.click(focusToggle());
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(false);
  });

  it("unmounting the Reader in focus mode clears the document flag", async () => {
    const view = mount();
    await heading("صفحة غنية");
    fireEvent.click(focusToggle());
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(true);
    view.unmount();
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(false);
  });

  it("presentation takes over: the flag is cleared while presenting", async () => {
    mount();
    await heading("صفحة غنية");
    fireEvent.click(focusToggle());
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(false);
  });
});

describe("L.1 — toolbar, page head and page bar", () => {
  it("the toolbar names the book and the reader's place; every icon control keeps its name and a tooltip", async () => {
    mount();
    await heading("صفحة غنية");
    const bar = document.querySelector(".learning-reader-topbar") as HTMLElement;
    expect(bar.querySelector(".learning-reader-booktitle")!.textContent).toBe("كتاب اختبار القارئ");
    expect(bar.querySelector(".learning-reader-crumb")!.textContent).toBe("الوحدة الأولى › الدرس الأول");
    for (const button of within(bar).getAllByRole("button")) {
      const name = button.textContent!.trim();
      expect(name.length).toBeGreaterThan(0);
      expect(button.getAttribute("title")).toBe(name);
    }
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await heading("صفحة ٣");
    expect(bar.querySelector(".learning-reader-crumb")!.textContent).toBe("الوحدة الأولى › الدرس الثاني");
  });

  it("the page head names the unit and the lesson — never «كتاب <number>» — and keeps the source behind «مصدر الصفحة»", async () => {
    mount();
    await heading("صفحة غنية");
    const head = document.querySelector(".learning-reader-pagehead") as HTMLElement;
    expect(head.querySelector(".learning-reader-kicker")!.textContent).toBe("الوحدة الأولى");
    expect(head.querySelector(".learning-reader-context")!.textContent).toBe("الدرس الأول");
    const details = head.querySelector("details.learning-reader-sourceinfo") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("مصدر الصفحة");
    expect(details.querySelector(".learning-reader-source")!.textContent).toContain("المصدر: كتاب 791381 · الصفحات 124–125");
    expect(head.querySelector(":scope > .learning-reader-source")).toBeNull();     // never a bare line of numbers
  });

  it("«التالي» keeps its name and is described by the next page's title; the last page has neither", async () => {
    mount();
    await heading("صفحة غنية");
    const next = screen.getByRole("button", { name: "التالي" });
    const describedBy = next.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)!.textContent).toBe("صفحة ٢");
    fireEvent.click(next);
    await heading("صفحة ٢");
    expect(document.getElementById(screen.getByRole("button", { name: "التالي" }).getAttribute("aria-describedby")!)!.textContent).toBe("صفحة ٣");
  });
});

describe("L.1 — swipe to turn the page (RTL)", () => {
  const surface = () => document.querySelector(".learning-reader-main") as HTMLElement;
  const swipe = (target: Element, dx: number, dy = 0) => {
    fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
  };
  it("a finger moving right turns to the next page, moving left back; short, vertical or control-started gestures do nothing", async () => {
    mount();
    await heading("صفحة غنية");
    const text = () => surface().querySelector(".learning-reader-page-title") as HTMLElement;
    swipe(text(), 30);                                    // too short
    swipe(text(), 90, 120);                               // mostly vertical (a scroll)
    swipe(surface().querySelector("input, select, button")!, 120);   // starts on a control
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
    swipe(text(), 120);
    await heading("صفحة ٢");
    swipe(text(), -120);
    await heading("صفحة غنية");
  });
});

describe("L.1 — «داكن» reading theme", () => {
  it("applies to the Reader root and is remembered", async () => {
    const first = mount();
    await heading("صفحة غنية");
    fireEvent.click(screen.getByRole("button", { name: "إعدادات القراءة" }));
    fireEvent.click(screen.getByRole("radio", { name: /^داكن/ }));
    expect(root().getAttribute("data-read-theme")).toBe("dark");
    first.unmount();
    mount();
    await heading("صفحة غنية");
    expect(root().getAttribute("data-read-theme")).toBe("dark");
  });
});

describe("L.1 — unit contents on a unit-opener page (real book content)", () => {
  it("the Unit 1 opener lists the unit's lessons; a lesson opens its first page", async () => {
    render(<LearningReader courseId="791381" onExit={vi.fn()} />);
    const contents = await screen.findByRole("region", { name: "محتويات الوحدة" }, { timeout: 5000 });
    const lessons = within(contents).getAllByRole("button");
    expect(lessons.length).toBeGreaterThan(1);
    expect(lessons[0].textContent).toContain("مقدمة إلى الشبكات");
    expect(lessons[0].textContent).toMatch(/صفحة|صفحات|صفحتان/);
    expect(within(contents).queryByText("افتتاحية الوحدة")).toBeNull();          // the opener lesson itself is not listed
    fireEvent.click(lessons[0]);
    await waitFor(() => expect(screen.queryByRole("region", { name: "محتويات الوحدة" })).toBeNull(), { timeout: 5000 });
    expect(document.querySelector(".learning-reader-crumb")!.textContent).toBe("أساسيات الشبكات › مقدمة إلى الشبكات");
  }, 20000);                                                       // real module chunks: generous under a loaded CI runner
});

describe("L.1 — «المزيد» (the phone menu for the secondary actions)", () => {
  it("toggles its group, closes after an action, on Escape (focus back on «المزيد») and on an outside press", async () => {
    mount();
    await heading("صفحة غنية");
    const more = screen.getByRole("button", { name: "المزيد" });
    const group = document.getElementById("learning-reader-more")!;
    expect(more.getAttribute("aria-controls")).toBe("learning-reader-more");
    expect(within(group).getByRole("button", { name: "وضع التركيز" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "وضع العرض" })).toBeTruthy();
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(group.hasAttribute("data-open")).toBe(true);
    fireEvent.click(within(group).getByRole("button", { name: "وضع التركيز" }));
    expect(group.hasAttribute("data-open")).toBe(false);
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(true);
    fireEvent.click(more);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(group.hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(more);
    expect(document.documentElement.hasAttribute("data-eb-reading-focus")).toBe(true);    // Escape closed the menu only
    fireEvent.click(more);
    fireEvent.pointerDown(document.querySelector(".learning-reader-page-title")!);
    expect(group.hasAttribute("data-open")).toBe(false);
  });
});
