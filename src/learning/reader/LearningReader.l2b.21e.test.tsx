// @vitest-environment happy-dom
// Phase 21E L2-B — reading progress, orientation and the index, behaviourally:
//   • a thin book-position progress bar (role progressbar, «الصفحة n من total») that follows navigation; absent in
//     presentation mode;
//   • «الدرس x من y» in the page head;
//   • the index: only the current module starts open, navigation into another module reveals it, the current lesson is
//     marked;
//   • «انتقل إلى صفحة» lives in the index: a pointer pick opens the page at once, keyboard browsing only drafts it and
//     Enter / «انتقل» opens it;
//   • device-local "visited" marks — SECURITY: scoped per student and course, never read or written without a scope,
//     never rendered for a page outside the current (published-only) manifest, robust to malformed / blocked storage,
//     and never shown in a teacher session.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import LearningReaderWithTraining from "../training/LearningReaderWithTraining";
import { makeImmediateApi, makeDeferredApi, readerBodies } from "./readerFixtures";
import { createRestrictedReaderContentApi } from "./restrictedContentApi";

const KEY = (scope: string, course = "791381") => "eb.learning.visited.v1:" + scope + ":" + course;
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* ignore */ } });

function mount(props: Partial<Parameters<typeof LearningReader>[0]> = {}) {
  return render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} {...props} />);
}
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const desktopToc = () => within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" }));
const nextBtn = () => screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement;
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
// The page's CONTENT (not just its header) is on screen — the moment a page counts as visited.
const contentReady = () => waitFor(() => expect(screen.queryByText("جارٍ تحميل الصفحة...")).toBeNull());
const seenTitles = () => [...document.querySelectorAll(".learning-reader-sidebar .learning-reader-toc-page.is-visited .learning-reader-toc-pagetitle")].map(e => e.textContent);

