// Phase 14A — frontend vocabulary and pure helpers of the SERVER-owned exam publishing governance.
// Phase 14B — the Assigned review workflow (Author → Reviewer → Approver → Publisher) on top of the same lifecycle.
//
// Everything here is display / affordance logic. The server manifest (lifecycleState, stateVersion, revision pointers,
// reviewWorkflow) is the publishing authority; `StructuredExam.status` ("draft" | "final") remains a compatibility / authoring
// hint only. The Builder never receives a token: the App owns the GovernanceService (built on its authenticated request helper)
// and hands it to the Builder exactly like the bank picker service. Nothing the UI computes here grants authority: the server
// re-validates the actor, the assignment, the capability, the state version and the note of every action.
import type { StructuredExam } from "./examTypes";

export type LifecycleState = "draft" | "in-review" | "approved" | "published";
export type GovernanceCapability = "author" | "review" | "approve" | "publish";
export type WorkflowAction = "complete-review" | "request-changes" | "reject-approval" | "reject-publication" | "withdraw-review";
export type GovernanceAction = "enable" | "create-revision" | "submit-review" | "return-to-draft" | "approve" | "publish" | "new-draft" | WorkflowAction;
export type TransitionAction = "submit-review" | "return-to-draft" | "approve" | "publish";
export type RevisionRole = "latest" | "review" | "approved" | "published";
export type GovernanceEventType = "governance-enabled" | "revision-created" | "submitted-for-review" | "returned-to-draft" | "approved" | "published" | "review-completed" | "changes-requested" | "approval-rejected" | "publication-rejected" | "review-withdrawn";
export type WorkflowMode = "single" | "assigned";
export type ReviewStatus = "pending" | "completed";
export type WorkflowStage = "review" | "approve" | "publish";
export type DecisionStage = "review" | "approval" | "publication" | "author";
export type DecisionType = "review-completed" | "changes-requested" | "approved" | "approval-rejected" | "publication-rejected" | "withdrawn";

export type ReviewWorkflowView = {
  cycleId: string; revisionId: string; revisionNumber: number;
  authorId: string; reviewerId: string; approverId: string; publisherId: string;
  submittedAt: string; submittedBy: string; reviewStatus: ReviewStatus;
  reviewedAt?: string; reviewedBy?: string; reviewDecisionId?: string;
  approvedAt?: string; approvedBy?: string; approvalDecisionId?: string;
  publishedAt?: string; publishedBy?: string;
};
export type LastDecisionView = { decisionId: string; stage: DecisionStage; decision: DecisionType; actorId: string; at: string; cycleId: string; revisionId: string; revisionNumber: number; hasNote: boolean };
export type GovernanceManifestView = {
  examId: string;
  lifecycleState: LifecycleState;
  stateVersion: number;
  latestRevisionId: string;
  latestRevisionNumber: number;
  latestContentHash?: string;
  reviewRevisionId?: string;
  reviewRevisionNumber?: number;
  approvedRevisionId?: string;
  approvedRevisionNumber?: number;
  approvedAt?: string;
  approvedBy?: string;
  publishedRevisionId?: string;
  publishedRevisionNumber?: number;
  publishedAt?: string;
  publishedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastTransition?: { type: string; at: string; by: string; fromState?: string; toState?: string };
  /** 14B — the active review cycle (in-review / approved / published under Assigned mode); absent in draft and in 14A manifests. */
  reviewWorkflow?: ReviewWorkflowView;
  /** 14B — the most recent workflow decision that returned the exam to draft (or completed a review); the note itself is a decision record. */
  lastDecision?: LastDecisionView;
};
export type GovernanceStatus = {
  governed: boolean; manifest: GovernanceManifestView | null; capabilities: GovernanceCapability[]; capabilitySource: string;
  /** 14B — server workflow mode and the authenticated actor (display / affordance only). */
  workflowMode?: WorkflowMode; actorId?: string; identityConfigurationError?: string;
};
export type RevisionMeta = { revisionId: string; revisionNumber: number; createdAt: string; createdBy: string; sourceRevisionId?: string; contentHash: string; title: string; questionCount: number; totalMarks: number; roles: RevisionRole[] };
export type RevisionDocument = { revisionId: string; revisionNumber: number; createdAt: string; createdBy: string; sourceRevisionId?: string; contentHash: string; exam: StructuredExam };
export type GovernanceEvent = { eventId: string; examId: string; type: GovernanceEventType | string; revisionId?: string; fromState?: string; toState?: string; cycleId?: string; decisionId?: string; actorId: string; occurredAt: string; requestId: string; sequence: number };
export type DecisionRecord = { decisionId: string; examId: string; cycleId: string; revisionId: string; revisionNumber: number; stage: DecisionStage; decision: DecisionType; actorId: string; occurredAt: string; note: string; sequence: number };
export type GovernanceActor = { actorId: string; displayName: string; capabilities: GovernanceCapability[] };
export type GovernanceDirectory = { mode: WorkflowMode; actors: GovernanceActor[] };
export type WorkflowAssignments = { reviewerId: string; approverId: string; publisherId: string };
export type TransitionArgs = { expectedStateVersion: number; requestId: string; revisionId?: string; assignments?: WorkflowAssignments; note?: string };
export type Page<T> = { items: T[]; nextCursor: number | null };

