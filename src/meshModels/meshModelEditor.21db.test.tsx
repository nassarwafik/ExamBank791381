// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeshModelEditor from "./MeshModelEditor";
import { inspectGlbAsset, type MeshDocument } from "./glbAsset";
import { MESH_LIBRARY } from "./meshAssetCatalog";
import type { MeshLoadResult } from "./meshAssetLoader";
import type { MeshAssetService, MeshUploadResult } from "./meshAssetService";
import { cameraFromView, draftFromLibrary, draftFromUpload, sourcePartsOfLibrary, withPartIncluded, withPartText, type MeshUploadedAsset } from "./meshModelDraft";
import { validateMeshModelSpec, type MeshModelSpecV1 } from "./meshModelSpec";
import type { MeshRenderer } from "./meshRenderer";

// Phase 21D-B.2 — teacher authoring of a realistic mesh model: drafts are built from the asset (never free-form part ids), the live
// validator explains every problem, the preview is the student viewer (and survives invalid keystrokes), replacing labelled work is
// confirmed, uploads go through the App-owned service (server-validated, content-addressed), and the starting view is captured from the
// preview. The real heart / brain files are parsed so the preview's labelled-part check runs against the shipped bytes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HEART = MESH_LIBRARY[0], BRAIN = MESH_LIBRARY[1];
const docs = new Map<string, MeshDocument>();
for (const a of MESH_LIBRARY) {
  const r = inspectGlbAsset(new Uint8Array(fs.readFileSync(path.join(root, "public/mesh-assets", a.sha256 + ".glb"))));
  if (!r.ok) throw new Error("asset");
  docs.set(a.sha256, r.document);
}
const UPLOAD: MeshUploadedAsset = { sha256: "f".repeat(64), byteLength: 4096, triangles: 1188, vertices: 900, materials: 2, textures: 0, parts: [{ id: "gear", triangles: 600 }, { id: "shaft", triangles: 588 }], name: "gearbox.glb", uploadedAt: "2026-10-10T10:00:00Z" };
const loader = vi.fn(async (m: MeshModelSpecV1): Promise<MeshLoadResult> => {
  const document = docs.get(m.asset.sha256) ?? docs.get(HEART.sha256)!;
  return { ok: true, value: { sha256: m.asset.sha256, document: m.asset.source === "upload" ? { ...document, parts: document.parts.slice(0, 2).map((p, i) => ({ ...p, id: UPLOAD.parts[i].id })) } : document, summary: null as never } };
});
const createRenderer = vi.fn((): MeshRenderer => ({ resize() {}, render() {}, pick: () => null, pickMany: () => [], probe: () => null, texturesReady: Promise.resolve(), dispose() {},
  stats: () => ({ drawCalls: 14, triangles: 99207, gpuBytes: 1, textures: 0, frames: 1, samples: 4, dpr: 1, width: 640, height: 400, contextLost: false }) }));
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };

function Host({ initial = null, service, disabled, onSpy }: { initial?: MeshModelSpecV1 | null; service?: MeshAssetService; disabled?: boolean; onSpy?: (m: MeshModelSpecV1) => void }) {
  const [value, setValue] = useState<MeshModelSpecV1 | null>(initial);
  return <><MeshModelEditor value={value} onChange={m => { onSpy?.(m); setValue(m); }} modelId="q1-model" service={service} disabled={disabled} loader={loader} createRenderer={createRenderer} />
    <output data-testid="json">{value ? JSON.stringify(value) : ""}</output></>;
}
const current = (): MeshModelSpecV1 => JSON.parse(screen.getByTestId("json").textContent || "null");
const card = (assetId: string) => document.querySelector(`.mm3d-lib li[data-asset="${assetId}"]`) as HTMLElement;

