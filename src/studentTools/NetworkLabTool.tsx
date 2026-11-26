import { useMemo, useRef, useState } from "react";
import { NET2_DEVICE_KINDS, NET2_LIMITS, devicePorts, deviceAdapters, isHostKind, type Net2AdapterKind, type Net2Config, type Net2DeviceKind, type Net2Link } from "../net2Model";
import { replayNet2Cached, type Net2ReplayCache } from "../net2Plugin";
import { linkUp, makeNet } from "../net2Network";
import { traceHostCommandFlow, type Net2Flow } from "../net2Flow";
import Net2Diagram from "../networkTopology2/Net2Diagram";
import { DevicePanel } from "../networkTopology2/Net2Panels";
import { KIND_LABEL } from "../networkTopology2/net2Labels";
import { NET2_TEMPLATES } from "../networkTopology2/net2Templates";
import {
  EMPTY_LAB, addDevice, addLink, appendActions, clearConfiguration, freePorts, labFileName, moveDevice, parseLab, removeDevice, removeLink,
  renameDevice, serializeLab, setAdapters, type NetLab, type NetLabResult,
} from "./networkLab";
import "../networkTopology2/net2.css";
import "./networkLab.css";

// N1 (docs/enterprise-network-lab-tool-design.md) — «مختبر الشبكات»: the learner BUILDS a network (six device kinds, cables between free
// ports, positions) and configures and tests it through the simulator's own device surfaces (router / switch CLI, PC Desktop, AP, server
// services); ping / tracert draw the packet's path. Everything is networkTopology@2's engines, unchanged (networkLab.ts keeps the topology
// and the action list valid for them). Nothing is sent or graded. In a BOOK (`draftKey`) the network is kept as a draft in this browser;
// «احفظ في ملف» / «افتح ملفًا» move it through a file on the learner's own device.

const ADAPTER_TEXT: Readonly<Record<Net2AdapterKind, string>> = { ethernet: "Ethernet (كابل)", wireless: "Wi-Fi (لاسلكي)" };
type ShownFlow = { id: number; at: number; flow: Net2Flow };
const caches = new WeakMap<Net2Config, Net2ReplayCache>();
function replayOf(cfg: Net2Config, actions: readonly unknown[]) {
  const step = replayNet2Cached(cfg, actions, caches.get(cfg));
  if (step.cache) caches.set(cfg, step.cache);
  return step.replay;
}
function readDraft(key?: string): NetLab {
  if (!key) return EMPTY_LAB;
  try { const t = localStorage.getItem(key); const r = t ? parseLab(t) : null; return r && r.ok ? r.lab : EMPTY_LAB; } catch { return EMPTY_LAB; }
}
const isHostCommand = (a: unknown): a is { type: "host.command"; deviceId: string; command: unknown } =>
  !!a && typeof a === "object" && (a as { type?: unknown }).type === "host.command" && typeof (a as { deviceId?: unknown }).deviceId === "string";

