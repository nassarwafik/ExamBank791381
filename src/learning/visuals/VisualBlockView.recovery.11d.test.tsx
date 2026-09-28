// @vitest-environment happy-dom
//
// Phase 11D — a failed educational visual degrades INSIDE its frame and never reaches the global ErrorBoundary.
//
// Production path under test: registry.ts `visual(id, importer)` → the real `lazyWithRetry(importer, "learning-visual:"+id)`
// → React.lazy → VisualBlockView's local VisualErrorBoundary + Suspense (inside .eb-visual-frame), all under the global
// ErrorBoundary exactly as in main.tsx. The only seam is the chunk FETCH: for a chosen `learning-visual:<id>` key the
// importer can be replaced (stale-deployment TypeError, a component that throws while rendering, or a never-settling
// load). Each test imports fresh modules so React.lazy's per-component cache starts clean.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act, fireEvent, waitFor } from "@testing-library/react";
import type { VisualBlock } from "../content/types";

const seam = vi.hoisted(() => ({ mode: {} as Record<string, "stale" | "render-throw" | "pending">, calls: {} as Record<string, number> }));
vi.mock("../../lazyWithRetry", async importOriginal => {
  const actual = await importOriginal<typeof import("../../lazyWithRetry")>();
  return {
    ...actual,
    lazyWithRetry: <T,>(factory: () => Promise<T>, key: string) => actual.lazyWithRetry(() => {
      const id = key.startsWith("learning-visual:") ? key.slice("learning-visual:".length) : "";
      const mode = seam.mode[id];
      if (id) seam.calls[id] = (seam.calls[id] || 0) + 1;
      if (mode === "stale") return Promise.reject(Object.assign(new Error("Failed to fetch dynamically imported module: https://app.example/assets/ch1-OLDHASH.js?token=secret"), { name: "TypeError" }));
      if (mode === "render-throw") return Promise.resolve({ default: () => { throw new Error("SVG render exploded: /assets/ch1-X.js id=42"); } } as unknown as T);
      if (mode === "pending") return new Promise<T>(() => {});
      return factory();
    }, key),
  };
});

const A = "791381/ch1/network-connected-devices", B = "791381/ch1/network-uses-map", C = "791381/ch1/shared-printer";
const markerKey = (id: string) => "examBankChunkReload:learning-visual:" + id;
const block = (visualId: string, alt = "رسم " + visualId): VisualBlock => ({ id: "v-" + visualId, type: "visual", origin: "teacher-enrichment", visualId, alt, title: "عنوان " + visualId, caption: "شرح " + visualId, motion: true });
const CHUNK_TEXT = "تم تحديث الرسم التوضيحي. أعد تحميل الصفحة لعرض النسخة الجديدة.";
const RUNTIME_TEXT = "تعذر عرض الرسم التوضيحي حاليًا.";
const GLOBAL_TEXTS = ["تم تحديث الموقع", "حدث خطأ غير متوقع"];

