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

/** True when `err` is a stale dynamic-import / chunk-load failure (Vite/Rollup or Webpack shapes), not a normal error. */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  if (name === "ChunkLoadError") return true;                       // Webpack-style
  return (
    // Vite / native ESM dynamic-import failures
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||           // Safari
    /failed to import/i.test(message) ||
    /loading chunk [\d]+ failed/i.test(message) ||                  // Webpack-style message
    /loading css chunk/i.test(message)
  );
}

function readMarker(key: string): boolean {
  try { return sessionStorage.getItem(MARKER_PREFIX + key) === "1"; } catch { return false; }
}
function setMarker(key: string): void {
  try { sessionStorage.setItem(MARKER_PREFIX + key, "1"); } catch { /* storage may be unavailable */ }
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
        // Only a genuine stale-chunk failure, and only if we have not already tried, triggers the one reload.
        if (isChunkLoadError(err) && !readMarker(key)) {
          setMarker(key);
          reloadOnce();
          // Keep the caller suspended (never resolve/reject) while the controlled reload happens, so React does
          // not fall through to the error path before navigation completes.
          return new Promise<T>(() => {});
        }
        // Non-chunk error, or the reload already happened and it STILL fails → surface honestly (no loop).
        throw err;
      },
    );
}
