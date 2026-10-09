import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { CHART_KINDS, validateChartSpec, type ChartKind, type ChartSpecV1 } from "../../charts/chartSpec";
import { CHART_SELECTION_MODES, RANGE_TARGET_KINDS, chartTargetKinds, chartTargets, isContiguousRun, type ChartSelectionMode, type ChartTargetKind } from "../../charts/chartData";
import { convertChartKind, defaultChart } from "../../charts/chartEditing";
import ChartEditor from "../../charts/ChartEditor";
import { useConfirm } from "../../ui/useConfirm";
import DataChart from "../../charts/DataChart";
import { CHART_SELECTION_LIMITS, TARGET_KIND_LABELS, validateChartSelectionQuestion, type ChartSelectionScoring } from "../../chartSelectionQuestion";

// Phase 21A.1 — chartSelection@1 authoring (lazy). Workflow: create the chart (kind → the table-like chart editor, no JSON, no engine
// options) → what the student selects (target kind, single / multiple / range, the bound, an optional instruction) → the correct target(s),
// chosen ON THE CHART ITSELF through the same semantic selection surface the student uses → the scoring. Changing the chart prunes key
// entries whose target no longer exists; a kind change that cannot keep the chart's data asks first (the same confirmation as the rich-content
// chart editor), and only the kinds a student can answer on are offered (a heat map has no selectable target). The canonical validation is
// shown inline.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KIND_LABELS: Readonly<Record<ChartKind, string>> = Object.freeze({ bar: "أعمدة / أشرطة", line: "خطي", area: "مساحي", combo: "مركّب", pie: "دائري / حلقي", scatter: "انتشاري", histogram: "مدرّج تكراري", radar: "راداري", boxplot: "صندوقي", heatmap: "خريطة حرارية" });
const MODE_LABELS: Readonly<Record<ChartSelectionMode, string>> = Object.freeze({ single: "اختيار واحد", multiple: "اختيار متعدد", range: "نطاق متصل" });
const SELECTABLE_KINDS = CHART_KINDS.filter(k => k !== "heatmap");
/** The targets of a chart as its structure stands — also while it is invalid (an empty title, a cell being typed); null when even the
 *  structure cannot be read. */
function structuralTargets(c: ChartSpecV1, t: ChartTargetKind): { key: string; label: string }[] | null {
  const v = validateChartSpec(c);
  if (v.ok) return chartTargetKinds(v.value).includes(t) ? chartTargets(v.value, t) : [];
  try { return (CHART_KINDS as readonly unknown[]).includes(c.kind) && chartTargetKinds(c).includes(t) ? chartTargets(c, t) : []; } catch { return null; }
}
/** A datum key ("seriesId/categoryId") whose series and category still exist: its value may be empty while the teacher retypes the cell
 *  (validation reports the key meanwhile) — the entry is kept, never dropped. */
function datumSlot(c: ChartSpecV1, key: string): boolean {
  const [s, cat] = key.split("/"), r = c as { series?: unknown; categories?: unknown };
  return Array.isArray(r.series) && Array.isArray(r.categories) && r.series.some(x => isObj(x) && x.id === s) && r.categories.some(x => isObj(x) && x.id === cat);
}
/** The series and category labels of a datum key (undefined when its slot does not exist). */
function datumLabels(c: ChartSpecV1, key: string): string | undefined {
  const [s, cat] = key.split("/"), r = c as { series?: unknown; categories?: unknown };
  if (!Array.isArray(r.series) || !Array.isArray(r.categories)) return undefined;
  const sl = r.series.find(x => isObj(x) && x.id === s), cl = r.categories.find(x => isObj(x) && x.id === cat);
  return isObj(sl) && isObj(cl) ? String(sl.label) + "\u0000" + String(cl.label) : undefined;
}
/** Every datum slot of a chart (series × categories), filled or not. */
const datumSlotCount = (c: ChartSpecV1) => { const r = c as { series?: unknown; categories?: unknown }; return Array.isArray(r.series) && Array.isArray(r.categories) ? r.series.length * r.categories.length : 0; };
/** Every id written anywhere in a (possibly broken) chart. */
function idsIn(raw: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(raw)) for (const x of raw) idsIn(x, out);
  else if (isObj(raw)) for (const [k, x] of Object.entries(raw)) { if (k === "id" && typeof x === "string") out.add(x); else idsIn(x, out); }
  return out;
}

