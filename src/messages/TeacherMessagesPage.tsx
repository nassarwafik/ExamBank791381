import { useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import { useAutoRefresh } from "../ui/useAutoRefresh";
import { normalizeClassStatus } from "../classLifecycle";
import type { Classroom, Student } from "../students/types";
import { MessageComposer, MessageThread } from "./MessageParts";
import {
  MESSAGES_POLL_MS, UNREAD_POLL_MS, createTeacherMessagesClient, mergeMessage, formatUnread, readAckFromSnapshot, ackKey,
  type MessageView, type TeacherMessagesClient, type ThreadState, type UnreadCount, type ReadAck
} from "./messagesClient";
import "./messages.css";

/**
 * Phase 5C — the teacher «الرسائل» destination. Two modes over ONE selected class (from the existing /api/classrooms):
 *  - «محادثات الطلاب»: pick a student from the existing roster API (/api/students, archived included for history)
 *    → the direct conversation with that ONE student.
 *  - «إعلانات الصف»: the class's one-way announcement history + composer.
 * Archived classes stay selectable and fully READABLE; the server's `canSend` decides whether a composer appears.
 *
 * Race safety (deterministic): every thread read captures `threadGen`; switching class / student / tab and every
 * send bump it, so a late response for a previous selection — or a poll that started before a send — is discarded
 * and can never overwrite the newer thread or erase a just-sent message. The roster has its own `rosterGen`.
 * Polling: only the currently visible thread, every 5s, via the shared single-flight useAutoRefresh (paused while
 * the tab is hidden and while a send is in flight; torn down on unmount). Classes/roster are NOT re-polled.
 *
 * Phase 5D — unread: the selected class's per-student unread replies (server summary, refreshed every 15s) show as
 * «N جديدة» in the roster. When a student's conversation snapshot loads and is STILL the current, visible thread, it
 * is acknowledged from THAT GET snapshot only: the latest STUDENT message shown + the student ids at its millisecond
 * (the teacher's own messages never move the boundary; nothing is marked when no student message was shown). The badge
 * only changes from the server's response, never optimistically. A stale response for a previous student returns before this point, so it can never
 * mark the wrong thread; a failed mark leaves the badge until a later successful one. Mark responses are ordered per
 * thread (`markSeq`): only the NEWEST mark request started for a thread may apply its count — an older request that
 * resolves later (even successfully) is ignored for the UI, so a stale count can never overwrite a fresher one.
 */
type Tab = "direct" | "announcements";
const ARCHIVED_CLASS_TEXT = "هذا الصف مؤرشف. الرسائل السابقة متاحة للقراءة فقط.";
type Thread = ThreadState & { key: string };

function studentStatus(s: Student): { label: string; code: "active" | "disabled" | "archived" } {
  if (s.archived) return { label: "مؤرشف", code: "archived" };
  if (s.active === false) return { label: "معطّل", code: "disabled" };
  return { label: "نشط", code: "active" };
}

export default function TeacherMessagesPage({ token, client: injected, onUnreadChanged }: { token: string; client?: TeacherMessagesClient; onUnreadChanged?: () => void }) {
  const client = useMemo(() => injected || createTeacherMessagesClient(token), [injected, token]);
  const [classes, setClasses] = useState<Classroom[] | null>(null);
  const [classesError, setClassesError] = useState("");
  const [classId, setClassId] = useState("");
  const [tab, setTab] = useState<Tab>("direct");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const rosterGen = useRef(0);
  const threadGen = useRef(0);
  const activeKey = useRef("");      // the thread currently on screen ("dm:<studentId>" | "ann:<classId>" | "")
  // Server-CONFIRMED messages sent from this page for the current thread. Every applied read is unioned with them, so
  // no read (however late or lagging) can drop a message the server already accepted. Cleared on thread switch.
  const confirmed = useRef<{ key: string; messages: MessageView[] }>({ key: "", messages: [] });
  // Phase 5D — per-student unread replies for the selected class (server summary) + mark-read bookkeeping.
  const [unreadByStudent, setUnreadByStudent] = useState<Record<string, UnreadCount>>({});
  const summaryGen = useRef(0);
  const summaryClass = useRef("");
  const marked = useRef<Record<string, string>>({});        // thread key → last id successfully marked read
  const marking = useRef<Record<string, string>>({});       // thread key → id currently being marked (single-flight)
  const markSeq = useRef<Record<string, number>>({});       // thread key → sequence of the newest STARTED mark request

  useEffect(() => {
    let alive = true;
    client.listClasses()
      .then(list => { if (alive) setClasses(list); })
      .catch(e => { if (alive) { setClasses([]); setClassesError(e instanceof Error ? e.message : "تعذر تحميل الصفوف."); } });
    return () => { alive = false; };
  }, [client]);

  async function loadThread(key: string, silent: boolean) {
    if (!key) return;
    const gen = threadGen.current;
    try {
      const data = key.startsWith("ann:") ? await client.getAnnouncements(key.slice(4)) : await client.getDirect(key.slice(3));
      if (gen !== threadGen.current) return;                         // switched / sent meanwhile → stale, discard
      const own = confirmed.current.key === key ? confirmed.current.messages : [];
      const messages = own.reduce(mergeMessage, data.messages);
      setThread({ key, ...data, messages });
      setThreadError("");
      // Still the current thread (the gen check above) → acknowledge what THIS GET snapshot showed (student messages).
      if (key.startsWith("dm:")) {
        const ack = readAckFromSnapshot(data.messages, m => m.senderRole === "student");
        if (ack) void markThreadRead(key, ack);
      }
    } catch (e) {
      if (gen !== threadGen.current) return;
      if (!silent) setThreadError(e instanceof Error ? e.message : "تعذر تحميل الرسائل.");   // a failed poll keeps the last-good thread
    }
  }

  async function markThreadRead(key: string, ack: ReadAck) {
    if (activeKey.current !== key) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const throughMessageId = ackKey(ack);
    if (marked.current[key] === throughMessageId || marking.current[key] === throughMessageId) return;
    marking.current[key] = throughMessageId;
    const seq = (markSeq.current[key] = (markSeq.current[key] || 0) + 1);
    const sid = key.slice(3);
    try {
      const remaining = await client.markDirectRead(sid, ack);
      if (seq !== markSeq.current[key]) return;                      // a newer mark for this thread started → its count wins
      marked.current[key] = throughMessageId;
      summaryGen.current += 1;                                        // an older in-flight class summary can't restore the old count
      setUnreadByStudent(prev => ({ ...prev, [sid]: remaining }));
      onUnreadChanged?.();
    } catch {
      /* the unread indicator stays until a later successful mark */
    } finally {
      if (marking.current[key] === throughMessageId) delete marking.current[key];
    }
  }

  async function loadClassUnread(forClassId: string) {
    if (!forClassId) return;
    const gen = ++summaryGen.current;
    try {
      const summary = await client.getClassUnread(forClassId);
      if (gen !== summaryGen.current || summaryClass.current !== forClassId) return;
      setUnreadByStudent(summary.byStudent);
    } catch { /* keep the last-good indicators */ }
  }

  function switchThread(key: string) {
    threadGen.current += 1;
    activeKey.current = key;
    confirmed.current = { key, messages: [] };
    setThread(null); setThreadError(""); setDraft(""); setSendError("");
    void loadThread(key, false);
  }

  async function loadRoster(nextClassId: string) {
    const gen = ++rosterGen.current;
    try {
      const list = await client.listStudents(nextClassId);
      if (gen !== rosterGen.current) return;                         // an older class's roster → discard
      setStudents(list); setRosterError("");
    } catch (e) {
      if (gen !== rosterGen.current) return;
      setStudents([]); setRosterError(e instanceof Error ? e.message : "تعذر تحميل الطلاب.");
    }
  }

  function selectClass(nextClassId: string) {
    setClassId(nextClassId);
    setStudentId("");
    setStudents(null); setRosterError("");
    if (nextClassId) void loadRoster(nextClassId); else rosterGen.current += 1;
    summaryClass.current = nextClassId;
    summaryGen.current += 1;
    setUnreadByStudent({});
    void loadClassUnread(nextClassId);
    switchThread(tab === "announcements" && nextClassId ? "ann:" + nextClassId : "");
  }
  function selectTab(next: Tab) {
    setTab(next);
    switchThread(next === "announcements" ? (classId ? "ann:" + classId : "") : (studentId ? "dm:" + studentId : ""));
  }
  function selectStudent(nextStudentId: string) {
    setStudentId(nextStudentId);
    switchThread("dm:" + nextStudentId);
  }

  async function send() {
    const key = activeKey.current;
    const body = draft;
    if (!key || sending || !body.trim()) return;
    setSending(true); setSendError("");
    threadGen.current += 1;                                          // an in-flight poll can no longer land
    try {
      const message: MessageView = key.startsWith("ann:") ? await client.sendAnnouncement(key.slice(4), body) : await client.sendDirect(key.slice(3), body);
      threadGen.current += 1;
      if (activeKey.current !== key) return;                         // the teacher moved on; nothing to show here
      confirmed.current = { key, messages: [...confirmed.current.messages, message] };
      setThread(prev => (prev && prev.key === key ? { ...prev, messages: mergeMessage(prev.messages, message) } : prev));
      setDraft("");
      void loadThread(key, true);                                    // reconcile with the server
    } catch (e) {
      if (activeKey.current !== key) return;
      setSendError(e instanceof Error ? e.message : "تعذر إرسال الرسالة.");   // the typed text is kept
      void loadThread(key, true);                                    // e.g. became read-only → refresh canSend
    } finally {
      setSending(false);
    }
  }

  const threadKey = !classId ? "" : tab === "announcements" ? "ann:" + classId : studentId ? "dm:" + studentId : "";
  useAutoRefresh(() => loadThread(activeKey.current, true), { intervalMs: MESSAGES_POLL_MS, enabled: !!threadKey && !sending });
  useAutoRefresh(() => loadClassUnread(summaryClass.current), { intervalMs: UNREAD_POLL_MS, enabled: !!classId });

  const selectedClass = (classes || []).find(c => c.classId === classId) || null;
  const classArchived = selectedClass ? normalizeClassStatus(selectedClass) === "archived" : false;
  const shown = thread && thread.key === threadKey ? thread : null;
  const selectedStudent = (students || []).find(s => s.userId === studentId) || null;

  return (
    <section className="eb-msg-page" dir="rtl" aria-labelledby="eb-msg-teacher-title">
      <SectionHeader level={2} id="eb-msg-teacher-title" title="الرسائل" description="محادثة مباشرة مع كل طالب، وإعلانات لكامل الصف." />

      {classes === null && <p className="eb-muted" role="status">جارٍ تحميل الصفوف...</p>}
      {classesError && <p className="platform-error" role="alert">{classesError}</p>}

      {classes !== null && (
        <div className="eb-msg-toolbar">
          <label className="eb-msg-field">
            <span>الصف</span>
            <select value={classId} onChange={e => selectClass(e.target.value)} disabled={sending}>
              <option value="">اختر صفًا</option>
              {classes.map(c => (
                <option key={c.classId} value={c.classId}>{c.name}{normalizeClassStatus(c) === "archived" ? " — مؤرشف" : ""}</option>
              ))}
            </select>
          </label>
          {selectedClass && (
            <span className={"eb-msg-class-state" + (classArchived ? " is-archived" : "")}>{classArchived ? "الصف مؤرشف (للقراءة فقط)" : "الصف نشط"}</span>
          )}
        </div>
      )}

      {classId && (
        <>
          <div className="eb-msg-tabs" role="tablist" aria-label="نوع الرسائل">
            <button type="button" role="tab" id="eb-msg-tab-direct" aria-selected={tab === "direct"} aria-controls="eb-msg-panel" className="eb-msg-tab" onClick={() => selectTab("direct")} disabled={sending}>محادثات الطلاب</button>
            <button type="button" role="tab" id="eb-msg-tab-ann" aria-selected={tab === "announcements"} aria-controls="eb-msg-panel" className="eb-msg-tab" onClick={() => selectTab("announcements")} disabled={sending}>إعلانات الصف</button>
          </div>

          <div id="eb-msg-panel" role="tabpanel" aria-labelledby={tab === "direct" ? "eb-msg-tab-direct" : "eb-msg-tab-ann"} className="eb-msg-panel">
            {tab === "direct" && (
              <div className="eb-msg-direct">
                <div className="eb-msg-roster">
                  <h3 className="eb-msg-subtitle">الطلاب</h3>
                  {students === null && <p className="eb-muted" role="status">جارٍ تحميل الطلاب...</p>}
                  {rosterError && <p className="platform-error" role="alert">{rosterError}</p>}
                  {students && !students.length && !rosterError && <p className="eb-msg-empty">لا يوجد طلاب في هذا الصف.</p>}
                  {students && students.length > 0 && (
                    <ul className="eb-msg-roster-list" aria-label="طلاب الصف">
                      {students.map(s => {
                        const st = studentStatus(s);
                        const u = unreadByStudent[s.userId];
                        return (
                          <li key={s.userId}>
                            <button type="button" className={"eb-msg-roster-item is-" + st.code} aria-pressed={s.userId === studentId} onClick={() => selectStudent(s.userId)} disabled={sending}>
                              <span className="eb-msg-roster-name">{s.displayName}</span>
                              <span className="eb-msg-roster-status">{st.label}</span>
                              {u && u.unread > 0 && <span className="eb-msg-unread">{formatUnread(u.unread, u.capped)} جديدة</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="eb-msg-conversation">
                  {!studentId && <p className="eb-msg-empty">اختر طالبًا لعرض المحادثة.</p>}
                  {studentId && (
                    <>
                      <h3 className="eb-msg-subtitle">المحادثة مع {selectedStudent ? selectedStudent.displayName : "الطالب"}</h3>
                      {threadError && <p className="platform-error" role="alert">{threadError}</p>}
                      {!shown && !threadError && <p className="eb-muted" role="status">جارٍ تحميل المحادثة...</p>}
                      {shown && (
                        <>
                          <MessageThread
                            messages={shown.messages}
                            ariaLabel="المحادثة"
                            emptyText="لا توجد رسائل بعد."
                            isMine={m => m.senderRole === "teacher"}
                            labelFor={m => (m.senderRole === "teacher" ? "أنت" : m.senderDisplayName || "الطالب")}
                          />
                          {shown.canSend
                            ? <MessageComposer label="رسالة إلى الطالب" buttonLabel="إرسال" value={draft} onChange={setDraft} onSend={() => void send()} sending={sending} error={sendError} />
                            : <p className="eb-msg-readonly" role="note">{shown.readOnlyReason || "المحادثة متاحة للقراءة فقط."}</p>}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === "announcements" && (
              <div className="eb-msg-announcements">
                {threadError && <p className="platform-error" role="alert">{threadError}</p>}
                {!shown && !threadError && <p className="eb-muted" role="status">جارٍ تحميل الإعلانات...</p>}
                {shown && (
                  <>
                    <MessageThread
                      messages={shown.messages}
                      ariaLabel="إعلانات الصف"
                      emptyText="لا توجد إعلانات بعد."
                      isMine={() => true}
                      labelFor={m => m.senderDisplayName || "المعلم"}
                    />
                    {shown.canSend
                      ? <MessageComposer label="إعلان جديد للصف" buttonLabel="إرسال إعلان للصف" value={draft} onChange={setDraft} onSend={() => void send()} sending={sending} error={sendError} />
                      : <p className="eb-msg-readonly" role="note">{shown.readOnlyReason || ARCHIVED_CLASS_TEXT}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
