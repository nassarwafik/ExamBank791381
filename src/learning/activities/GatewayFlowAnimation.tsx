import { useEffect, useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Units 4–6 phase — `animation / gateway-flow / v1` (Book 791381 PDF 45): the FIRST animation renderer.
 *
 * The student chooses a destination — a device in the SAME local network, or the Internet — and presses «أرسل
 * البيانات». A packet then travels step by step along the page's own figure: PC1 → Switch → PC2 (local traffic
 * never touches the gateway) versus PC1 → Switch → Router (the default gateway) → Internet. Every step is also
 * written as text (an aria-live list), so the meaning never depends on motion or colour. Reduced motion: the
 * final state renders at once, no stepping. Replay/reset are the shell's commands. No network, no persistence,
 * no dependency, native SVG only. All labels and captions come from the block's `config`.
 */
type Node = { label: string; address?: string };
type Config = { sender: Node; local: Node; switchLabel: string; router: Node & { role: string }; outside: Node; localCaption: string; outsideCaption: string };

function node(v: unknown, fallback: string): Node {
  const o = (v ?? {}) as Record<string, unknown>;
  return { label: typeof o.label === "string" ? o.label : fallback, address: typeof o.address === "string" ? o.address : undefined };
}
function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  if (!c.sender || !c.local || !c.router) return null;
  const r = (c.router ?? {}) as Record<string, unknown>;
  return {
    sender: node(c.sender, "PC1"), local: node(c.local, "PC2"), switchLabel: typeof c.switchLabel === "string" ? c.switchLabel : "Switch",
    router: { ...node(c.router, "Router"), role: typeof r.role === "string" ? r.role : "" }, outside: node(c.outside, "الإنترنت"),
    localCaption: typeof c.localCaption === "string" ? c.localCaption : "", outsideCaption: typeof c.outsideCaption === "string" ? c.outsideCaption : "",
  };
}

type Dest = "local" | "outside";
const STEP_MS = 700;
// Node positions in the 320×170 stage (LTR coordinates; text is placed with explicit anchors).
const POS = { sender: { x: 40, y: 130 }, local: { x: 40, y: 40 }, switch: { x: 130, y: 85 }, router: { x: 220, y: 85 }, outside: { x: 290, y: 85 } } as const;
type NodeKey = keyof typeof POS;

