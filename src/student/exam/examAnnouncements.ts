// Phase 21E.3 — what the running exam says through its ONE polite announcer. Pure and React-free.
//
// Timer: the countdown chip is role="timer" (never live). A student who cannot see it is told once when 5 minutes and once when
// 1 minute remain — never every second, never twice for the same threshold of the same attempt (rerenders, resyncs, a
// pause / resume and a reload in the same tab all keep the record). The time itself stays the page's server-anchored value;
// nothing here reads a clock or changes expiry.
//
// Save: the visible save label keeps every state, but only the changes a student must know about are announced: the
// connection was lost, saving failed after the automatic retries, and saving works again after one of those problems. The
// ordinary pending → saving → saved cycle of every edit is silent. «تم حفظ…» is announced only for the "saved" kind, which
// deriveSaveState returns only when the server confirmed the latest revision.
import type { SaveStateKind } from "../../studentSaveState";

export const TIMER_THRESHOLDS_MS = [300_000, 60_000] as const;
/** Review fix 1 — a live region must exist (and be tracked by assistive technology) before its text changes: the first message
 *  waits this long after the announcer is inserted. */
export const ANNOUNCER_SETTLE_MS = 400;
/** A delivered message is cleared after this long, so stale text is not found later in browse mode. */
export const ANNOUNCEMENT_CLEAR_MS = 8_000;
/** A crossing observed within this margin of the threshold is announced as "N minutes remain"; later as "less than N". */
const CROSSING_MARGIN_MS = 5_000;

const TIMER_TEXT: Record<number, { at: string; below: string }> = {
  300_000: { at: "تنبيه: بقيت 5 دقائق على انتهاء وقت المحاولة.", below: "تنبيه: بقي أقل من 5 دقائق على انتهاء وقت المحاولة." },
  60_000: { at: "تنبيه: بقيت دقيقة واحدة على انتهاء وقت المحاولة.", below: "تنبيه: بقي أقل من دقيقة واحدة على انتهاء وقت المحاولة." },
};

/** The announcement for this remaining time, given the thresholds already announced for the attempt, and the thresholds to
 *  record. A jump past both thresholds announces only the lower one (and records both). Nothing at or after expiry. */
export function timerAnnouncement(remainingMs: number, announced: ReadonlySet<number>): { text: string; record: number[] } | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t && !announced.has(t));
  if (!due.length) return null;
  const lowest = Math.min(...due);
  const record = TIMER_THRESHOLDS_MS.filter(t => t >= lowest);
  return { text: remainingMs > lowest - CROSSING_MARGIN_MS ? TIMER_TEXT[lowest].at : TIMER_TEXT[lowest].below, record };
}

const KEY = "examBankTimerNotice:";
/** Per-tab memory of the thresholds announced for one attempt identity (no answers, no tokens — only threshold numbers). */
export function timerNoticeKey(assignmentId: string, attemptNumber: number, startedAt: string): string {
  return KEY + assignmentId + ":" + attemptNumber + ":" + startedAt;
}
export function readTimerNotices(key: string): Set<number> {
  try {
    const raw = sessionStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(v) ? v.filter((n): n is number => (TIMER_THRESHOLDS_MS as readonly number[]).includes(n as number)) : []);
  } catch { return new Set(); }
}
export function writeTimerNotices(key: string, announced: ReadonlySet<number>): void {
  try { sessionStorage.setItem(key, JSON.stringify([...announced])); } catch { /* storage unavailable: memory only */ }
}

/** The announcement for a change of the derived save state. `problemOpen` says a problem (offline / failed) was announced and
 *  not yet resolved; only then is the return to "saved" announced. Every ordinary transition returns text null. */
export function saveAnnouncement(prev: SaveStateKind | null, next: SaveStateKind, problemOpen: boolean): { text: string | null; problemOpen: boolean } {
  if (prev === null || prev === next) return { text: null, problemOpen };
  if (next === "offline") return { text: "انقطع الاتصال — توجد تغييرات لم تصل إلى الخادم. أبقِ الصفحة مفتوحة حتى يعود الاتصال.", problemOpen: true };
  if (next === "error") return { text: "تعذر حفظ التغييرات. أبقِ الصفحة مفتوحة وأعد المحاولة.", problemOpen: true };
  if (next === "saved" && problemOpen) return { text: "تم حفظ إجاباتك على الخادم.", problemOpen: false };
  return { text: null, problemOpen };
}
