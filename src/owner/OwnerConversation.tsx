import { useState } from "react";
import { IconWarning } from "../icons";
import { ownerConversationsApi, type ApiResult, type OwnerConversationMessage } from "./ownerApi";

/**
 * Tadris+ P7-B1 — owner decision D14: «الاطلاع على المحادثة» of ONE student with their teacher. Read only (no reply, no edit, no
 * delete, no read state changes). Every opening — and every older page — needs a written reason and a recent second-factor check,
 * and is recorded in the owner's audit log and in the teacher's activity log («سجل نشاطي»), which this screen says before opening.
 */
type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
const MIN_REASON = 10;
const ROLE: Record<string, string> = { teacher: "المعلم", student: "الطالب" };
const two = (n: number) => String(n).padStart(2, "0");
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes()); };

export default function OwnerConversation({ token, studentId, studentName, busy, send, onClose, conversation }: {
  token: string; studentId: string; studentName: string; busy: boolean; send: Send; onClose: () => void;
  /** Tadris+ P11-B — the shared class whose conversation is read (the student's conversation with THAT class's teacher). */
  conversation?: string;
}) {
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<OwnerConversationMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const enough = reason.trim().length >= MIN_REASON;
  const open = (before?: string) => void send(() => ownerConversationsApi.open(token, studentId, reason.trim(), before, conversation), d => {
    setMessages(list => (before && list ? [...d.messages, ...list] : d.messages));
    setHasMore(d.hasMore);
  });
  return (
    <div className="eb-owner-confirm" role="region" aria-label={"محادثة " + studentName}>
      <p className="eb-owner-hint" role="note"><IconWarning size={16} aria-hidden="true" /> قراءة فقط. يُسجَّل كل اطلاع وسببه في سجل التدقيق، ويظهر للمعلم في سجل نشاطه.{conversation ? " هذه محادثة الطالب مع معلم هذا الصف فقط." : ""}</p>
      <label className="auth-field"><span>سبب الاطلاع (مطلوب، {MIN_REASON} أحرف على الأقل)</span>
        <div className="auth-input"><textarea value={reason} maxLength={500} rows={2} onChange={e => setReason(e.target.value)} /></div>
      </label>
      <div className="eb-owner-actions">
        {messages === null && <button type="button" className="eb-owner-secondary" disabled={busy || !enough} onClick={() => open()}>فتح المحادثة (قراءة فقط)</button>}
        {messages !== null && hasMore && <button type="button" className="eb-owner-secondary" disabled={busy || !enough} onClick={() => open(messages[0]?.messageId)}>عرض الرسائل الأقدم (اطلاع جديد يُسجَّل)</button>}
        <button type="button" className="eb-owner-secondary" onClick={onClose}>إغلاق</button>
      </div>
      {messages !== null && (messages.length === 0
        ? <p className="eb-owner-hint">لا توجد رسائل في هذه المحادثة.</p>
        : <ol className="eb-owner-hint" aria-label={"رسائل " + studentName}>
            {messages.map(m => (
              <li key={m.messageId}>
                <strong>{ROLE[m.senderRole] || m.senderRole}</strong> · <bdi>{m.senderDisplayName}</bdi> · <span dir="ltr">{when(m.createdAt)}</span>
                <p>{m.deleted ? <em>حُذفت هذه الرسالة.</em> : m.body}{m.editedAt ? <small> (معدّلة)</small> : null}</p>
              </li>
            ))}
          </ol>)}
    </div>
  );
}
