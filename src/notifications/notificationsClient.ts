// Phase 6D — the student's UNIFIED notification center client (GET/POST /api/student-notifications).
// Two sources, ONE list: message notifications (direct teacher messages + class announcements — their unread state is
// still the Phase 5D message markers, acknowledged only by the Student Messages page) and non-message events
// (assignments, deadlines, learning materials, reviews, teacher recognition — acknowledged here, one event at a time).
// The server returns three counts: `messages` (the ✉️ badge — message unread only), `events` and `bell` (🔔 — the
// unified total). The browser never derives one count from another: every count shown comes from a server snapshot.
import { MessagesHttpError, type StudentUnread } from "../messages/messagesClient";

export type BadgeCount = { total: number; capped: boolean };

type Common = { id: string; createdAt: string; unread: boolean };
export type MessageNotification = Common & { type: "direct" | "announcement"; senderDisplayName: string; preview: string };
export type AssignmentEventType = "assignment_published" | "assignment_deadline_extended" | "assignment_reopened" | "assignment_retry_granted" | "attempt_time_extended";
export type AssignmentNotification = Common & { type: AssignmentEventType; assignmentId: string; assignmentTitle: string; dueAt?: string; attemptNumber?: number };
export type LearningMaterialNotification = Common & { type: "learning_module_published"; courseId: string; courseTitle: string; moduleId: string; moduleTitle: string };
export type ReviewNotification = Common & { type: "assignment_reviewed"; assignmentId: string; assignmentTitle: string; becameFinal: boolean; scoreChanged: boolean; feedbackChanged: boolean; finalized: boolean; percentage: number | null };
export type ReactionId = "heart" | "clap" | "cheer" | "fire";
export type RecognitionNotification =
  | (Common & { type: "teacher_reaction"; postId: string; reaction: ReactionId })
  | (Common & { type: "teacher_note"; postId: string; notePreview: string });

export type NotificationItem = MessageNotification | AssignmentNotification | LearningMaterialNotification | ReviewNotification | RecognitionNotification;
export type EventNotification = Exclude<NotificationItem, MessageNotification>;

export type NotificationCounts = { messages: StudentUnread; events: BadgeCount; bell: BadgeCount };
export type NotificationCenterData = { items: NotificationItem[]; counts: NotificationCounts };

export function isMessageNotification(item: NotificationItem): item is MessageNotification {
  return item.type === "direct" || item.type === "announcement";
}
export function isAssignmentRoute(item: NotificationItem): item is AssignmentNotification | ReviewNotification {
  return "assignmentId" in item;
}

const ASSIGNMENT_TYPES: ReadonlySet<string> = new Set(["assignment_published", "assignment_deadline_extended", "assignment_reopened", "assignment_retry_granted", "attempt_time_extended"]);
const REACTIONS: ReadonlySet<string> = new Set(["heart", "clap", "cheer", "fire"]);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** One server item → a typed union member, or null when it is malformed/unknown (dropped, never shown half-built). */
export function notificationItemOf(v: unknown): NotificationItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id), type = str(o.type);
  if (!id || !type) return null;
  const common: Common = { id, createdAt: str(o.createdAt), unread: o.unread === true };
  if (type === "direct" || type === "announcement") return { ...common, type, senderDisplayName: str(o.senderDisplayName), preview: str(o.preview) };
  if (ASSIGNMENT_TYPES.has(type)) {
    if (!str(o.assignmentId)) return null;
    return { ...common, type: type as AssignmentEventType, assignmentId: str(o.assignmentId), assignmentTitle: str(o.assignmentTitle), ...(str(o.dueAt) ? { dueAt: str(o.dueAt) } : {}), ...(typeof o.attemptNumber === "number" ? { attemptNumber: o.attemptNumber } : {}) };
  }
  if (type === "learning_module_published") {
    if (!str(o.courseId) || !str(o.moduleId)) return null;
    return { ...common, type, courseId: str(o.courseId), courseTitle: str(o.courseTitle), moduleId: str(o.moduleId), moduleTitle: str(o.moduleTitle) };
  }
  if (type === "assignment_reviewed") {
    if (!str(o.assignmentId)) return null;
    return { ...common, type, assignmentId: str(o.assignmentId), assignmentTitle: str(o.assignmentTitle), becameFinal: o.becameFinal === true, scoreChanged: o.scoreChanged === true, feedbackChanged: o.feedbackChanged === true, finalized: o.finalized === true, percentage: typeof o.percentage === "number" ? o.percentage : null };
  }
  if (type === "teacher_reaction") return str(o.postId) && REACTIONS.has(str(o.reaction)) ? { ...common, type, postId: str(o.postId), reaction: str(o.reaction) as ReactionId } : null;
  if (type === "teacher_note") return str(o.postId) ? { ...common, type, postId: str(o.postId), notePreview: str(o.notePreview) } : null;
  return null;
}

