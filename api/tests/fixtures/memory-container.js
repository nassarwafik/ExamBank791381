// Shared in-memory Azure-blob container mock for handler tests (Roadmap #18/#19/#20/#21).
//
// Implements the subset of the @azure/storage-blob container surface the platform code actually uses:
// getBlobClient(name).download()/deleteIfExists(), getBlockBlobClient(name).upload(body, len, opts) with
// ETag-conditional writes (ifNoneMatch:"*" create-only, ifMatch:<etag> compare-and-set), and an async
// listBlobsFlat({prefix}) iterator. This lets tests drive the REAL handlers + the REAL platform-storage
// optimistic-concurrency helpers (downloadJsonWithEtagOrNull / uploadJsonConditional / mutateJsonWithRetry)
// end-to-end against faithful conflict semantics — proving uniqueness/race behavior, not a stub of it.
//
// Roadmap #21: an optional `hooks.beforeConditionalUpload(name, api)` is invoked immediately BEFORE a
// compare-and-set (ifMatch) write's ETag check. A test can use it to inject a CONCURRENT writer (via
// api.setJson) so the pending CAS write observes a changed ETag and conflicts (412), exercising the real
// mutateJsonWithRetry retry loop. The hook must self-limit (e.g. fire once) to avoid an endless conflict.

function conflict(statusCode, code) {
  const e = new Error(code);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function createMemoryContainer(seed = {}, hooks = {}) {
  const store = new Map();           // name -> { content: string, etag: string }
  let counter = 0;
  const nextEtag = () => "etag-" + (++counter);

  function writeRaw(name, content) { store.set(name, { content: String(content), etag: nextEtag() }); }
  function setJson(name, value) { writeRaw(name, JSON.stringify(value, null, 2)); }
  function getJson(name) { const e = store.get(name); return e ? JSON.parse(e.content) : null; }
  function has(name) { return store.has(name); }
  function names(prefix = "") { return Array.from(store.keys()).filter(n => n.startsWith(prefix)); }

  // Seed helpers: seed is a { blobName: object } map written as JSON with a fresh etag.
  for (const [name, value] of Object.entries(seed)) setJson(name, value);

  const api = { store, setJson, getJson, has, names };

  const container = {
    getBlobClient(name) {
      return {
        async download() {
          const entry = store.get(name);
          if (!entry) throw conflict(404, "BlobNotFound");
          return { readableStreamBody: [Buffer.from(entry.content, "utf8")], etag: entry.etag };
        },
        async deleteIfExists() { const had = store.delete(name); return { succeeded: had }; }
      };
    },
    getBlockBlobClient(name) {
      return {
        async upload(body, _length, options = {}) {
          const conditions = options.conditions || {};
          // Fire the concurrency hook right before a CAS write's precondition check, so an injected
          // concurrent write lands "between" this caller's read and its conditional write.
          if (conditions.ifMatch && typeof hooks.beforeConditionalUpload === "function") {
            hooks.beforeConditionalUpload(name, api);
          }
          const existing = store.get(name);
          if (conditions.ifNoneMatch === "*" && existing) throw conflict(409, "BlobAlreadyExists");
          if (conditions.ifMatch && (!existing || existing.etag !== conditions.ifMatch)) throw conflict(412, "ConditionNotMet");
          writeRaw(name, body);
          return { etag: store.get(name).etag };
        }
      };
    },
    async *listBlobsFlat({ prefix }) {
      for (const name of Array.from(store.keys())) if (name.startsWith(prefix)) yield { name };
    }
  };

  return { container, ...api };
}

module.exports = { createMemoryContainer };