export default function ChartSelectionEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const raw = isObj((node as { chartSelection?: unknown }).chartSelection) ? ((node as { chartSelection: Record<string, unknown> }).chartSelection) : {};
  const chart = isObj(raw.chart) ? (raw.chart as unknown as ChartSpecV1) : null;
  const target = (typeof raw.target === "string" ? raw.target : "category") as ChartTargetKind;
  const mode = (typeof raw.mode === "string" ? raw.mode : "single") as ChartSelectionMode;
  const max = typeof raw.maxSelections === "number" ? raw.maxSelections : 1;
  const label = typeof raw.label === "string" ? raw.label : "";
  const key = isObj(node.answer) ? (node.answer as Record<string, unknown>) : {};
  const scoring: ChartSelectionScoring = key.scoring === "partial" ? "partial" : "allOrNothing";
  const correct = useMemo(() => (Array.isArray(key.correct) ? (key.correct as unknown[]).filter((k): k is string => typeof k === "string") : []), [key.correct]);
  const valid = useMemo(() => (chart ? validateChartSpec(chart) : null), [chart]);
  const kinds = useMemo(() => (valid?.ok ? chartTargetKinds(valid.value) : []), [valid]);
  const targets = useMemo(() => (valid?.ok && kinds.includes(target) ? chartTargets(valid.value, target) : []), [valid, kinds, target]);
  const issues = useMemo(() => validateChartSelectionQuestion(node as unknown as Record<string, unknown>), [node]);
  // key entries of datum cells being retyped: the picker carries them through a click and leaves them their place in the bound (R5-A6)
  const pendingKey = useMemo(() => (chart && target === "datum" && targets.length ? correct.filter(k => !targets.some(x => x.key === k) && datumSlot(chart, k)) : []), [chart, target, targets, correct]);
  const [newKind, setNewKind] = useState<ChartKind>("bar");
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /** One emission's content: the public config and the key together, kept mutually consistent — unsupported target / mode adjusted, bound
   *  clamped, a broken range cleared, and the key NEVER pointing at a target it did not mean (round-3 findings R3-A4 / B3-3):
   *  - a target kind the chart no longer offers is replaced by its first one and the key is cleared (the same id may name a different
   *    target in the new kind: a category "jan" and a series "jan" can coexist);
   *  - a KIND change keeps a key entry only where the new kind has the same target with the same label, and never when the conversion
   *    starts from starter data (its ids and default labels, such as "s1" / "السلسلة 1", can recur with other data);
   *  - any other change drops key entries whose target is gone — read from the chart's structure even while it is invalid (a cell being
   *    typed, a gap between bins), so a deleted target's id, later reused for a new one, never inherits the key. */
  const resolve = (next: { chart?: ChartSpecV1; target?: ChartTargetKind; mode?: ChartSelectionMode; max?: number; label?: string; scoring?: ChartSelectionScoring; correct?: string[] }) => {
    const c = next.chart ?? chart;
    const v = c ? validateChartSpec(c) : null;
    const ks = c && (CHART_KINDS as readonly unknown[]).includes((c as { kind?: unknown }).kind) ? chartTargetKinds(c) : [];
    let t = next.target ?? target;
    const retargeted = ks.length > 0 && !ks.includes(t);
    if (retargeted) t = ks[0];
    let m = next.mode ?? mode;
    if (m === "range" && !RANGE_TARGET_KINDS.includes(t)) m = "multiple";
    const order = v?.ok && ks.includes(t) ? chartTargets(v.value, t).map(x => x.key) : [];
    let ok = retargeted ? [] : next.correct ?? correct;
    if (!retargeted && next.chart && c) {
      const now = structuralTargets(c, t);
      if (chart && next.chart.kind !== chart.kind) {
        let fresh = true;
        try { fresh = !!convertChartKind(chart, next.chart.kind).fresh; } catch { /* an unreadable chart: nothing carries over */ }
        const before = new Map((structuralTargets(chart, t) ?? []).map(x => [x.key, x.label] as const));
        const after = new Map((now ?? []).map(x => [x.key, x.label] as const));
        // a datum whose cell is being retyped is no target yet: it is kept where both kinds hold the same series and category (R5-A9)
        ok = fresh ? [] : ok.filter(k => (before.has(k) && after.get(k) === before.get(k))
          || (t === "datum" && datumLabels(chart, k) !== undefined && datumLabels(chart, k) === datumLabels(next.chart!, k)));
      } else if (now) ok = ok.filter(k => now.some(x => x.key === k) || (t === "datum" && datumSlot(c, k)));
      else { const present = idsIn(c); ok = ok.filter(k => k.split("/").every(part => present.has(part))); }
    }
    // datum entries whose cell is being retyped (no value yet, so not a target of the valid chart) stay after the chart's own order, and a
    // datum bound is clamped by the chart's SLOTS (series × categories), filled or not — neither the key nor the bound changes because a cell
    // was emptied, in the key or elsewhere (round-4 finding R4-A2; round-5 R5-A7); validation reports both while the cell is empty
    const pending = order.length && t === "datum" && c ? ok.filter(k => !order.includes(k) && datumSlot(c, k)) : [];
    let mx = m === "single" ? 1 : Math.max(1, Math.round(next.max ?? max));
    if (order.length) mx = Math.min(mx, t === "datum" && c ? Math.max(order.length, datumSlotCount(c)) : order.length);
    if (order.length) ok = [...order.filter(k => ok.includes(k)), ...pending];
    if (m === "single") ok = ok.slice(0, 1);
    if (m === "range" && ok.length && order.length && !isContiguousRun(order, ok)) ok = [];
    const sc = m === "single" ? "allOrNothing" : (next.scoring ?? scoring);
    const l = (next.label ?? label);
    return { chartSelection: { v: 1, ...(c ? { chart: c } : {}), target: t, mode: m, maxSelections: mx, ...(l.trim() ? { label: l } : {}) }, answer: { scoring: sc, correct: ok } };
  };
  const write = (next: Parameters<typeof resolve>[0]) => onChange(resolve(next) as never);
  /** What a kind change does to the key — the SAME computation as the emission (the warning can never disagree with what is stored). */
  const keyClearedBy = (next: ChartSpecV1): string | undefined => {
    if (!correct.length) return undefined;
    const kept = resolve({ chart: next }).answer.correct;
    if (kept.length === correct.length && kept.every(k => correct.includes(k))) return undefined;
    return kept.length === 0 ? "ستُمسح الإجابة الصحيحة المحدَّدة لأن عناصرها لا توجد في النوع الجديد، وعليك تحديدها من جديد."
      : "ستُحذف من الإجابة الصحيحة العناصر التي لا توجد في النوع الجديد، فراجع الإجابة الصحيحة بعد التغيير.";
  };

  return (
    <div className="qt-editor qt-editor-chartSelection" data-testid="qt-editor-chartSelection" dir="rtl">
      {!chart ? (
        <div className="vq-fields" role="group" aria-label="إنشاء الرسم البياني">
          <p className="vq-note">أنشئ الرسم البياني الذي سيختار منه الطالب، ثم أدخل بياناته في الجدول.</p>
          <label className="vq-field"><span>نوع الرسم</span>
            <select className="sb-input sb-input-sm" value={newKind} onChange={e => setNewKind(e.target.value as ChartKind)} disabled={disabled}>
              {SELECTABLE_KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <button type="button" className="sb-mini-btn" disabled={disabled} onClick={() => write({ chart: defaultChart(newKind) })}>إنشاء الرسم البياني</button>
        </div>
      ) : (
        <>
          <section aria-label="بيانات الرسم البياني"><ChartEditor chart={chart} name="الرسم" disabled={disabled} confirm={confirm} kinds={SELECTABLE_KINDS} kindChangeWarning={keyClearedBy} onChange={c => write({ chart: c })} /></section>
          <section className="vq-fields" aria-label="ما يختاره الطالب">
            <label className="vq-field"><span>يختار الطالب</span>
              <select className="sb-input sb-input-sm" aria-label="نوع العنصر الذي يختاره الطالب" value={target} disabled={disabled || kinds.length === 0} onChange={e => write({ target: e.target.value as ChartTargetKind, correct: [] })}>
                {kinds.map(k => <option key={k} value={k}>{TARGET_KIND_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="vq-field"><span>طريقة الاختيار</span>
              <select className="sb-input sb-input-sm" aria-label="طريقة الاختيار" value={mode} disabled={disabled} onChange={e => write({ mode: e.target.value as ChartSelectionMode })}>
                {CHART_SELECTION_MODES.filter(m => m !== "range" || RANGE_TARGET_KINDS.includes(target)).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
              </select>
            </label>
            {mode !== "single" && (
              <label className="vq-field"><span>أقصى عدد للاختيارات</span>
                <input className="sb-input sb-input-sm" type="number" min={1} max={Math.max(1, targets.length)} value={maxDraft ?? String(max)} aria-label="أقصى عدد للاختيارات" disabled={disabled}
                  onChange={e => {
                    const t = e.target.value, n = Number(t);
                    setMaxDraft(t);
                    if (t.trim() === "" || !Number.isInteger(n) || n < 1) return;
                    write({ max: n });
                    if (targets.length && n > targets.length) setMaxDraft(String(targets.length));            // show the bound actually stored
                  }} onBlur={() => setMaxDraft(null)} />
              </label>
            )}
            <label className="vq-field"><span>تعليمة الاختيار (اختيارية)</span>
              <input className="sb-input sb-input-sm" value={label} maxLength={CHART_SELECTION_LIMITS.labelChars} aria-label="تعليمة الاختيار" placeholder="مثال: اختر الشهر الأكثر مطرًا" disabled={disabled} onChange={e => write({ label: e.target.value })} />
            </label>
            {mode !== "single" && (
              <label className="vq-field"><span>الاحتساب</span>
                <select className="sb-input sb-input-sm" aria-label="طريقة الاحتساب" value={scoring} disabled={disabled} onChange={e => write({ scoring: e.target.value as ChartSelectionScoring })}>
                  <option value="allOrNothing">الكل أو لا شيء</option><option value="partial">جزئية (التقاطع ÷ الاتحاد)</option>
                </select>
              </label>
            )}
          </section>
          <section aria-label="الإجابة الصحيحة" data-testid="chart-key-picker">
            <p className="vq-note">حدّد الإجابة الصحيحة على الرسم نفسه (بالنقر أو من القائمة) — بالطريقة نفسها التي يجيب بها الطالب. لا يرى الطالب هذا التحديد.</p>
            {valid?.ok
              ? <DataChart spec={valid.value} preview selection={{ kind: target, mode, max: mode === "single" ? 1 : Math.max(1, max - pendingKey.length), value: correct, label: "الإجابة الصحيحة", readOnly: disabled, onChange: next => write({ correct: [...next, ...pendingKey] }) }} />
              : <p className="vq-note">أكمل بيانات الرسم (أو صحّح أخطاءه) لتحديد الإجابة الصحيحة.</p>}
          </section>
        </>
      )}
      {confirmDialog}
      {issues.length > 0 && <ul className="vq-issues" data-testid="chart-selection-issues">{issues.slice(0, 10).map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
    </div>
  );
}
