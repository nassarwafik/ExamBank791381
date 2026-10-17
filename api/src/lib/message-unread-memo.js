// Messages M.3 — READ COST of the unread badges. The teacher's «الرسائل» badge (every open teacher tab, every 15 s) and the
// student's badge recomputed every conversation from scratch: one marker download per conversation on the platform, one
// user download per conversation the teacher had not marked (every other tenant's students), and up to ~100 unread
// candidate downloads per stream, on every poll, although almost nothing changes between two polls.
//
// This module is an in-memory, per-container MEMO, CORRECT BY CONSTRUCTION in the same way as the 21G.2 / 21H.4 caches:
//   • documents (messages, user documents) are reused only while the ETag the LISTING reports right now equals the ETag
//     they were downloaded with — any change by any writer (including an old Phase 5C writer) is downloaded again;
//   • a stream's unread count is reused only while BOTH the stream's listing signature (every listed name + ETag) and
//     the reader's marker ETag (from a listing of the reader's markers) are unchanged — a new message, a deleted one or a
//     moved read boundary always recomputes. Nothing is time-based and nothing is trusted that the listing did not
//     confirm in this request, so a memo can never hide a message: the worst case is the cost before M.3.
// It is never an authority: an empty or evicted memo only means more downloads. Bounded (LRU) per container; keyed by
// the container object (a WeakMap), so two containers (or two test fixtures) never share entries.
const crypto = require("crypto");
const { downloadJsonWithEtagOrNull, mapConcurrent, getReadConcurrency } = require("./platform-storage");

const MAX_DOCS = 50000;
const MAX_DOC_BYTES = 64 * 1024 * 1024;
const MAX_COUNTS = 50000;

function createUnreadMemo({ maxDocs = MAX_DOCS, maxDocBytes = MAX_DOC_BYTES, maxCounts = MAX_COUNTS } = {}) {
  return { maxDocs, maxDocBytes, maxCounts, byContainer: new WeakMap() };
}
/** The process-wide memo used by the routes (one per Functions instance). */
const sharedMemo = createUnreadMemo();

function slot(memo, container) {
  let s = memo.byContainer.get(container);
  if (!s) { s = { docs: new Map(), bytes: 0, counts: new Map() }; memo.byContainer.set(container, s); }
  return s;
}
function touch(map, key, value) { map.delete(key); map.set(key, value); }

/** Every .json blob under `prefix` with the ETag the listing reports (null when the service gives none). */
async function listEntries(container, prefix) {
  const out = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    if (blob && typeof blob.name === "string" && blob.name.endsWith(".json")) out.push({ name: blob.name, etag: blob.properties && typeof blob.properties.etag === "string" && blob.properties.etag ? blob.properties.etag : null });
  }
  return out;
}

/** name → ETag of a listing. */
function etagMap(entries) {
  const m = new Map();
  for (const e of entries) m.set(e.name, e.etag);
  return m;
}

/** A stable signature of a set of listed blobs (names + ETags); "" never matches (a blob without an ETag → no reuse). */
function listingSignature(entries) {
  if (entries.some(e => !e.etag)) return "";
  const h = crypto.createHash("sha256");
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) h.update(e.name + "\n" + e.etag + "\n");
  return h.digest("hex");
}

/**
 * A downloadManyJson-compatible loader (aligned with `names`, null for missing / unparsable) that reuses a document while
 * the ETag `etags` (a listing taken in this request) reports for it is the one it was downloaded with.
 */
function cachedLoader(memo, container, etags, deps = {}) {
  const s = slot(memo, container);
  const dl = deps.downloadJsonWithEtagOrNull || downloadJsonWithEtagOrNull;
  return async (_c, names, limit) => mapConcurrent(names, limit || getReadConcurrency(), async name => {
    const listed = etags.get(name) || null;
    const hit = listed ? s.docs.get(name) : null;
    if (hit && hit.etag === listed) { touch(s.docs, name, hit); return JSON.parse(hit.text); }
    let got;
    try { got = await dl(container, name); }
    catch (e) { if (e instanceof SyntaxError) return null; throw e; }        // one unparsable blob reads as missing (M.1)
    if (got.value === null || got.value === undefined) { const old = s.docs.get(name); if (old) { s.bytes -= old.text.length; s.docs.delete(name); } return null; }
    if (got.etag) {
      const text = JSON.stringify(got.value);
      const old = s.docs.get(name);
      if (old) { s.bytes -= old.text.length; s.docs.delete(name); }
      if (text.length <= memo.maxDocBytes) {
        s.docs.set(name, { etag: got.etag, text }); s.bytes += text.length;
        while (s.docs.size > memo.maxDocs || s.bytes > memo.maxDocBytes) {
          const [oldest, entry] = s.docs.entries().next().value;
          s.docs.delete(oldest); s.bytes -= entry.text.length;
        }
      }
    }
    return got.value;
  });
}

/** The memoized result for `key` while `signature` is unchanged, else null. */
function memoGet(memo, container, key, signature) {
  if (!signature) return null;
  const s = slot(memo, container);
  const hit = s.counts.get(key);
  if (!hit || hit.signature !== signature) return null;
  touch(s.counts, key, hit);
  return hit.value;
}
function memoSet(memo, container, key, signature, value) {
  if (!signature) return;
  const s = slot(memo, container);
  touch(s.counts, key, { signature, value });
  while (s.counts.size > memo.maxCounts) s.counts.delete(s.counts.keys().next().value);
}

module.exports = { createUnreadMemo, sharedMemo, listEntries, etagMap, listingSignature, cachedLoader, memoGet, memoSet };
