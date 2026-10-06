import { useMemo, useRef, useState } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { NET2_LIMITS, validateNet2Config, type Net2Config, type Net2Link } from "../net2Model";
import { replayNet2, replayNet2Cached, type Net2ReplayCache } from "../net2Plugin";
import { linkUp, makeNet } from "../net2Network";
import { traceHostCommandFlow, type Net2Flow } from "../net2Flow";
import Net2Diagram from "./Net2Diagram";
import { DevicePanel } from "./Net2Panels";
import { KIND_LABEL } from "./net2Labels";
import "./net2.css";

// Phase 20C — the networkTopology@2 STUDENT workspace (lazy; also the teacher preview). The topology is the TEACHER's and is immutable here:
// there is no control that adds, deletes, moves, re-types or cables a device (and no such action exists in the plugin contract — the server
// refuses it). The student configures devices through their own surfaces (Desktop apps, CLI, AP settings); every surface emits semantic
// actions, the workspace replays them through the SAME shared engines the server grades with and hands the next action list to the host's
// autosave / restore / submit pipeline. Reset returns to the teacher's initial state (zero actions).
const CODE_TEXT: Readonly<Record<string, string>> = Object.freeze({
  NET2_DEVICE_COMMANDS_TOO_MANY: "اكتمل الحد الأقصى لأوامر هذا الجهاز.", NET2_HOST_COMMANDS_TOO_MANY: "اكتمل الحد الأقصى لأوامر هذا الحاسوب.",
  NET2_WIFI_ACTIONS_TOO_MANY: "اكتمل الحد الأقصى لعمليات الاتصال اللاسلكي لهذا الجهاز.", SMARTSIM_ACTIONS_TOO_MANY: "اكتمل الحد الأقصى لعدد الإجراءات في هذا السؤال."
});

// Incremental VIEW replay: one more command applies one action (keyed by this workspace's validated config object; the server always
// replays the whole answer itself). A failed step never replaces the cached prefix.
const caches = new WeakMap<Net2Config, Net2ReplayCache>();
function cachedReplay(cfg: Net2Config, actions: readonly unknown[]) {
  const step = replayNet2Cached(cfg, actions, caches.get(cfg));
  if (step.cache) caches.set(cfg, step.cache);
  return step.replay;
}

// Phase 20E — the transient flow of the last ping / tracert this workspace emitted. It is computed by the operational engine (net2Flow) on the
// PRE-command state — exactly the state the replay applies the command to — and kept in ephemeral React state only: never in the answer /
// onChange payload, never autosaved, never restored from a stored answer, replaced by the next action and cleared on reset / unmount.
type ShownFlow = { id: number; at: number; flow: Net2Flow };
const isHostCommand = (a: unknown): a is { type: "host.command"; deviceId: string; command: unknown } =>
  !!a && typeof a === "object" && (a as { type?: unknown }).type === "host.command" && typeof (a as { deviceId?: unknown }).deviceId === "string";

