// Phase 21D-B.2 — pure authoring helpers for MeshModelSpecV1 (used by the lazy MeshModelEditor; no React, no I/O).
//
// A DRAFT has the exact shape of MeshModelSpecV1 but may be momentarily invalid while the teacher types (an empty label, say); the
// editor shows the validator's issues and the exam pipeline validates again before saving / publishing. Drafts are always built FROM
// the asset — the library entry's reviewed parts and default labels, or the part names the server read from an uploaded file — so a
// teacher can never label a part the file does not contain, and switching asset never carries labels across to a different file.
import type { MeshLibraryAsset } from "./meshAssetCatalog";
import { DEFAULT_MESH_CAMERA, MESH_MODEL_LIMITS, type MeshModelCamera, type MeshModelPartV1, type MeshModelSpecV1 } from "./meshModelSpec";

/** An uploaded asset as the server lists it (record of a validated, content-addressed file; never the bytes). */
export type MeshUploadedAsset = {
  sha256: string; byteLength: number; triangles: number; vertices: number; materials: number; textures: number;
  parts: { id: string; triangles: number }[]; name?: string; uploadedAt?: string;
};
/** The parts an asset offers for labelling, in file order, with their reviewed defaults when the asset is from the library. */
export type MeshSourcePart = { id: string; label: string; description?: string };

export const DEFAULT_MESH_DESCRIPTION = "دوّر النموذج وكبّره، وتفحّص أجزاءه المسمّاة.";
export const DEFAULT_MESH_CONTROLS = Object.freeze({ rotate: true, zoom: true, hideParts: true });

export const sourcePartsOfLibrary = (entry: MeshLibraryAsset): MeshSourcePart[] => entry.parts.map(p => ({ id: p.id, label: p.label, ...(p.description ? { description: p.description } : {}) }));
export const sourcePartsOfUpload = (asset: MeshUploadedAsset): MeshSourcePart[] => asset.parts.map(p => ({ id: p.id, label: p.id }));

export function draftFromLibrary(entry: MeshLibraryAsset, id: string): MeshModelSpecV1 {
  return {
    version: 1, id, title: entry.title, description: DEFAULT_MESH_DESCRIPTION,
    asset: { source: "library", id: entry.id, version: entry.version, sha256: entry.sha256 },
    parts: sourcePartsOfLibrary(entry), controls: { ...DEFAULT_MESH_CONTROLS }, camera: { ...entry.camera }
  };
}

export function draftFromUpload(asset: MeshUploadedAsset, id: string): MeshModelSpecV1 {
  const name = (asset.name ?? "").replace(/\.glb$/i, "").trim();
  return {
    version: 1, id, title: name ? name.slice(0, MESH_MODEL_LIMITS.titleChars) : "نموذج ثلاثي الأبعاد", description: DEFAULT_MESH_DESCRIPTION,
    asset: { source: "upload", sha256: asset.sha256, byteLength: asset.byteLength },
    parts: sourcePartsOfUpload(asset).slice(0, MESH_MODEL_LIMITS.partsMax), controls: { ...DEFAULT_MESH_CONTROLS }, camera: { ...DEFAULT_MESH_CAMERA }
  };
}

/** Include / exclude a part from the labelled vocabulary, keeping the asset's order; a re-included part gets its default label back. */
export function withPartIncluded(draft: MeshModelSpecV1, source: readonly MeshSourcePart[], partId: string, include: boolean): MeshModelSpecV1 {
  const present = new Map(draft.parts.map(p => [p.id, p] as const));
  if (include === present.has(partId) || !source.some(p => p.id === partId)) return draft;
  const parts: MeshModelPartV1[] = [];
  for (const s of source) {
    if (s.id === partId) { if (include) parts.push({ ...s }); continue; }
    const kept = present.get(s.id);
    if (kept) parts.push(kept);
  }
  return { ...draft, parts };
}

export function withPartText(draft: MeshModelSpecV1, partId: string, patch: { label?: string; description?: string }): MeshModelSpecV1 {
  return {
    ...draft,
    parts: draft.parts.map(p => {
      if (p.id !== partId) return p;
      const label = patch.label ?? p.label, description = patch.description ?? p.description;
      return { id: p.id, label, ...(description ? { description } : {}) };
    })
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const wrapPi = (a: number) => { const t = Math.PI * 2; let x = ((a + Math.PI) % t + t) % t - Math.PI; if (x <= -Math.PI) x = Math.PI; return x; };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A live viewer view → a contract-valid authored camera (wrapped, clamped, rounded — stable JSON). */
export function cameraFromView(view: { azimuth: number; elevation: number; zoom: number }): MeshModelCamera {
  const finite = (n: number, d: number) => (Number.isFinite(n) ? n : d);
  return {
    azimuth: round3(clamp(wrapPi(finite(view.azimuth, 0)), -MESH_MODEL_LIMITS.azimuthAbs, MESH_MODEL_LIMITS.azimuthAbs)) || 0,
    elevation: round3(clamp(finite(view.elevation, DEFAULT_MESH_CAMERA.elevation), -MESH_MODEL_LIMITS.pitchAbs, MESH_MODEL_LIMITS.pitchAbs)) || 0,
    zoom: round3(clamp(finite(view.zoom, 1), MESH_MODEL_LIMITS.zoomMin, MESH_MODEL_LIMITS.zoomMax))
  };
}
