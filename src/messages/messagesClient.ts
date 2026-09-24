// Phase 5C — thin HTTP clients for the messaging surfaces. Plain request/response only: identity, recipients and
// permissions are decided by the SERVER (the teacher client never sends sender fields; the student client never
// sends a recipient). No WebSocket/SSE — the pages poll these reads.
import type { Classroom, Student } from "../students/types";

export const MAX_MESSAGE_LENGTH = 2000;
export const MESSAGES_POLL_MS = 5000;

export type MessageView = {
  messageId: string;
  kind: "direct" | "announcement";
  senderRole: "teacher" | "student";
  senderDisplayName: string;
  body: string;
  createdAt: string;
};

export type ThreadState = { messages: MessageView[]; canSend: boolean; readOnlyReason: string };
export type StudentMessagesData = {
  direct: MessageView[];
  announcements: MessageView[];
  classroom: { classId: string; name: string; archived: boolean } | null;
  canSend: boolean;
  readOnlyReason: string;
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
const thread = (j: Record<string, unknown>): ThreadState => ({ messages: asMessages(j.messages), canSend: j.canSend === true, readOnlyReason: String(j.readOnlyReason || "") });

export interface TeacherMessagesClient {
  listClasses(): Promise<Classroom[]>;
  listStudents(classId: string): Promise<Student[]>;
  getDirect(studentId: string): Promise<ThreadState>;
  getAnnouncements(classId: string): Promise<ThreadState>;
  sendDirect(studentId: string, body: string): Promise<MessageView>;
  sendAnnouncement(classId: string, body: string): Promise<MessageView>;
}

export function createTeacherMessagesClient(token: string): TeacherMessagesClient {
  const headers = { "x-builder-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
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
    async listStudents(classId) { const j = await get("/api/students?classId=" + encodeURIComponent(classId) + "&includeArchived=1", "تعذر تحميل الطلاب."); return Array.isArray(j.students) ? (j.students as Student[]) : []; },
    async getDirect(studentId) { return thread(await get("/api/messages?studentId=" + encodeURIComponent(studentId), "تعذر تحميل المحادثة.")); },
    async getAnnouncements(classId) { return thread(await get("/api/messages?classId=" + encodeURIComponent(classId) + "&kind=announcements", "تعذر تحميل الإعلانات.")); },
    sendDirect: (studentId, body) => post({ action: "sendDirect", studentId, body }, "تعذر إرسال الرسالة."),
    sendAnnouncement: (classId, body) => post({ action: "sendAnnouncement", classId, body }, "تعذر إرسال الإعلان.")
  };
}

export interface StudentMessagesClient {
  load(): Promise<StudentMessagesData>;
  sendDirect(body: string): Promise<MessageView>;
}

export function createStudentMessagesClient(token: string): StudentMessagesClient {
  const headers = { "x-student-token": token, Authorization: "Bearer " + token, "content-type": "application/json" };
  return {
    async load() {
      const r = await fetch("/api/student-messages", { headers });
      const j = await readJson(r);
      if (!r.ok || !j.ok) fail(j, r.status, "تعذر تحميل الرسائل.");
      const c = j.classroom as StudentMessagesData["classroom"];
      return { direct: asMessages(j.direct), announcements: asMessages(j.announcements), classroom: c && typeof c === "object" ? c : null, canSend: j.canSend === true, readOnlyReason: String(j.readOnlyReason || "") };
    },
    async sendDirect(body) {
      // The ONLY student action; no recipient / class / sender field exists in this request.
      const r = await fetch("/api/student-messages", { method: "POST", headers, body: JSON.stringify({ action: "sendDirect", body }) });
      const j = await readJson(r);
      if (!r.ok || !j.ok || !j.message) fail(j, r.status, "تعذر إرسال الرسالة.");
      return j.message as MessageView;
    }
  };
}

/** Insert a server-confirmed message into a thread (id-deduplicated, chronological by the sortable server id). */
export function mergeMessage(list: MessageView[], message: MessageView): MessageView[] {
  if (list.some(m => m.messageId === message.messageId)) return list;
  return [...list, message].sort((a, b) => (a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0));
}

/** Human-readable Arabic date + time for a message timestamp. */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  try { return d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }); } catch { return d.toISOString(); }
}