export default function Net2Workspace({ config: rawConfig, actions, onChange, disabled, label, preview }: SmartSimWorkspaceProps) {
  const cfg = useMemo(() => { const r = validateNet2Config(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? cachedReplay(cfg, actions) : null), [cfg, actions]);
  const fallback = useMemo(() => (cfg ? replayNet2(cfg, []) : null), [cfg]);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [flow, setFlow] = useState<ShownFlow | null>(null);
  const flowSeq = useRef(0);
  if (!cfg || !fallback || !fallback.ok) return <p className="ncli-unavailable" role="note" data-testid="net2-unavailable">مخطط الشبكة لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const view = replay && replay.ok ? replay : fallback;
  const restoredBroken = !!replay && !replay.ok;
  const base = restoredBroken ? [] : [...actions];
  const name = (id: string) => cfg.devices.find(d => d.id === id)?.label ?? id;
  const device = selected ? cfg.devices.find(d => d.id === selected) ?? null : null;
  const emit = (next: unknown[]) => {
    const r = cachedReplay(cfg, next);
    if (!r.ok) { setNotice(CODE_TEXT[r.code] ?? "تعذّر تنفيذ الإجراء."); return; }
    setNotice("");
    const added = next.length === base.length + 1 ? next[next.length - 1] : undefined;
    const traced = isHostCommand(added) ? traceHostCommandFlow(cfg, view.state, added.deviceId, added.command) : null;
    setFlow(traced ? { id: ++flowSeq.current, at: next.length, flow: traced } : null);
    onChange(next, r.state);
  };
  // shown only while the action list is the one the flow was emitted with (an external restore / reset hides it)
  const shown = flow && flow.at === base.length ? flow : null;
  const flowStatus = !shown ? "" : (() => {
    const f = shown.flow, what = f.kind + " من " + name(f.hops[0]) + " إلى " + f.target;
    if (f.ok) return "نجح " + what + "؛ المسار: " + f.hops.map(name).join(" ← ") + ".";
    if (f.reason === "UNRESOLVED") return "فشل " + what + ": تعذّر تحليل اسم الوجهة.";
    return "فشل " + what + "؛ توقّف المسار عند " + name(f.failedAt ?? f.hops[f.hops.length - 1]) + ".";
  })();
  const net = makeNet(cfg, view.state.devices, view.state.ops);
  const linkDown = (l: Net2Link) => !linkUp(net, l.a.deviceId, l.a.port);
  const wireless = Object.entries(view.state.ops.wifi).filter(([, w]) => w.status === "associated" && w.ap).map(([host, w]) => ({ host, ap: w.ap! }));
  const remainingTotal = Math.max(0, NET2_LIMITS.actions - base.length);
  const pick = (id: string) => { setSelected(id); setConfirm(false); setNotice(""); };
  return (
    <div className="net2 net2-student" data-testid="net2-workspace">
      <div className="net2-panel">
        {preview && <p className="net2-note" data-testid="net2-preview-note">معاينة: تعمل بالحالة الابتدائية نفسها التي يراها الطالب؛ لا يُحفظ شيء هنا.</p>}
        {restoredBroken && <p className="net2-error" role="alert">تعذّر استعادة العمل المحفوظ لهذا السؤال؛ تُعرض الحالة الابتدائية.</p>}
        <Net2Diagram config={cfg} title={"مخطط الشبكة (ثابت، يحدده المعلم): " + cfg.devices.length + " أجهزة و" + cfg.links.length + " وصلات"} selectedId={selected} onSelect={pick} linkDown={linkDown} wireless={wireless}
          flow={shown ? { id: shown.id, ok: shown.flow.ok, hops: shown.flow.hops } : null} />
        <p className="net2-flow-status" role="status" data-testid="net2-flow-status" data-ok={shown ? String(shown.flow.ok) : undefined}>{flowStatus}</p>
        <ul className="net2-devices" data-testid="net2-device-list" aria-label="الأجهزة في المخطط">
          {cfg.devices.map(d => <li key={d.id}><button type="button" aria-pressed={selected === d.id} onClick={() => pick(d.id)}>{d.label} ({KIND_LABEL[d.kind]})</button></li>)}
        </ul>
        {!disabled && (
          <div className="net2-actions">
            {confirm
              ? <><button type="button" className="is-danger" onClick={() => { setConfirm(false); emit([]); }}>تأكيد العودة إلى الحالة الابتدائية</button><button type="button" className="is-secondary" onClick={() => setConfirm(false)}>إلغاء</button></>
              : <button type="button" className="is-secondary" onClick={() => setConfirm(true)} disabled={base.length === 0}>إعادة ضبط الإجابة</button>}
            <span className="net2-note">الإجراءات المتبقية: {remainingTotal}</span>
          </div>
        )}
        {notice && <p className="net2-error" role="status">{notice}</p>}
      </div>
      {device && (
        <section className="net2-panel" data-testid="net2-device-panel" aria-labelledby={"net2-sel-" + device.id}>
          <h4 id={"net2-sel-" + device.id} aria-live="polite">{device.label} ({KIND_LABEL[device.kind]})</h4>
          <DevicePanel cfg={cfg} view={view} device={device} base={base} emit={more => emit([...base, ...more])} disabled={disabled} label={label} remainingTotal={remainingTotal} name={name} />
        </section>
      )}
      {!device && <p className="net2-note">اختر جهازًا من المخطط أو من قائمة الأجهزة لفتح واجهته (سطح المكتب أو سطر الأوامر أو إعدادات نقطة الوصول).</p>}
    </div>
  );
}
