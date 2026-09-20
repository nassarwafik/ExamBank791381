// @vitest-environment happy-dom
// Phase 3E — the Reader over the REAL Unit-3 content (m07, source PDF 24–33) through the real lazy registry:
// opening the Unit-3 opener lazy-loads m07 exactly once, navigating PDF 24→33 stays inside the session cache (no
// reload, no network), m01/m02 behaviour is unchanged, and the remaining skeleton modules (m05+) still render the
// professional «قيد الإعداد» state because they have no body yet (m03 / m04 were completed in place by Batches 6 / 7). Reading
// order follows explicit `order`, so m07 (order 3) comes right after m02 even though its id is not m03.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";
import { registryContentApi, type ReaderContentApi } from "./readerContentApi";
import { nextPage, previousPage } from "../content/navigation";
import manifest from "../content/791381/manifest";

afterEach(cleanup);

function countingApi(): ReaderContentApi & { loads: string[]; trace: string[] } {
  const loads: string[] = [];
  const trace: string[] = [];
  const t0 = performance.now();
  return {
    loadManifest: registryContentApi.loadManifest,
    hasModule: registryContentApi.hasModule,
    loadModule: (c, m) => {
      loads.push(m);
      const n = loads.length, start = performance.now() - t0;
      trace.push(`#${n} ${m} start@${start.toFixed(0)}ms`);
      const p = registryContentApi.loadModule(c, m);
      p.then(() => trace.push(`#${n} ${m} ok@${(performance.now() - t0).toFixed(0)}ms`), e => trace.push(`#${n} ${m} FAIL@${(performance.now() - t0).toFixed(0)}ms ${String(e)}`));
      return p;
    },
    loads, trace,
  };
}
const mount = (api: ReaderContentApi = registryContentApi) => render(<LearningReader courseId="791381" onExit={vi.fn()} api={api} />);
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const goTo = (pageId: string) => fireEvent.change(jump(), { target: { value: pageId } });
// The REAL code-split module chunks (manifest, m01, m07) are imported here for the first time in the worker and are
// transformed on the fly; under CPU contention with sibling test files that cold start can exceed testing-library's
// 1 s wait and vitest's 5 s per-test ceiling. Both are raised to the real cost — the assertions themselves are strict.
const SLOW = { timeout: 8000 };
const CHUNK_TEST_TIMEOUT = 20000;

const M07_PAGES = [
  "791381-m07-l00-p01",
  "791381-m07-l01-p01", "791381-m07-l01-p02", "791381-m07-l01-p03", "791381-m07-l01-p04", "791381-m07-l01-p05",
  "791381-m07-l02-p01", "791381-m07-l02-p02", "791381-m07-l02-p03", "791381-m07-l02-p04",
];

