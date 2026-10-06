import { useState } from "react";
import CliTerminalSurface from "../networkCli/CliTerminalSurface";
import { ADAPTER_LABEL, countOf } from "./net2Labels";
import {
  NET2_LIMITS, adapterNames, deriveMac, isApPassphrase, isSsid, isWpaPassphrase, parseNet2Url, validDhcpServerPool, validDnsRecords, validHttpPage, validStaticFields,
  type Net2AdapterName, type Net2ApState, type Net2Config, type Net2Device, type Net2HostState
} from "../net2Model";
import { NET2_SWITCH_LIMITS, SWITCH2_MODE_LABEL, parseSwitchCommand, type SwitchMode2 } from "../net2SwitchCli";
import { NET2_ROUTER_LIMITS, ROUTER2_MODE_LABEL, parseRouterCommand, type RouterMode2 } from "../net2RouterCli";
import { HOST_PROMPT, NET2_HOST_LIMITS, parseHostCommand } from "../net2Host";
import { BROWSER_PROMPT, NET2_AP_FIELDS, type Net2ApField, type Net2Replay } from "../net2Plugin";
import "./net2.css";

// Phase 20C — the networkTopology@2 DEVICE SURFACES, shared by the student workspace and the teacher's initial-state sandbox: the PC /
// Laptop / Server Desktop (IP Configuration, Command Prompt, Wireless, Network Status, Browser, server Services), the switch / router CLI
// and the Access Point configuration. Every surface only EMITS semantic actions; what it shows comes from the replayed canonical state
// (the same code the server grades with). Drafts and the selected app are view state and never stored.
export type Net2View = Extract<Net2Replay, { ok: true }>;
export type Net2Emit = (actions: Record<string, unknown>[]) => void;

export type PanelProps = { cfg: Net2Config; view: Net2View; device: Net2Device; base: readonly unknown[]; emit: Net2Emit; disabled?: boolean; label: string; remainingTotal: number; name: (id: string) => string };

// ── switch / router CLI ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function CliPanel({ view, device, base, emit, disabled, label, remainingTotal, name }: PanelProps) {
  const [notice, setNotice] = useState("");
  const kind = device.kind as "switch" | "router";
  const remaining = Math.min(remainingTotal, Math.max(0, NET2_LIMITS.commandsPerDevice - countOf(base, device.id, ["switch.command", "router.command"])));
  const submit = (line: string) => {
    if (disabled || remaining <= 0) return;
    const p = kind === "switch" ? parseSwitchCommand(line) : parseRouterCommand(line);
    if (p.kind === "empty") return;
    if (p.kind === "refused") { setNotice("السطر أطول من الحد المسموح ولم يُنفَّذ."); return; }
    setNotice("");
    emit([{ type: kind + ".command", deviceId: device.id, command: line }]);
  };
  const mode = view.modes[device.id] ?? "user";
  const modeLabel = kind === "switch" ? SWITCH2_MODE_LABEL[mode as SwitchMode2] : ROUTER2_MODE_LABEL[mode as RouterMode2];
  return (
    <CliTerminalSurface prompt={view.prompts[device.id] ?? ""} modeLabel={modeLabel ?? mode} deviceName={name(device.id)} entries={view.transcripts[device.id] ?? []} onSubmit={submit} disabled={disabled}
      label={label + " — " + name(device.id)} remaining={remaining} maxCommands={NET2_LIMITS.commandsPerDevice} inputChars={kind === "switch" ? NET2_SWITCH_LIMITS.inputChars : NET2_ROUTER_LIMITS.inputChars}
      notice={notice || undefined} testId="net2-cli"
      footnote={kind === "switch" ? <>سويتش المنهاج (v2): VLAN و Trunk و VTP و Port Security وكلمات المرور؛ اكتب <code>?</code> لعرض الأوامر.</> : <>راوتر المنهاج (v2): واجهات فرعية dot1Q و DHCP وكلمات المرور؛ اكتب <code>?</code> لعرض الأوامر.</>} />
  );
}

