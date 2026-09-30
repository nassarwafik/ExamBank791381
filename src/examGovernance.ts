// Phase 14A — frontend vocabulary and pure helpers of the SERVER-owned exam publishing governance.
//
// Everything here is display / affordance logic. The server manifest (lifecycleState, stateVersion, revision pointers) is
// the publishing authority; `StructuredExam.status` ("draft" | "final") remains a compatibility / authoring hint only.
// The Builder never receives a token: the App owns the GovernanceService (built on its authenticated request helper) and
// hands it to the Builder exactly like the bank picker service.
import type { StructuredExam } from "./examTypes";

export type LifecycleState = "draft" | "in-review" | "approved" | "published";
export type GovernanceCapability = "author" | "review" | "approve" | "publish";
export type GovernanceAction = "enable" | "create-revision" | "submit-review" | "return-to-draft" | "approve" | "publish" | "new-draft";
export type TransitionAction = "submit-review" | "return-to-draft" | "approve" | "publish";
export type RevisionRole = "latest" | "review" | "approved" | "published";
export type GovernanceEventType = "governance-enabled" | "revision-created" | "submitted-for-review" | "returned-to-draft" | "approved" | "published";

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
};
export type GovernanceStatus = { governed: boolean; manifest: GovernanceManifestView | null; capabilities: GovernanceCapability[]; capabilitySource: string };
export type RevisionMeta = { revisionId: string; revisionNumber: number; createdAt: string; createdBy: string; sourceRevisionId?: string; contentHash: string; title: string; questionCount: number; totalMarks: number; roles: RevisionRole[] };
export type RevisionDocument = { revisionId: string; revisionNumber: number; createdAt: string; createdBy: string; sourceRevisionId?: string; contentHash: string; exam: StructuredExam };
export type GovernanceEvent = { eventId: string; examId: string; type: GovernanceEventType | string; revisionId?: string; fromState?: string; toState?: string; actorId: string; occurredAt: string; requestId: string; sequence: number };
export type TransitionArgs = { expectedStateVersion: number; requestId: string; revisionId?: string };
export type Page<T> = { items: T[]; nextCursor: number | null };

export type GovernanceService = {
  status: (examId: string) => Promise<GovernanceStatus>;
  enable: (examId: string, exam: StructuredExam, requestId: string) => Promise<GovernanceStatus>;
  createRevision: (examId: string, exam: StructuredExam, args: TransitionArgs) => Promise<GovernanceStatus>;
  transition: (examId: string, action: TransitionAction, args: TransitionArgs) => Promise<GovernanceStatus>;
  listRevisions: (examId: string, cursor?: number | null) => Promise<Page<RevisionMeta>>;
  loadRevision: (examId: string, revisionId: string) => Promise<RevisionDocument>;
  listEvents: (examId: string, cursor?: number | null) => Promise<Page<GovernanceEvent>>;
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
export const GOVERNANCE_ACTION_LABEL: Record<GovernanceAction, string> = {
  enable: "تفعيل إدارة النشر",
  "create-revision": "إنشاء إصدار من النسخة الحالية",
  "submit-review": "إرسال للمراجعة",
  "return-to-draft": "إرجاع إلى المسودة",
  approve: "اعتماد",
  publish: "نشر",
  "new-draft": "إنشاء نسخة تحرير جديدة"
};
export const CAPABILITY_LABEL: Record<GovernanceCapability, string> = { author: "تأليف", review: "مراجعة", approve: "اعتماد", publish: "نشر" };
export const ROLE_LABEL: Record<RevisionRole, string> = { latest: "الأحدث", review: "قيد المراجعة", approved: "معتمد", published: "منشور" };
export const EVENT_TYPE_LABEL: Record<GovernanceEventType, string> = {
  "governance-enabled": "تفعيل إدارة النشر",
  "revision-created": "إنشاء إصدار",
  "submitted-for-review": "إرسال للمراجعة",
  "returned-to-draft": "إرجاع إلى المسودة",
  approved: "اعتماد",
  published: "نشر"
};
export const GOVERNANCE_CONFLICT_MESSAGE = "تغيرت حالة الامتحان في الخادم منذ فتح هذه الصفحة. تم تحديث الحالة؛ راجعها قبل إعادة المحاولة.";
export const eventTypeLabel = (type: string): string => (EVENT_TYPE_LABEL as Record<string, string>)[type] ?? type;

/** The actions the UI may OFFER for a state × capability set. This mirrors the server table for affordance only — the
 *  server re-validates every transition against its own manifest and capabilities. */
export function availableGovernanceActions(manifest: GovernanceManifestView | null, capabilities: readonly GovernanceCapability[]): GovernanceAction[] {
  const has = (c: GovernanceCapability) => capabilities.includes(c);
  if (!manifest) return has("author") ? ["enable"] : [];
  const out: GovernanceAction[] = [];
  switch (manifest.lifecycleState) {
    case "draft": if (has("author")) out.push("create-revision", "submit-review"); break;
    case "in-review": if (has("approve")) out.push("approve"); if (has("author") || has("review")) out.push("return-to-draft"); break;
    case "approved": if (has("publish")) out.push("publish"); if (has("author") || has("approve")) out.push("return-to-draft"); break;
    case "published": if (has("author")) out.push("new-draft"); break;
  }
  return out;
}

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
