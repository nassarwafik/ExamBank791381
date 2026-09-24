import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronBack } from "../icons";
import { useAutoRefresh } from "../ui/useAutoRefresh";
import { MessageComposer, MessageThread } from "./MessageParts";
import {
  MESSAGES_POLL_MS, MessagesHttpError, createStudentMessagesClient, mergeMessage,
  type MessageView, type StudentMessagesClient, type StudentMessagesData
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
 */
type Tab = "direct" | "announcements";

export default function StudentMessagesPage({ token, onBack, client: injected }: { token: string; onBack: () => void; client?: StudentMessagesClient }) {
  const client = useMemo(() => injected || createStudentMessagesClient(token), [injected, token]);
  const [data, setData] = useState<StudentMessagesData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("direct");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const gen = useRef(0);
  // Server-CONFIRMED replies sent from this view; every applied read is unioned with them so a lagging read can never
  // drop a reply the server already accepted.
  const confirmed = useRef<MessageView[]>([]);

  async function load(silent: boolean) {
    const mine = gen.current;
    try {
      const next = await client.load();
      if (mine !== gen.current) return;                               // superseded (a send happened) → discard
      setData({ ...next, direct: confirmed.current.reduce(mergeMessage, next.direct) });
      setError("");
    } catch (e) {
      if (mine !== gen.current) return;
      const text = e instanceof MessagesHttpError && e.status === 401 ? "تعذر التحقق من الجلسة. عد إلى لوحتك ثم حاول مرة أخرى." : e instanceof Error ? e.message : "تعذر تحميل الرسائل.";
      if (!silent || !data) setError(text);                           // a failed poll keeps the last-good messages
    }
  }

  // Initial load when the view opens (the timer below only handles subsequent refreshes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false); }, [client]);
  useAutoRefresh(() => load(true), { intervalMs: MESSAGES_POLL_MS, enabled: !sending });

  async function send() {
    const body = draft;
    if (sending || !body.trim()) return;
    setSending(true); setSendError("");
    gen.current += 1;                                                 // invalidate any in-flight poll
    try {
      const message = await client.sendDirect(body);
      gen.current += 1;
      confirmed.current = [...confirmed.current, message];
      setData(prev => (prev ? { ...prev, direct: mergeMessage(prev.direct, message) } : prev));
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
        <h1 id="eb-msg-student-title" className="eb-msg-title">الرسائل</h1>
        {data?.classroom && <p className="eb-muted">{data.classroom.name}{data.classroom.archived ? " — مؤرشف" : ""}</p>}
        {error && <p className="platform-error" role="alert">{error}</p>}
        {!data && !error && <p className="eb-muted" role="status">جارٍ تحميل الرسائل...</p>}

        <div className="eb-msg-tabs" role="tablist" aria-label="أقسام الرسائل">
          <button type="button" role="tab" id="eb-smsg-tab-direct" aria-selected={tab === "direct"} aria-controls="eb-smsg-panel" className="eb-msg-tab" onClick={() => setTab("direct")}>المحادثة مع المعلم</button>
          <button type="button" role="tab" id="eb-smsg-tab-ann" aria-selected={tab === "announcements"} aria-controls="eb-smsg-panel" className="eb-msg-tab" onClick={() => setTab("announcements")}>إعلانات الصف</button>
        </div>

        <div id="eb-smsg-panel" role="tabpanel" aria-labelledby={tab === "direct" ? "eb-smsg-tab-direct" : "eb-smsg-tab-ann"} className="eb-msg-panel">
          {data && tab === "direct" && (
            <div className="eb-msg-conversation">
              <MessageThread
                messages={data.direct}
                ariaLabel="المحادثة مع المعلم"
                emptyText="لا توجد رسائل بعد. يمكنك مراسلة معلمك من هنا."
                isMine={m => m.senderRole === "student"}
                labelFor={m => (m.senderRole === "student" ? "أنت" : "المعلم" + (m.senderDisplayName && m.senderDisplayName !== "المعلم" ? " — " + m.senderDisplayName : ""))}
              />
              {data.canSend
                ? <MessageComposer label="رسالتك إلى المعلم" buttonLabel="إرسال" value={draft} onChange={setDraft} onSend={() => void send()} sending={sending} error={sendError} />
                : <p className="eb-msg-readonly" role="note">{data.readOnlyReason || "المحادثة متاحة للقراءة فقط."}</p>}
            </div>
          )}
          {data && tab === "announcements" && (
            <div className="eb-msg-announcements">
              <MessageThread
                messages={data.announcements}
                ariaLabel="إعلانات الصف"
                emptyText="لا توجد إعلانات لصفك بعد."
                isMine={() => false}
                labelFor={m => m.senderDisplayName || "المعلم"}
              />
              <p className="eb-muted">الإعلانات للقراءة فقط. للرد على المعلم استخدم «المحادثة مع المعلم».</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
