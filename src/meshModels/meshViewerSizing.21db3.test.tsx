// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeshModel3DView from "./MeshModel3DView";
import { inspectGlbAsset } from "./glbAsset";
import { testAssemblyModel, writeGlb } from "./glbWriter";
import type { MeshLibraryAsset } from "./meshAssetCatalog";
import type { MeshLoadResult } from "./meshAssetLoader";
import type { MeshModelSpecV1 } from "./meshModelSpec";
import type { MeshRendererHooks, MeshRenderState } from "./meshRenderer";

// Phase 21D-B.3 final certification — found by the exam certification on CI (low-memory phone: the scene published dpr 1 while the canvas
// was already 2×). The real renderer signals "textures ready" asynchronously (a microtask when the model has no images, later when it
// has), and that path drew a frame and published its stats WITHOUT sizing the drawing buffer first: the first frame was drawn at the
// default canvas size and its stats (dpr, buffer size) did not describe the canvas. Every frame must be drawn after a resize.
const SHA = "c".repeat(64);
const report = inspectGlbAsset(writeGlb(testAssemblyModel()));
if (!report.ok) throw new Error("fixture");
const LIB: MeshLibraryAsset[] = [{
  id: "test-assembly", version: 1, sha256: SHA, byteLength: 1000, title: "t", subject: "engineering", camera: { azimuth: 0, elevation: 0.2, zoom: 1 }, parts: report.document.parts.map(p => ({ id: p.id, label: p.id })),
  provenance: { source: "مصدر الاختبار", sourceUrl: "https://example.invalid", sourceLicense: "CC BY 4.0", sourceLicenseUrl: "https://creativecommons.org/licenses/by/4.0/", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "test", retrieved: "2026-10-10", modifications: "none", educationalLimitations: "none" }
}] as unknown as MeshLibraryAsset[];
const MODEL: MeshModelSpecV1 = {
  version: 1, id: "m1", title: "نموذج اختبار", description: "وصف", asset: { source: "library", id: "test-assembly", version: 1, sha256: SHA },
  parts: [{ id: "frontBlock", label: "الكتلة الأمامية" }, { id: "ball", label: "الكرة" }], controls: { rotate: true, zoom: true, hideParts: true }
};
const loader = vi.fn(async (): Promise<MeshLoadResult> => ({ ok: true, value: { sha256: SHA, document: report.document, summary: report.summary } }));
/** A renderer double that records resize / render order and keeps its hooks, so the test decides WHEN "textures ready" fires (the real
 *  renderer fires it after an asynchronous image decode — at any time relative to React's state frames). */
function hookedRenderer() {
  const calls: string[] = [];
  let dpr = 1, hooks: MeshRendererHooks | undefined;
  const create = vi.fn((_canvas: HTMLCanvasElement, _doc: unknown, h?: MeshRendererHooks) => {
    hooks = h;
    return {
      resize: vi.fn((_w: number, _h: number, ratio: number) => { calls.push("resize"); dpr = Math.min(2, Math.max(1, ratio)); }),
      render: vi.fn((_s: MeshRenderState) => { calls.push("render"); }),
      pick: vi.fn(() => null), pickMany: vi.fn(() => []), probe: vi.fn(() => null),
      stats: () => ({ drawCalls: 2, triangles: 10, gpuBytes: 1000, textures: 0, frames: calls.filter(c => c === "render").length, samples: 4, dpr, width: 0, height: 0, contextLost: false }),
      texturesReady: Promise.resolve(), dispose: vi.fn()
    };
  });
  return { create, calls, texturesReady: () => hooks?.onTexturesReady?.() };
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };

describe("21D-B.3 MeshModel3DView — every frame is drawn at the current size", () => {
  let io: unknown, ratio: PropertyDescriptor | undefined;
  beforeEach(() => {
    io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    ratio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 3 });
  });
  afterEach(() => {
    cleanup();
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io;
    if (ratio) Object.defineProperty(window, "devicePixelRatio", ratio); else delete (window as { devicePixelRatio?: number }).devicePixelRatio;
  });

  it("the asynchronous textures-ready frame is sized first: it is never drawn, nor its stats published, at a stale buffer size", async () => {
    let dpr = 3;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => dpr });
    const r = hookedRenderer();
    render(<MeshModel3DView model={MODEL} library={LIB} loader={loader} createRenderer={r.create as never} />);
    await flush();
    const scene = () => (document.querySelector(".mm3d-scene") as HTMLElement).dataset.dpr;
    expect([r.create.mock.calls.length, scene()]).toEqual([1, "2"]);          // DPR 3 capped at 2
    // the page moves to a 1× display, then the texture upload completes (before React draws its next state frame)
    dpr = 1;
    r.calls.length = 0;
    await act(async () => { r.texturesReady(); });
    expect(r.calls).toEqual(["resize", "render"]);
    expect(scene()).toBe("1");
  });
});
