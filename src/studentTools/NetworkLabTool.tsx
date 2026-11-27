import { useEffect, useMemo, useRef, useState } from "react";
import { NET2_LIMITS, deviceAdapters, isHostKind, adapterNames, type Net2AdapterKind, type Net2Config, type Net2Device, type Net2Link } from "../net2Model";
import { linkUp, makeNet } from "../net2Network";
import { traceHostCommandFlow, type Net2Flow } from "../net2Flow";
import Net2Diagram from "../networkTopology2/Net2Diagram";
import { DevicePanel, type Net2View } from "../networkTopology2/Net2Panels";
import { KIND_LABEL } from "../networkTopology2/net2Labels";
import { NET2_TEMPLATES } from "../networkTopology2/net2Templates";
import {
  EMPTY_LAB, LAB_DEVICE_KINDS, addDevice, addLink, appendActions, clearConfiguration, freePorts, labFileName, moveDevice, parseLab, removeDevice, removeLink,
  renameDevice, serializeLab, setAdapters, type LabDeviceKind, type NetLab, type NetLabResult,
} from "./networkLab";
import { isSerialPort, labDevicePorts } from "./netLabModel";
import { replayLab, type LabReplay, type LabReplayCache } from "./netLabReplay";
import { replayNet2Cached, type Net2ReplayCache } from "../net2Plugin";
import "../networkTopology2/net2.css";
import "./networkLab.css";

// N1 (docs/enterprise-network-lab-tool-design.md) — «مختبر الشبكات»: the learner BUILDS a network (six device kinds, cables between free
// ports, positions) and configures and tests it through the simulator's own device surfaces (router / switch CLI, PC Desktop, AP, server
// services); ping / tracert draw the packet's path. Everything is networkTopology@2's engines, unchanged (networkLab.ts keeps the topology
// and the action list valid for them). Nothing is sent or graded. In a BOOK (`draftKey`) the network is kept as a draft in this browser;
// «احفظ في ملف» / «افتح ملفًا» move it through a file on the learner's own device.
// «ابنِ الشبكة» (docs/enterprise-network-build-exercises.md) — in a book EXERCISE (`exercise`) the same builder runs in its PLAIN mode:
// only the device kinds the task offers, networkTopology@2's own ports (no serial), no hub, IPv6 or lab router commands, and the view is
// replayed by networkTopology@2's own replay — exactly what the server judges, so what the learner sees working is what is judged.
// No example and no file there; `onLabChange` hands every change to the exercise. A LAB exercise (`exercise.lab`, «ابنِ الشبكة: التوجيه
// والأمان») keeps the whole lab — serial ports, hubs (when offered), IPv6 and the lab's router commands — and the lab's own replay, which
// the server runs too.

const ADAPTER_TEXT: Readonly<Record<Net2AdapterKind, string>> = { ethernet: "Ethernet (كابل)", wireless: "Wi-Fi (لاسلكي)" };
const LABEL: Readonly<Record<LabDeviceKind, string>> = { ...KIND_LABEL, hub: "Hub" };
const kindLabel = (d: Net2Device) => LABEL[d.kind as LabDeviceKind] ?? d.kind;
type ShownFlow = { id: number; at: number; flow: Net2Flow };
const caches = new WeakMap<Net2Config, LabReplayCache>();
function replayOf(cfg: Net2Config, actions: readonly unknown[]): LabReplay {
  const step = replayLab(cfg, actions, caches.get(cfg));
  if (step.cache) caches.set(cfg, step.cache);
  return step.replay;
}
const plainCaches = new WeakMap<Net2Config, Net2ReplayCache>();
/** The exercise's view: networkTopology@2's own replay (the server's), in the lab's replay shape (no lab state; the engine is the config). */
function plainReplayOf(cfg: Net2Config, actions: readonly unknown[]): LabReplay {
  const step = replayNet2Cached(cfg, actions, plainCaches.get(cfg));
  if (step.cache) plainCaches.set(cfg, step.cache);
  const r = step.replay;
  return r.ok ? { ...r, state: { ...r.state, lab: { routers: {}, hosts6: {} } }, engine: cfg } as LabReplay : r;
}
/** A network the plain mode can hold: the offered kinds only, no serial cable. */
const plainLab = (lab: NetLab, kinds: readonly string[]): boolean =>
  lab.config.devices.every(d => kinds.includes(d.kind)) && lab.config.links.every(l => !isSerialPort(l.a.port) && !isSerialPort(l.b.port));
