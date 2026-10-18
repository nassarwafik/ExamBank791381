// Phase P-2 — a SHORT-LIVED, per-instance cache of the platform's user documents for the Project Tracker's READ views
// (class summary / students / board / analytics and the global ready summary). Owner decision (2026-10-18): each of those
// views used to download EVERY user document of the platform (`platform/users/`) to find one class's members, so a
// teacher moving between the workspace tabs paid the full scan again on every tab.
//
// Contract:
//   • READ VIEWS ONLY. Every write path and every membership gate (service.requireStudentInClass, updateStudentProgress,
//     selfReportStages, …) keeps reading the user document directly — a cached list never authorizes anything.
//   • Membership is still decided from the USER documents (lib/class-membership); the cache only reuses one scan of them.
//   • Bounded staleness: an entry is reused for at most `ttlMs` (default 20 s; env PROJECT_USER_CACHE_TTL_MS, 0 disables).
//     A student added / moved / archived elsewhere appears in these read views within that window.
//   • Concurrent callers share ONE in-flight scan (the dashboard and the students tab opening together cost one scan).
//   • A failed scan is never cached: the entry is dropped and the next caller scans again.
//   • Keyed by the container's storage URL (production clients are rebuilt per request, so object identity would never
//     hit). A container without a URL (in-memory test containers) is NOT cached: those callers always scan, exactly as
//     before this phase.
//   • The returned array is shared between callers within the window: callers must treat it as read-only.
const { listJson } = require("../platform-storage");

const USER_PREFIX = "platform/users/";
const DEFAULT_TTL_MS = 20000;

function ttlFromEnv() {
  const raw = process.env.PROJECT_USER_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
}

/**
 * Creates a cache. `deps` is the test seam: `ttlMs` (number or function), `now` (clock), `scan(container)`.
 * Returns { list(container), invalidate(container?), size() }.
 */
function createUserDirectoryCache(deps = {}) {
  const entries = new Map();                                                  // url → { at, promise }
  const ttl = () => (typeof deps.ttlMs === "function" ? deps.ttlMs() : deps.ttlMs !== undefined ? deps.ttlMs : ttlFromEnv());
  const now = deps.now || (() => Date.now());
  const scan = deps.scan || (container => listJson(container, USER_PREFIX));
  const keyOf = container => (container && typeof container.url === "string" && container.url ? container.url : "");

  function list(container) {
    const key = keyOf(container), ttlMs = ttl();
    if (!key || !(ttlMs > 0)) return scan(container);                          // uncached: no URL, or disabled
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.promise;
    const entry = { at: now(), promise: null };
    entry.promise = Promise.resolve().then(() => scan(container)).catch(e => {
      if (entries.get(key) === entry) entries.delete(key);                     // never cache a failure
      throw e;
    });
    entries.set(key, entry);
    return entry.promise;
  }
  function invalidate(container) {
    if (container === undefined) { entries.clear(); return; }
    const key = keyOf(container);
    if (key) entries.delete(key);
  }
  return { list, invalidate, size: () => entries.size };
}

const shared = createUserDirectoryCache();

module.exports = { createUserDirectoryCache, listUsersForReadViews: c => shared.list(c), invalidateUserDirectory: c => shared.invalidate(c), USER_PREFIX, DEFAULT_TTL_MS };
