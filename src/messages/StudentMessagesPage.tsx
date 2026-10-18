import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronBack } from "../icons";
import { useAutoRefresh } from "../ui/useAutoRefresh";
import { MessageComposer, MessageThread, NewerMessagesNote, OlderMessagesBar, type MessageActions } from "./MessageParts";
import {
  MESSAGES_POLL_MS, UNREAD_POLL_MS, MessagesHttpError, createStudentMessagesClient, mergeMessage, replaceMessage, formatUnread, readAckFromSnapshot, ackKey, sendKeyFor,
  type MessageView, type StudentMessagesClient, type StudentMessagesData, type StudentUnread
} from "./messagesClient";
import "./messages.css";

/**
 * Phase 5C — the student's dedicated «الرسائل» view (a full-view swap over the portal, same pattern as Educational
 * Games; `onBack` returns to the portal). Two sections: the direct conversation with the teacher (the student may
 * reply) and the CURRENT class's announcements (read-only — replies go through the direct conversation).
 *
 * Session rule: /api/student-dashboard stays the ONLY session authority. A messaging failure — including a 401 —
 * degrades THIS view locally (an error line) and never logs the student out; the portal's own refresh handles
 * revocation when the student returns.
 * Polling: every 5s while this view is open (single-flight useAutoRefresh; paused while hidden and during a send;
 * torn down on back/unmount). Every read captures `gen`; a send bumps it, so a poll that started before the send
 * can never erase the just-sent reply.
 *
 * Phase 5D — unread: each tab shows its own server-derived unread count. A stream is marked read ONLY while it is the
 * visible tab and after its snapshot loaded: opening this view acknowledges the DIRECT conversation (the initial tab);
 * announcements only once «إعلانات الصف» is actually selected. The acknowledgement is built from the last APPLIED GET
 * snapshot only — direct: the latest TEACHER message shown + teacher ids at its millisecond (own replies never move the
 * boundary); announcements: the latest announcement + announcements at its millisecond. Counts change only from
 * the server's mark response (a message that arrived after the marked id stays unread) — never optimistically.
 * Mark responses are ordered: every mark request gets a sequence number, and only the NEWEST mark started for its stream
 * may apply — an older request resolving later (even successfully) is ignored entirely. A response also never
 * overwrites the OTHER stream's count when a mark for that stream started after it (that newer mark owns its count).
 * Phase 6C — `initialTab` (default "direct") lets the notification center open «إعلانات الصف» directly. It only
 * chooses the VISIBLE tab the view opens on: the same rule then acknowledges that tab once its snapshot loaded (the
 * other stream stays untouched until it is actually selected). The ordinary «الرسائل» entry keeps the default.
 * Messages M.2 — presentation only: the shared thread draws day separators and grouped bubbles, announcements are a
 * feed of cards, and the composer sends on Ctrl+Enter. The load / acknowledgement / send logic above is unchanged.
 * Messages M.3 — «عرض الرسائل الأقدم» per tab (`older`, display only: never an acknowledgement source, which stays the
 * GET snapshot). When the server held back unread messages beyond the frontier, a successful acknowledgement of the
 * shown ones reloads at once so the rest follow.
 * Messages M.5 — the student edits / deletes their OWN replies from the direct thread while the server allows it (15
 * minutes after sending). The stored version replaces the message on screen (snapshot, older pages, confirmed replies);
 * a read that started before the change is discarded (`gen`) and the view then reconciles with the server.
 */
export type StudentMessagesTab = "direct" | "announcements";
type Tab = StudentMessagesTab;

