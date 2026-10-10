// Phase 21D-B.1 — IMMUTABLE, CONTENT-ADDRESSED, TEACHER-OWNED mesh asset storage (dedicated prefix of the platform container).
//
//   mesh-assets/blobs/<sha256 hex>.glb             the exact validated GLB bytes (the only blob the runtime route serves)
//   mesh-assets/records/<sha256 hex>.json          the validation summary (parts, budgets) written once with the bytes
//   mesh-assets/owners/<owner hash>/<sha256>.json  the teacher's index entry (who uploaded it, when, display name)
//
// The hash IS the identity: the same bytes are stored once, never overwritten (create-only records), and an exam pins the hash, so a
// student loads exactly what the server validated. Owner identities are stored only as a salted hash of the builder subject.
const crypto = require("node:crypto");
const { downloadJsonOrNull, uploadBinary, downloadBinaryOrNull, listBlobNames, uploadJsonConditional, isConcurrencyConflict } = require("../platform-storage");

const PREFIX = "mesh-assets/";
const BLOBS_PREFIX = PREFIX + "blobs/";
const RECORDS_PREFIX = PREFIX + "records/";
const OWNERS_PREFIX = PREFIX + "owners/";
const HEX64 = /^[0-9a-f]{64}$/;
const GLB_CONTENT_TYPE = "model/gltf-binary";

const ownerHashOf = sub => crypto.createHash("sha256").update("mesh-asset-owner:" + String(sub)).digest("hex").slice(0, 32);
const sha256Hex = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const blobName = hex => BLOBS_PREFIX + hex + ".glb";
const recordName = hex => RECORDS_PREFIX + hex + ".json";
const ownerName = (ownerHash, hex) => OWNERS_PREFIX + ownerHash + "/" + hex + ".json";
/** A display name: the base name only, no path, no control / markup characters, bounded. */
function displayNameOf(fileName) {
  const base = String(fileName || "").split(/[\\/]/).pop() || "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001F\u007F<>"'`\u202A-\u202E\u2066-\u2069]/g, "").trim().slice(0, 80);
  return clean || "model.glb";
}
const publicRecord = r => ({ sha256: r.sha256, byteLength: r.byteLength, triangles: r.triangles, vertices: r.vertices, materials: r.materials, textures: r.textures, parts: r.parts, validator: r.validator, storedAt: r.storedAt });

/**
 * persistAsset(container, { buffer, summary, ownerHash, fileName, now }) → { status: "created" | "exists", record }
 * `summary` is the summary of a SUCCESSFUL inspectGlbAsset report for exactly these bytes.
 */
async function persistAsset(container, { buffer, summary, ownerHash, fileName, now = () => new Date().toISOString() }) {
  if (!summary || !Array.isArray(summary.parts)) throw new Error("persistAsset requires a successful validation summary");
  const hex = sha256Hex(buffer);
  let record = await downloadJsonOrNull(container, recordName(hex));
  if (!record) {
    await uploadBinary(container, blobName(hex), buffer, GLB_CONTENT_TYPE);
    record = {
      schemaVersion: 1, sha256: hex, byteLength: buffer.length, triangles: summary.triangles, vertices: summary.vertices, materials: summary.materials, textures: summary.textures,
      parts: summary.parts.map(p => ({ id: p.id, triangles: p.triangles })), validator: "glb-21d-b1", storedAt: now()
    };
    try { await uploadJsonConditional(container, recordName(hex), record, null); }
    catch (e) { if (!isConcurrencyConflict(e)) throw e; record = (await downloadJsonOrNull(container, recordName(hex))) || record; }
  }
  const mine = ownerName(ownerHash, hex);
  const existing = await downloadJsonOrNull(container, mine);
  if (existing) return { status: "exists", record: { ...publicRecord(record), name: existing.name, uploadedAt: existing.uploadedAt } };
  const entry = { sha256: hex, name: displayNameOf(fileName), uploadedAt: now() };
  try { await uploadJsonConditional(container, mine, entry, null); }
  catch (e) { if (!isConcurrencyConflict(e)) throw e; return { status: "exists", record: { ...publicRecord(record), name: entry.name } }; }
  return { status: "created", record: { ...publicRecord(record), name: entry.name, uploadedAt: entry.uploadedAt } };
}

