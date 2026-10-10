// Phase 21D-B — the code-owned LIBRARY of approved mesh assets (pure; shared server build).
//
// A library asset is a reviewed GLB shipped with the application as an immutable, content-addressed static file
// (`/mesh-assets/<sha256>.glb`). Each entry pins the exact bytes (SHA-256 + length), the named parts the file contains (with default
// Arabic labels), and its PROVENANCE: source, licence, required attribution, the modifications ExamBank made and the educational limits
// of the model. An exam references a library asset by (id, version, sha256) — never by URL — so a published exam always loads exactly the
// reviewed bytes, and a changed file is a NEW version, never a silent replacement.
//
// Phase 21D-B.1 ships the contract and an empty library; the anatomical assets and their provenance records are added in Phase 21D-B.2.

export type MeshLibraryPart = { id: string; label: string; description?: string };
export type MeshAssetProvenance = {
  source: string; sourceUrl: string; license: string; licenseUrl: string; attribution: string;
  modifications: string; educationalLimitations: string; retrieved: string;
};
export type MeshLibraryAsset = {
  id: string; version: number; sha256: string; byteLength: number; title: string; subject: string;
  parts: readonly MeshLibraryPart[]; provenance: MeshAssetProvenance;
};

export const MESH_LIBRARY: readonly MeshLibraryAsset[] = Object.freeze([]);

export const meshLibraryAsset = (library: readonly MeshLibraryAsset[], id: string, version: number): MeshLibraryAsset | undefined =>
  library.find(a => a.id === id && a.version === version);
