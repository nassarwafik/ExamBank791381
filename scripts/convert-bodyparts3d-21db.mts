#!/usr/bin/env node
// Phase 21D-B.2 — REPRODUCIBLE conversion of BodyParts3D anatomy (OBJ, PART-OF tree, polygon reduction 99%) into ExamBank library GLBs.
//
//   BP3D_ZIP=/path/to/partof_BP3D_4.0_obj_99.zip node --experimental-strip-types scripts/convert-bodyparts3d-21db.mts
//
// Source: BodyParts3D, © The Database Center for Life Science (DBCLS), https://dbarchive.biosciencedbc.jp/en/bodyparts3d/
// Licence (licensor's page, updated 2025-02-27): CC BY 4.0; the 2011–2013 OBJ files carry a CC BY-SA 2.1 JP notice. ExamBank publishes the
// derived GLB files under CC BY-SA 4.0 with the required attribution (docs/mesh-assets/PROVENANCE.md, public/mesh-assets/NOTICE.txt).
//
// The script refuses any archive except the exact one recorded below (SHA-256), so the outputs are reproducible byte for byte. For every
// model it: reads the listed element meshes (FJ file ids, each tied to an FMA concept), converts BodyParts3D millimetres (Z up, −Y
// anterior, +X the patient's left) to glTF metres (Y up, +Z anterior), merges the elements of each labelled part, optionally clips a
// vessel at a height and simplifies with the quadric edge-collapse simplifier (original vertices only), writes one node per part with
// its material, validates the result with the SAME GLB authority the server and browser use, and writes it content-addressed to
// public/mesh-assets/<sha256>.glb. A manifest records, per part, every source element (file id, FMA concept, English name) and triangle
// counts before and after simplification — the traceability the provenance record cites.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeGlb, type GlbModelMaterial, type GlbModelPart } from "../src/meshModels/glbWriter.ts";
import { simplifyMesh } from "../src/meshModels/meshSimplify.ts";

const SOURCE_SHA256 = "9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97";
const SOURCE_NAME = "partof_BP3D_4.0_obj_99.zip";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const zip = require(path.join(root, "api/src/lib/smartsim/zip-reader.js"));
// the SAME GLB authority the server runs (compiled, drift-tested copy of src/meshModels/glbAsset.ts)
const { inspectGlbAsset } = require(path.join(root, "api/src/lib/shared-finalization/meshModels/glbAsset.js"));

type PartSpec = { id: string; files: string[]; material: number; clipBelowMm?: number; simplify?: number };
type ModelSpec = { id: string; version: number; centreFiles: string[]; parts: PartSpec[]; materials: GlbModelMaterial[]; simplify?: number };
const tone = (r: number, g: number, b: number): [number, number, number, number] => [r, g, b, 1];

