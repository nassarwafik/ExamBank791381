// Phase 5C — thin HTTP clients for the messaging surfaces. Plain request/response only: identity, recipients and
// permissions are decided by the SERVER (the teacher client never sends sender fields; the student client never
// sends a recipient). No WebSocket/SSE — the pages poll these reads.
import type { Classroom, Student } from "../students/types";

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Messages hardening (M.1) — an opaque idempotency key for ONE composed message. The page reuses it for every retry of
 * the same text in the same thread, so a retried send (timeout, network error) can never publish a second copy: the
 * server returns the already-published message instead. Matches the server rule /^[A-Za-z0-9_-]{8,64}$/.
 */
export function newClientMessageId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** The key of the message being sent: the same key while the thread and the text are unchanged (a retry), else new. */
export function sendKeyFor(current: { thread: string; body: string; id: string } | null, thread: string, body: string) {
  return current && current.thread === thread && current.body === body ? current : { thread, body, id: newClientMessageId() };
}
export const MESSAGES_POLL_MS = 5000;
/** Phase 5D — unread summaries (badges) refresh on a slower cadence than message bodies. */
export const UNREAD_POLL_MS = 15000;

/** A server-derived unread count; `capped` means "more than 99" (display "99+"). */
export type UnreadCount = { unread: number; capped: boolean };
export type TeacherUnreadSummary = { totalUnread: number; capped: boolean; byStudent: Record<string, UnreadCount> };
/** Tadris+ P11-B — one of the student's conversations (one per teacher): `id` "" is the home conversation, otherwise the shared class. */
export type StudentConversation = { id: string; home: boolean; name: string; archived: boolean; unread: number; capped: boolean; teacherName?: string };
/** `directUnread` / `announcementUnread`: the SELECTED conversation's own counts; `totalUnread`: every conversation (the portal badge). */
export type StudentUnread = { directUnread: UnreadCount; announcementUnread: UnreadCount; totalUnread: number; totalCapped: boolean; conversations?: StudentConversation[] };
export const NO_UNREAD: UnreadCount = { unread: 0, capped: false };

/** A mark-read request built from the EXACT applied snapshot (Phase 5D review follow-up). The optional LEGACY part
 *  acknowledges the displayed Phase 5C ids, which are a separate read domain on the server. */
export type ReadAck = { throughMessageId: string; seenIdsAtBoundary: string[]; legacyThroughMessageId?: string; legacySeenIdsAtBoundary?: string[] };

/** Order keys below this are legacy (Phase 5C "<ms>-<random>") ids; from it on, publication positions (server rule). */
export const SEQUENCE_KEY_BASE = 9000000000000;
const isLegacyId = (id: string) => Number(id.slice(0, 13)) < SEQUENCE_KEY_BASE;

/**
 * The snapshot acknowledgement for one stream: X = the latest unread-RELEVANT message in the applied snapshot, and
 * seenIdsAtBoundary = every relevant snapshot id at X's order key. When X is sequenced and the snapshot ALSO showed
 * relevant legacy ids, the legacy part names the latest of those + its same-millisecond ids — legacy and sequenced
 * read progress are separate domains, so a sequenced X never acknowledges a legacy message. Never derived from later
 * state, so a message the server created after this snapshot (even in the same millisecond) cannot be acknowledged.
 * null when the snapshot has no relevant (incoming) message — then nothing is marked.
 */
export function readAckFromSnapshot(messages: MessageView[], isRelevant: (m: MessageView) => boolean): ReadAck | null {
  const ids = messages.filter(isRelevant).map(m => m.messageId).filter(id => /^\d{13}-/.test(id)).sort();
  if (!ids.length) return null;
  const through = (list: string[]) => {
    const x = list[list.length - 1];
    return { x, seen: list.filter(id => id.slice(0, 13) === x.slice(0, 13)) };
  };
  const primary = through(ids);
  const ack: ReadAck = { throughMessageId: primary.x, seenIdsAtBoundary: primary.seen };
  const legacy = ids.filter(isLegacyId);
  if (!isLegacyId(primary.x) && legacy.length) {
    const l = through(legacy);
    ack.legacyThroughMessageId = l.x;
    ack.legacySeenIdsAtBoundary = l.seen;
  }
  return ack;
}

