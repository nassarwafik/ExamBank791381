const crypto = require("crypto");
const storage = require("./platform-storage");
const { libraryCatalogEntry, libraryItemEntry, deepFreeze } = require("./exam-library-store");

// Tadris+ P6-E — exams the OWNER adds to the library from the console (owner direction: «إضافة امتحان جديد للبنك عن طريق استيراد
// الامتحان … وبعد أن يمر مراحل الإعداد ويمر النشر أختار من يراه»). The bundled library (exam-library-store.js) is unchanged; an
// imported exam lives in Blob Storage next to it and is read through the SAME routes, so a teacher sees one library:
//
//   platform/catalog/exam-library-imported.json        the INDEX: { schemaVersion: 1, items: [catalog metadata…] } — compare-and-set.
//                                                        It is the authority: an item document that is not listed does not exist.
//   platform/catalog/exam-library-items/<id>.json      one item, the bundled shape (metadata + examSnapshot WITH answer keys),
//                                                        written ONCE (create-only) and never changed — like a bundled file.
//
// Ids are IMP-001, IMP-002… (never a bundled id). A new item is in nobody's bank until the owner chooses its audience (it is not a
// launch item: library-access.js). Anything that cannot be understood — the index or a listed item — fails CLOSED
// (ImportedLibraryError → the routes answer 503; nothing is listed, nothing is overwritten).

const INDEX_DOC = "platform/catalog/exam-library-imported.json";
const ITEM_PREFIX = "platform/catalog/exam-library-items/";
const IMPORTED_ID = /^IMP-\d{3,6}$/;
const CATEGORY = /^[a-z0-9-]{1,40}$/;
const MAX_ITEMS = 2000;
const META_KEYS = ["libraryItemId", "title", "category", "description", "tags", "questionCount", "totalMarks", "conversionStatus", "publishable", "activityType", "libraryVersion", "contentHash", "convertedAt", "source"];

class ImportedLibraryError extends Error {
  constructor(message) { super(message); this.name = "ImportedLibraryError"; this.code = "LIBRARY_IMPORTED_UNAVAILABLE"; }
}

const itemName = id => ITEM_PREFIX + id + ".json";
const etagOf = text => '"' + crypto.createHash("sha256").update(text).digest("base64url").slice(0, 22) + '"';

function validMeta(m) {
  return !!m && typeof m === "object" && IMPORTED_ID.test(String(m.libraryItemId || "")) && typeof m.title === "string" && !!m.title.trim()
    && typeof m.category === "string" && CATEGORY.test(m.category) && Number.isFinite(m.questionCount) && m.questionCount > 0
    && Number.isFinite(m.totalMarks) && typeof m.contentHash === "string" && /^[0-9a-f]{64}$/.test(m.contentHash);
}
/** Validates a stored index ({ items: [] } when there is none). Throws ImportedLibraryError when it cannot be understood. */
function parseIndex(doc) {
  if (!doc) return { schemaVersion: 1, items: [] };
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.items) || doc.items.length > MAX_ITEMS) throw new ImportedLibraryError("imported index invalid");
  const seen = new Set();
  for (const m of doc.items) {
    if (!validMeta(m) || seen.has(m.libraryItemId)) throw new ImportedLibraryError("imported index entry invalid");
    seen.add(m.libraryItemId);
  }
  return doc;
}
async function readImportedIndex(container, deps = {}) {
  let doc;
  try { doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, INDEX_DOC); }
  catch { throw new ImportedLibraryError("imported index unreadable"); }
  return parseIndex(doc);
}

/** The catalog row of an item (no examSnapshot), exactly the bundled catalog's shape. */
function catalogMeta(item) {
  const out = {};
  for (const k of META_KEYS) if (item[k] !== undefined) out[k] = item[k];
  return out;
}

