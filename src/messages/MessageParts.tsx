import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import VisuallyHidden from "../ui/VisuallyHidden";
import { MAX_MESSAGE_LENGTH, formatMessageTime, type MessageView } from "./messagesClient";
import { isNearBottom, shouldScrollToNewest, useTodayStart } from "./messagesLayout";
import { avatarTone, initialsOf, layoutThread, messageClock } from "./threadLayout";

// Phase 5C — presentational pieces shared by the teacher and student messaging pages. Message bodies are rendered as
// ordinary React TEXT nodes (never dangerouslySetInnerHTML, never Markdown/HTML/link interpretation); the CSS keeps
// newlines (white-space: pre-wrap) and wraps long words. Sender identity is ALWAYS a text label, never colour alone.
// Messages M.2 — presentation: day separators («اليوم» / «أمس» / date), consecutive messages of one sender grouped
// (the label is drawn once per group and stays in the accessibility tree for the rest), the clock time inside the
// bubble with the full date-time as its tooltip, a "feed" variant for announcements, avatars and empty states.

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
};

export function MessageThread({ messages, labelFor, isMine, emptyText, ariaLabel, followKey, variant = "chat", nowMs }: ThreadProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const nearBottom = useRef(true);                                   // "following" until the reader scrolls up
  const last = useRef<{ key: string | undefined; newestId: string }>({ key: undefined, newestId: "" });
  const newest = messages.length ? messages[messages.length - 1] : null;
  const today = useTodayStart();
  useLayoutEffect(() => {
    if (followKey === undefined) return;
    const threadChanged = last.current.key !== followKey;
    const newestId = newest ? newest.messageId : "";
    const newestChanged = newestId !== last.current.newestId;
    last.current = { key: followKey, newestId };
    if (threadChanged) nearBottom.current = true;
    const el = listRef.current;
    if (!el) return;
    if (shouldScrollToNewest({ threadChanged, wasNearBottom: nearBottom.current, newestChanged, newestIsMine: !!newest && isMine(newest) })) {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
    }
  });
  if (!messages.length) return <p className="eb-msg-empty">{emptyText}</p>;
  const rows = layoutThread(messages, nowMs ?? today);
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
        return (
          <li key={m.messageId} className={"eb-msg" + (isMine(m) ? " is-mine" : " is-theirs") + (continued ? " is-continued" : "")}>
            {day && <p className="eb-msg-day"><span>{day}</span></p>}
            <div className="eb-msg-bubble">
              <div className="eb-msg-meta">{continued ? <VisuallyHidden>{sender}</VisuallyHidden> : sender}</div>
              <p className="eb-msg-body">{m.body}</p>
              <time className="eb-msg-time" dateTime={m.createdAt} title={formatMessageTime(m.createdAt)}>{messageClock(m.createdAt)}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
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