class MockIO {
  static instances: MockIO[] = [];
  disconnected = false; elements: Element[] = [];
  cb: unknown; options: unknown;
  constructor(cb: unknown, options: unknown) { this.cb = cb; this.options = options; MockIO.instances.push(this); }
  observe(el: Element) { this.elements.push(el); } unobserve() {} disconnect() { this.disconnected = true; }
}
function setReducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
let reload: ReturnType<typeof vi.fn>;
let globalCatches: unknown[][];
async function fresh() {
  vi.resetModules();
  const { default: VisualBlockView } = await import("./VisualBlockView");
  const { default: ErrorBoundary } = await import("../../ErrorBoundary");
  return { VisualBlockView, ErrorBoundary };
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

beforeEach(() => {
  seam.mode = {}; seam.calls = {};
  sessionStorage.clear();
  sessionStorage.setItem("examBankBuilderToken", "student-token");
  sessionStorage.setItem("examBankSessionRole", "student");
  setReducedMotion(false);
  MockIO.instances = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = MockIO;
  reload = vi.fn();
  vi.spyOn(window.location, "reload").mockImplementation(reload as unknown as () => void);
  globalCatches = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { if (args[0] === "[ErrorBoundary]") globalCatches.push(args); });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("11D — local visual failure matrix", () => {
  it("1. a normal visual chunk resolves → the SVG appears inside the frame", async () => {
    const { VisualBlockView } = await fresh();
    const { container } = render(<VisualBlockView block={block(A)} />);
    await waitFor(() => expect(container.querySelector(".eb-visual-frame svg")).toBeTruthy());
    expect(container.querySelector(".eb-visual-failed")).toBeNull();
  });

  it("2. a pending visual keeps the existing local loading status", async () => {
    seam.mode[A] = "pending";
    const { VisualBlockView } = await fresh();
    render(<VisualBlockView block={block(A)} />);
    await settle();
    expect(screen.getByRole("status").textContent).toBe("جارٍ تحميل الرسم التوضيحي...");
  });

  it("3. an unknown visual id keeps the unchanged «قيد الإعداد» fallback (not a failure state)", async () => {
    const { VisualBlockView } = await fresh();
    const { container } = render(<VisualBlockView block={block("791381/nope/not-registered")} />);
    expect(container.querySelector(".eb-visual-missing")!.textContent).toContain("الرسم التوضيحي قيد الإعداد");
    expect(container.querySelector(".eb-visual-failed")).toBeNull();
  });

  it("4. the FIRST stale-chunk failure gets lazyWithRetry's one automatic reload (frame stays on its loading status)", async () => {
    seam.mode[A] = "stale";
    const { VisualBlockView, ErrorBoundary } = await fresh();
    const { container } = render(<ErrorBoundary><VisualBlockView block={block(A)} /></ErrorBoundary>);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(markerKey(A))).toBe("1");
    expect(screen.getByRole("status").textContent).toBe("جارٍ تحميل الرسم التوضيحي...");
    expect(container.querySelector(".eb-visual-failed")).toBeNull();
  });

  it("5+9+12. after the one recovery: NO second automatic reload, the LOCAL chunk note replaces only the illustration; title/caption/figure stay; nothing reaches the global boundary; session untouched; no raw error text", async () => {
    seam.mode[A] = "stale";
    sessionStorage.setItem(markerKey(A), "1");
    const { VisualBlockView, ErrorBoundary } = await fresh();
    const { container } = render(<ErrorBoundary><VisualBlockView block={block(A)} /></ErrorBoundary>);
    const note = await screen.findByText(CHUNK_TEXT);
    expect(reload).not.toHaveBeenCalled();
    const fig = container.querySelector("figure.eb-visual-figure")!;
    expect(fig.querySelector(".eb-visual-title")!.textContent).toBe("عنوان " + A);
    expect(fig.querySelector("figcaption")!.textContent).toBe("شرح " + A);
    expect(note.closest(".eb-visual-frame")).toBe(fig.querySelector(".eb-visual-frame"));
    expect(fig.querySelector("[data-visual-failure]")!.getAttribute("data-visual-failure")).toBe("chunk");
    for (const t of GLOBAL_TEXTS) expect(screen.queryByText(t)).toBeNull();
    expect(globalCatches).toEqual([]);
    expect(container.textContent).not.toMatch(/OLDHASH|token=|Failed to fetch|\.js/);
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");
    expect(sessionStorage.getItem("examBankSessionRole")).toBe("student");
    // the only reload left is the USER's choice
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل الصفحة" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("6. an ordinary runtime error inside the visual → the LOCAL runtime note only; no reload, no marker, no raw message", async () => {
    seam.mode[A] = "render-throw";
    const { VisualBlockView, ErrorBoundary } = await fresh();
    const { container } = render(<ErrorBoundary><VisualBlockView block={block(A)} /></ErrorBoundary>);
    expect(await screen.findByText(RUNTIME_TEXT)).toBeTruthy();
    expect(container.querySelector("[data-visual-failure]")!.getAttribute("data-visual-failure")).toBe("runtime");
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(markerKey(A))).toBeNull();
    expect(container.textContent).not.toMatch(/exploded|id=42|\.js/);
    for (const t of GLOBAL_TEXTS) expect(screen.queryByText(t)).toBeNull();
    expect(globalCatches).toEqual([]);
  });

  it("7. another visual on the same page still renders next to a failed one", async () => {
    seam.mode[A] = "render-throw";
    const { VisualBlockView, ErrorBoundary } = await fresh();
    const { container } = render(<ErrorBoundary><div><VisualBlockView block={block(A)} /><VisualBlockView block={block(B)} /></div></ErrorBoundary>);
    await screen.findByText(RUNTIME_TEXT);
    await waitFor(() => expect(container.querySelectorAll("figure.eb-visual-figure")[1].querySelector("svg")).toBeTruthy());
    expect(container.querySelectorAll("figure.eb-visual-figure")).toHaveLength(2);
  });

  it("10+11. reduced motion: a failing visual allocates no observer; normal motion: the frame observer is disconnected on unmount after a failure", async () => {
    seam.mode[A] = "render-throw";
    setReducedMotion(true);
    let mods = await fresh();
    const first = render(<mods.ErrorBoundary><mods.VisualBlockView block={block(A)} /></mods.ErrorBoundary>);
    await screen.findByText(RUNTIME_TEXT);
    expect(MockIO.instances).toHaveLength(0);
    first.unmount();
    setReducedMotion(false);
    seam.mode[C] = "render-throw";
    mods = await fresh();
    const second = render(<mods.ErrorBoundary><mods.VisualBlockView block={block(C)} /></mods.ErrorBoundary>);
    await screen.findByText(RUNTIME_TEXT);
    expect(MockIO.instances).toHaveLength(1);
    second.unmount();
    expect(MockIO.instances[0].disconnected).toBe(true);
  });
});

describe("11D — a failed visual inside the REAL Reader: chrome and navigation stay usable", () => {
  it("8+12. the Reader page with a visual that failed after recovery keeps its heading, pager and navigation; Next still moves on; position callback fires; global boundary untouched", async () => {
    seam.mode[A] = "stale";
    sessionStorage.setItem(markerKey(A), "1");
    vi.resetModules();
    const { default: LearningReader } = await import("../reader/LearningReader");
    const { default: ErrorBoundary } = await import("../../ErrorBoundary");
    const onPageChange = vi.fn();
    render(<ErrorBoundary><LearningReader courseId="791381" onExit={() => {}} initialPageId="791381-m01-l01-p01" onPageChange={onPageChange} /></ErrorBoundary>);
    expect(await screen.findByText(CHUNK_TEXT, {}, { timeout: 8000 })).toBeTruthy();
    const heading = screen.getByRole("heading", { level: 2 }).textContent;
    const pos = document.querySelector(".learning-reader-navpos")!.textContent;
    expect(reload).not.toHaveBeenCalled();
    for (const t of GLOBAL_TEXTS) expect(screen.queryByText(t)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await waitFor(() => expect(document.querySelector(".learning-reader-navpos")!.textContent).not.toBe(pos), { timeout: 8000 });
    await waitFor(() => expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(heading), { timeout: 8000 });
    expect(onPageChange).toHaveBeenCalled();
    expect(globalCatches).toEqual([]);
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token");
  }, 20000);
});

