import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { LearningActivityProps } from "../activities/engine";
import { readCliExerciseConfig } from "./config";
import { createSession, submitCommand, revealHint, visibleHints, applicableHints, goalStatus, completionMessage, type CliSession } from "./exercise";
import { promptFor, CLI_MODE_LABEL } from "./state";
import type { CliExerciseConfig } from "./types";
import "./cli.css";

/**
 * Batch 8 — `simulation / cli-terminal / v1`: the interactive CLI TEACHING simulator (a terminal-like box inside
 * the RTL reader). It renders one declarative exercise (the block `config`, read defensively by config.ts):
 * an instruction panel (RTL: the exercise kind, intro, current step or the task's goal checklist, the two-step
 * hint ladder, the completion banner) and an LTR terminal (transcript + prompt + input). Every keystroke is only
 * ever matched against the closed grammar (grammar.ts) by the pure engine — nothing is evaluated or executed,
 * nothing leaves the page, nothing is persisted. Shell reset (epoch stamp) recreates the session from the
 * exercise's initial state.
 */
const KIND_LABEL: Record<CliExerciseConfig["kind"], string> = { guided: "مثال موجّه", challenge: "تحدّي الأمر", task: "مهمة إعداد" };
const MAX_INPUT = 200;

export default function CliTerminalActivity({ block, commands, emit, fullscreen }: LearningActivityProps) {
  const exercise = useMemo(() => readCliExerciseConfig(block.config), [block.config]);
  const [stored, setStored] = useState<{ session: CliSession | null; epoch: number }>(() => ({ session: exercise ? createSession(exercise) : null, epoch: commands.reset }));
  // Shell reset = a new epoch: the session is rebuilt from the exercise's initial state (pure, cheap).
  const session = stored.epoch === commands.reset ? stored.session : exercise ? createSession(exercise) : null;
  const [draft, setDraft] = useState("");
  const [recall, setRecall] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  if (!exercise || !session) return <p className="learning-cli-empty" role="note">هذا التدريب التفاعلي غير متوفر حاليًا.</p>;

  const update = (next: CliSession) => setStored({ session: next, epoch: commands.reset });

  const run = () => {
    const line = draft.slice(0, MAX_INPUT);
    if (!line.trim()) return;
    const next = submitCommand(exercise, session, line);
    update(next);
    setDraft("");
    setRecall(null);
    const last = next.history[next.history.length - 1];
    emit({ type: "interaction", activityId: block.id, name: "cli-command", detail: { status: last?.status ?? "empty", completed: next.completed } });
    queueMicrotask(() => { const el = screenRef.current; if (el) el.scrollTop = el.scrollHeight; });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); run(); return; }
    const inputs = session.history.map(h => h.input);
    if (e.key === "ArrowUp" && inputs.length) {
      e.preventDefault();
      const idx = recall === null ? inputs.length - 1 : Math.max(0, recall - 1);
      setRecall(idx); setDraft(inputs[idx]);
    } else if (e.key === "ArrowDown" && recall !== null) {
      e.preventDefault();
      const idx = recall + 1;
      if (idx >= inputs.length) { setRecall(null); setDraft(""); } else { setRecall(idx); setDraft(inputs[idx]); }
    }
  };

  const steps = exercise.steps ?? [];
  const goals = exercise.kind === "task" ? goalStatus(exercise, session.state) : [];
  const hints = visibleHints(exercise, session);
  const hintsLeft = applicableHints(exercise, session).length - session.hintsShown;
  const prompt = promptFor(session.state);
  const inputId = uid + "-in";

  return (
    <div className="learning-cli" data-kind={exercise.kind} data-fullscreen={fullscreen || undefined} data-completed={session.completed || undefined}>
      <div className="learning-cli-panel">
        <p className="learning-cli-kind">{KIND_LABEL[exercise.kind]}</p>
        {exercise.intro && <p className="learning-cli-intro">{exercise.intro}</p>}
        {exercise.kind !== "task" && (
          <ol className="learning-cli-steps" aria-label="خطوات التدريب">
            {steps.map((s, i) => {
              const state = i < session.stepIndex ? "done" : i === session.stepIndex ? "current" : "todo";
              return (
                <li key={s.id} className="learning-cli-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                  <span className="learning-cli-step-mark" aria-hidden="true">{state === "done" ? "✓" : String(i + 1)}</span>
                  <span className="learning-cli-step-text">{state === "todo" && exercise.kind === "challenge" ? "…" : s.instruction}</span>
                </li>
              );
            })}
          </ol>
        )}
        {exercise.kind === "task" && (
          <ul className="learning-cli-goals" aria-label="الحالة النهائية المطلوبة">
            {goals.map(g => (
              <li key={g.id} className="learning-cli-goal" data-met={g.met}>
                <span className="learning-cli-goal-mark" aria-hidden="true">{g.met ? "✓" : "○"}</span>
                <span>{g.label}</span>
                <span className="learning-cli-sr">{g.met ? " (تحقّق)" : " (لم يتحقّق بعد)"}</span>
              </li>
            ))}
          </ul>
        )}
        {session.completed
          ? <p className="learning-cli-done" role="status">{completionMessage(exercise)}</p>
          : (
            <div className="learning-cli-hints">
              <button type="button" className="learning-cli-btn" onClick={() => update(revealHint(exercise, session))} disabled={hintsLeft <= 0} aria-describedby={uid + "-hints"}>
                {hintsLeft > 0 ? `تلميح ${session.hintsShown + 1}` : "لا تلميحات أخرى"}
              </button>
              <ul id={uid + "-hints"} className="learning-cli-hintlist" aria-live="polite">
                {hints.map((h, i) => <li key={i} className="learning-cli-hint">{h}</li>)}
              </ul>
            </div>
          )}
      </div>

      <div className="learning-cli-terminal" dir="ltr">
        <div className="learning-cli-titlebar" aria-hidden="true"><span className="learning-cli-dots">● ● ●</span><span>Cisco CLI · simulation</span></div>
        <div ref={screenRef} className="learning-cli-screen" role="log" aria-live="polite" aria-label="شاشة الطرفية">
          {session.history.length === 0 && <p className="learning-cli-line learning-cli-muted">{prompt}</p>}
          {session.history.map(h => (
            <div key={h.id} className="learning-cli-entry" data-status={h.status}>
              <p className="learning-cli-line"><span className="learning-cli-prompt">{h.prompt}</span> <span className="learning-cli-typed">{h.input}</span></p>
              {h.output && <pre className="learning-cli-output">{h.output.join("\n")}</pre>}
              {h.feedback && <p className="learning-cli-feedback" dir="rtl" data-tone={h.tone}>{h.feedback}</p>}
            </div>
          ))}
        </div>
        <div className="learning-cli-inputrow">
          <label htmlFor={inputId} className="learning-cli-prompt learning-cli-liveprompt">{prompt}</label>
          <input
            ref={inputRef}
            id={inputId}
            className="learning-cli-input"
            type="text"
            dir="ltr"
            value={draft}
            maxLength={MAX_INPUT}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            placeholder="اكتب الأمر ثم Enter"
            aria-label={"سطر الأوامر، الوضع الحالي: " + CLI_MODE_LABEL[session.state.mode]}
            onChange={e => { setDraft(e.target.value); setRecall(null); }}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="learning-cli-btn learning-cli-run" onClick={run} disabled={!draft.trim()}>تنفيذ</button>
        </div>
      </div>
      <p className="learning-cli-status" role="status">
        الوضع الحالي: <strong>{CLI_MODE_LABEL[session.state.mode]}</strong>
        <span className="learning-cli-status-note"> · محاكاة تعليمية مبسّطة، ليست جهازًا حقيقيًا؛ اكتب <code dir="ltr">?</code> لعرض أوامر الوضع الحالي.</span>
      </p>
    </div>
  );
}
