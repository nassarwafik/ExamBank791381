// Phase 7A strict mode — a best-effort, PER-TAB marker of a strict-exit request that was sent while the exam page was
// going away (visibilitychange→hidden / pagehide / unmount). If that keepalive request was lost, the NEXT load of the
// same exam in this tab finalizes the SAME attempt before any question is shown again. It stores ONLY the attempt
// identity {attemptNumber, startedAt, attemptEpoch} — never answers, never tokens — and the server re-validates it.
export type StrictExitIdentity = { attemptNumber: number; startedAt: string; attemptEpoch?: number };

const KEY = "examBankStrictExit:";

export function rememberStrictExit(assignmentId: string, identity: StrictExitIdentity | null): void {
  if (!identity) return;
  try { sessionStorage.setItem(KEY + assignmentId, JSON.stringify({ attemptNumber: identity.attemptNumber, startedAt: identity.startedAt, ...(typeof identity.attemptEpoch === "number" ? { attemptEpoch: identity.attemptEpoch } : {}) })); }
  catch { /* storage unavailable → the keepalive request is the only delivery */ }
}

export function pendingStrictExit(assignmentId: string): StrictExitIdentity | null {
  try {
    const raw = sessionStorage.getItem(KEY + assignmentId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StrictExitIdentity>;
    if (typeof v.attemptNumber !== "number" || typeof v.startedAt !== "string") return null;
    return { attemptNumber: v.attemptNumber, startedAt: v.startedAt, ...(typeof v.attemptEpoch === "number" ? { attemptEpoch: v.attemptEpoch } : {}) };
  } catch { return null; }
}

export function clearStrictExit(assignmentId: string): void {
  try { sessionStorage.removeItem(KEY + assignmentId); } catch { /* ignore */ }
}
