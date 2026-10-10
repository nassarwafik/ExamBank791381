// Phase 21D-B.2 — the authenticated client behind MeshAssetService (loaded on demand by App, never by the Builder). The JSON list goes
// through App's request helper; the raw .glb upload uses XMLHttpRequest for progress with the SAME auth headers App uses. The token never
// leaves this closure and never reaches exam state, localStorage or the viewer.
import type { MeshAssetIssue } from "./glbAsset";
import type { MeshUploadedAsset } from "./meshModelDraft";
import type { MeshAssetService, MeshUploadResult } from "./meshAssetService";

export type MeshAssetClientDeps = {
  requestJson: <T>(url: string) => Promise<T>;
  authHeaders: () => Record<string, string>;
  uploadUrl?: string;
};
const HEX64 = /^[0-9a-f]{64}$/;
/** Only well-formed records reach the editor (the server is trusted, but a malformed row must never become a model reference). */
const asAsset = (v: unknown): MeshUploadedAsset | null => {
  const r = v as Partial<MeshUploadedAsset> | null;
  if (!r || typeof r !== "object" || typeof r.sha256 !== "string" || !HEX64.test(r.sha256) || !Number.isInteger(r.byteLength) || !Array.isArray(r.parts)) return null;
  return {
    sha256: r.sha256, byteLength: r.byteLength as number, triangles: Number(r.triangles) || 0, vertices: Number(r.vertices) || 0, materials: Number(r.materials) || 0, textures: Number(r.textures) || 0,
    parts: r.parts.filter(p => p && typeof p.id === "string").map(p => ({ id: p.id, triangles: Number(p.triangles) || 0 })),
    ...(typeof r.name === "string" ? { name: r.name } : {}), ...(typeof r.uploadedAt === "string" ? { uploadedAt: r.uploadedAt } : {})
  };
};

export function createMeshAssetService(deps: MeshAssetClientDeps): MeshAssetService {
  const uploadUrl = deps.uploadUrl || "/api/mesh-assets/upload";
  return {
    list: () => deps.requestJson<{ assets?: unknown[] }>("/api/mesh-assets").then(r => (r.assets || []).map(asAsset).filter((a): a is MeshUploadedAsset => !!a)),
    upload: (file, onProgress) => new Promise<MeshUploadResult>(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl, true);
      for (const [k, v] of Object.entries(deps.authHeaders())) xhr.setRequestHeader(k, v);
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      if (xhr.upload && onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total)); };
      xhr.onerror = () => resolve({ status: "error", message: "تعذّر الاتصال بالخادم أثناء رفع النموذج." });
      xhr.onload = () => {
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>; } catch { body = {}; }
        const asset = asAsset(body.asset);
        if ((xhr.status === 201 || xhr.status === 200) && asset) { resolve({ status: body.status === "exists" ? "exists" : "created", asset }); return; }
        if (xhr.status === 400 && Array.isArray(body.issues)) { resolve({ status: "rejected", issues: (body.issues as MeshAssetIssue[]).slice(0, 20) }); return; }
        resolve({ status: "error", message: typeof body.error === "string" ? body.error : xhr.status === 401 ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : xhr.status === 413 ? "حجم النموذج يتجاوز الحد المسموح." : "تعذّر رفع النموذج (" + xhr.status + ")." });
      };
      xhr.send(file);
    })
  };
}