/** Identity of an acknowledgement (dedupes repeated marks of the same snapshot), covering BOTH domains' parts. */
export function ackKey(ack: ReadAck): string {
  return [ack.throughMessageId, ack.seenIdsAtBoundary.join(","), ack.legacyThroughMessageId || "", (ack.legacySeenIdsAtBoundary || []).join(",")].join("|");
}
/** The request fields of an acknowledgement (the legacy part only when present). */
function ackBody(ack: ReadAck) {
  return ack.legacyThroughMessageId
    ? { throughMessageId: ack.throughMessageId, seenIdsAtBoundary: ack.seenIdsAtBoundary, legacyThroughMessageId: ack.legacyThroughMessageId, legacySeenIdsAtBoundary: ack.legacySeenIdsAtBoundary }
    : { throughMessageId: ack.throughMessageId, seenIdsAtBoundary: ack.seenIdsAtBoundary };
}

/** Badge text: 1..99, or "99+" when the server capped the count. */
export function formatUnread(count: number, capped: boolean): string {
  return capped ? "99+" : String(Math.max(0, Math.floor(count)));
}
const unreadOf = (v: unknown): UnreadCount => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { unread: Math.max(0, Number(o.unread) || 0), capped: o.capped === true };
};
const conversationsOf = (v: unknown): StudentConversation[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as Record<string, unknown>).id === "string").map(x => ({
    id: String(x.id), home: x.home === true, name: String(x.name || ""), archived: x.archived === true, unread: Math.max(0, Number(x.unread) || 0), capped: x.capped === true,
    ...(typeof x.teacherName === "string" && x.teacherName ? { teacherName: x.teacherName } : {})
  }));
};
const studentUnreadOf = (j: Record<string, unknown>): StudentUnread => {
  const conversations = conversationsOf(j.conversations);
  return {
    directUnread: unreadOf(j.directUnread), announcementUnread: unreadOf(j.announcementUnread),
    totalUnread: Math.max(0, Number(j.totalUnread) || 0), totalCapped: j.totalCapped === true, ...(conversations ? { conversations } : {})
  };
};

export type MessageView = {
  messageId: string;
  kind: "direct" | "announcement";
  senderRole: "teacher" | "student";
  senderDisplayName: string;
  body: string;
  createdAt: string;
  /** M.5 — set when the sender edited the text (ISO). */
  editedAt?: string;
  /** M.5 — a deleted message (its text is gone: body is ""), and who deleted it. */
  deleted?: boolean;
  deletedBy?: "teacher" | "student";
  /** M.5 — THIS reader's permissions (server display hints; the server decides every edit / delete again). */
  editableUntil?: string;
  canDelete?: boolean;
  deletableUntil?: string;
};

/** M.5 — whether the reader may still edit / delete `m` at `now` (ms), from the server's hints. */
export function canEditMessage(m: MessageView, now: number): boolean {
  return !m.deleted && !!m.editableUntil && now <= Date.parse(m.editableUntil);
}
export function canDeleteMessage(m: MessageView, now: number): boolean {
  return !m.deleted && m.canDelete === true && (!m.deletableUntil || now <= Date.parse(m.deletableUntil));
}
/** M.5 — the placeholder of a deleted message (who deleted it, when it was not its own sender). */
export function deletedMessageText(m: MessageView): string {
  return m.deletedBy === "teacher" && m.senderRole === "student" ? "حذف المعلم هذه الرسالة." : "تم حذف هذه الرسالة.";
}

/** M.3 — `hasMore`: older history exists (page back with `before`); `hasNewer`: unread messages were held back until the
 *  shown ones are read (they arrive on the next read). Both optional: a missing value means false. */
export type ThreadState = { messages: MessageView[]; canSend: boolean; readOnlyReason: string; hasMore?: boolean; hasNewer?: boolean };
/** M.3 — one older-history page of a stream. */
export type OlderPage = { messages: MessageView[]; hasMore: boolean };
export type StudentMessagesData = {
  direct: MessageView[];
  announcements: MessageView[];
  classroom: { classId: string; name: string; archived: boolean } | null;
  canSend: boolean;
  readOnlyReason: string;
  directHasMore?: boolean;
  directHasNewer?: boolean;
  announcementsHasMore?: boolean;
  announcementsHasNewer?: boolean;
  /** Tadris+ P11-B — present only when the student has more than one conversation: the conversation this answer is about, and the list. */
  conversation?: string;
  conversations?: StudentConversation[];
};

/** An HTTP failure carrying the status (so callers can tell a 401 from a transient error). */
export class MessagesHttpError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; this.name = "MessagesHttpError"; }
}

