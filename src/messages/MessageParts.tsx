import { useId } from "react";
import { MAX_MESSAGE_LENGTH, formatMessageTime, type MessageView } from "./messagesClient";

// Phase 5C — presentational pieces shared by the teacher and student messaging pages. Message bodies are rendered as
// ordinary React TEXT nodes (never dangerouslySetInnerHTML, never Markdown/HTML/link interpretation); the CSS keeps
// newlines (white-space: pre-wrap) and wraps long words. Sender identity is ALWAYS a visible text label, never colour
// alone.

type ThreadProps = {
  messages: MessageView[];
  /** The visible sender label for a message (e.g. «أنت» / «المعلم» / the student's name). */
  labelFor: (m: MessageView) => string;
  /** Messages authored by the current viewer (styled as "mine"; the label still says so in text). */
  isMine: (m: MessageView) => boolean;
  emptyText: string;
  ariaLabel: string;
};

export function MessageThread({ messages, labelFor, isMine, emptyText, ariaLabel }: ThreadProps) {
  if (!messages.length) return <p className="eb-msg-empty">{emptyText}</p>;
  return (
    <ol className="eb-msg-thread" aria-label={ariaLabel}>
      {messages.map(m => (
        <li key={m.messageId} className={"eb-msg" + (isMine(m) ? " is-mine" : " is-theirs")}>
          <div className="eb-msg-meta">
            <strong className="eb-msg-sender">{labelFor(m)}</strong>
            <time className="eb-msg-time" dateTime={m.createdAt}>{formatMessageTime(m.createdAt)}</time>
          </div>
          <p className="eb-msg-body">{m.body}</p>
        </li>
      ))}
    </ol>
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

/** Plain-text composer: labelled textarea (2000 max), a real disabled state while sending, errors kept visible. */
export function MessageComposer({ label, buttonLabel, value, onChange, onSend, sending, error, placeholder }: ComposerProps) {
  const id = useId();
  const trimmed = value.trim();
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
        onChange={e => onChange(e.target.value)}
      />
      <div className="eb-msg-composer-row">
        <span className="eb-msg-count" aria-live="off">{value.length}/{MAX_MESSAGE_LENGTH}</span>
        <button type="submit" className="eb-button is-primary" disabled={sending || !trimmed}>{sending ? "جارٍ الإرسال..." : buttonLabel}</button>
      </div>
      {error && <p className="eb-msg-error" role="alert">{error}</p>}
    </form>
  );
}
