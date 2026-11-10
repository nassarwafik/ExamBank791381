import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LearningActivityProps } from "./engine";
import { readSceneConfig, changed, type Anchor, type Item } from "./csharpScene";

/**
 * 899371 P11 (docs/enterprise-899371-enrichment-plan.md §3.1, §7.3, §8) — `animation / csharp-scene / v1`: ONE engine for every
 * animated panel of the course. A scene is DATA (csharpScene.ts): a small SVG stage of items and a list of steps, each with one
 * Arabic sentence. The engine draws the items with the design tokens (light and dark), moves and highlights what a step changes
 * with a short CSS transition (250–400 ms, ease-out), and never starts by itself: «شغّل» walks the steps once and stops at the
 * last one (no infinite loop), «إيقاف» pauses, «السابق» / «التالي» move one step, the shell's «إعادة تعيين» returns to the first.
 * Reduced motion: the same steps with no transition. The sentence of the current step is in a polite live region, and the picture
 * itself is one image with the scene's description, so the panel is understood without seeing it. In a sentence, `…` marks code: it is
 * shown left to right in its own isolate, so «`Math.Sqrt(16)` يسأل…» never reorders. No network, no persistence.
 */
const STEP_MS = 1800;
const AR = /[؀-ۿ]/;
const CELL = 32;

