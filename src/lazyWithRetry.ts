// Production resilience — deployment (stale dynamic-import chunk) recovery for React.lazy factories.
//
// PROBLEM: the app is code-split, and Vite gives every lazy chunk a content-hashed filename
// (StudentReader-<hash>.js, LearningReaderWithTraining-<hash>.js, module bodies, …). When a NEW version is
// deployed, those filenames change. A browser tab that was OPENED BEFORE the deploy still holds the OLD main
// bundle, whose dynamic import() points at an OLD chunk URL that no longer exists on the server. Opening a
// lazy view then fails the import → React.lazy rejects → the global ErrorBoundary shows a fatal screen.
//
// FIX: wrap a lazy factory with a ONE-SHOT, bounded recovery. On a genuine chunk-load / dynamic-import failure
// (never on an ordinary runtime error) we do exactly one controlled full reload — which fetches the fresh
// index.html and the current chunk names — guarded by a harmless one-shot marker in sessionStorage so a truly
// broken deploy can NEVER loop. A successful import clears the marker (so a future deploy can recover again).
// A non-chunk error, or a chunk error when recovery was already attempted, is rethrown so it surfaces honestly.
//
// The marker stores only a boolean-ish "1" keyed by a stable component key — NEVER credentials, tokens or PII.

const MARKER_PREFIX = "examBankChunkReload:";

/**
 * True when `err` is a stale dynamic-import / chunk-load failure (Vite/Rollup or Webpack shapes), not a normal error.
 *
 * The signatures are kept PRECISE on purpose. A broad phrase like "failed to import" would misclassify ordinary
 * application errors (e.g. `Error("Failed to import student data")`) as deploy mismatches and trigger a reload,
 * masking a real bug. The native Vite/ESM dynamic-import failures are additionally required to carry the TypeError
 * shape the browser actually throws, so an application Error whose text merely resembles one of these phrases is
 * NOT treated as a chunk failure.
 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  // Webpack-style: an explicit error class, or a precise numbered "loading chunk N failed" / CSS-chunk message.
  if (name === "ChunkLoadError") return true;
  if (/loading chunk [\d]+ failed/i.test(message)) return true;
  if (/loading css chunk [\w\d]+ failed/i.test(message)) return true;
  // Native Vite / ESM dynamic-import failures — thrown by the browser as a TypeError with one of these exact
  // messages. Requiring the TypeError shape avoids false positives from same-worded application errors.
  if (name === "TypeError" && (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)              // Safari
  )) return true;
  return false;
}

/**
 * Atomically acquire the SINGLE reload permit for `key`. Returns true only for the one call allowed to reload:
 * the marker was not already present, it could be persisted, AND it read back as persisted. If sessionStorage is
 * unavailable, throws, or the write cannot be verified, returns false — so the caller must NOT auto-reload and
 * instead lets the chunk error surface to the ErrorBoundary's manual recovery UI. This is what prevents an
 * infinite reload loop when storage silently fails to keep the one-shot marker.
 */
function acquireReloadPermit(key: string): boolean {
  const k = MARKER_PREFIX + key;
  try {
    if (sessionStorage.getItem(k) === "1") return false;  // a reload was already attempted → never loop
    sessionStorage.setItem(k, "1");
    return sessionStorage.getItem(k) === "1";             // proceed only if the marker truly persisted
  } catch {
    return false;                                         // storage unavailable/throwing → never auto-reload
  }
}
/** Clear a recovery marker (exported for tests + explicit success paths). */
export function clearChunkRecoveryMarker(key: string): void {
  try { sessionStorage.removeItem(MARKER_PREFIX + key); } catch { /* storage may be unavailable */ }
}

/** Perform the single controlled reload. Split out so tests can stub it without a real navigation. */
function reloadOnce(): void {
  try { window.location.reload(); } catch { /* non-browser env */ }
}

/**
 * Wrap a dynamic-import factory so React.lazy(...) recovers ONCE from a stale-chunk deploy mismatch.
 * `key` must be stable per lazy component (used only for the one-shot marker).
 */
export function lazyWithRetry<T>(factory: () => Promise<T>, key: string): () => Promise<T> {
  return () =>
    factory().then(
      mod => {
        // A successful import means we are on a consistent version again — allow future deploys to recover.
        clearChunkRecoveryMarker(key);
        return mod;
      },
      (err: unknown) => {
        // Only a genuine stale-chunk failure triggers a reload, and only when we can atomically acquire the ONE
        // reload permit (marker not already set AND it persisted). If storage cannot hold the marker, the permit
        // is denied and we rethrow instead of reloading — so a broken/unavailable storage can NEVER loop.
        if (isChunkLoadError(err) && acquireReloadPermit(key)) {
          reloadOnce();
          // Keep the caller suspended (never resolve/reject) while the controlled reload happens, so React does
          // not fall through to the error path before navigation completes.
          return new Promise<T>(() => {});
        }
        // Non-chunk error, the reload already happened, or the permit could not be persisted → surface honestly.
        throw err;
      },
    );
}
