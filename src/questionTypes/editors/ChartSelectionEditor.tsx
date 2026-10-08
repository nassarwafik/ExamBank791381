import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { CHART_KINDS, validateChartSpec, type ChartKind, type ChartSpecV1 } from "../../charts/chartSpec";
import { CHART_SELECTION_MODES, RANGE_TARGET_KINDS, chartTargetKinds, chartTargets, isContiguousRun, type ChartSelectionMode, type ChartTargetKind } from "../../charts/chartData";
import { defaultChart } from "../../charts/chartEditing";
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
  const [newKind, setNewKind] = useState<ChartKind>("bar");
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /** A kind change that keeps every value may still clear the answer key (its targets do not exist in the new kind, or the target kind
   *  changes): the chart editor then confirms the change with this warning. */
  const keyClearedBy = (next: ChartSpecV1): string | undefined => {
    if (!correct.length) return undefined;
    const v = validateChartSpec(next), ks = v.ok ? chartTargetKinds(v.value) : [];
    const t = ks.includes(target) ? target : ks[0];
    const order = v.ok && t ? chartTargets(v.value, t).map(x => x.key) : [];
    return t !== target || correct.some(k => !order.includes(k)) ? "ستُمسح الإجابة الصحيحة المحدَّدة لأن عناصرها لا توجد في النوع الجديد، وعليك تحديدها من جديد." : undefined;
  };

  /** One emission: the public config and the key together, kept mutually consistent (unsupported target / mode adjusted, bound clamped,
   *  key entries of vanished targets dropped, a broken range cleared). */
  const write = (next: { chart?: ChartSpecV1; target?: ChartTargetKind; mode?: ChartSelectionMode; max?: number; label?: string; scoring?: ChartSelectionScoring; correct?: string[] }) => {
    const c = next.chart ?? chart;
    const v = c ? validateChartSpec(c) : null;
    const ks = v?.ok ? chartTargetKinds(v.value) : [];
    let t = next.target ?? target;
    if (ks.length && !ks.includes(t)) t = ks[0];
    let m = next.mode ?? mode;
    if (m === "range" && !RANGE_TARGET_KINDS.includes(t)) m = "multiple";
    const order = v?.ok && ks.includes(t) ? chartTargets(v.value, t).map(x => x.key) : [];
    let mx = m === "single" ? 1 : Math.max(1, Math.round(next.max ?? max));
    if (order.length) mx = Math.min(mx, order.length);
    let ok = (next.correct ?? correct).filter(k => !order.length || order.includes(k));
    if (order.length) ok = order.filter(k => ok.includes(k));
    if (m === "single") ok = ok.slice(0, 1);
    if (m === "range" && ok.length && !isContiguousRun(order, ok)) ok = [];
    const sc = m === "single" ? "allOrNothing" : (next.scoring ?? scoring);
    const l = (next.label ?? label);
    onChange({
      chartSelection: { v: 1, ...(c ? { chart: c } : {}), target: t, mode: m, maxSelections: mx, ...(l.trim() ? { label: l } : {}) } as never,
      answer: { scoring: sc, correct: ok } as never
    });
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
              ? <DataChart spec={valid.value} preview selection={{ kind: target, mode, max: mode === "single" ? 1 : max, value: correct, label: "الإجابة الصحيحة", readOnly: disabled, onChange: next => write({ correct: next }) }} />
              : <p className="vq-note">أكمل بيانات الرسم (أو صحّح أخطاءه) لتحديد الإجابة الصحيحة.</p>}
          </section>
        </>
      )}
      {confirmDialog}
      {issues.length > 0 && <ul className="vq-issues" data-testid="chart-selection-issues">{issues.slice(0, 10).map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
    </div>
  );
}