const countOf = (v: unknown): BadgeCount | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = Number(o.unread);
  return Number.isFinite(n) ? { total: Math.max(0, Math.floor(n)), capped: o.capped === true } : null;
};
const unreadOf = (v: unknown) => { const c = countOf(v); return { unread: c ? c.total : 0, capped: c ? c.capped : false }; };

/** The three server counts, or null when the payload is malformed (the caller then keeps its last-good counts). */
export function countsOf(j: Record<string, unknown>): NotificationCounts | null {
  const m = j.messages && typeof j.messages === "object" ? j.messages as Record<string, unknown> : null;
  const events = countOf(j.events), bell = countOf(j.bell);
  if (!m || !events || !bell || !Number.isFinite(Number(m.totalUnread))) return null;
  return {
    messages: { directUnread: unreadOf(m.directUnread), announcementUnread: unreadOf(m.announcementUnread), totalUnread: Math.max(0, Number(m.totalUnread) || 0), totalCapped: m.totalCapped === true },
    events, bell
  };
}

const headersOf = (token: string) => ({ "x-student-token": token, Authorization: "Bearer " + token });
async function readJson(r: Response): Promise<Record<string, unknown>> {
  try { return (await r.json()) as Record<string, unknown>; } catch { return {}; }
}
function fail(j: Record<string, unknown>, status: number, fallback: string): never {
  throw new MessagesHttpError(typeof j.error === "string" && j.error ? j.error : fallback, status);
}
function requireCounts(j: Record<string, unknown>, status: number): NotificationCounts {
  const counts = countsOf(j);
  if (!counts) fail({}, status, "تعذر تحميل الإشعارات.");
  return counts;
}

/** Lightweight count snapshot (the 15 s poll). Read-only. Throws MessagesHttpError on any failure (never a logout). */
export async function fetchNotificationCounts(token: string): Promise<NotificationCounts> {
  const r = await fetch("/api/student-notifications?view=unread", { headers: headersOf(token) });
  const j = await readJson(r);
  if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الإشعارات.");
  return requireCounts(j, r.status);
}

/** Recent unified items (newest first) + the SAME server counts, from one request. Read-only. */
export async function fetchNotificationCenter(token: string): Promise<NotificationCenterData> {
  const r = await fetch("/api/student-notifications?view=notifications", { headers: headersOf(token) });
  const j = await readJson(r);
  if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الإشعارات.");
  const items = (Array.isArray(j.items) ? j.items : []).map(notificationItemOf).filter((i): i is NotificationItem => i !== null);
  return { items, counts: requireCounts(j, r.status) };
}

/** Acknowledge ONE non-message event (never a message). Returns the server's FRESH counts after the write. */
export async function markNotificationEventRead(token: string, eventId: string): Promise<NotificationCounts> {
  const r = await fetch("/api/student-notifications", { method: "POST", headers: { "Content-Type": "application/json", ...headersOf(token) }, body: JSON.stringify({ action: "markEventRead", eventId }) });
  const j = await readJson(r);
  if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحديث حالة الإشعار.");
  return requireCounts(j, r.status);
}
