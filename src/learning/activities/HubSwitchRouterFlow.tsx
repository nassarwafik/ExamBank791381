import { useEffect, useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Units 4–6 phase — `simulation / hub-switch-router-flow / v1` (Book 791381 PDF 49): the FIRST simulation renderer.
 *
 * The student picks a device (Hub / Switch / Router) and presses «أرسل البيانات». A message from the sender then
 * travels hop by hop and the diagram shows WHO receives it:
 *   Hub    — every attached device receives the frame; only the intended one «يستعملها», the rest «يتجاهلها».
 *   Switch — only the intended device receives it («المقصود»); the others are marked «لا تصله».
 *   Router — the sender in شبكة 1 reaches the intended device in شبكة 2 through the router (and the router is
 *            also the way out to الإنترنت).
 * Conceptual only — no frames, MAC tables or Ethernet rules. Every hop and every outcome is also written as text
 * (aria-live), the outcome badges are words (never colour-only), the mode radios and the send button are real
 * buttons, reduced motion renders the final state at once, replay/reset are the shell's commands, and no mode
 * state leaks between modes (changing the mode clears the run). No network, no persistence, native SVG only. All
 * labels/captions come from the block's `config`.
 */
type Mode = "hub" | "switch" | "router";
type Config = {
  sender: string; target: string; others: string[];
  hub: { label: string; caption: string }; switch: { label: string; caption: string };
  router: { label: string; networks: [string, string]; outside: string; caption: string };
  useLabel: string; ignoreLabel: string; notReachedLabel: string; targetLabel: string;
};
function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v ? v : fb);
  const others = Array.isArray(c.others) ? c.others.filter((x): x is string => typeof x === "string").slice(0, 2) : [];
  if (typeof c.sender !== "string" || typeof c.target !== "string" || others.length !== 2) return null;
  const dev = (v: unknown, fb: string) => { const o = (v ?? {}) as Record<string, unknown>; return { label: str(o.label, fb), caption: str(o.caption, "") }; };
  const r = (c.router ?? {}) as Record<string, unknown>;
  const nets = Array.isArray(r.networks) ? r.networks.filter((x): x is string => typeof x === "string") : [];
  return {
    sender: c.sender, target: c.target, others,
    hub: dev(c.hub, "Hub"), switch: dev(c.switch, "Switch"),
    router: { label: str(r.label, "Router"), networks: [nets[0] ?? "شبكة 1", nets[1] ?? "شبكة 2"], outside: str(r.outside, "الإنترنت"), caption: str(r.caption, "") },
    useLabel: str(c.useLabel, "يستعملها"), ignoreLabel: str(c.ignoreLabel, "يتجاهلها"), notReachedLabel: str(c.notReachedLabel, "لا تصله"), targetLabel: str(c.targetLabel, "المقصود"),
  };
}

const STEP_MS = 700;
const MODES: Mode[] = ["hub", "switch", "router"];

