// @vitest-environment happy-dom
//
// Phase 8E-6 — the Reader with LAZY visual chunks: a page without a visual evaluates no visual implementation; a page
// with one visual evaluates ONLY its trusted group; a second page's visual loads its own group later while the first
// stays cached; returning re-uses the cached module (no re-evaluation, no loading line); an unknown visualId never
// imports anything and shows the existing fallback; the Reader shell (TOC, page navigation, heading) stays mounted
// while a visual chunk is suspended. Group evaluation is observed through counting mock factories around the REAL
// group modules; the ch1 group is additionally gated so the suspended frame can be observed deterministically.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act, within } from "@testing-library/react";
import LearningReader, { type ReaderContentApi } from "./LearningReader";
import { deriveManifest, type LearningCourseContent, type ContentModule, type ContentPage } from "../content/types";

const probe = vi.hoisted(() => {
  const g = { evaluated: { ch1: 0, m02: 0 }, release: () => {}, open: Promise.resolve() };
  g.open = new Promise<void>(r => { g.release = r; });
  return g;
});
vi.mock("../visuals/791381/groups/ch1", async importOriginal => { probe.evaluated.ch1 += 1; await probe.open; return importOriginal(); });
vi.mock("../visuals/791381/groups/m02", async importOriginal => { probe.evaluated.m02 += 1; return importOriginal(); });

const CID = "791381";
const src = (pdf: number): ContentPage["source"] => ({ kind: "book", sourceId: CID, pdfPageStart: pdf });
const text = (id: string, t: string): ContentPage["blocks"][number] => ({ id, type: "text", origin: "book", spans: [{ text: t }] });
const visual = (id: string, visualId: string, alt: string): ContentPage["blocks"][number] => ({ id, type: "visual", origin: "teacher-enrichment", visualId, alt, title: "رسم: " + alt, caption: "شرح " + alt, motion: true });
const ALT1 = "أجهزة متصلة بشبكة", ALT2 = "تحويل ثنائي", ALT4 = "بديل مجهول";
const pages: ContentPage[] = [
  { id: "p1", title: "صفحة بلا رسم", order: 1, source: src(8), blocks: [text("p1-t", "نص فقط.")] },
  { id: "p2", title: "صفحة رسم الشبكة", order: 2, source: src(9), blocks: [text("p2-t", "شبكة."), visual("p2-v", "791381/ch1/network-connected-devices", ALT1)] },
  { id: "p3", title: "صفحة رسم الثنائي", order: 3, source: src(10), blocks: [text("p3-t", "ثنائي."), visual("p3-v", "791381/m02/binary-to-decimal", ALT2)] },
  { id: "p4", title: "صفحة رسم مجهول", order: 4, source: src(11), blocks: [visual("p4-v", "791381/m99/not-registered", ALT4)] },
];
const course: LearningCourseContent = { schemaVersion: 1, courseId: CID, title: "كتاب اختبار", direction: "rtl", modules: [{ id: "m1", title: "الوحدة", order: 1, lessons: [{ id: "m1-l1", title: "الدرس", order: 1, pages }] }] };
const manifest = deriveManifest(course);
const bodies = new Map<string, ContentModule>(course.modules.map(m => [m.id, m]));
const api: ReaderContentApi = { loadManifest: async () => manifest, hasModule: (_c, m) => bodies.has(m), loadModule: async (_c, m) => bodies.get(m)! };