async function listOwnerAssets(container, ownerHash) {
  const names = await listBlobNames(container, OWNERS_PREFIX + ownerHash + "/");
  const out = [];
  for (const n of names) {
    const entry = await downloadJsonOrNull(container, n);
    if (!entry || !HEX64.test(String(entry.sha256 || ""))) continue;
    const record = await downloadJsonOrNull(container, recordName(entry.sha256));
    if (record) out.push({ ...publicRecord(record), name: entry.name, uploadedAt: entry.uploadedAt });
  }
  return out.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : a.uploadedAt > b.uploadedAt ? -1 : 0));
}

/** The stored record of an exact hash — or null (unknown / malformed hash). */
async function loadAssetRecord(container, hex) {
  if (!HEX64.test(String(hex || ""))) return null;
  const record = await downloadJsonOrNull(container, recordName(hex));
  return record && record.sha256 === hex ? publicRecord(record) : null;
}
/** The exact bytes of a recorded asset, re-verified against their hash (integrity at rest) — or null. */
async function loadAssetBytes(container, hex) {
  if (!HEX64.test(String(hex || ""))) return null;
  const record = await downloadJsonOrNull(container, recordName(hex));
  if (!record || record.sha256 !== hex) return null;
  const blob = await downloadBinaryOrNull(container, blobName(hex));
  if (!blob) return null;
  if (sha256Hex(blob.buffer) !== hex || blob.buffer.length !== record.byteLength) return { corrupt: true };
  return { buffer: blob.buffer };
}


// Phase 21D-B.3 — the governance gate's availability check (mirror of the SmartSim package gate). Finalization validates the SHAPE of a
// model's asset reference; this checks that every UPLOADED asset an exam pins really exists in the store — bytes present and re-verified
// against their hash (integrity at rest), exactly the pinned length — and contains every part the question labels (a library asset is
// code-owned, shipped with the app and pinned by the catalog). Nothing is ever resolved to another file.
function collectMeshModelReferences(exam) {
  const out = [];
  const visit = node => { if (!node || typeof node !== "object") return; const m = node.meshPartSelection && node.meshPartSelection.model; if (m && typeof m === "object") out.push(m); if (Array.isArray(node.parts)) node.parts.forEach(visit); };
  const sections = Array.isArray(exam && exam.sections) ? exam.sections : [];
  for (const s of sections) for (const q of Array.isArray(s && s.questions) ? s.questions : []) visit(q);
  if (Array.isArray(exam && exam.questions)) exam.questions.forEach(visit);
  return out;
}
async function examMeshAssetAvailabilityIssues(container, exam) {
  const issues = [], seen = new Set();
  for (const model of collectMeshModelReferences(exam)) {
    const asset = model && model.asset;
    if (!asset || asset.source !== "upload") continue;
    const parts = Array.isArray(model.parts) ? model.parts.map(p => p && p.id).filter(id => typeof id === "string") : [];
    const key = JSON.stringify([asset.sha256, asset.byteLength, parts]);
    if (seen.has(key)) continue; seen.add(key);
    const record = await loadAssetRecord(container, asset.sha256);
    const bytes = record ? await loadAssetBytes(container, asset.sha256) : null;
    const fileParts = record && Array.isArray(record.parts) ? record.parts.map(p => p && p.id) : [];
    const ok = !!record && !!bytes && !bytes.corrupt && record.byteLength === asset.byteLength && parts.every(id => fileParts.includes(id));
    if (!ok) issues.push({ code: "MESH_ASSET_UNAVAILABLE", message: "ملف النموذج ثلاثي الأبعاد المرفوع في السؤال «" + String(model.title || model.id || "").slice(0, 80) + "» غير متاح في المخزن أو لا يحتوي كل الأجزاء المسمّاة.", modelId: typeof model.id === "string" ? model.id : null });
  }
  return issues;
}

module.exports = { PREFIX, BLOBS_PREFIX, RECORDS_PREFIX, OWNERS_PREFIX, GLB_CONTENT_TYPE, ownerHashOf, sha256Hex, displayNameOf, persistAsset, listOwnerAssets, loadAssetRecord, loadAssetBytes, collectMeshModelReferences, examMeshAssetAvailabilityIssues };
