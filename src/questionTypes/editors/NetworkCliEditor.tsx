import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { QuestionBody } from "../../examTypes";
import NetworkCliTerminal, { type NetworkCliTranscriptEntry } from "../../networkCli/NetworkCliTerminal";
import { NETWORK_CLI_LIMITS, SWITCH_PORTS, createSession, displayInterfaceName, executeCommand, normalizeInterfaceName, promptFor, sortInterfaceNames, type NetworkCliSession } from "../../networkCliEngine";
import { NETWORK_CLI_SCORING_MODES, defaultNetworkCliConfig, projectNetworkCliConfigForStudent, targetCheckCount, validateNetworkCliQuestion, type NetworkCliScoringMode, type NetworkCliTargetStateV1 } from "../../networkCliQuestion";
import "../../networkCli/networkCli.css";

// Phase 18C — networkCli@1 authoring (lazy). Edits the canonical node only: the PUBLIC configuration under `networkCli` (device +
// INITIAL device state) and the PRIVATE key under `answer` (TARGET state = the graded checks, scoring mode). Both states are
// edited through the same structured tables (hostname, VLAN database, interface rows) — never as raw JSON. Values are stored as
// typed by the teacher; INLINE validation runs the ONE canonical validator (validateNetworkCliQuestion — the same rules
// finalization applies). «جرّب الحالة الابتدائية» opens the same terminal the student gets, on a throw-away session.
type Vlans = Record<string, { name?: string }>;
type IfRow = Record<string, unknown>;
type StateDraft = { hostname?: unknown; vlans: Vlans; interfaces: Record<string, IfRow> };
type Key = { targetState: StateDraft; scoring?: unknown };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SCORING_LABELS: Record<NetworkCliScoringMode, string> = { proportional: "علامة نسبية: علامة السؤال × (العناصر الصحيحة ÷ كل العناصر)", allOrNothing: "كل شيء أو لا شيء: العلامة كاملة فقط عند تطابق كل العناصر" };

function readDraft(raw: unknown): StateDraft {
  const r = isObj(raw) ? raw : {};
  const vlans: Vlans = {}; if (isObj(r.vlans)) for (const id of Object.keys(r.vlans)) { const v = (r.vlans as Record<string, unknown>)[id]; vlans[id] = isObj(v) && typeof v.name === "string" ? { name: v.name } : {}; }
  const interfaces: Record<string, IfRow> = {}; if (isObj(r.interfaces)) for (const n of Object.keys(r.interfaces)) { const v = (r.interfaces as Record<string, unknown>)[n]; interfaces[n] = isObj(v) ? { ...v } : {}; }
  return { hostname: r.hostname, vlans, interfaces };
}
const num = (raw: string): unknown => (raw.trim() === "" ? undefined : /^\d{1,4}$/.test(raw.trim()) ? Number(raw.trim()) : raw);   // invalid text stays visible to the validator
const txt = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const sortedIf = (rows: Record<string, IfRow>): string[] => { const canon = Object.keys(rows).filter(n => normalizeInterfaceName(n)); const other = Object.keys(rows).filter(n => !normalizeInterfaceName(n)); return [...sortInterfaceNames(canon.map(n => normalizeInterfaceName(n)!)).map(c => canon.find(n => normalizeInterfaceName(n) === c)!), ...other]; };

