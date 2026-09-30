// Phase 16B-A — IMMUTABLE, CONTENT-ADDRESSED, TEACHER-OWNED simulator package storage (dedicated prefix; never the raw import
// container, never inside exam JSON).
//
//   simulators/packages/<sha256 hex>/metadata.json        the validated package record (identity, entry, files, sizes)
//   simulators/packages/<sha256 hex>/package.smartsim     the EXACT uploaded bytes (audit / re-validation; never served)
//   simulators/packages/<sha256 hex>/dist/<path>          the runtime file set — the only blobs the runtime route serves
//   simulators/owners/<ownerHash>/<packageId>/<version>.json   the owner's (packageId, version) → packageHash binding
//
// Rules: the same bytes are one package whoever uploads them (hash-addressed, written once); an owner's (packageId, version)
// binds to exactly ONE hash forever — identical bytes are idempotent, different bytes are a CONFLICT (bump the version);
// V1 stays retrievable after V2; nothing is ever overwritten or deleted; "latest" is never resolved anywhere; owners are
// addressed by a one-way hash of auth.sub and never echoed; a student needs no ownership — the published exam pins the
// exact (id, version, hash) and the runtime route serves by that capability.
const crypto = require("node:crypto");
const { downloadJsonOrNull, uploadBinary, downloadBinaryOrNull, listBlobNames, uploadJsonConditional, isConcurrencyConflict } = require("../platform-storage");
const { isSafePackagePath, SMARTSIM_PACKAGE_HASH_PATTERN, SMARTSIM_PACKAGE_ID_PATTERN, SMARTSIM_DIST_PREFIX, validateSimulationReference } = require("../shared-finalization/smartsimManifest");
const { contentTypeFor } = require("./mime-map");

const PACKAGES_PREFIX = "simulators/packages/";
const OWNERS_PREFIX = "simulators/owners/";
const HEX64 = /^[0-9a-f]{64}$/;

const ownerHashOf = sub => crypto.createHash("sha256").update("smartsim-owner:" + String(sub)).digest("hex").slice(0, 32);
const hexOf = hash => { const s = String(hash || ""); const hex = s.startsWith("sha256:") ? s.slice(7) : s; return HEX64.test(hex) ? hex : null; };
const packageDir = hex => PACKAGES_PREFIX + hex + "/";
const ownerRecordName = (ownerHash, packageId, version) => OWNERS_PREFIX + ownerHash + "/" + packageId + "/" + version + ".json";
/** Path of a runtime member relative to dist/ ("dist/index.html" → "index.html"). */
const relativeToDist = p => (p.startsWith(SMARTSIM_DIST_PREFIX) ? p.slice(SMARTSIM_DIST_PREFIX.length) : p);

function recordOf(metadata) {
  const { packageId, packageVersion, packageHash, runtimeVersion, responseSchemaVersion, entry, title, description, capabilities, sizeBytes, archiveBytes, fileCount, uploadedAt, status } = metadata;
  return { packageId, packageVersion, packageHash, runtimeVersion, responseSchemaVersion, entry, title, ...(description ? { description } : {}), capabilities, sizeBytes, archiveBytes, fileCount, uploadedAt, status };
}

/**
 * persistPackage(container, { buffer, report, ownerHash, now }) → { status: "created" | "exists" | "conflict", record, existing? }
 * `report` is a SUCCESSFUL validateSmartSimPackage report (with member bytes).
 */
async function persistPackage(container, { buffer, report, ownerHash, now = () => new Date().toISOString() }) {
  if (!report || !report.ok || !report.manifest) throw new Error("persistPackage requires a successful validation report");
  const { manifest, packageHash } = report;
  const hex = hexOf(packageHash);
  const ownerName = ownerRecordName(ownerHash, manifest.packageId, manifest.packageVersion);
  const existing = await downloadJsonOrNull(container, ownerName);
  if (existing) {
    if (existing.packageHash === packageHash) { const meta = await downloadJsonOrNull(container, packageDir(hex) + "metadata.json"); return { status: "exists", record: meta ? recordOf(meta) : existing }; }
    return { status: "conflict", existing: { packageId: existing.packageId, packageVersion: existing.packageVersion, packageHash: existing.packageHash, uploadedAt: existing.uploadedAt } };
  }
  const uploadedAt = now();
  let metadata = await downloadJsonOrNull(container, packageDir(hex) + "metadata.json");
  if (!metadata) {
    // content-addressed: write the runtime members + the exact archive, then the record (create-only; a concurrent identical
    // upload that wins the race produced byte-identical blobs, so losing the metadata race is harmless)
    for (const f of report.files) {
      if (f.path === "manifest.json") continue;
      await uploadBinary(container, packageDir(hex) + f.path, f.data, f.contentType || contentTypeFor(f.path) || "application/octet-stream");
    }
    await uploadBinary(container, packageDir(hex) + "package.smartsim", buffer, "application/zip");
    metadata = {
      schemaVersion: 1, packageId: manifest.packageId, packageVersion: manifest.packageVersion, packageHash, runtimeVersion: manifest.runtimeVersion, responseSchemaVersion: manifest.responseSchemaVersion,
      entry: relativeToDist(manifest.entry), title: manifest.title, ...(manifest.description ? { description: manifest.description } : {}), capabilities: manifest.capabilities,
      files: report.files.filter(f => f.path !== "manifest.json").map(f => ({ path: relativeToDist(f.path), bytes: f.bytes, contentType: f.contentType })),
      sizeBytes: report.uncompressedBytes, archiveBytes: report.compressedBytes, fileCount: report.fileCount, selfContained: report.selfContained, uploadedAt, status: "ready"
    };
    try { await uploadJsonConditional(container, packageDir(hex) + "metadata.json", metadata, null); }
    catch (e) { if (!isConcurrencyConflict(e)) throw e; metadata = await downloadJsonOrNull(container, packageDir(hex) + "metadata.json") || metadata; }
  }
  const ownerRecord = { ...recordOf(metadata), uploadedAt };
  try { await uploadJsonConditional(container, ownerName, ownerRecord, null); }
  catch (e) {
    if (!isConcurrencyConflict(e)) throw e;
    const raced = await downloadJsonOrNull(container, ownerName);
    if (raced && raced.packageHash === packageHash) return { status: "exists", record: recordOf(metadata) };
    return { status: "conflict", existing: raced ? { packageId: raced.packageId, packageVersion: raced.packageVersion, packageHash: raced.packageHash, uploadedAt: raced.uploadedAt } : null };
  }
  return { status: "created", record: ownerRecord };
}