async function readJson(r: Response): Promise<Record<string, unknown>> {
  try { return (await r.json()) as Record<string, unknown>; } catch { return {}; }
}
function fail(j: Record<string, unknown>, status: number, fallback: string): never {
  throw new MessagesHttpError(typeof j.error === "string" && j.error ? j.error : fallback, status);
}
const asMessages = (v: unknown): MessageView[] => (Array.isArray(v) ? (v as MessageView[]) : []);
const thread = (j: Record<string, unknown>): ThreadState => ({ messages: asMessages(j.messages), canSend: j.canSend === true, readOnlyReason: String(j.readOnlyReason || ""), hasMore: j.hasMore === true, hasNewer: j.hasNewer === true });
const beforeParam = (before?: string) => (before ? "&before=" + encodeURIComponent(before) : "");

export interface TeacherMessagesClient {
  listClasses(): Promise<Classroom[]>;
  listStudents(classId: string): Promise<Student[]>;
  /** M.3 — with `before`: the older page before that message id (never acknowledged). */
  getDirect(studentId: string, before?: string): Promise<ThreadState>;
  getAnnouncements(classId: string, before?: string): Promise<ThreadState>;
  sendDirect(studentId: string, body: string, clientMessageId?: string): Promise<MessageView>;
  sendAnnouncement(classId: string, body: string, clientMessageId?: string): Promise<MessageView>;
  /** Phase 5D — unread STUDENT replies for one class (per student; membership decided by the server). */
  getClassUnread(classId: string): Promise<TeacherUnreadSummary>;
  /** Phase 5D — advance this teacher's read marker for one conversation; returns what is still unread there. */
  markDirectRead(studentId: string, ack: ReadAck): Promise<UnreadCount>;
  /** M.5 — edit this teacher's own message / announcement; delete it, or (moderation) a student's message. Optional:
   *  without them the thread offers no message actions. Each resolves the stored version of the message. */
  editMessage?(target: MessageTarget, messageId: string, body: string): Promise<MessageView>;
  deleteMessage?(target: MessageTarget, messageId: string): Promise<MessageView>;
}
/** M.5 — the stream of a message action: one student's conversation or one class's announcements. */
export type MessageTarget = { studentId: string } | { classId: string };