/** N2 — the commands the lab adds to the router CLI (a reminder under the router's terminal). */
const ROUTER_EXTRAS: readonly [string, string][] = [
  ["الواجهة التسلسلية (WAN)", "interface s0/0/0 · ip address … · clock rate 64000 · encapsulation ppp · no shutdown"],
  ["التوجيه الثابت", "ip route 192.168.2.0 255.255.255.0 10.0.0.2 · ip route 0.0.0.0 0.0.0.0 s0/0/0"],
  ["RIP", "router rip · version 2 · network 10.0.0.0 · no auto-summary"],
  ["OSPF", "router ospf 1 · network 10.0.0.0 0.0.0.255 area 0"],
  ["EIGRP", "router eigrp 10 · network 10.0.0.0"],
  ["ACL", "access-list 1 deny host 192.168.1.10 · access-list 100 deny icmp any any · interface g0/0 · ip access-group 1 in"],
  ["NAT / PAT", "ip nat inside source static 192.168.1.10 200.0.0.10 · ip nat inside source list 1 interface s0/0/0 overload · ip nat inside | outside"],
  ["IPv6", "ipv6 unicast-routing · interface g0/0 · ipv6 address 2001:db8:1::1/64 · ipv6 route 2001:db8:2::/64 2001:db8:12::2"],
  ["عرض", "show ip route · show ip protocols · show ip ospf neighbor · show access-lists · show ip nat translations · show ipv6 route"],
];
function readDraft(key?: string, kinds?: readonly string[], plain = true): NetLab {
  if (!key) return EMPTY_LAB;
  try {
    const t = localStorage.getItem(key); const r = t ? parseLab(t) : null;
    if (!r || !r.ok) return EMPTY_LAB;
    if (kinds && !r.lab.config.devices.every(d => kinds.includes(d.kind))) return EMPTY_LAB;
    return !kinds || !plain || plainLab(r.lab, kinds) ? r.lab : EMPTY_LAB;
  } catch { return EMPTY_LAB; }
}
const isHostCommand = (a: unknown): a is { type: "host.command"; deviceId: string; command: unknown } =>
  !!a && typeof a === "object" && (a as { type?: unknown }).type === "host.command" && typeof (a as { deviceId?: unknown }).deviceId === "string";

