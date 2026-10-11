import { useState } from "react";
import type { SmartSimEditorProps } from "../trustedSim/smartSimUiRegistry";
import SmartSimDraftInput from "../trustedSim/SmartSimDraftInput";
import {
  RXN_LIMITS, expectedFamilies, resolveReactionRef, roleTerms, rxnContext, validateRxnConfig, type RxnConfigV1, type RxnContext
} from "../chemistryReactionsModel";
import { chemistryReactionsPluginV1, expectedRxnText, type RxnCheck } from "../chemistryReactionsPlugin";
import { BALANCE_FAILURE_MESSAGE, REACTION_LIMITS, REACTION_STATES, balanceReaction, equationText, hasChargedTerm, reactionElements, reactionTermIds, termText } from "../chemistry/reactions";
import {
  CATALOG_ONLY_ROLES, REACTION_CATALOG, REACTION_FAMILIES, REACTION_FAMILY_LABEL, REACTION_LEVELS, REACTION_LEVEL_LABEL, REACTION_ROLES, REACTION_ROLE_LABEL, REACTION_SOURCES,
  REACTION_STATE_LABEL, catalogReactionV1, familyStatus, type ReactionRole
} from "../chemistry/reactionCatalog";
import { parseFormula } from "../chemistry/formula";
import { chemElement } from "../chemistry/elements";
import { RXN_TEMPLATES } from "./rxnTemplates";
import RxnWorkspace from "./RxnWorkspace";
import "../chemistryStructure/chem.css";
import "./rxn.css";

// Phase 21D-D.2 — chemistryReactions@1 AUTHORING (lazy; structured, never raw JSON): the equation (a curated, sourced catalog reaction or the
// teacher's own equation, accepted only when the exact solver finds a unique positive balancing), what the student may see, the tasks
// (balancing with given coefficients, classifications, role selections), the PRIVATE weighted checks and the scoring mode. Expected answers are
// never typed: the editor shows what the solver and the catalog derive (teacher only). Anything invalid is reported here and by the host's
// canonical validator, and blocks finalization.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const show = (v: unknown) => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");
const nextId = (ids: string[], prefix: string) => { let n = ids.length + 1; while (ids.includes(prefix + n)) n++; return prefix + n; };
const KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "rxn.balanced": "المعادلة موزونة (أي أعداد صحيحة موجبة)", "rxn.lowest": "أصغر معاملات صحيحة تمامًا", "rxn.element": "حفظ ذرات عنصر محدد", "rxn.charge": "حفظ الشحنة الكلية",
  "rxn.coefficient": "معامل مادة محددة", "rxn.classification": "تصنيف التفاعل", "rxn.selection": "اختيار المواد ذات الدور"
});
const CHARGES = Array.from({ length: 2 * REACTION_LIMITS.chargeAbsMax + 1 }, (_, i) => i - REACTION_LIMITS.chargeAbsMax);
const chargeLabel = (q: number) => (q === 0 ? "0 (متعادل)" : (q > 0 ? "+" : "−") + Math.abs(q));
const STATUS_MARK = { yes: "✓ صحيح لهذا التفاعل", no: "✗ لا ينطبق", contested: "⚠ مختلف عليه — لا يُعرض" } as const;
const emptyTerm = () => ({ formula: "", charge: 0, state: null });

