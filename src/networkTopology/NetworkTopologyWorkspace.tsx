import { useMemo, useState } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import CliTerminalSurface from "../networkCli/CliTerminalSurface";
import TopologyDiagram from "./TopologyDiagram";
import { NETWORK_CLI_LIMITS, NETWORK_CLI_MODE_LABEL, executeCommand, promptFor } from "../networkCliEngine";
import { ROUTER_CLI_LIMITS, ROUTER_MODE_LABEL, executeRouterCommand, routerPromptFor } from "../routerCliEngine";
import { PC_FIELDS, TOPOLOGY_LIMITS, isValidPcValue, validateTopologyConfig, type NetworkTopologyConfigV1, type NetworkTopologyStateV1, type PcConfig, type PcField } from "../networkTopologyModel";
import { replayTopology, type DeviceTranscriptEntry } from "../networkTopologyPlugin";
import { canReach, linkOperational, routerLinkContext, type ReachabilityResult } from "../networkConnectivity";
import { DEVICE_KIND_LABEL, reachText } from "./topologyLabels";
import "./network-topology.css";

// Phase 20B — the networkTopology@1 STUDENT workspace (lazy; also the teacher preview and the editor's try-out). It renders ONLY the
// canonical public config the host projected (never a private check), replays the stored semantic actions through the SAME shared engines
// the server uses (switch = networkCli@1, router = router CLI v1, PCs, connectivity) and emits the next action list through the host's
// generic seam — the existing autosave / restore / submit pipeline persists it. Selection, panels, drafts and ping results are view state
// and never stored. The simulated ping is feedback only, computed by the same connectivity engine that grades reachability on the server.
const PC_FIELD_LABEL: Readonly<Record<PcField, string>> = Object.freeze({ address: "عنوان IPv4", mask: "قناع الشبكة الفرعية", gateway: "البوابة الافتراضية", dns: "خادم DNS" });
const PC_ACTION: Readonly<Record<PcField, string>> = Object.freeze({ address: "pc.setAddress", mask: "pc.setMask", gateway: "pc.setGateway", dns: "pc.setDns" });
const PC_PLACEHOLDER: Readonly<Record<PcField, string>> = Object.freeze({ address: "192.168.10.10", mask: "255.255.255.0", gateway: "192.168.10.254", dns: "8.8.8.8" });
const commandsOf = (actions: readonly unknown[], id: string) => actions.filter(a => !!a && typeof a === "object" && (a as { deviceId?: unknown }).deviceId === id && typeof (a as { command?: unknown }).command === "string").length;

