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
  const leaseTails = new Map();      // blob name -> promise chain of lease holders

  // Content is kept as a Buffer so binary blobs (profile images) round-trip byte-exact; JSON helpers decode UTF-8.
  function writeRaw(name, content, contentType) { store.set(name, { content: Buffer.isBuffer(content) ? Buffer.from(content) : Buffer.from(String(content), "utf8"), etag: nextEtag(), contentType: contentType || "" }); }
  function setJson(name, value) { writeRaw(name, JSON.stringify(value, null, 2)); }
  function getJson(name) { const e = store.get(name); return e ? JSON.parse(e.content.toString("utf8")) : null; }
  function getBinary(name) { const e = store.get(name); return e ? { buffer: Buffer.from(e.content), contentType: e.contentType } : null; }
  function has(name) { return store.has(name); }
  function names(prefix = "") { return Array.from(store.keys()).filter(n => n.startsWith(prefix)); }

  // Seed helpers: seed is a { blobName: object } map written as JSON with a fresh etag.
  for (const [name, value] of Object.entries(seed)) setJson(name, value);

  const api = { store, setJson, getJson, getBinary, has, names };

  const container = {
    getBlobClient(name) {
      return {
        async download() {
          const entry = store.get(name);
          if (!entry) throw conflict(404, "BlobNotFound");
          return { readableStreamBody: [Buffer.from(entry.content)], etag: entry.etag, contentType: entry.contentType || undefined };
        },
        // Phase 15A — honours an If-Match condition like Azure: a changed ETag is a 412 ConditionNotMet, never a silent delete.
        async deleteIfExists(options = {}) {
          const ifMatch = options && options.conditions && options.conditions.ifMatch;
          const existing = store.get(name);
          if (ifMatch && existing && existing.etag !== ifMatch) throw conflict(412, "ConditionNotMet");
          const had = store.delete(name); return { succeeded: had };
        },
        // In-process queuing lease (credential / assignment locks): acquireLease waits for the previous holder of the
        // same blob (models Azure mutual exclusion deterministically), releaseLease frees the next waiter.
        getBlobLeaseClient() {
          let release;
          return {
            async acquireLease() { const prev = leaseTails.get(name) || Promise.resolve(); const gate = new Promise(r => { release = r; }); leaseTails.set(name, prev.then(() => gate)); await prev; },
            async releaseLease() { if (release) release(); }
          };
        }
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
          writeRaw(name, body, options.blobHTTPHeaders && options.blobHTTPHeaders.blobContentType);
          return { etag: store.get(name).etag };
        }
      };
    },
    // Phase 17D-A — like Azure, listBlobsFlat() returns an async-iterable that ALSO exposes .byPage({ continuationToken,
    // maxPageSize }): pages in lexicographic name order with an opaque continuation token ("" / undefined at the end). An
    // unknown / tampered token is rejected the way the service rejects it (400 InvalidQueryParameterValue). The plain
    // `for await` iteration used by every existing caller is unchanged.
    listBlobsFlat({ prefix } = {}) {
      const matching = () => Array.from(store.keys()).filter(n => n.startsWith(prefix || "")).sort();
      return {
        async *[Symbol.asyncIterator]() { for (const name of Array.from(store.keys())) if (name.startsWith(prefix || "")) yield { name }; },
        byPage({ continuationToken, maxPageSize } = {}) {
          return (async function* pages() {
            let after = null;
            if (continuationToken) {
              const raw = Buffer.from(String(continuationToken), "base64").toString("utf8");
              if (!raw.startsWith("mc1:")) throw conflict(400, "InvalidQueryParameterValue");
              after = raw.slice(4);
            }
            const size = Math.max(1, Math.min(5000, Number(maxPageSize) || 5000));
            let rest = matching().filter(n => after === null || n > after);
            for (;;) {
              const page = rest.slice(0, size);
              rest = rest.slice(size);
              const next = rest.length ? Buffer.from("mc1:" + page[page.length - 1], "utf8").toString("base64") : "";
              if (typeof hooks.onListPage === "function") hooks.onListPage(page.length);
              yield { segment: { blobItems: page.map(name => ({ name })) }, continuationToken: next };
              if (!rest.length) return;
            }
          })();
        }
      };
    }
  };

  return { container, ...api };
}

module.exports = { createMemoryContainer };