export default function RxnEditor({ config, checks, scoring, onChange, disabled }: SmartSimEditorProps) {
  const c = isObj(config) ? config : {};
  const view = isObj(c.view) ? c.view : {}, tasks = isObj(c.tasks) ? c.tasks : {};
  const balance = isObj(tasks.balance) ? tasks.balance : null, locked = balance && Array.isArray(balance.locked) ? (balance.locked as string[]) : [];
  const classes = (Array.isArray(tasks.classifications) ? tasks.classifications : []).filter(isObj), sels = (Array.isArray(tasks.selections) ? tasks.selections : []).filter(isObj);
  const reaction = isObj(c.reaction) ? c.reaction : {};
  const isCustom = isObj(reaction.custom);
  const custom = isCustom ? (reaction.custom as Obj) : null;
  const rows = (side: "reactants" | "products") => (custom && Array.isArray(custom[side]) ? (custom[side] as unknown[]).filter(isObj) : []);
  const list = checks.filter(isObj);
  const [preview, setPreview] = useState(0);
  const valid = validateRxnConfig(config);
  const cfg: RxnConfigV1 | null = valid.ok ? valid.config : null;
  const ctx: RxnContext | null = cfg ? rxnContext(cfg) : null;
  const resolved = resolveReactionRef(c.reaction);
  const termIds = resolved.ok ? reactionTermIds(resolved.reaction) : [];
  const termNames = resolved.ok ? [...resolved.reaction.reactants, ...resolved.reaction.products].map(t => termText(t)) : [];
  const elements = resolved.ok ? reactionElements(resolved.reaction) : [];
  const charged = resolved.ok && hasChargedTerm(resolved.reaction);
  const cat = resolved.ok ? resolved.catalog : null;

  const setConfig = (next: Obj) => onChange({ config: { v: 1, reaction: c.reaction ?? { catalog: "waterFormation" }, view, tasks: { balance, classifications: classes, selections: sels }, ...next } });
  const setTasks = (patch: Obj) => setConfig({ tasks: { balance, classifications: classes, selections: sels, ...patch } });
  const setCheck = (i: number, patch: Obj) => onChange({ checks: list.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  /** A new equation invalidates term-specific choices: given coefficients reset, term / element checks that no longer apply are dropped. */
  const setReaction = (next: unknown) => {
    const r = resolveReactionRef(next), ids = r.ok ? reactionTermIds(r.reaction) : [], els = r.ok ? reactionElements(r.reaction) : [];
    const keep = list.filter(k => (k.kind !== "rxn.coefficient" || ids.includes(String(k.termId))) && (k.kind !== "rxn.element" || els.includes(String(k.element))) && (k.kind !== "rxn.charge" || (r.ok && hasChargedTerm(r.reaction))));
    onChange({ config: { v: 1, reaction: next, view: { ...view, names: !!(r.ok && r.catalog) && view.names === true }, tasks: { balance: balance ? { locked: [] } : null, classifications: r.ok && r.catalog ? classes : [], selections: sels } }, checks: keep });
  };
  const setRows = (side: "reactants" | "products", next: unknown[]) => setReaction({ custom: { reactants: side === "reactants" ? next : rows("reactants"), products: side === "products" ? next : rows("products") } });
  const applyTemplate = (make: () => { config: unknown; checks: unknown[] }) => { const t = make(); onChange({ config: t.config, checks: t.checks, scoring: "proportional" }); };
  const taskIds = [...classes, ...sels].map(t => String(t.id));
  const used = (id: string) => list.some(k => k.taskId === id);
  const kinds = [...(balance ? ["rxn.balanced", "rxn.lowest", "rxn.element", "rxn.coefficient", ...(charged ? ["rxn.charge"] : [])] : []), ...(classes.length ? ["rxn.classification"] : []), ...(sels.length ? ["rxn.selection"] : [])];
  const open = termIds.filter(id => !locked.includes(id));
  const checkFor = (kind: string, id: string): Obj => {
    const base = { id, label: KIND_LABEL[kind], weight: 1, kind };
    switch (kind) {
      case "rxn.element": return { ...base, element: elements[0] ?? "H" };
      case "rxn.coefficient": return { ...base, termId: open[0] ?? "r1" };
      case "rxn.classification": return { ...base, taskId: String(classes[0]?.id ?? "") };
      case "rxn.selection": return { ...base, taskId: String(sels[0]?.id ?? "") };
      default: return base;
    }
  };
  const suggested = (): Obj[] => [
    ...(balance ? [{ id: "balanced", label: "المعادلة موزونة", weight: 2, kind: "rxn.balanced" }, { id: "lowest", label: "أصغر معاملات صحيحة", weight: 1, kind: "rxn.lowest" }, ...(charged ? [{ id: "charge", label: "الشحنة محفوظة", weight: 1, kind: "rxn.charge" }] : [])] : []),
    ...classes.map(t => ({ id: "class-" + String(t.id), label: String(t.label), weight: 1, kind: "rxn.classification", taskId: t.id })),
    ...sels.map(t => ({ id: "sel-" + String(t.id), label: String(t.label), weight: 1, kind: "rxn.selection", taskId: t.id }))
  ];
  /** What the trusted solver / catalog derives for a check (teacher only). */
  const expectedText = (k: Obj): string => {
    if (!cfg) return "أصلح إعداد السؤال لعرض الإجابة المتوقعة.";
    const r = chemistryReactionsPluginV1.validateCheck(k, cfg);
    return r.ok ? expectedRxnText(r.check as RxnCheck, cfg) : r.issues[0]?.message ?? "فحص غير صالح.";
  };
  const solver = resolved.ok ? balanceReaction(resolved.reaction) : null;
  return (
    <div className="chem-editor rxn-editor" data-testid="rxn-editor" dir="rtl">
      <fieldset>
        <legend>القوالب الصفية</legend>
        <label><span>تطبيق قالب كامل (المعادلة والمهام والفحوص)</span>
          <select value="" disabled={disabled} data-testid="rxn-template" onChange={e => { const t = RXN_TEMPLATES[e.target.value]; if (t) applyTemplate(t.make); }}>
            <option value="">— اختر قالبًا —</option>
            {Object.entries(RXN_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>المعادلة</legend>
        <div className="chem-row" role="radiogroup" aria-label="مصدر المعادلة">
          <label className="chem-inline"><input type="radio" name="rxn-source" checked={!isCustom} disabled={disabled} data-testid="rxn-source-catalog" onChange={() => setReaction({ catalog: cat?.id ?? "waterFormation" })} /><span>تفاعل من الفهرس الموثّق (مصادر علمية مفتوحة)</span></label>
          <label className="chem-inline"><input type="radio" name="rxn-source" checked={isCustom} disabled={disabled} data-testid="rxn-source-custom" onChange={() => setReaction({ custom: { reactants: [emptyTerm()], products: [emptyTerm()] } })} /><span>معادلة أكتبها بنفسي</span></label>
        </div>
        {!isCustom && <label><span>التفاعل</span>
          <select value={show(reaction.catalog)} disabled={disabled} data-testid="rxn-catalog" onChange={e => setReaction({ catalog: e.target.value })}>
            {REACTION_LEVELS.map(level => <optgroup key={level} label={REACTION_LEVEL_LABEL[level]}>
              {REACTION_CATALOG.filter(r => r.level === level).map(r => <option key={r.id} value={r.id}>{r.nameAr} — {equationText(catalogReactionV1(r)!, null)}</option>)}
            </optgroup>)}
          </select>
        </label>}
        {isCustom && <div className="rxn-custom" data-testid="rxn-custom">
          {(["reactants", "products"] as const).map(side => (
            <div key={side} className="rxn-custom-side">
              <p className="chem-task-label">{side === "reactants" ? "المتفاعلات" : "النواتج"}</p>
              <ul>
                {rows(side).map((t, i) => {
                  const p = parseFormula(t.formula);
                  return (
                    <li key={i} data-testid={"rxn-custom-" + side}>
                      <label><span>الصيغة</span><SmartSimDraftInput dir="ltr" maxLength={64} value={t.formula} disabled={disabled} placeholder="مثل Fe2O3 أو Ca(OH)2"
                        parse={text => { const q = parseFormula(text); return q.ok ? q.text : text; }} onValue={v => setRows(side, rows(side).map((x, k) => (k === i ? { ...x, formula: v } : x)))} />
                        <small className={p.ok || !show(t.formula) ? "chem-note" : "chem-error"}>{!show(t.formula) ? "" : p.ok ? termText({ formula: p.text, charge: Number(t.charge) || 0, state: null }) : p.message}</small></label>
                      <label><span>الشحنة</span><select value={Number(t.charge) || 0} disabled={disabled} onChange={e => setRows(side, rows(side).map((x, k) => (k === i ? { ...x, charge: Number(e.target.value) } : x)))}>
                        {CHARGES.map(q => <option key={q} value={q}>{chargeLabel(q)}</option>)}</select></label>
                      <label><span>الحالة</span><select value={show(t.state)} disabled={disabled} onChange={e => setRows(side, rows(side).map((x, k) => (k === i ? { ...x, state: e.target.value || null } : x)))}>
                        <option value="">بلا رمز</option>{REACTION_STATES.map(s => <option key={s} value={s}>({s}) {REACTION_STATE_LABEL[s]}</option>)}</select></label>
                      <button type="button" className="is-secondary" disabled={disabled || rows(side).length <= 1} onClick={() => setRows(side, rows(side).filter((_, k) => k !== i))}>حذف</button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="is-secondary" disabled={disabled || rows(side).length >= REACTION_LIMITS.termsPerSide || rows("reactants").length + rows("products").length >= REACTION_LIMITS.totalTerms}
                onClick={() => setRows(side, [...rows(side), emptyTerm()])}>+ مادة</button>
            </div>
          ))}
          <p className="chem-note">لا يُستنتج نوع التفاعل ولا العامل المؤكسد أو الحمض من شكل الصيغ: هذه المهام متاحة لتفاعلات الفهرس فقط. المعادلة تُقبل إذا كان لها وزن وحيد بأعداد صحيحة موجبة.</p>
        </div>}
        <div className="rxn-info" data-testid="rxn-reaction-info" role={resolved.ok ? undefined : "alert"}>
          {!resolved.ok ? <p className="chem-error">{resolved.issue.message}</p> : solver && solver.ok ? <>
            <p className="chem-expected">الوزن الصحيح (للمعلم فقط): <span className="rxn-ltr rxn-formula" data-testid="rxn-teacher-balanced">{equationText(resolved.reaction, solver.coefficients, { states: true })}</span></p>
            {cat && <>
              <p className="chem-note">الأنواع: {REACTION_FAMILIES.filter(f => familyStatus(cat, f) === "yes").map(f => REACTION_FAMILY_LABEL[f]).join("، ") || "—"}
                {cat.contested.length > 0 && <> · مختلف عليه بين المناهج: {cat.contested.map(f => REACTION_FAMILY_LABEL[f]).join("، ")}</>}</p>
              {cat.notes.map((n, i) => <p key={i} className="chem-help">{n}</p>)}
              <details><summary>المصادر</summary><ul>{cat.sources.map(s => <li key={s} className="rxn-source" dir="ltr">{REACTION_SOURCES[s]}</li>)}</ul></details>
            </>}
          </> : solver && !solver.ok ? <p className="chem-error">{BALANCE_FAILURE_MESSAGE[solver.code]}</p> : null}
        </div>
      </fieldset>
      <fieldset>
        <legend>ما يُسمح للطالب برؤيته</legend>
        <label className="chem-inline"><input type="checkbox" checked={view.conservation === true} disabled={disabled} data-testid="rxn-view-conservation" onChange={e => setConfig({ view: { ...view, conservation: e.target.checked } })} /><span>جدول حفظ الذرات المباشر (يُظهر للطالب هل المعادلة موزونة — مناسب للتدريب، أخفِه في الاختبار)</span></label>
        <label className="chem-inline"><input type="checkbox" checked={view.particles === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, particles: e.target.checked } })} /><span>صورة الجسيمات (عدد الجسيمات حسب المعاملات) وعرض ثلاثي الأبعاد للجزيئات المعروفة</span></label>
        <label className="chem-inline"><input type="checkbox" checked={view.states === true} disabled={disabled} onChange={e => setConfig({ view: { ...view, states: e.target.checked } })} /><span>رموز الحالة (s) (l) (g) (aq)</span></label>
        <label className="chem-inline"><input type="checkbox" checked={view.names === true} disabled={disabled || isCustom} onChange={e => setConfig({ view: { ...view, names: e.target.checked } })} /><span>أسماء المواد واسم التفاعل (تفاعلات الفهرس)</span></label>
      </fieldset>
      <fieldset>
        <legend>مهام الطالب</legend>
        <label className="chem-inline"><input type="checkbox" checked={!!balance} disabled={disabled} data-testid="rxn-task-balance" onChange={e => setTasks({ balance: e.target.checked ? { locked: [] } : null })} /><span>وزن المعادلة (يكتب الطالب المعاملات)</span></label>
        {balance && termIds.length > 0 && <div className="chem-row" role="group" aria-label="المعاملات المعطاة للطالب">
          <span>معاملات معطاة (تظهر للطالب ولا يغيّرها):</span>
          {termIds.map((id, i) => <label key={id} className="chem-inline"><input type="checkbox" checked={locked.includes(id)} disabled={disabled || (!locked.includes(id) && locked.length >= termIds.length - 1)}
            onChange={e => setTasks({ balance: { locked: e.target.checked ? [...locked, id] : locked.filter(x => x !== id) } })} /><span className="rxn-ltr">{termNames[i]}</span></label>)}
        </div>}
        <ul aria-label="مهام التصنيف">
          {classes.map((t, i) => {
            const options = Array.isArray(t.options) ? (t.options as string[]) : [];
            return (
              <li key={String(t.id) + i} data-testid="rxn-editor-classification">
                <label><span>نص مهمة التصنيف {i + 1}</span><input value={show(t.label)} maxLength={RXN_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks({ classifications: classes.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></label>
                <label><span>نوع الاختيار</span><select value={show(t.mode)} disabled={disabled} onChange={e => setTasks({ classifications: classes.map((x, k) => (k === i ? { ...x, mode: e.target.value } : x)) })}>
                  <option value="single">خيار واحد صحيح</option><option value="multiple">اختيار كل ما ينطبق</option></select></label>
                <fieldset className="rxn-options"><legend>الخيارات المعروضة</legend>
                  {REACTION_FAMILIES.map(f => <label key={f} className="chem-inline"><input type="checkbox" checked={options.includes(f)} disabled={disabled}
                    onChange={e => setTasks({ classifications: classes.map((x, k) => (k === i ? { ...x, options: e.target.checked ? [...options, f] : options.filter(o => o !== f) } : x)) })} />
                    <span>{REACTION_FAMILY_LABEL[f]} {cat && <small className={"rxn-status-" + familyStatus(cat, f)}>{STATUS_MARK[familyStatus(cat, f)]}</small>}</span></label>)}
                </fieldset>
                <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} title={used(String(t.id)) ? "يستخدمه فحص؛ احذف الفحص أولًا" : undefined} onClick={() => setTasks({ classifications: classes.filter((_, k) => k !== i) })}>حذف</button>
              </li>
            );
          })}
          {sels.map((t, i) => {
            const role = String(t.role), terms = resolved.ok && (REACTION_ROLES as readonly string[]).includes(role) ? roleTerms({ reaction: resolved.reaction, catalog: resolved.catalog, termIds }, role as ReactionRole) : null;
            return (
              <li key={String(t.id) + i} data-testid="rxn-editor-selection">
                <label><span>نص مهمة الاختيار {i + 1}</span><input value={show(t.label)} maxLength={RXN_LIMITS.labelChars} disabled={disabled} onChange={e => setTasks({ selections: sels.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></label>
                <label><span>الدور</span><select value={role} disabled={disabled} onChange={e => setTasks({ selections: sels.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)) })}>
                  {REACTION_ROLES.filter(r => cat || !CATALOG_ONLY_ROLES.includes(r)).map(r => <option key={r} value={r}>{REACTION_ROLE_LABEL[r]}</option>)}</select></label>
                <p className="chem-expected">المتوقع: <span className="rxn-ltr">{terms === null ? "غير متاح لهذه المعادلة" : terms.length ? terms.map(id => termNames[termIds.indexOf(id)]).join("، ") : "لا توجد مادة بهذا الدور"}</span></p>
                <button type="button" className="is-secondary" disabled={disabled || used(String(t.id))} onClick={() => setTasks({ selections: sels.filter((_, k) => k !== i) })}>حذف</button>
              </li>
            );
          })}
        </ul>
        <div className="chem-row">
          {cat && <button type="button" className="is-secondary" data-testid="rxn-add-classification" disabled={disabled || classes.length >= RXN_LIMITS.classifications}
            onClick={() => setTasks({ classifications: [...classes, { id: nextId(taskIds, "class"), label: "نوع هذا التفاعل", mode: "single", options: REACTION_FAMILIES.filter(f => familyStatus(cat, f) !== "contested").slice(0, 4) }] })}>+ تصنيف</button>}
          <button type="button" className="is-secondary" data-testid="rxn-add-selection" disabled={disabled || sels.length >= RXN_LIMITS.selections}
            onClick={() => setTasks({ selections: [...sels, { id: nextId(taskIds, "select"), label: "اختر المواد التي هي عناصر", role: "element" }] })}>+ اختيار</button>
        </div>
      </fieldset>
      {!valid.ok && <div className="rxn-issues" role="alert" data-testid="rxn-issues"><p className="chem-error">مشكلات تمنع النشر:</p><ul>{valid.issues.slice(0, 6).map((x, i) => <li key={i} className="chem-error">{x.message}</li>)}</ul></div>}
      <fieldset>
        <legend>الفحوص الخاصة (لا تصل إلى الطالب)</legend>
        <label><span>طريقة احتساب العلامة</span>
          <select value={scoring === "allOrNothing" ? "allOrNothing" : "proportional"} disabled={disabled} onChange={e => onChange({ scoring: e.target.value })}>
            <option value="proportional">جزئية حسب الأوزان</option><option value="allOrNothing">كل شيء أو لا شيء</option>
          </select>
        </label>
        <ul aria-label="الفحوص">
          {list.map((k, i) => {
            const kind = String(k.kind);
            return (
              <li key={String(k.id) + i} data-testid="rxn-check">
                <label><span>نوع الفحص {i + 1}</span><select value={kind} disabled={disabled} onChange={e => onChange({ checks: list.map((x, j) => (j === i ? checkFor(e.target.value, String(x.id)) : x)) })}>
                  {[...new Set([kind, ...kinds])].map(o => <option key={o} value={o}>{KIND_LABEL[o] ?? o}</option>)}</select></label>
                <label><span>الوصف</span><input value={show(k.label)} disabled={disabled} onChange={e => setCheck(i, { label: e.target.value })} /></label>
                {kind === "rxn.element" && <label><span>العنصر</span><select value={show(k.element)} disabled={disabled} onChange={e => setCheck(i, { element: e.target.value })}>{elements.map(el => <option key={el} value={el}>{el} — {chemElement(el)?.nameAr}</option>)}</select></label>}
                {kind === "rxn.coefficient" && <label><span>المادة</span><select value={show(k.termId)} disabled={disabled} onChange={e => setCheck(i, { termId: e.target.value })}>{open.map(id => <option key={id} value={id}>{termNames[termIds.indexOf(id)]}</option>)}</select></label>}
                {kind === "rxn.classification" && <label><span>مهمة التصنيف</span><select value={show(k.taskId)} disabled={disabled} onChange={e => setCheck(i, { taskId: e.target.value })}>{classes.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>}
                {kind === "rxn.selection" && <label><span>مهمة الاختيار</span><select value={show(k.taskId)} disabled={disabled} onChange={e => setCheck(i, { taskId: e.target.value })}>{sels.map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.label)}</option>)}</select></label>}
                <label><span>الوزن</span><SmartSimDraftInput dir="ltr" inputMode="decimal" value={k.weight} disabled={disabled} onValue={v => setCheck(i, { weight: v })} /></label>
                <p className="chem-expected" data-testid="rxn-check-expected">المتوقع (محسوب من المحلل والفهرس الموثّق): <span className="rxn-ltr">{expectedText(k)}</span></p>
                <button type="button" className="is-secondary" disabled={disabled} onClick={() => onChange({ checks: list.filter((_, j) => j !== i) })}>حذف الفحص</button>
              </li>
            );
          })}
        </ul>
        <div className="chem-row">
          <button type="button" className="is-secondary" disabled={disabled || kinds.length === 0} onClick={() => onChange({ checks: [...list, checkFor(kinds[0], nextId(list.map(k => String(k.id)), "check-"))] })}>+ فحص</button>
          <button type="button" className="is-secondary" data-testid="rxn-suggest-checks" disabled={disabled || kinds.length === 0} onClick={() => onChange({ checks: suggested() })}>اقتراح فحوص لكل المهام (يستبدل الحالية)</button>
        </div>
        {ctx && cfg && cfg.tasks.classifications.some(t => !expectedFamilies(ctx, t)?.length) && <p className="chem-error">مهمة تصنيف بلا إجابة معرّفة.</p>}
      </fieldset>
      <details className="chem-preview" data-testid="rxn-preview" onToggle={e => { if ((e.target as HTMLDetailsElement).open) setPreview(n => n + 1); }}>
        <summary>معاينة ما يراه الطالب (لا تُحفظ)</summary>
        {!valid.ok ? <p className="chem-note">أصلح الإعداد لعرض المعاينة: {valid.issues[0]?.message}</p> : preview > 0 ? <PreviewHost key={preview} config={valid.config} /> : null}
      </details>
    </div>
  );
}
function PreviewHost({ config }: { config: unknown }) {
  const [actions, setActions] = useState<unknown[]>([]);
  return <RxnWorkspace config={config} actions={actions} onChange={a => setActions(a)} label="معاينة" preview />;
}
