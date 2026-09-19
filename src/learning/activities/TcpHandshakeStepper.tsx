import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Batch 5 — `interactive-diagram / tcp-handshake / v1` (Book 791381 PDF 118, placed after the book's idea, the three
 * steps and «الخلاصة»).
 *
 * A deterministic STEP-THROUGH of the book's three-way handshake: two devices drawn as a native SVG and one arrow
 * per revealed step (its label — SYN, SYN-ACK, ACK — and the book's sentence). «الخطوة التالية» / «الخطوة السابقة»
 * reveal or hide one step at a time; after the last step the book's summary appears. Every revealed step is
 * mirrored as text in a status region, so the drawing is never the only carrier of meaning. No timers, no
 * animation, no network, no persistence. Shell reset (epoch stamp). All wording comes from the block `config`.
 */
type Step = { label: string; from: "first" | "second"; text: string };
type Config = { first: string; second: string; steps: Step[]; summary: string; nextLabel: string; prevLabel: string; startHint: string };

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const steps: Step[] = [];
  for (const raw of Array.isArray(c.steps) ? c.steps : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.label !== "string" || !o.label || (o.from !== "first" && o.from !== "second") || typeof o.text !== "string" || !o.text) continue;
    steps.push({ label: o.label, from: o.from, text: o.text });
  }
  if (steps.length < 2) return null;
  const str = (k: string, fb: string) => (typeof c[k] === "string" && c[k] ? (c[k] as string) : fb);
  return { first: str("first", "الجهاز الأول"), second: str("second", "الجهاز الثاني"), steps, summary: str("summary", ""), nextLabel: str("nextLabel", "الخطوة التالية"), prevLabel: str("prevLabel", "الخطوة السابقة"), startHint: str("startHint", "") };
}

const ROW_Y0 = 46;
const ROW_GAP = 40;

export default function TcpHandshakeStepper({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ shown: 0, epoch: 0 });
  const live = state.epoch === commands.reset ? state : { shown: 0, epoch: commands.reset };

  if (!cfg) return <p className="learning-handshake-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const total = cfg.steps.length;
  const shown = Math.min(live.shown, total);
  const done = shown === total;
  const go = (n: number) => {
    const next = Math.max(0, Math.min(total, n));
    setState({ shown: next, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name: "handshake-step", detail: { shown: next } });
  };
  const height = ROW_Y0 + ROW_GAP * total + 8;

  return (
    <div className="learning-handshake" data-reduced-motion={reducedMotion || undefined} data-shown={shown}>
      <div className="learning-handshake-actions">
        <button type="button" className="learning-handshake-btn" onClick={() => go(shown + 1)} disabled={done}>{cfg.nextLabel}</button>
        <button type="button" className="learning-handshake-btn" onClick={() => go(shown - 1)} disabled={shown === 0}>{cfg.prevLabel}</button>
        <span className="learning-handshake-counter">{shown} / {total}</span>
      </div>

      <svg className="learning-handshake-stage" viewBox={`0 0 320 ${height}`} role="img" aria-label={shown === 0 ? cfg.startHint : cfg.steps.slice(0, shown).map((s, i) => `${i + 1} ${s.label}: ${s.text}`).join(" · ")}>
        <g className="learning-handshake-device" transform="translate(40 18)">
          <rect x={-28} y={-12} width={56} height={24} rx={4} className="learning-handshake-box" />
          <text y={4} textAnchor="middle" className="learning-handshake-label">{cfg.first}</text>
        </g>
        <g className="learning-handshake-device" transform="translate(280 18)">
          <rect x={-28} y={-12} width={56} height={24} rx={4} className="learning-handshake-box" />
          <text y={4} textAnchor="middle" className="learning-handshake-label">{cfg.second}</text>
        </g>
        <line x1={40} y1={30} x2={40} y2={height - 6} className="learning-handshake-lifeline" />
        <line x1={280} y1={30} x2={280} y2={height - 6} className="learning-handshake-lifeline" />
        {cfg.steps.map((s, i) => {
          const y = ROW_Y0 + ROW_GAP * i;
          const on = i < shown;
          const toRight = s.from === "first";
          return (
            <g key={i} className={"learning-handshake-step" + (on ? " is-on" : "")} data-step={i + 1} style={on ? undefined : { display: "none" }}>
              <line x1={toRight ? 44 : 276} y1={y} x2={toRight ? 268 : 52} y2={y} className="learning-handshake-arrow" />
              <polygon points={toRight ? `268,${y - 5} 278,${y} 268,${y + 5}` : `52,${y - 5} 42,${y} 52,${y + 5}`} className="learning-handshake-head" />
              <circle cx={toRight ? 60 : 260} cy={y - 12} r={7} className="learning-handshake-num" />
              <text x={toRight ? 60 : 260} y={y - 9} textAnchor="middle" className="learning-handshake-numtext">{i + 1}</text>
              <text x={160} y={y - 5} textAnchor="middle" className="learning-handshake-tag">{s.label}</text>
            </g>
          );
        })}
      </svg>

      <ol className="learning-handshake-log" role="status" aria-label="الخطوات المعروضة">
        {shown === 0 && cfg.startHint && <li className="learning-handshake-hint">{cfg.startHint}</li>}
        {cfg.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="learning-handshake-line"><strong dir="ltr">{s.label}</strong> — {s.from === "first" ? cfg.first : cfg.second}: {s.text}</li>
        ))}
        {done && cfg.summary && <li className="learning-handshake-summary">{cfg.summary}</li>}
      </ol>
    </div>
  );
}
