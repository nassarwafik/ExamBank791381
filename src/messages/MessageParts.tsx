import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import VisuallyHidden from "../ui/VisuallyHidden";
import { MAX_MESSAGE_LENGTH, canDeleteMessage, canEditMessage, deletedMessageText, formatMessageTime, type MessageView } from "./messagesClient";
import { isNearBottom, shouldScrollToNewest, useActionClock, useTodayStart } from "./messagesLayout";
import { avatarTone, initialsOf, layoutThread, messageClock } from "./threadLayout";

// Phase 5C — presentational pieces shared by the teacher and student messaging pages. Message bodies are rendered as
// ordinary React TEXT nodes (never dangerouslySetInnerHTML, never Markdown/HTML/link interpretation); the CSS keeps
// newlines (white-space: pre-wrap) and wraps long words. Sender identity is ALWAYS a text label, never colour alone.
// Messages M.2 — presentation: day separators («اليوم» / «أمس» / date), consecutive messages of one sender grouped
// (the label is drawn once per group and stays in the accessibility tree for the rest), the clock time inside the
// bubble with the full date-time as its tooltip, a "feed" variant for announcements, avatars and empty states.
// Messages M.5 — a deleted message is drawn as a muted placeholder (its text no longer exists), an edited one carries
// «مُعدّلة». With `actions`, a message offers «تعديل» (inline editor: Ctrl+Enter saves, Escape cancels) and «حذف» (an
// inline confirmation) — only while the SERVER's hints allow it (editableUntil / canDelete / deletableUntil); the
// server decides every change again and its error is shown on the message.

type ThreadProps = {
  messages: MessageView[];
  /** The visible sender label for a message (e.g. «أنت» / «المعلم» / the student's name). */
  labelFor: (m: MessageView) => string;
  /** Messages authored by the current viewer (styled as "mine"; the label still says so in text). */
  isMine: (m: MessageView) => boolean;
  emptyText: string;
  ariaLabel: string;
  /**
   * Phase 5E (opt-in): the identity of the thread on screen. When given, the list is a scroll region that opens at
   * the newest message, follows new messages while the reader is at the bottom, jumps to the viewer's own newly
   * sent message, and never pulls a reader who scrolled up to older history back down on a poll.
   */
  followKey?: string;
  /** M.2 — "chat" bubbles (default) or a "feed" of full-width cards (class announcements). */
  variant?: "chat" | "feed";
  /** M.2 — the clock used for «اليوم» / «أمس» (tests pin it; defaults to the start of the current local day). */
  nowMs?: number;
  /** M.5 — edit / delete callbacks (each resolves once the server stored the change, or rejects with its error). */
  actions?: MessageActions;
};

export type MessageActions = {
  onEdit?: (m: MessageView, body: string) => Promise<void>;
  onDelete?: (m: MessageView) => Promise<void>;
  /** The confirmation question shown before deleting `m` (default: a generic one). */
  deletePrompt?: (m: MessageView) => string;
};

const errorOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function MessageThread({ messages, labelFor, isMine, emptyText, ariaLabel, followKey, variant = "chat", nowMs, actions }: ThreadProps) {
  const listRef = useRef<HTMLOListElement>(null);
  // M.5 — at most one message is being edited or confirmed for deletion at a time; `busy` while its request runs.
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [confirming, setConfirming] = useState("");
  const [busy, setBusy] = useState("");
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const nearBottom = useRef(true);                                   // "following" until the reader scrolls up
  const last = useRef<{ key: string | undefined; newestId: string; oldestId: string; height: number }>({ key: undefined, newestId: "", oldestId: "", height: 0 });
  const newest = messages.length ? messages[messages.length - 1] : null;
  const today = useTodayStart();
  const actionNow = useActionClock();
  useLayoutEffect(() => {
    if (followKey === undefined) return;
    const threadChanged = last.current.key !== followKey;
    const newestId = newest ? newest.messageId : "";
    const oldestId = messages.length ? messages[0].messageId : "";
    const newestChanged = newestId !== last.current.newestId;
    const olderPrepended = !threadChanged && !newestChanged && !!last.current.oldestId && oldestId < last.current.oldestId;
    const prevHeight = last.current.height;
    if (threadChanged) nearBottom.current = true;
    const el = listRef.current;
    last.current = { key: followKey, newestId, oldestId, height: el ? el.scrollHeight : 0 };
    if (!el) return;
    if (olderPrepended) {                                            // M.3 — older history loaded above: keep the reader's place
      el.scrollTop += el.scrollHeight - prevHeight;
      return;
    }
    if (shouldScrollToNewest({ threadChanged, wasNearBottom: nearBottom.current, newestChanged, newestIsMine: !!newest && isMine(newest) })) {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
    }
    last.current.height = el.scrollHeight;
  });
  if (!messages.length) return <p className="eb-msg-empty">{emptyText}</p>;
  const rows = layoutThread(messages, nowMs ?? today);
  async function saveEdit(m: MessageView) {
    if (!actions?.onEdit || !editing || editing.id !== m.messageId || busy) return;
    const body = editing.draft;
    if (!body.trim() || body === m.body) { setEditing(null); return; }
    setBusy(m.messageId); setRowError(null);
    try { await actions.onEdit(m, body); setEditing(null); }
    catch (e) { setRowError({ id: m.messageId, text: errorOf(e, "تعذر تعديل الرسالة.") }); }
    finally { setBusy(""); }
  }
  async function confirmDelete(m: MessageView) {
    if (!actions?.onDelete || busy) return;
    setBusy(m.messageId); setRowError(null);
    try { await actions.onDelete(m); setConfirming(""); }
    catch (e) { setRowError({ id: m.messageId, text: errorOf(e, "تعذر حذف الرسالة.") }); }
    finally { setBusy(""); }
  }
  return (
    <ol
      ref={listRef}
      className={"eb-msg-thread" + (variant === "feed" ? " is-feed" : "")}
      aria-label={ariaLabel}
      tabIndex={followKey !== undefined ? 0 : undefined}
      onScroll={followKey !== undefined ? e => { nearBottom.current = isNearBottom(e.currentTarget); } : undefined}
    >
      {rows.map(({ message: m, day, continued }) => {
        const sender = <strong className="eb-msg-sender">{labelFor(m)}</strong>;
        const isEditing = !!editing && editing.id === m.messageId && !m.deleted;
        const isConfirming = confirming === m.messageId && !m.deleted;
        const mayEdit = !!actions?.onEdit && canEditMessage(m, actionNow);
        const mayDelete = !!actions?.onDelete && canDeleteMessage(m, actionNow);
        const working = busy === m.messageId;
        const error = rowError && rowError.id === m.messageId ? rowError.text : "";
        return (
          <li key={m.messageId} className={"eb-msg" + (isMine(m) ? " is-mine" : " is-theirs") + (continued ? " is-continued" : "") + (m.deleted ? " is-deleted" : "")}>
            {day && <p className="eb-msg-day"><span>{day}</span></p>}
            <div className="eb-msg-bubble">
              <div className="eb-msg-meta">{continued ? <VisuallyHidden>{sender}</VisuallyHidden> : sender}</div>
              {m.deleted
                ? <p className="eb-msg-body is-deleted">{deletedMessageText(m)}</p>
                : isEditing
                  ? (
                    <form className="eb-msg-edit" onSubmit={e => { e.preventDefault(); void saveEdit(m); }}>
                      <textarea
                        className="eb-msg-input eb-msg-edit-input"
                        aria-label="تعديل الرسالة"
                        value={editing.draft}
                        maxLength={MAX_MESSAGE_LENGTH}
                        rows={3}
                        disabled={working}
                        autoFocus
                        onChange={e => setEditing({ id: m.messageId, draft: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === "Escape") { e.preventDefault(); setEditing(null); setRowError(null); return; }
                          if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return;
                          e.preventDefault();
                          void saveEdit(m);
                        }}
                      />
                      <div className="eb-msg-edit-row">
                        <button type="submit" className="eb-button is-primary is-small" disabled={working || !editing.draft.trim()}>{working ? "جارٍ الحفظ..." : "حفظ"}</button>
                        <button type="button" className="eb-button is-quiet is-small" disabled={working} onClick={() => { setEditing(null); setRowError(null); }}>إلغاء</button>
                      </div>
                    </form>
                  )
                  : <p className="eb-msg-body">{m.body}</p>}
              <div className="eb-msg-foot">
                {(mayEdit || mayDelete) && !isEditing && !isConfirming && (
                  <span className="eb-msg-actions">
                    {mayEdit && <button type="button" className="eb-msg-action" disabled={!!busy} aria-label="تعديل الرسالة" onClick={() => { setConfirming(""); setRowError(null); setEditing({ id: m.messageId, draft: m.body }); }}>تعديل</button>}
                    {mayDelete && <button type="button" className="eb-msg-action is-danger" disabled={!!busy} aria-label="حذف الرسالة" onClick={() => { setEditing(null); setRowError(null); setConfirming(m.messageId); }}>حذف</button>}
                  </span>
                )}
                {m.editedAt && !m.deleted && <span className="eb-msg-edited" title={"عُدّلت " + formatMessageTime(m.editedAt)}>مُعدّلة</span>}
                <time className="eb-msg-time" dateTime={m.createdAt} title={formatMessageTime(m.createdAt)}>{messageClock(m.createdAt)}</time>
              </div>
              {isConfirming && (
                <div className="eb-msg-confirm" role="group" aria-label="تأكيد حذف الرسالة">
                  <span className="eb-msg-confirm-text">{actions?.deletePrompt ? actions.deletePrompt(m) : "حذف هذه الرسالة نهائيًا؟ لا يمكن التراجع عن ذلك."}</span>
                  <span className="eb-msg-confirm-row">
                    <button type="button" className="eb-button is-danger is-small" disabled={working} onClick={() => void confirmDelete(m)}>{working ? "جارٍ الحذف..." : "حذف"}</button>
                    <button type="button" className="eb-button is-quiet is-small" disabled={working} onClick={() => { setConfirming(""); setRowError(null); }}>إلغاء</button>
                  </span>
                </div>
              )}
              {error && <p className="eb-msg-error eb-msg-row-error" role="alert">{error}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** M.3 — the older-history control above a thread: a button while older messages exist, its own error line. */
export function OlderMessagesBar({ hasMore, loading, error, onLoad }: { hasMore: boolean; loading: boolean; error: string; onLoad: () => void }) {
  if (!hasMore && !error) return null;
  return (
    <div className="eb-msg-older">
      {hasMore && <button type="button" className="eb-msg-older-btn" onClick={onLoad} disabled={loading}>{loading ? "جارٍ تحميل الرسائل الأقدم..." : "عرض الرسائل الأقدم"}</button>}
      {error && <p className="eb-msg-error" role="alert">{error}</p>}
    </div>
  );
}

/** M.3 — shown while unread messages are held back until the ones on screen are read (they follow automatically). */
export function NewerMessagesNote() {
  return <p className="eb-msg-newer" role="status">توجد رسائل أحدث، تظهر تلقائيًا بعد قراءة الرسائل المعروضة.</p>;
}

/** M.2 — a decorative initials avatar (aria-hidden: the name next to it is the accessible text). */
export function MessageAvatar({ name, id, size = "md" }: { name: string; id: string; size?: "sm" | "md" }) {
  return <span className={"eb-msg-avatar is-" + size + " tone-" + avatarTone(id || name)} aria-hidden="true">{initialsOf(name)}</span>;
}

/** M.2 — an empty / placeholder state: icon, one line of text, an optional hint and actions. */
export function MessagesEmptyState({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="eb-msg-placeholder">
      <span className="eb-msg-placeholder-icon" aria-hidden="true">{icon}</span>
      <p className="eb-msg-placeholder-title">{title}</p>
      {hint && <p className="eb-msg-placeholder-hint">{hint}</p>}
      {children}
    </div>
  );
}

type ComposerProps = {
  label: string;
  buttonLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string;
  placeholder?: string;
};

/** Characters left at which the counter turns into a visible warning. */
const NEAR_LIMIT = 200;

/**
 * Plain-text composer: labelled textarea (2000 max), a real disabled state while sending, errors kept visible.
 * M.2 — Ctrl+Enter (⌘+Enter on macOS) sends; plain Enter keeps inserting a new line (multi-line messages, phones).
 */
export function MessageComposer({ label, buttonLabel, value, onChange, onSend, sending, error, placeholder }: ComposerProps) {
  const id = useId();
  const hintId = id + "-hint";
  const trimmed = value.trim();
  const near = MAX_MESSAGE_LENGTH - value.length <= NEAR_LIMIT;
  return (
    <form className="eb-msg-composer" onSubmit={e => { e.preventDefault(); if (!sending && trimmed) onSend(); }}>
      <label htmlFor={id} className="eb-msg-composer-label">{label}</label>
      <textarea
        id={id}
        className="eb-msg-input"
        value={value}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={3}
        placeholder={placeholder}
        disabled={sending}
        aria-describedby={hintId}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (!sending && trimmed) onSend();
        }}
      />
      <div className="eb-msg-composer-row">
        <span id={hintId} className="eb-msg-hint">Ctrl + Enter للإرسال</span>
        <span className={"eb-msg-count" + (near ? " is-near" : "")} aria-live="off">{value.length}/{MAX_MESSAGE_LENGTH}</span>
        <button type="submit" className="eb-button is-primary" disabled={sending || !trimmed}>{sending ? "جارٍ الإرسال..." : buttonLabel}</button>
      </div>
      {error && <p className="eb-msg-error" role="alert">{error}</p>}
    </form>
  );
}
