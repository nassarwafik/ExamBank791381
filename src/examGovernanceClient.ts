// Phase 14A — the App-owned GovernanceService over /api/exam-governance. Loaded on demand by the App (never part of the
// initial graph) and handed to the Builder, which never sees the token. The transport is injected: `post(body)` performs an
// authenticated POST and resolves with the parsed JSON body, or rejects with an error carrying { status, payload } for a
// non-2xx response (see App.apiRequest). A 409 / 422 / 403 / 404 becomes a GovernanceRequestError with the code and the
// authoritative manifest the server returned, so the UI refreshes its state instead of retrying blindly.
import { GovernanceRequestError, type GovernanceService, type GovernanceStatus, type GovernanceManifestView, type RevisionMeta, type RevisionDocument, type GovernanceEvent, type Page, type TransitionArgs, type TransitionAction } from "./examGovernance";

type Transport = (body: Record<string, unknown>) => Promise<unknown>;
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
type StatusBody = { governed: boolean; manifest: GovernanceManifestView | null; capabilities: GovernanceStatus["capabilities"]; capabilitySource: string };
const toStatus = (b: StatusBody, previous?: GovernanceStatus): GovernanceStatus => ({
  governed: typeof b.governed === "boolean" ? b.governed : !!b.manifest,
  manifest: b.manifest ?? null,
  capabilities: Array.isArray(b.capabilities) ? b.capabilities : previous?.capabilities ?? [],
  capabilitySource: typeof b.capabilitySource === "string" ? b.capabilitySource : previous?.capabilitySource ?? ""
});

export function createGovernanceService(post: Transport): GovernanceService {
  return {
    status: examId => call<StatusBody>(post, { action: "status", examId }).then(b => toStatus(b)),
    enable: (examId, exam, requestId) => call<StatusBody>(post, { action: "enable", examId, exam, requestId }).then(b => toStatus(b)),
    createRevision: (examId, exam, args: TransitionArgs) => call<StatusBody>(post, { action: "create-revision", examId, exam, requestId: args.requestId, expectedStateVersion: args.expectedStateVersion }).then(b => toStatus(b)),
    transition: (examId, action: TransitionAction, args: TransitionArgs) => call<StatusBody>(post, { action, examId, requestId: args.requestId, expectedStateVersion: args.expectedStateVersion, ...(args.revisionId ? { revisionId: args.revisionId } : {}) }).then(b => toStatus(b)),
    listRevisions: (examId, cursor) => call<Page<RevisionMeta>>(post, { action: "revisions", examId, ...(cursor != null ? { cursor } : {}), limit: 20 }).then(p => ({ items: p.items ?? [], nextCursor: p.nextCursor ?? null })),
    loadRevision: (examId, revisionId) => call<{ revision: RevisionDocument }>(post, { action: "revision", examId, revisionId }).then(r => r.revision),
    listEvents: (examId, cursor) => call<Page<GovernanceEvent>>(post, { action: "events", examId, ...(cursor != null ? { cursor } : {}), limit: 20 }).then(p => ({ items: p.items ?? [], nextCursor: p.nextCursor ?? null }))
  };
}
