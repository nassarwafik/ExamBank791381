// Phase 14A — the App-owned GovernanceService over /api/exam-governance. Loaded on demand by the App (never part of the
// initial graph) and handed to the Builder, which never sees the token. The transport is injected: `post(body)` performs an
// authenticated POST and resolves with the parsed JSON body, or rejects with an error carrying { status, payload } for a
// non-2xx response (see App.apiRequest). A 409 / 422 / 403 / 404 becomes a GovernanceRequestError with the code and the
// authoritative manifest the server returned, so the UI refreshes its state instead of retrying blindly.
// Phase 14B — the same service gains the Assigned workflow: directory (server actor list), submit-with-assignments (ids only),
// decisions (server-validated note), decision history. The client sends ids and plain-text notes; nothing it sends is authority.
import { GovernanceRequestError, type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type RevisionMeta, type RevisionDocument, type GovernanceEvent, type Page, type TransitionArgs, type TransitionAction, type GovernanceDirectory, type DecisionRecord, type WorkflowAction } from "./examGovernance";

export type Transport = (body: Record<string, unknown>) => Promise<unknown>;
type ErrorLike = { status?: number; payload?: { code?: string; error?: string; manifest?: GovernanceManifestView | null; details?: unknown }; message?: string };

function toGovernanceError(e: unknown): GovernanceRequestError {
  const err = (e ?? {}) as ErrorLike;
  const status = typeof err.status === "number" ? err.status : 0;
  const payload = err.payload ?? {};
  return new GovernanceRequestError(status, String(payload.code ?? ""), String(payload.error ?? err.message ?? "تعذر تنفيذ إجراء إدارة النشر حاليًا."), { manifest: payload.manifest ?? null, details: payload.details });
}
async function call<T>(post: Transport, body: Record<string, unknown>): Promise<T> {
  try { return (await post(body)) as T; }
  catch (e) { throw e instanceof GovernanceRequestError ? e : toGovernanceError(e); }
}
type StatusBody = { governed: boolean; manifest: GovernanceManifestView | null; capabilities: GovernanceStatus["capabilities"]; capabilitySource: string; workflowMode?: string; actorId?: string; identityConfigurationError?: string };
const toStatus = (b: StatusBody, previous?: GovernanceStatus): GovernanceStatus => ({
  governed: typeof b.governed === "boolean" ? b.governed : !!b.manifest,
  manifest: b.manifest ?? null,
  capabilities: Array.isArray(b.capabilities) ? b.capabilities : previous?.capabilities ?? [],
  capabilitySource: typeof b.capabilitySource === "string" ? b.capabilitySource : previous?.capabilitySource ?? "",
  workflowMode: b.workflowMode === "assigned" ? "assigned" : b.workflowMode === "single" ? "single" : previous?.workflowMode,
  actorId: typeof b.actorId === "string" ? b.actorId : previous?.actorId,
  identityConfigurationError: typeof b.identityConfigurationError === "string" ? b.identityConfigurationError : undefined
});

export function createGovernanceService(post: Transport): GovernanceService {
  return {
    status: examId => call<StatusBody>(post, { action: "status", examId }).then(b => toStatus(b)),
    enable: (examId, exam, requestId) => call<StatusBody>(post, { action: "enable", examId, exam, requestId }).then(b => toStatus(b)),
    createRevision: (examId, exam, args: TransitionArgs) => call<StatusBody>(post, { action: "create-revision", examId, exam, requestId: args.requestId, expectedStateVersion: args.expectedStateVersion }).then(b => toStatus(b)),
    transition: (examId, action: TransitionAction, args: TransitionArgs) => call<StatusBody>(post, {
      action, examId, requestId: args.requestId, expectedStateVersion: args.expectedStateVersion,
      ...(args.revisionId ? { revisionId: args.revisionId } : {}),
      ...(args.assignments ? { assignments: { reviewerId: args.assignments.reviewerId, approverId: args.assignments.approverId, publisherId: args.assignments.publisherId } } : {}),
      ...(typeof args.note === "string" && args.note.trim() ? { note: args.note } : {})
    }).then(b => toStatus(b)),
    listRevisions: (examId, cursor) => call<Page<RevisionMeta>>(post, { action: "revisions", examId, ...(cursor != null ? { cursor } : {}), limit: 20 }).then(p => ({ items: p.items ?? [], nextCursor: p.nextCursor ?? null })),
    loadRevision: (examId, revisionId) => call<{ revision: RevisionDocument }>(post, { action: "revision", examId, revisionId }).then(r => r.revision),
    listEvents: (examId, cursor) => call<Page<GovernanceEvent>>(post, { action: "events", examId, ...(cursor != null ? { cursor } : {}), limit: 20 }).then(p => ({ items: p.items ?? [], nextCursor: p.nextCursor ?? null })),
    directory: () => call<{ mode: string; actors: GovernanceDirectory["actors"] }>(post, { action: "directory" }).then(d => ({ mode: d.mode === "assigned" ? "assigned" : "single", actors: Array.isArray(d.actors) ? d.actors : [] })),
    decide: (examId, action: WorkflowAction, args) => call<StatusBody>(post, { action, examId, requestId: args.requestId, expectedStateVersion: args.expectedStateVersion, ...(typeof args.note === "string" ? { note: args.note } : {}) }).then(b => toStatus(b)),
    listDecisions: (examId, cursor) => call<Page<DecisionRecord>>(post, { action: "decisions", examId, ...(cursor != null ? { cursor } : {}), limit: 20 }).then(p => ({ items: p.items ?? [], nextCursor: p.nextCursor ?? null })),
    loadDecision: (examId, decisionId) => call<{ decision: DecisionRecord }>(post, { action: "decision", examId, decisionId }).then(r => r.decision)
  };
}

/** A token-bearing transport for pages outside the App's request helper (the Review Inbox page). Same error contract. */
export function createTokenTransport(token: string, url = "/api/exam-governance"): Transport {
  return async body => {
    const r = await fetch(url, { method: "POST", headers: { "x-builder-token": token, Authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body) });
    let data: Record<string, unknown> = {};
    try { data = (await r.json()) as Record<string, unknown>; } catch { data = {}; }
    if (!r.ok) { const e = new Error(String(data.error ?? "HTTP " + r.status)) as Error & { status?: number; payload?: unknown }; e.status = r.status; e.payload = data; throw e; }
    return data;
  };
}
