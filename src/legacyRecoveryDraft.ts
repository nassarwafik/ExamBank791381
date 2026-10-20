// Data-integrity / privacy fix (batch 4, D2) — the legacy builder's local recovery draft (the whole unsaved exam,
// answer keys included) was stored under ONE fixed localStorage key, shared by every teacher using the browser and kept
// after logout. On a shared school computer another teacher was offered it (and could save it as their own), and anyone
// could read the answer key from the browser's storage. The draft is now scoped to the signed-in teacher (the same
// identity the structured builder's backups use) and removed on logout; the old unscoped draft, which cannot be
// attributed to a teacher, is deleted. Every access is best-effort: a blocked storage never breaks the builder.
const PREFIX = "ExamBank791381-Recovery-V2:";
export const LEGACY_RECOVERY_KEY = "ExamBank791381-Recovery-V1";

const safeSegment = (value: string) => encodeURIComponent(value);

/** The draft key of one teacher, or "" when no teacher is known (no draft is read or written then). */
export function recoveryDraftKey(teacherId: string | null | undefined): string {
  const id = String(teacherId || "").trim();
  return id ? PREFIX + safeSegment(id) : "";
}

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function readRecoveryDraft(teacherId: string | null | undefined): string | null {
  const key = recoveryDraftKey(teacherId);
  const s = storage();
  if (!key || !s) return null;
  try { return s.getItem(key); } catch { return null; }
}

export function hasRecoveryDraft(teacherId: string | null | undefined): boolean {
  return Boolean(readRecoveryDraft(teacherId));
}

export function writeRecoveryDraft(teacherId: string | null | undefined, payload: string): boolean {
  const key = recoveryDraftKey(teacherId);
  const s = storage();
  if (!key || !s) return false;
  try { s.setItem(key, payload); return true; } catch { return false; }
}

export function removeRecoveryDraft(teacherId: string | null | undefined): void {
  const key = recoveryDraftKey(teacherId);
  const s = storage();
  if (!key || !s) return;
  try { s.removeItem(key); } catch { /* best-effort */ }
}

/** Deletes the pre-fix draft stored under the shared key (it cannot be attributed to any teacher). */
export function purgeLegacyRecoveryDraft(): void {
  const s = storage();
  if (!s) return;
  try { s.removeItem(LEGACY_RECOVERY_KEY); } catch { /* best-effort */ }
}
