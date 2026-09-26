// Phase 9A — this device's last Reader page, per STUDENT. A tiny UI convenience marker (the exact page to reopen),
// never a canonical store: the server's study document stays the cross-device authority (dashboard.study.lastActivity)
// and the Reader itself validates any page id against the CURRENT released manifest (an unknown / unreleased page
// falls back to the book's first page — the Reader's existing controlled behaviour).
//
// Scope safety: the key carries the student's server-issued userId, and the portal only ever reads the CURRENT
// student's key, so a marker written by one student can never be offered to another on a shared device, and logging
// out and in as someone else starts from that person's own marker (or none). Browser storage can be unavailable
// (private mode, blocked site data): every access is guarded and a failure simply means "no marker".
import type { ReaderPosition } from "./todayPriority";

const PREFIX = "examBankReaderPosition:v1:";
const keyFor = (userId: string) => PREFIX + String(userId || "").trim();

function storage(): Storage | null {
  try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch { return null; }
}

/** The marker of ONE student, or null (none / malformed / storage unavailable / empty userId). */
export function loadReaderPosition(userId: string): ReaderPosition | null {
  if (!String(userId || "").trim()) return null;
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(keyFor(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ReaderPosition> | null;
    if (!v || typeof v.courseId !== "string" || typeof v.pageId !== "string" || !v.courseId || !v.pageId) return null;
    return { courseId: v.courseId, pageId: v.pageId, at: typeof v.at === "string" ? v.at : "" };
  } catch { return null; }
}

/** Remember the page the student is reading now (called from the Reader's own page-change signal). */
export function saveReaderPosition(userId: string, position: { courseId: string; pageId: string }, at: string = new Date().toISOString()): void {
  if (!String(userId || "").trim() || !position.courseId || !position.pageId) return;
  const s = storage();
  if (!s) return;
  try { s.setItem(keyFor(userId), JSON.stringify({ courseId: position.courseId, pageId: position.pageId, at })); } catch { /* storage unavailable: no marker */ }
}

/** Forget one student's marker (e.g. the course is no longer released). */
export function clearReaderPosition(userId: string): void {
  const s = storage();
  if (!s || !String(userId || "").trim()) return;
  try { s.removeItem(keyFor(userId)); } catch { /* ignore */ }
}
