import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectGlbAsset, MESH_ASSET_LIMITS } from "./glbAsset";
import { MESH_LIBRARY, meshLibraryAsset } from "./meshAssetCatalog";
import { meshAssetUrl, validateMeshModelSpec } from "./meshModelSpec";

// Phase 21D-B.2 — integrity of the code-owned mesh LIBRARY: every entry pins real, shipped, valid bytes; its labelled parts are exactly
// the named parts of that file; its default labels / camera pass the same exam-contract authority a teacher's model goes through; and
// its provenance (source, licences, verbatim attribution, modifications, educational limitations) is complete and matches the
// repository's provenance record, the NOTICE served next to the files and the reproducible conversion manifest.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assetsDir = path.join(root, "public/mesh-assets");
const read = (rel: string) => fs.readFileSync(path.join(root, rel));
const ATTRIBUTION = "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International";

describe("21D-B.2 mesh library — pinned, shipped, valid, traceable", () => {
  it("ships the heart and the brain as the first reviewed anatomical assets, each (id, version) and each file unique", () => {
    expect(MESH_LIBRARY.map(a => a.id + "@" + a.version)).toEqual(["human-heart-bp3d@1", "human-brain-bp3d@1"]);
    expect(new Set(MESH_LIBRARY.map(a => a.sha256)).size).toBe(MESH_LIBRARY.length);
    expect(Object.isFrozen(MESH_LIBRARY) && MESH_LIBRARY.every(a => Object.isFrozen(a) && Object.isFrozen(a.parts) && Object.isFrozen(a.provenance))).toBe(true);
    expect(meshLibraryAsset(MESH_LIBRARY, "human-heart-bp3d", 1)?.parts).toHaveLength(14);
    expect(meshLibraryAsset(MESH_LIBRARY, "human-heart-bp3d", 2)).toBeUndefined();
  });

  it("every pinned file exists under its content address with the pinned SHA-256 and length, and nothing else is shipped beside them", () => {
    const shipped = fs.readdirSync(assetsDir).sort();
    expect(shipped).toEqual([...MESH_LIBRARY.map(a => a.sha256 + ".glb"), "NOTICE.txt"].sort());
    for (const a of MESH_LIBRARY) {
      const bytes = fs.readFileSync(path.join(assetsDir, a.sha256 + ".glb"));
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(a.sha256);
      expect(bytes.length).toBe(a.byteLength);
      expect(a.byteLength).toBeLessThanOrEqual(MESH_ASSET_LIMITS.maxBytes);
      expect(meshAssetUrl({ source: "library", id: a.id, version: a.version, sha256: a.sha256 })).toBe("/mesh-assets/" + a.sha256 + ".glb");
    }
  });

  it("every file passes the shared GLB authority, and the catalog parts are exactly the file's named parts (same order)", () => {
    for (const a of MESH_LIBRARY) {
      const report = inspectGlbAsset(new Uint8Array(fs.readFileSync(path.join(assetsDir, a.sha256 + ".glb"))));
      expect(report.ok, a.id).toBe(true);
      if (!report.ok) continue;
      expect(report.summary.parts.map(p => p.id)).toEqual(a.parts.map(p => p.id));
      expect(report.summary.triangles).toBeLessThanOrEqual(MESH_ASSET_LIMITS.maxTriangles);
      expect(report.summary.textures).toBe(0);                                             // geometry + PBR materials only
      expect(report.summary.copyright).toBe(
        "Derived from BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0 (source notice CC BY-SA 2.1 JP); this file CC BY-SA 4.0");
    }
  });

  it("a model built from an entry's default labels and camera passes the exam contract, with every part selectable", () => {
    for (const a of MESH_LIBRARY) {
      const r = validateMeshModelSpec({
        version: 1, id: "m", title: a.title, description: a.subject, asset: { source: "library", id: a.id, version: a.version, sha256: a.sha256 },
        parts: a.parts.map(p => ({ ...p })), controls: { rotate: true, zoom: true, hideParts: true }, camera: { ...a.camera }
      });
      expect(r.ok ? [] : r.issues, a.id).toEqual([]);
      expect(new Set(a.parts.map(p => p.label)).size).toBe(a.parts.length);                 // labels are unambiguous answer options
      expect(a.parts.every(p => p.description && p.description.length >= 20)).toBe(true);
    }
  });

  it("provenance is complete: source + licensor licence page, CC BY-SA 4.0 for the derived file, verbatim attribution, modifications, limitations", () => {
    for (const a of MESH_LIBRARY) {
      const p = a.provenance;
      expect(p.attribution).toBe(ATTRIBUTION);
      expect([p.sourceUrl, p.sourceLicenseUrl, p.licenseUrl].every(u => /^https:\/\/[a-z0-9.-]+\//.test(u))).toBe(true);
      expect(p.sourceLicense).toBe("CC BY 4.0");
      expect([p.license, p.licenseUrl]).toEqual(["CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"]);
      expect(p.modifications).toContain("scripts/convert-bodyparts3d-21db.mts");
      expect(p.educationalLimitations.length).toBeGreaterThan(200);
      expect(p.educationalLimitations).toContain("ليس أداة تشخيص");
      expect(p.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(meshLibraryAsset(MESH_LIBRARY, "human-heart-bp3d", 1)?.provenance.educationalLimitations).toContain("سطح تجويفهما الداخلي");
  });

  it("the provenance record, the served NOTICE and the conversion manifest name exactly the shipped files", () => {
    const provenance = read("docs/mesh-assets/PROVENANCE.md").toString("utf8"), notice = read("public/mesh-assets/NOTICE.txt").toString("utf8");
    const manifest = JSON.parse(read("docs/mesh-assets/bodyparts3d-21db-manifest.json").toString("utf8")) as {
      source: { sha256: string }; models: { id: string; version: number; sha256: string; byteLength: number; parts: { id: string }[] }[];
    };
    for (const text of [provenance, notice]) {
      expect(text).toContain(ATTRIBUTION);
      expect(text).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
      for (const a of MESH_LIBRARY) expect(text).toContain(a.sha256 + ".glb");
    }
    expect(provenance).toContain(manifest.source.sha256);
    expect(manifest.models.map(m => [m.id, m.version, m.sha256, m.byteLength, m.parts.map(p => p.id)])).toEqual(
      MESH_LIBRARY.map(a => [a.id, a.version, a.sha256, a.byteLength, a.parts.map(p => p.id)]));
  });
});
