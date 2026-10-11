import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { rxnContext, validateRxnConfig, type RxnConfigV1, type RxnContext } from "../chemistryReactionsModel";
import { initialRxnState, studentCoefficients, type RxnStateV1 } from "../chemistryReactionsPlugin";
import { resolveSmartSimPlugin } from "../trustedSimPlugins";
import { replaySmartSimActions } from "../trustedSimQuestion";
import { REACTION_LIMITS, conservationTable, termText, type ReactionTerm } from "../chemistry/reactions";
import { REACTION_FAMILIES, REACTION_FAMILY_LABEL, REACTION_LEVEL_LABEL, REACTION_STATE_LABEL, type CatalogTerm } from "../chemistry/reactionCatalog";
import MoleculeView3D from "../chemistryStructure/MoleculeView3D";
import ConservationPanel from "./ConservationPanel";
import ParticleView from "./ParticleView";
import { termMolecule } from "./rxnView";
import "../chemistryStructure/chem.css";
import "./rxn.css";

// Phase 21D-D.2 — the chemistryReactions@1 STUDENT workspace (lazy; also the teacher preview). It renders ONLY the canonical public config.
//   * Answers: every coefficient typed or stepped, every family chosen and every term selected is a SEMANTIC action replayed through the
//     registered plugin (the code the server uses); the action list keeps one decision per target, and clearing a decision removes it.
//   * Presentation (never recorded): the live atom-conservation table (only when the teacher allows it), the particle picture, the 3D view of
//     catalog molecules, names and state symbols.
// The equation is an LTR island (as in printed Arabic chemistry textbooks); every instruction around it is RTL.
const replayState = (cfg: RxnConfigV1, actions: readonly unknown[]): { ok: true; state: RxnStateV1 } | { ok: false } => {
  const plugin = resolveSmartSimPlugin("chemistryReactions", 1), r = plugin ? replaySmartSimActions(plugin, cfg, actions) : null;
  return r && r.ok ? { ok: true, state: r.state as RxnStateV1 } : { ok: false };
};
type Act = { type?: string; termId?: string; taskId?: string };
/** One decision per target: a coefficient per term, a classification per task, a selection per (task, term). */
const targetOf = (a: unknown): string => {
  const x = (a && typeof a === "object" ? a : {}) as Act, t = x.type ?? "";
  if (t.startsWith("coefficient.")) return "coef:" + x.termId;
  if (t.startsWith("reaction.")) return "class:" + x.taskId;
  if (t.startsWith("species.")) return "sel:" + x.taskId + ":" + x.termId;
  return t;
};
const MAX = REACTION_LIMITS.coefficientMax;
const parseCoefficient = (text: string): number | null | undefined => {
  const t = text.trim();
  if (!t) return null;
  if (!/^[0-9]{1,3}$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 && n <= MAX ? n : undefined;
};

function CoefficientInput({ term, value, locked, disabled, onValue, testId }: { term: ReactionTerm; value: number | null; locked: boolean; disabled?: boolean; onValue: (v: number | null) => void; testId: string }) {
  const name = termText(term);
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [sent, setSent] = useState<number | null>(value);
  if (value !== sent) { setSent(value); setDraft(value === null ? "" : String(value)); }
  const parsed = parseCoefficient(draft);
  const commit = (v: number | null) => { setSent(v); setDraft(v === null ? "" : String(v)); onValue(v); };
  const step = (d: number) => { const cur = value ?? 0, next = Math.min(MAX, Math.max(1, cur + d)); if (next !== value) commit(next); };
  if (locked) return <span className="rxn-coef is-locked" data-testid={testId} title="معامل معطى" aria-label={"معامل " + name + " معطى: " + value}><b>{value}</b><span aria-hidden="true">🔒</span></span>;
  return (
    <span className={"rxn-coef" + (parsed === undefined ? " is-invalid" : "")} data-testid={testId}>
      <button type="button" tabIndex={-1} className="rxn-step" aria-label={"إنقاص معامل " + name} disabled={disabled || value === null || value <= 1} onClick={() => step(-1)}>−</button>
      <input type="text" inputMode="numeric" dir="ltr" autoComplete="off" spellCheck={false} maxLength={3} placeholder="?" value={draft} disabled={disabled}
        aria-label={"معامل " + name} aria-invalid={parsed === undefined || undefined} aria-describedby={parsed === undefined ? testId + "-err" : undefined}
        onChange={e => { const t = e.target.value, p = parseCoefficient(t); setDraft(t); if (p !== undefined) { setSent(p); onValue(p); } }}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "ArrowUp") { e.preventDefault(); step(1); } else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); } }} />
      <button type="button" tabIndex={-1} className="rxn-step" aria-label={"زيادة معامل " + name} disabled={disabled || (value ?? 0) >= MAX} onClick={() => step(1)}>+</button>
      {parsed === undefined && <span id={testId + "-err"} className="rxn-err" role="alert">عدد صحيح من 1 إلى {MAX}</span>}
    </span>
  );
}

