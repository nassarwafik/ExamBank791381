// Phase 13A — LOCAL autosave backup of the teacher's unsaved Structured Exam Builder work.
//
// This is a RECOVERY hint only. It never changes the server persistence contract (save-exam-artifact stays the sole
// authority), it is never applied silently (the teacher decides: restore / discard), and it is scoped to
// (teacher-safe namespace, exam id) so a backup of exam A can never be offered for exam B nor to another teacher on the
// same device. The payload is {schemaVersion, scope, examId, savedAt, exam} — the exam only: never tokens or secrets.
// Every storage access is wrapped: a private window, blocked storage or a quota error degrades to "no backup".
import { isStructuredExam, type StructuredExam } from "./examTypes";
import { examDeepEqual } from "./examHistory";

export const AUTOSAVE_SCHEMA_VERSION = 1;
const PREFIX = "eb-sb-backup:v" + AUTOSAVE_SCHEMA_VERSION + ":";

/** The subset of the Web Storage API this module uses (localStorage in the browser; injectable for tests). */
export type BackupStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export type ExamBackup = { exam: StructuredExam; savedAt: string };

const safeSegment = (v: string) => encodeURIComponent(String(v || ""));
export function autosaveKey(scope: string, examId: string): string { return PREFIX + safeSegment(scope) + ":" + safeSegment(examId); }

/** The browser's localStorage, or null when unavailable (SSR, blocked, private mode that throws on access). */
export function browserBackupStorage(): BackupStorage | null {
  try { const s = (globalThis as { localStorage?: BackupStorage }).localStorage; return s && typeof s.getItem === "function" ? s : null; } catch { return null; }
}

/** Write (or overwrite) the backup. Returns false when storage is unavailable or refuses (quota) — never throws. */
export function writeExamBackup(storage: BackupStorage | null | undefined, scope: string, exam: StructuredExam, savedAt: string): boolean {
  if (!storage || !exam || !isStructuredExam(exam)) return false;
  try {
    storage.setItem(autosaveKey(scope, exam.examId), JSON.stringify({ schemaVersion: AUTOSAVE_SCHEMA_VERSION, scope, examId: exam.examId, savedAt, exam }));
    return true;
  } catch { return false; }
}

/** Read + validate the backup for exactly (scope, examId). Anything malformed is dropped and reported as absent. */
export function readExamBackup(storage: BackupStorage | null | undefined, scope: string, examId: string): ExamBackup | null {
  if (!storage) return null;
  const key = autosaveKey(scope, examId);
  let raw: string | null = null;
  try { raw = storage.getItem(key); } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { schemaVersion?: unknown; scope?: unknown; examId?: unknown; savedAt?: unknown; exam?: unknown } | null;
    const ok = !!v && typeof v === "object" && !Array.isArray(v)
      && v.schemaVersion === AUTOSAVE_SCHEMA_VERSION && v.scope === scope && v.examId === examId
      && typeof v.savedAt === "string" && v.savedAt.length > 0
      && isStructuredExam(v.exam) && (v.exam as StructuredExam).examId === examId;
    if (ok) return { exam: v!.exam as StructuredExam, savedAt: v!.savedAt as string };
  } catch { /* corrupt → fall through and drop it */ }
  try { storage.removeItem(key); } catch { /* ignore */ }
  return null;
}

export function clearExamBackup(storage: BackupStorage | null | undefined, scope: string, examId: string): void {
  if (!storage) return;
  try { storage.removeItem(autosaveKey(scope, examId)); } catch { /* ignore */ }
}

/**
 * Offer recovery only for the SAME exam, when the backup is NEWER than the opened copy (its updatedAt, when known)
 * and actually differs from it. Same content or an older backup is stale noise: it is not offered.
 */
export function isRecoveryCandidate(backup: ExamBackup | null | undefined, opened: StructuredExam): boolean {
  if (!backup || backup.exam.examId !== opened.examId) return false;
  const openedAt = Date.parse(opened.updatedAt || "");
  const backupAt = Date.parse(backup.savedAt);
  if (!Number.isFinite(backupAt)) return false;
  if (Number.isFinite(openedAt) && backupAt <= openedAt) return false;
  return !examDeepEqual(backup.exam, opened);
}
