import { useMemo, useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import { SWITCH_PORTS } from "../networkCliEngine";
import { NET2_DEVICE_KINDS, NET2_LIMITS, devicePorts, isHostKind, validateNet2Config, type Net2AdapterKind, type Net2Config, type Net2DeviceKind, type Net2DeviceState } from "../net2Model";
import { NET2_CHECKS, defaultNet2CheckLabel, replayNet2 } from "../net2Plugin";
import { NET2_TEMPLATES } from "./net2Templates";
import Net2Diagram from "./Net2Diagram";
import Net2Workspace from "./Net2Workspace";
import { DevicePanel } from "./Net2Panels";
import { KIND_LABEL } from "./net2Labels";
import "./net2.css";

// Phase 20C — networkTopology@2 AUTHORING (lazy). The teacher is the ONLY topology authority: structured controls add the six device kinds,
// cable exact free ports, position devices (drag or buttons), choose host adapters and labels, start from a curriculum template (topology +
// private key in one step; undo restores the previous question), and author each device's INITIAL STATE in a sandbox that runs the REAL
// engines (CLI, Desktop, AP) — committing stores the canonical device state the validator accepts. Private weighted checks use the plugin's
// own vocabulary. The preview runs the real student workspace on a throw-away answer.
type Dev = { id: string; kind: Net2DeviceKind; label: string; x: number; y: number; adapters?: Net2AdapterKind[]; initial?: unknown };
type End = { deviceId: string; port: string };
type Lnk = { id: string; a: End; b: End };
type Check = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const PREFIX: Readonly<Record<Net2DeviceKind, { id: string; label: string; y: number }>> = Object.freeze({
  router: { id: "r", label: "R", y: 0.1 }, switch: { id: "sw", label: "SW", y: 0.42 }, pc: { id: "pc", label: "PC", y: 0.85 }, laptop: { id: "lap", label: "LAP", y: 0.92 }, ap: { id: "ap", label: "AP", y: 0.66 }, server: { id: "srv", label: "SRV", y: 0.8 }
});
const clamp01 = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
const isUnit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const nextNumber = (ids: string[], prefix: string) => 1 + ids.reduce((m, id) => { const k = new RegExp("^" + prefix + "(\\d+)$").exec(id); return k ? Math.max(m, Number(k[1])) : m; }, 0);
function readConfig(raw: unknown): { devices: Dev[]; links: Lnk[] } {
  const c = isObj(raw) ? raw : {};
  return { devices: (Array.isArray(c.devices) ? c.devices : []).filter(isObj) as unknown as Dev[], links: (Array.isArray(c.links) ? c.links : []).filter(l => isObj(l) && isObj(l.a) && isObj(l.b)) as unknown as Lnk[] };
}
const asConfig = (devices: Dev[], links: Lnk[]) => ({ v: 2, devices, links });
/** A drawable subset (known kinds, valid positions; links between drawable devices). */
function drawable(devices: Dev[], links: Lnk[]): Net2Config {
  const ok = devices.filter(d => (NET2_DEVICE_KINDS as readonly string[]).includes(d.kind) && isUnit(d.x) && isUnit(d.y) && typeof d.id === "string");
  const ids = new Set(ok.map(d => d.id));
  return { v: 2, devices: ok.map(d => ({ id: d.id, kind: d.kind, label: typeof d.label === "string" ? d.label : d.id, x: d.x, y: d.y, ...(d.adapters ? { adapters: d.adapters } : {}) })), links: links.filter(l => ids.has(l.a.deviceId) && ids.has(l.b.deviceId)) } as Net2Config;
}
const refsOf = (checks: Check[], id: string) => checks.filter(c => c.deviceId === id || c.source === id || c.destination === id).map(c => String(c.id));

// ── private checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ENUMS: Readonly<Record<string, readonly (string | number | boolean)[]>> = Object.freeze({
  boolean: [true, false], portMode: ["access", "trunk"], hostMode: ["static", "dhcp"], vtpMode: ["server", "client"], vtpVersion: [1, 2], psViolation: ["shutdown", "restrict", "protect"], security: ["open", "wpa2"]
});
const NUMERIC = new Set(["vlan", "psMax"]);
const kindsFor = (device: string): Net2DeviceKind[] => (device === "host" ? ["pc", "laptop", "server"] : [device as Net2DeviceKind]);
function defaultsFor(kind: string, devices: Dev[]): Check {
  const meta = NET2_CHECKS[kind];
  if (!meta) return {};
  const hosts = devices.filter(d => isHostKind(d.kind));
  if (meta.device === "reach") return { source: hosts[0]?.id ?? "", destination: devices.find(d => d.id !== hosts[0]?.id)?.id ?? "", value: true };
  if (meta.device === "browse") return { source: hosts[0]?.id ?? "", url: "http://", value: true };
  const dev = devices.find(d => kindsFor(meta.device).includes(d.kind) && (!meta.wireless || (d.adapters ?? (d.kind === "laptop" ? ["wireless"] : [])).includes("wireless")));
  const out: Check = { deviceId: dev?.id ?? "" };
  if (meta.params.includes("adapter")) out.adapter = dev && (dev.adapters ?? (dev.kind === "laptop" ? ["wireless"] : ["ethernet"]))[0] === "wireless" ? "wlan0" : "eth0";
  if (meta.params.includes("interface")) out.interface = meta.iface === "router" ? "g0/0" : meta.iface === "subif" ? "g0/0.10" : meta.iface === "svi" ? "vlan1" : "f0/1";
  if (meta.params.includes("vlan")) out.vlan = 10;
  if (meta.params.includes("pool")) out.pool = "LAN";
  if (meta.params.includes("value") && meta.value) out.value = ENUMS[meta.value]?.[0] ?? (meta.value === "mask" ? "255.255.255.0" : NUMERIC.has(meta.value) ? (meta.value === "psMax" ? 1 : 10) : "");
  return out;
}
function CheckRow({ c, devices, config, onChange, onDelete, disabled }: { c: Check; devices: Dev[]; config: Net2Config; onChange: (next: Check) => void; onDelete: () => void; disabled?: boolean }) {
  const id = String(c.id);
  const meta = NET2_CHECKS[String(c.kind)];
  const relabel = (next: Check) => onChange(c.label === defaultNet2CheckLabel(c, config) ? { ...next, label: defaultNet2CheckLabel(next, config) } : next);
  const set = (patch: Check) => relabel({ ...c, ...patch });
  const deviceSelect = (field: "deviceId" | "source" | "destination", aria: string, kinds: readonly string[]) => (
    <label><span>{aria}</span><select aria-label={aria + " " + id} value={String(c[field] ?? "")} onChange={e => set({ [field]: e.target.value })} disabled={disabled}>
      <option value="">—</option>{devices.filter(d => kinds.includes(d.kind)).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
    </select></label>
  );
  const text = (field: string, title: string, placeholder = "") => <label><span>{title}</span><input aria-label={title + " " + id} className="net2-ltr" dir="ltr" placeholder={placeholder} value={String(c[field] ?? "")} onChange={e => set({ [field]: e.target.value })} disabled={disabled} /></label>;
  const valueField = () => {
    if (!meta || !meta.params.includes("value") || !meta.value) return null;
    const aria = "القيمة المطلوبة في الفحص " + id;
    const opts = ENUMS[meta.value];
    if (opts) return <label><span>القيمة المطلوبة</span><select aria-label={aria} value={String(c.value)} onChange={e => set({ value: opts.find(o => String(o) === e.target.value) })} disabled={disabled}>{opts.map(o => <option key={String(o)} value={String(o)}>{o === true ? "نعم" : o === false ? "لا" : String(o)}</option>)}</select></label>;
    if (NUMERIC.has(meta.value)) return <label><span>القيمة المطلوبة</span><input aria-label={aria} className="net2-ltr" dir="ltr" inputMode="numeric" value={String(c.value ?? "")} onChange={e => set({ value: /^\d{1,4}$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} disabled={disabled} /></label>;
    return <label><span>القيمة المطلوبة{meta.secret ? " (سرّية)" : ""}</span><input aria-label={aria} className="net2-ltr" dir="ltr" value={String(c.value ?? "")} onChange={e => set({ value: e.target.value })} disabled={disabled} /></label>;
  };
  const dev = devices.find(d => d.id === c.deviceId);
  return (
    <div className="net2-row" data-testid="net2-check-row" data-check-id={id}>
      <label><span>نوع الفحص</span><select aria-label={"نوع الفحص " + id} value={String(c.kind ?? "")} disabled={disabled}
        onChange={e => onChange({ id: c.id, label: defaultNet2CheckLabel({ kind: e.target.value, ...defaultsFor(e.target.value, devices) }, config), weight: c.weight, kind: e.target.value, ...defaultsFor(e.target.value, devices) })}>
        {Object.keys(NET2_CHECKS).map(k => <option key={k} value={k}>{NET2_CHECKS[k].label}</option>)}
      </select></label>
      {meta?.device === "reach" && <>{deviceSelect("source", "الجهاز المصدر", ["pc", "laptop", "server"])}{deviceSelect("destination", "الجهاز الوجهة", NET2_DEVICE_KINDS)}</>}
      {meta?.device === "browse" && <>{deviceSelect("source", "الجهاز المصدر", ["pc", "laptop", "server"])}{text("url", "عنوان الصفحة", "http://server.school.local")}</>}
      {(meta?.device === "reach" || meta?.device === "browse") && <label><span>المطلوب</span><select aria-label={"النتيجة المطلوبة " + id} value={c.value === false ? "false" : "true"} onChange={e => set({ value: e.target.value === "true" })} disabled={disabled}><option value="true">ينجح</option><option value="false">لا ينجح (معزول)</option></select></label>}
      {meta && meta.device !== "reach" && meta.device !== "browse" && deviceSelect("deviceId", "الجهاز", kindsFor(meta.device))}
      {meta?.params.includes("adapter") && <label><span>المحوّل</span><select aria-label={"محوّل الفحص " + id} value={String(c.adapter ?? "")} onChange={e => set({ adapter: e.target.value })} disabled={disabled}>{["eth0", "wlan0"].map(a => <option key={a} value={a}>{a}</option>)}</select></label>}
      {meta?.params.includes("interface") && (meta.iface === "physical"
        ? <label><span>الواجهة</span><select aria-label={"واجهة الفحص " + id} value={String(c.interface ?? "")} onChange={e => set({ interface: e.target.value })} disabled={disabled}>{SWITCH_PORTS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
        : text("interface", "الواجهة", meta.iface === "svi" ? "vlan10" : meta.iface === "subif" ? "g0/0.10" : dev?.kind === "router" ? "g0/0" : "f0/1"))}
      {meta?.params.includes("vlan") && <label><span>VLAN</span><input aria-label={"رقم VLAN في الفحص " + id} className="net2-ltr" dir="ltr" inputMode="numeric" value={String(c.vlan ?? "")} onChange={e => set({ vlan: /^\d{1,4}$/.test(e.target.value) ? Number(e.target.value) : e.target.value })} disabled={disabled} /></label>}
      {meta?.params.includes("pool") && text("pool", "اسم المجمّع", "LAN")}
      {valueField()}
      <label><span>الوصف (يراه المعلم فقط)</span><input aria-label={"وصف الفحص " + id} value={String(c.label ?? "")} onChange={e => onChange({ ...c, label: e.target.value })} disabled={disabled} /></label>
      <label><span>الوزن</span><input aria-label={"وزن الفحص " + id} type="number" min="0" step="any" className="net2-ltr" dir="ltr" value={String(c.weight ?? "")} onChange={e => onChange({ ...c, weight: e.target.value === "" ? "" : Number(e.target.value) })} disabled={disabled} /></label>
      <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الفحص " + id} onClick={onDelete} disabled={disabled}>×</button>
    </div>
  );
}

// ── initial-state sandbox (the real engines on a throw-away action list) ──────────────────────────────────────────────────────────
function Sandbox({ config, deviceId, onCommit, onClose }: { config: Net2Config; deviceId: string; onCommit: (state: Net2DeviceState) => void; onClose: () => void }) {
  const [actions, setActions] = useState<unknown[]>([]);
  const [notice, setNotice] = useState("");
  const replay = useMemo(() => replayNet2(config, actions), [config, actions]);
  const device = config.devices.find(d => d.id === deviceId);
  if (!device || !replay.ok) return <p className="net2-error" role="alert">تعذّر فتح الحالة الابتدائية لهذا الجهاز (صحّح أخطاء المخطط أولًا).</p>;
  const name = (id: string) => config.devices.find(d => d.id === id)?.label ?? id;
  const commit = () => {
    const st = JSON.parse(JSON.stringify(replay.state.devices[deviceId])) as Record<string, unknown>;
    if (isObj(st.adapters)) for (const a of Object.values(st.adapters)) if (isObj(a)) delete a.released;
    const check = validateNet2Config({ ...config, devices: config.devices.map(d => (d.id === deviceId ? { ...d, initial: st } : d)) });
    if (!check.ok) { setNotice("لا يمكن اعتماد هذه الحالة: " + check.issues.map(i => i.message).join(" ")); return; }
    onCommit(st as unknown as Net2DeviceState);
  };
  return (
    <div className="net2-sandbox" data-testid="net2-sandbox" role="region" aria-label={"الحالة الابتدائية لـ " + device.label}>
      <p className="net2-note">اضبط {device.label} بالمحرك الحقيقي كما سيفعل الطالب؛ «اعتماد» يحفظ الحالة الناتجة كحالة ابتدائية يبدأ منها الطالب (وإعادة الضبط تعود إليها).</p>
      <DevicePanel cfg={config} view={replay} device={device} base={actions} emit={more => { const next = [...actions, ...more]; const r = replayNet2(config, next); if (r.ok) { setActions(next); setNotice(""); } else setNotice("تعذّر تنفيذ الإجراء."); }} label="الحالة الابتدائية" remainingTotal={NET2_LIMITS.actions - actions.length} name={name} />
      {notice && <p className="net2-error" role="alert">{notice}</p>}
      <div className="net2-actions"><button type="button" onClick={commit}>اعتماد الحالة الابتدائية</button><button type="button" className="is-secondary" onClick={onClose}>إغلاق دون حفظ</button></div>
    </div>
  );
}

export default function Net2Editor({ config: rawConfig, checks: rawChecks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const { devices, links } = useMemo(() => readConfig(rawConfig), [rawConfig]);
  const checks = useMemo(() => (Array.isArray(rawChecks) ? rawChecks.filter(isObj) : []) as Check[], [rawChecks]);
  const drawn = useMemo(() => drawable(devices, links), [devices, links]);
  const valid = useMemo(() => { const r = validateNet2Config(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [newKind, setNewKind] = useState("reachability");
  const [linkDraft, setLinkDraft] = useState({ a: "", ap: "", b: "", bp: "" });
  const [preview, setPreview] = useState<{ open: boolean; actions: unknown[] }>({ open: false, actions: [] });
  const setConfig = (d: Dev[], l: Lnk[]) => onChange({ config: asConfig(d, l) });
  const setChecks = (next: Check[]) => onChange({ checks: next });
  const label = (id: string) => devices.find(d => d.id === id)?.label ?? id;
  const used = new Set(links.flatMap(l => [l.a.deviceId + ":" + l.a.port, l.b.deviceId + ":" + l.b.port]));
  const freePorts = (id: string) => { const d = devices.find(x => x.id === id); return d && (NET2_DEVICE_KINDS as readonly string[]).includes(d.kind) ? devicePorts(d).filter(p => !used.has(id + ":" + p)) : []; };
  const addDevice = (kind: Net2DeviceKind) => {
    if (devices.length >= NET2_LIMITS.devices) return;
    const p = PREFIX[kind], n = nextNumber(devices.map(d => d.id), p.id), row = devices.filter(d => d.kind === kind).length;
    setConfig([...devices, { id: p.id + n, kind, label: p.label + n, x: clamp01(0.1 + ((row * 0.19) % 0.82)), y: p.y }], links);
    setStatus("");
  };
  const updateDevice = (id: string, patch: Partial<Dev>) => setConfig(devices.map(d => { if (d.id !== id) return d; const n = { ...d, ...patch }; if (patch.initial === undefined && "initial" in patch) delete n.initial; if (patch.adapters === undefined && "adapters" in patch) delete n.adapters; return n; }), links);
  const deleteDevice = (id: string) => {
    const refs = refsOf(checks, id);
    if (refs.length) { setStatus("لا يمكن حذف " + label(id) + ": تشير إليه فحوص التصحيح (" + refs.join("، ") + ")."); return; }
    setConfig(devices.filter(d => d.id !== id), links.filter(l => l.a.deviceId !== id && l.b.deviceId !== id));
    if (selected === id) setSelected(null);
    if (sandbox === id) setSandbox(null);
    setStatus("");
  };
  const move = (dx: number, dy: number) => { const d = devices.find(x => x.id === selected); if (d) updateDevice(d.id, { x: clamp01((isUnit(d.x) ? d.x : 0.5) + dx), y: clamp01((isUnit(d.y) ? d.y : 0.5) + dy) }); };
  const setAdapters = (d: Dev, kind: Net2AdapterKind, on: boolean) => {
    const cur = d.adapters ?? (d.kind === "laptop" ? ["wireless"] : ["ethernet"]);
    const next = (["ethernet", "wireless"] as const).filter(a => (a === kind ? on : cur.includes(a)));
    if (!next.length) return;
    if (!next.includes("ethernet") && links.some(l => (l.a.deviceId === d.id || l.b.deviceId === d.id))) { setStatus("احذف وصلة " + d.label + " السلكية قبل إزالة محوّل Ethernet."); return; }
    updateDevice(d.id, { adapters: next, initial: undefined });
  };
  const addLink = () => {
    const { a, ap, b, bp } = linkDraft;
    if (!a || !ap || !b || !bp || a === b || links.length >= NET2_LIMITS.links) return;
    setConfig(devices, [...links, { id: "l" + nextNumber(links.map(l => l.id), "l"), a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } }]);
    setLinkDraft({ a: "", ap: "", b: "", bp: "" });
  };
  const addCheck = () => {
    const id = "c" + nextNumber(checks.map(c => String(c.id)), "c");
    const params = defaultsFor(newKind, devices);
    setChecks([...checks, { id, label: defaultNet2CheckLabel({ kind: newKind, ...params }, drawn), weight: 1, kind: newKind, ...params }]);
  };
  const totalWeight = checks.reduce((s, c) => s + (typeof c.weight === "number" && Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0), 0);
  return (
    <div className="net2-editor" data-testid="net2-editor">
      <fieldset>
        <legend>قوالب المنهاج (مخطط + فحوص خاصة)</legend>
        <div className="net2-actions">
          {NET2_TEMPLATES.map(t => <button key={t.id} type="button" className="is-secondary" title={t.description} disabled={disabled} onClick={() => { setSelected(null); setSandbox(null); onChange({ config: t.config(), checks: t.checks() }); setStatus("طُبّق القالب «" + t.title + "». يمكن التراجع (Ctrl+Z) لاستعادة السؤال السابق."); }}>قالب: {t.title}</button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend>المخطط (المعلم وحده يحدد الأجهزة والوصلات)</legend>
        <div className="net2-actions">
          {NET2_DEVICE_KINDS.map(k => <button key={k} type="button" onClick={() => addDevice(k)} disabled={disabled || devices.length >= NET2_LIMITS.devices}>{"+ " + KIND_LABEL[k]}</button>)}
          <span className="net2-note">{devices.length} / {NET2_LIMITS.devices} أجهزة · {links.length} / {NET2_LIMITS.links} وصلات</span>
        </div>
        {drawn.devices.length > 0 && <Net2Diagram config={drawn} title={"مخطط الشبكة قيد التحرير: " + drawn.devices.length + " أجهزة"} selectedId={selected} onSelect={setSelected} editable={!disabled} onMove={(id, x, y) => updateDevice(id, { x, y })} testId="net2-editor-diagram" />}
        {selected && !disabled && (
          <div className="net2-actions" aria-label={"تحريك " + label(selected)}>
            <span className="net2-note">تحريك {label(selected)} (أو اسحبه في المخطط):</span>
            {([["لأعلى", 0, -0.04, "↑"], ["لأسفل", 0, 0.04, "↓"], ["لليمين", 0.04, 0, "→"], ["لليسار", -0.04, 0, "←"]] as const).map(([t, dx, dy, g]) => <button key={t} type="button" className="is-secondary" aria-label={"تحريك " + label(selected) + " " + t} onClick={() => move(dx, dy)}>{g}</button>)}
          </div>
        )}
        {status && <p className="net2-note" role="status">{status}</p>}
      </fieldset>
      <fieldset>
        <legend>الأجهزة والحالة الابتدائية</legend>
        {devices.length === 0 && <p className="net2-note">لا أجهزة بعد: ابدأ بقالب أو أضف الأجهزة.</p>}
        {devices.map(d => (
          <div key={d.id} className="net2-row" data-testid="net2-editor-device" data-id={d.id}>
            <span className="net2-ltr">{d.id}</span>
            <span>{KIND_LABEL[d.kind] ?? String(d.kind)}</span>
            <label><span>اسم العرض</span><input aria-label={"اسم عرض الجهاز " + d.id} maxLength={NET2_LIMITS.labelChars} value={typeof d.label === "string" ? d.label : ""} onChange={e => updateDevice(d.id, { label: e.target.value })} disabled={disabled} /></label>
            {isHostKind(d.kind) && (["ethernet", "wireless"] as const).map(a => <label key={a}><span>{a === "ethernet" ? "Ethernet" : "Wi-Fi"}</span><input type="checkbox" aria-label={(a === "ethernet" ? "محوّل Ethernet لـ " : "محوّل Wi-Fi لـ ") + d.label} checked={(d.adapters ?? (d.kind === "laptop" ? ["wireless"] : ["ethernet"])).includes(a)} onChange={e => setAdapters(d, a, e.target.checked)} disabled={disabled} /></label>)}
            <span className="net2-note">{d.initial ? "حالة ابتدائية مخصّصة" : "إعدادات المصنع"}</span>
            <button type="button" className="sb-mini-btn" onClick={() => setSandbox(d.id)} disabled={disabled || !valid}>إعداد الحالة الابتدائية</button>
            {d.initial !== undefined && <button type="button" className="sb-mini-btn" onClick={() => updateDevice(d.id, { initial: undefined })} disabled={disabled}>استعادة إعدادات المصنع</button>}
            <button type="button" className="sb-icon-btn" aria-label={"تحديد " + d.label} aria-pressed={selected === d.id} onClick={() => setSelected(d.id)}>◎</button>
            <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الجهاز " + d.label} onClick={() => deleteDevice(d.id)} disabled={disabled}>×</button>
          </div>
        ))}
        {sandbox && valid && <Sandbox key={sandbox} config={valid} deviceId={sandbox} onClose={() => setSandbox(null)} onCommit={st => { updateDevice(sandbox, { initial: st }); setSandbox(null); setStatus("حُفظت الحالة الابتدائية لـ " + label(sandbox) + "."); }} />}
      </fieldset>
      <fieldset>
        <legend>الوصلات (منفذ ↔ منفذ)</legend>
        <ul className="net2-devices">
          {links.map(l => <li key={l.id}><span className="net2-ltr">{label(l.a.deviceId)} {l.a.port} ↔ {label(l.b.deviceId)} {l.b.port}</span> <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الوصلة " + l.id} onClick={() => setConfig(devices, links.filter(x => x.id !== l.id))} disabled={disabled}>×</button></li>)}
        </ul>
        <div className="net2-actions" data-testid="net2-link-form">
          <label><span>الجهاز أ</span><select value={linkDraft.a} onChange={e => setLinkDraft({ ...linkDraft, a: e.target.value, ap: "" })} disabled={disabled}><option value="">—</option>{devices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <label><span>منفذ أ</span><select className="net2-ltr" value={linkDraft.ap} onChange={e => setLinkDraft({ ...linkDraft, ap: e.target.value })} disabled={disabled}><option value="">—</option>{freePorts(linkDraft.a).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
          <label><span>الجهاز ب</span><select value={linkDraft.b} onChange={e => setLinkDraft({ ...linkDraft, b: e.target.value, bp: "" })} disabled={disabled}><option value="">—</option>{devices.filter(d => d.id !== linkDraft.a).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
          <label><span>منفذ ب</span><select className="net2-ltr" value={linkDraft.bp} onChange={e => setLinkDraft({ ...linkDraft, bp: e.target.value })} disabled={disabled}><option value="">—</option>{freePorts(linkDraft.b).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
          <button type="button" onClick={addLink} disabled={disabled || !linkDraft.a || !linkDraft.ap || !linkDraft.b || !linkDraft.bp}>+ وصلة</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>فحوص التصحيح الخاصة (لا يراها الطالب)</legend>
        <div className="net2-actions">
          <label><span>طريقة احتساب العلامة</span><select aria-label="طريقة احتساب العلامة" value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} onChange={e => onChange({ scoring: e.target.value })} disabled={disabled}><option value="proportional">نسبية بالأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option></select></label>
        </div>
        <p className="net2-note">{checks.length} فحوص · مجموع الأوزان {totalWeight}. يُقيَّم كل فحص على الحالة التي يعيد الخادم بناءها من إجراءات الطالب.</p>
        {checks.map((c, i) => <CheckRow key={String(c.id) + ":" + i} c={c} devices={devices} config={drawn} disabled={disabled} onChange={next => setChecks(checks.map((x, k) => (k === i ? next : x)))} onDelete={() => setChecks(checks.filter((_, k) => k !== i))} />)}
        <div className="net2-actions">
          <select aria-label="نوع الفحص الجديد" value={newKind} onChange={e => setNewKind(e.target.value)} disabled={disabled}>{Object.keys(NET2_CHECKS).map(k => <option key={k} value={k}>{NET2_CHECKS[k].label}</option>)}</select>
          <button type="button" onClick={addCheck} disabled={disabled}>+ إضافة فحص</button>
        </div>
      </fieldset>
      <details data-testid="net2-preview" onToggle={e => setPreview({ open: (e.currentTarget as HTMLDetailsElement).open, actions: [] })}>
        <summary>معاينة كما يراها الطالب (تجربة فقط، لا يُحفظ شيء)</summary>
        {preview.open && <Net2Workspace config={rawConfig} actions={preview.actions} onChange={actions => setPreview({ open: true, actions })} label="معاينة المحاكاة" preview />}
      </details>
    </div>
  );
}