/** A step's sentence: `…` is code, kept left to right inside the Arabic sentence (its own isolate), everything else plain text. */
const say = (text: string): ReactNode[] =>
  text.split(/(`[^`]+`)/).filter(Boolean).map((part, i) => (part.startsWith("`") && part.endsWith("`") && part.length > 2
    ? <bdi key={i} dir="ltr"><code className="learning-scene-code">{part.slice(1, -1)}</code></bdi>
    : part));

/** A text placed by its geometric side (left / middle / right), whatever the direction of its words. */
function T({ x, y, text, anchor = "middle", mono, big, cls = "" }: { x: number; y: number; text: string; anchor?: Anchor; mono?: boolean; big?: boolean; cls?: string }): ReactNode {
  const rtl = AR.test(text);
  const ta = anchor === "middle" ? "middle" : (anchor === "left") !== rtl ? "start" : "end";
  return (
    <text x={x} y={y} textAnchor={ta} direction={rtl ? "rtl" : "ltr"} dominantBaseline="central" className={"cs-tx" + (mono ? " is-mono" : "") + (big ? " is-big" : "") + (cls ? " " + cls : "")}>
      {text}
    </text>
  );
}

function Shape({ it }: { it: Item }): ReactNode {
  const w = it.w ?? 0, h = it.h ?? 0;
  switch (it.kind) {
    case "box":
      return (
        <>
          {it.shape === "diamond"
            ? <polygon className="cs-sh" points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} />
            : <rect className="cs-sh" width={w} height={h} rx={it.shape === "round" ? h / 2 : 6} />}
          {it.label ? <T x={w / 2} y={-10} text={it.label} cls="is-label" /> : null}
          {it.value !== undefined ? <T x={w / 2} y={h / 2} text={it.value} mono={it.mono ?? true} big /> : null}
        </>
      );
    case "cells": {
      const s = it.size ?? CELL, vals = it.values ?? [];
      return (
        <>
          {it.label ? <T x={0} y={-10} text={it.label} anchor="left" cls="is-label" /> : null}
          {vals.map((v, i) => (
            <g key={i} className={(it.hi ?? []).includes(i) ? "cs-t-accent" : (it.bad ?? []).includes(i) ? "cs-t-bad" : ""}>
              <rect className="cs-sh" x={i * s} width={s} height={s} rx={3} />
              <T x={i * s + s / 2} y={s / 2} text={v} mono />
              {it.idx === false ? null : <T x={i * s + s / 2} y={s + 11} text={String((it.base ?? 0) + i)} cls="is-idx" />}
            </g>
          ))}
        </>
      );
    }
    case "grid": {
      const s = it.size ?? CELL, rows = it.rows ?? [];
      const on = (r: number, c: number) => (it.cellsHi ?? []).some(([a, b]) => a === r && b === c);
      return (
        <>
          {it.label ? <T x={0} y={-24} text={it.label} anchor="left" cls="is-label" /> : null}
          {it.idx === false ? null : rows[0].map((_, c) => <T key={"c" + c} x={c * s + s / 2} y={-10} text={String(c)} cls="is-idx" />)}
          {rows.map((r, i) => (
            <g key={i}>
              {it.idx === false ? null : <T x={-10} y={i * s + s / 2} text={String(i)} cls="is-idx" />}
              {r.map((v, j) => (
                <g key={j} className={on(i, j) ? "cs-t-accent" : ""}>
                  <rect className="cs-sh" x={j * s} y={i * s} width={s} height={s} rx={2} />
                  <T x={j * s + s / 2} y={i * s + s / 2} text={v} mono />
                </g>
              ))}
            </g>
          ))}
        </>
      );
    }
    case "text":
      return <T x={0} y={0} text={it.text ?? ""} anchor={it.anchor} mono={it.mono} big={it.big} cls="is-plain" />;
    case "token": {
      const tw = Math.max(28, [...(it.text ?? "")].length * 9 + 16);
      return (
        <>
          <rect className="cs-sh" x={-tw / 2} y={-13} width={tw} height={26} rx={13} />
          <T x={0} y={0} text={it.text ?? ""} mono />
        </>
      );
    }
    case "code": {
      const lines = it.lines ?? [], cw = Math.max(...lines.map(l => l.length)) * 8.4 + 34;
      return (
        <g className="cs-code">
          <rect className="cs-codebg" width={cw} height={lines.length * 20 + 8} rx={6} />
          {lines.map((l, i) => (
            <g key={i}>
              {it.hl === i + 1 ? <rect className="cs-codehl" x={2} y={4 + i * 20} width={cw - 4} height={20} rx={3} /> : null}
              <text x={8} y={14 + i * 20} direction="ltr" dominantBaseline="central" className="cs-codeno">{i + 1}</text>
              <text x={26} y={14 + i * 20} direction="ltr" dominantBaseline="central" className="cs-codetx" xmlSpace="preserve">{l}</text>
            </g>
          ))}
        </g>
      );
    }
    case "screen": {
      const lines = (it.text ?? "").split("\n");
      return (
        <g className="cs-code">
          {it.label ? <T x={w} y={-10} text={it.label} anchor="right" cls="is-label" /> : null}
          <rect className="cs-codebg" width={w} height={h} rx={6} />
          {lines.map((l, i) => <text key={i} x={10} y={16 + i * 20} direction="ltr" dominantBaseline="central" className="cs-codetx" xmlSpace="preserve">{l}</text>)}
        </g>
      );
    }
    case "axis": {
      const min = it.min ?? 0, max = it.max ?? 1, step = it.step ?? 1;
      const px = (v: number) => ((v - min) / (max - min)) * w;
      const ticks: number[] = [];
      for (let v = min, k = 0; v <= max + 1e-9 && k <= 40; v = min + ++k * step) ticks.push(Math.round(v * 1000) / 1000);
      return (
        <>
          <line className="cs-ln" x1={0} y1={0} x2={w} y2={0} />
          {ticks.map(v => (
            <g key={v}>
              <line className="cs-ln" x1={px(v)} y1={-5} x2={px(v)} y2={5} />
              <T x={px(v)} y={18} text={String(v)} cls="is-idx" />
            </g>
          ))}
          {(it.marks ?? []).map((m, i) => (
            <g key={i} className={"cs-t-" + m.tone} style={{ transform: `translate(${px(Math.min(max, Math.max(min, m.v)))}px, 0px)` }}>
              <circle className="cs-sh" r={7} />
              {m.label ? <T x={0} y={-20} text={m.label} mono /> : null}
            </g>
          ))}
        </>
      );
    }
    case "arrow": {
      // drawn in stage coordinates (the item's group is not moved); the head is a small triangle pointing along the line
      const x1 = it.x, y1 = it.y, x2 = it.x2 ?? x1, y2 = it.y2 ?? y1, a = Math.atan2(y2 - y1, x2 - x1);
      const p = (d: number, s: number) => `${x2 - 10 * Math.cos(a + s * d)},${y2 - 10 * Math.sin(a + s * d)}`;
      return (
        <>
          <line className={"cs-ln is-arrow" + (it.dash ? " is-dash" : "")} x1={x1} y1={y1} x2={x2} y2={y2} />
          <polygon className="cs-head" points={`${x2},${y2} ${p(0.45, 1)} ${p(0.45, -1)}`} />
          {it.label ? <T x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 12} text={it.label} cls="is-label" /> : null}
        </>
      );
    }
  }
}

export default function CSharpSceneActivity({ block, commands, emit, reducedMotion, fullscreen }: LearningActivityProps) {
  const cfg = useMemo(() => readSceneConfig(block.config), [block.config]);
  const [state, setState] = useState({ at: 0, playing: false, epoch: 0 });
  const live = state.epoch === commands.reset ? state : { at: 0, playing: false, epoch: commands.reset };
  const total = cfg?.frames.length ?? 0;

  // «شغّل» walks forward one step per STEP_MS and stops at the last step; the state changes only in the timer callback.
  useEffect(() => {
    if (!live.playing || live.at >= total - 1) return;
    const t = window.setTimeout(() => setState({ at: live.at + 1, playing: live.at + 1 < total - 1, epoch: live.epoch }), STEP_MS);
    return () => window.clearTimeout(t);
  }, [live.playing, live.at, live.epoch, total]);

  if (!cfg) return <p className="learning-trace-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const at = Math.min(live.at, total - 1);
  const frame = cfg.frames[at], prev = at > 0 ? cfg.frames[at - 1] : undefined;
  const go = (n: number, playing = false) => {
    const next = Math.max(0, Math.min(total - 1, n));
    setState({ at: next, playing, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name: playing ? "scene-play" : "scene-step", detail: { step: next + 1, of: total } });
  };
  const play = () => (live.playing ? go(at) : go(at >= total - 1 ? 0 : at, true));

  return (
    <div className={"learning-scene" + (reducedMotion ? " is-still" : "") + (fullscreen ? " is-full" : "")}>
      <svg className="learning-scene-svg" viewBox={`-8 -8 ${cfg.w + 16} ${cfg.h + 16}`} role="img" aria-label={cfg.alt} direction="ltr">
        {frame.map((it, i) => {
          const was = prev?.[i];
          const moved = it.kind === "arrow" ? undefined : { transform: `translate(${it.x}px, ${it.y}px)` };
          return (
            <g key={it.id} className={"cs-i cs-t-" + it.tone + (it.show ? "" : " is-off")} style={moved} aria-hidden={it.show ? undefined : true}>
              <g key={changed(was, it) ? "c" + at : "s"} className={changed(was, it) ? "is-new" : undefined}>
                <Shape it={it} />
              </g>
            </g>
          );
        })}
      </svg>
      <p className="learning-scene-say" role="status" aria-live="polite">{say(cfg.says[at])}</p>
      <div className="learning-scene-controls">
        <button type="button" className="learning-trace-btn is-next" onClick={play} aria-pressed={live.playing}>
          {live.playing ? "⏸ إيقاف" : at >= total - 1 ? "▶ شغّل من البداية" : "▶ شغّل"}
        </button>
        <button type="button" className="learning-trace-btn" onClick={() => go(at - 1)} disabled={at === 0}>السابق</button>
        <button type="button" className="learning-trace-btn" onClick={() => go(at + 1)} disabled={at === total - 1}>التالي</button>
        <span className="learning-trace-counter">الخطوة <span dir="ltr">{at + 1} / {total}</span></span>
      </div>
    </div>
  );
}
