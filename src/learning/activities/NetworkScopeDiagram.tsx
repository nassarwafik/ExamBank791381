import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Phase 3B — the pilot's FIRST real registry-backed production activity: `interactive-diagram / network-scope / v1`.
 *
 * It helps the student feel PAN → LAN → WAN as increasing network SCOPE / distance (exactly the concept on Book
 * 791381 PDF 11 — nothing beyond it). The student selects a scope (real <button>s: keyboard + touch, ≥44px,
 * aria-pressed, no drag, no hover-only, no gamification/scoring); a native SVG shows the reach growing, and the
 * exact source-aligned name/distance/example text is shown. All display text comes from the block's `config`
 * (authored content) — the component holds no book wording. Reduced-motion removes the grow transition. No network,
 * no persistence, no dependency, no Canvas.
 */
type Scope = { id: string; name: string; title: string; distance: string; example: string };

function readScopes(config: unknown): Scope[] {
  const raw = (config as { scopes?: unknown } | undefined)?.scopes;
  if (!Array.isArray(raw)) return [];
  const scopes: Scope[] = [];
  for (const s of raw) {
    const o = s as Record<string, unknown>;
    if (typeof o?.id === "string" && typeof o?.name === "string" && typeof o?.title === "string"
      && typeof o?.distance === "string" && typeof o?.example === "string") {
      scopes.push({ id: o.id, name: o.name, title: o.title, distance: o.distance, example: o.example });
    }
  }
  return scopes;
}

export default function NetworkScopeDiagram({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const scopes = useMemo(() => readScopes(block.config), [block.config]);
  const note = (block.config as { note?: unknown } | undefined)?.note;
  // The shell only issues `reset` because this renderer declares the capability; derive from the reset epoch.
  const [pick, setPick] = useState({ index: 0, epoch: 0 });
  const index = pick.epoch === commands.reset ? Math.min(pick.index, Math.max(0, scopes.length - 1)) : 0;

  if (scopes.length === 0) {
    return <p className="learning-scope-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;
  }
  const active = scopes[index];

  const select = (i: number) => {
    setPick({ index: i, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name: "scope-select", detail: { scope: scopes[i].id, index: i } });
  };

  return (
    <div className="learning-scope" data-reduced-motion={reducedMotion || undefined}>
      <div className="learning-scope-tabs" role="group" aria-label="أنواع الشبكات حسب النطاق">
        {scopes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={"learning-scope-tab" + (i === index ? " is-active" : "")}
            aria-pressed={i === index}
            onClick={() => select(i)}
          >
            <span className="learning-scope-tab-name" dir="ltr">{s.name}</span>
            <span className="learning-scope-tab-dist">{s.distance}</span>
          </button>
        ))}
      </div>

      {/* Native SVG: reach grows with scope index (smallest → largest). Decorative; the text below is authoritative. */}
      <svg className="learning-scope-visual" viewBox="0 0 300 120" role="img" aria-label={`النطاق: ${active.name} — ${active.title}`}>
        {scopes.map((s, i) => {
          const w = 40 + (i + 1) * (240 / scopes.length);
          return (
            <rect
              key={s.id}
              x={(300 - w) / 2}
              y={60 - (10 + (i + 1) * (44 / scopes.length))}
              width={w}
              height={20 + (i + 1) * (88 / scopes.length)}
              rx={10}
              className={"learning-scope-ring" + (i <= index ? " is-on" : "")}
            />
          );
        })}
        <circle cx="150" cy="60" r="7" className="learning-scope-core" />
      </svg>

      <div className="learning-scope-detail" aria-live="polite">
        <p className="learning-scope-title"><span className="learning-scope-badge" dir="ltr">{active.name}</span>{active.title}</p>
        <p className="learning-scope-example">{active.example}</p>
      </div>

      {typeof note === "string" && note.length > 0 && <p className="learning-scope-note">{note}</p>}
    </div>
  );
}