export function createTeacherMessagesClient(token: string): TeacherMessagesClient {
  const headers = { "x-builder-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  // Tadris+ P11-B — a student the owner added to this class from another teacher's class has a SEPARATE conversation with this
  // teacher, the conversation of THAT class. The roster read says which students those are (`shared`, with the listed class); every
  // call about such a student then names the conversation. The server decides again on every request; this only routes.
  const sharedClassOf = new Map<string, string>();
  const conv = (studentId: string) => (sharedClassOf.has(studentId) ? { conversation: sharedClassOf.get(studentId) as string } : {});
  const convParam = (studentId: string) => (sharedClassOf.has(studentId) ? "&conversation=" + encodeURIComponent(sharedClassOf.get(studentId) as string) : "");
  const targetOf = (target: MessageTarget) => ("studentId" in target ? { ...target, ...conv(target.studentId) } : target);
  const get = async (url: string, fallback: string) => {
    const r = await fetch(url, { headers });
    const j = await readJson(r);
    if (!r.ok || j.ok === false) fail(j, r.status, fallback);
    return j;
  };
  const post = async (body: unknown, fallback: string) => {
    const r = await fetch("/api/messages", { method: "POST", headers, body: JSON.stringify(body) });
    const j = await readJson(r);
    if (!r.ok || !j.ok || !j.message) fail(j, r.status, fallback);
    return j.message as MessageView;
  };
  return {
    // The EXISTING roster authorities — no second class/membership model.
    async listClasses() { const j = await get("/api/classrooms", "تعذر تحميل الصفوف."); return Array.isArray(j.classes) ? (j.classes as Classroom[]) : []; },
    async listStudents(classId) {
      const j = await get("/api/students?classId=" + encodeURIComponent(classId) + "&includeArchived=1", "تعذر تحميل الطلاب.");
      const list = Array.isArray(j.students) ? (j.students as Array<Student & { shared?: boolean }>) : [];
      for (const s of list) { if (s.shared) sharedClassOf.set(s.userId, classId); else sharedClassOf.delete(s.userId); }
      return list;
    },
    async getDirect(studentId, before) { return thread(await get("/api/messages?studentId=" + encodeURIComponent(studentId) + convParam(studentId) + beforeParam(before), "تعذر تحميل المحادثة.")); },
    async getAnnouncements(classId, before) { return thread(await get("/api/messages?classId=" + encodeURIComponent(classId) + "&kind=announcements" + beforeParam(before), "تعذر تحميل الإعلانات.")); },
    sendDirect: (studentId, body, clientMessageId) => post({ action: "sendDirect", studentId, ...conv(studentId), body, ...(clientMessageId ? { clientMessageId } : {}) }, "تعذر إرسال الرسالة."),
    sendAnnouncement: (classId, body, clientMessageId) => post({ action: "sendAnnouncement", classId, body, ...(clientMessageId ? { clientMessageId } : {}) }, "تعذر إرسال الإعلان."),
    async getClassUnread(classId) {
      const j = await get("/api/messages?kind=unread-summary&classId=" + encodeURIComponent(classId), "تعذر تحميل الرسائل الجديدة.");
      const by: Record<string, UnreadCount> = {};
      const raw = j.byStudent && typeof j.byStudent === "object" ? (j.byStudent as Record<string, unknown>) : {};
      for (const [sid, v] of Object.entries(raw)) by[sid] = unreadOf(v);
      return { totalUnread: Math.max(0, Number(j.totalUnread) || 0), capped: j.capped === true, byStudent: by };
    },
    async markDirectRead(studentId, ack) {
      const r = await fetch("/api/messages", { method: "POST", headers, body: JSON.stringify({ action: "markDirectRead", studentId, ...conv(studentId), ...ackBody(ack) }) });
      const j = await readJson(r);
      if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحديث حالة القراءة.");
      return unreadOf(j);
    },
    editMessage: (target, messageId, body) => post({ action: "editMessage", ...targetOf(target), messageId, body }, "تعذر تعديل الرسالة."),
    deleteMessage: (target, messageId) => post({ action: "deleteMessage", ...targetOf(target), messageId }, "تعذر حذف الرسالة.")
  };
}

export interface StudentMessagesClient {
  load(): Promise<StudentMessagesData>;
  sendDirect(body: string, clientMessageId?: string): Promise<MessageView>;
  /** Phase 5D — this student's unread counts (own direct thread + CURRENT class announcements). */
  getUnread(): Promise<StudentUnread>;
  /** Phase 5D — mark one visible stream read through an id from its loaded snapshot; returns the fresh counts. */
  markRead(stream: "direct" | "announcements", ack: ReadAck): Promise<StudentUnread>;
  /** M.3 — the older page of one stream before a message id (never acknowledged). Optional: without it no button. */
  loadOlder?(stream: "direct" | "announcements", before: string): Promise<OlderPage>;
  /** M.5 — edit / delete the student's OWN reply (within the server's window). Optional: without them no actions. */
  editMessage?(messageId: string, body: string): Promise<MessageView>;
  deleteMessage?(messageId: string): Promise<MessageView>;
}

/** Tadris+ P11-B — `conversation`: "" (default) is the student's home conversation; a shared class id is the conversation with THAT
 *  class's teacher. Every call of the client is then about that one conversation (the server checks it is the student's own). */
export function createStudentMessagesClient(token: string, conversation = ""): StudentMessagesClient {
  const headers = { "x-student-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  const inBody = conversation ? { conversation } : {};
  const inQuery = (first: boolean) => (conversation ? (first ? "?" : "&") + "conversation=" + encodeURIComponent(conversation) : "");
  const change = async (body: unknown, fallback: string) => {
    const r = await fetch("/api/student-messages", { method: "POST", headers, body: JSON.stringify(body) });
    const j = await readJson(r);
    if (!r.ok || !j.ok || !j.message) fail(j, r.status, fallback);
    return j.message as MessageView;
  };
  return {
    editMessage: (messageId, body) => change({ action: "editMessage", ...inBody, messageId, body }, "تعذر تعديل الرسالة."),
    deleteMessage: messageId => change({ action: "deleteMessage", ...inBody, messageId }, "تعذر حذف الرسالة."),
    async load() {
      const r = await fetch("/api/student-messages" + inQuery(true), { headers });
      const j = await readJson(r);
      if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الرسائل.");
      const c = j.classroom as StudentMessagesData["classroom"];
      return {
        direct: asMessages(j.direct), announcements: asMessages(j.announcements), classroom: c && typeof c === "object" ? c : null, canSend: j.canSend === true, readOnlyReason: String(j.readOnlyReason || ""),
        directHasMore: j.directHasMore === true, directHasNewer: j.directHasNewer === true, announcementsHasMore: j.announcementsHasMore === true, announcementsHasNewer: j.announcementsHasNewer === true,
        ...(typeof j.conversation === "string" ? { conversation: j.conversation } : {}), ...(conversationsOf(j.conversations) ? { conversations: conversationsOf(j.conversations) } : {})
      };
    },
    async loadOlder(stream, before) {
      const r = await fetch("/api/student-messages?stream=" + stream + "&before=" + encodeURIComponent(before) + inQuery(false), { headers });
      const j = await readJson(r);
      if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الرسائل الأقدم.");
      return { messages: asMessages(j.messages), hasMore: j.hasMore === true };
    },
    async sendDirect(body, clientMessageId) {
      // The ONLY student action; no recipient / class / sender field exists in this request (the optional key is an
      // idempotency token for this one message, never an identity).
      const r = await fetch("/api/student-messages", { method: "POST", headers, body: JSON.stringify({ action: "sendDirect", ...inBody, body, ...(clientMessageId ? { clientMessageId } : {}) }) });
      const j = await readJson(r);
      if (!r.ok || !j.ok || !j.message) fail(j, r.status, "تعذر إرسال الرسالة.");
      return j.message as MessageView;
    },
    async getUnread() {
      const r = await fetch("/api/student-messages?view=unread" + inQuery(false), { headers });
      const j = await readJson(r);
      if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الرسائل الجديدة.");
      return studentUnreadOf(j);
    },
    async markRead(stream, ack) {
      const r = await fetch("/api/student-messages", { method: "POST", headers, body: JSON.stringify({ action: "markRead", ...inBody, stream, ...ackBody(ack) }) });
      const j = await readJson(r);
      if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحديث حالة القراءة.");
      return studentUnreadOf(j);
    }
  };
}

/** Phase 6C — one in-app notification: a recent INCOMING message of the student's own streams (server projection). */
// Phase 6D — the unified union lives in notifications/notificationsClient.ts; this legacy (Phase 6C, message-only)
// read of /api/student-messages?view=notifications keeps returning message items only.
export type { NotificationItem } from "../notifications/notificationsClient";
export type MessageNotificationItem = {
  id: string;
  type: "direct" | "announcement";
  senderDisplayName: string;
  preview: string;
  createdAt: string;
  unread: boolean;
};
export type StudentNotifications = { items: MessageNotificationItem[]; unread: StudentUnread };

const notificationOf = (v: unknown): MessageNotificationItem | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id || (o.type !== "direct" && o.type !== "announcement")) return null;
  return { id: o.id, type: o.type, senderDisplayName: String(o.senderDisplayName || ""), preview: String(o.preview || ""), createdAt: String(o.createdAt || ""), unread: o.unread === true };
};

