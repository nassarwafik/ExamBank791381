// Phase 12E-A — physical storage-operation counter for READ-COST tests.
//
// Wraps the REAL in-memory blob container (tests/fixtures/memory-container.js) — the same surface platform-storage
// drives in production (listBlobsFlat / getBlobClient().download() / deleteIfExists() / getBlockBlobClient().upload())
// — and records every operation by its EXACT blob name / listing prefix. Nothing is mocked: the handler still lists,
// downloads and writes through the real container; this only observes. Same style as the R25 roster-index guard.
//
// A 404 download is still one storage round trip, so it is counted (e.g. a missing submission document).

function instrumentReadCost(container) {
  const ops = { lists: [], downloads: [], uploads: [], deletes: [] };

  const origList = container.listBlobsFlat.bind(container);
  container.listBlobsFlat = function (opts) { ops.lists.push(String((opts && opts.prefix) || "")); return origList(opts); };

  const origGet = container.getBlobClient.bind(container);
  container.getBlobClient = name => {
    const client = origGet(name);
    const download = client.download.bind(client), del = client.deleteIfExists.bind(client);
    client.download = async (...args) => { ops.downloads.push(name); return download(...args); };
    client.deleteIfExists = async (...args) => { ops.deletes.push(name); return del(...args); };
    return client;
  };

  const origBlock = container.getBlockBlobClient.bind(container);
  container.getBlockBlobClient = name => {
    const client = origBlock(name);
    const upload = client.upload.bind(client);
    client.upload = async (...args) => { ops.uploads.push(name); return upload(...args); };
    return client;
  };

  const count = (arr, pred) => arr.filter(pred).length;
  return {
    ops,
    /** Listings whose prefix is EXACTLY `prefix`. */
    listsOf: prefix => count(ops.lists, p => p === prefix),
    /** Listings whose prefix starts with `prefix` (e.g. every submission-folder listing). */
    listsUnder: prefix => count(ops.lists, p => p.startsWith(prefix)),
    /** Downloads of blobs whose name starts with `prefix`. */
    downloadsOf: prefix => count(ops.downloads, n => n.startsWith(prefix)),
    /** Downloads of exactly this blob. */
    downloadsExact: name => count(ops.downloads, n => n === name),
    uploadsOf: prefix => count(ops.uploads, n => n.startsWith(prefix)),
    deletesOf: prefix => count(ops.deletes, n => n.startsWith(prefix)),
    /** Totals + copies of the raw operation logs. */
    snapshot: () => ({
      lists: ops.lists.length, downloads: ops.downloads.length, uploads: ops.uploads.length, deletes: ops.deletes.length,
      log: { lists: ops.lists.slice(), downloads: ops.downloads.slice(), uploads: ops.uploads.slice(), deletes: ops.deletes.slice() }
    }),
    /** Forget everything recorded so far (measure one request only). */
    reset: () => { ops.lists.length = 0; ops.downloads.length = 0; ops.uploads.length = 0; ops.deletes.length = 0; }
  };
}

module.exports = { instrumentReadCost };