function Equation({ cfg, ctx, state, disabled, onCoefficient }: { cfg: RxnConfigV1; ctx: RxnContext; state: RxnStateV1; disabled?: boolean; onCoefficient: (termId: string, v: number | null) => void }) {
  const terms = [...ctx.reaction.reactants, ...ctx.reaction.products], n = ctx.reaction.reactants.length;
  const locked = cfg.tasks.balance?.locked ?? [], coeffs = studentCoefficients(state, cfg), names = cfg.view.names ? catalogTerms(ctx) : undefined;
  const cell = (t: ReactionTerm, i: number) => {
    const id = ctx.termIds[i];
    return (
      <span className="rxn-term" key={id} data-term={id}>
        <span className="rxn-term-main">
          {cfg.tasks.balance ? <CoefficientInput term={t} value={coeffs[i]} locked={locked.includes(id)} disabled={disabled} testId={"rxn-coef-" + id} onValue={v => onCoefficient(id, v)} /> : null}
          <span className="rxn-formula">{termText(t)}{cfg.view.states && t.state && <small className="rxn-state" title={REACTION_STATE_LABEL[t.state]}>({t.state})</small>}</span>
        </span>
        {names?.[i] && <small className="rxn-name" dir="rtl">{names[i].nameAr}</small>}
      </span>
    );
  };
  return (
    <div className="rxn-equation" dir="ltr" data-testid="rxn-equation" role="group" aria-label="المعادلة الكيميائية: اكتب المعامل أمام كل مادة">
      {terms.slice(0, n).map((t, i) => [i > 0 && <span key={"p" + i} className="rxn-plus" aria-hidden="true">+</span>, cell(t, i)])}
      <span className="rxn-arrow" aria-label="ينتج">→</span>
      {terms.slice(n).map((t, i) => [i > 0 && <span key={"q" + i} className="rxn-plus" aria-hidden="true">+</span>, cell(t, n + i)])}
    </div>
  );
}
const catalogTerms = (ctx: RxnContext): CatalogTerm[] | undefined => (ctx.catalog ? [...ctx.catalog.reactants, ...ctx.catalog.products] : undefined);

