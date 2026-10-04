import { SWITCH_PORTS, displayInterfaceName, effectiveInterfaceConfig, normalizeDeviceState, sortInterfaceNames, type NetworkCliDeviceState } from "../networkCliEngine";
import { evaluateNetworkCliTarget, validateNetworkCliAnswerKey, validateNetworkCliConfig } from "../networkCliQuestion";
import "./networkCli.css";

// Phase 18C — teacher-side projections for the manual review screen: the student's CANONICAL device state (the server-derived
// state stored with the answer) as readable tables, the per-check comparison against the private target, and the command
// transcript as TEXT (evidence, never authority). Nothing here grades: the official score comes from the server grader; the
// teacher's manual mark below stays the final authority.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const yesNo = (shut: boolean) => (shut ? "shutdown" : "up");

export function NetworkCliStateView({ state }: { state: NetworkCliDeviceState }) {
  const names = sortInterfaceNames([...new Set([...Object.keys(state.interfaces), ...SWITCH_PORTS.filter(p => state.interfaces[p])])]);
  return (
    <div className="ncli-state" data-testid="ncli-state-view">
      <p><span>اسم الجهاز: </span><code className="ncli-ltr">{state.hostname}</code></p>
      <div className="ncli-table-wrap"><table className="ncli-table"><caption>قاعدة بيانات VLAN</caption><thead><tr><th>VLAN</th><th>الاسم</th></tr></thead><tbody>
        <tr><td className="ncli-ltr">1</td><td className="ncli-ltr">default</td></tr>
        {Object.keys(state.vlans).map(id => <tr key={id}><td className="ncli-ltr">{id}</td><td className="ncli-ltr">{state.vlans[id].name ?? "—"}</td></tr>)}
      </tbody></table></div>
      <div className="ncli-table-wrap"><table className="ncli-table"><caption>الواجهات المضبوطة</caption><thead><tr><th>الواجهة</th><th>الوضع</th><th>Access VLAN</th><th>Native VLAN</th><th>الحالة</th><th>IPv4 / القناع</th></tr></thead><tbody>
        {names.length === 0 && <tr><td colSpan={6}>لا توجد واجهات مضبوطة بخلاف الافتراضي.</td></tr>}
        {names.map(n => { const e = effectiveInterfaceConfig(state, n); return <tr key={n}><td className="ncli-ltr">{displayInterfaceName(n)}</td><td className="ncli-ltr">{e.mode ?? "—"}</td><td className="ncli-ltr">{String(e.accessVlan)}</td><td className="ncli-ltr">{String(e.nativeVlan)}</td><td className="ncli-ltr">{yesNo(e.shutdown)}</td><td className="ncli-ltr">{e.ipAddress ? e.ipAddress + " " + e.subnetMask : "—"}</td></tr>; })}
      </tbody></table></div>
    </div>
  );
}

/** The student's answer: canonical state + per-check result (when the key is available) + the transcript. */
export function NetworkCliAnswerView({ answer, answerKey, config }: { answer: unknown; answerKey: unknown; config?: unknown }) {
  const st = isObj(answer) ? normalizeDeviceState(answer.state) : { ok: false as const };
  const commands = isObj(answer) && Array.isArray(answer.commands) ? answer.commands.filter((c): c is string => typeof c === "string") : [];
  // Review Fix 1 — the per-check comparison is shown ONLY under a VALID private contract (the same canonical validator the
  // finalization and the authoritative scorer use); an invalid key is an explicit "grading configuration invalid" state.
  // Review Fix 2 — the PUBLIC config (when the review payload carries it) goes through the STRICT authority too: checks computed
  // from a repaired config are never shown; both defects share the same safe presentation.
  const key = validateNetworkCliAnswerKey(answerKey);
  const cfg = config === undefined ? { ok: true as const, issues: [] as { message: string }[] } : validateNetworkCliConfig(config);
  const valid = key.ok && cfg.ok;
  const issues = [...(key.ok ? [] : key.issues), ...(cfg.ok ? [] : cfg.issues)];
  const checks = st.ok && key.ok && cfg.ok ? evaluateNetworkCliTarget(key.key.targetState, st.state) : [];
  return (
    <div className="ncli-review" data-testid="ncli-answer-view">
      {st.ok ? <NetworkCliStateView state={st.state} /> : <p className="ncli-unavailable">حالة الجهاز المحفوظة غير صالحة أو مفقودة.</p>}
      {!valid && <p className="ncli-unavailable" role="note" data-testid="ncli-key-invalid">إعداد التصحيح لهذا السؤال (الإعداد المنشور أو الحالة المستهدفة) غير صالح؛ لم يُحتسب أي تصحيح آلي والسؤال بحاجة إلى تصحيح يدوي. {issues.map(i => i.message).join(" ")}</p>}
      {checks.length > 0 && <ul className="ncli-checks" aria-label="نتيجة مقارنة الحالة المستهدفة">
        {checks.map(c => <li key={c.id} className="ncli-check" data-ok={c.ok}><span className="ncli-check-mark" aria-hidden="true">{c.ok ? "✓" : "✗"}</span><span>{c.label}</span><span>المطلوب: <code className="ncli-ltr">{c.expected}</code></span><span>الفعلي: <code className="ncli-ltr">{c.actual}</code></span><span className="iex-visually-hidden">{c.ok ? "(صحيح)" : "(غير صحيح)"}</span></li>)}
      </ul>}
      <details><summary>سجل الأوامر ({commands.length})</summary><pre className="ncli-transcript" dir="ltr">{commands.join("\n")}</pre></details>
    </div>
  );
}

/** The private key, summarised factually for the teacher (never rendered to a student). */
export function NetworkCliKeySummary({ answerKey }: { answerKey: unknown }) {
  const key = validateNetworkCliAnswerKey(answerKey);
  if (!key.ok) return <div className="ncli-key" data-testid="ncli-key-summary"><p className="ncli-unavailable" role="note">مفتاح التصحيح غير صالح — لا تصحيح آلي، مطلوب تصحيح يدوي.</p><ul className="ncli-issues">{key.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul></div>;
  const target = key.key.targetState;
  const rows: string[] = [];
  if (target.hostname) rows.push("hostname " + target.hostname);
  for (const id of Object.keys(target.vlans ?? {})) rows.push("vlan " + id + (target.vlans![id]?.name ? " (name " + target.vlans![id].name + ")" : ""));
  for (const n of Object.keys(target.interfaces ?? {})) { const t = target.interfaces![n]; if (isObj(t)) rows.push(n + ": " + Object.entries(t).map(([k, v]) => k + "=" + (typeof v === "boolean" ? yesNo(v) : String(v))).join(", ")); }
  const scoring = key.key.scoring === "allOrNothing" ? "كل شيء أو لا شيء" : "علامة نسبية لكل عنصر";
  return <div className="ncli-key" data-testid="ncli-key-summary"><p>طريقة الاحتساب: {scoring}</p><pre className="ncli-transcript" dir="ltr">{rows.join("\n")}</pre></div>;
}