// ── Access Point ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const AP_LABEL: Readonly<Record<Net2ApField, string>> = Object.freeze({ enabled: "Radio Enabled", ssid: "SSID", security: "Security", passphrase: "Passphrase (WPA2)", address: "Management IP", mask: "Management Mask", gateway: "Management Gateway" });
export function ApPanel({ view, device, emit, disabled, name }: PanelProps) {
  const st = view.state.devices[device.id] as Net2ApState;
  const current: Record<Net2ApField, string | boolean> = { enabled: st.enabled, ssid: st.ssid, security: st.security, passphrase: st.passphrase, address: st.address ?? "", mask: st.mask ?? "", gateway: st.gateway ?? "" };
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState("");
  const clients = Object.entries(view.state.ops.wifi).filter(([, w]) => w.status === "associated" && w.ap === device.id).map(([h]) => name(h));
  const save = () => {
    const d = { ...draft, ssid: String(draft.ssid).trim(), address: String(draft.address).trim(), mask: String(draft.mask).trim(), gateway: String(draft.gateway).trim() };
    if (!isSsid(d.ssid)) { setError("SSID مطلوب (1–32 حرفًا)."); return; }
    if (!isApPassphrase(d.passphrase)) { setError("عبارة مرور WPA2 من 8 إلى 63 حرفًا (أو فارغة)."); return; }
    if (!validStaticFields({ address: d.address, mask: d.mask, gateway: d.gateway, dns: "" })) { setError("عنوان الإدارة وقناعه يجب أن يكونا صالحين معًا (أو فارغين)."); return; }
    setError("");
    const changed = NET2_AP_FIELDS.filter(f => d[f] !== current[f]).map(f => ({ type: "ap.set", deviceId: device.id, field: f, value: d[f] }));
    if (changed.length) emit(changed);
  };
  return (
    <div className="net2-app" data-testid="net2-ap-config">
      <div className="net2-fields">
        <label><span>{AP_LABEL.enabled}</span><input type="checkbox" checked={draft.enabled === true} disabled={disabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /></label>
        <label><span>{AP_LABEL.ssid}</span><input className="net2-ltr" dir="ltr" maxLength={32} value={String(draft.ssid)} disabled={disabled} onChange={e => setDraft({ ...draft, ssid: e.target.value })} /></label>
        <label><span>{AP_LABEL.security}</span><select value={String(draft.security)} disabled={disabled} onChange={e => setDraft({ ...draft, security: e.target.value })}><option value="open">Open</option><option value="wpa2">WPA2-PSK</option></select></label>
        <label><span>{AP_LABEL.passphrase}</span><input className="net2-ltr" dir="ltr" maxLength={63} value={String(draft.passphrase)} disabled={disabled} onChange={e => setDraft({ ...draft, passphrase: e.target.value })} /></label>
        {(["address", "mask", "gateway"] as const).map(f => <label key={f}><span>{AP_LABEL[f]}</span><input className="net2-ltr" dir="ltr" inputMode="decimal" maxLength={15} value={String(draft[f])} disabled={disabled} onChange={e => setDraft({ ...draft, [f]: e.target.value })} /></label>)}
      </div>
      {error && <p className="net2-error" role="alert">{error}</p>}
      {!disabled && <div className="net2-actions"><button type="button" onClick={save}>حفظ</button></div>}
      <p className="net2-note">نقطة الوصول جسر طبقة ثانية بين منفذها السلكي والأجهزة اللاسلكية المتصلة بها. الأجهزة المتصلة الآن: <span className="net2-ltr">{clients.length ? clients.join(", ") : "—"}</span></p>
    </div>
  );
}

// ── host Desktop ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type App = "ipconfig" | "cmd" | "wireless" | "status" | "browser" | "services";
const APP_LABEL: Readonly<Record<App, string>> = Object.freeze({ ipconfig: "IP Configuration", cmd: "Command Prompt", wireless: "Wireless", status: "Network Status", browser: "Browser", services: "Services" });
export function HostDesktop(props: PanelProps) {
  const { device } = props;
  const names = adapterNames(device);
  const apps: App[] = ["ipconfig", "cmd", ...(names.includes("wlan0") ? ["wireless" as const] : []), "status", "browser", ...(device.kind === "server" ? ["services" as const] : [])];
  const [app, setApp] = useState<App>("ipconfig");
  return (
    <div className="net2-desktop" data-testid="net2-desktop">
      <div className="net2-apps" role="toolbar" aria-label={"تطبيقات " + props.name(device.id)}>
        {apps.map(a => <button key={a} type="button" aria-pressed={app === a} onClick={() => setApp(a)}>{APP_LABEL[a]}</button>)}
      </div>
      {app === "ipconfig" && <IpConfigApp {...props} />}
      {app === "cmd" && <CmdApp {...props} />}
      {app === "wireless" && <WirelessApp {...props} />}
      {app === "status" && <NetStatusApp {...props} />}
      {app === "browser" && <BrowserApp {...props} />}
      {app === "services" && <ServicesApp {...props} />}
    </div>
  );
}
const FIELD_LABEL = { address: "IP Address", mask: "Subnet Mask", gateway: "Default Gateway", dns: "DNS Server" } as const;
type StaticField = keyof typeof FIELD_LABEL;
function IpConfigApp({ view, device, emit, disabled }: PanelProps) {
  const names = adapterNames(device);
  const [adapter, setAdapter] = useState<Net2AdapterName>(names[0]);
  const host = view.state.devices[device.id] as Net2HostState;
  const cfg = host.adapters[adapter] ?? { mode: "static" as const };
  const ops = view.state.ops.adapters[device.id + "/" + adapter] ?? { status: "disconnected" as const };
  return <IpConfigForm key={adapter} device={device} adapter={adapter} names={names} setAdapter={setAdapter} cfg={cfg} ops={ops} emit={emit} disabled={disabled} />;
}
function IpConfigForm({ device, adapter, names, setAdapter, cfg, ops, emit, disabled }: { device: Net2Device; adapter: Net2AdapterName; names: Net2AdapterName[]; setAdapter: (a: Net2AdapterName) => void; cfg: { mode: "static" | "dhcp"; address?: string; mask?: string; gateway?: string; dns?: string }; ops: { status: string; address?: string; mask?: string; gateway?: string; dns?: string }; emit: Net2Emit; disabled?: boolean }) {
  const dhcp = cfg.mode === "dhcp";
  const fromCfg = (): Record<StaticField, string> => ({ address: cfg.address ?? "", mask: cfg.mask ?? "", gateway: cfg.gateway ?? "", dns: cfg.dns ?? "" });
  const [draft, setDraft] = useState<Record<StaticField, string>>(fromCfg);
  const [error, setError] = useState("");
  // the canonical configuration changed (save, mode switch, restore): the drafts follow it (render-time sync, no remount)
  const cfgKey = JSON.stringify(cfg);
  const [synced, setSynced] = useState(cfgKey);
  if (synced !== cfgKey) { setSynced(cfgKey); setDraft(fromCfg()); }
  const shown = (f: StaticField) => (dhcp ? ops[f] ?? "" : draft[f]);
  const save = () => {
    const d = { address: draft.address.trim(), mask: draft.mask.trim(), gateway: draft.gateway.trim(), dns: draft.dns.trim() };
    if (!validStaticFields(d)) { setError("إعداد غير صالح: تحقّق من العنوان والقناع (معًا) والبوابة و DNS."); return; }
    setError("");
    emit([{ type: "host.setStatic", deviceId: device.id, adapter, ...d }]);
  };
  const uid = device.id + "-" + adapter;
  return (
    <div className="net2-app" data-testid="net2-ipconfig">
      {names.length > 1 && <label className="net2-field"><span>Adapter</span><select value={adapter} onChange={e => setAdapter(e.target.value as Net2AdapterName)}>{names.map(n => <option key={n} value={n}>{ADAPTER_LABEL[n]}</option>)}</select></label>}
      <fieldset className="net2-radios" aria-label="IP Configuration mode">
        <label><input type="radio" name={"mode-" + uid} checked={!dhcp} disabled={disabled} onChange={() => emit([{ type: "host.setMode", deviceId: device.id, adapter, mode: "static" }])} />Static</label>
        <label><input type="radio" name={"mode-" + uid} checked={dhcp} disabled={disabled} onChange={() => emit([{ type: "host.setMode", deviceId: device.id, adapter, mode: "dhcp" }])} />DHCP</label>
      </fieldset>
      <div className="net2-fields">
        {(Object.keys(FIELD_LABEL) as StaticField[]).map(f => (
          <div key={f} className="net2-field">
            <label htmlFor={"ip-" + uid + "-" + f}>{FIELD_LABEL[f]}</label>
            <input id={"ip-" + uid + "-" + f} className="net2-ltr" dir="ltr" inputMode="decimal" maxLength={15} autoComplete="off" spellCheck={false} readOnly={dhcp || disabled} value={shown(f)}
              onChange={e => setDraft({ ...draft, [f]: e.target.value })} />
          </div>
        ))}
      </div>
      {dhcp && <p className="net2-note">الوضع DHCP: القيم أعلاه هي ما حصل عليه المحوّل ({ops.status === "dhcp" ? "عقد DHCP" : ops.status === "apipa" ? "عنوان APIPA تلقائي — لم يُعثر على خادم DHCP" : ops.status === "released" ? "تم تحرير العنوان" : "غير متصل"}).</p>}
      {error && <p className="net2-error" role="alert">{error}</p>}
      {!dhcp && !disabled && <div className="net2-actions"><button type="button" onClick={save}>حفظ</button></div>}
    </div>
  );
}
function CmdApp({ view, device, base, emit, disabled, label, remainingTotal, name }: PanelProps) {
  const [notice, setNotice] = useState("");
  const remaining = Math.min(remainingTotal, Math.max(0, NET2_LIMITS.hostCommandsPerDevice - countOf(base, device.id, ["host.command", "host.browse"])));
  const entries = (view.transcripts[device.id] ?? []).filter(e => e.prompt === HOST_PROMPT);
  const submit = (line: string) => {
    if (disabled || remaining <= 0) return;
    const p = parseHostCommand(line);
    if (p.kind === "fail" && p.result.status === "empty") return;
    if (p.kind === "fail" && p.result.status === "refused") { setNotice("السطر أطول من الحد المسموح ولم يُنفَّذ."); return; }
    setNotice("");
    emit([{ type: "host.command", deviceId: device.id, command: line }]);
  };
  return <CliTerminalSurface prompt={HOST_PROMPT} modeLabel="موجّه الأوامر (Command Prompt)" deviceName={name(device.id)} entries={entries} onSubmit={submit} disabled={disabled} label={label + " — " + name(device.id) + " — Command Prompt"}
    remaining={remaining} maxCommands={NET2_LIMITS.hostCommandsPerDevice} inputChars={NET2_HOST_LIMITS.inputChars} notice={notice || undefined} testId="net2-cmd"
    footnote={<>أوامر تعليمية فقط: ipconfig و ping و tracert و arp -a و nslookup — لا شبكة حقيقية ولا أوامر نظام.</>} />;
}
const WIFI_TEXT: Readonly<Record<string, string>> = Object.freeze({ associated: "متصل", "auth-failed": "فشل الاتصال: عبارة المرور غير صحيحة (authentication failed)", "no-ssid": "الشبكة غير متاحة (no SSID in range)", disconnected: "غير متصل" });
function WirelessApp({ view, cfg, device, base, emit, disabled }: PanelProps) {
  const ssids = [...new Map(cfg.devices.filter(d => d.kind === "ap").map(d => view.state.devices[d.id] as Net2ApState).filter(a => a.enabled).map(a => [a.ssid, a.security] as const)).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const w = view.state.ops.wifi[device.id] ?? { status: "disconnected" as const };
  const [ssid, setSsid] = useState(w.ssid ?? "");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const left = NET2_LIMITS.wifiActionsPerHost - countOf(base, device.id, ["host.wifiConnect", "host.wifiDisconnect"]);
  const connect = () => {
    if (!isSsid(ssid)) { setError("اختر شبكة لاسلكية."); return; }
    if (pass !== "" && !isWpaPassphrase(pass)) { setError("عبارة مرور WPA2 من 8 إلى 63 حرفًا."); return; }
    setError("");
    emit([{ type: "host.wifiConnect", deviceId: device.id, ssid, passphrase: pass }]);
  };
  const hasIntent = !!(view.state.devices[device.id] as Net2HostState).wifi;
  return (
    <div className="net2-app" data-testid="net2-wireless">
      <fieldset className="net2-radios" aria-label="Available networks">
        {ssids.length === 0 && <span className="net2-note">لا توجد شبكات لاسلكية متاحة.</span>}
        {ssids.map(([s, sec]) => <label key={s}><input type="radio" name={"ssid-" + device.id} checked={ssid === s} disabled={disabled} onChange={() => setSsid(s)} /><span className="net2-ltr">{s} ({sec === "wpa2" ? "WPA2" : "Open"})</span></label>)}
      </fieldset>
      <label className="net2-field"><span>Passphrase</span><input className="net2-ltr" dir="ltr" type="password" maxLength={63} autoComplete="off" value={pass} disabled={disabled} onChange={e => setPass(e.target.value)} /></label>
      {error && <p className="net2-error" role="alert">{error}</p>}
      {!disabled && left > 0 && <div className="net2-actions"><button type="button" onClick={connect}>Connect</button>{hasIntent && <button type="button" className="is-secondary" onClick={() => emit([{ type: "host.wifiDisconnect", deviceId: device.id }])}>Disconnect</button>}</div>}
      <p className="net2-status" role="status" data-testid="net2-wifi-status" data-ok={w.status === "associated" ? "true" : w.status === "disconnected" ? undefined : "false"}>
        {WIFI_TEXT[w.status] ?? w.status}{w.ssid ? " — " + w.ssid : ""}
      </p>
    </div>
  );
}
const STATUS_TEXT: Readonly<Record<string, string>> = Object.freeze({ static: "Static", dhcp: "DHCP lease", apipa: "APIPA (no DHCP server)", released: "Released", disconnected: "Media disconnected" });
function NetStatusApp({ view, device }: PanelProps) {
  const names = adapterNames(device);
  const w = view.state.ops.wifi[device.id];
  return (
    <div className="net2-app" data-testid="net2-netstatus">
      <div className="net2-table-wrap"><table className="net2-table">
        <thead><tr><th>Adapter</th><th>Status</th><th>IPv4</th><th>Mask</th><th>Gateway</th><th>DNS</th><th>DHCP server</th><th>MAC</th></tr></thead>
        <tbody>{names.map(n => {
          const o = view.state.ops.adapters[device.id + "/" + n] ?? { status: "disconnected" };
          return <tr key={n}><td>{ADAPTER_LABEL[n]}</td><td>{STATUS_TEXT[o.status] ?? o.status}</td>{[o.address, o.mask, o.gateway, o.dns, o.dhcpServer, deriveMac(device.id, n)].map((v, i) => <td key={i} className="net2-ltr">{v ?? "—"}</td>)}</tr>;
        })}</tbody>
      </table></div>
      {w && <p className="net2-note">Wi-Fi: {WIFI_TEXT[w.status] ?? w.status}{w.ssid ? " — " + w.ssid : ""}</p>}
    </div>
  );
}
function BrowserApp({ view, device, base, emit, disabled }: PanelProps) {
  const [url, setUrl] = useState("http://");
  const [error, setError] = useState("");
  const pages = (view.transcripts[device.id] ?? []).filter(e => e.prompt === BROWSER_PROMPT);
  const last = pages[pages.length - 1];
  const left = NET2_LIMITS.hostCommandsPerDevice - countOf(base, device.id, ["host.command", "host.browse"]);
  const go = () => {
    const u = url.trim();
    if (!parseNet2Url(u)) { setError("العنوان يجب أن يكون بالشكل http://اسم-أو-عنوان (المتصفح محاكى ولا يصل إلى الإنترنت)."); return; }
    setError("");
    emit([{ type: "host.browse", deviceId: device.id, url: u }]);
  };
  return (
    <div className="net2-app" data-testid="net2-browser">
      <label className="net2-field"><span>URL</span><input className="net2-ltr" dir="ltr" maxLength={NET2_LIMITS.urlChars} value={url} disabled={disabled} onChange={e => setUrl(e.target.value)} /></label>
      {error && <p className="net2-error" role="alert">{error}</p>}
      {!disabled && left > 0 && <div className="net2-actions"><button type="button" onClick={go}>فتح الصفحة</button></div>}
      {last && <pre className="net2-pre" aria-label={"نتيجة " + last.input}>{[last.input, "", ...last.result.output].join("\n")}</pre>}
    </div>
  );
}
function ServicesApp({ view, device, emit, disabled }: PanelProps) {
  const sv = (view.state.devices[device.id] as Net2HostState).services ?? {};
  const [dhcp, setDhcp] = useState({ enabled: sv.dhcp?.enabled ?? false, defaultRouter: sv.dhcp?.pool.defaultRouter ?? "", dns: sv.dhcp?.pool.dns ?? "", start: sv.dhcp?.pool.start ?? "", mask: sv.dhcp?.pool.mask ?? "255.255.255.0", max: String(sv.dhcp?.pool.max ?? 50) });
  const [dns, setDns] = useState({ enabled: sv.dns?.enabled ?? false, records: (sv.dns?.records ?? []).map(r => r.name + " " + r.address).join("\n") });
  const [http, setHttp] = useState({ enabled: sv.http?.enabled ?? false, title: sv.http?.title ?? "", body: sv.http?.body ?? "" });
  const [error, setError] = useState("");
  const saveDhcp = () => {
    const pool = { defaultRouter: dhcp.defaultRouter.trim(), dns: dhcp.dns.trim(), start: dhcp.start.trim(), mask: dhcp.mask.trim(), max: Number(dhcp.max) };
    if (!validDhcpServerPool(pool)) { setError("إعداد DHCP غير صالح (عنوان البداية والقناع والحد الأقصى 1–256)."); return; }
    setError(""); emit([{ type: "server.setDhcp", deviceId: device.id, enabled: dhcp.enabled, pool }]);
  };
  const saveDns = () => {
    const records = dns.records.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [name, address] = l.split(/\s+/); return { name: (name ?? "").toLowerCase(), address: address ?? "" }; });
    if (!validDnsRecords(records)) { setError("سجلات DNS: سطر لكل سجل بالشكل «الاسم العنوان» (حتى 16 سجلًا)."); return; }
    setError(""); emit([{ type: "server.setDns", deviceId: device.id, enabled: dns.enabled, records }]);
  };
  const saveHttp = () => {
    if (!validHttpPage(http.title, http.body)) { setError("صفحة HTTP: نص عادي فقط (بلا وسوم HTML)، العنوان حتى 60 حرفًا والمحتوى حتى 500."); return; }
    setError(""); emit([{ type: "server.setHttp", deviceId: device.id, enabled: http.enabled, title: http.title, body: http.body }]);
  };
  const ip = (label: string, v: string, set: (v: string) => void) => <label><span>{label}</span><input className="net2-ltr" dir="ltr" maxLength={15} value={v} disabled={disabled} onChange={e => set(e.target.value)} /></label>;
  return (
    <div className="net2-app" data-testid="net2-services">
      <fieldset><legend>DHCP</legend><div className="net2-fields">
        <label><span>DHCP service on</span><input type="checkbox" checked={dhcp.enabled} disabled={disabled} onChange={e => setDhcp({ ...dhcp, enabled: e.target.checked })} /></label>
        {ip("Default Gateway", dhcp.defaultRouter, v => setDhcp({ ...dhcp, defaultRouter: v }))}{ip("DNS Server", dhcp.dns, v => setDhcp({ ...dhcp, dns: v }))}
        {ip("Start IP Address", dhcp.start, v => setDhcp({ ...dhcp, start: v }))}{ip("Subnet Mask", dhcp.mask, v => setDhcp({ ...dhcp, mask: v }))}
        <label><span>Maximum Number of Users</span><input className="net2-ltr" dir="ltr" inputMode="numeric" maxLength={3} value={dhcp.max} disabled={disabled} onChange={e => setDhcp({ ...dhcp, max: e.target.value })} /></label>
      </div>{!disabled && <div className="net2-actions"><button type="button" onClick={saveDhcp}>حفظ DHCP</button></div>}</fieldset>
      <fieldset><legend>DNS</legend>
        <label><span>DNS service on</span><input type="checkbox" checked={dns.enabled} disabled={disabled} onChange={e => setDns({ ...dns, enabled: e.target.checked })} /></label>
        <label className="net2-field"><span>Records (one per line: name address)</span><textarea className="net2-ltr" dir="ltr" rows={4} value={dns.records} disabled={disabled} onChange={e => setDns({ ...dns, records: e.target.value })} /></label>
        {!disabled && <div className="net2-actions"><button type="button" onClick={saveDns}>حفظ DNS</button></div>}
      </fieldset>
      <fieldset><legend>HTTP</legend>
        <label><span>HTTP service on</span><input type="checkbox" checked={http.enabled} disabled={disabled} onChange={e => setHttp({ ...http, enabled: e.target.checked })} /></label>
        <label className="net2-field"><span>Page title</span><input maxLength={60} value={http.title} disabled={disabled} onChange={e => setHttp({ ...http, title: e.target.value })} /></label>
        <label className="net2-field"><span>Page text</span><textarea rows={3} maxLength={500} value={http.body} disabled={disabled} onChange={e => setHttp({ ...http, body: e.target.value })} /></label>
        {!disabled && <div className="net2-actions"><button type="button" onClick={saveHttp}>حفظ HTTP</button></div>}
      </fieldset>
      {error && <p className="net2-error" role="alert">{error}</p>}
    </div>
  );
}

/** The surface of one device (CLI, AP configuration or host Desktop). */
export function DevicePanel(props: PanelProps) {
  const k = props.device.kind;
  if (k === "switch" || k === "router") return <CliPanel key={props.device.id} {...props} />;
  if (k === "ap") return <ApPanel key={props.device.id + JSON.stringify(props.view.state.devices[props.device.id])} {...props} />;
  return <HostDesktop key={props.device.id} {...props} />;
}