export default function RxnWorkspace({ config: rawConfig, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<RxnConfigV1 | null>(() => { const r = validateRxnConfig(rawConfig); return r.ok ? r.config : null; }, [rawConfig]);
  const replay = useMemo(() => (cfg ? replayState(cfg, actions) : null), [cfg, actions]);
  const [confirm, setConfirm] = useState(false);
  const [model3d, setModel3d] = useState<string | null>(null);
  const uid = useId();
  if (!cfg) return <p className="ncli-unavailable" role="note" data-testid="rxn-unavailable">إعداد محاكاة التفاعلات لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const ctx = rxnContext(cfg);
  const state: RxnStateV1 = replay && replay.ok ? replay.state : initialRxnState();
  const base = replay && replay.ok ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayState(cfg, next); if (r.ok) onChange(next, r.state); };
  const decide = (target: string, action: Record<string, unknown> | null) => emit([...base.filter(a => targetOf(a) !== target), ...(action ? [action] : [])]);
  const coeffs = studentCoefficients(state, cfg), table = conservationTable(ctx.reaction, coeffs);
  const terms = [...ctx.reaction.reactants, ...ctx.reaction.products];
  const molecules = [...new Map(terms.map(t => termMolecule(t)).filter(m => !!m).map(m => [m!.id, m!])).values()];
  const shown = model3d ? molecules.find(m => m.id === model3d) : undefined;
  const cat = ctx.catalog;
  const hasCoefficients = Object.keys(state.coefficients).length > 0;
  return (
    <div className="chem rxn" dir="rtl" data-testid="rxn-workspace" aria-label={(label ? label + " — " : "") + "التفاعلات والمعادلات الكيميائية"}>
      <p className="chem-note">
        {cat && cfg.view.names && <><strong>{cat.nameAr}</strong> <small className="rxn-level">({REACTION_LEVEL_LABEL[cat.level]})</small> — </>}
        {cfg.tasks.balance ? "اكتب أصغر أعداد صحيحة أمام المواد حتى يتساوى عدد ذرات كل عنصر (والشحنة الكلية) في الجهتين. لا تغيّر الأرقام الصغيرة داخل الصيغ." : "تأمل المعادلة وأجب عن المهام."}
      </p>
      <Equation cfg={cfg} ctx={ctx} state={state} disabled={disabled} onCoefficient={(id, v) => decide("coef:" + id, v === null ? null : { type: "coefficient.set", termId: id, value: v })} />
      {cfg.tasks.balance && !disabled && (
        <div className="chem-row">
          <button type="button" className="is-secondary" data-testid="rxn-reset-coefficients" disabled={!hasCoefficients} onClick={() => emit(base.filter(a => !targetOf(a).startsWith("coef:")))}>مسح المعاملات</button>
          <span className="chem-help">لوحة المفاتيح: السهمان ↑ و↓ داخل خانة المعامل يزيدانه أو ينقصانه.</span>
        </div>
      )}
      {cfg.view.conservation && cfg.tasks.balance && <ConservationPanel table={table} />}
      {cfg.view.particles && <ParticleView reaction={ctx.reaction} coefficients={coeffs} catalogTerms={catalogTerms(ctx)} />}
      {cfg.view.particles && molecules.length > 0 && (
        <div className="rxn-3d" data-testid="rxn-3d">
          <div className="chem-row" role="group" aria-label="عرض جزيء ثلاثي الأبعاد">
            <span>عرض ثلاثي الأبعاد:</span>
            {molecules.map(m => <button key={m.id} type="button" aria-pressed={model3d === m.id} data-testid={"rxn-3d-" + m.id} onClick={() => setModel3d(v => (v === m.id ? null : m.id))}>{m.nameAr} <span className="rxn-ltr">{termText({ formula: m.formula, charge: 0, state: null })}</span></button>)}
          </div>
          {shown && <MoleculeView3D molecule={shown} measure={false} lonePairsAllowed={false} showFormula />}
        </div>
      )}
      <div className="chem-tasks">
        {cfg.tasks.classifications.map(t => {
          const chosen = state.classifications[t.id] ?? [];
          const set = (families: string[]) => decide("class:" + t.id, families.length ? { type: "reaction.classify", taskId: t.id, families: REACTION_FAMILIES.filter(f => families.includes(f)) } : null);
          return (
            <fieldset key={t.id} className="chem-task" data-testid="rxn-classification" data-id={t.id}>
              <legend>{t.label}{t.mode === "multiple" && <small> (اختر كل ما ينطبق)</small>}</legend>
              <div className="chem-options" role={t.mode === "single" ? "radiogroup" : "group"} aria-label={t.label}>
                {t.options.map(f => (
                  <label key={f} className="chem-option">
                    <input type={t.mode === "single" ? "radio" : "checkbox"} name={uid + "-" + t.id} value={f} checked={chosen.includes(f)} disabled={disabled}
                      onChange={e => set(t.mode === "single" ? [f] : e.target.checked ? [...chosen, f] : chosen.filter(x => x !== f))} />{REACTION_FAMILY_LABEL[f]}
                  </label>
                ))}
              </div>
              {!disabled && chosen.length > 0 && <button type="button" className="is-secondary" onClick={() => set([])}>مسح الاختيار</button>}
            </fieldset>
          );
        })}
        {cfg.tasks.selections.map(t => {
          const picked = state.selections[t.id] ?? [];
          return (
            <fieldset key={t.id} className="chem-task" data-testid="rxn-selection" data-id={t.id}>
              <legend>{t.label}</legend>
              <div className="rxn-chips" role="group" aria-label={t.label}>
                {ctx.termIds.map((id, i) => (
                  <button key={id} type="button" className="rxn-chip" aria-pressed={picked.includes(id)} disabled={disabled} data-pick={id}
                    onClick={() => decide("sel:" + t.id + ":" + id, picked.includes(id) ? null : { type: "species.select", taskId: t.id, termId: id })}>
                    <span className="rxn-ltr">{termText(terms[i])}</span>{cfg.view.names && cat && <small> {catalogTerms(ctx)![i].nameAr}</small>}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      <p className="chem-help rxn-disclaimer">المعادلة الموزونة تحقق حفظ الذرات والشحنة فقط؛ الوزن وحده لا يثبت أن التفاعل يحدث فعلًا في الواقع. هذه محاكاة للتعلّم: لا تُجرِ أي تفاعل دون إشراف مختص.</p>
      {!disabled && (
        <div className="chem-row">
          {confirm
            ? <><button type="button" className="is-danger" onClick={() => { setConfirm(false); emit([]); }}>تأكيد مسح كل الإجابات</button><button type="button" className="is-secondary" onClick={() => setConfirm(false)}>إلغاء</button></>
            : <button type="button" className="is-secondary" onClick={() => setConfirm(true)} disabled={base.length === 0}>مسح كل الإجابات</button>}
        </div>
      )}
    </div>
  );
}
