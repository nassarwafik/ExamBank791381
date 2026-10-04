import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NETWORK_CLI_LIMITS, NETWORK_CLI_MODE_LABEL, promptFor, type NetworkCliExecResult, type NetworkCliSession } from "../networkCliEngine";
import "./networkCli.css";

// Phase 18C — the accessible terminal-style surface of the network CLI simulator (lazy chunk only; shared by the student exam,
// the teacher preview and the editor's try-out). It renders a transcript, the live prompt and ONE text input; Enter executes
// through the caller's `onSubmit` (default prevented: never a form submission), ArrowUp / ArrowDown recall the command history,
// the screen scrolls on its own, focus is visible, `disabled` turns the terminal read-only with an explicit notice. The island is
// LTR inside an RTL page: prompts, commands, interface names and IPv4 text keep their visual order. Nothing here executes
// anything — the caller runs the pure engine and hands back the entries.
export type NetworkCliTranscriptEntry = { input: string; prompt: string; result: NetworkCliExecResult };
export type NetworkCliTerminalProps = {
  session: NetworkCliSession;
  entries: readonly NetworkCliTranscriptEntry[];
  onSubmit: (line: string) => void;
  disabled?: boolean;
  label: string;
  /** Commands still accepted before the bounded history is full. */
  remaining: number;
  readOnlyNote?: string;
  /** A transient message (e.g. a refused over-long line) shown under the input. */
  notice?: string;
  testId?: string;
};

export default function NetworkCliTerminal({ session, entries, onSubmit, disabled, label, remaining, readOnlyNote, notice, testId }: NetworkCliTerminalProps) {
  const [draft, setDraft] = useState("");
  const [recall, setRecall] = useState<number | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = "ncli-in-" + uid;
  const prompt = promptFor(session);
  const full = remaining <= 0;
  const locked = !!disabled || full;

  useEffect(() => { const el = screenRef.current; if (el) el.scrollTop = el.scrollHeight; }, [entries.length]);

  const run = () => {
    if (locked) return;
    const line = draft;
    if (!line.trim()) return;
    onSubmit(line);
    setDraft(""); setRecall(null);
  };
  const history = entries.map(e => e.input);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); run(); return; }
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const idx = recall === null ? history.length - 1 : Math.max(0, recall - 1);
      setRecall(idx); setDraft(history[idx]);
    } else if (e.key === "ArrowDown" && recall !== null) {
      e.preventDefault();
      const idx = recall + 1;
      if (idx >= history.length) { setRecall(null); setDraft(""); } else { setRecall(idx); setDraft(history[idx]); }
    }
  };

  return (
    <div className="ncli" data-testid={testId}>
      <div className="ncli-terminal" dir="ltr" data-disabled={locked ? "true" : "false"}>
        <div className="ncli-titlebar" aria-hidden="true"><span>SmartAssess · network CLI simulator</span><span>{session.state.device}</span></div>
        <div ref={screenRef} className="ncli-screen" role="log" aria-live="polite" aria-label={label + " — شاشة الطرفية"} dir="ltr" data-testid="ncli-screen">
          {entries.length === 0 && <p className="ncli-line ncli-muted">{prompt}</p>}
          {entries.map((e, i) => (
            <div key={i} className="ncli-entry" data-status={e.result.status}>
              <p className="ncli-line"><span className="ncli-prompt">{e.prompt}</span> <span className="ncli-typed">{e.input}</span></p>
              {e.result.output.length > 0 && <pre className="ncli-output">{e.result.output.join("\n")}</pre>}
              {e.result.hint && <p className="ncli-hint" dir="rtl">{e.result.hint}</p>}
            </div>
          ))}
        </div>
        <div className="ncli-inputrow">
          <label htmlFor={inputId} className="ncli-prompt ncli-liveprompt" data-testid="ncli-prompt">{prompt}</label>
          <input
            id={inputId} className="ncli-input" type="text" dir="ltr" value={draft} maxLength={NETWORK_CLI_LIMITS.inputChars}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
            placeholder={locked ? "" : "اكتب الأمر ثم Enter"} disabled={locked} aria-disabled={locked || undefined}
            aria-label={label + " — سطر الأوامر، الوضع الحالي: " + NETWORK_CLI_MODE_LABEL[session.mode]}
            onChange={e => { setDraft(e.target.value); setRecall(null); }} onKeyDown={onKeyDown}
          />
          <button type="button" className="ncli-run" onClick={run} disabled={locked || !draft.trim()}>تنفيذ</button>
        </div>
      </div>
      {notice && <p className="ncli-readonly" role="status">{notice}</p>}
      {disabled && <p className="ncli-readonly" data-testid="ncli-readonly">{readOnlyNote ?? "الطرفية للعرض فقط الآن؛ لا يمكن إدخال أوامر جديدة."}</p>}
      {!disabled && full && <p className="ncli-readonly" role="status">اكتمل الحد الأقصى لعدد الأوامر في هذا السؤال ({NETWORK_CLI_LIMITS.commands}). الإعداد الحالي محفوظ ويُقيَّم كما هو.</p>}
      <p className="ncli-status">
        <span>الوضع الحالي: <strong>{NETWORK_CLI_MODE_LABEL[session.mode]}</strong></span>
        <span className={remaining <= 20 ? "is-warn" : undefined}>الأوامر المتبقية: {remaining}</span>
        <span>محاكاة تعليمية مبسّطة لمبدّل شبكة، ليست جهازًا حقيقيًا؛ اكتب <code>?</code> لعرض أوامر الوضع الحالي.</span>
      </p>
    </div>
  );
}
