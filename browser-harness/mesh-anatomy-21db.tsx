// Phase 21D-B.2 — real-browser harness of the anatomical library models and the authoring editor (certification only; never shipped).
// The heart and the brain are the SHIPPED library files (served by the check script from public/mesh-assets at their content address);
// the editor's upload path uses a fake App service whose "server" accepts the engineering test assembly generated in the page.
// Query: ?only=<id> renders one section.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MeshModel3DView from "../src/meshModels/MeshModel3DView";
import MeshModelEditor from "../src/meshModels/MeshModelEditor";
import { MESH_LIBRARY } from "../src/meshModels/meshAssetCatalog";
import { sha256Hex } from "../src/meshModels/meshAssetLoader";
import type { MeshAssetService } from "../src/meshModels/meshAssetService";
import { draftFromLibrary, type MeshUploadedAsset } from "../src/meshModels/meshModelDraft";
import type { MeshModelSpecV1 } from "../src/meshModels/meshModelSpec";
import { meshRendererLiveCount, type MeshRenderer } from "../src/meshModels/meshRenderer";
import { testAssemblyModel, writeGlb } from "../src/meshModels/glbWriter";
import { inspectGlbAsset } from "../src/meshModels/glbAsset";

const params = new URLSearchParams(location.search);
const renderers: Record<string, MeshRenderer | null> = {};
declare global { interface Window { __mesh: Record<string, unknown> } }
window.__mesh = { renderers, liveCount: () => meshRendererLiveCount() };
const HEART = MESH_LIBRARY.find(a => a.id === "human-heart-bp3d")!, BRAIN = MESH_LIBRARY.find(a => a.id === "human-brain-bp3d")!;

export function Harness() {
  const [heartSel, setHeartSel] = useState<string[]>([]);
  const [draft, setDraft] = useState<MeshModelSpecV1 | null>(null);
  const [service, setService] = useState<MeshAssetService | null>(null);
  useEffect(() => {
    void (async () => {
      const bytes = writeGlb(testAssemblyModel()), sha = await sha256Hex(bytes), report = inspectGlbAsset(bytes);
      if (!report.ok) throw new Error("fixture");
      const asset: MeshUploadedAsset = { sha256: sha, byteLength: bytes.length, triangles: report.summary.triangles, vertices: report.summary.vertices, materials: report.summary.materials, textures: report.summary.textures, parts: report.summary.parts.map(p => ({ id: p.id, triangles: p.triangles })), name: "assembly.glb", uploadedAt: "2026-10-10T10:00:00Z" };
      const uploads: MeshUploadedAsset[] = [];
      setService({
        list: async () => uploads.slice(),
        upload: async (file, onProgress) => {
          onProgress?.(0.5);
          const got = new Uint8Array(await file.arrayBuffer());
          if ((await sha256Hex(got)) !== sha) return { status: "rejected", issues: [{ code: "MESH_ASSET_HEADER", path: "", message: "ليس ملف GLB صالحًا." }] };
          onProgress?.(1);
          uploads.unshift(asset);
          return { status: "created", asset };
        }
      });
      window.__mesh.assemblySha = sha;
    })();
  }, []);
  useEffect(() => { window.__mesh.draft = () => draft; window.__mesh.heartSelected = () => heartSel; }, [draft, heartSel]);
  if (!service) return <p>…</p>;
  const only = params.get("only");
  const heart = draftFromLibrary(HEART, "heartModel"), brain = draftFromLibrary(BRAIN, "brainModel");
  const show = (id: string) => !only || only === id;
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 20 }}>21D-B.2 — anatomical mesh models and authoring</h1>
      <output data-testid="heart-selected">{heartSel.join(",")}</output>
      {show("heart") && <section data-testid="sec-heart"><MeshModel3DView model={heart} selection={{ selected: heartSel, max: 3, onChange: setHeartSel }} onRenderer={r => { renderers.heart = r; }} /></section>}
      {show("brain") && <section data-testid="sec-brain"><MeshModel3DView model={brain} onRenderer={r => { renderers.brain = r; }} /></section>}
      {show("editor") && <section data-testid="sec-editor"><MeshModelEditor value={draft} onChange={setDraft} modelId="authoredModel" service={service} /></section>}
      {show("heart2") && <section data-testid="sec-heart2"><MeshModel3DView model={{ ...heart, id: "heartAgain", controls: { rotate: true, zoom: false, hideParts: false } }} onRenderer={r => { renderers.heart2 = r; }} /></section>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
