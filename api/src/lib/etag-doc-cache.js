// Phase 21H.4 — READ COST of the live dashboard: an in-memory, per-container cache of JSON documents keyed by blob name AND the
// ETag the blob listing reports. The Today hub re-reads every class, user and submission document of the teacher's active
// assignments on every refresh (60 s, per open tab); almost none of them change between two refreshes.
//
// CORRECTNESS BY CONSTRUCTION (the same rule as the 21G.2 summary cache). A cached document is used only when its ETag equals
// the ETag the listing reports for that blob RIGHT NOW — so any change by any writer is downloaded again, and a blob listed
// without an ETag is always downloaded. The cache keeps the document TEXT and parses a fresh object on every hit, so no request
// can see another request's mutation. It is never an authority: an empty or evicted cache only means more downloads.
//
// Bounded: least-recently-used eviction above maxEntries documents or maxBytes of text per container. Keyed by the container
// object (a WeakMap), so two containers (or two test fixtures) never share entries.
const storage = require("./platform-storage");

const DEFAULT_MAX_ENTRIES = 20000;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

function createDocCache({ maxEntries = DEFAULT_MAX_ENTRIES, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  return { maxEntries, maxBytes, byContainer: new WeakMap() };
}
function slot(cache, container) {
  let s = cache.byContainer.get(container);
  if (!s) { s = { map: new Map(), bytes: 0 }; cache.byContainer.set(container, s); }
  return s;
}
function remember(cache, s, name, etag, text) {
  const old = s.map.get(name);
  if (old) { s.bytes -= old.text.length; s.map.delete(name); }
  if (text.length > cache.maxBytes) return;
  s.map.set(name, { etag, text });
  s.bytes += text.length;
  while (s.map.size > cache.maxEntries || s.bytes > cache.maxBytes) {
    const [oldest, entry] = s.map.entries().next().value;
    s.map.delete(oldest); s.bytes -= entry.text.length;
  }
}

/** Every .json blob under `prefix` with the ETag the listing reports (null when the service gives none). */
async function listEntries(container, prefix) {
  const out = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (blob && typeof blob.name === "string" && blob.name.endsWith(".json")) out.push({ name: blob.name, etag: blob.properties && typeof blob.properties.etag === "string" && blob.properties.etag ? blob.properties.etag : null });
  }
  return out;
}

/**
 * The parsed documents under `prefix`, in listing order (a blob deleted between the listing and its download is skipped, as
 * listJson skips it). `cache` null → plain listing + download of everything (the pre-21H.4 behaviour).
 * deps: { listEntries, downloadJsonWithEtagOrNull, mapConcurrent, readConcurrency }.
 * Returns { docs, stats: { listed, cached, downloaded } }.
 */
async function loadJsonDocs(container, prefix, cache, deps = {}) {
  const list = deps.listEntries || listEntries;
  const dl = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const mc = deps.mapConcurrent || storage.mapConcurrent;
  const limit = deps.readConcurrency || storage.getReadConcurrency();
  const entries = await list(container, prefix);
  const s = cache ? slot(cache, container) : null;
  let cached = 0, downloaded = 0;
  const docs = await mc(entries, limit, async ({ name, etag }) => {
    const hit = s && etag ? s.map.get(name) : null;
    if (hit && hit.etag === etag) {
      s.map.delete(name); s.map.set(name, hit);                               // most recently used
      cached++;
      return JSON.parse(hit.text);
    }
    const got = await dl(container, name);
    downloaded++;
    if (got.value === null || got.value === undefined) { if (s && s.map.has(name)) { s.bytes -= s.map.get(name).text.length; s.map.delete(name); } return null; }
    if (s && got.etag) remember(cache, s, name, got.etag, JSON.stringify(got.value));
    return got.value;
  });
  return { docs: docs.filter(d => d !== null && d !== undefined), stats: { listed: entries.length, cached, downloaded } };
}

module.exports = { createDocCache, loadJsonDocs, listEntries, DEFAULT_MAX_ENTRIES, DEFAULT_MAX_BYTES };