describe("21D-B.2 mesh model drafts — always built from the asset", () => {
  it("a library draft carries the reviewed parts, labels, descriptions and default view, and passes the exam contract", () => {
    const d = draftFromLibrary(HEART, "m1");
    expect(d.asset).toEqual({ source: "library", id: "human-heart-bp3d", version: 1, sha256: HEART.sha256 });
    expect(d.parts.map(p => p.id)).toEqual(HEART.parts.map(p => p.id));
    expect(d.camera).toEqual({ azimuth: 0, elevation: 0.2, zoom: 1.2 });
    expect(validateMeshModelSpec(d).ok).toBe(true);
    expect(validateMeshModelSpec(draftFromLibrary(BRAIN, "m2")).ok).toBe(true);
  });
  it("an upload draft uses the server's part names (bounded) and the file name; include / exclude keeps the asset's order", () => {
    const u = draftFromUpload(UPLOAD, "m1");
    expect([u.title, u.asset, u.parts]).toEqual(["gearbox", { source: "upload", sha256: UPLOAD.sha256, byteLength: 4096 }, [{ id: "gear", label: "gear" }, { id: "shaft", label: "shaft" }]]);
    expect(draftFromUpload({ ...UPLOAD, parts: Array.from({ length: 80 }, (_, i) => ({ id: "p" + i, triangles: 1 })) }, "m").parts).toHaveLength(64);
    const src = sourcePartsOfLibrary(HEART);
    let d = withPartIncluded(draftFromLibrary(HEART, "m"), src, "aorta", false);
    d = withPartText(d, "leftAtrium", { label: "الأذين الأيسر (مُعدّل)" });
    expect(d.parts.map(p => p.id)).not.toContain("aorta");
    d = withPartIncluded(d, src, "aorta", true);
    expect(d.parts.map(p => p.id)).toEqual(HEART.parts.map(p => p.id));                   // back in the asset's order, default label restored
    expect(d.parts.find(p => p.id === "aorta")?.label).toBe("الأبهر (الشريان الأورطي)");
    expect(d.parts.find(p => p.id === "leftAtrium")?.label).toBe("الأذين الأيسر (مُعدّل)");
    expect(withPartIncluded(d, src, "liver", true)).toBe(d);                              // a part the file does not have cannot be added
  });
  it("a captured view is wrapped, clamped and rounded into the contract's ranges", () => {
    expect(cameraFromView({ azimuth: 4, elevation: 2, zoom: 9 })).toEqual({ azimuth: -2.283, elevation: 1.45, zoom: 3 });
    expect(cameraFromView({ azimuth: Number.NaN, elevation: -0.1234567, zoom: 0.1 })).toEqual({ azimuth: 0, elevation: -0.123, zoom: 0.6 });
  });
});

