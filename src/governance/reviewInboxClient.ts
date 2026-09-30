// Phase 14B Part I / J — the Review Inbox client. Lists MY tasks from /api/governance-inbox (the server derives the actor from
// the token; no actorId is ever sent) and hands the governance actions (immutable revision, status, decisions) to the shared
// GovernanceService built on a token transport. Tasks are lightweight routing data; the immutable revision body is loaded
// only when a task is opened.
import { createGovernanceService, createTokenTransport } from "../examGovernanceClient";
import type { GovernanceService, WorkflowStage, ReviewStatus, LifecycleState } from "../examGovernance";

export type InboxTask = {
  examId: string; cycleId: string; revisionId: string; revisionNumber: number | null; stage: WorkflowStage;
  title: string; authorId: string; submittedAt: string; createdAt: string;
  lifecycleState: LifecycleState; stateVersion: number; reviewStatus: ReviewStatus; reviewedAt?: string; approvedAt?: string;
};
export type InboxCounts = { review: number; approve: number; publish: number };
export type InboxPage = { items: InboxTask[]; nextCursor: number | null; counts: InboxCounts; actorId: string };
export type ReviewInboxClient = {
  list: (stage: WorkflowStage | "all", cursor?: number | null) => Promise<InboxPage>;
  governance: GovernanceService;
};

export function createReviewInboxClient(token: string): ReviewInboxClient {
  const headers = { "x-builder-token": token, Authorization: "Bearer " + token };
  return {
    async list(stage, cursor) {
      const q = new URLSearchParams({ stage, limit: "20", ...(cursor != null ? { cursor: String(cursor) } : {}) });
      const r = await fetch("/api/governance-inbox?" + q.toString(), { headers });
      const data = (await r.json().catch(() => ({}))) as Partial<InboxPage> & { error?: string };
      if (!r.ok) throw new Error(String(data.error ?? "تعذر تحميل مهام المراجعة."));
      return { items: Array.isArray(data.items) ? data.items : [], nextCursor: data.nextCursor ?? null, counts: data.counts ?? { review: 0, approve: 0, publish: 0 }, actorId: String(data.actorId ?? "") };
    },
    governance: createGovernanceService(createTokenTransport(token))
  };
}