// Imported items never change once written, so each is read ONCE per process (frozen, shared) — like a bundled file. The index is
// read on every request: it decides whether an item exists.
const ITEMS = new Map();
async function importedItemEntry(container, id, deps = {}, index = null) {
  const clean = String(id || "").trim();
  if (!IMPORTED_ID.test(clean)) return null;
  const listed = (index || (await readImportedIndex(container, deps))).items.find(m => m.libraryItemId === clean);
  if (!listed) return null;
  const hit = ITEMS.get(clean);
  if (hit && hit.value.contentHash === listed.contentHash) return hit;
  let value;
  try { value = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, itemName(clean)); }
  catch { throw new ImportedLibraryError("imported item unreadable"); }
  // Listed but missing / not the item the index describes → fail closed (never a half-written exam).
  if (!value || value.libraryItemId !== clean || value.contentHash !== listed.contentHash || !value.examSnapshot || typeof value.examSnapshot !== "object"
    || !Array.isArray(value.examSnapshot.sections)) throw new ImportedLibraryError("imported item invalid: " + clean);
  const entry = { value: deepFreeze(value), etag: etagOf(clean + "|" + listed.contentHash) };
  ITEMS.set(clean, entry);
  return entry;
}

/** One library item: the bundled one, else an imported one (null when neither exists). Throws ImportedLibraryError (fail closed). */
async function resolveLibraryItemEntry(container, id, deps = {}) {
  const bundled = libraryItemEntry(id);
  if (bundled) return bundled;
  if (!IMPORTED_ID.test(String(id || "").trim())) return null;
  return importedItemEntry(container, id, deps);
}

/** The whole catalog — bundled, then imported — as { value (frozen), etag }. With nothing imported it is the bundled entry itself. */
async function resolveLibraryCatalogEntry(container, deps = {}) {
  const bundled = libraryCatalogEntry();
  const index = await readImportedIndex(container, deps);
  if (!index.items.length) return bundled;
  const rows = index.items.map(catalogMeta);
  return { value: deepFreeze([...bundled.value, ...rows]), etag: etagOf(String(bundled.etag) + "|" + rows.map(r => r.libraryItemId + ":" + r.contentHash).join(",")) };
}

/** The next free id after the index's highest (IMP-001 for the first). */
function nextImportedId(index) {
  let max = 0;
  for (const m of index.items) max = Math.max(max, Number(m.libraryItemId.slice(4)) || 0);
  return "IMP-" + String(max + 1).padStart(3, "0");
}

/**
 * Publishes one prepared item: the item document create-only at its id, THEN its row in the index (compare-and-set). Until the row is
 * written the item does not exist for any reader. Returns:
 *   "published" — listed;
 *   "taken"     — a document already holds this id (the caller tries the next id); nothing written;
 *   "duplicate" — the same exam (contentHash) was listed meanwhile; the document just written is removed (best effort, it is never
 *                 listed either way).
 */
async function publishImportedItem(container, item, deps = {}) {
  const upload = deps.uploadJsonConditional || storage.uploadJsonConditional;
  try { await upload(container, itemName(item.libraryItemId), item, null); }
  catch (e) { if (storage.isConcurrencyConflict(e)) return "taken"; throw e; }
  let outcome = "published";
  // A failed index write leaves the document unlisted (it does not exist for any reader; the next import skips its id as "taken").
  await (deps.mutateJsonWithRetry || storage.mutateJsonWithRetry)(container, INDEX_DOC, current => {
    const doc = JSON.parse(JSON.stringify(parseIndex(current)));
    if (doc.items.some(m => m.libraryItemId === item.libraryItemId || m.contentHash === item.contentHash)) { outcome = "duplicate"; return doc; }
    doc.items.push(catalogMeta(item));
    parseIndex(doc);
    outcome = "published";
    return doc;
  });
  if (outcome === "duplicate") await removeUnlisted(container, item.libraryItemId, deps);
  return outcome;
}
async function removeUnlisted(container, id, deps) {
  try { await (deps.deleteBlob || storage.deleteBlob)(container, itemName(id)); } catch { /* never listed: unreachable either way */ }
}

/** Tests only. */
function resetImportedLibraryCacheForTests() { ITEMS.clear(); }

module.exports = {
  INDEX_DOC, ITEM_PREFIX, IMPORTED_ID, CATEGORY, ImportedLibraryError, itemName, parseIndex, readImportedIndex, catalogMeta,
  importedItemEntry, resolveLibraryItemEntry, resolveLibraryCatalogEntry, nextImportedId, publishImportedItem, resetImportedLibraryCacheForTests
};
