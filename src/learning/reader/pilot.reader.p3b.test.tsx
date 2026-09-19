// @vitest-environment happy-dom
// Phase 3B — the Reader over the REAL pilot content (source PDF 7–14) through the real lazy registry: converted
// pages render ready, a converted page inside a PARTIALLY-converted module renders ready while its later
// unconverted manifest pages show "قيد الإعداد" (not a "missing content" integrity error), module bodies load
// lazily and are cached, and pageId navigation / stale-load protection are unchanged.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { registryContentApi, type ReaderContentApi } from "./readerContentApi";

afterEach(cleanup);

/** Wrap the real registry API to count module-body loads (proves lazy + cached), keeping real dynamic-import chunks. */
function countingApi(): ReaderContentApi & { loads: string[] } {
  const loads: string[] = [];
  return {
    loadManifest: registryContentApi.loadManifest,
    hasModule: registryContentApi.hasModule,
    loadModule: (c, m) => { loads.push(m); return registryContentApi.loadModule(c, m); },
    loads,
  };
}
const mount = (api: ReaderContentApi = registryContentApi) => render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} />);
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const goTo = (pageId: string) => fireEvent.change(jump(), { target: { value: pageId } });

describe("Phase 3B — Reader over real pilot content", () => {
  it("opens on the Unit-1 OPENER (PDF 7) rendering its hero, with no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount();
    // wait for the OPENER-only content (unit label appears only in the ready opener hero, not the loading header)
    expect(await screen.findByText("الوحدة الأولى")).toBeTruthy();
    expect(document.querySelector(".learning-reader-page.is-opener")).toBeTruthy();
    // the hero <h2> carries the reader's focus id/class
    const title = screen.getByRole("heading", { level: 2, name: "أساسيات الشبكات" });
    expect(title.classList.contains("learning-reader-opener-title")).toBe(true);
    expect(screen.getByText(/المصدر: كتاب 791381 · صفحة PDF 7/)).toBeTruthy();
    expect(screen.getByText(/الهدف: فكرة أساسية/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders the real converted book content for PDF 8 (definition + summary)", async () => {
    mount();
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" });
    goTo("791381-m01-l01-p01");
    await screen.findByRole("heading", { level: 2, name: "ما هي الشبكة؟" });
    expect(screen.getByText(/الشبكة هي مجموعة أجهزة متصلة/)).toBeTruthy();
    expect(screen.getByText(/الشبكة هي ما يجعل الأجهزة تعمل معًا/)).toBeTruthy();
  });

  it("lazily loads only the owning module, caches it within a module, and loads a second module once", async () => {
    const api = countingApi();
    mount(api);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" });
    await waitFor(() => expect(api.loads).toEqual(["791381-m01"]));    // only m01 for the opener
    goTo("791381-m01-l02-p03");                                        // PDF 13, same module
    await screen.findByRole("heading", { level: 2, name: "إدارة الشبكة وصيانتها" });
    expect(api.loads).toEqual(["791381-m01"]);                         // served from cache, not reloaded
    goTo("791381-m02-l00-p01");                                        // PDF 14, second module
    await screen.findByRole("heading", { level: 2, name: "الأعداد والموازين" });
    await waitFor(() => expect(api.loads).toEqual(["791381-m01", "791381-m02"]));
  });

  it("shows every page of the now-COMPLETE m02, including its last page (PDF 23), as ready — no قيد الإعداد", async () => {
    // Phase 3D completed m02 (PDF 23 converted), so m02 no longer has an unconverted page. The professional
    // "قيد الإعداد" (unavailable) contract for a partial module is still covered by the synthetic-fixture reader
    // tests (LearningReader.test.tsx / LearningPageRenderer.test.tsx, where a module body is intentionally not served).
    mount();
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" });
    goTo("791381-m02-l00-p01");                                        // converted opener → ready
    expect(await screen.findByRole("heading", { level: 2, name: "الأعداد والموازين" })).toBeTruthy();
    goTo("791381-m02-l01-p09");                                        // PDF 23 (خلاصة التحويلات) → now converted (ready)
    expect(await screen.findByRole("heading", { level: 2, name: "خلاصة التحويلات" })).toBeTruthy();
    expect(screen.queryByText("المحتوى التفاعلي لهذه الصفحة قيد الإعداد")).toBeNull();
    expect(screen.queryByText(/لم يتم العثور على محتوى هذه الصفحة/)).toBeNull();  // and NOT the integrity message
  });
});
