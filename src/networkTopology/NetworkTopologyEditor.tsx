import { useMemo, useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import TopologyDiagram from "./TopologyDiagram";
import NetworkTopologyWorkspace from "./NetworkTopologyWorkspace";
import { DEVICE_KIND_LABEL } from "./topologyLabels";
import { routerTwoSwitchesFourPcsTemplate, twoLanDemoChecks } from "./networkTopologyTemplates";
import { NETWORK_CHECK_KINDS, defaultCheckLabel } from "../networkTopologyPlugin";
import { PC_FIELDS, TOPOLOGY_LIMITS, devicePorts, type NetworkTopologyConfigV1, type PcField, type TopologyDeviceKind } from "../networkTopologyModel";
import { SWITCH_PORTS } from "../networkCliEngine";
import { ROUTER_PORTS } from "../routerCliEngine";
import "./network-topology.css";

// Phase 20B — networkTopology@1 AUTHORING (lazy). Structured editing only (never raw JSON): the one-click classroom template, devices
// (add / rename / position by drag, buttons or keyboard / delete — refused while a private check uses the device), links between exact free
// ports, optional initial PC addresses and device hostnames, the PRIVATE weighted checks (kind-specific fields, auto labels) and the scoring
// mode. The host shows the canonical validator's issues inline; a collapsed preview runs the real student workspace on a throw-away answer.
type Dev = { id: string; kind: TopologyDeviceKind; label: string; x: number; y: number; initial?: Record<string, unknown> };
type End = { deviceId: string; port: string };
type Lnk = { id: string; a: End; b: End };
type Check = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KINDS: readonly TopologyDeviceKind[] = ["router", "switch", "pc"];
const PREFIX: Readonly<Record<TopologyDeviceKind, { id: string; label: string }>> = Object.freeze({ router: { id: "r", label: "R" }, switch: { id: "sw", label: "SW" }, pc: { id: "pc", label: "PC" } });
const ROW_Y: Readonly<Record<TopologyDeviceKind, number>> = Object.freeze({ router: 0.14, switch: 0.48, pc: 0.84 });
const PC_LABEL: Readonly<Record<PcField, string>> = Object.freeze({ address: "عنوان IPv4", mask: "القناع", gateway: "البوابة", dns: "DNS" });
const clamp01 = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
const nextNumber = (ids: string[], prefix: string) => 1 + ids.reduce((m, id) => { const k = new RegExp("^" + prefix + "(\\d+)$").exec(id); return k ? Math.max(m, Number(k[1])) : m; }, 0);
const isUnit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

function readConfig(raw: unknown): { devices: Dev[]; links: Lnk[] } {
  const c = isObj(raw) ? raw : {};
  const devices = (Array.isArray(c.devices) ? c.devices : []).filter(isObj) as unknown as Dev[];
  const links = (Array.isArray(c.links) ? c.links : []).filter(l => isObj(l) && isObj(l.a) && isObj(l.b)) as unknown as Lnk[];
  return { devices, links };
}
const asConfig = (devices: Dev[], links: Lnk[]): NetworkTopologyConfigV1 => ({ v: 1, devices: devices as NetworkTopologyConfigV1["devices"], links });
/** A drawable subset (devices with a known kind and a valid position; links between drawable devices). */
function drawable(devices: Dev[], links: Lnk[]): NetworkTopologyConfigV1 {
  const ok = devices.filter(d => KINDS.includes(d.kind) && isUnit(d.x) && isUnit(d.y) && typeof d.id === "string");
  const ids = new Set(ok.map(d => d.id));
  return asConfig(ok.map(d => ({ ...d, label: typeof d.label === "string" ? d.label : d.id })), links.filter(l => ids.has(l.a.deviceId) && ids.has(l.b.deviceId)));
}
const usedPorts = (links: Lnk[]) => new Set(links.flatMap(l => [l.a.deviceId + ":" + l.a.port, l.b.deviceId + ":" + l.b.port]));
const refsOf = (checks: Check[], id: string) => checks.filter(c => c.deviceId === id || c.source === id || c.destination === id).map(c => String(c.id));

function defaultsFor(kind: string, devices: Dev[]): Check {
  const meta = NETWORK_CHECK_KINDS[kind];
  if (!meta) return {};
  if (meta.device === "reach") { const pcs = devices.filter(d => d.kind === "pc"), others = devices.filter(d => d.kind === "pc" || d.kind === "router"); return { source: pcs[0]?.id ?? "", destination: others.find(d => d.id !== pcs[0]?.id)?.id ?? "", value: true }; }
  const out: Check = { deviceId: devices.find(d => d.kind === meta.device)?.id ?? "" };
  if (meta.params.includes("interface")) out.interface = meta.iface === "router" ? "g0/0" : meta.iface === "svi" ? "vlan1" : "f0/1";
  if (meta.params.includes("vlan")) out.vlan = 10;
  if (meta.params.includes("value")) out.value = meta.value === "mask" ? "255.255.255.0" : meta.value === "mode" ? "access" : meta.value === "vlan" ? 10 : meta.value === "boolean" ? true : "";
  return out;
}

function CheckRow({ c, devices, config, onChange, onDelete, disabled }: { c: Check; devices: Dev[]; config: NetworkTopologyConfigV1; onChange: (next: Check) => void; onDelete: () => void; disabled?: boolean }) {
  const id = String(c.id);
  const meta = NETWORK_CHECK_KINDS[String(c.kind)];
  const relabel = (next: Check) => onChange(c.label === defaultCheckLabel(c, config) ? { ...next, label: defaultCheckLabel(next, config) } : next);
  const set = (patch: Check) => relabel({ ...c, ...patch });
  const deviceSelect = (field: "deviceId" | "source" | "destination", aria: string, kinds: TopologyDeviceKind[]) => (
    <label><span>{aria}</span><select aria-label={aria + " " + id} value={String(c[field] ?? "")} onChange={e => set({ [field]: e.target.value })} disabled={disabled}>
      <option value="">—</option>{devices.filter(d => kinds.includes(d.kind)).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
    </select></label>
  );
  const valueField = () => {
    if (!meta || !meta.params.includes("value")) return null;
    const aria = "القيمة المطلوبة في الفحص " + id;
    if (meta.value === "mode") return <label><span>القيمة</span><select aria-label={aria} value={String(c.value ?? "")} onChange={e => set({ value: e.target.value })} disabled={disabled}><option value="access">access</option><option value="trunk">trunk</option></select></label>;
    if (meta.value === "boolean") return <label><span>الحالة المطلوبة</span><select aria-label={aria} value={c.value === false ? "false" : "true"} onChange={e => set({ value: e.target.value === "true" })} disabled={disabled}><option value="true">مفعّلة (up)</option><option value="false">معطّلة (shutdown)</option></select></label>;
    if (meta.value === "vlan") return <label><span>VLAN</span><input aria-label={aria} className="nettopo-ltr" dir="ltr" inputMode="numeric" value={String(c.value ?? "")} onChange={e => set({ value: /^\d{1,4}$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} disabled={disabled} /></label>;
    return <label><span>القيمة المطلوبة</span><input aria-label={aria} className="nettopo-ltr" dir="ltr" value={String(c.value ?? "")} onChange={e => set({ value: e.target.value })} disabled={disabled} /></label>;
  };
  return (
    <div className="nettopo-check" data-testid="nettopo-check-row" data-check-id={id}>
      <label><span>نوع الفحص</span><select aria-label={"نوع الفحص " + id} value={String(c.kind ?? "")} disabled={disabled}
        onChange={e => onChange({ id: c.id, label: defaultCheckLabel({ kind: e.target.value, ...defaultsFor(e.target.value, devices) }, config), weight: c.weight, kind: e.target.value, ...defaultsFor(e.target.value, devices) })}>
        {Object.keys(NETWORK_CHECK_KINDS).map(k => <option key={k} value={k}>{NETWORK_CHECK_KINDS[k].label}</option>)}
      </select></label>
      {meta?.device === "reach" ? <>
        {deviceSelect("source", "الجهاز المصدر", ["pc"])}
        {deviceSelect("destination", "الجهاز الوجهة", ["pc", "router"])}
        <label><span>المطلوب</span><select aria-label={"نتيجة الوصول المطلوبة " + id} value={c.value === false ? "false" : "true"} onChange={e => set({ value: e.target.value === "true" })} disabled={disabled}><option value="true">يصل</option><option value="false">لا يصل (معزول)</option></select></label>
      </> : meta ? deviceSelect("deviceId", "الجهاز", [meta.device as TopologyDeviceKind]) : null}
      {meta?.params.includes("interface") && (meta.iface === "svi"
        ? <label><span>واجهة SVI</span><input aria-label={"واجهة الفحص " + id} className="nettopo-ltr" dir="ltr" placeholder="vlan10" value={String(c.interface ?? "")} onChange={e => set({ interface: e.target.value })} disabled={disabled} /></label>
        : <label><span>الواجهة</span><select aria-label={"واجهة الفحص " + id} value={String(c.interface ?? "")} onChange={e => set({ interface: e.target.value })} disabled={disabled}>
          {(meta.iface === "router" ? ROUTER_PORTS : SWITCH_PORTS).map(p => <option key={p} value={p}>{p}</option>)}
        </select></label>)}
      {meta?.params.includes("vlan") && <label><span>VLAN</span><input aria-label={"رقم VLAN في الفحص " + id} className="nettopo-ltr" dir="ltr" inputMode="numeric" value={String(c.vlan ?? "")} onChange={e => set({ vlan: /^\d{1,4}$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} disabled={disabled} /></label>}
      {valueField()}
      <label><span>الوصف (يراه المعلم فقط)</span><input aria-label={"وصف الفحص " + id} value={String(c.label ?? "")} onChange={e => onChange({ ...c, label: e.target.value })} disabled={disabled} /></label>
      <label><span>الوزن</span><input aria-label={"وزن الفحص " + id} type="number" min="0" step="any" className="nettopo-ltr" dir="ltr" value={String(c.weight ?? "")} onChange={e => onChange({ ...c, weight: e.target.value === "" ? "" : Number(e.target.value) })} disabled={disabled} /></label>
      <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الفحص " + id} onClick={onDelete} disabled={disabled}>×</button>
    </div>
  );
}

export default function NetworkTopologyEditor({ config: rawConfig, checks: rawChecks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const { devices, links } = useMemo(() => readConfig(rawConfig), [rawConfig]);
  const checks = useMemo(() => (Array.isArray(rawChecks) ? rawChecks.filter(isObj) : []) as Check[], [rawChecks]);
  const drawn = useMemo(() => drawable(devices, links), [devices, links]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [confirm, setConfirm] = useState<"template" | "checks" | null>(null);
  const [newKind, setNewKind] = useState("pc.address");
  const [linkDraft, setLinkDraft] = useState<{ a: string; ap: string; b: string; bp: string }>({ a: "", ap: "", b: "", bp: "" });
  const [preview, setPreview] = useState<{ open: boolean; actions: unknown[] }>({ open: false, actions: [] });
  const setConfig = (d: Dev[], l: Lnk[]) => onChange({ config: asConfig(d, l) });
  const setChecks = (next: Check[]) => onChange({ checks: next });
  const label = (id: string) => devices.find(d => d.id === id)?.label ?? id;
  const free = usedPorts(links);
  const freePorts = (id: string) => { const d = devices.find(x => x.id === id); return d && KINDS.includes(d.kind) ? devicePorts(d.kind).filter(p => !free.has(id + ":" + p)) : []; };

  const applyTemplate = () => { setConfirm(null); setSelected(null); onChange({ config: routerTwoSwitchesFourPcsTemplate() }); setStatus(""); };
  const applyDemo = () => { setConfirm(null); setChecks(twoLanDemoChecks()); };
  const addDevice = (kind: TopologyDeviceKind) => {
    if (devices.length >= TOPOLOGY_LIMITS.devices) return;
    const n = nextNumber(devices.map(d => d.id), PREFIX[kind].id);
    const sameRow = devices.filter(d => d.kind === kind).length;
    setConfig([...devices, { id: PREFIX[kind].id + n, kind, label: PREFIX[kind].label + n, x: clamp01(0.1 + ((sameRow * 0.19) % 0.82)), y: ROW_Y[kind] }], links);
    setStatus("");
  };
  const updateDevice = (id: string, patch: Partial<Dev>) => setConfig(devices.map(d => (d.id === id ? { ...d, ...patch } : d)), links);
  const deleteDevice = (id: string) => {
    const refs = refsOf(checks, id);
    if (refs.length) { setStatus("لا يمكن حذف " + label(id) + ": تشير إليه فحوص التصحيح (" + refs.join("، ") + "). احذف هذه الفحوص أو عدّلها أولًا."); return; }
    setConfig(devices.filter(d => d.id !== id), links.filter(l => l.a.deviceId !== id && l.b.deviceId !== id));
    if (selected === id) setSelected(null);
    setStatus("");
  };
  const move = (dx: number, dy: number) => { const d = devices.find(x => x.id === selected); if (d) updateDevice(d.id, { x: clamp01((isUnit(d.x) ? d.x : 0.5) + dx), y: clamp01((isUnit(d.y) ? d.y : 0.5) + dy) }); };
  const setInitialPc = (d: Dev, field: PcField, value: string) => {
    const next = { ...(isObj(d.initial) ? d.initial : {}) } as Record<string, unknown>;
    if (value.trim() === "") delete next[field]; else next[field] = value.trim();
    updateDevice(d.id, Object.keys(next).length ? { initial: next } : { initial: undefined });
  };
  const setInitialHostname = (d: Dev, hostname: string) => {
    const h = hostname.trim();
    if (!h) { updateDevice(d.id, { initial: undefined }); return; }
    updateDevice(d.id, { initial: d.kind === "switch" ? { v: 1, device: "switch", hostname: h, vlans: {}, interfaces: {} } : { v: 1, device: "router", hostname: h, interfaces: {} } });
  };
  const addLink = () => {
    const { a, ap, b, bp } = linkDraft;
    if (!a || !ap || !b || !bp || links.length >= TOPOLOGY_LIMITS.links) return;
    const id = "l" + nextNumber(links.map(l => l.id), "l");
    setConfig(devices, [...links, { id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } }]);
    setLinkDraft({ a: "", ap: "", b: "", bp: "" });
  };
  const addCheck = () => {
    const id = "c" + nextNumber(checks.map(c => String(c.id)), "c");
    const params = defaultsFor(newKind, devices);
    setChecks([...checks, { id, label: defaultCheckLabel({ kind: newKind, ...params }, drawn), weight: 1, kind: newKind, ...params }]);
  };
  const totalWeight = checks.reduce((s, c) => s + (typeof c.weight === "number" && Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0), 0);

  return (
    <div className="nettopo-editor" data-testid="nettopo-editor">
      <fieldset>
        <legend>المخطط</legend>
        <div className="nettopo-actions">
          {confirm === "template"
            ? <><button type="button" className="is-danger" onClick={applyTemplate} disabled={disabled}>تأكيد استبدال المخطط بالقالب</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
            : <button type="button" onClick={() => (devices.length ? setConfirm("template") : applyTemplate())} disabled={disabled}>قالب: راوتر + سويتشان + 4 حواسيب</button>}
          {KINDS.map(k => <button key={k} type="button" className="is-secondary" onClick={() => addDevice(k)} disabled={disabled || devices.length >= TOPOLOGY_LIMITS.devices}>+ {DEVICE_KIND_LABEL[k]}</button>)}
          <span className="nettopo-note">{devices.length} / {TOPOLOGY_LIMITS.devices} أجهزة · {links.length} / {TOPOLOGY_LIMITS.links} وصلات</span>
        </div>
        {drawn.devices.length > 0 && <TopologyDiagram config={drawn} title={"مخطط الشبكة قيد التحرير: " + drawn.devices.length + " أجهزة"} selectedId={selected} onSelect={setSelected} editable={!disabled} onMove={(id, x, y) => updateDevice(id, { x, y })} testId="nettopo-editor-diagram" />}
        {selected && !disabled && (
          <div className="nettopo-actions" aria-label={"تحريك " + label(selected)}>
            <span className="nettopo-note">تحريك {label(selected)} (أو اسحبه في المخطط):</span>
            <button type="button" className="is-secondary" aria-label={"تحريك " + label(selected) + " لأعلى"} onClick={() => move(0, -0.04)}>↑</button>
            <button type="button" className="is-secondary" aria-label={"تحريك " + label(selected) + " لأسفل"} onClick={() => move(0, 0.04)}>↓</button>
            <button type="button" className="is-secondary" aria-label={"تحريك " + label(selected) + " لليمين"} onClick={() => move(0.04, 0)}>→</button>
            <button type="button" className="is-secondary" aria-label={"تحريك " + label(selected) + " لليسار"} onClick={() => move(-0.04, 0)}>←</button>
          </div>
        )}
        {status && <p className="nettopo-error" role="status">{status}</p>}
      </fieldset>

      <fieldset>
        <legend>الأجهزة والحالة الابتدائية</legend>
        {devices.length === 0 && <p className="nettopo-note">لا أجهزة بعد: ابدأ بالقالب أو أضف راوترًا وسويتشًا وحواسيب.</p>}
        {devices.map(d => (
          <div key={d.id} className="nettopo-device-row" data-device-id={d.id}>
            <span className="nettopo-ltr">{d.id}</span>
            <span>{DEVICE_KIND_LABEL[d.kind] ?? String(d.kind)}</span>
            <label><span>اسم العرض</span><input aria-label={"اسم عرض الجهاز " + d.id} maxLength={TOPOLOGY_LIMITS.labelChars} value={typeof d.label === "string" ? d.label : ""} onChange={e => updateDevice(d.id, { label: e.target.value })} disabled={disabled} /></label>
            {d.kind === "pc" && PC_FIELDS.map(f => <label key={f}><span>{PC_LABEL[f]} الابتدائي</span><input aria-label={PC_LABEL[f] + " الابتدائي لـ " + d.label} className="nettopo-ltr" dir="ltr" value={isObj(d.initial) && typeof d.initial[f] === "string" ? String(d.initial[f]) : ""} onChange={e => setInitialPc(d, f, e.target.value)} disabled={disabled} /></label>)}
            {(d.kind === "switch" || d.kind === "router") && <label><span>اسم الجهاز الابتدائي (hostname)</span><input aria-label={"hostname الابتدائي لـ " + d.label} className="nettopo-ltr" dir="ltr" placeholder={d.kind === "switch" ? "Switch" : "Router"} value={isObj(d.initial) && typeof d.initial.hostname === "string" ? d.initial.hostname : ""} onChange={e => setInitialHostname(d, e.target.value)} disabled={disabled} /></label>}
            <button type="button" className="sb-icon-btn" aria-label={"تحديد " + d.label} aria-pressed={selected === d.id} onClick={() => setSelected(d.id)}>◎</button>
            <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الجهاز " + d.label} onClick={() => deleteDevice(d.id)} disabled={disabled}>×</button>
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>الوصلات (منفذ ↔ منفذ)</legend>
        <ul className="nettopo-devices">
          {links.map(l => <li key={l.id}><span className="nettopo-ltr">{label(l.a.deviceId)} {l.a.port} ↔ {label(l.b.deviceId)} {l.b.port}</span> <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الوصلة " + l.id} onClick={() => setConfig(devices, links.filter(x => x.id !== l.id))} disabled={disabled}>×</button></li>)}
        </ul>
        <div className="nettopo-actions">
          <select aria-label="الجهاز الأول" value={linkDraft.a} onChange={e => setLinkDraft({ ...linkDraft, a: e.target.value, ap: "" })} disabled={disabled}><option value="">—</option>{devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
          <select aria-label="منفذ الجهاز الأول" className="nettopo-ltr" value={linkDraft.ap} onChange={e => setLinkDraft({ ...linkDraft, ap: e.target.value })} disabled={disabled}><option value="">—</option>{freePorts(linkDraft.a).map(p => <option key={p} value={p}>{p}</option>)}</select>
          <span aria-hidden="true">↔</span>
          <select aria-label="الجهاز الثاني" value={linkDraft.b} onChange={e => setLinkDraft({ ...linkDraft, b: e.target.value, bp: "" })} disabled={disabled}><option value="">—</option>{devices.filter(d => d.id !== linkDraft.a).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
          <select aria-label="منفذ الجهاز الثاني" className="nettopo-ltr" value={linkDraft.bp} onChange={e => setLinkDraft({ ...linkDraft, bp: e.target.value })} disabled={disabled}><option value="">—</option>{freePorts(linkDraft.b).map(p => <option key={p} value={p}>{p}</option>)}</select>
          <button type="button" onClick={addLink} disabled={disabled || !linkDraft.a || !linkDraft.ap || !linkDraft.b || !linkDraft.bp}>+ وصل الجهازين</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>فحوص التصحيح الخاصة (لا يراها الطالب)</legend>
        <div className="nettopo-actions">
          {confirm === "checks"
            ? <><button type="button" className="is-danger" onClick={applyDemo} disabled={disabled}>تأكيد استبدال الفحوص</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
            : <button type="button" className="is-secondary" onClick={() => (checks.length ? setConfirm("checks") : applyDemo())} disabled={disabled}>إضافة فحوص تمرين الشبكتين (LAN A / LAN B)</button>}
          <label><span>طريقة احتساب العلامة</span><select aria-label="طريقة احتساب العلامة" value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} onChange={e => onChange({ scoring: e.target.value })} disabled={disabled}><option value="proportional">نسبية بالأوزان: العلامة × (أوزان الفحوص الصحيحة ÷ مجموع الأوزان)</option><option value="allOrNothing">كل شيء أو لا شيء</option></select></label>
        </div>
        <p className="nettopo-note">{checks.length} فحوص · مجموع الأوزان {totalWeight}. يُقيَّم كل فحص على الحالة التي يعيد الخادم بناءها من إجراءات الطالب.</p>
        {checks.map((c, i) => <CheckRow key={String(c.id) + ":" + i} c={c} devices={devices} config={drawn} disabled={disabled} onChange={next => setChecks(checks.map((x, k) => (k === i ? next : x)))} onDelete={() => setChecks(checks.filter((_, k) => k !== i))} />)}
        <div className="nettopo-actions">
          <select aria-label="نوع الفحص الجديد" value={newKind} onChange={e => setNewKind(e.target.value)} disabled={disabled}>{Object.keys(NETWORK_CHECK_KINDS).map(k => <option key={k} value={k}>{NETWORK_CHECK_KINDS[k].label}</option>)}</select>
          <button type="button" onClick={addCheck} disabled={disabled}>+ إضافة فحص</button>
        </div>
      </fieldset>

      <details onToggle={e => setPreview({ open: (e.currentTarget as HTMLDetailsElement).open, actions: [] })}>
        <summary>معاينة كما يراها الطالب (تجربة فقط، لا يُحفظ شيء)</summary>
        {preview.open && <NetworkTopologyWorkspace config={rawConfig} actions={preview.actions} onChange={actions => setPreview({ open: true, actions })} label="معاينة المحاكاة" preview />}
      </details>
    </div>
  );
}
