import { useEffect, useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Units 7–8 phase — `simulation / message-delivery / v1` (Book 791381 PDF 67–69): the Unit-8 simulation.
 *
 * The student picks a message kind (Unicast / Multicast / Broadcast) and presses «أرسل الرسالة». The message
 * travels from the sender to the Switch and then to the receivers the kind allows, and the diagram shows WHO
 * receives it with a WORD badge per device («يستقبل» / «لا يستقبل») plus a receiver COUNT line:
 *   Unicast   — exactly ONE device (the target) receives.
 *   Multicast — only the selected GROUP receives (never everyone).
 *   Broadcast — ALL devices inside the local network receive; the Router boundary is drawn and marked
 *               «يتوقّف هنا» in words — a normal Broadcast is NOT forwarded to the other network.
 * Every hop is mirrored as plain prose «من X إلى Y» (aria-live; never an arrow glyph inside mixed Arabic/Latin
 * text), the mode radios and the send button are real buttons, reduced motion renders the final state at once (no
 * timers), replay/reset are the shell's commands, and changing the mode clears the run (no stale outcome). No
 * network, no persistence, native SVG only. All labels and captions come from the block's `config`.
 */
type Mode = "unicast" | "multicast" | "broadcast";
type Config = {
  sender: string; receivers: string[]; switchLabel: string;
  unicast: { target: string; caption: string };
  multicast: { group: string[]; caption: string };
  broadcast: { caption: string; router: { label: string; stopLabel: string; outside: string } };
  receivesLabel: string; notLabel: string; localLabel: string;
};
function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v ? v : fb);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
  const receivers = strs(c.receivers).slice(0, 4);
  if (typeof c.sender !== "string" || !c.sender || receivers.length < 2) return null;
  const u = (c.unicast ?? {}) as Record<string, unknown>;
  const m = (c.multicast ?? {}) as Record<string, unknown>;
  const b = (c.broadcast ?? {}) as Record<string, unknown>;
  const r = (b.router ?? {}) as Record<string, unknown>;
  const target = typeof u.target === "string" && receivers.includes(u.target) ? u.target : receivers[Math.min(1, receivers.length - 1)];
  const group = strs(m.group).filter(x => receivers.includes(x));
  if (group.length === 0 || group.length >= receivers.length) return null;   // a group is some, never all
  return {
    sender: c.sender, receivers, switchLabel: str(c.switchLabel, "Switch"),
    unicast: { target, caption: str(u.caption, "") },
    multicast: { group, caption: str(m.caption, "") },
    broadcast: { caption: str(b.caption, ""), router: { label: str(r.label, "Router"), stopLabel: str(r.stopLabel, "يتوقّف هنا"), outside: str(r.outside, "شبكة أخرى") } },
    receivesLabel: str(c.receivesLabel, "يستقبل"), notLabel: str(c.notLabel, "لا يستقبل"), localLabel: str(c.localLabel, "الشبكة نفسها"),
  };
}

const STEP_MS = 700;
const MODES: { id: Mode; label: string }[] = [{ id: "unicast", label: "Unicast" }, { id: "multicast", label: "Multicast" }, { id: "broadcast", label: "Broadcast" }];
const joinAr = (xs: string[]) => xs.join(" و ");

