// Phase 21H.4 — READ COST of the live dashboard: an in-memory, per-container cache of JSON documents keyed by blob name AND the
// ETag the blob listing reports. The Today hub re-reads every class, user and submission document of the teacher's active
// assignments on every refresh (60 s, per open tab); almost none of them change between two refreshes.
//
// CORRECTNESS BY CONSTRUCTION (the same rule as the 21G.2 summary cache). A cached document is used only when its ETag equals
// the ETag the listing reports for that blob RIGHT NOW — so any change by any writer is downloaded again, and a blob listed
// without an ETag is always downloaded. The cache keeps the document TEXT and parses a fresh object on every hit, so no request
// can see another request's mutation. It is never an authority: an empty or evicted cache only means more downloads.
//
// Bounded: least-recently-used eviction above maxEntries documents or maxBytes of text per container. Phase S.2 — keyed by the
// container's storage URL: production builds a NEW container client for every request (BlobServiceClient.fromConnectionString
// …getContainerClient), so a cache keyed by the client object never hit across two requests. Two clients of the same storage
// share entries (still ETag-verified); another URL never does. A container without a URL (the in-memory test fixtures) keeps
// one slot per object (a WeakMap), so two fixtures never share entries.
const storage = require("./platform-storage");

const DEFAULT_MAX_ENTRIES = 20000;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

function createDocCache({ maxEntries = DEFAULT_MAX_ENTRIES, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  return { maxEntries, maxBytes, byContainer: new WeakMap(), byUrl: new Map() };
}
function slot(cache, container) {
  const url = container && typeof container.url === "string" && container.url ? container.url : "";
  const store = url ? cache.byUrl : cache.byContainer, key = url || container;
  let s = store.get(key);
  if (!s) { s = { map: new Map(), bytes: 0 }; store.set(key, s); }
  return s;
}
// Phase S.2 — one ETag value may be reported quoted ("0x8D…", the HTTP form a download returns) or bare (0x8D…) depending on the
// API that reports it; the comparison is on the value, so a listing and a download of the same version always match.
const tagOf = etag => (typeof etag === "string" && etag ? etag.replace(/^"(.*)"$/, "$1") : null);
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
 * The parsed documents of the given listing ENTRIES ({ name, etag }), aligned with them: null for a blob deleted between the
 * listing and its download. Phase S.2 — lets a caller that selects blobs from a listing by NAME (a student's submissions, a
 * roster's) download only those, through the same ETag check. deps as loadJsonDocs (without listEntries).
 * Returns { docs, stats: { listed, cached, downloaded } }.
 */
async function loadJsonEntries(container, entries, cache, deps = {}) {
  const dl = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const mc = deps.mapConcurrent || storage.mapConcurrent;
  const limit = deps.readConcurrency || storage.getReadConcurrency();
  const s = cache ? slot(cache, container) : null;
  let cached = 0, downloaded = 0;
  const docs = await mc(entries, limit, async ({ name, etag }) => {
    const hit = s && tagOf(etag) ? s.map.get(name) : null;
    if (hit && hit.etag === tagOf(etag)) {
      s.map.delete(name); s.map.set(name, hit);                               // most recently used
      cached++;
      return JSON.parse(hit.text);
    }
    const got = await dl(container, name);
    downloaded++;
    if (got.value === null || got.value === undefined) { if (s && s.map.has(name)) { s.bytes -= s.map.get(name).text.length; s.map.delete(name); } return null; }
    if (s && tagOf(got.etag)) remember(cache, s, name, tagOf(got.etag), JSON.stringify(got.value));
    return got.value;
  });
  return { docs, stats: { listed: entries.length, cached, downloaded } };
}

/**
 * The parsed documents under `prefix`, in listing order (a blob deleted between the listing and its download is skipped, as
 * listJson skips it). `cache` null → plain listing + download of everything (the pre-21H.4 behaviour).
 * deps: { listEntries, downloadJsonWithEtagOrNull, mapConcurrent, readConcurrency }.
 * Returns { docs, stats: { listed, cached, downloaded } }.
 */
async function loadJsonDocs(container, prefix, cache, deps = {}) {
  const list = deps.listEntries || listEntries;
  const r = await loadJsonEntries(container, await list(container, prefix), cache, deps);
  return { docs: r.docs.filter(d => d !== null && d !== undefined), stats: r.stats };
}

module.exports = { createDocCache, loadJsonDocs, loadJsonEntries, listEntries, DEFAULT_MAX_ENTRIES, DEFAULT_MAX_BYTES };