function setMatchMedia(reduced: boolean) {
  const mql = { matches: reduced, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} };
  (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
}
afterEach(cleanup);
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const jumpTo = (id: string) => fireEvent.change(screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement, { target: { value: id } });
const LOADING = "جارٍ تحميل الرسم التوضيحي...";
const shellIsMounted = () => {
  expect(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" })).toBeTruthy();   // TOC
  expect(screen.getByRole("navigation", { name: "تنقّل بين الصفحات" })).toBeTruthy();             // page navigation
  expect(screen.getByRole("button", { name: "التالي" })).toBeTruthy();
};

describe("8E-6 — Reader pages and lazy visual groups", () => {
  it("A–F: no-visual page evaluates nothing; one visual loads only its group while the shell stays mounted; a second group loads later; returning re-uses the cache; unknown id imports nothing", async () => {
    setMatchMedia(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningReader courseId={CID} onExit={() => {}} api={api} />);
    // A — a page WITHOUT a visual: the Reader is up, no visual implementation evaluated.
    await heading("صفحة بلا رسم");
    shellIsMounted();
    expect(await screen.findByText(/نص فقط/)).toBeTruthy();                                  // the module body arrives asynchronously
    expect(probe.evaluated).toEqual({ ch1: 0, m02: 0 });
    // B + F — a page with ONE visual: only ITS group starts loading; the Reader shell, the page heading, the text and the
    // figure chrome stay mounted while the chunk is suspended and only the frame shows the quiet status line.
    jumpTo("p2");
    await heading("صفحة رسم الشبكة");
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(LOADING);
    expect(status.closest(".eb-visual-frame")).not.toBeNull();
    expect(probe.evaluated).toEqual({ ch1: 1, m02: 0 });                                 // the required group only — not the unrelated one
    shellIsMounted();
    expect(await screen.findByText(/^شبكة/)).toBeTruthy();
    expect(screen.getByText("رسم: " + ALT1)).toBeTruthy(); expect(screen.getByText("شرح " + ALT1)).toBeTruthy();
    expect(screen.queryByRole("img", { name: ALT1 })).toBeNull();
    await act(async () => { probe.release(); await probe.open; });
    const svg1 = await screen.findByRole("img", { name: ALT1 });
    expect(svg1.tagName.toLowerCase()).toBe("svg");
    expect(screen.queryByText(LOADING)).toBeNull();
    shellIsMounted();
    // C — a second page with a DIFFERENT visual: its group loads now; the first stays cached (count unchanged).
    jumpTo("p3");
    await heading("صفحة رسم الثنائي");
    const svg2 = await screen.findByRole("img", { name: ALT2 });
    expect(svg2.tagName.toLowerCase()).toBe("svg");
    expect(probe.evaluated).toEqual({ ch1: 1, m02: 1 });
    // D — return to the first page: no duplicate module evaluation; the cached component renders without a loading line.
    jumpTo("p2");
    await heading("صفحة رسم الشبكة");
    expect(await screen.findByRole("img", { name: ALT1 })).toBeTruthy();
    expect(probe.evaluated).toEqual({ ch1: 1, m02: 1 });
    expect(screen.queryByText(LOADING)).toBeNull();
    // E — an unknown visualId: the existing fallback, no status line, no import of anything.
    jumpTo("p4");
    await heading("صفحة رسم مجهول");
    const missing = screen.getByRole("img", { name: ALT4 });
    expect(missing.textContent).toContain("قيد الإعداد");
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(probe.evaluated).toEqual({ ch1: 1, m02: 1 });
    shellIsMounted();
    expect(fetchSpy).not.toHaveBeenCalled();                                              // visuals never touch the network layer
  });

  it("the Reader's own module loading is unchanged: a visual page in the same content module needs no extra module load", async () => {
    setMatchMedia(false);
    const calls: string[] = [];
    probe.release();                                                                      // independent of the first test's gate
    const counting: ReaderContentApi = { ...api, loadModule: async (c, m) => { calls.push(m); return api.loadModule(c, m); } };
    render(<LearningReader courseId={CID} onExit={() => {}} api={counting} />);
    await heading("صفحة بلا رسم");
    jumpTo("p2"); await heading("صفحة رسم الشبكة"); await screen.findByRole("img", { name: ALT1 });
    jumpTo("p3"); await heading("صفحة رسم الثنائي"); await screen.findByRole("img", { name: ALT2 });
    expect(calls).toEqual(["m1"]);                                                        // one content-module load, as before
    expect(within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" })).getAllByRole("button").length).toBeGreaterThan(0);
  });
});
