// Phase 21D-B.1 — real-browser harness of the WebGL mesh viewer (certification only; never shipped). The ENGINEERING test assembly is
// generated in the page with the same deterministic writer the check script uses to serve the bytes, so the pinned SHA-256 matches.
// Query: ?nowebgl=1 makes WebGL 2 unavailable (fallback path); ?only=<id> renders one section.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MeshModel3DView from "../src/meshModels/MeshModel3DView";
import { sha256Hex } from "../src/meshModels/meshAssetLoader";
import { meshRendererLiveCount, type MeshRenderer } from "../src/meshModels/meshRenderer";
import { testAssemblyModel, writeGlb } from "../src/meshModels/glbWriter";
import type { MeshLibraryAsset } from "../src/meshModels/meshAssetCatalog";
import type { MeshModelSpecV1 } from "../src/meshModels/meshModelSpec";

const params = new URLSearchParams(location.search);
if (params.get("nowebgl")) {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    return type === "webgl2" || type === "webgl" ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;
}
const renderers: Record<string, MeshRenderer | null> = {};
declare global { interface Window { __mesh: Record<string, unknown> } }
window.__mesh = { renderers, liveCount: () => meshRendererLiveCount() };

const PARTS = [
  { id: "frontBlock", label: "الكتلة الأمامية", description: "مكعب أحمر أمام اللوح الخلفي." },
  { id: "backPlate", label: "اللوح الخلفي" },
  { id: "ball", label: "الكرة" },
  { id: "rod", label: "الأسطوانة" },
  { id: "basePlate", label: "القاعدة المنقوشة" }
];
const base = (id: string, asset: MeshModelSpecV1["asset"], extra: Partial<MeshModelSpecV1> = {}): MeshModelSpecV1 => ({
  version: 1, id, title: "نموذج اختبار هندسي متعدد الأجزاء", description: "نموذج هندسي للاختبار فقط (ليس نموذجًا تعليميًا).", asset, parts: PARTS,
  controls: { rotate: true, zoom: true, hideParts: true }, camera: { azimuth: 0, elevation: 0.2, zoom: 1 }, ...extra
});

export function Harness() {
  const [ready, setReady] = useState<{ library: MeshLibraryAsset[]; sha: string; alt: string; bytes: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    void (async () => {
      const bytes = writeGlb(testAssemblyModel()), sha = await sha256Hex(bytes);
      const alt = await sha256Hex(writeGlb({ ...testAssemblyModel(), generator: "ExamBank test assembly (substituted)" }));
      const entry = (id: string, h: string): MeshLibraryAsset => ({ id, version: 1, sha256: h, byteLength: bytes.length, title: "test", subject: "engineering", parts: PARTS.map(p => ({ id: p.id, label: p.label })), provenance: { source: "ExamBank (generated)", sourceUrl: "https://example.invalid/", license: "test only", licenseUrl: "https://example.invalid/license", attribution: "ExamBank", modifications: "none", educationalLimitations: "engineering fixture, not educational content", retrieved: "2026-10-10" } });
      setReady({ library: [entry("test-assembly", sha), entry("test-substituted", alt)], sha, alt, bytes: bytes.length });
    })();
  }, []);
  useEffect(() => { window.__mesh.toggleMounted = () => setMounted(m => !m); window.__mesh.selected = () => selected; }, [selected]);
  if (!ready) return <p>…</p>;
  const only = params.get("only");
  const lib = (id: string, sha: string) => ({ source: "library" as const, id, version: 1, sha256: sha });
  const sections: [string, MeshModelSpecV1, Partial<Parameters<typeof MeshModel3DView>[0]>][] = [
    ["view", base("viewModel", lib("test-assembly", ready.sha)), {}],
    ["select", base("selectModel", lib("test-assembly", ready.sha), { title: "اختر جزأين من النموذج" }), { selection: { selected, max: 2, onChange: setSelected } }],
    ["upload", base("uploadModel", { source: "upload", sha256: ready.sha, byteLength: ready.bytes }, { controls: { rotate: true, zoom: false, hideParts: false } }), {}],
    ["review", base("reviewModel", lib("test-assembly", ready.sha)), { marks: { frontBlock: "correct", ball: "incorrect", rod: "missed" } }],
    ["integrity", base("integrityModel", lib("test-substituted", ready.alt)), {}],
    ["parts", base("partsModel", { source: "upload", sha256: ready.sha, byteLength: ready.bytes }, { parts: [...PARTS, { id: "notThere", label: "جزء غير موجود" }] }), {}]
  ];
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 12 }}>
      <h1 style={{ fontSize: 20 }}>21D-B — WebGL mesh viewer harness</h1>
      <button type="button" data-testid="toggle-mount" onClick={() => setMounted(m => !m)}>mount / unmount</button>
      <output data-testid="selected">{selected.join(",")}</output>
      {sections.filter(([id]) => !only || only === id).map(([id, model, extra]) => (
        <section key={id} data-testid={"sec-" + id}>
          {(mounted || id !== "view") && <MeshModel3DView model={model} library={ready.library} {...extra} onRenderer={r => { renderers[id] = r; }} />}
        </section>
      ))}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
