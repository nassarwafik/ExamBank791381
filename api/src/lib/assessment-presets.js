const crypto = require("crypto");
const storage = require("./platform-storage");
const shared = require("./shared-finalization/assessmentPreset");

// Phase 15A — personal Assessment Presets («قالب أكاديمي»): server-owned storage of reusable assessment DESIGNS.
//
//   assessment-presets/<ownerKey>/<presetId>.json      ownerKey = sha256("assessment-preset:" + actorId)[0..32]
//
// Ownership is ALWAYS the authenticated token subject handed in by the function layer (requireBuilderAuth); nothing here reads
// a body / query owner. A record = { schemaVersion, presetId, ownerId, version, createdAt, updatedAt, preset } — the server
// mints presetId / ownerId / version / timestamps; the client supplies preset CONTENT only, validated with the SAME generated
// validator the browser uses (shared-finalization/assessmentPreset — byte-identical to src/assessmentPreset.ts, drift-guarded).
// Creation is create-only (If-None-Match:*), updates and deletes are ETag compare-and-set gated by `expectedVersion`
// (stale ⇒ 409, never last-write-wins). Legacy `templates/…` exam-template blobs are a different, untouched artifact.
const PRESET_PREFIX = "assessment-presets/";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DEFAULT_PAGE = 20, MAX_PAGE = 50, MAX_SCAN = 500;

class PresetError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.name = "PresetError"; this.status = status; this.code = code; if (extra) Object.assign(this, extra); }
}
const notFound = () => new PresetError(404, "PRESET_NOT_FOUND", "القالب الأكاديمي غير موجود.");
const nowOf = deps => (deps && typeof deps.now === "function" ? deps.now() : new Date().toISOString());
const newId = deps => (deps && typeof deps.newId === "function" ? deps.newId() : crypto.randomUUID());

function ownerKey(actorId) { return crypto.createHash("sha256").update("assessment-preset:" + String(actorId || "")).digest("hex").slice(0, 32); }
function ownerPrefix(actorId) { return PRESET_PREFIX + ownerKey(actorId) + "/"; }
function presetName(actorId, presetId) { if (!SAFE_ID.test(String(presetId))) throw notFound(); return ownerPrefix(actorId) + presetId + ".json"; }
function requireOwner(ownerId) { if (typeof ownerId !== "string" || !ownerId) throw new PresetError(401, "UNAUTHORIZED", "Unauthorized"); return ownerId; }
function requireVersion(v) { if (!Number.isInteger(v) || v < 1) throw new PresetError(400, "INVALID", "expectedVersion مطلوب لهذا الإجراء."); return v; }

// Canonical validation through the generated shared module; the record's presetId is imposed by the server.
function validatedPreset(input, presetId) {
  const candidate = input && typeof input === "object" && !Array.isArray(input) ? { ...input, presetId } : input;
  const issues = shared.validateAssessmentPreset(candidate);
  if (issues.length) throw new PresetError(400, "PRESET_INVALID", "القالب الأكاديمي غير صالح.", { issues });
  return candidate;
}
async function readRecord(container, ownerId, presetId, deps) {
  const name = presetName(ownerId, presetId);
  const dl = deps && deps.downloadJsonWithEtagOrNull ? deps.downloadJsonWithEtagOrNull : storage.downloadJsonWithEtagOrNull;
  const { value, etag } = await dl(container, name);
  // Absent, foreign or malformed records are all the same not-found: no directory information leaks through error shape.
  if (!value || value.schemaVersion !== 1 || value.ownerId !== ownerId || value.presetId !== presetId || !value.preset) throw notFound();
  return { record: value, etag, name };
}