describe("Phase 3E — reading order places Unit 3 (m07, order 3) directly after Unit 2", () => {
  it("the page after the last Unit-2 page (PDF 23) is the Unit-3 opener (PDF 24); the historical m03 (now real) comes after m18, then m19 (VTP), then the historical m04 (now real), then the m05 skeleton", () => {
    expect(nextPage(manifest, "791381-m02-l01-p09")?.id).toBe("791381-m07-l00-p01");
    expect(previousPage(manifest, "791381-m07-l00-p01")?.id).toBe("791381-m02-l01-p09");
    expect(nextPage(manifest, "791381-m07-l02-p04")?.id).toBe("791381-m08-l00-p01");   // Unit 4 (m08) now follows Unit 3; the historical m03 reads after the real units
    expect(nextPage(manifest, "791381-m10-l02-p01")?.id).toBe("791381-m11-l00-p01");   // Units 7–8: Unit 7 (m11) follows Unit 6 …
    expect(nextPage(manifest, "791381-m11-l02-p02")?.id).toBe("791381-m12-l00-p01");   // … Unit 8 (m12) follows Unit 7 …
    expect(nextPage(manifest, "791381-m12-l04-p01")?.id).toBe("791381-m13-l01-p01");   // … the batch-2 summary is followed by Batch 3 (m13, PDF 77) …
    expect(nextPage(manifest, "791381-m13-l03-p03")?.id).toBe("791381-m14-l01-p01");   // … Batch 4 follows Batch 3: protocols (m14, PDF 87) …
    expect(nextPage(manifest, "791381-m14-l03-p02")?.id).toBe("791381-m15-l01-p01");   // … then the commands (m15, PDF 93) …
    expect(nextPage(manifest, "791381-m15-l02-p03")?.id).toBe("791381-m16-l01-p01");   // … then the domains (m16, PDF 98) …
    expect(nextPage(manifest, "791381-m16-l05-p01")?.id).toBe("791381-m17-l01-p01");   // … Batch 5 follows Batch 4: network security (m17, PDF 108) …
    expect(nextPage(manifest, "791381-m17-l02-p04")?.id).toBe("791381-m18-l01-p01");   // … then data segmentation (m18, PDF 116) …
    expect(nextPage(manifest, "791381-m18-l03-p01")?.id).toBe("791381-m03-l01-p03");   // … Batch 6: m03 (completed in place) reads after m18's last page (PDF 119), starting at its NEW PDF 121 page …
    expect(nextPage(manifest, "791381-m03-l01-p04")?.id).toBe("791381-m03-l01-p01");   // … then the historical PDF 123 page (order 3) follows the new PDF 122 page …
    expect(nextPage(manifest, "791381-m03-l04-p04")?.id).toBe("791381-m19-l01-p01");   // … Batch 7: after m03's last page (PDF 138) comes the VTP section (m19, PDF 140) …
    expect(nextPage(manifest, "791381-m19-l02-p03")?.id).toBe("791381-m04-l01-p02");   // … then m04 (completed in place) starting at its NEW PDF 146 page …
    expect(nextPage(manifest, "791381-m04-l01-p03")?.id).toBe("791381-m04-l01-p01");   // … the historical PDF 148 page follows the new PDF 147 page …
    expect(nextPage(manifest, "791381-m04-l03-p02")?.id).toBe("791381-m05-l01-p01");   // … and after m04's last page (PDF 157) comes the m05 skeleton (PDF 193)
    expect(previousPage(manifest, "791381-m11-l00-p01")?.id).toBe("791381-m10-l02-p01");
  });
});

describe("Phase 3E — Reader over the real Unit-3 module (lazy, cached, no network)", () => {
  it("opening the Unit-3 opener (PDF 24) lazy-loads m07 exactly once and renders its hero; m01 was loaded for the first page only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const api = countingApi();
    mount(api);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await waitFor(() => expect(api.loads).toEqual(["791381-m01"]), SLOW);
    goTo("791381-m07-l00-p01");                                        // PDF 24 — Unit-3 opener
    expect(await screen.findByText("الوحدة الثالثة", {}, SLOW)).toBeTruthy();
    expect(document.querySelector(".learning-reader-page.is-opener")).toBeTruthy();
    expect(screen.getByText(/المصدر: كتاب 791381 · صفحة PDF 24/)).toBeTruthy();
    await waitFor(() => expect(api.loads, "trace=" + api.trace.join(" | ")).toEqual(["791381-m01", "791381-m07"]), SLOW);
    expect(api.loads.filter(m => m === "791381-m07").length, "trace=" + api.trace.join(" | ")).toBe(1);   // m07 exactly once
    expect(api.loads.filter(m => m === "791381-m02").length, "trace=" + api.trace.join(" | ")).toBe(0);   // m02 never touched
    expect(fetchSpy).not.toHaveBeenCalled();
  }, CHUNK_TEST_TIMEOUT);

  it("navigating every Unit-3 page PDF 24→33 is served from the session cache (m07 loaded once) and each page is ready", async () => {
    const api = countingApi();
    mount(api);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    for (const [i, id] of M07_PAGES.entries()) {
      goTo(id);
      await screen.findByText(new RegExp(`صفحة PDF ${24 + i}(\\D|$)`), {}, SLOW);    // exact 1:1 source page shown
      expect(screen.queryByText("المحتوى التفاعلي لهذه الصفحة قيد الإعداد")).toBeNull();
      expect(screen.queryByText(/لم يتم العثور على محتوى هذه الصفحة/)).toBeNull();
    }
    expect(api.loads.filter(m => m === "791381-m07").length).toBe(1);
  }, CHUNK_TEST_TIMEOUT);

  it("the remaining skeleton m05 (order 18, no body yet) still shows «قيد الإعداد», not an integrity error", async () => {
    mount();
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    goTo("791381-m05-l01-p01");
    await waitFor(() => expect(screen.getByText("المحتوى التفاعلي لهذه الصفحة قيد الإعداد")).toBeTruthy(), SLOW);
    expect(screen.queryByText(/لم يتم العثور على محتوى هذه الصفحة/)).toBeNull();
  }, CHUNK_TEST_TIMEOUT);
});