export default function NetworkLabTool({ draftKey }: { draftKey?: string }) {
  const [lab, setLabState] = useState<NetLab>(() => readDraft(draftKey));
  // the draft follows every change (a book only); a full or blocked storage is reported, never thrown
  const [draftFailed, setDraftFailed] = useState(false);
  const setLab = (next: NetLab) => {
    setLabState(next);
    if (!draftKey) return;
    try {
      if (next.config.devices.length === 0 && next.actions.length === 0) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, serializeLab(next));
      setDraftFailed(false);
    } catch { setDraftFailed(true); }
  };
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"new" | "clear" | "remove" | null>(null);
  const [flow, setFlow] = useState<ShownFlow | null>(null);
  const [cable, setCable] = useState({ a: "", ap: "", b: "", bp: "" });
  const flowSeq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const replay = useMemo(() => replayOf(lab.config, lab.actions), [lab]);
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
  const view = replay;
  const label = (id: string) => cfg.devices.find(d => d.id === id)?.label ?? id;
  const net = makeNet(cfg, view.state.devices, view.state.ops);
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
    const traced = isHostCommand(added) ? traceHostCommandFlow(cfg, view.state, added.deviceId, added.command) : null;
    setLab(r.lab); setNotice(null);
    setFlow(traced ? { id: ++flowSeq.current, at: r.lab.actions.length, flow: traced } : null);
  };
  const pick = (id: string) => { setSelected(id); setConfirm(null); setNotice(null); };
  const add = (kind: Net2DeviceKind) => {
    const before = new Set(cfg.devices.map(d => d.id));
    const r = addDevice(lab, kind);
    if (apply(r) && r.ok) { const fresh = r.lab.config.devices.find(d => !before.has(d.id)); if (fresh) setSelected(fresh.id); }
  };
  const portsA = cable.a ? freePorts(cfg, cable.a) : [], portsB = cable.b ? freePorts(cfg, cable.b) : [];
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
          : <button type="button" className="is-secondary" onClick={() => setConfirm("new")} disabled={!cfg.devices.length}>شبكة جديدة</button>}
        <label className="netlab-select">افتح مثالًا
          <select value="" onChange={e => template(e.target.value)} data-testid="network-lab-example">
            <option value="">اختر…</option>
            {NET2_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <button type="button" className="is-secondary" onClick={save} disabled={!cfg.devices.length}>احفظ في ملف</button>
        <button type="button" className="is-secondary" onClick={() => fileRef.current?.click()}>افتح ملفًا</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden data-testid="network-lab-file" onChange={e => { void open(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {draftKey && <p className="net2-note" data-testid="network-lab-draft">{draftFailed ? "تعذّر حفظ المسودة في هذا المتصفح؛ احفظ الشبكة في ملف." : "الشبكة تُحفظ تلقائيًا مسودةً في هذا المتصفح. لنقلها إلى جهاز آخر: «احفظ في ملف»."}</p>}

      <div className="netlab-bar net2-actions" role="group" aria-label="إضافة جهاز">
        {NET2_DEVICE_KINDS.map(k => <button key={k} type="button" onClick={() => add(k)} disabled={cfg.devices.length >= NET2_LIMITS.devices}>{"+ " + KIND_LABEL[k]}</button>)}
      </div>

      {cfg.devices.length === 0
        ? <p className="netlab-empty">ابدأ بإضافة الأجهزة من الأزرار في الأعلى، ثم صِلها بالكوابل — أو افتح مثالًا جاهزًا.</p>
        : <Net2Diagram config={cfg} title={"شبكتي: " + cfg.devices.length + " أجهزة و" + cfg.links.length + " كوابل"} selectedId={selected} onSelect={pick} linkDown={linkDown}
            wireless={wireless} editable onMove={(id, x, y) => apply(moveDevice(lab, id, x, y))} testId="network-lab-diagram"
            flow={shown ? { id: shown.id, ok: shown.flow.ok, hops: shown.flow.hops } : null} />}
      <p className="net2-flow-status" role="status" data-testid="network-lab-flow" data-ok={shown ? String(shown.flow.ok) : undefined}>{flowStatus}</p>
      {notice && <p className={notice.error ? "net2-error" : "net2-note netlab-ok"} role="status" data-testid="network-lab-notice">{notice.text}</p>}

      {cfg.devices.length > 0 && (
        <ul className="net2-devices" aria-label="الأجهزة في الشبكة" data-testid="network-lab-devices">
          {cfg.devices.map(d => <li key={d.id}><button type="button" aria-pressed={selected === d.id} onClick={() => pick(d.id)}>{d.label} ({KIND_LABEL[d.kind]})</button></li>)}
        </ul>
      )}

      {cfg.devices.length > 1 && (
        <fieldset className="netlab-box">
          <legend>توصيل كابل</legend>
          <div className="netlab-cable">
            <label>من الجهاز<select aria-label="من الجهاز" value={cable.a} onChange={e => setCable({ ...cable, a: e.target.value, ap: "" })}><option value="">اختر…</option>{cfg.devices.filter(d => freePorts(cfg, d.id).length).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>المنفذ<select aria-label="منفذ الجهاز الأول" value={cable.ap} onChange={e => setCable({ ...cable, ap: e.target.value })} disabled={!cable.a} dir="ltr"><option value="">…</option>{portsA.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            <label>إلى الجهاز<select aria-label="إلى الجهاز" value={cable.b} onChange={e => setCable({ ...cable, b: e.target.value, bp: "" })}><option value="">اختر…</option>{cfg.devices.filter(d => d.id !== cable.a && freePorts(cfg, d.id).length).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>المنفذ<select aria-label="منفذ الجهاز الثاني" value={cable.bp} onChange={e => setCable({ ...cable, bp: e.target.value })} disabled={!cable.b} dir="ltr"><option value="">…</option>{portsB.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            <div className="net2-actions"><button type="button" onClick={connect} disabled={!cable.a || !cable.ap || !cable.b || !cable.bp}>صِل</button></div>
          </div>
          {cfg.links.length > 0 && (
            <ul className="netlab-links" aria-label="الكوابل" data-testid="network-lab-links">
              {cfg.links.map(l => (
                <li key={l.id}>
                  <span><bdi>{label(l.a.deviceId)}</bdi> <span className="net2-ltr">{l.a.port}</span> ↔ <bdi>{label(l.b.deviceId)}</bdi> <span className="net2-ltr">{l.b.port}</span>{linkDown(l) ? " — مقطوع" : ""}</span>
                  <button type="button" className="netlab-x" aria-label={"احذف الكابل بين " + label(l.a.deviceId) + " و" + label(l.b.deviceId)} onClick={() => apply(removeLink(lab, l.id), "حُذف الكابل.")}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      {device && (
        <section className="net2-panel netlab-device" data-testid="network-lab-device" aria-labelledby={"netlab-sel-" + device.id}>
          <h4 id={"netlab-sel-" + device.id} aria-live="polite">{device.label} ({KIND_LABEL[device.kind]})</h4>
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
          <p className="net2-note">المنافذ: <span className="net2-ltr">{devicePorts(device).join(", ") || "—"}</span></p>
          <div className="net2-actions">
            {confirm === "remove"
              ? <><button type="button" className="is-danger" onClick={() => { if (apply(removeDevice(lab, device.id), "حُذف " + device.label + " مع كوابله وإعداداته.")) { setSelected(null); setConfirm(null); } }}>تأكيد حذف {device.label}</button><button type="button" className="is-secondary" onClick={() => setConfirm(null)}>إلغاء</button></>
              : <button type="button" className="is-secondary" onClick={() => setConfirm("remove")}>احذف الجهاز</button>}
          </div>
          <DevicePanel cfg={cfg} view={view} device={device} base={lab.actions} emit={emit} label={"مختبر الشبكات"} remainingTotal={remainingTotal} name={label} />
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
