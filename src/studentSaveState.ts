// Roadmap #10 + #11 — one authoritative, derived SAVE STATE for the student exam page, plus the offline
// connectivity model. Pure and side-effect free so it can be unit-tested exhaustively and shared by the
// render, the beforeunload guard, and the submit gate. The SERVER is always authoritative: a state is
// "saved" ONLY when the server has confirmed the latest local revision — never because a debounce elapsed,
// a fetch started, navigator.onLine is true, or answers exist in memory.

export type SaveStateKind = "saved" | "pending" | "saving" | "retrying" | "offline" | "error";

export interface SaveStateInput {
  localRevision: number;      // the newest local answer revision the student has produced
  savedRevision: number;      // the newest revision the SERVER has confirmed saved
  saving: boolean;            // a saveDraft request for the latest snapshot is in flight
  retrying: boolean;          // a transient (network/5xx) failure occurred and a retry is scheduled
  errorExhausted: boolean;    // the bounded retry policy gave up; the save cannot currently complete
  online: boolean;            // the browser reports connectivity (a HINT only — see the connectivity model)
}

// Derive the single rendering state. Precedence matters: once the latest revision is server-confirmed the
// state is SAVED regardless of any stale flags; while dirty, an in-flight save wins, then offline, then a
// hard error, then a scheduled retry, else plain pending.
export function deriveSaveState(i: SaveStateInput): SaveStateKind {
  if (i.localRevision <= i.savedRevision) return "saved"; // server acknowledged the latest content
  if (i.saving) return "saving";
  if (!i.online) return "offline";
  if (i.errorExhausted) return "error";
  if (i.retrying) return "retrying";
  return "pending";
}

// Compact accessible Arabic label for a state (existing design; no redesign).
export function saveStateLabel(kind: SaveStateKind): string {
  switch (kind) {
    case "saved": return "تم الحفظ";
    case "pending": return "تغييرات غير محفوظة";
    case "saving": return "جارٍ الحفظ...";
    case "retrying": return "تعذر الحفظ — تتم إعادة المحاولة...";
    case "offline": return "غير متصل — توجد تغييرات لم تصل إلى الخادم";
    case "error": return "تعذر حفظ التغييرات";
  }
}

// A short extra hint shown under some states. Empty when none applies.
export function saveStateHint(kind: SaveStateKind): string {
  if (kind === "offline") return "أبقِ الصفحة مفتوحة حتى يعود الاتصال.";
  if (kind === "error") return "أبقِ الصفحة مفتوحة وأعد المحاولة.";
  return "";
}

// A manual "retry save" affordance is offered only when automatic recovery is not currently making progress.
export function canManualRetry(kind: SaveStateKind): boolean {
  return kind === "error" || kind === "offline";
}

// Format a SERVER-provided ISO timestamp as HH:mm:ss (24h, ASCII digits so it is stable across locales).
// Returns "" for an absent/invalid time — the caller must never invent a saved time.
export function formatLastSaved(iso: string | null | undefined): string {
  const s = String(iso || "");
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// The beforeunload guard and the "safe to leave" question use REVISION counters (authoritative), never a
// loose React `dirty` flag: warn iff the newest local revision has not yet been server-confirmed.
export function shouldWarnBeforeUnload(localRevision: number, savedRevision: number): boolean {
  return localRevision > savedRevision;
}