export default function StudentMessagesPage({ token, onBack, client: injected, onUnreadChange, initialTab = "direct" }: { token: string; onBack: () => void; client?: StudentMessagesClient; onUnreadChange?: (u: StudentUnread) => void; initialTab?: StudentMessagesTab }) {
  const client = useMemo(() => injected || createStudentMessagesClient(token), [injected, token]);
  const [data, setData] = useState<StudentMessagesData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const gen = useRef(0);
  const sendKey = useRef<{ thread: string; body: string; id: string } | null>(null);
  // Server-CONFIRMED replies sent from this view; every applied read is unioned with them so a lagging read can never
  // drop a reply the server already accepted.
  const confirmed = useRef<MessageView[]>([]);
  // Phase 5D — unread counts + mark-read bookkeeping.
  const [unread, setUnread] = useState<StudentUnread | null>(null);
  const tabRef = useRef<Tab>(initialTab);                    // the VISIBLE tab (set in the tab handler)
  const dataRef = useRef<StudentMessagesData | null>(null);  // the last applied GET snapshot (never locally merged state)
  const unreadGen = useRef(0);
  const alive = useRef(true);
  const marked = useRef<Record<Tab, string>>({ direct: "", announcements: "" });
  const marking = useRef<Record<Tab, string>>({ direct: "", announcements: "" });
  const markSeq = useRef(0);                                  // global start order of mark requests
  const latestMark = useRef<Record<Tab, number>>({ direct: 0, announcements: 0 });   // newest STARTED mark per stream
  const unreadRef = useRef<StudentUnread | null>(null);       // the last applied counts (for per-stream merging)
  type Older = { messages: MessageView[]; hasMore: boolean; loading: boolean; error: string };
  const [older, setOlder] = useState<Record<Tab, Older | null>>({ direct: null, announcements: null });
  const olderGen = useRef<Record<Tab, number>>({ direct: 0, announcements: 0 });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function applyUnread(u: StudentUnread) {
    unreadRef.current = u;
    setUnread(u);
    onUnreadChange?.(u);
  }
  async function loadUnread() {
    const mine = unreadGen.current;
    try {
      const u = await client.getUnread();
      if (mine !== unreadGen.current || !alive.current) return;       // a mark response is fresher → keep it
      applyUnread(u);
    } catch { /* keep the last-good counts */ }
  }
  /** A mark response owns ITS stream's count; the other stream's count is kept when a newer mark for it started. */
  function mergeMarkResponse(stream: Tab, seq: number, u: StudentUnread): StudentUnread {
    const other: Tab = stream === "direct" ? "announcements" : "direct";
    const cur = unreadRef.current;
    if (!cur || latestMark.current[other] < seq) return u;
    const d = stream === "direct" ? u.directUnread : cur.directUnread;
    const a = stream === "announcements" ? u.announcementUnread : cur.announcementUnread;
    const sum = d.unread + a.unread;
    return { directUnread: d, announcementUnread: a, totalUnread: Math.min(99, sum), totalCapped: d.capped || a.capped || sum > 99 };
  }
  /** Mark ONE stream read through the latest id of the last applied snapshot — only while it is the visible tab. */
  async function markVisible(stream: Tab) {
    const d = dataRef.current;
    if (!d || !alive.current || tabRef.current !== stream) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const ack = stream === "direct"
      ? readAckFromSnapshot(d.direct, m => m.senderRole === "teacher")
      : readAckFromSnapshot(d.announcements, () => true);
    if (!ack) return;                                                 // no incoming message shown → nothing to mark
    const through = ackKey(ack);
    if (marked.current[stream] === through || marking.current[stream] === through) return;
    marking.current[stream] = through;
    const seq = ++markSeq.current;
    latestMark.current[stream] = seq;
    try {
      const u = await client.markRead(stream, ack);
      if (seq !== latestMark.current[stream]) return;                // a newer mark for this stream started → ignore
      marked.current[stream] = through;
      unreadGen.current += 1;
      if (alive.current) applyUnread(mergeMarkResponse(stream, seq, u));
      // M.3 — messages held back by the frontier follow as soon as the shown ones are acknowledged.
      if (alive.current && (stream === "direct" ? d.directHasNewer : d.announcementsHasNewer)) void load(true);
    } catch {
      /* the badge stays until a later successful mark */
    } finally {
      if (marking.current[stream] === through) marking.current[stream] = "";
    }
  }

  async function load(silent: boolean) {
    const mine = gen.current;
    try {
      const next = await client.load();
      if (mine !== gen.current) return;                               // superseded (a send happened) → discard
      const applied = { ...next, direct: confirmed.current.reduce(mergeMessage, next.direct) };
      dataRef.current = next;                                         // the acknowledgement uses the GET snapshot only
      setData(applied);
      setError("");
      void markVisible(tabRef.current);                               // only the currently visible stream
    } catch (e) {
      if (mine !== gen.current) return;
      const text = e instanceof MessagesHttpError && e.status === 401 ? "تعذر التحقق من الجلسة. عد إلى لوحتك ثم حاول مرة أخرى." : e instanceof Error ? e.message : "تعذر تحميل الرسائل.";
      if (!silent || !data) setError(text);                           // a failed poll keeps the last-good messages
    }
  }

  // Initial load when the view opens (the timer below only handles subsequent refreshes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false); void loadUnread(); }, [client]);
  useAutoRefresh(() => load(true), { intervalMs: MESSAGES_POLL_MS, enabled: !sending });
  useAutoRefresh(loadUnread, { intervalMs: UNREAD_POLL_MS });

  /** M.3 — the page before the oldest message shown in one tab (display only). */
  async function loadOlder(stream: Tab, oldestId: string) {
    if (!client.loadOlder || !oldestId) return;
    const gen = ++olderGen.current[stream];
    setOlder(prev => ({ ...prev, [stream]: { messages: prev[stream]?.messages || [], hasMore: true, loading: true, error: "" } }));
    try {
      const page = await client.loadOlder(stream, oldestId);
      if (gen !== olderGen.current[stream] || !alive.current) return;
      setOlder(prev => ({ ...prev, [stream]: { messages: page.messages.reduce(mergeMessage, prev[stream]?.messages || []), hasMore: page.hasMore, loading: false, error: "" } }));
    } catch (e) {
      if (gen !== olderGen.current[stream] || !alive.current) return;
      setOlder(prev => ({ ...prev, [stream]: { messages: prev[stream]?.messages || [], hasMore: true, loading: false, error: e instanceof Error ? e.message : "تعذر تحميل الرسائل الأقدم." } }));
    }
  }
  const shownOf = (stream: Tab, latest: MessageView[]) => {
    const o = older[stream];
    return o ? o.messages.reduce(mergeMessage, latest) : latest;
  };
  const bar = (stream: Tab, list: MessageView[], hasMoreLatest: boolean | undefined) => {
    const o = older[stream];
    if (!client.loadOlder) return null;
    return <OlderMessagesBar hasMore={o ? o.hasMore : hasMoreLatest === true} loading={!!o && o.loading} error={o ? o.error : ""} onLoad={() => void loadOlder(stream, list.length ? list[0].messageId : "")} />;
  };

  const sessionText = (e: unknown, fallback: string) => (e instanceof MessagesHttpError && e.status === 401 ? "تعذر التحقق من الجلسة. عد إلى لوحتك ثم حاول مرة أخرى." : e instanceof Error && e.message ? e.message : fallback);
  function directActions(): MessageActions | undefined {
    const edit = client.editMessage, remove = client.deleteMessage;
    if (!edit || !remove) return undefined;
    const apply = (message: MessageView) => {
      gen.current += 1;
      confirmed.current = replaceMessage(confirmed.current, message);
      setData(prev => (prev ? { ...prev, direct: replaceMessage(prev.direct, message) } : prev));
      setOlder(prev => (prev.direct ? { ...prev, direct: { ...prev.direct, messages: replaceMessage(prev.direct.messages, message) } } : prev));
      void load(true);
    };
    const run = async (call: () => Promise<MessageView>, fallback: string) => {
      try { apply(await call()); }
      catch (e) { void load(true); throw new Error(sessionText(e, fallback)); }
    };
    return {
      onEdit: (m, body) => run(() => edit(m.messageId, body), "تعذر تعديل الرسالة."),
      onDelete: m => run(() => remove(m.messageId), "تعذر حذف الرسالة.")
    };
  }

  function selectTab(next: Tab) {
    setTab(next);
    tabRef.current = next;
    void markVisible(next);                                           // the snapshot already loaded for this tab
  }

  async function send() {
    const body = draft;
    if (sending || !body.trim()) return;
    setSending(true); setSendError("");
    gen.current += 1;                                                 // invalidate any in-flight poll
    // M.1 — one idempotency key per composed reply, reused while the text is unchanged (a retry never duplicates it).
    sendKey.current = sendKeyFor(sendKey.current, "direct", body);
    try {
      const message = await client.sendDirect(body, sendKey.current.id);
      sendKey.current = null;
      gen.current += 1;
      confirmed.current = [...confirmed.current, message];
      setData(prev => (prev ? { ...prev, direct: mergeMessage(prev.direct, message) } : prev));   // not an ack source
      setDraft("");
      void load(true);                                                // reconcile with the server
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "تعذر إرسال الرسالة.");   // the typed reply is kept
      void load(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="student-portal eb-student-shell eb-msg-surface" dir="rtl">
      <div className="eb-msg-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة
        </button>
      </div>
      <section className="eb-msg-student" aria-labelledby="eb-msg-student-title">
        <header className="eb-msg-student-head">
          <h1 id="eb-msg-student-title" className="eb-msg-title">الرسائل</h1>
          {data?.classroom && <p className="eb-muted eb-msg-student-class">{data.classroom.name}{data.classroom.archived ? " — مؤرشف" : ""}</p>}
        </header>
        {error && <p className="platform-error" role="alert">{error}</p>}
        {!data && !error && <p className="eb-muted" role="status">جارٍ تحميل الرسائل...</p>}

        {/* Phase 8B — one light card: tabs on top, the conversation with inner gutters, the composer as its footer. */}
        <div className="eb-msg-student-card">
        <div className="eb-msg-tabs" role="tablist" aria-label="أقسام الرسائل">
          <button type="button" role="tab" id="eb-smsg-tab-direct" aria-selected={tab === "direct"} aria-controls="eb-smsg-panel" className="eb-msg-tab" onClick={() => selectTab("direct")}>المحادثة مع المعلم{unread && unread.directUnread.unread > 0 && <span className="eb-msg-tab-badge">{formatUnread(unread.directUnread.unread, unread.directUnread.capped)} غير مقروءة</span>}</button>
          <button type="button" role="tab" id="eb-smsg-tab-ann" aria-selected={tab === "announcements"} aria-controls="eb-smsg-panel" className="eb-msg-tab" onClick={() => selectTab("announcements")}>إعلانات الصف{unread && unread.announcementUnread.unread > 0 && <span className="eb-msg-tab-badge">{formatUnread(unread.announcementUnread.unread, unread.announcementUnread.capped)} غير مقروءة</span>}</button>
        </div>

        <div id="eb-smsg-panel" role="tabpanel" aria-labelledby={tab === "direct" ? "eb-smsg-tab-direct" : "eb-smsg-tab-ann"} className="eb-msg-panel">
          {data && tab === "direct" && (
            <div className="eb-msg-conversation">
              <div className="eb-msg-student-thread">
              {bar("direct", shownOf("direct", data.direct), data.directHasMore)}
              <MessageThread
                messages={shownOf("direct", data.direct)}
                ariaLabel="المحادثة مع المعلم"
                emptyText="لا توجد رسائل بعد. يمكنك مراسلة معلمك من هنا."
                isMine={m => m.senderRole === "student"}
                labelFor={m => (m.senderRole === "student" ? "أنت" : "المعلم" + (m.senderDisplayName && m.senderDisplayName !== "المعلم" ? " — " + m.senderDisplayName : ""))}
                actions={directActions()}
              />
              {data.directHasNewer && <NewerMessagesNote />}
              </div>
              <div className="eb-msg-student-foot">
              {data.canSend
                ? <MessageComposer label="رسالتك إلى المعلم" buttonLabel="إرسال" value={draft} onChange={setDraft} onSend={() => void send()} sending={sending} error={sendError} placeholder="اكتب رسالتك إلى المعلم..." />
                : <p className="eb-msg-readonly" role="note">{data.readOnlyReason || "المحادثة متاحة للقراءة فقط."}</p>}
              </div>
            </div>
          )}
          {data && tab === "announcements" && (
            <div className="eb-msg-announcements">
              <div className="eb-msg-student-thread">
              {bar("announcements", shownOf("announcements", data.announcements), data.announcementsHasMore)}
              <MessageThread
                messages={shownOf("announcements", data.announcements)}
                ariaLabel="إعلانات الصف"
                emptyText="لا توجد إعلانات لصفك بعد."
                isMine={() => false}
                labelFor={m => m.senderDisplayName || "المعلم"}
                variant="feed"
              />
              {data.announcementsHasNewer && <NewerMessagesNote />}
              </div>
              <p className="eb-muted eb-msg-student-note">الإعلانات للقراءة فقط. للرد على المعلم استخدم «المحادثة مع المعلم».</p>
            </div>
          )}
        </div>
        </div>
      </section>
    </main>
  );
}