export const MODELS: ModelSpec[] = [
  {
    id: "human-heart-bp3d", version: 1, centreFiles: ["FJ2439", "FJ2438", "FJ2423", "FJ2422"],
    materials: [
      { name: "atrial myocardium", baseColor: tone(0.5, 0.11, 0.09), roughness: 0.52, doubleSided: true },
      { name: "ventricle", baseColor: tone(0.43, 0.075, 0.065), roughness: 0.5, doubleSided: true },
      { name: "artery", baseColor: tone(0.72, 0.035, 0.03), roughness: 0.34, doubleSided: true },
      { name: "vein", baseColor: tone(0.1, 0.17, 0.5), roughness: 0.36, doubleSided: true },
      { name: "valve", baseColor: tone(0.86, 0.78, 0.64), roughness: 0.5, doubleSided: true }
    ],
    parts: [
      { id: "rightAtrium", files: ["FJ2439"], material: 0 },
      { id: "leftAtrium", files: ["FJ2438"], material: 0 },
      { id: "rightVentricle", files: ["FJ2423"], material: 1 },
      { id: "leftVentricle", files: ["FJ2422"], material: 1 },
      { id: "aorta", files: ["FJ3413", "FJ3411"], material: 2 },
      { id: "pulmonaryTrunk", files: ["FJ2966"], material: 3 },
      { id: "superiorVenaCava", files: ["FJ3645"], material: 3 },
      { id: "inferiorVenaCava", files: ["FJ3441"], material: 3, clipBelowMm: 1165 },
      { id: "coronaryArteries", material: 2, files: ["FJ2723", "FJ2737", "FJ2631", "FJ2633", "FJ2634", "FJ2635", "FJ2636", "FJ2637", "FJ2638", "FJ2639", "FJ2640", "FJ2642", "FJ2648", "FJ2649", "FJ2650", "FJ2651", "FJ2652", "FJ2653", "FJ2654", "FJ2643", "FJ2644", "FJ2671", "FJ2673", "FJ2677", "FJ2714", "FJ2715", "FJ2716", "FJ2717", "FJ2718", "FJ2719", "FJ2720", "FJ2721", "FJ2722", "FJ2632", "FJ2645", "FJ2646", "FJ2641", "FJ2647", "FJ2667", "FJ2668", "FJ2672", "FJ2674", "FJ2675", "FJ2692", "FJ2693", "FJ2694", "FJ2695", "FJ2696", "FJ2697", "FJ2698", "FJ2699", "FJ2700", "FJ2670", "FJ2676"] },
      { id: "cardiacVeins", material: 3, files: ["FJ2655", "FJ2656", "FJ2724", "FJ2731", "FJ2727", "FJ2728", "FJ2729"] },
      { id: "tricuspidValve", files: ["FJ2421", "FJ2433", "FJ2436"], material: 4 },
      { id: "mitralValve", files: ["FJ2420", "FJ2432"], material: 4 },
      { id: "aorticValve", files: ["FJ2435", "FJ2426", "FJ2431"], material: 4 },
      { id: "pulmonaryValve", files: ["FJ2417", "FJ2434", "FJ2427"], material: 4 },
    ]
  },
  {
    id: "human-brain-bp3d", version: 1, simplify: 0.5,
    centreFiles: ["FJ1758", "FJ1806", "FJ1781", "FJ1830"],
    materials: [
      { name: "frontal lobe", baseColor: tone(0.82, 0.36, 0.3), roughness: 0.62, doubleSided: true },
      { name: "parietal lobe", baseColor: tone(0.33, 0.43, 0.82), roughness: 0.62, doubleSided: true },
      { name: "temporal lobe", baseColor: tone(0.27, 0.64, 0.33), roughness: 0.62, doubleSided: true },
      { name: "occipital lobe", baseColor: tone(0.9, 0.66, 0.16), roughness: 0.62, doubleSided: true },
      { name: "insula", baseColor: tone(0.66, 0.3, 0.68), roughness: 0.62, doubleSided: true },
      { name: "cerebellum", baseColor: tone(0.18, 0.58, 0.62), roughness: 0.62, doubleSided: true },
      { name: "midbrain", baseColor: tone(0.92, 0.52, 0.36), roughness: 0.6, doubleSided: true },
      { name: "pons", baseColor: tone(0.78, 0.44, 0.26), roughness: 0.6, doubleSided: true },
      { name: "medulla oblongata", baseColor: tone(0.62, 0.36, 0.22), roughness: 0.6, doubleSided: true },
      { name: "white matter", baseColor: tone(0.86, 0.84, 0.8), roughness: 0.7, doubleSided: true }
    ],
    parts: [
      { id: "frontalLobe", files: ["FJ1833", "FJ1834", "FJ1787", "FJ1788", "FJ1744", "FJ1745", "FJ1800", "FJ1801"], material: 0 },
      { id: "parietalLobe", files: ["FJ1797", "FJ1798", "FJ1835", "FJ1836", "FJ1841", "FJ1842", "FJ1732", "FJ1733"], material: 1 },
      { id: "temporalLobe", files: ["FJ1789", "FJ1790", "FJ1746", "FJ1747", "FJ1783", "FJ1784"], material: 2 },
      { id: "occipitalLobe", files: ["FJ1791", "FJ1792"], material: 3 },
      { id: "insula", files: ["FJ1748", "FJ1749"], material: 4 },
      { id: "cerebellum", files: ["FJ1781", "FJ1830"], material: 5 },
      { id: "midbrain", files: ["FJ1770", "FJ1817"], material: 6 },
      { id: "pons", files: ["FJ1775", "FJ1822"], material: 7 },
      { id: "medullaOblongata", files: ["FJ1769", "FJ1831"], material: 8 },
      { id: "whiteMatter", files: ["FJ1758", "FJ1806"], material: 9 }
    ]
  }
];

type Obj = { P: number[]; N: number[]; I: number[]; header: { fileId: string; concept: string; name: string } };
function parseObj(text: string, clipBelowMm?: number): Obj {
  const P: number[] = [], N: number[] = [], faces: number[][] = [];
  const header = { fileId: "", concept: "", name: "" };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("# File ID :")) header.fileId = l.slice(11).trim();
    else if (l.startsWith("# Concept ID :")) header.concept = l.slice(14).trim();
    else if (l.startsWith("# English name :")) header.name = l.slice(16).trim();
    else if (l.startsWith("v ")) { const [, x, y, z] = l.split(/\s+/).map(Number); P.push(x, y, z); }
    else if (l.startsWith("vn ")) { const [, x, y, z] = l.split(/\s+/).map(Number); N.push(x, y, z); }
    else if (l.startsWith("f ")) faces.push(l.split(/\s+/).slice(1).map(s => parseInt(s, 10) - 1));
  }
  if (N.length !== P.length) throw new Error("normals do not match positions in " + header.fileId);
  const I: number[] = [];
  for (const f of faces) {
    if (clipBelowMm !== undefined && f.some(k => P[k * 3 + 2] < clipBelowMm)) continue;
    for (let k = 1; k + 1 < f.length; k++) I.push(f[0], f[k], f[k + 1]);
  }
  return { P, N, I, header };
}

