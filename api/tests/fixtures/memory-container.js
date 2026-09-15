// Shared in-memory Azure-blob container mock for handler tests (Roadmap #18/#19/#20).
//
// Implements the subset of the @azure/storage-blob container surface the platform code actually uses:
// getBlobClient(name).download()/deleteIfExists(), getBlockBlobClient(name).upload(body, len, opts) with
// ETag-conditional writes (ifNoneMatch:"*" create-only, ifMatch:<etag> compare-and-set), and an async
// listBlobsFlat({prefix}) iterator. This lets tests drive the REAL handlers + the REAL platform-storage
// optimistic-concurrency helpers (downloadJsonWithEtagOrNull / uploadJsonConditional / mutateJsonWithRetry)
// end-to-end against faithful conflict semantics — proving uniqueness/race behavior, not a stub of it.

function conflict(statusCode, code) {
  const e = new Error(code);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function createMemoryContainer(seed = {}) {
  const store = new Map();           // name -> { content: string, etag: string }
  let counter = 0;
  const nextEtag = () => "etag-" + (++counter);

  function writeRaw(name, content) { store.set(name, { content: String(content), etag: nextEtag() }); }
  // Seed helpers: seed is a { blobName: object } map written as JSON with a fresh etag.
  for (const [name, value] of Object.entries(seed)) writeRaw(name, JSON.stringify(value, null, 2));

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

  return {
    container,
    store,
    setJson(name, value) { writeRaw(name, JSON.stringify(value, null, 2)); },
    getJson(name) { const e = store.get(name); return e ? JSON.parse(e.content) : null; },
    has(name) { return store.has(name); },
    names(prefix = "") { return Array.from(store.keys()).filter(n => n.startsWith(prefix)); }
  };
}

module.exports = { createMemoryContainer };