export type GovernanceService = {
  status: (examId: string) => Promise<GovernanceStatus>;
  enable: (examId: string, exam: StructuredExam, requestId: string) => Promise<GovernanceStatus>;
  createRevision: (examId: string, exam: StructuredExam, args: TransitionArgs) => Promise<GovernanceStatus>;
  transition: (examId: string, action: TransitionAction, args: TransitionArgs) => Promise<GovernanceStatus>;
  listRevisions: (examId: string, cursor?: number | null) => Promise<Page<RevisionMeta>>;
  loadRevision: (examId: string, revisionId: string) => Promise<RevisionDocument>;
  listEvents: (examId: string, cursor?: number | null) => Promise<Page<GovernanceEvent>>;
  /** 14B — optional so a 14A fake / legacy service still type-checks; the panel degrades to the 14A surface without them. */
  directory?: () => Promise<GovernanceDirectory>;
  decide?: (examId: string, action: WorkflowAction, args: { expectedStateVersion: number; requestId: string; note?: string }) => Promise<GovernanceStatus>;
  listDecisions?: (examId: string, cursor?: number | null) => Promise<Page<DecisionRecord>>;
  loadDecision?: (examId: string, decisionId: string) => Promise<DecisionRecord>;
};

/** A governance request the server refused. `status` 409 = the authority moved (stale / illegal / conflict); the
 *  payload may carry the authoritative manifest so the UI refreshes instead of retrying blindly. */
