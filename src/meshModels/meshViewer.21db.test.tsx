// @vitest-environment happy-dom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeshModel3DView, { type MeshModelSelection } from "./MeshModel3DView";
import { inspectGlbAsset, type MeshDocument } from "./glbAsset";
import { testAssemblyModel, writeGlb } from "./glbWriter";
import type { MeshLibraryAsset } from "./meshAssetCatalog";
import type { MeshLoadResult } from "./meshAssetLoader";
import type { MeshModelSpecV1 } from "./meshModelSpec";
import type { MeshRenderer, MeshRenderState } from "./meshRenderer";

// Phase 21D-B.1 — the mesh viewer component through its seams (the real WebGL path is certified in real Chromium by
// scripts/check-mesh-models-browser-21db.mjs): load states, fallback, errors + retry, selection by pick and by the list, hide / show,
// review marks, authored controls, renderer disposal and a FRESH canvas per renderer (StrictMode / parking never reuse a lost context).
const SHA = "c".repeat(64);
const report = inspectGlbAsset(writeGlb(testAssemblyModel()));
if (!report.ok) throw new Error("fixture");
const DOC: MeshDocument = report.document;
const LIB: MeshLibraryAsset[] = [{
  id: "test-assembly", version: 1, sha256: SHA, byteLength: 1000, title: "t", subject: "engineering", parts: DOC.parts.map(p => ({ id: p.id, label: p.id })),
  provenance: { source: "مصدر الاختبار", sourceUrl: "https://example.invalid", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "ExamBank", modifications: "تحويل", educationalLimitations: "نموذج هندسي", retrieved: "2026-10-10" }
}];
const MODEL: MeshModelSpecV1 = {
  version: 1, id: "m1", title: "نموذج اختبار", description: "وصف", asset: { source: "library", id: "test-assembly", version: 1, sha256: SHA },
  parts: [{ id: "frontBlock", label: "الكتلة الأمامية" }, { id: "ball", label: "الكرة", description: "كرة خضراء" }, { id: "rod", label: "الأسطوانة" }],
  controls: { rotate: true, zoom: true, hideParts: true }
};
const okLoader = vi.fn(async (): Promise<MeshLoadResult> => ({ ok: true, value: { sha256: SHA, document: DOC, summary: report.summary } }));
function fakeRenderer(pickResult: { id: string | null }) {
  const made: { canvas: HTMLCanvasElement; renderer: MeshRenderer & { states: MeshRenderState[]; disposed: boolean } }[] = [];
  const create = vi.fn((canvas: HTMLCanvasElement) => {
    const r = {
      states: [] as MeshRenderState[], disposed: false,
      resize: vi.fn(), render(s: MeshRenderState) { r.states.push(s); },
      pick: vi.fn(() => pickResult.id), probe: vi.fn(() => null),
      stats: () => ({ drawCalls: 5, triangles: 1188, gpuBytes: 50000, textures: 1, frames: r.states.length, samples: 4, dpr: 1, width: 640, height: 400, contextLost: false }),
      texturesReady: Promise.resolve(), dispose() { r.disposed = true; }
    };
    made.push({ canvas, renderer: r });
    return r;
  });
  return { create, made };
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const fig = () => document.querySelector("figure.mm3d") as HTMLElement;

describe("21D-B.1 MeshModel3DView", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; okLoader.mockClear(); });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });

  it("loads (progress), renders with the WebGL renderer, lists the labelled parts and shows the asset's provenance", async () => {
    let finish: (r: MeshLoadResult) => void = () => {};
    const loader = vi.fn((_m: MeshModelSpecV1, o: { onProgress?: (l: number, t: number | null) => void }) => new Promise<MeshLoadResult>(res => { o.onProgress?.(30, 100); finish = res; }));
    const r = fakeRenderer({ id: null });
    render(<MeshModel3DView model={MODEL} library={LIB} loader={loader} createRenderer={r.create} />);
    await flush();
    expect(fig().dataset.state).toBe("loading");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("30");
    await act(async () => { finish(await okLoader()); });
    await flush();
    expect(fig().dataset.state).toBe("ready");
    expect(r.made.length).toBe(1);
    expect(r.made[0].renderer.states.length).toBeGreaterThan(0);
    expect([...document.querySelectorAll(".mm3d-parts li")].map(li => li.getAttribute("data-part"))).toEqual(["frontBlock", "ball", "rod"]);
    expect(document.querySelector(".mm3d-provenance")?.textContent).toContain("CC BY 4.0");
    expect(document.querySelector(".mm3d-scene")?.getAttribute("aria-label")).toContain("الكتلة الأمامية");
  });
  it("WebGL 2 unavailable → a meaningful fallback, and the parts list still answers", async () => {
    const onChange = vi.fn();
    render(<MeshModel3DView model={MODEL} library={LIB} loader={okLoader} createRenderer={() => null} selection={{ selected: [], max: 1, onChange }} />);
    await flush();
    expect(fig().dataset.state).toBe("fallback");
    expect(screen.getByRole("note").textContent).toContain("WebGL");
    fireEvent.click(screen.getByLabelText("اختيار الكرة"));
    expect(onChange).toHaveBeenCalledWith(["ball"]);
  });
  it("load failures are explained; network errors offer a retry; an invalid model asks for teacher review", async () => {
    const failing = vi.fn(async (): Promise<MeshLoadResult> => ({ ok: false, error: { code: "MESH_LOAD_NETWORK", message: "تعذر تحميل النموذج ثلاثي الأبعاد." } }));
    render(<MeshModel3DView model={MODEL} library={LIB} loader={failing} createRenderer={() => null} />);
    await flush();
    expect(fig().dataset.state).toBe("error");
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل");
    fireEvent.click(screen.getByText("إعادة المحاولة"));
    await flush();
    expect(failing).toHaveBeenCalledTimes(2);
    cleanup();
    const integrity = vi.fn(async (): Promise<MeshLoadResult> => ({ ok: false, error: { code: "MESH_LOAD_INTEGRITY", message: "بصمة ملف النموذج لا تطابق النسخة المعتمدة." } }));
    render(<MeshModel3DView model={MODEL} library={LIB} loader={integrity} />);
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("بصمة");
    expect(screen.queryByText("إعادة المحاولة")).toBeNull();
    cleanup();
    render(<MeshModel3DView model={{ ...MODEL, parts: [] }} library={LIB} loader={okLoader} />);
    expect(screen.getByRole("alert").textContent).toContain("مراجعة المعلم");
    expect(okLoader).not.toHaveBeenCalled();
  });
  it("selects the picked part (front-most under the pointer), toggles it off, and respects the maximum; the list mirrors it", async () => {
    const pick = { id: "frontBlock" as string | null }, r = fakeRenderer(pick);
    function Host({ max }: { max: number }) {
      const [selected, setSelected] = useState<string[]>([]);
      const selection: MeshModelSelection = { selected, max, onChange: setSelected };
      return <><MeshModel3DView model={MODEL} library={LIB} loader={okLoader} createRenderer={r.create} selection={selection} /><output data-testid="out">{selected.join(",")}</output></>;
    }
    render(<Host max={2} />);
    await flush();
    const surface = document.querySelector(".mm3d-scene") as HTMLElement;
    fireEvent.click(surface, { clientX: 10, clientY: 10 });
    expect(screen.getByTestId("out").textContent).toBe("frontBlock");
    expect(r.made[0].renderer.pick).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("اختيار الكرة"));
    expect(screen.getByTestId("out").textContent).toBe("frontBlock,ball");
    expect((screen.getByLabelText("اختيار الأسطوانة") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(surface, { clientX: 10, clientY: 10 });
    expect(screen.getByTestId("out").textContent).toBe("ball");
    pick.id = null;
    fireEvent.click(surface, { clientX: 10, clientY: 10 });
    expect(screen.getByTestId("out").textContent).toBe("ball");
    await flush();
    expect(r.made[0].renderer.states.at(-1)?.selected.has("ball")).toBe(true);
    expect(document.querySelector(".mm3d-status")?.textContent).toContain("اخترت 1 من 2: الكرة");
  });
  it("hide / show is presentation state passed to the renderer; review marks are text too; authored controls are honoured", async () => {
    const r = fakeRenderer({ id: null });
    render(<MeshModel3DView model={MODEL} library={LIB} loader={okLoader} createRenderer={r.create} marks={{ frontBlock: "correct", ball: "incorrect", rod: "missed", basePlate: "correct" }} />);
    await flush();
    fireEvent.click(document.querySelector("li[data-part=ball] .mm3d-hide") as HTMLElement);
    await flush();
    expect(fig().dataset.hidden).toBe("ball");
    expect(r.made[0].renderer.states.at(-1)?.hidden.has("ball")).toBe(true);
    fireEvent.click(screen.getByText("إظهار كل الأجزاء"));
    expect(fig().dataset.hidden).toBe("");
    expect([...document.querySelectorAll(".mm3d-mark")].map(e => e.textContent)).toEqual(["اختيار صحيح", "اختيار غير صحيح", "جزء صحيح لم يُختر"]);
    expect([...(r.made[0].renderer.states.at(-1)?.marks?.keys() ?? [])]).toEqual(["frontBlock", "ball", "rod"]);       // unlabelled ids ignored
    cleanup();
    render(<MeshModel3DView model={{ ...MODEL, controls: { rotate: false, zoom: false, hideParts: false } }} library={LIB} loader={okLoader} createRenderer={fakeRenderer({ id: null }).create} />);
    await flush();
    expect(screen.queryByLabelText("تدوير لليمين")).toBeNull();
    expect(screen.queryByLabelText("تكبير")).toBeNull();
    expect(document.querySelector(".mm3d-hide")).toBeNull();
    expect(screen.getByText("إعادة العرض")).toBeTruthy();
  });
  it("buttons and keys move the shared orbit camera; Home resets to the authored view", async () => {
    render(<MeshModel3DView model={{ ...MODEL, camera: { azimuth: 0.4, elevation: 0.1, zoom: 1.2 } }} library={LIB} loader={okLoader} createRenderer={fakeRenderer({ id: null }).create} />);
    await flush();
    const surface = document.querySelector(".mm3d-scene") as HTMLElement;
    expect([surface.dataset.yaw, surface.dataset.zoom]).toEqual(["0.4", "1.2"]);
    fireEvent.click(screen.getByLabelText("تدوير لليمين"));
    fireEvent.click(screen.getByLabelText("تكبير"));
    await flush();
    expect(Number(surface.dataset.yaw)).toBeCloseTo(0.65, 3);
    expect(Number(surface.dataset.zoom)).toBeCloseTo(1.38, 3);
    fireEvent.keyDown(surface, { key: "Home" });
    await flush();
    expect([surface.dataset.yaw, surface.dataset.zoom]).toEqual(["0.4", "1.2"]);
  });
  it("every renderer gets a FRESH canvas and is disposed on unmount (StrictMode remount included)", async () => {
    const r = fakeRenderer({ id: null });
    const { unmount } = render(<StrictMode><MeshModel3DView model={MODEL} library={LIB} loader={okLoader} createRenderer={r.create} /></StrictMode>);
    await flush();
    const canvases = r.made.map(m => m.canvas);
    expect(new Set(canvases).size).toBe(canvases.length);
    expect(r.made.slice(0, -1).every(m => m.renderer.disposed && !m.canvas.isConnected)).toBe(true);
    expect(r.made.at(-1)!.canvas.isConnected).toBe(true);
    unmount();
    expect(r.made.every(m => m.renderer.disposed)).toBe(true);
    expect(canvases.every(c => !c.isConnected)).toBe(true);
  });
});