async function listOwnerPackages(container, ownerHash) {
  const names = await listBlobNames(container, OWNERS_PREFIX + ownerHash + "/");
  const out = [];
  for (const n of names) { const r = await downloadJsonOrNull(container, n); if (r) out.push(recordOf(r)); }
  return out.sort((a, b) => (a.packageId === b.packageId ? a.packageVersion - b.packageVersion : a.packageId < b.packageId ? -1 : 1));
}
async function listOwnerPackageVersions(container, ownerHash, packageId) {
  if (!SMARTSIM_PACKAGE_ID_PATTERN.test(String(packageId || ""))) return [];
  const names = await listBlobNames(container, OWNERS_PREFIX + ownerHash + "/" + packageId + "/");
  const out = [];
  for (const n of names) { const r = await downloadJsonOrNull(container, n); if (r && r.packageId === packageId) out.push(recordOf(r)); }
  return out.sort((a, b) => a.packageVersion - b.packageVersion);
}
/** The stored record for an exact hash ("sha256:<hex>" or bare hex) — or null. */
async function loadPackageRecordByHash(container, hash) {
  const hex = hexOf(hash);
  if (!hex) return null;
  const meta = await downloadJsonOrNull(container, packageDir(hex) + "metadata.json");
  return meta ? { ...recordOf(meta), files: meta.files, selfContained: meta.selfContained } : null;
}
/** A runtime member (relative to dist/) of the package with this hash — or null (unsafe path, listing, metadata, archive). */
async function loadPackageAsset(container, hash, assetPath) {
  const hex = hexOf(hash);
  if (!hex || typeof assetPath !== "string" || !isSafePackagePath(assetPath) || assetPath.endsWith("/")) return null;
  const contentType = contentTypeFor(assetPath);
  if (!contentType) return null;
  const blob = await downloadBinaryOrNull(container, packageDir(hex) + SMARTSIM_DIST_PREFIX + assetPath);
  return blob ? { buffer: blob.buffer, contentType } : null;
}

/** Walks an exam and collects every simulation reference (sections → questions → parts). */
function collectSimulationReferences(exam) {
  const out = [];
  const visit = node => { if (!node || typeof node !== "object") return; if (node.simulation && typeof node.simulation === "object") out.push(node.simulation); if (Array.isArray(node.parts)) node.parts.forEach(visit); };
  const sections = Array.isArray(exam && exam.sections) ? exam.sections : [];
  for (const s of sections) for (const q of Array.isArray(s && s.questions) ? s.questions : []) visit(q);
  if (Array.isArray(exam && exam.questions)) exam.questions.forEach(visit);
  return out;
}
/**
 * packageAvailabilityIssues(container, refs) → [{ code: "SIM_PACKAGE_UNAVAILABLE", message, packageId, packageVersion }]
 * A reference is available only when a stored package with EXACTLY that hash carries the same packageId / packageVersion /
 * runtimeVersion. Nothing is ever resolved to another version.
 */
async function packageAvailabilityIssues(container, refs) {
  const issues = [], seen = new Set();
  for (const ref of Array.isArray(refs) ? refs : []) {
    const key = JSON.stringify([ref && ref.packageId, ref && ref.packageVersion, ref && ref.packageHash]);
    if (seen.has(key)) continue; seen.add(key);
    const invalid = validateSimulationReference(ref);
    const rec = invalid.length ? null : await loadPackageRecordByHash(container, ref.packageHash);
    const ok = rec && rec.packageId === ref.packageId && rec.packageVersion === ref.packageVersion && rec.runtimeVersion === ref.runtimeVersion && rec.status === "ready";
    if (!ok) issues.push({ code: "SIM_PACKAGE_UNAVAILABLE", message: "حزمة المحاكاة المثبّتة في السؤال غير متاحة في المخزن: " + String(ref && ref.packageId) + "@" + String(ref && ref.packageVersion) + ".", packageId: ref && ref.packageId, packageVersion: ref && ref.packageVersion });
  }
  return issues;
}
/** Convenience for the governance gate. */
async function examSimulationAvailabilityIssues(container, exam) { return packageAvailabilityIssues(container, collectSimulationReferences(exam)); }

module.exports = { PACKAGES_PREFIX, OWNERS_PREFIX, ownerHashOf, hexOf, persistPackage, listOwnerPackages, listOwnerPackageVersions, loadPackageRecordByHash, loadPackageAsset, collectSimulationReferences, packageAvailabilityIssues, examSimulationAvailabilityIssues, SMARTSIM_PACKAGE_HASH_PATTERN };