export function convert(archive: Buffer, models = MODELS) {
  const entries = zip.listEntries(archive), byId = new Map<string, unknown>();
  for (const e of entries) { const m = /\/(FJ\d+)\.obj$/.exec(e.name); if (m) byId.set(m[1], e); }
  const read = (id: string, clip?: number) => {
    const e = byId.get(id);
    if (!e) throw new Error("missing element " + id);
    return parseObj(zip.readEntry(archive, e, { maxBytes: 64 * 1024 * 1024 }).toString("utf8"), clip);
  };
  return models.map(model => {
    let cx = 0, cy = 0, cz = 0, cn = 0;
    for (const f of model.centreFiles) { const o = read(f); for (let k = 0; k < o.P.length; k += 3) { cx += o.P[k]; cy += o.P[k + 1]; cz += o.P[k + 2]; cn++; } }
    cx /= cn; cy /= cn; cz /= cn;
    const manifestParts: unknown[] = [];
    const parts: GlbModelPart[] = model.parts.map(spec => {
      const P: number[] = [], N: number[] = [], I: number[] = [], sources: unknown[] = [];
      for (const f of spec.files) {
        const o = read(f, spec.clipBelowMm), base = P.length / 3;
        for (let k = 0; k < o.P.length; k += 3) {
          P.push(Math.fround((o.P[k] - cx) / 1000), Math.fround((o.P[k + 2] - cz) / 1000), Math.fround(-(o.P[k + 1] - cy) / 1000));
          const l = Math.hypot(o.N[k], o.N[k + 1], o.N[k + 2]) || 1;
          N.push(o.N[k] / l, o.N[k + 2] / l, -o.N[k + 1] / l);
        }
        for (const x of o.I) I.push(x + base);
        sources.push({ file: f, concept: o.header.concept, name: o.header.name, triangles: o.I.length / 3 });
      }
      const ratio = spec.simplify ?? model.simplify ?? 1;
      let geo = { positions: new Float32Array(P), normals: new Float32Array(N), indices: new Uint32Array(I) };
      const before = I.length / 3;
      if (ratio < 1) { const s = simplifyMesh(geo, ratio); geo = { positions: s.positions, normals: s.normals, indices: s.indices }; }
      const vertices = geo.positions.length / 3;
      manifestParts.push({ id: spec.id, sources, triangles: { source: before, output: geo.indices.length / 3 }, vertices, ...(spec.clipBelowMm !== undefined ? { clippedBelowMm: spec.clipBelowMm } : {}) });
      return { id: spec.id, material: spec.material, geometry: { positions: geo.positions, normals: geo.normals, indices: vertices > 65535 ? geo.indices : new Uint16Array(geo.indices) } };
    });
    const glb = writeGlb({
      parts, materials: model.materials, generator: "ExamBank BodyParts3D converter (Phase 21D-B.2)",
      copyright: "Derived from BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0 (source notice CC BY-SA 2.1 JP); this file CC BY-SA 4.0"
    });
    const report = inspectGlbAsset(glb);
    if (!report.ok) throw new Error(model.id + ": " + JSON.stringify(report.issues));
    const sha256 = crypto.createHash("sha256").update(glb).digest("hex");
    return { id: model.id, version: model.version, sha256, byteLength: glb.length, triangles: report.summary.triangles, vertices: report.summary.vertices, glb, parts: manifestParts };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.env.BP3D_ZIP;
  if (!src) { console.error("set BP3D_ZIP to the path of " + SOURCE_NAME); process.exit(2); }
  const archive = fs.readFileSync(src), sha = crypto.createHash("sha256").update(archive).digest("hex");
  if (sha !== SOURCE_SHA256) { console.error("refusing: " + src + " is not the recorded " + SOURCE_NAME + " (sha256 " + sha + ")"); process.exit(2); }
  const out = convert(archive);
  const dir = path.join(root, "public/mesh-assets");
  fs.mkdirSync(dir, { recursive: true });
  for (const m of out) fs.writeFileSync(path.join(dir, m.sha256 + ".glb"), m.glb);
  const manifest = { source: { name: SOURCE_NAME, sha256: SOURCE_SHA256, url: "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/" + SOURCE_NAME }, converter: "scripts/convert-bodyparts3d-21db.mts", models: out.map(({ glb: _glb, ...m }) => m) };
  fs.mkdirSync(path.join(root, "docs/mesh-assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/mesh-assets/bodyparts3d-21db-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const m of out) console.log(m.id, "v" + m.version, m.sha256, m.byteLength + " B", m.triangles + " triangles");
}