describe("21E L2-B — progress and orientation", () => {
  it("a progress bar reports the reader position and follows navigation; the page head shows «الدرس x من y»", async () => {
    mount();
    await heading("صفحة غنية");
    const bar = screen.getByRole("progressbar", { name: "موضعك في الكتاب" });
    expect([bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-valuemax"), bar.getAttribute("aria-valuetext")]).toEqual(["1", "7", "الصفحة 1 من 7"]);
    expect(screen.getByText("الدرس 1 من 2")).toBeTruthy();
    fireEvent.click(nextBtn()); await heading("صفحة ٢");
    fireEvent.click(nextBtn()); await heading("صفحة ٣");                                  // m1, second lesson
    expect(screen.getByRole("progressbar", { name: "موضعك في الكتاب" }).getAttribute("aria-valuetext")).toBe("الصفحة 3 من 7");
    expect(screen.getByText("الدرس 2 من 2")).toBeTruthy();
  });

  it("presentation mode has no progress bar (its own page field stays the position control)", async () => {
    mount({ initialPresentation: true });
    await heading("صفحة غنية");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("21E L2-B — index: current module, reveal on navigation, current lesson", () => {
  it("starts with only the current module open, reveals the module navigation moves into, and marks the current lesson", async () => {
    mount();
    await heading("صفحة غنية");
    const m1 = desktopToc().getByRole("button", { name: "الوحدة الأولى" });
    const m2 = desktopToc().getByRole("button", { name: "الوحدة الثانية" });
    expect([m1.getAttribute("aria-expanded"), m2.getAttribute("aria-expanded")]).toEqual(["true", "false"]);
    expect(desktopToc().getByText("الدرس الحالي").closest(".learning-reader-toc-lesson")!.textContent).toContain("الدرس الأول");
    fireEvent.click(m1);                                                                   // the active module really collapses
    expect(m1.getAttribute("aria-expanded")).toBe("false");
    for (let i = 0; i < 4; i++) fireEvent.click(nextBtn());                                // p1 → p5 (into m2)
    await heading("صفحة ٥");
    expect(m2.getAttribute("aria-expanded")).toBe("true");                                 // revealed by navigation
    expect(desktopToc().getByRole("button", { name: "صفحة ٥" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("21E L2-B — «انتقل إلى صفحة» in the index", () => {
  it("lives in the index; a pointer pick opens the page at once", async () => {
    mount();
    await heading("صفحة غنية");
    expect(jump().closest(".learning-reader-toc")).toBeTruthy();
    expect(document.querySelector(".learning-reader-main .learning-reader-jump")).toBeNull();
    fireEvent.change(jump(), { target: { value: "p3" } });
    await heading("صفحة ٣");
  });

  it("keyboard browsing only drafts a page; Enter or «انتقل» opens it; nothing navigates on each arrow step", async () => {
    mount();
    await heading("صفحة غنية");
    const go = screen.getByRole("button", { name: "انتقل" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.keyDown(jump(), { key: "ArrowDown" }); fireEvent.change(jump(), { target: { value: "p2" } });
    fireEvent.keyDown(jump(), { key: "ArrowDown" }); fireEvent.change(jump(), { target: { value: "p3" } });
    await waitFor(() => {});
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();   // still on page 1
    expect(jump().value).toBe("p3");                                                        // the draft is shown
    expect(go.disabled).toBe(false);
    fireEvent.keyDown(jump(), { key: "Enter" });
    await heading("صفحة ٣");
    fireEvent.keyDown(jump(), { key: "ArrowDown" }); fireEvent.change(jump(), { target: { value: "p4" } });
    fireEvent.click(screen.getByRole("button", { name: "انتقل" }));
    await heading("صفحة ٤");
    fireEvent.keyDown(jump(), { key: "ArrowDown" }); fireEvent.change(jump(), { target: { value: "p5" } });
    fireEvent.click(screen.getByRole("button", { name: "السابق" }));                      // any navigation drops the draft
    await heading("صفحة ٣");
    expect(jump().value).toBe("p3");
  });

  it("is not offered in presentation mode (the page-number field is)", async () => {
    mount({ initialPresentation: true });
    await heading("صفحة غنية");
    expect(screen.queryByLabelText("انتقل إلى صفحة")).toBeNull();
  });
});

describe("21E L2-B — visited marks (device-local, students only) — security", () => {
  it("without a scope nothing is read or written and no mark is shown", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem"), set = vi.spyOn(Storage.prototype, "setItem");
    mount();
    await heading("صفحة غنية");
    fireEvent.click(nextBtn()); await heading("صفحة ٢");
    const touched = [...get.mock.calls, ...set.mock.calls].map(c => String(c[0])).filter(k => k.startsWith("eb.learning.visited"));
    expect(touched).toEqual([]);
    expect(seenTitles()).toEqual([]);
  });

  it("marks read pages for this student and course, persists them, and never shows them to another student or course", async () => {
    const a = mount({ visitedScope: "student:u1" });
    await heading("صفحة غنية"); await contentReady();
    fireEvent.click(nextBtn()); await heading("صفحة ٢"); await contentReady();
    expect(seenTitles()).toEqual(["صفحة غنية", "صفحة ٢"]);
    expect(JSON.parse(localStorage.getItem(KEY("student:u1"))!)).toEqual(["p1", "p2"]);
    expect(desktopToc().getByRole("button", { name: /^صفحة غنية\s*،\s*تمت قراءتها$/ })).toBeTruthy();   // announced, not colour-only
    a.unmount();

    const again = mount({ visitedScope: "student:u1" });                                     // same student, same device
    await heading("صفحة غنية"); await contentReady();
    expect(seenTitles()).toEqual(["صفحة غنية", "صفحة ٢"]);
    again.unmount();

    mount({ visitedScope: "student:u2" });                                                   // another student
    await heading("صفحة غنية"); await contentReady();
    expect(seenTitles()).toEqual(["صفحة غنية"]);                                             // only what u2 opened
    expect(JSON.parse(localStorage.getItem(KEY("student:u1"))!)).toEqual(["p1", "p2"]);     // u1 untouched
    cleanup();

    localStorage.setItem(KEY("student:u3", "other-course"), JSON.stringify(["p2", "p3"]));
    mount({ visitedScope: "student:u3" });
    await heading("صفحة غنية"); await contentReady();
    expect(seenTitles()).toEqual(["صفحة غنية"]);                                             // another course's marks never apply
  });

  it("never renders a stored id outside the current published-only manifest (stale / unpublished pages)", async () => {
    // The student once read p5 (m2); the class has since hidden m2. The store keeps the id, the Reader never shows it.
    localStorage.setItem(KEY("student:u1"), JSON.stringify(["p5", "p6", "x-unknown", "p2"]));
    const api = createRestrictedReaderContentApi("791381", ["m1"], makeImmediateApi());
    mount({ api, visitedScope: "student:u1" });
    await heading("صفحة غنية"); await contentReady();
    const toc = document.querySelector(".learning-reader-sidebar")!;
    expect(toc.textContent).not.toContain("الوحدة الثانية");
    expect(toc.textContent).not.toContain("صفحة ٥");
    expect(seenTitles()).toEqual(["صفحة غنية", "صفحة ٢"]);
    expect([...jump().options].map(o => o.value)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  // Review fix (ChatGPT, #314): a page counts as visited only once its CONTENT has loaded — never on selection alone.
  it("never marks a page whose module failed to load or is not available", async () => {
    const api = makeImmediateApi({
      loadModule: async (_c, m) => { if (m === "m2") throw new Error("offline"); const b = readerBodies.get(m); if (!b) throw new Error("no body"); return b; },
    });
    mount({ api, visitedScope: "student:u1" });
    await heading("صفحة غنية"); await contentReady();
    await waitFor(() => expect(localStorage.getItem(KEY("student:u1"))).toBe(JSON.stringify(["p1"])));
    fireEvent.change(jump(), { target: { value: "p5" } });                                  // m2 → load fails
    await screen.findByText("تعذّر تحميل هذه الصفحة");
    fireEvent.change(jump(), { target: { value: "p7" } });                                  // m3 → no body served (unavailable)
    await heading("صفحة ٧");
    await waitFor(() => {});
    expect(JSON.parse(localStorage.getItem(KEY("student:u1"))!)).toEqual(["p1"]);
    expect(seenTitles()).toEqual(["صفحة غنية"]);
  });

  it("marks a page only when its content arrives, not while its module is still loading", async () => {
    const d = makeDeferredApi();
    mount({ api: d.api, visitedScope: "student:u1" });
    await heading("صفحة غنية");                                                              // header renders while m1 loads
    await waitFor(() => {});
    expect(localStorage.getItem(KEY("student:u1"))).toBeNull();                              // still loading → not visited
    expect(seenTitles()).toEqual([]);
    d.resolveModule("m1");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(KEY("student:u1")) ?? "[]")).toEqual(["p1"]));
    await waitFor(() => expect(seenTitles()).toEqual(["صفحة غنية"]));
  });

  it("malformed or blocked storage never breaks reading and shows no marks", async () => {
    localStorage.setItem(KEY("student:u1"), "{not json");
    const first = mount({ visitedScope: "student:u1" });
    await heading("صفحة غنية"); await contentReady();
    await waitFor(() => expect(seenTitles()).toEqual(["صفحة غنية"]));                                             // the stored junk is ignored
    first.unmount();
    localStorage.setItem(KEY("student:u1"), JSON.stringify({ p1: true }));
    const second = mount({ visitedScope: "student:u1" });
    await heading("صفحة غنية"); await contentReady();
    await waitFor(() => expect(seenTitles()).toEqual(["صفحة غنية"]));
    second.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount({ visitedScope: "student:u1" });
    await heading("صفحة غنية");
    fireEvent.click(nextBtn()); await heading("صفحة ٢");                                    // reading continues
  });

  it("a teacher session never shows marks, even if a scope is passed to the host", async () => {
    render(<LearningReaderWithTraining courseId="791381" api={makeImmediateApi()} onExit={vi.fn()} exitLabel="رجوع" client={null} actor="teacher" visitedScope="student:u1" />);
    await heading("صفحة غنية");
    expect(seenTitles()).toEqual([]);
    expect(localStorage.getItem(KEY("student:u1"))).toBeNull();
  });
});
