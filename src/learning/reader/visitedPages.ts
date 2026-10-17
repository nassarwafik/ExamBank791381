// Phase 21E L2-B — device-local "visited" marks for the Reader's table of contents (students only).
//
// A small per-device convenience, never an authority: reading progress on the server is L4's job. The marks are keyed
// by an opaque SCOPE the host supplies — the student portal passes the authenticated student's server-issued userId —
// and by the course, so one student's marks are never shown to another student on a shared device. No scope (teacher
// preview, a reader with no identity) → nothing is read or written and no marks are shown.
//
// Restricted-content safety: the store holds page ids only (never titles). The TOC renders a mark only for a page that
// is in the CURRENT manifest — for a student that manifest is already filtered to the class's published modules — so a
// stored id of an unpublished or since-hidden page is never displayed and never names anything.
//
// Browser storage can be unavailable (private mode, blocked site data) or hold malformed data: every access is guarded,
// and a failure simply means "no marks".

const PREFIX = "eb.learning.visited.v1:";
const MAX_IDS = 2000;
const MAX_ID_LENGTH = 160;

const keyFor = (scope: string, courseId: string) => PREFIX + scope + ":" + courseId;
const usable = (scope: string | undefined, courseId: string): scope is string => !!String(scope || "").trim() && !!courseId;

function storage(): Storage | null {
  try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch { return null; }
}

/** The page ids this scope has opened in this course on this device (empty when there is no scope or no storage). */
export function loadVisitedPages(scope: string | undefined, courseId: string): ReadonlySet<string> {
  if (!usable(scope, courseId)) return new Set();
  const s = storage();
  if (!s) return new Set();
  try {
    const raw = s.getItem(keyFor(scope, courseId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH).slice(-MAX_IDS));
  } catch { return new Set(); }
}

/** Persist the set for this scope + course. No scope or no storage → a no-op. */
export function saveVisitedPages(scope: string | undefined, courseId: string, ids: ReadonlySet<string>): void {
  if (!usable(scope, courseId)) return;
  const s = storage();
  if (!s) return;
  try { s.setItem(keyFor(scope, courseId), JSON.stringify([...ids].slice(-MAX_IDS))); } catch { /* storage full / unavailable: marks stay for this view only */ }
}

// ── A tiny external store over the same storage, read by the Reader with useSyncExternalStore ─────────────────────────
// The Reader records a visit from an effect once a page's CONTENT is ready (never on selection alone — a page whose
// module is still loading, failed or is unavailable is not "visited"). Writing to this store instead of React state
// keeps that effect free of setState; the snapshot is re-derived from the stored string, so it also follows a reset of
// storage, and stays referentially stable while nothing changed.
const EMPTY: ReadonlySet<string> = new Set();
// `raw`: the stored string, null when absent, undefined when storage cannot be read (blocked) — then the marks recorded
// in this session stay in memory only.
const snapshots = new Map<string, { raw: string | null | undefined; ids: ReadonlySet<string> }>();
const listeners = new Set<() => void>();

function rawFor(scope: string, courseId: string): string | null | undefined {
  const s = storage();
  if (!s) return undefined;
  try { return s.getItem(keyFor(scope, courseId)); } catch { return undefined; }
}

/** Stable snapshot of the visited ids for this scope + course (the empty set without a scope). */
export function visitedSnapshot(scope: string | undefined, courseId: string): ReadonlySet<string> {
  if (!usable(scope, courseId)) return EMPTY;
  const key = keyFor(scope, courseId);
  const raw = rawFor(scope, courseId);
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.ids;
  const ids = raw === undefined ? (cached?.ids ?? EMPTY) : raw === null ? EMPTY : loadVisitedPages(scope, courseId);
  snapshots.set(key, { raw, ids });
  return ids;
}

export function subscribeVisited(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Record one page as visited (no scope → no-op). Persists and notifies subscribers; storage failures keep the mark in memory. */
export function recordVisited(scope: string | undefined, courseId: string, pageId: string): void {
  if (!usable(scope, courseId) || !pageId) return;
  const current = visitedSnapshot(scope, courseId);
  if (current.has(pageId)) return;
  const next = new Set(current).add(pageId);
  saveVisitedPages(scope, courseId, next);
  snapshots.set(keyFor(scope, courseId), { raw: rawFor(scope, courseId), ids: next });
  listeners.forEach(l => l());
}

/** Phase L.3 — merge the pages the SERVER knows this student has read (any device) into this device's marks, in one write.
 *  Union only: a mark recorded here is never removed by a server read. No scope → no-op. */
export function mergeVisited(scope: string | undefined, courseId: string, pageIds: readonly string[]): void {
  if (!usable(scope, courseId)) return;
  const current = visitedSnapshot(scope, courseId);
  const fresh = pageIds.filter(id => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH && !current.has(id));
  if (fresh.length === 0) return;
  const next = new Set([...current, ...fresh]);
  saveVisitedPages(scope, courseId, next);
  snapshots.set(keyFor(scope, courseId), { raw: rawFor(scope, courseId), ids: next });
  listeners.forEach(l => l());
}