async function createPreset(container, { ownerId: rawOwner, preset }, deps = {}) {
  const ownerId = requireOwner(rawOwner);
  const presetId = "apr-" + newId(deps);
  const content = validatedPreset(preset, presetId);
  const at = nowOf(deps);
  const record = { schemaVersion: 1, presetId, ownerId, version: 1, createdAt: at, updatedAt: at, preset: content };
  try { await storage.uploadJsonConditional(container, presetName(ownerId, presetId), record, null); }
  catch (e) { if (storage.isConcurrencyConflict(e)) throw new PresetError(409, "PRESET_EXISTS", "تعارض في معرّف القالب؛ أعد المحاولة."); throw e; }
  return record;
}
async function loadPreset(container, { ownerId: rawOwner, presetId }, deps = {}) {
  const ownerId = requireOwner(rawOwner);
  const { record } = await readRecord(container, ownerId, String(presetId || ""), deps);
  return record;
}
async function updatePreset(container, { ownerId: rawOwner, presetId, expectedVersion, preset }, deps = {}) {
  const ownerId = requireOwner(rawOwner);
  requireVersion(expectedVersion);
  const { record, etag, name } = await readRecord(container, ownerId, String(presetId || ""), deps);
  if (record.version !== expectedVersion) throw new PresetError(409, "STALE_VERSION", "تغيّر القالب على الخادم منذ تحميله؛ أعد تحميله قبل التعديل.", { record });
  const content = validatedPreset(preset, record.presetId);
  const next = { ...record, version: record.version + 1, updatedAt: nowOf(deps), preset: content };
  try { await storage.uploadJsonConditional(container, name, next, etag); }
  catch (e) { if (storage.isConcurrencyConflict(e)) { const fresh = await readRecord(container, ownerId, record.presetId, deps).catch(() => null); throw new PresetError(409, "STALE_VERSION", "تغيّر القالب على الخادم أثناء الحفظ؛ أعد تحميله قبل التعديل.", fresh ? { record: fresh.record } : undefined); } throw e; }
  return next;
}
async function deletePreset(container, { ownerId: rawOwner, presetId, expectedVersion }, deps = {}) {
  const ownerId = requireOwner(rawOwner);
  requireVersion(expectedVersion);
  const { record, etag, name } = await readRecord(container, ownerId, String(presetId || ""), deps);
  if (record.version !== expectedVersion) throw new PresetError(409, "STALE_VERSION", "تغيّر القالب على الخادم منذ تحميله؛ أعد تحميله قبل الحذف.", { record });
  try { await storage.deleteBlobConditional(container, name, etag); }
  catch (e) { if (storage.isConcurrencyConflict(e)) throw new PresetError(409, "STALE_VERSION", "تغيّر القالب على الخادم أثناء الحذف؛ أعد تحميله.", {}); throw e; }
  return { deleted: true, presetId: record.presetId, version: record.version };
}
function clampLimit(limit) { const n = Number(limit); return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PAGE, Math.floor(n)) : DEFAULT_PAGE; }
const norm = v => String(v || "").normalize("NFKC").toLowerCase();
// Records are small (design only, no questions) and per-owner, so the list reads the owner's documents directly (bounded by
// MAX_SCAN) and returns summaries only — documented in docs/enterprise-presets-15a.md §list.
async function listPresets(container, { ownerId: rawOwner, cursor, limit, q }, deps = {}) {
  const ownerId = requireOwner(rawOwner);
  const listNames = deps.listBlobNames || storage.listBlobNames;
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const names = (await listNames(container, ownerPrefix(ownerId))).slice(0, MAX_SCAN);
  const docs = await storage.mapConcurrent(names, 8, name => dl(container, name));
  const needle = norm(q).trim();
  const items = [];
  for (const d of docs) {
    if (!d || d.schemaVersion !== 1 || d.ownerId !== ownerId || !d.preset) continue;
    const s = shared.presetSummary(d);
    if (needle && ![s.title, s.subject, s.course, s.level].some(v => norm(v).includes(needle))) continue;
    items.push(s);
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.presetId < b.presetId ? -1 : 1));
  const size = clampLimit(limit);
  const start = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
  return { items: items.slice(start, start + size), nextCursor: start + size < items.length ? start + size : null, total: items.length };
}

module.exports = { PRESET_PREFIX, PresetError, ownerKey, presetName, createPreset, loadPreset, updatePreset, deletePreset, listPresets };
