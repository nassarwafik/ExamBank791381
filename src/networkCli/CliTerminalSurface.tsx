import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./networkCli.css";

// Phase 20B — the accessible terminal SURFACE shared by every device CLI (extracted unchanged from the 18C NetworkCliTerminal, which now
// renders through it): a transcript, the live prompt and ONE text input; Enter executes through the caller's `onSubmit` (default
// prevented: never a form submission), ArrowUp / ArrowDown recall the history, the screen scrolls on its own, focus is visible,
// `disabled` turns it read-only with an explicit notice. The island is LTR inside an RTL page. Nothing here executes anything — the
// caller runs its own pure engine (networkCli@1 switch, router CLI v1) and hands back the entries; this component knows no device.
export type CliTranscriptEntry = { input: string; prompt: string; result: { status: string; output: readonly string[]; hint?: string } };
export type CliTerminalSurfaceProps = {
  prompt: string;
  /** Arabic label of the current mode (announced with the input). */
  modeLabel: string;
  /** The device identity shown in the title bar (e.g. "switch", "R1"). */
  deviceName: string;
  entries: readonly CliTranscriptEntry[];
  onSubmit: (line: string) => void;
  disabled?: boolean;
  label: string;
  /** Commands still accepted before the bounded history is full. */
  remaining: number;
  /** The bounded history size (shown when the history is full). */
  maxCommands: number;
  /** Maximum characters of one line. */
  inputChars: number;
  readOnlyNote?: string;
  /** A transient message (e.g. a refused over-long line) shown under the input. */
  notice?: string;
  /** The device-specific note in the status line. */
  footnote: ReactNode;
  testId?: string;
};

export default function CliTerminalSurface({ prompt, modeLabel, deviceName, entries, onSubmit, disabled, label, remaining, maxCommands, inputChars, readOnlyNote, notice, footnote, testId }: CliTerminalSurfaceProps) {
  const [draft, setDraft] = useState("");
  const [recall, setRecall] = useState<number | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = "ncli-in-" + uid;
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
        <div className="ncli-titlebar" aria-hidden="true"><span>SmartAssess · network CLI simulator</span><span>{deviceName}</span></div>
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
            id={inputId} className="ncli-input" type="text" dir="ltr" value={draft} maxLength={inputChars}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
            placeholder={locked ? "" : "اكتب الأمر ثم Enter"} disabled={locked} aria-disabled={locked || undefined}
            aria-label={label + " — سطر الأوامر، الوضع الحالي: " + modeLabel}
            onChange={e => { setDraft(e.target.value); setRecall(null); }} onKeyDown={onKeyDown}
          />
          <button type="button" className="ncli-run" onClick={run} disabled={locked || !draft.trim()}>تنفيذ</button>
        </div>
      </div>
      {notice && <p className="ncli-readonly" role="status">{notice}</p>}
      {disabled && <p className="ncli-readonly" data-testid="ncli-readonly">{readOnlyNote ?? "الطرفية للعرض فقط الآن؛ لا يمكن إدخال أوامر جديدة."}</p>}
      {!disabled && full && <p className="ncli-readonly" role="status">اكتمل الحد الأقصى لعدد الأوامر في هذا السؤال ({maxCommands}). الإعداد الحالي محفوظ ويُقيَّم كما هو.</p>}
      <p className="ncli-status">
        <span>الوضع الحالي: <strong>{modeLabel}</strong></span>
        <span className={remaining <= 20 ? "is-warn" : undefined}>الأوامر المتبقية: {remaining}</span>
        <span>{footnote}</span>
      </p>
    </div>
  );
}