export default function GatewayFlowAnimation({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [dest, setDest] = useState<{ value: Dest; epoch: number }>({ value: "local", epoch: 0 });
  // A run is identified by (epoch, replay) so the shell's replay restarts it and reset clears it.
  const [run, setRun] = useState<{ id: number; started: boolean; step: number; epoch: number; replay: number }>({ id: 0, started: false, step: 0, epoch: 0, replay: 0 });
  const liveDest = dest.epoch === commands.reset ? dest.value : "local";
  // A stale epoch (reset) clears the run; a new replay stamp restarts a started run from hop 0. Memoized so the
  // hop timer effect keys on the run's identity, not on a fresh object every render.
  const liveRun = useMemo(
    () => (run.epoch === commands.reset && run.replay === commands.replay ? run : { id: run.id, started: run.replay !== commands.replay && run.started, step: 0, epoch: commands.reset, replay: commands.replay }),
    [run, commands.reset, commands.replay],
  );
  const path: NodeKey[] = liveDest === "local" ? ["sender", "switch", "local"] : ["sender", "switch", "router", "outside"];
  const lastStep = path.length - 1;
  const step = liveRun.started ? (reducedMotion ? lastStep : Math.min(liveRun.step, lastStep)) : -1;

  // Advance one hop per tick while a run is in progress (never under reduced motion). State is set only from the
  // timer callback; the effect itself sets nothing synchronously.
  useEffect(() => {
    if (!liveRun.started || reducedMotion || liveRun.step >= lastStep) return;
    // The timer is cleared whenever the live run changes, so writing the LIVE run forward is always current
    // (this also persists a replay's fresh epoch/replay stamps into state).
    const t = setTimeout(() => setRun({ ...liveRun, step: liveRun.step + 1 }), STEP_MS);
    return () => clearTimeout(t);
  }, [liveRun, reducedMotion, lastStep]);

  if (!cfg) return <p className="learning-gateway-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const names: Record<NodeKey, string> = { sender: cfg.sender.label, local: cfg.local.label, switch: cfg.switchLabel, router: cfg.router.label, outside: cfg.outside.label };
  const send = () => {
    setRun({ id: liveRun.id + 1, started: true, step: 0, epoch: commands.reset, replay: commands.replay });
    emit({ type: "interaction", activityId: block.id, name: "gateway-send", detail: { destination: liveDest } });
  };
  const choose = (value: Dest) => { setDest({ value, epoch: commands.reset }); setRun(r => ({ ...r, started: false, step: 0, epoch: commands.reset, replay: commands.replay })); };
  const done = step === lastStep;
  const packet = step >= 0 ? POS[path[step]] : null;
  const edgeOn = (a: NodeKey, b: NodeKey) => { const i = path.indexOf(a), j = path.indexOf(b); return i >= 0 && j === i + 1 && step >= j; };
  const edge = (a: NodeKey, b: NodeKey) => <line key={a + b} x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} className={"learning-gateway-edge" + (edgeOn(a, b) ? " is-on" : "")} />;

  return (
    <div className="learning-gateway" data-reduced-motion={reducedMotion || undefined} data-destination={liveDest}>
      <div className="learning-gateway-controls">
        <div className="learning-gateway-dest" role="radiogroup" aria-label="الوجهة">
          <button type="button" role="radio" aria-checked={liveDest === "local"} className={"learning-gateway-choice" + (liveDest === "local" ? " is-active" : "")} onClick={() => choose("local")}>
            جهاز في نفس الشبكة ({cfg.local.label})
          </button>
          <button type="button" role="radio" aria-checked={liveDest === "outside"} className={"learning-gateway-choice" + (liveDest === "outside" ? " is-active" : "")} onClick={() => choose("outside")}>
            {cfg.outside.label} (خارج الشبكة)
          </button>
        </div>
        <button type="button" className="eb-button is-primary learning-gateway-send" onClick={send}>أرسل البيانات</button>
      </div>

      <svg className="learning-gateway-stage" viewBox="0 0 320 170" role="img" aria-label={`الرسم: ${cfg.sender.label} و ${cfg.local.label} عبر ${cfg.switchLabel} داخل الشبكة المحلية، ثم ${cfg.router.label} (${cfg.router.role}) إلى ${cfg.outside.label}`}>
        <rect x="8" y="12" width="165" height="146" rx="10" className="learning-gateway-lan" />
        <text x="90" y="28" textAnchor="middle" className="learning-gateway-lanlabel">الشبكة المحلية</text>
        {edge("sender", "switch")}{edge("switch", "local")}{edge("switch", "router")}{edge("router", "outside")}
        {(Object.keys(POS) as NodeKey[]).map(k => (
          <g key={k} className={"learning-gateway-node is-" + k + (step >= 0 && path[step] === k ? " is-current" : "")}>
            {k === "outside"
              ? <ellipse cx={POS[k].x} cy={POS[k].y} rx="24" ry="16" className="learning-gateway-shape" />
              : <rect x={POS[k].x - 26} y={POS[k].y - 14} width="52" height="28" rx="6" className="learning-gateway-shape" />}
            <text x={POS[k].x} y={POS[k].y + 4} textAnchor="middle" className="learning-gateway-nodelabel">{names[k]}</text>
          </g>
        ))}
        <text x={POS.router.x} y={POS.router.y + 30} textAnchor="middle" className="learning-gateway-role">{cfg.router.role}</text>
        {cfg.router.address && <text x={POS.router.x} y={POS.router.y + 42} textAnchor="middle" className="learning-gateway-addr">{cfg.router.address}</text>}
        {packet && <circle cx={packet.x} cy={packet.y - 22} r="6" className="learning-gateway-packet" />}
      </svg>

      <ol className="learning-gateway-steps" aria-label="خطوات الإرسال" aria-live="polite">
        {path.slice(1).map((k, i) => (
          <li key={k} className={"learning-gateway-step" + (step >= i + 1 ? " is-done" : "")} aria-current={step === i + 1 ? "step" : undefined}>
            <span className="learning-gateway-stepno" aria-hidden="true">{i + 1}</span>
            <span dir="auto">{names[path[i]]} ← {names[k]}{k === "router" ? ` (${cfg.router.role})` : ""}</span>
          </li>
        ))}
      </ol>

      {done && <p className="learning-gateway-caption" role="status">{liveDest === "local" ? cfg.localCaption : cfg.outsideCaption}</p>}
      {step < 0 && <p className="learning-gateway-hint">اختر الوجهة ثم اضغط «أرسل البيانات».</p>}
    </div>
  );
}