export class GovernanceRequestError extends Error {
  status: number;
  code: string;
  payload?: { manifest?: GovernanceManifestView | null; details?: unknown };
  constructor(status: number, code: string, message: string, payload?: { manifest?: GovernanceManifestView | null; details?: unknown }) {
    super(message);
    this.name = "GovernanceRequestError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = { draft: "مسودة", "in-review": "قيد المراجعة", approved: "معتمد", published: "منشور" };
export const WORKFLOW_ACTION_LABEL: Record<WorkflowAction, string> = {
  "complete-review": "إتمام المراجعة",
  "request-changes": "طلب تعديلات",
  "reject-approval": "رفض الاعتماد وإعادة للمسودة",
  "reject-publication": "إعادة قبل النشر",
  "withdraw-review": "سحب طلب المراجعة"
};
export const GOVERNANCE_ACTION_LABEL: Record<GovernanceAction, string> = {
  enable: "تفعيل إدارة النشر",
  "create-revision": "إنشاء إصدار من النسخة الحالية",
  "submit-review": "إرسال للمراجعة",
  "return-to-draft": "إرجاع إلى المسودة",
  approve: "اعتماد",
  publish: "نشر",
  "new-draft": "إنشاء نسخة تحرير جديدة",
  ...WORKFLOW_ACTION_LABEL
};
export const CAPABILITY_LABEL: Record<GovernanceCapability, string> = { author: "تأليف", review: "مراجعة", approve: "اعتماد", publish: "نشر" };
export const ROLE_LABEL: Record<RevisionRole, string> = { latest: "الأحدث", review: "قيد المراجعة", approved: "معتمد", published: "منشور" };
export const EVENT_TYPE_LABEL: Record<GovernanceEventType, string> = {
  "governance-enabled": "تفعيل إدارة النشر",
  "revision-created": "إنشاء إصدار",
  "submitted-for-review": "إرسال للمراجعة",
  "returned-to-draft": "إرجاع إلى المسودة",
  approved: "اعتماد",
  published: "نشر",
  "review-completed": "إتمام المراجعة",
  "changes-requested": "طلب تعديلات",
  "approval-rejected": "رفض الاعتماد",
  "publication-rejected": "إعادة قبل النشر",
  "review-withdrawn": "سحب طلب المراجعة"
};
export const DECISION_LABEL: Record<DecisionType, string> = {
  "review-completed": "اكتملت المراجعة",
  "changes-requested": "طُلبت تعديلات",
  approved: "اعتُمد",
  "approval-rejected": "رُفض الاعتماد",
  "publication-rejected": "أُعيد قبل النشر",
  withdrawn: "سُحب طلب المراجعة"
};
export const DECISION_STAGE_LABEL: Record<DecisionStage, string> = { review: "المراجعة", approval: "الاعتماد", publication: "النشر", author: "المؤلف" };
export const STAGE_LABEL: Record<WorkflowStage, string> = { review: "بانتظار مراجعتي", approve: "بانتظار اعتمادي", publish: "بانتظار النشر" };
export const PARTICIPANT_LABEL = { authorId: "المؤلف", reviewerId: "المراجع", approverId: "المعتمد", publisherId: "الناشر" } as const;
export const GOVERNANCE_CONFLICT_MESSAGE = "تغيرت حالة الامتحان في الخادم منذ فتح هذه الصفحة. تم تحديث الحالة؛ راجعها قبل إعادة المحاولة.";
export const eventTypeLabel = (type: string): string => (EVENT_TYPE_LABEL as Record<string, string>)[type] ?? type;
export const NOTE_MAX_LENGTH = 2000;
export const NOTE_REQUIRED_ACTIONS: readonly WorkflowAction[] = ["request-changes", "reject-approval", "reject-publication"];

export type ActorContext = { actorId: string; capabilities: readonly GovernanceCapability[]; workflowMode: WorkflowMode };

/** 14B — which workflow stage the active cycle is at (null when no cycle / after publication / in draft). */
export function workflowStage(manifest: GovernanceManifestView | null): WorkflowStage | null {
  const w = manifest?.reviewWorkflow;
  if (!manifest || !w) return null;
  if (manifest.lifecycleState === "in-review") return w.reviewStatus === "completed" ? "approve" : "review";
  if (manifest.lifecycleState === "approved") return "publish";
  return null;
}
/** 14B — who is responsible right now (the participant key), or null. */
export function workflowResponsible(manifest: GovernanceManifestView | null): "reviewerId" | "approverId" | "publisherId" | null {
  const stage = workflowStage(manifest);
  return stage === "review" ? "reviewerId" : stage === "approve" ? "approverId" : stage === "publish" ? "publisherId" : null;
}

/** The actions the UI may OFFER for a state × capability set. This mirrors the server table for affordance only — the
 *  server re-validates every transition against its own manifest, capabilities, assignments and state version.
 *  Without an `ActorContext` (or in single-teacher mode without an active cycle) the exact 14A table applies. */
export function availableGovernanceActions(manifest: GovernanceManifestView | null, capabilities: readonly GovernanceCapability[], ctx?: ActorContext): GovernanceAction[] {
  const has = (c: GovernanceCapability) => capabilities.includes(c);
  if (!manifest) return has("author") ? ["enable"] : [];
  const w = manifest.reviewWorkflow;
  const assigned = !!w && (ctx?.workflowMode === "assigned" || !!ctx);
  if (assigned && ctx && w) {
    const me = ctx.actorId;
    const out: GovernanceAction[] = [];
    switch (manifest.lifecycleState) {
      case "in-review":
        if (w.reviewStatus === "pending" && me === w.reviewerId && has("review")) out.push("complete-review", "request-changes");
        if (w.reviewStatus === "completed" && me === w.approverId && has("approve")) out.push("approve", "reject-approval");
        if (me === w.authorId && has("author")) out.push("withdraw-review");
        return out;
      case "approved":
        if (me === w.publisherId && has("publish")) out.push("publish", "reject-publication");
        return out;
      case "published":
        if (has("author")) out.push("new-draft");
        return out;
      default:
        return has("author") ? ["create-revision", "submit-review"] : [];
    }
  }
  const out: GovernanceAction[] = [];
  switch (manifest.lifecycleState) {
    case "draft": if (has("author")) out.push("create-revision", "submit-review"); break;
    case "in-review": if (has("approve")) out.push("approve"); if (has("author") || has("review")) out.push("return-to-draft"); break;
    case "approved": if (has("publish")) out.push("publish"); if (has("author") || has("approve")) out.push("return-to-draft"); break;
    case "published": if (has("author")) out.push("new-draft"); break;
  }
  return out;
}

/** 14B — pure validation of the author's assignment selection, mirroring the server rule for UI convenience only. */
export function assignmentProblems(authorId: string, sel: Partial<WorkflowAssignments>, directory: readonly GovernanceActor[]): string[] {
  const problems: string[] = [];
  const find = (id?: string) => directory.find(a => a.actorId === id);
  const need = (key: keyof WorkflowAssignments, cap: GovernanceCapability, label: string) => {
    const id = sel[key];
    if (!id) { problems.push("اختر " + label + "."); return; }
    const a = find(id);
    if (!a) problems.push(label + " غير موجود في دليل الخادم.");
    else if (!a.capabilities.includes(cap)) problems.push(label + " لا يملك صلاحية «" + CAPABILITY_LABEL[cap] + "».");
  };
  need("reviewerId", "review", "المراجع"); need("approverId", "approve", "المعتمد"); need("publisherId", "publish", "الناشر");
  const ids = [authorId, sel.reviewerId, sel.approverId, sel.publisherId].filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length) problems.push("فصل المهام صارم: المؤلف والمراجع والمعتمد والناشر أربع هويات مختلفة.");
  return problems;
}
/** Display name for an actor id from the directory (falls back to the id — never to a client-supplied name). */
export const actorName = (actorId: string | undefined, directory: readonly GovernanceActor[] | undefined): string => {
  if (!actorId) return "—";
  return directory?.find(a => a.actorId === actorId)?.displayName ?? actorId;
};

/** Roles derive from the manifest pointers only — never from labels. */
export function revisionRoles(manifest: GovernanceManifestView, revisionId: string): RevisionRole[] {
  const roles: RevisionRole[] = [];
  if (manifest.latestRevisionId === revisionId) roles.push("latest");
  if (manifest.reviewRevisionId === revisionId) roles.push("review");
  if (manifest.approvedRevisionId === revisionId) roles.push("approved");
  if (manifest.publishedRevisionId === revisionId) roles.push("published");
  return roles;
}

export const shortId = (id: string): string => (id.length > 8 ? id.slice(0, 8) : id);

export function newRequestId(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g && typeof g.randomUUID === "function") return "gov-" + g.randomUUID();
  return "gov-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export const formatGovernanceTime = (iso: string | undefined): string => {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : iso;
};
