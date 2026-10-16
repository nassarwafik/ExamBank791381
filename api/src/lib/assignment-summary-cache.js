// Phase 21G.2 — the LIGHT assignment list: the teacher's list no longer downloads every assignment document (exam snapshots
// included) of every teacher on every page load.
//
//   platform/assignment-index/summary-cache.json = { schemaVersion, summaryVersion, entries: { <assignmentId>: { etag, summary } } }
//
// CORRECTNESS BY CONSTRUCTION. A summary is used only when the ETag it was computed from equals the ETag the blob listing reports
// for that assignment document RIGHT NOW (Azure returns each blob's ETag with the listing, so one listing call proves which cached
// summaries are current). Any other document — new, changed by any writer (this code, an older build, a script), or listed without
// an ETag — is downloaded and summarized exactly as before. So no write path needs to know the cache exists, nothing can drift, and a
// mixed-version deployment is safe. The cache is never an authority: a missing, malformed, outdated or unreadable cache only means
// more downloads, and a failed cache write only means the next list downloads again.
//
// Cost in steady state: one paginated listing of the assignment prefix + one cache read (+ the changed documents). The cache holds
// list summaries only (no questions, answers or marks per question); it is read server-side and never returned as such.
const storage = require("./platform-storage");

const CACHE_NAME = "platform/assignment-index/summary-cache.json";
const SCHEMA_VERSION = 1;

/** Every .json blob under `prefix` with the ETag the listing reports (null when the service gives none). */
async function listBlobEntries(container, prefix) {
  const out = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (blob && typeof blob.name === "string" && blob.name.endsWith(".json")) out.push({ name: blob.name, etag: blob.properties && typeof blob.properties.etag === "string" && blob.properties.etag ? blob.properties.etag : null });
  }
  return out;
}

/**
 * The list summaries of every document under `prefix`, in listing order.
 *   summarize(doc) → summary            the caller's projection (pure)
 *   summaryVersion                      bump when the projection changes: an older cache is then ignored as a whole
 *   isDocument(doc) → boolean           which downloaded documents count (others are skipped, as listJson skips nulls)
 * deps: { listBlobEntries, downloadJsonWithEtagOrNull, uploadJsonConditional, mapConcurrent, readConcurrency, onCacheError }
 * Returns { summaries, stats: { listed, cached, downloaded, cacheWritten } }.
 */
async function loadAssignmentSummaries(container, { prefix, summarize, summaryVersion, isDocument = d => !!d && typeof d === "object" }, deps = {}) {
  const list = deps.listBlobEntries || listBlobEntries;
  const dl = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const up = deps.uploadJsonConditional || storage.uploadJsonConditional;
  const each = deps.mapConcurrent || storage.mapConcurrent;
  const limit = deps.readConcurrency || storage.getReadConcurrency();
  const [entries, cached] = await Promise.all([list(container, prefix), readCache(container, dl, summaryVersion, deps)]);
  const idOf = name => name.slice(prefix.length, -".json".length);
  const next = {};
  const stale = [];
  for (const e of entries) {
    const id = idOf(e.name), hit = cached.entries[id];
    if (e.etag && hit && hit.etag === e.etag && hit.summary && typeof hit.summary === "object") next[id] = hit;
    else stale.push(e);
  }
  const fresh = await each(stale, limit, async e => ({ e, r: await dl(container, e.name) }));
  for (const { e, r } of fresh) {
    if (!isDocument(r.value)) continue;
    // The ETag of the version actually summarized (it may be newer than the listing's; the next list re-checks it).
    next[idOf(e.name)] = { etag: r.etag || null, summary: summarize(r.value) };
  }
  const summaries = [];
  for (const e of entries) { const hit = next[idOf(e.name)]; if (hit) summaries.push(hit.summary); }
  // Write back only when something changed (a new / changed document, or a removed one pruned) — best-effort, conditional.
  const pruned = Object.keys(cached.entries).some(id => !next[id]);
  let cacheWritten = false;
  if (stale.length || pruned || cached.outdated) {
    const keep = {};
    for (const [id, v] of Object.entries(next)) if (v.etag) keep[id] = v;
    try { await up(container, CACHE_NAME, { schemaVersion: SCHEMA_VERSION, summaryVersion, entries: keep }, cached.etag); cacheWritten = true; }
    catch (err) { if (typeof deps.onCacheError === "function") { try { deps.onCacheError(err); } catch { /* never fail a read */ } } }
  }
  return { summaries, stats: { listed: entries.length, cached: entries.length - stale.length, downloaded: stale.length, cacheWritten } };
}

async function readCache(container, dl, summaryVersion, deps) {
  try {
    const { value, etag } = await dl(container, CACHE_NAME);
    const ok = value && value.schemaVersion === SCHEMA_VERSION && value.summaryVersion === summaryVersion && value.entries && typeof value.entries === "object";
    return { entries: ok ? value.entries : {}, etag: etag || null, outdated: !!value && !ok };
  } catch (err) {
    if (typeof deps.onCacheError === "function") { try { deps.onCacheError(err); } catch { /* never fail a read */ } }
    return { entries: {}, etag: null, outdated: false, unreadable: true };
  }
}

module.exports = { loadAssignmentSummaries, listBlobEntries, CACHE_NAME };
