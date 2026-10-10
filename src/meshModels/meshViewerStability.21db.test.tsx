// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeshModel3DView from "./MeshModel3DView";
import { inspectGlbAsset } from "./glbAsset";
import { testAssemblyModel, writeGlb } from "./glbWriter";
import type { MeshLibraryAsset } from "./meshAssetCatalog";
import type { MeshLoadResult } from "./meshAssetLoader";
import type { MeshModelSpecV1 } from "./meshModelSpec";
import type { MeshRenderer } from "./meshRenderer";

// Phase 21D-B.2 — defect found while building the authoring editor (fail-first on 1961514): the B.1 viewer keyed the asset load,
// the camera reset and the GL renderer on the WHOLE model JSON, so editing a label or a description in the teacher's live preview
// re-ran the loader, dropped the parsed document for a tick, DISPOSED the WebGL context, created a new one and snapped the camera
// back — on every keystroke. The asset (and the GL context) must depend on the asset reference only, the camera on the asset and the
// authored view only, and a labelled part missing from the file must still fail closed (and recover when the label is removed).
const SHA = "d".repeat(64);
const report = inspectGlbAsset(writeGlb(testAssemblyModel()));
if (!report.ok) throw new Error("fixture");
const LIB: MeshLibraryAsset[] = [{
  id: "test-assembly", version: 1, sha256: SHA, byteLength: 1000, title: "t", subject: "engineering", camera: { azimuth: 0, elevation: 0.2, zoom: 1 },
  parts: report.document.parts.map(p => ({ id: p.id, label: p.id })),
  provenance: { source: "s", sourceUrl: "https://example.invalid", sourceLicense: "l", sourceLicenseUrl: "https://example.invalid/l", license: "l", licenseUrl: "https://example.invalid/l", attribution: "a", modifications: "m", educationalLimitations: "e", retrieved: "2026-10-10" }
}];
const MODEL: MeshModelSpecV1 = {
  version: 1, id: "m1", title: "نموذج", description: "وصف", asset: { source: "library", id: "test-assembly", version: 1, sha256: SHA },
  parts: [{ id: "frontBlock", label: "الكتلة الأمامية" }, { id: "ball", label: "الكرة" }], controls: { rotate: true, zoom: true, hideParts: true },
  camera: { azimuth: 0, elevation: 0.2, zoom: 1 }
};
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };
const scene = () => document.querySelector(".mm3d-scene") as HTMLElement;
function setup() {
  const loader = vi.fn(async (): Promise<MeshLoadResult> => ({ ok: true, value: { sha256: SHA, document: report.ok ? report.document : (null as never), summary: report.ok ? report.summary : (null as never) } }));
  const made: (MeshRenderer & { disposed: boolean })[] = [];
  const createRenderer = vi.fn(() => {
    const r = { disposed: false, resize: vi.fn(), render: vi.fn(), pick: vi.fn(() => null), pickMany: vi.fn(() => []), probe: vi.fn(() => null), texturesReady: Promise.resolve(),
      stats: () => ({ drawCalls: 5, triangles: 1188, gpuBytes: 1, textures: 0, frames: 1, samples: 4, dpr: 1, width: 640, height: 400, contextLost: false }), dispose() { r.disposed = true; } };
    made.push(r);
    return r;
  });
  return { loader, made, createRenderer };
}

describe("21D-B.2 MeshModel3DView — the GL context and the view survive text edits", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });

  it("editing titles, labels and descriptions keeps the loaded asset, the same GL renderer and the student's current view", async () => {
    const { loader, made, createRenderer } = setup();
    const view = render(<MeshModel3DView model={MODEL} library={LIB} loader={loader} createRenderer={createRenderer} />);
    await flush();
    fireEvent.keyDown(scene(), { key: "ArrowLeft" });
    await flush();
    const yaw = scene().dataset.yaw;
    expect(yaw).not.toBe("0");
    view.rerender(<MeshModel3DView model={{ ...MODEL, title: "قلب", parts: [{ id: "frontBlock", label: "البطين" }, { id: "ball", label: "الكرة", description: "وصف جديد" }] }} library={LIB} loader={loader} createRenderer={createRenderer} />);
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(made[0].disposed).toBe(false);
    expect(scene().dataset.yaw).toBe(yaw);
    expect(document.querySelector(".mm3d-parts")?.textContent).toContain("البطين");
    expect(document.querySelector("figcaption strong")?.textContent).toBe("قلب");
  });

  it("a new authored view resets the camera without a new GL context; a new asset reloads", async () => {
    const { loader, createRenderer } = setup();
    const view = render(<MeshModel3DView model={MODEL} library={LIB} loader={loader} createRenderer={createRenderer} />);
    await flush();
    view.rerender(<MeshModel3DView model={{ ...MODEL, camera: { azimuth: 1.2, elevation: 0.3, zoom: 1.5 } }} library={LIB} loader={loader} createRenderer={createRenderer} />);
    await flush();
    expect([scene().dataset.yaw, scene().dataset.pitch, scene().dataset.zoom]).toEqual(["1.2", "0.3", "1.5"]);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    view.rerender(<MeshModel3DView model={{ ...MODEL, asset: { source: "upload", sha256: "e".repeat(64), byteLength: 1000 } }} library={LIB} loader={loader} createRenderer={createRenderer} />);
    await flush();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("a labelled part missing from the file fails closed, and recovers as soon as the label is removed — without reloading the asset", async () => {
    const { loader, createRenderer } = setup();
    const upload = { ...MODEL, asset: { source: "upload" as const, sha256: SHA, byteLength: 1000 } };     // uploads are checked against the file itself
    const view = render(<MeshModel3DView model={{ ...upload, parts: [...MODEL.parts, { id: "liver", label: "الكبد" }] }} library={[]} loader={loader} createRenderer={createRenderer} />);
    await flush();
    expect((document.querySelector("figure.mm3d") as HTMLElement).dataset.state).toBe("error");
    expect(screen.getByRole("alert").textContent).toContain("مراجعة المعلم");
    expect(createRenderer).not.toHaveBeenCalled();                                          // no GL context for a model that cannot be shown
    view.rerender(<MeshModel3DView model={upload} library={[]} loader={loader} createRenderer={createRenderer} />);
    await flush();
    expect((document.querySelector("figure.mm3d") as HTMLElement).dataset.state).toBe("ready");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(createRenderer).toHaveBeenCalledTimes(1);
  });
});