/** One structured device-state table (initial state or target). In target mode an EMPTY field means "not graded". */
function StateTable({ draft, target, onChange, disabled, idPrefix }: { draft: StateDraft; target: boolean; onChange: (next: StateDraft) => void; disabled?: boolean; idPrefix: string }) {
  const [newVlan, setNewVlan] = useState(""); const [newIf, setNewIf] = useState("f0/1"); const [newSvi, setNewSvi] = useState("");
  const setIf = (n: string, patch: IfRow) => { const row = { ...draft.interfaces[n] }; for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete row[k]; else row[k] = v; } onChange({ ...draft, interfaces: { ...draft.interfaces, [n]: row } }); };
  const addVlan = () => { const id = newVlan.trim(); if (!id || draft.vlans[id]) return; onChange({ ...draft, vlans: { ...draft.vlans, [id]: {} } }); setNewVlan(""); };
  const addIf = () => { const name = newIf === "svi" ? normalizeInterfaceName("vlan" + newSvi.trim()) ?? ("vlan" + newSvi.trim()) : newIf; if (!name || draft.interfaces[name]) return; onChange({ ...draft, interfaces: { ...draft.interfaces, [name]: {} } }); setNewSvi(""); };
  const removeVlan = (id: string) => { const v = { ...draft.vlans }; delete v[id]; onChange({ ...draft, vlans: v }); };
  const removeIf = (n: string) => { const i = { ...draft.interfaces }; delete i[n]; onChange({ ...draft, interfaces: i }); };
  const shutValue = (v: unknown) => (v === true ? "shutdown" : v === false ? "up" : "");
  return (
    <div className="qt-editor">
      <label className="sb-inline"><span>{target ? "اسم الجهاز المطلوب (اتركه فارغًا إن لم يكن مطلوبًا)" : "اسم الجهاز الابتدائي"}</span><input className="sb-input sb-input-sm ncli-ltr" aria-label={(target ? "اسم الجهاز المطلوب" : "اسم الجهاز الابتدائي")} value={txt(draft.hostname)} onChange={e => onChange({ ...draft, hostname: e.target.value === "" ? undefined : e.target.value })} disabled={disabled} dir="ltr" /></label>
      <div className="ncli-table-wrap"><table className="ncli-table"><caption>{target ? "VLANs المطلوبة (الاسم اختياري: إن كُتب فهو عنصر يُقيَّم)" : "قاعدة بيانات VLAN الابتدائية"}</caption>
        <thead><tr><th>VLAN</th><th>الاسم</th><th></th></tr></thead>
        <tbody>
          {Object.keys(draft.vlans).map(id => <tr key={id}><td className="ncli-ltr">{id}</td><td><input className="sb-input sb-input-sm ncli-ltr" aria-label={"اسم VLAN " + id} value={txt(draft.vlans[id].name)} onChange={e => onChange({ ...draft, vlans: { ...draft.vlans, [id]: e.target.value === "" ? {} : { name: e.target.value } } })} disabled={disabled} dir="ltr" /></td><td className="ncli-row-actions"><button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف VLAN " + id} onClick={() => removeVlan(id)} disabled={disabled}>×</button></td></tr>)}
          <tr><td><input className="sb-input sb-input-sm ncli-ltr" aria-label={"رقم VLAN جديدة" + (target ? " مطلوبة" : "")} placeholder="20" inputMode="numeric" value={newVlan} onChange={e => setNewVlan(e.target.value)} disabled={disabled} dir="ltr" /></td><td colSpan={2}><button type="button" className="sb-mini-btn" onClick={addVlan} disabled={disabled || !newVlan.trim()}>+ إضافة VLAN</button></td></tr>
        </tbody></table></div>
      <div className="ncli-table-wrap"><table className="ncli-table"><caption>{target ? "الواجهات المطلوبة (كل حقل غير فارغ = عنصر يُقيَّم)" : "إعداد الواجهات الابتدائي"}</caption>
        <thead><tr><th>الواجهة</th><th>الوضع</th><th>Access VLAN</th><th>Native VLAN</th><th>الحالة الإدارية</th><th>IPv4 (SVI)</th><th>القناع (SVI)</th><th></th></tr></thead>
        <tbody>
          {sortedIf(draft.interfaces).map(n => { const row = draft.interfaces[n]; const canon = normalizeInterfaceName(n); const svi = !!canon && canon.startsWith("vlan"); return (
            <tr key={n}>
              <td className="ncli-ltr">{canon ? displayInterfaceName(canon) : n}</td>
              <td>{!svi && <select aria-label={n + " — الوضع"} value={typeof row.mode === "string" ? row.mode : ""} onChange={e => setIf(n, { mode: e.target.value || undefined })} disabled={disabled}><option value="">—</option><option value="access">access</option><option value="trunk">trunk</option></select>}</td>
              <td>{!svi && <input className="sb-input sb-input-sm ncli-ltr" aria-label={n + " — Access VLAN"} inputMode="numeric" value={txt(row.accessVlan)} onChange={e => setIf(n, { accessVlan: num(e.target.value) })} disabled={disabled} dir="ltr" />}</td>
              <td>{!svi && <input className="sb-input sb-input-sm ncli-ltr" aria-label={n + " — Native VLAN"} inputMode="numeric" value={txt(row.nativeVlan)} onChange={e => setIf(n, { nativeVlan: num(e.target.value) })} disabled={disabled} dir="ltr" />}</td>
              <td><select aria-label={n + " — الحالة الإدارية"} value={shutValue(row.shutdown)} onChange={e => setIf(n, { shutdown: e.target.value === "" ? undefined : e.target.value === "shutdown" })} disabled={disabled}><option value="">—</option><option value="up">up (no shutdown)</option><option value="shutdown">shutdown</option></select></td>
              <td>{svi && <input className="sb-input sb-input-sm ncli-ltr" aria-label={n + " — عنوان IPv4"} placeholder="192.168.10.2" value={txt(row.ipAddress)} onChange={e => setIf(n, { ipAddress: e.target.value || undefined })} disabled={disabled} dir="ltr" />}</td>
              <td>{svi && <input className="sb-input sb-input-sm ncli-ltr" aria-label={n + " — قناع الشبكة"} placeholder="255.255.255.0" value={txt(row.subnetMask)} onChange={e => setIf(n, { subnetMask: e.target.value || undefined })} disabled={disabled} dir="ltr" />}</td>
              <td className="ncli-row-actions"><button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الواجهة " + n} onClick={() => removeIf(n)} disabled={disabled}>×</button></td>
            </tr>); })}
          <tr>
            <td colSpan={2}><select aria-label={"إضافة واجهة" + (target ? " مطلوبة" : "")} value={newIf} onChange={e => setNewIf(e.target.value)} disabled={disabled}>{SWITCH_PORTS.map(p => <option key={p} value={p}>{displayInterfaceName(p)}</option>)}<option value="svi">interface vlan …</option></select></td>
            <td colSpan={2}>{newIf === "svi" && <input className="sb-input sb-input-sm ncli-ltr" aria-label={"رقم VLAN للواجهة" + (target ? " المطلوبة" : "")} inputMode="numeric" placeholder="10" value={newSvi} onChange={e => setNewSvi(e.target.value)} disabled={disabled} dir="ltr" />}</td>
            <td colSpan={4}><button type="button" className="sb-mini-btn" data-testid={idPrefix + "-add-if"} onClick={addIf} disabled={disabled || (newIf === "svi" && !newSvi.trim())}>+ إضافة واجهة</button></td>
          </tr>
        </tbody></table></div>
    </div>
  );
}

function TryOut({ node }: { node: QuestionBody }) {
  const cfg = useMemo(() => projectNetworkCliConfigForStudent(node.networkCli), [node.networkCli]);
  const [epoch, setEpoch] = useState(0);
  const [run, setRun] = useState<{ epoch: number; session: NetworkCliSession; entries: NetworkCliTranscriptEntry[] } | null>(null);
  if (!cfg) return <p className="sb-hint">الحالة الابتدائية غير صالحة بعد؛ صحّح الأخطاء أدناه لتجربة المحاكي.</p>;
  const current = run && run.epoch === epoch ? run : { epoch, session: createSession(cfg.initialState), entries: [] as NetworkCliTranscriptEntry[] };
  const submit = (line: string) => { const r = executeCommand(current.session, line); if (r.result.status === "empty" || r.result.status === "refused") return; setRun({ epoch, session: r.session, entries: [...current.entries, { input: line, prompt: promptFor(current.session), result: r.result }] }); };
  return <div className="qt-editor" data-testid="ncli-tryout"><NetworkCliTerminal session={current.session} entries={current.entries} onSubmit={submit} label="تجربة المعلم" remaining={NETWORK_CLI_LIMITS.commands - current.entries.length} testId="ncli-tryout-terminal" /><button type="button" className="sb-mini-btn" onClick={() => setEpoch(e => e + 1)}>إعادة الضبط إلى الحالة الابتدائية</button></div>;
}

export default function NetworkCliEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const cfg = isObj(node.networkCli) ? (node.networkCli as unknown as Record<string, unknown>) : (defaultNetworkCliConfig() as unknown as Record<string, unknown>);
  const initial = readDraft(cfg.initialState);
  const key: Key = isObj(node.answer) ? { targetState: readDraft((node.answer as Record<string, unknown>).targetState), scoring: (node.answer as Record<string, unknown>).scoring } : { targetState: { vlans: {}, interfaces: {} }, scoring: "proportional" };
  const issues = useMemo(() => validateNetworkCliQuestion(node as unknown as Record<string, unknown>), [node]);
  const checks = targetCheckCount(key.targetState as NetworkCliTargetStateV1);
  const [tryOut, setTryOut] = useState(false);
  const writeInitial = (d: StateDraft) => onChange({ networkCli: { device: "switch", initialState: { v: 1, device: "switch", hostname: d.hostname === undefined ? "Switch" : d.hostname, vlans: d.vlans, interfaces: d.interfaces } } } as unknown as Partial<QuestionBody>);
  const writeKey = (patch: Partial<Key>) => { const next = { ...key, ...patch }; const target: Record<string, unknown> = {}; if (next.targetState.hostname !== undefined) target.hostname = next.targetState.hostname; if (Object.keys(next.targetState.vlans).length) target.vlans = next.targetState.vlans; if (Object.keys(next.targetState.interfaces).length) target.interfaces = next.targetState.interfaces; onChange({ answer: { targetState: target, scoring: next.scoring ?? "proportional" } } as unknown as Partial<QuestionBody>); };
  return (
    <div className="qt-editor qt-editor-networkCli" data-testid="qt-editor-networkCli">
      <section className="ncli-section" aria-labelledby="ncli-sec-device"><h4 id="ncli-sec-device">الجهاز والحالة الابتدائية (يراها الطالب)</h4>
        <p className="sb-hint">مبدّل تعليمي بـ 24 منفذ FastEthernet ومنفذي GigabitEthernet. يبدأ الطالب في وضع المستخدم بالحالة الابتدائية التالية.</p>
        <StateTable draft={initial} target={false} onChange={writeInitial} disabled={disabled} idPrefix="ncli-initial" />
        <button type="button" className="sb-mini-btn" onClick={() => setTryOut(v => !v)} aria-expanded={tryOut}>{tryOut ? "إخفاء المحاكي" : "جرّب الحالة الابتدائية في الطرفية"}</button>
        {tryOut && <TryOut node={node} />}
      </section>
      <section className="ncli-section" aria-labelledby="ncli-sec-target"><h4 id="ncli-sec-target">الحالة المستهدفة (مفتاح التصحيح — خاص بالمعلم)</h4>
        <p className="sb-hint">يُقيَّم الإعداد النهائي للجهاز لا تسلسل الأوامر: أي تسلسل أوامر صحيح يصل إلى هذه الحالة ينال العلامة نفسها. كل حقل تملؤه هنا عنصر مستقل في التصحيح.</p>
        <StateTable draft={key.targetState} target onChange={d => writeKey({ targetState: d })} disabled={disabled} idPrefix="ncli-target" />
        <label className="sb-inline"><span>طريقة احتساب العلامة</span>
          <select className="sb-input sb-input-sm" aria-label="طريقة احتساب العلامة" value={typeof key.scoring === "string" && (NETWORK_CLI_SCORING_MODES as readonly string[]).includes(key.scoring) ? key.scoring : "proportional"} onChange={e => writeKey({ scoring: e.target.value })} disabled={disabled}>
            {NETWORK_CLI_SCORING_MODES.map(m => <option key={m} value={m}>{SCORING_LABELS[m]}</option>)}
          </select>
        </label>
        <p className="sb-hint" data-testid="ncli-check-count">عدد عناصر التقييم: {checks}</p>
      </section>
      <section className="ncli-section" aria-labelledby="ncli-sec-valid"><h4 id="ncli-sec-valid">التحقق</h4>
        {issues.length === 0 ? <p className="ncli-ok" data-testid="ncli-valid">الإعداد صالح للاعتماد النهائي.</p> : <ul className="ncli-issues" data-testid="ncli-issues">{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
        <p className="sb-hint">الأوامر المدعومة: enable، disable، configure terminal، hostname، vlan / name، interface (FastEthernet، GigabitEthernet، vlan)، switchport mode access | trunk، switchport access vlan، switchport trunk native vlan، ip address، shutdown / no shutdown، show running-config، show vlan brief، show interfaces trunk، show ip interface brief.</p>
      </section>
    </div>
  );
}
