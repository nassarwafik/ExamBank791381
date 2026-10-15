import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconCheck } from "../icons";
import type { ExamSaveState } from "../examHistory";
import { SAVE_STATE_LABELS } from "../teacher/saveLabels";
import { STUDIO_STEPS, type StudioStepKey } from "./studioSteps";

// Phase 21F.2 — the Exam Studio's presentational primitives. They own no exam data: the builder passes state and handlers in.


/** The four-step workflow bar. Every step stays reachable (a teacher may go back and forth); `done` marks the steps before the
 *  current one. The current step carries aria-current="step"; the step number is never the only cue (each has its label). */
export function StudioStepper({ current, onSelect }: { current: StudioStepKey; onSelect: (step: StudioStepKey) => void }) {
  const at = STUDIO_STEPS.findIndex(s => s.key === current);
  return (
    <nav className="st-steps" aria-label="خطوات العمل">
      {STUDIO_STEPS.map((s, i) => (
        <button key={s.key} type="button" className={"st-step" + (i < at ? " is-done" : "")} aria-current={i === at ? "step" : undefined} onClick={() => onSelect(s.key)} data-step={s.key}>
          <span className="st-step-n" aria-hidden="true">{i < at ? <IconCheck size={12} /> : i + 1}</span>
          <span className="st-step-label">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** The ONE polite region that announces the save state (one whole sentence per change; the dot is decoration). */
export function StudioSaveStatus({ state }: { state?: ExamSaveState }) {
  if (!state) return null;
  return (
    <span className={"st-save is-" + state} role="status" aria-live="polite" aria-atomic="true" data-testid="studio-save-state">
      <span className="st-save-dot" aria-hidden="true" />
      {SAVE_STATE_LABELS[state]}
    </span>
  );
}

export type IssueTone = "ok" | "warn" | "error";
/** A status dot that is never colour alone: its tone is also its accessible name. */
export function StatusDot({ tone }: { tone: IssueTone }) {
  const label = tone === "error" ? "خطأ" : tone === "warn" ? "تنبيه" : "سليم";
  return <span className={"st-dot" + (tone === "ok" ? "" : tone === "warn" ? " is-warn" : " is-error")} role="img" aria-label={label} title={label} />;
}

/** A keyboard shortcut, read in its own (LTR) order. */
export function KeyHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return <span className="st-keyhint">{keys.map((k, i) => <span key={k + i}>{i > 0 && " + "}<kbd>{k}</kbd></span>)} {children}</span>;
}

export type StudioTab = { key: string; label: string; badge?: ReactNode };
/**
 * ARIA tabs (tablist / tab / tabpanel) with the standard keyboard model: arrows move between tabs and select them (RTL: ArrowLeft is
 * the next tab, ArrowRight the previous), Home / End go to the first / last. Only the selected tab is a Tab stop.
 */
export function StudioTabs({ tabs, value, onChange, label, children }: { tabs: StudioTab[]; value: string; onChange: (key: string) => void; label: string; children: ReactNode }) {
  const base = "st-tabs-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const listRef = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex(t => t.key === value);
    const rtl = (listRef.current?.closest("[dir]")?.getAttribute("dir") ?? "rtl") === "rtl";
    let next = i;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = (i + 1) % tabs.length;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].key);
    window.setTimeout(() => listRef.current?.querySelector<HTMLButtonElement>("#" + base + "-" + tabs[next].key)?.focus(), 0);
  };
  return (
    <>
      <div className="st-tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKey}>
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" id={base + "-" + t.key} className="st-tab" aria-selected={t.key === value} aria-controls={base + "-panel"} tabIndex={t.key === value ? 0 : -1} onClick={() => onChange(t.key)} data-tab={t.key}>
            {t.label}{t.badge}
          </button>
        ))}
      </div>
      <div className="st-insp-body" role="tabpanel" id={base + "-panel"} aria-labelledby={base + "-" + value} tabIndex={0}>{children}</div>
    </>
  );
}
