// D1 — a device copy of the answers the server has NOT confirmed yet. When the connection drops and the student closes the
// page (or the browser / device restarts), the next open of the SAME live attempt on this device sends them again instead of
// losing them. It is written on every edit, rebased after every confirmed save and removed as soon as nothing is unsent, so it
// only exists while answers are pending.
//
// It is never authority: the server decides whether the attempt is still writable (identity, deadline, canWrite), and a
// restored copy is merged per question against the server draft (mergeStaleDraft) and saved through the ordinary saveDraft
// path. The key carries the student id read from the session token (decoded locally only to separate students on a shared
// device; the server verifies the token on every request). An explicit logout removes every copy on the device.
export type JournalAttempt = { attemptNumber: number; startedAt: string; attemptEpoch?: number } | null;
export type AnswerJournal<A> = {
  v: 1;
  studentId: string;
  assignmentId: string;
  attempt: JournalAttempt;   // modern attempt identity (null for a legacy untimed draft)
  generation: number;        // legacy binding: attemptsUsed when the answers were composed
  base: Record<string, A>;   // the server draft the answers were composed from (merge base)
  answers: Record<string, A>;
  at: number;                // device time of the write — housekeeping only (expiry), never an authority
};

const PREFIX = "examBankAnswerJournal:v1:";
export const JOURNAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const keyOf = (studentId: string, assignmentId: string) => PREFIX + studentId + ":" + assignmentId;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// The session token is base64url(JSON payload) + "." + signature. "" when it cannot be read — no journal is kept then.
export function studentIdFromToken(token: string): string {
  try {
    const part = String(token || "").split(".")[0];
    if (!part) return "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub && !payload.sub.includes(":") ? payload.sub : "";
  } catch { return ""; }
}

export function writeJournal<A>(entry: Omit<AnswerJournal<A>, "v" | "at">): void {
  if (!entry.studentId || !entry.assignmentId) return;
  try { localStorage.setItem(keyOf(entry.studentId, entry.assignmentId), JSON.stringify({ v: 1, ...entry, at: Date.now() })); }
  catch { /* storage full / blocked → the server autosave is the only copy, as before */ }
}

export function readJournal<A>(studentId: string, assignmentId: string): AnswerJournal<A> | null {
  if (!studentId || !assignmentId) return null;
  try {
    const raw = localStorage.getItem(keyOf(studentId, assignmentId));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<AnswerJournal<A>>;
    const attemptOk = j.attempt === null || (isRecord(j.attempt) && typeof j.attempt.attemptNumber === "number" && typeof j.attempt.startedAt === "string");
    const valid = j.v === 1 && j.studentId === studentId && j.assignmentId === assignmentId && attemptOk && typeof j.generation === "number"
      && isRecord(j.base) && isRecord(j.answers) && typeof j.at === "number" && Date.now() - j.at < JOURNAL_TTL_MS;
    if (!valid) { clearJournal(studentId, assignmentId); return null; }
    return j as AnswerJournal<A>;
  } catch { return null; }
}

export function clearJournal(studentId: string, assignmentId: string): void {
  if (!studentId || !assignmentId) return;
  try { localStorage.removeItem(keyOf(studentId, assignmentId)); } catch { /* ignore */ }
}

// Explicit logout: no copy of any student's answers outlives the session on this device.
export function clearAllJournals(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Housekeeping: a copy older than the expiry (any student on this device) is removed. Run when an exam page opens.
export function pruneExpiredJournals(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      let at = NaN;
      try { at = Number((JSON.parse(localStorage.getItem(k) || "null") as { at?: unknown } | null)?.at); } catch { /* unreadable → stale */ }
      if (!(Date.now() - at < JOURNAL_TTL_MS)) stale.push(k);
    }
    stale.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