function PcPanel({ id, name, cfg, state, current, onApply, disabled }: { id: string; name: (id: string) => string; cfg: NetworkTopologyConfigV1; state: NetworkTopologyStateV1; current: PcConfig; onApply: (actions: { type: string; deviceId: string; value: string }[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<Record<PcField, string>>({ address: current.address ?? "", mask: current.mask ?? "", gateway: current.gateway ?? "", dns: current.dns ?? "" });
  const [error, setError] = useState("");
  const targets = cfg.devices.filter(d => d.id !== id && (d.kind === "pc" || d.kind === "router"));
  const [dest, setDest] = useState(targets[0]?.id ?? "");
  const [ping, setPing] = useState<ReachabilityResult | null>(null);
  const apply = () => {
    const bad = PC_FIELDS.find(f => draft[f].trim() !== "" && !isValidPcValue(f, draft[f].trim()));
    if (bad) { setError(PC_FIELD_LABEL[bad] + " غير صالح."); return; }
    setError("");
    const next = PC_FIELDS.filter(f => draft[f].trim() !== (current[f] ?? "")).map(f => ({ type: PC_ACTION[f], deviceId: id, value: draft[f].trim() }));
    if (next.length) onApply(next);
  };
  return (
    <div className="nettopo-panel" data-testid="nettopo-pc-panel">
      <div className="nettopo-fields">
        {PC_FIELDS.map(f => (
          <label key={f}><span>{PC_FIELD_LABEL[f]}</span>
            <input className="nettopo-ltr" dir="ltr" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={TOPOLOGY_LIMITS.pcValueChars} placeholder={PC_PLACEHOLDER[f]}
              value={draft[f]} disabled={disabled} onChange={e => setDraft({ ...draft, [f]: e.target.value })} />
          </label>
        ))}
      </div>
      {error && <p className="nettopo-error" role="alert">{error}</p>}
      {!disabled && <div className="nettopo-actions"><button type="button" onClick={apply}>تطبيق الإعدادات</button></div>}
      <div className="nettopo-ping">
        <label><span>الجهاز الوجهة</span>
          <select value={dest} onChange={e => { setDest(e.target.value); setPing(null); }}>
            {targets.map(d => <option key={d.id} value={d.id}>{d.label} ({DEVICE_KIND_LABEL[d.kind]})</option>)}
          </select>
        </label>
        <button type="button" disabled={!dest} onClick={() => setPing(canReach(id, dest, cfg, state))}>اختبار الاتصال (ping)</button>
      </div>
      {ping && <p className="nettopo-ping-result" role="status" data-testid="nettopo-ping-result" data-ok={ping.reachable ? "true" : "false"}>{name(id)} → {name(dest)}: {reachText(ping, name)}</p>}
      <p className="nettopo-note">اختبار الاتصال للتعلّم فقط ولا يُحتسب علامة؛ التصحيح يتحقق من الاتصال على الخادم.</p>
    </div>
  );
}

export default function NetworkTopologyWorkspace({ config: rawConfig, actions, onChange, disabled, label, preview }: SmartSimWorkspaceProps) {
  const cfg = useMemo(() => { const r = validateTopologyConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayTopology(cfg, actions) : null), [cfg, actions]);
  const fallback = useMemo(() => (cfg ? replayTopology(cfg, []) : null), [cfg]);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"all" | "device" | null>(null);
  const [notice, setNotice] = useState("");
  if (!cfg || !fallback || !fallback.ok) return <p className="ncli-unavailable" role="note" data-testid="nettopo-unavailable">مخطط الشبكة لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const view = replay && replay.ok ? replay : fallback;
  const restoredBroken = !!replay && !replay.ok;
  const name = (id: string) => cfg.devices.find(d => d.id === id)?.label ?? id;
  const device = selected ? cfg.devices.find(d => d.id === selected) ?? null : null;
  const emit = (next: unknown[]) => {
    const r = replayTopology(cfg, next);
    if (!r.ok) { setNotice(r.code === "NETTOPO_DEVICE_COMMANDS_TOO_MANY" ? "اكتمل الحد الأقصى لأوامر هذا الجهاز." : "تعذّر تنفيذ الإجراء."); return; }
    setNotice("");
    onChange(next, r.state);
  };
  const base = restoredBroken ? [] : [...actions];
  const remainingTotal = Math.max(0, TOPOLOGY_LIMITS.actions - base.length);
  const terminal = (kind: "switch" | "router", id: string) => {
    const entries: DeviceTranscriptEntry[] = view.transcripts[id] ?? [];
    const remaining = Math.min(remainingTotal, Math.max(0, TOPOLOGY_LIMITS.commandsPerDevice - commandsOf(base, id)));
    const submit = (line: string) => {
      if (disabled || remaining <= 0) return;
      const r = kind === "switch" ? executeCommand(view.runtime.switches[id], line) : executeRouterCommand(view.runtime.routers[id], line);
      if (r.result.status === "refused") { setNotice(r.result.output[0] + (r.result.hint ? " — " + r.result.hint : "")); return; }
      if (r.result.status === "empty") return;
      emit([...base, { type: kind + ".command", deviceId: id, command: line }]);
    };
    const prompt = kind === "switch" ? promptFor(view.runtime.switches[id]) : routerPromptFor(view.runtime.routers[id]);
    const modeLabel = kind === "switch" ? NETWORK_CLI_MODE_LABEL[view.runtime.switches[id].mode] : ROUTER_MODE_LABEL[view.runtime.routers[id].mode];
    return <CliTerminalSurface key={id} prompt={prompt} modeLabel={modeLabel} deviceName={name(id)} entries={entries} onSubmit={submit} disabled={disabled} label={label + " — " + name(id)}
      remaining={remaining} maxCommands={TOPOLOGY_LIMITS.commandsPerDevice} inputChars={kind === "switch" ? NETWORK_CLI_LIMITS.inputChars : ROUTER_CLI_LIMITS.inputChars} notice={notice || undefined} testId="nettopo-terminal"
      footnote={kind === "switch" ? <>سويتش تعليمي (محرك networkCli@1)؛ اكتب <code>?</code> لعرض أوامر الوضع الحالي.</> : <>راوتر تعليمي مبسّط (v1): الواجهات وعناوينها والشبكات المتصلة مباشرة؛ اكتب <code>?</code> لعرض أوامر الوضع الحالي.</>} />;
  };
  return (
    <div className="nettopo nettopo-student" data-testid="nettopo-workspace">
      <div className="nettopo-diagram-col">
        {preview && <p className="nettopo-note" data-testid="nettopo-preview-note">معاينة: تعمل بالحالة الابتدائية نفسها التي يراها الطالب؛ لا يُحفظ شيء هنا.</p>}
        {restoredBroken && <p className="nettopo-error" role="alert">تعذّر استعادة العمل المحفوظ لهذا السؤال؛ تُعرض الحالة الابتدائية.</p>}
        <TopologyDiagram config={cfg} title={"مخطط الشبكة: " + cfg.devices.length + " أجهزة و" + cfg.links.length + " وصلات"} selectedId={selected} onSelect={id => { setSelected(id); setConfirm(null); setNotice(""); }} linkDown={l => !linkOperational(cfg, view.state, l)} />
        <ul className="nettopo-devices" data-testid="nettopo-device-list" aria-label="الأجهزة في المخطط">
          {cfg.devices.map(d => <li key={d.id}><button type="button" aria-pressed={selected === d.id} onClick={() => { setSelected(d.id); setConfirm(null); setNotice(""); }}>{d.label} ({DEVICE_KIND_LABEL[d.kind]})</button></li>)}
        </ul>
        {!disabled && (
          <div className="nettopo-actions">
            {confirm === "all"
              ? <><button type="button" className="is-danger" onClick={() => { setConfirm(null); emit([]); }}>تأكيد إعادة ضبط المحاكاة</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
              : <button type="button" className="is-secondary" onClick={() => setConfirm("all")} disabled={base.length === 0}>إعادة ضبط المحاكاة</button>}
            <span className="nettopo-note">الإجراءات المتبقية: {remainingTotal}</span>
          </div>
        )}
      </div>
      <section className="nettopo-panel" aria-labelledby={"nettopo-sel-" + (device?.id ?? "none")}>
        <h4 className="nettopo-selected" id={"nettopo-sel-" + (device?.id ?? "none")} data-testid="nettopo-selected" aria-live="polite">{device ? "الجهاز المحدد: " + device.label + " (" + DEVICE_KIND_LABEL[device.kind] + ")" : "اختر جهازًا من المخطط أو من قائمة الأجهزة لإعداده."}</h4>
        {device?.kind === "pc" && <PcPanel key={device.id + "|" + JSON.stringify(view.state.pcs[device.id] ?? {})} id={device.id} name={name} cfg={cfg} state={view.state} current={view.state.pcs[device.id] ?? {}} disabled={disabled} onApply={next => emit([...base, ...next])} />}
        {device && device.kind !== "pc" && terminal(device.kind, device.id)}
        {device && device.kind === "router" && <RouterLinkNote cfg={cfg} state={view.state} id={device.id} />}
        {device && !disabled && base.some(a => (a as { deviceId?: string }).deviceId === device.id) && (
          <div className="nettopo-actions">
            {confirm === "device"
              ? <><button type="button" className="is-danger" onClick={() => { setConfirm(null); emit(base.filter(a => (a as { deviceId?: string }).deviceId !== device.id)); }}>تأكيد إعادة ضبط الجهاز</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
              : <button type="button" className="is-secondary" onClick={() => setConfirm("device")}>إعادة ضبط هذا الجهاز</button>}
          </div>
        )}
      </section>
    </div>
  );
}

/** Which router ports are cabled / operational right now (educational context next to the router CLI). */
function RouterLinkNote({ cfg, state, id }: { cfg: NetworkTopologyConfigV1; state: NetworkTopologyStateV1; id: string }) {
  const ctx = routerLinkContext(cfg, state, id);
  const ports = cfg.links.flatMap(l => (l.a.deviceId === id ? [l.a.port] : l.b.deviceId === id ? [l.b.port] : [])).sort();
  if (!ports.length) return null;
  return <p className="nettopo-note">الواجهات الموصولة: <span className="nettopo-ltr">{ports.map(p => p + (ctx.linkUp?.(p) ? " (up)" : " (down)")).join(" · ")}</span></p>;
}