export type NetworkLabExercise = { kinds: readonly LabDeviceKind[]; lab?: boolean };
export default function NetworkLabTool({ draftKey, exercise, onLabChange, fresh, onDiagram }: {
  draftKey?: string; exercise?: NetworkLabExercise; onLabChange?: (lab: NetLab) => void; fresh?: boolean;
  /** DG7 — the tool bar also offers «محرّر المخططات»: «ارسمها في محرّر المخططات» hands this network over, drawn as a topology. */
  onDiagram?: (lab: NetLab) => void;
}) {
  const inExercise = !!exercise;
  const plain = inExercise && !exercise.lab;
  const kinds: readonly LabDeviceKind[] = exercise ? LAB_DEVICE_KINDS.filter(k => exercise.kinds.includes(k) && (exercise.lab || k !== "hub")) : LAB_DEVICE_KINDS;
  const [lab, setLabState] = useState<NetLab>(() => (fresh ? EMPTY_LAB : readDraft(draftKey, exercise ? kinds : undefined, plain)));
  // the draft follows every change (a book only); a full or blocked storage is reported, never thrown
  const [draftFailed, setDraftFailed] = useState(false);
  const setLab = (next: NetLab) => {
    setLabState(next);
    onLabChange?.(next);
    if (!draftKey) return;
    try {
      if (next.config.devices.length === 0 && next.actions.length === 0) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, serializeLab(next));
      setDraftFailed(false);
    } catch { setDraftFailed(true); }
  };
  // the exercise learns the network it starts with (an empty one, or this browser's draft); a FRESH start removes the old draft
  useEffect(() => {
    if (fresh && draftKey) { try { localStorage.removeItem(draftKey); } catch { /* a blocked storage keeps nothing anyway */ } }
    onLabChange?.(lab);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"new" | "clear" | "remove" | null>(null);
  const [flow, setFlow] = useState<ShownFlow | null>(null);
  const [cable, setCable] = useState({ a: "", ap: "", b: "", bp: "" });
  const flowSeq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const replay = useMemo(() => (plain ? plainReplayOf : replayOf)(lab.config, lab.actions), [lab, plain]);
  const cfg = lab.config;
  const device = selected ? cfg.devices.find(d => d.id === selected) ?? null : null;

  const apply = (r: NetLabResult, ok?: string) => {
    if (!r.ok) { setNotice({ text: r.message, error: true }); return false; }
    setLab(r.lab); setNotice(ok ? { text: ok, error: false } : null); setFlow(null);
    return true;
  };
  const replace = (next: NetLab, message: string) => { setLab(next); setSelected(null); setConfirm(null); setFlow(null); setCable({ a: "", ap: "", b: "", bp: "" }); setNotice({ text: message, error: false }); };

  if (!replay.ok) {
    // cannot happen through the operations (they keep the lab valid); a defensive way out instead of a broken tool
    return (
      <div className="netlab" dir="rtl">
        <p className="net2-error" role="alert">تعذّر تشغيل هذه الشبكة.</p>
        <div className="net2-actions"><button type="button" onClick={() => replace(EMPTY_LAB, "بدأت شبكة جديدة.")}>شبكة جديدة</button></div>
      </div>
    );
  }
  const view = replay as unknown as Net2View;   // networkTopology@2's replay shape (+ the lab state), for its own device surfaces
  const label = (id: string) => cfg.devices.find(d => d.id === id)?.label ?? id;
  const net = makeNet(replay.engine, view.state.devices, view.state.ops);
  const linkDown = (l: Net2Link) => !linkUp(net, l.a.deviceId, l.a.port);
  const wireless = Object.entries(view.state.ops.wifi).filter(([, w]) => w.status === "associated" && w.ap).map(([host, w]) => ({ host, ap: w.ap! }));
  const remainingTotal = Math.max(0, NET2_LIMITS.actions - lab.actions.length);
  const shown = flow && flow.at === lab.actions.length ? flow : null;
  const flowStatus = !shown ? "" : (() => {
    const f = shown.flow, what = f.kind + " من " + label(f.hops[0]) + " إلى " + f.target;
    if (f.ok) return "نجح " + what + "؛ المسار: " + f.hops.map(label).join(" ← ") + ".";
    if (f.reason === "UNRESOLVED") return "فشل " + what + ": تعذّر تحليل اسم الوجهة.";
    return "فشل " + what + "؛ توقّف المسار عند " + label(f.failedAt ?? f.hops[f.hops.length - 1]) + ".";
  })();

  const emit = (more: Record<string, unknown>[]) => {
    const r = appendActions(lab, more);
    if (!r.ok) { setNotice({ text: r.message, error: true }); return; }
    const added = more.length === 1 ? more[0] : undefined;
    const traced = isHostCommand(added) ? traceHostCommandFlow(replay.engine, view.state, added.deviceId, added.command) : null;
    setLab(r.lab); setNotice(null);
    setFlow(traced ? { id: ++flowSeq.current, at: r.lab.actions.length, flow: traced } : null);
  };
  const pick = (id: string) => { setSelected(id); setConfirm(null); setNotice(null); };
  const add = (kind: LabDeviceKind) => {
    const before = new Set(cfg.devices.map(d => d.id));
    const r = addDevice(lab, kind);
    if (apply(r) && r.ok) { const fresh = r.lab.config.devices.find(d => !before.has(d.id)); if (fresh) setSelected(fresh.id); }
  };
  const portsOf = (id: string) => freePorts(cfg, id).filter(p => !plain || !isSerialPort(p));
  const portsA = cable.a ? portsOf(cable.a) : [], portsB = cable.b ? portsOf(cable.b) : [];
  const connect = () => {
    if (apply(addLink(lab, { deviceId: cable.a, port: cable.ap }, { deviceId: cable.b, port: cable.bp }), "وُصل الكابل بين " + label(cable.a) + " (" + cable.ap + ") و" + label(cable.b) + " (" + cable.bp + ").")) setCable({ a: cable.a, ap: "", b: "", bp: "" });
  };
  const save = () => {
    try {
      const blob = new Blob([serializeLab(lab)], { type: "application/json" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = labFileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ text: "نُزّلت الشبكة في الملف «" + labFileName + "» على جهازك.", error: false });
    } catch { setNotice({ text: "تعذّر حفظ الملف في هذا المتصفح.", error: true }); }
  };
  const open = async (file: File | undefined) => {
    if (!file) return;
    const r = parseLab(await file.text().catch(() => ""));
    if (!r.ok) { setNotice({ text: r.message, error: true }); return; }
    replace(r.lab, "فُتحت الشبكة من الملف «" + file.name + "».");
  };
  const template = (id: string) => {
    const t = NET2_TEMPLATES.find(x => x.id === id);
    if (!t) return;
    const r = parseLab(serializeLab({ config: t.config(), actions: [] }));
    if (r.ok) replace(r.lab, "فُتح المثال «" + t.title + "». غيّر فيه كما تريد.");
  };

  return (
    <div className="netlab net2" dir="rtl" data-testid="network-lab">
      <div className="netlab-bar net2-actions" role="group" aria-label="الشبكة">
        {confirm === "new"
          ? <><button type="button" className="is-danger" onClick={() => replace(EMPTY_LAB, "بدأت شبكة جديدة.")}>تأكيد: امسح الشبكة كلها</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
          : <button type="button" className="is-secondary" onClick={() => setConfirm("new")} disabled={!cfg.devices.length}>{inExercise ? "ابدأ من جديد" : "شبكة جديدة"}</button>}
        {!inExercise && <>
        <label className="netlab-select">افتح مثالًا
          <select value="" onChange={e => template(e.target.value)} data-testid="network-lab-example">
            <option value="">اختر…</option>
            {NET2_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <button type="button" className="is-secondary" onClick={save} disabled={!cfg.devices.length}>احفظ في ملف</button>
        <button type="button" className="is-secondary" onClick={() => fileRef.current?.click()}>افتح ملفًا</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden data-testid="network-lab-file" onChange={e => { void open(e.target.files?.[0]); e.target.value = ""; }} />
        {onDiagram && <button type="button" onClick={() => onDiagram(lab)} disabled={!cfg.devices.length} data-testid="network-lab-to-diagram"
          title="يفتح «محرّر المخططات» وفيه هذه الشبكة مرسومة: الأجهزة والكوابل والمنافذ والعناوين، لتحفظها صورة لكتابك">ارسمها في محرّر المخططات</button>}
        </>}
      </div>
      {draftKey && <p className="net2-note" data-testid="network-lab-draft">{draftFailed ? (inExercise ? "تعذّر حفظ المسودة في هذا المتصفح." : "تعذّر حفظ المسودة في هذا المتصفح؛ احفظ الشبكة في ملف.") : inExercise ? "شبكتك تُحفظ تلقائيًا مسودةً في هذا المتصفح." : "الشبكة تُحفظ تلقائيًا مسودةً في هذا المتصفح. لنقلها إلى جهاز آخر: «احفظ في ملف»."}</p>}

      <div className="netlab-bar net2-actions" role="group" aria-label="إضافة جهاز">
        {kinds.map(k => <button key={k} type="button" onClick={() => add(k)} disabled={cfg.devices.length >= NET2_LIMITS.devices}>{"+ " + LABEL[k]}</button>)}
      </div>

      {cfg.devices.length === 0
        ? <p className="netlab-empty">{inExercise ? "ابدأ بإضافة الأجهزة من الأزرار في الأعلى، ثم صِلها بالكوابل وبرمجها." : "ابدأ بإضافة الأجهزة من الأزرار في الأعلى، ثم صِلها بالكوابل — أو افتح مثالًا جاهزًا."}</p>
        : <Net2Diagram config={cfg} title={"شبكتي: " + cfg.devices.length + " أجهزة و" + cfg.links.length + " كوابل"} selectedId={selected} onSelect={pick} linkDown={linkDown}
            wireless={wireless} editable onMove={(id, x, y) => apply(moveDevice(lab, id, x, y))} testId="network-lab-diagram"
            flow={shown ? { id: shown.id, ok: shown.flow.ok, hops: shown.flow.hops } : null} />}
      <p className="net2-flow-status" role="status" data-testid="network-lab-flow" data-ok={shown ? String(shown.flow.ok) : undefined}>{flowStatus}</p>
      {notice && <p className={notice.error ? "net2-error" : "net2-note netlab-ok"} role="status" data-testid="network-lab-notice">{notice.text}</p>}

      {cfg.devices.length > 0 && (
        <ul className="net2-devices" aria-label="الأجهزة في الشبكة" data-testid="network-lab-devices">
          {cfg.devices.map(d => <li key={d.id}><button type="button" aria-pressed={selected === d.id} onClick={() => pick(d.id)}>{d.label} ({kindLabel(d)})</button></li>)}
        </ul>
      )}

      {cfg.devices.length > 1 && (
        <fieldset className="netlab-box">
          <legend>توصيل كابل</legend>
          <div className="netlab-cable">
            <label>من الجهاز<select aria-label="من الجهاز" value={cable.a} onChange={e => setCable({ ...cable, a: e.target.value, ap: "" })}><option value="">اختر…</option>{cfg.devices.filter(d => portsOf(d.id).length).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>المنفذ<select aria-label="منفذ الجهاز الأول" value={cable.ap} onChange={e => setCable({ ...cable, ap: e.target.value })} disabled={!cable.a} dir="ltr"><option value="">…</option>{portsA.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            <label>إلى الجهاز<select aria-label="إلى الجهاز" value={cable.b} onChange={e => setCable({ ...cable, b: e.target.value, bp: "" })}><option value="">اختر…</option>{cfg.devices.filter(d => d.id !== cable.a && portsOf(d.id).length).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>المنفذ<select aria-label="منفذ الجهاز الثاني" value={cable.bp} onChange={e => setCable({ ...cable, bp: e.target.value })} disabled={!cable.b} dir="ltr"><option value="">…</option>{portsB.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            <div className="net2-actions"><button type="button" onClick={connect} disabled={!cable.a || !cable.ap || !cable.b || !cable.bp}>صِل</button></div>
          </div>
          {cfg.links.length > 0 && (
            <ul className="netlab-links" aria-label="الكوابل" data-testid="network-lab-links">
              {cfg.links.map(l => (
                <li key={l.id}>
                  <span><span dir="ltr" className="netlab-cable-text"><bdi>{label(l.a.deviceId)}</bdi> {l.a.port} ↔ <bdi>{label(l.b.deviceId)}</bdi> {l.b.port}</span>{linkDown(l) ? " — مقطوع" : ""}</span>
                  <button type="button" className="netlab-x" aria-label={"احذف الكابل بين " + label(l.a.deviceId) + " و" + label(l.b.deviceId)} onClick={() => apply(removeLink(lab, l.id), "حُذف الكابل.")}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      {device && (
        <section className="net2-panel netlab-device" data-testid="network-lab-device" aria-labelledby={"netlab-sel-" + device.id}>
          <h4 id={"netlab-sel-" + device.id} aria-live="polite">{device.label} ({kindLabel(device)})</h4>
          <div className="netlab-cable">
            <label>اسم الجهاز<input key={device.id + "|" + device.label} defaultValue={device.label} maxLength={NET2_LIMITS.labelChars}
              onBlur={e => { const v = e.currentTarget.value; if (v.trim() && v !== device.label) { if (!apply(renameDevice(lab, device.id, v))) e.currentTarget.value = device.label; } else e.currentTarget.value = device.label; }} /></label>
            {isHostKind(device.kind) && (
              <fieldset className="netlab-adapters"><legend>محوّلات الشبكة</legend>
                {(["ethernet", "wireless"] as const).map(a => {
                  const has = deviceAdapters(device).includes(a);
                  return <label key={a}><input type="checkbox" checked={has} onChange={e => apply(setAdapters(lab, device.id, (["ethernet", "wireless"] as const).filter(x => (x === a ? e.target.checked : deviceAdapters(device).includes(x)))))} /> {ADAPTER_TEXT[a]}</label>;
                })}
              </fieldset>
            )}
          </div>
          <p className="net2-note">المنافذ: <span className="net2-ltr">{labDevicePorts(device).filter(p => !plain || !isSerialPort(p)).join(", ") || "—"}</span></p>
          <div className="net2-actions">
            {confirm === "remove"
              ? <><button type="button" className="is-danger" onClick={() => { if (apply(removeDevice(lab, device.id), "حُذف " + device.label + " مع كوابله وإعداداته.")) { setSelected(null); setConfirm(null); } }}>تأكيد حذف {device.label}</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
              : <button type="button" className="is-secondary" onClick={() => setConfirm("remove")}>احذف الجهاز</button>}
          </div>
          {(device.kind as string) === "hub"
            ? <p className="net2-note" data-testid="network-lab-hub">الـ Hub لا يُبرمج: كل ما يصل إلى منفذ يخرج من كل المنافذ الأخرى (مجال تصادم واحد لكل الأجهزة الموصولة به).</p>
            : <DevicePanel cfg={cfg} view={view} device={device} base={lab.actions} emit={emit} label={"مختبر الشبكات"} remainingTotal={remainingTotal} name={label} />}
          {!plain && isHostKind(device.kind) && <Ipv6Form key={device.id + "|" + JSON.stringify(replay.state.lab.hosts6[device.id] ?? null)} device={device} current={replay.state.lab.hosts6[device.id]} emit={emit} />}
          {!plain && device.kind === "router" && (
            <details className="netlab-extras" data-testid="network-lab-router-extras"><summary>أوامر إضافية في المختبر: WAN، التوجيه، ACL، NAT، IPv6</summary>
              <dl>{ROUTER_EXTRAS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="net2-ltr">{v}</dd></div>)}</dl>
            </details>
          )}
        </section>
      )}
      {!device && cfg.devices.length > 0 && <p className="net2-note">اختر جهازًا من الرسم أو من القائمة لبرمجته (سطر الأوامر، سطح المكتب، إعدادات نقطة الوصول) أو لتغيير اسمه أو حذفه.</p>}

      {lab.actions.length > 0 && (
        <div className="net2-actions">
          {confirm === "clear"
            ? <><button type="button" className="is-danger" onClick={() => { setLab(clearConfiguration(lab)); setConfirm(null); setFlow(null); setNotice({ text: "مُسحت إعدادات كل الأجهزة؛ بقيت الأجهزة والكوابل.", error: false }); }}>تأكيد مسح الإعدادات</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
            : <button type="button" className="is-secondary" onClick={() => setConfirm("clear")}>امسح إعدادات كل الأجهزة</button>}
          <span className="net2-note">العمليات المتبقية: {remainingTotal}</span>
        </div>
      )}
    </div>
  );
}

/** N2 — a host's IPv6 address (the lab action host.setIpv6), next to its IPv4 IP Configuration. */
function Ipv6Form({ device, current, emit }: { device: Net2Device; current?: { iface: string; addr: string; len: number; gw: string }; emit: (a: Record<string, unknown>[]) => void }) {
  const names = adapterNames(device);
  const [adapter, setAdapter] = useState(current?.iface ?? names[0]);
  const [address, setAddress] = useState(current ? current.addr + "/" + current.len : "");
  const [gateway, setGateway] = useState(current?.gw ?? "");
  return (
    <fieldset className="netlab-box netlab-v6" data-testid="network-lab-ipv6">
      <legend>IPv6</legend>
      <div className="netlab-cable">
        {names.length > 1 && <label>المحوّل<select value={adapter} onChange={e => setAdapter(e.target.value as typeof adapter)} dir="ltr">{names.map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
        <label>IPv6 Address / Prefix<input className="net2-ltr" dir="ltr" value={address} placeholder="2001:db8:1::10/64" maxLength={49} onChange={e => setAddress(e.target.value)} /></label>
        <label>Default Gateway (IPv6)<input className="net2-ltr" dir="ltr" value={gateway} placeholder="2001:db8:1::1" maxLength={45} onChange={e => setGateway(e.target.value)} /></label>
        <div className="net2-actions">
          <button type="button" onClick={() => emit([{ type: "host.setIpv6", deviceId: device.id, adapter, address: address.trim(), gateway: address.trim() ? gateway.trim() : "" }])}>حفظ IPv6</button>
          {current && <button type="button" className="is-secondary" onClick={() => emit([{ type: "host.setIpv6", deviceId: device.id, adapter, address: "", gateway: "" }])}>إزالة IPv6</button>}
        </div>
      </div>
      <p className="net2-note">جرّب في Command Prompt: <span className="net2-ltr">ping 2001:db8:2::10</span> و <span className="net2-ltr">ipconfig</span></p>
    </fieldset>
  );
}
