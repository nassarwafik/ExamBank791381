// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import LearningReader, { type ReaderContentApi } from "./LearningReader";
import { makeImmediateApi, makeDeferredApi } from "./readerFixtures";

afterEach(cleanup);

function mount(api: ReaderContentApi = makeImmediateApi()) {
  const onExit = vi.fn();
  const utils = render(<LearningReader courseId="791381" onExit={onExit} api={api} />);
  return { ...utils, onExit, api };
}
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const prevBtn = () => screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement;
const nextBtn = () => screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement;
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;

describe("Phase 3 — LearningReader: open + navigate", () => {
  it("opens on the first manifest page with the TOC, the reader position and a separate source reference; first Previous is disabled; no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount();
    await heading("صفحة غنية");                                              // first page selected
    expect(screen.getByText("صفحة 1 من 7")).toBeTruthy();                   // reader position (not the PDF page)
    expect(screen.getByText(/المصدر: كتاب 791381 · الصفحات 124–125/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "فهرس الكتاب" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" })).toBeTruthy();
    expect(prevBtn().disabled).toBe(true);
    expect(nextBtn().disabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Next crosses page, lesson and module boundaries; the last page disables Next and shows the قيد الإعداد state", async () => {
    mount();
    await heading("صفحة غنية");
    fireEvent.click(nextBtn()); await heading("صفحة ٢");                     // page (same lesson)
    fireEvent.click(nextBtn()); await heading("صفحة ٣");                     // lesson boundary (m1-l1 → m1-l2)
    fireEvent.change(jump(), { target: { value: "p4" } }); await heading("صفحة ٤");
    fireEvent.click(nextBtn()); await heading("صفحة ٥");                     // module boundary (m1 → m2)
    fireEvent.click(nextBtn()); await heading("صفحة ٦");
    fireEvent.click(nextBtn()); await heading("صفحة ٧");                     // last page (m3, no body)
    expect(nextBtn().disabled).toBe(true);
    expect(prevBtn().disabled).toBe(false);
    expect(screen.getByText("المحتوى التفاعلي لهذه الصفحة قيد الإعداد")).toBeTruthy();
  });

  it("Previous crosses a module boundary back, and Jump selects any page by manifest order", async () => {
    mount();
    await heading("صفحة غنية");
    fireEvent.change(jump(), { target: { value: "p5" } }); await heading("صفحة ٥");
    fireEvent.click(prevBtn()); await heading("صفحة ٤");                     // p5 (m2) → p4 (m1)
    fireEvent.change(jump(), { target: { value: "p6" } }); await heading("صفحة ٦");
    expect(screen.getByText("صفحة 6 من 7")).toBeTruthy();
  });
});

describe("Phase 3 — LearningReader: lazy loading, cache, stale-load safety, no network", () => {
  it("loads the manifest once, loads only the owning module, caches it, loads a second module, and never re-loads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const api = makeImmediateApi();
    mount(api);
    await heading("صفحة غنية");
    await waitFor(() => expect(api.calls).toEqual(["m1"]));                  // only m1 loaded for p1
    fireEvent.click(nextBtn()); await heading("صفحة ٢");                     // p2 same module → no new load
    fireEvent.change(jump(), { target: { value: "p5" } }); await heading("صفحة ٥");
    await waitFor(() => expect(api.calls).toEqual(["m1", "m2"]));           // second module loaded once
    fireEvent.change(jump(), { target: { value: "p1" } }); await heading("صفحة غنية");
    await waitFor(() => {});
    expect(api.calls).toEqual(["m1", "m2"]);                                // m1 served from cache, not re-loaded
    expect(api.manifestCalls()).toBe(1);                                    // manifest loaded exactly once
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never renders a stale page when module loads resolve out of order", async () => {
    const ctl = makeDeferredApi();
    mount(ctl.api);
    await heading("صفحة غنية");                                             // manifest ready, p1 selected (m1 load pending)
    fireEvent.change(jump(), { target: { value: "p5" } });                  // move to p5 (m2 load pending) before m1 resolves
    await waitFor(() => expect(ctl.pendingCount()).toBe(2));
    await act(async () => { ctl.resolveModule("m2"); });                    // newer page resolves first
    await heading("صفحة ٥");
    await act(async () => { ctl.resolveModule("m1"); });                    // stale older load resolves late
    expect(screen.getByRole("heading", { level: 2, name: "صفحة ٥" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "صفحة غنية" })).toBeNull();
  });
});

describe("Phase 3 — LearningReader: mobile TOC drawer", () => {
  it("opens the drawer, selecting a page navigates and closes it, without a second navigation authority", async () => {
    mount();
    await heading("صفحة غنية");
    fireEvent.click(screen.getByRole("button", { name: /الفهرس/ }));
    const dialog = await screen.findByRole("dialog", { name: "فهرس الكتاب" });
    fireEvent.click(within(dialog).getByRole("button", { name: "صفحة ٣" }));
    await heading("صفحة ٣");
    expect(screen.queryByRole("dialog", { name: "فهرس الكتاب" })).toBeNull(); // closed after selection
  });
});