describe("21D-B.2 MeshModelEditor", () => {
  let io: unknown;
  beforeEach(() => { io = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined; loader.mockClear(); });
  afterEach(() => { cleanup(); (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = io; });

  it("lists the reviewed library with provenance; choosing the heart creates a labelled draft and a live student preview", async () => {
    render(<Host />);
    expect(card("human-heart-bp3d").textContent).toContain("CC BY-SA 4.0");
    expect(card("human-brain-bp3d").textContent).toContain("BodyParts3D");
    expect(screen.queryByRole("tab", { name: "نماذجي المرفوعة" })).toBeNull();               // no service → no upload actions
    fireEvent.click(within(card("human-heart-bp3d")).getByRole("button"));
    await flush();
    expect(current().asset).toMatchObject({ source: "library", id: "human-heart-bp3d" });
    expect(current().id).toBe("q1-model");
    expect(document.querySelectorAll(".mm3d-part-rows li")).toHaveLength(14);
    const preview = screen.getByTestId("mesh-editor-preview");
    expect((preview.querySelector("figure.mm3d") as HTMLElement).dataset.state).toBe("ready");
    expect(preview.querySelector(".mm3d-parts")?.textContent).toContain("الصمام التاجي");
  });

  it("labels and descriptions edit live; an invalid label is explained while the preview keeps the last valid model", async () => {
    render(<Host initial={draftFromLibrary(HEART, "m")} />);
    await flush();
    const label = screen.getByLabelText("تسمية الجزء aorta") as HTMLInputElement;
    fireEvent.change(label, { target: { value: "الأبهر" } });
    expect(current().parts.find(p => p.id === "aorta")?.label).toBe("الأبهر");
    fireEvent.change(label, { target: { value: "   " } });
    expect(within(screen.getByTestId("mesh-editor-issues")).getByText(/النص فارغ/)).toBeTruthy();
    const preview = screen.getByTestId("mesh-editor-preview");
    expect(preview.querySelector(".mm3d-parts")?.textContent).toContain("الأبهر");
    expect(createRenderer).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("وصف الجزء aorta"), { target: { value: "" } });
    expect(current().parts.find(p => p.id === "aorta")?.description).toBeUndefined();
    fireEvent.change(label, { target: { value: "<img src=x onerror=alert(1)>" } });
    expect(screen.getByTestId("mesh-editor-issues").textContent).toContain("علامات غير مسموحة");
  });

  it("parts can be left unlabelled (never the last one); controls and the starting view are authored", async () => {
    render(<Host initial={{ ...draftFromLibrary(HEART, "m"), parts: draftFromLibrary(HEART, "m").parts.slice(0, 2) }} />);
    await flush();
    fireEvent.click(screen.getByLabelText("تضمين الجزء rightAtrium"));
    expect(current().parts.map(p => p.id)).toEqual(["leftAtrium"]);
    expect((screen.getByLabelText("تضمين الجزء leftAtrium") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("إخفاء الأجزاء وإظهارها"));
    expect(current().controls).toEqual({ rotate: true, zoom: true, hideParts: false });
    const scene = document.querySelector(".mm3d-scene") as HTMLElement;
    fireEvent.keyDown(scene, { key: "ArrowRight" });
    await flush();
    fireEvent.click(screen.getByText("اعتماد العرض الحالي في المعاينة"));
    expect(current().camera?.azimuth).toBeCloseTo(Number(scene.dataset.yaw), 3);
    expect(current().camera?.azimuth).not.toBe(0);
    fireEvent.click(screen.getByText("العرض الافتراضي للنموذج"));
    expect(current().camera).toEqual(HEART.camera);
  });

  it("replacing a labelled model is confirmed (cancel keeps it); the new asset brings its own parts", async () => {
    render(<Host initial={draftFromLibrary(HEART, "m")} />);
    await flush();
    fireEvent.click(within(card("human-brain-bp3d")).getByRole("button"));
    expect(screen.getByRole("alertdialog").textContent).toContain("يحذف تسميات الأجزاء");
    fireEvent.click(screen.getByText("إلغاء"));
    expect(current().asset).toMatchObject({ id: "human-heart-bp3d" });
    fireEvent.click(within(card("human-brain-bp3d")).getByRole("button"));
    fireEvent.click(screen.getByText("استبدال النموذج"));
    expect(current().asset).toMatchObject({ id: "human-brain-bp3d" });
    expect(current().parts.map(p => p.id)).toEqual(BRAIN.parts.map(p => p.id));
    expect(current().id).toBe("m");                                                         // the model keeps its identity
  });

  it("uploads go through the service: wrong type refused locally, server refusals explained, an accepted file becomes a draft", async () => {
    let next: MeshUploadResult = { status: "rejected", issues: [{ code: "MESH_ASSET_EXTERNAL_REFERENCE", path: "buffers[0].uri", message: "الملف يشير إلى مورد خارجي." }] };
    const service: MeshAssetService = { list: vi.fn(async () => []), upload: vi.fn(async (_f: File, p?: (f: number) => void) => { p?.(0.5); return next; }) };
    render(<Host service={service} />);
    fireEvent.click(screen.getByRole("tab", { name: "نماذجي المرفوعة" }));
    await flush();
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(screen.getByText("لا توجد نماذج مرفوعة بعد.")).toBeTruthy();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "model.obj")] } }); });
    expect(service.upload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(".glb");
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "bad.glb")] } }); });
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("مورد خارجي");
    next = { status: "created", asset: UPLOAD };
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "gearbox.glb")] } }); });
    await flush();
    expect(current().asset).toEqual({ source: "upload", sha256: UPLOAD.sha256, byteLength: 4096 });
    expect(current().parts.map(p => p.id)).toEqual(["gear", "shaft"]);
    expect(card(UPLOAD.sha256.slice(0, 12)).className).toBe("is-current");
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it("a disabled editor reports nothing", async () => {
    const spy = vi.fn();
    render(<Host initial={draftFromLibrary(HEART, "m")} disabled onSpy={spy} />);
    await flush();
    fireEvent.change(screen.getByLabelText("تسمية الجزء aorta"), { target: { value: "x" } });
    fireEvent.click(within(card("human-brain-bp3d")).getByRole("button"));
    expect(spy).not.toHaveBeenCalled();
  });
});