/**
 * Phase 6C — the notification center's read (GET /api/student-messages?view=notifications): recent incoming items plus
 * the SAME unread summary as ?view=unread, computed by the server from the same read markers. Read-only: it never
 * marks anything read. Throws MessagesHttpError on failure (the caller keeps its last-good data; never a logout).
 */
export async function fetchStudentNotifications(token: string): Promise<StudentNotifications> {
  const r = await fetch("/api/student-messages?view=notifications", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
  const j = await readJson(r);
  if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الإشعارات.");
  const items = (Array.isArray(j.items) ? j.items : []).map(notificationOf).filter((i): i is MessageNotificationItem => i !== null);
  return { items, unread: studentUnreadOf(j) };
}

/** Compact Arabic time for a notification: the time today, otherwise day + month (+ year when not this year). */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  try {
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("ar", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  } catch { return d.toISOString().slice(0, 10); }
}

/** Insert a server-confirmed message into a thread (id-deduplicated, chronological by the sortable server id). */
export function mergeMessage(list: MessageView[], message: MessageView): MessageView[] {
  if (list.some(m => m.messageId === message.messageId)) return list;
  return [...list, message].sort((a, b) => (a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0));
}

/** M.5 — the server's new version of a message replaces the one with the same id (absent → the list is unchanged). */
export function replaceMessage(list: MessageView[], message: MessageView): MessageView[] {
  return list.some(m => m.messageId === message.messageId) ? list.map(m => (m.messageId === message.messageId ? message : m)) : list;
}

/** Human-readable Arabic date + time for a message timestamp. */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  try { return d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }); } catch { return d.toISOString(); }
}