export default function MessageDeliverySimulation({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [mode, setMode] = useState<{ value: Mode; epoch: number }>({ value: "unicast", epoch: 0 });
  const [run, setRun] = useState({ id: 0, started: false, step: 0, epoch: 0, replay: 0 });
  const liveMode: Mode = mode.epoch === commands.reset ? mode.value : "unicast";
  const liveRun = useMemo(
    () => (run.epoch === commands.reset && run.replay === commands.replay ? run : { id: run.id, started: run.replay !== commands.replay && run.started, step: 0, epoch: commands.reset, replay: commands.replay }),
    [run, commands.reset, commands.replay],
  );
  // Hop plan: [sender → switch], [switch → receivers]; broadcast adds [switch → router: stops here].
  const hops = liveMode === "broadcast" ? 3 : 2;
  const step = liveRun.started ? (reducedMotion ? hops : Math.min(liveRun.step, hops)) : 0;

  useEffect(() => {
    if (!liveRun.started || reducedMotion || liveRun.step >= hops) return;
    const t = setTimeout(() => setRun({ ...liveRun, step: liveRun.step + 1 }), STEP_MS);
    return () => clearTimeout(t);
  }, [liveRun, reducedMotion, hops]);

  if (!cfg) return <p className="learning-msg-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const receiversOf = (m: Mode): string[] => (m === "unicast" ? [cfg.unicast.target] : m === "multicast" ? cfg.multicast.group : cfg.receivers);
  const wanted = receiversOf(liveMode);
  const delivered = liveRun.started && step >= 2;
  const done = liveRun.started && step >= hops;
  const stopped = liveMode === "broadcast" && liveRun.started && step >= 3;

  const choose = (m: Mode) => {
    setMode({ value: m, epoch: commands.reset });
    setRun(r => ({ ...r, started: false, step: 0, epoch: commands.reset, replay: commands.replay }));
    emit({ type: "interaction", activityId: block.id, name: "message-mode", detail: { mode: m } });
  };
  const send = () => {
    setRun({ id: liveRun.id + 1, started: true, step: 0, epoch: commands.reset, replay: commands.replay });
    emit({ type: "interaction", activityId: block.id, name: "message-send", detail: { mode: liveMode, receivers: wanted.length } });
  };
  const receives = (d: string) => delivered && wanted.includes(d);
  const outcome = (d: string): string => (!delivered ? "" : wanted.includes(d) ? cfg.receivesLabel : cfg.notLabel);

  // Text mirror — plain prose «من <sender> إلى <receiver>» (never an arrow glyph inside a mixed string).
  const hopTexts: string[] = [
    `من ${cfg.sender} إلى ${cfg.switchLabel}`,
    liveMode === "unicast" ? `من ${cfg.switchLabel} إلى ${cfg.unicast.target} فقط`
      : liveMode === "multicast" ? `من ${cfg.switchLabel} إلى المجموعة المحدّدة: ${joinAr(cfg.multicast.group)}`
      : `من ${cfg.switchLabel} إلى جميع الأجهزة داخل الشبكة: ${joinAr(cfg.receivers)}`,
    ...(liveMode === "broadcast" ? [`عند ${cfg.broadcast.router.label}: ${cfg.broadcast.router.stopLabel} — لا يعبر البث إلى ${cfg.broadcast.router.outside}`] : []),
  ];
  const caption = liveMode === "unicast" ? cfg.unicast.caption : liveMode === "multicast" ? cfg.multicast.caption : cfg.broadcast.caption;

  // Geometry (LTR stage 340×200): sender on the left, Switch in the middle, receivers on the right column,
  // the Router boundary at the far right (drawn in every mode; marked "stops here" only in a broadcast run).
  const rx = 216;
  const ry = cfg.receivers.map((_, i) => 40 + i * (120 / Math.max(1, cfg.receivers.length - 1)));
  const packet = !liveRun.started ? null : step === 0 ? { x: 44, y: 100 } : step === 1 ? { x: 140, y: 100 } : step === 2 ? { x: rx, y: ry[wanted.length === 1 ? cfg.receivers.indexOf(wanted[0]) : Math.floor(cfg.receivers.length / 2)] } : { x: 296, y: 100 };

  return (
    <div className="learning-msg" data-reduced-motion={reducedMotion || undefined} data-mode={liveMode}>
      <div className="learning-msg-controls">
        <div className="learning-msg-modes" role="radiogroup" aria-label="نوع الرسالة">
          {MODES.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={liveMode === m.id} className={"learning-msg-mode" + (liveMode === m.id ? " is-active" : "")} onClick={() => choose(m.id)}>
              <span dir="ltr">{m.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="eb-button is-primary learning-msg-send" onClick={send}>أرسل الرسالة</button>
      </div>

      <svg className="learning-msg-stage" viewBox="0 0 340 200" role="img" aria-label={`الرسم: ${cfg.sender} يرسل عبر ${cfg.switchLabel} إلى ${joinAr(cfg.receivers)} داخل ${cfg.localLabel}؛ ${cfg.broadcast.router.label} على حدود الشبكة`}>
        <rect x="6" y="14" width="262" height="180" rx="12" className="learning-msg-lan" />
        <text x="20" y="30" className="learning-msg-lanlabel">{cfg.localLabel}</text>
        {/* sender */}
        <g className={"learning-msg-node is-sender" + (liveRun.started ? " is-on" : "")}>
          <rect x="20" y="86" width="48" height="28" rx="5" className="learning-msg-shape" />
          <text x="44" y="104" textAnchor="middle" className="learning-msg-label">{cfg.sender}</text>
          <text x="44" y="132" textAnchor="middle" className="learning-msg-outcome">{liveRun.started ? "المرسل" : ""}</text>
        </g>
        <line x1={68} y1={100} x2={104} y2={100} className={"learning-msg-edge" + (liveRun.started && step >= 1 ? " is-on" : "")} />
        {/* switch */}
        <rect x="104" y="84" width="72" height="32" rx="6" className="learning-msg-center" />
        <text x="140" y="104" textAnchor="middle" className="learning-msg-label">{cfg.switchLabel}</text>
        {/* receivers */}
        {cfg.receivers.map((d, i) => (
          <g key={d} className={"learning-msg-node" + (receives(d) ? " is-reached" : "") + (delivered && !wanted.includes(d) ? " is-skipped" : "")}>
            <line x1={176} y1={100} x2={rx - 24} y2={ry[i]} className={"learning-msg-edge" + (receives(d) ? " is-on" : "")} />
            <rect x={rx - 24} y={ry[i] - 14} width="48" height="28" rx="5" className="learning-msg-shape" />
            <text x={rx} y={ry[i] + 4} textAnchor="middle" className="learning-msg-label">{d}</text>
            <text x={rx} y={ry[i] + 26} textAnchor="middle" className="learning-msg-outcome">{outcome(d)}</text>
          </g>
        ))}
        {/* router boundary */}
        <line x1={176} y1={100} x2={268} y2={100} className={"learning-msg-edge is-boundary" + (stopped ? " is-on" : "")} strokeDasharray="4 3" />
        <g className={"learning-msg-router" + (stopped ? " is-stopped" : "")}>
          <rect x="272" y="84" width="60" height="32" rx="6" className="learning-msg-shape" />
          <text x="302" y="104" textAnchor="middle" className="learning-msg-label">{cfg.broadcast.router.label}</text>
          {stopped && <>
            <circle cx="302" cy="140" r="10" className="learning-msg-stopmark" />
            <text x="302" y="144" textAnchor="middle" className="learning-msg-stopx">✕</text>
            <text x="302" y="166" textAnchor="middle" className="learning-msg-stoplabel">{cfg.broadcast.router.stopLabel}</text>
          </>}
          <text x="302" y="188" textAnchor="middle" className="learning-msg-lanlabel">{cfg.broadcast.router.outside}</text>
        </g>
        {packet && <circle cx={packet.x} cy={packet.y - 20} r="6" className="learning-msg-packet" />}
      </svg>

      <ol className="learning-msg-steps" aria-label="خطوات الإرسال" aria-live="polite">
        {hopTexts.map((t, i) => (
          <li key={i} className={"learning-msg-step" + (liveRun.started && step >= i + 1 ? " is-done" : "")} aria-current={liveRun.started && step === i + 1 ? "step" : undefined}>
            <span className="learning-msg-stepno" aria-hidden="true">{i + 1}</span><span dir="auto">{t}</span>
          </li>
        ))}
      </ol>
      {done && (
        <div className="learning-msg-result" role="status">
          <p className="learning-msg-count">عدد الأجهزة التي تستقبل: {wanted.length} من {cfg.receivers.length}</p>
          <ul className="learning-msg-outcomes" aria-label="النتيجة لكل جهاز">
            {cfg.receivers.map(d => <li key={d}><span dir="ltr">{d}</span>: {outcome(d)}</li>)}
          </ul>
          {liveMode === "broadcast" && <p className="learning-msg-boundary">{cfg.broadcast.router.label}: {cfg.broadcast.router.stopLabel} — البث يبقى داخل {cfg.localLabel} ولا يعبر إلى {cfg.broadcast.router.outside}.</p>}
          {caption && <p className="learning-msg-caption">{caption}</p>}
        </div>
      )}
      {!liveRun.started && <p className="learning-msg-hint">اختر نوع الرسالة ثم اضغط «أرسل الرسالة».</p>}
    </div>
  );
}
