import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Batch 3 — `interactive-diagram / osi-layers / v1` (Book 791381 PDF 78–80, placed on PDF 80 after all seven
 * layers are introduced).
 *
 * The book's seven-layer stack (number · name · Arabic · token) drawn top (7) to bottom (1). Pressing a layer
 * shows its function in the book's own words (a TEXT line, never colour-only); the upper three and lower four
 * layers are grouped and named in words (PDF 79–80). A send / receive toggle applies the PDF 78 memorisation
 * rule: sending walks DOWN from 7 to 1, receiving walks UP from 1 to 7 — the order numbers are shown next to the layers as
 * text and the note is repeated in prose. No timers, no animation, no protocol functions (that is a later section).
 * Real ≥44px keyboard-operable buttons (aria-pressed / radio semantics), shell reset (epoch stamp), no network,
 * no persistence. All wording comes from the block's `config`; the component holds no book text.
 */
type Layer = { number: number; name: string; arabic: string; token: string; role: string };
type Config = {
  layers: Layer[];
  sendLabel: string; receiveLabel: string; sendNote: string; receiveNote: string;
  upperLabel: string; lowerLabel: string;
};

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const str = (k: string, fb: string) => (typeof c[k] === "string" && c[k] ? (c[k] as string) : fb);
  const layers: Layer[] = [];
  for (const raw of Array.isArray(c.layers) ? c.layers : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.number !== "number" || !Number.isInteger(o.number) || typeof o.name !== "string" || !o.name || typeof o.role !== "string" || !o.role) continue;
    layers.push({ number: o.number, name: o.name, arabic: typeof o.arabic === "string" ? o.arabic : "", token: typeof o.token === "string" ? o.token : "", role: o.role });
  }
  layers.sort((a, b) => b.number - a.number);   // top (highest number) first, as the book draws it
  const numbers = layers.map(l => l.number);
  if (layers.length < 2 || new Set(numbers).size !== numbers.length) return null;
  return {
    layers,
    sendLabel: str("sendLabel", "إرسال"), receiveLabel: str("receiveLabel", "استقبال"),
    sendNote: str("sendNote", ""), receiveNote: str("receiveNote", ""),
    upperLabel: str("upperLabel", ""), lowerLabel: str("lowerLabel", ""),
  };
}

export default function OsiLayersExplorer({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ layer: -1, direction: "send" as "send" | "receive", epoch: 0 });
  const live = state.epoch === commands.reset ? state : { layer: -1, direction: "send" as const, epoch: commands.reset };

  if (!cfg) return <p className="learning-osi-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const top = cfg.layers[0].number;
  const bottom = cfg.layers[cfg.layers.length - 1].number;
  const selected = cfg.layers.find(l => l.number === live.layer) ?? null;
  const upperCount = Math.max(0, cfg.layers.length - 4);   // the book groups the upper three and the lower four
  const isUpper = (i: number) => i < upperCount;
  // Step order for the chosen direction: sending from 7 down to 1 (top of the list first), receiving from 1 up to 7.
  const stepOf = (i: number) => (live.direction === "send" ? i + 1 : cfg.layers.length - i);

  const update = (patch: Partial<typeof state>, name: string, detail: Record<string, unknown>) => {
    setState({ ...live, ...patch, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name, detail });
  };

  return (
    <div className="learning-osi" data-reduced-motion={reducedMotion || undefined} data-direction={live.direction}>
      <div className="learning-osi-modes" role="radiogroup" aria-label="اتجاه المرور في الطبقات">
        {(["send", "receive"] as const).map(d => (
          <button key={d} type="button" role="radio" aria-checked={live.direction === d} className={"learning-osi-mode" + (live.direction === d ? " is-active" : "")}
            onClick={() => update({ direction: d }, "osi-direction", { direction: d })}>
            {d === "send" ? `${cfg.sendLabel}: من ${top} إلى ${bottom}` : `${cfg.receiveLabel}: من ${bottom} إلى ${top}`}
          </button>
        ))}
      </div>
      <p className="learning-osi-note" aria-live="polite">{live.direction === "send" ? cfg.sendNote : cfg.receiveNote}</p>

      <ol className="learning-osi-stack" aria-label="طبقات OSI من الأعلى إلى الأسفل">
        {cfg.layers.map((l, i) => (
          <li key={l.number} className={"learning-osi-row" + (isUpper(i) ? " is-upper" : " is-lower")}>
            {i === 0 && cfg.upperLabel && <span className="learning-osi-group">{cfg.upperLabel}</span>}
            {i === upperCount && cfg.lowerLabel && <span className="learning-osi-group">{cfg.lowerLabel}</span>}
            <button type="button" className={"learning-osi-layer" + (live.layer === l.number ? " is-active" : "")} aria-pressed={live.layer === l.number}
              onClick={() => update({ layer: live.layer === l.number ? -1 : l.number }, "osi-layer", { number: l.number, name: l.name })}>
              <span className="learning-osi-number" dir="ltr">{l.number}</span>
              <span className="learning-osi-name"><span dir="ltr">{l.name}</span>{l.arabic ? <span className="learning-osi-arabic"> {l.arabic}</span> : null}</span>
              {l.token && <span className="learning-osi-token" dir="ltr">{l.token}</span>}
              <span className="learning-osi-step">الخطوة {stepOf(i)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="learning-osi-detail" role="status">
        {selected
          ? <p className="learning-osi-role"><strong><span dir="ltr">{selected.number} {selected.name}</span>{selected.arabic ? ` (${selected.arabic})` : ""}:</strong> {selected.role}</p>
          : <p className="learning-osi-hint">اضغط على طبقة لتقرأ وظيفتها بكلمات قليلة.</p>}
      </div>
    </div>
  );
}