export default function HubSwitchRouterFlow({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [mode, setMode] = useState<{ value: Mode; epoch: number }>({ value: "hub", epoch: 0 });
  const [run, setRun] = useState({ id: 0, started: false, step: 0, epoch: 0, replay: 0 });
  const liveMode: Mode = mode.epoch === commands.reset ? mode.value : "hub";
  const liveRun = useMemo(
    () => (run.epoch === commands.reset && run.replay === commands.replay ? run : { id: run.id, started: run.replay !== commands.replay && run.started, step: 0, epoch: commands.reset, replay: commands.replay }),
    [run, commands.reset, commands.replay],
  );
  // Hop plan per mode: [sender → center], [center → recipients] (router: sender → switch1 → router → switch2 → target).
  const hops = liveMode === "router" ? 4 : 2;
  const step = liveRun.started ? (reducedMotion ? hops : Math.min(liveRun.step, hops)) : 0;   // 0 = not started / at sender

  useEffect(() => {
    if (!liveRun.started || reducedMotion || liveRun.step >= hops) return;
    const t = setTimeout(() => setRun({ ...liveRun, step: liveRun.step + 1 }), STEP_MS);
    return () => clearTimeout(t);
  }, [liveRun, reducedMotion, hops]);

  if (!cfg) return <p className="learning-devices-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const labelOf: Record<Mode, string> = { hub: cfg.hub.label, switch: cfg.switch.label, router: cfg.router.label };
  const choose = (m: Mode) => {
    setMode({ value: m, epoch: commands.reset });
    setRun(r => ({ ...r, started: false, step: 0, epoch: commands.reset, replay: commands.replay }));   // no stale run across modes
    emit({ type: "interaction", activityId: block.id, name: "devices-mode", detail: { mode: m } });
  };
  const send = () => {
    setRun({ id: liveRun.id + 1, started: true, step: 0, epoch: commands.reset, replay: commands.replay });
    emit({ type: "interaction", activityId: block.id, name: "devices-send", detail: { mode: liveMode } });
  };
  const done = liveRun.started && step >= hops;
  const delivered = liveRun.started && step >= 2;   // recipients phase reached (hub/switch); router uses its own steps

  // Recipient outcome per device (a WORD badge, never colour-only).
  const outcome = (device: string): string | null => {
    if (liveMode === "router") return done && device === cfg.target ? cfg.targetLabel : null;
    if (!delivered) return null;
    if (liveMode === "hub") return device === cfg.target ? cfg.useLabel : cfg.ignoreLabel;
    return device === cfg.target ? cfg.targetLabel : cfg.notReachedLabel;
  };
  const reached = (device: string) => device !== cfg.sender && (liveMode === "hub" ? delivered : liveMode === "switch" ? delivered && device === cfg.target : done && device === cfg.target);

  // Text mirror of the hops — plain prose «من <sender> إلى <receiver>» (never an arrow glyph inside a mixed
  // Arabic/Latin string), so the aria-live list states the SAME direction the packet travels on the stage.
  const hopTexts: string[] = liveMode === "router"
    ? [`من ${cfg.sender} إلى ${cfg.switch.label} (${cfg.router.networks[0]})`, `من ${cfg.switch.label} إلى ${cfg.router.label}`, `من ${cfg.router.label} إلى ${cfg.switch.label} (${cfg.router.networks[1]})`, `من ${cfg.switch.label} إلى ${cfg.target}`]
    : [`من ${cfg.sender} إلى ${labelOf[liveMode]}`, liveMode === "hub" ? `من ${labelOf.hub} إلى جميع الأجهزة (${[cfg.target, ...cfg.others].join("، ")})` : `من ${labelOf.switch} إلى ${cfg.target} فقط`];
  const caption = liveMode === "hub" ? cfg.hub.caption : liveMode === "switch" ? cfg.switch.caption : cfg.router.caption;

  // Geometry (LTR stage 320×190).
  const devices = [cfg.sender, cfg.others[0], cfg.target, cfg.others[1]];
  const xs = [40, 120, 200, 280];
  const packetPos = (): { x: number; y: number } | null => {
    if (!liveRun.started) return null;
    if (liveMode !== "router") return step === 0 ? { x: xs[0], y: 132 } : step === 1 ? { x: 160, y: 50 } : { x: xs[2], y: 132 };
    const pts = [{ x: 40, y: 150 }, { x: 80, y: 95 }, { x: 160, y: 40 }, { x: 240, y: 95 }, { x: 280, y: 150 }];
    return pts[Math.min(step, 4)];
  };
  const packet = packetPos();

  return (
    <div className="learning-devices" data-reduced-motion={reducedMotion || undefined} data-mode={liveMode}>
      <div className="learning-devices-controls">
        <div className="learning-devices-modes" role="radiogroup" aria-label="اختر الجهاز">
          {MODES.map(m => (
            <button key={m} type="button" role="radio" aria-checked={liveMode === m} className={"learning-devices-mode" + (liveMode === m ? " is-active" : "")} onClick={() => choose(m)}>
              <span dir="ltr">{labelOf[m]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="eb-button is-primary learning-devices-send" onClick={send}>أرسل البيانات</button>
      </div>

      {liveMode !== "router" ? (
        <svg className="learning-devices-stage" viewBox="0 0 320 190" role="img" aria-label={`الرسم: ${cfg.sender} يرسل عبر ${labelOf[liveMode]} إلى الأجهزة الأخرى`}>
          {xs.map((x, i) => <line key={i} x1={160} y1={62} x2={x} y2={118} className={"learning-devices-edge" + (reached(devices[i]) || (i === 0 && liveRun.started) ? " is-on" : "")} />)}
          <rect x="120" y="36" width="80" height="28" rx="6" className="learning-devices-center" />
          <text x="160" y="54" textAnchor="middle" className="learning-devices-label">{labelOf[liveMode]}</text>
          {devices.map((d, i) => (
            <g key={d} className={"learning-devices-node" + (reached(d) ? " is-reached" : "") + (d === cfg.target ? " is-target" : "") + (d === cfg.sender ? " is-sender" : "")}>
              <rect x={xs[i] - 24} y="118" width="48" height="30" rx="5" className="learning-devices-shape" />
              <text x={xs[i]} y="137" textAnchor="middle" className="learning-devices-label">{d}</text>
              <text x={xs[i]} y="166" textAnchor="middle" className="learning-devices-outcome">{d === cfg.sender ? (liveRun.started ? "المرسل" : "") : outcome(d) ?? ""}</text>
            </g>
          ))}
          {packet && <circle cx={packet.x} cy={packet.y} r="6" className="learning-devices-packet" />}
        </svg>
      ) : (
        <svg className="learning-devices-stage" viewBox="0 0 320 190" role="img" aria-label={`الرسم: ${cfg.router.networks[0]} و ${cfg.router.networks[1]} مرتبطتان عبر ${cfg.router.label} وبالإنترنت`}>
          <rect x="8" y="70" width="144" height="112" rx="10" className="learning-devices-lan" />
          <rect x="168" y="70" width="144" height="112" rx="10" className="learning-devices-lan" />
          <text x="80" y="86" textAnchor="middle" className="learning-devices-lanlabel">{cfg.router.networks[0]}</text>
          <text x="240" y="86" textAnchor="middle" className="learning-devices-lanlabel">{cfg.router.networks[1]}</text>
          <line x1={40} y1={150} x2={80} y2={95} className={"learning-devices-edge" + (step >= 1 ? " is-on" : "")} />
          <line x1={110} y1={150} x2={80} y2={95} className="learning-devices-edge" />
          <line x1={80} y1={95} x2={160} y2={40} className={"learning-devices-edge" + (step >= 2 ? " is-on" : "")} />
          <line x1={160} y1={40} x2={240} y2={95} className={"learning-devices-edge" + (step >= 3 ? " is-on" : "")} />
          <line x1={240} y1={95} x2={280} y2={150} className={"learning-devices-edge" + (step >= 4 ? " is-on" : "")} />
          <line x1={240} y1={95} x2={210} y2={150} className="learning-devices-edge" />
          <line x1={160} y1={40} x2={160} y2={12} className="learning-devices-edge" />
          <text x="160" y="10" textAnchor="middle" className="learning-devices-lanlabel">{cfg.router.outside}</text>
          <rect x="128" y="28" width="64" height="24" rx="6" className="learning-devices-center" /><text x="160" y="44" textAnchor="middle" className="learning-devices-label">{cfg.router.label}</text>
          <rect x="52" y="84" width="56" height="22" rx="5" className="learning-devices-shape" /><text x="80" y="99" textAnchor="middle" className="learning-devices-label">{cfg.switch.label}</text>
          <rect x="212" y="84" width="56" height="22" rx="5" className="learning-devices-shape" /><text x="240" y="99" textAnchor="middle" className="learning-devices-label">{cfg.switch.label}</text>
          {[{ d: cfg.sender, x: 40 }, { d: cfg.others[0], x: 110 }, { d: cfg.others[1], x: 210 }, { d: cfg.target, x: 280 }].map(({ d, x }) => (
            <g key={d} className={"learning-devices-node" + (reached(d) ? " is-reached" : "") + (d === cfg.target ? " is-target" : "")}>
              <rect x={x - 22} y="136" width="44" height="26" rx="5" className="learning-devices-shape" />
              <text x={x} y="153" textAnchor="middle" className="learning-devices-label">{d}</text>
              <text x={x} y="176" textAnchor="middle" className="learning-devices-outcome">{d === cfg.sender ? (liveRun.started ? "المرسل" : "") : outcome(d) ?? ""}</text>
            </g>
          ))}
          {packet && <circle cx={packet.x} cy={packet.y} r="6" className="learning-devices-packet" />}
        </svg>
      )}

      <ol className="learning-devices-steps" aria-label="خطوات الإرسال" aria-live="polite">
        {hopTexts.map((t, i) => (
          <li key={i} className={"learning-devices-step" + (liveRun.started && step >= i + 1 ? " is-done" : "")} aria-current={liveRun.started && step === i + 1 ? "step" : undefined}>
            <span className="learning-devices-stepno" aria-hidden="true">{i + 1}</span><span dir="auto">{t}</span>
          </li>
        ))}
      </ol>
      {done && (
        <div className="learning-devices-result" role="status">
          <ul className="learning-devices-outcomes" aria-label="النتيجة لكل جهاز">
            {[cfg.target, ...cfg.others].map(d => <li key={d}><span dir="ltr">{d}</span>: {outcome(d) ?? cfg.notReachedLabel}</li>)}
          </ul>
          {caption && <p className="learning-devices-caption">{caption}</p>}
        </div>
      )}
      {!liveRun.started && <p className="learning-devices-hint">اختر الجهاز ثم اضغط «أرسل البيانات».</p>}
    </div>
  );
}
