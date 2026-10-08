// Phase 21A.1 — the teacher's CHART editor (builder only, lazy). A chart is authored through typed controls — a kind picker, text fields, a
// table-like data grid, option checkboxes — never JSON and never a rendering-library option. Every change emits the whole ChartSpecV1; a cell
// that does not (yet) hold a number keeps the author's text in place and marks itself invalid without changing the stored value, so nothing
// typed is lost. The authority's (validateChartSpec) issues are shown next to the fields they concern and as a list.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import {
  CHART_ANIMATIONS, CHART_KINDS, CHART_LIMITS, CHART_PALETTES, validateChartSpec,
  type CategoryChartSpec, type ChartAxis, type ChartKind, type ChartSpecV1, type ChartIssue
} from "./chartSpec";
import { convertChartKind, freeId, moveItem, parseChartNumber, setBarOrientation } from "./chartEditing";
import "./chart-editor.css";

const CHART_KIND_LABELS: Readonly<Record<ChartKind, string>> = Object.freeze({
  bar: "أعمدة / أشرطة", line: "خطي", area: "مساحي", combo: "مركّب (أعمدة + خط)", pie: "دائري / حلقي", scatter: "انتشاري",
  histogram: "مدرّج تكراري", radar: "راداري", boxplot: "صندوقي", heatmap: "خريطة حرارية"
});
const ANIMATION_LABELS: Readonly<Record<string, string>> = { none: "بلا حركة", subtle: "حركة هادئة (افتراضي)", normal: "حركة عادية" };
const PALETTE_LABELS: Readonly<Record<string, string>> = { categorical: "ألوان متمايزة", sequential: "تدرّج أزرق", diverging: "متباعدة", neutral: "محايدة (رمادي)" };

type Confirm = (o: { title: string; message: string; confirmLabel: string; tone?: "danger" }) => Promise<boolean>;
/** `kinds`: the chart kinds offered (default: all) — a chartSelection question offers only the kinds a student can answer on. */
export type ChartEditorProps = { chart: ChartSpecV1; onChange: (c: ChartSpecV1) => void; disabled?: boolean; name: string; confirm?: Confirm; kinds?: readonly ChartKind[] };

/** Sets / removes one optional key (no `undefined` values are ever stored). */
function withOpt<T extends object>(o: T, key: string, v: unknown): T {
  const out = { ...o } as Record<string, unknown>;
  if (v === undefined || v === "" || v === false) delete out[key]; else out[key] = v;
  return out as T;
}
const freeLabel = (stem: string, taken: string[]) => { for (let n = taken.length + 1; ; n++) if (!taken.includes(stem + n)) return stem + n; };

/** Cells whose text is not (yet) a number report themselves here, so the editor can list them with the authority's issues. */
const BadCells = createContext<((cell: string, bad: boolean) => void) | null>(null);
/** A numeric cell: the author's spelling stays while it means the stored value; invalid text is kept and flagged, never stored — with a
 *  text error next to the cell (not colour alone) and an entry in the editor's issue list. */
function NumCell({ label, value, onCommit, nullable, invalid, disabled }: { label: string; value: unknown; onCommit: (v: number | null) => void; nullable?: boolean; invalid?: boolean; disabled?: boolean }) {
  const shown = typeof value === "number" ? String(value) : "";
  const [draft, setDraft] = useState({ text: shown, from: shown });
  if (draft.from !== shown) {
    const own = parseChartNumber(draft.text);
    setDraft({ text: own === (typeof value === "number" ? value : null) ? draft.text : shown, from: shown });
  }
  const parsed = parseChartNumber(draft.text);
  const bad = parsed === undefined || (parsed === null && !nullable);
  const errId = "ce-num-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const report = useContext(BadCells);
  useEffect(() => { report?.(label, bad); return () => report?.(label, false); }, [report, label, bad]);
  return (
    <>
      <input className="sb-input sb-input-sm ce-num" inputMode="decimal" dir="ltr" value={draft.text} aria-label={label} aria-invalid={bad || invalid ? true : undefined}
        aria-describedby={bad ? errId : undefined} placeholder={nullable ? "—" : "0"} disabled={disabled}
        onChange={e => {
          const text = e.target.value, p = parseChartNumber(text);
          setDraft({ text, from: shown });
          if (p !== undefined && (p !== null || nullable)) onCommit(p);
        }} />
      {bad && <span id={errId} className="ce-num-error">{parsed === null ? "أدخل رقمًا" : "ليس رقمًا — لم يُحفظ"}</span>}
    </>
  );
}
function TextCell({ label, value, onChange, max, invalid, disabled, placeholder }: { label: string; value: string | undefined; onChange: (v: string) => void; max: number; invalid?: boolean; disabled?: boolean; placeholder?: string }) {
  return <input className="sb-input sb-input-sm ce-text" dir="auto" value={value ?? ""} maxLength={max} aria-label={label} aria-invalid={invalid ? true : undefined} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />;
}
function IconBtn({ label, glyph, onClick, disabled, danger }: { label: string; glyph: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" className={"sb-icon-btn ce-icon" + (danger ? " sb-danger" : "")} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{glyph}</button>;
}

export default function ChartEditor({ chart, onChange, disabled = false, name, confirm, kinds }: ChartEditorProps) {
  const result = useMemo(() => validateChartSpec(chart, "chart"), [chart]);
  const [badCells, setBadCells] = useState<readonly string[]>([]);
  const reportCell = useCallback((cell: string, isBad: boolean) => setBadCells(list => (isBad === list.includes(cell) ? list : isBad ? [...list, cell] : list.filter(c => c !== cell))), []);
  const offered = (kinds ?? CHART_KINDS).includes(chart.kind) ? (kinds ?? CHART_KINDS) : [chart.kind, ...(kinds ?? CHART_KINDS)];
  const issues: ChartIssue[] = result.ok ? [] : result.issues;
  const bad = (path: string) => issues.some(i => i.path === path || i.path.startsWith(path + ".") || i.path.startsWith(path + "["));
  const exact = (path: string) => issues.some(i => i.path === path);
  const set = (next: ChartSpecV1) => onChange(next);
  const d = disabled;

  const changeKind = async (to: ChartKind) => {
    const { spec, lossy } = convertChartKind(chart, to);
    if (lossy && confirm && !(await confirm({ title: "تغيير نوع الرسم البياني", message: "لا يتّسع النوع «" + CHART_KIND_LABELS[to] + "» لكل بيانات " + name + "؛ سيُحذف بعضها أو يُستبدل ببيانات بدء.", confirmLabel: "تغيير النوع", tone: "danger" }))) return;
    set(spec);
  };

  return (
    <BadCells.Provider value={reportCell}>
    <div className="ce" role="group" aria-label={"محرر " + name} dir="rtl" data-xp-chart-editor="v1">
      <div className="ce-row">
        <label className="ce-inline"><span>نوع الرسم</span>
          <select className="sb-input sb-input-sm" value={chart.kind} aria-label={"نوع الرسم البياني — " + name} disabled={d} onChange={e => void changeKind(e.target.value as ChartKind)}>
            {offered.map(k => <option key={k} value={k}>{CHART_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        {chart.kind === "bar" && (
          <label className="ce-inline"><span>الاتجاه</span>
            <select className="sb-input sb-input-sm" value={chart.orientation ?? "vertical"} aria-label={"اتجاه الأعمدة — " + name} disabled={d} onChange={e => set(setBarOrientation(chart, e.target.value as "vertical" | "horizontal"))}>
              <option value="vertical">أعمدة رأسية</option><option value="horizontal">أشرطة أفقية</option>
            </select>
          </label>
        )}
      </div>
      <TextCell label={"عنوان " + name} value={chart.title} onChange={v => set({ ...chart, title: v })} max={CHART_LIMITS.titleChars} invalid={bad("chart.title")} disabled={d} placeholder="عنوان الرسم البياني" />
      <textarea className="sb-input sb-textarea ce-desc" dir="auto" rows={2} value={chart.description} maxLength={CHART_LIMITS.descriptionChars} aria-label={"وصف " + name + " (يُقرأ لقارئ الشاشة)"} aria-invalid={bad("chart.description") ? true : undefined}
        placeholder="وصف ما يعرضه الرسم (يُقرأ لقارئ الشاشة)" disabled={d} onChange={e => set({ ...chart, description: e.target.value })} />
      <TextCell label={"مصدر بيانات " + name} value={chart.source} onChange={v => set(withOpt(chart, "source", v))} max={CHART_LIMITS.sourceChars} disabled={d} placeholder="مصدر البيانات (اختياري)، مثال: بيانات توضيحية" />
      <Options chart={chart} set={set} name={name} disabled={d} />
      <Axes chart={chart} set={set} name={name} disabled={d} bad={bad} exact={exact} />
      <DataGrid chart={chart} set={set} name={name} disabled={d} bad={bad} />
      {(chart.kind === "bar" || chart.kind === "line" || chart.kind === "area" || chart.kind === "combo" || chart.kind === "scatter") && <RefLines chart={chart} set={set} name={name} disabled={d} bad={bad} />}
      {(issues.length > 0 || badCells.length > 0) && (
        <ul className="ce-issues" aria-label={"مشكلات بيانات " + name}>
          {badCells.length > 0 && <li>{"خلايا لا تحمل رقمًا صالحًا (لم يُحفظ ما كُتب فيها): " + badCells.slice(0, 6).join("، ") + (badCells.length > 6 ? "، …" : "")}</li>}
          {issues.slice(0, 8).map((x, n) => <li key={n}>{x.message}</li>)}
        </ul>
      )}
    </div>
    </BadCells.Provider>
  );
}

type Part = { chart: ChartSpecV1; set: (c: ChartSpecV1) => void; name: string; disabled: boolean; bad?: (p: string) => boolean; exact?: (p: string) => boolean };

function Options({ chart, set, name, disabled }: Part) {
  const check = (key: string, label: string) => (
    <label className="ce-check"><input type="checkbox" checked={(chart as Record<string, unknown>)[key] === true} disabled={disabled} onChange={e => set(withOpt(chart, key, e.target.checked))} /><span>{label}</span></label>
  );
  return (
    <div className="ce-row" role="group" aria-label={"خيارات العرض — " + name}>
      <label className="ce-inline"><span>الحركة</span>
        <select className="sb-input sb-input-sm" value={chart.animation ?? "subtle"} aria-label={"حركة " + name} disabled={disabled} onChange={e => set(withOpt(chart, "animation", e.target.value === "subtle" ? undefined : e.target.value))}>
          {CHART_ANIMATIONS.map(a => <option key={a} value={a}>{ANIMATION_LABELS[a]}</option>)}
        </select>
      </label>
      <label className="ce-inline"><span>الألوان</span>
        <select className="sb-input sb-input-sm" value={chart.palette ?? "categorical"} aria-label={"ألوان " + name} disabled={disabled} onChange={e => set(withOpt(chart, "palette", e.target.value === "categorical" ? undefined : e.target.value))}>
          {CHART_PALETTES.map(p => <option key={p} value={p}>{PALETTE_LABELS[p]}</option>)}
        </select>
      </label>
      <label className="ce-check"><input type="checkbox" checked={chart.legend !== "none"} disabled={disabled} onChange={e => set(withOpt(chart, "legend", e.target.checked ? undefined : "none"))} /><span>مفتاح الرسم</span></label>
      {(chart.kind === "bar" || chart.kind === "area") && check("stacked", "مكدّس")}
      {chart.kind === "pie" && check("donut", "حلقي")}
      {VALUE_LABEL_KINDS.includes(chart.kind) && check("valueLabels", "إظهار القيم على الرسم")}
    </div>
  );
}
const VALUE_LABEL_KINDS: readonly ChartKind[] = ["bar", "line", "area", "combo", "pie", "histogram", "heatmap"];

/** `numeric`: true = a value axis (label, unit, bounds); "unit" = a binned axis (label and unit — the bins fix its extent); false = a
 *  category axis (label only). */
function AxisFields({ title, axis, numeric, onAxis, disabled, invalid }: { title: string; axis: ChartAxis | undefined; numeric: boolean | "unit"; onAxis: (a: ChartAxis | undefined) => void; disabled: boolean; invalid: (k: string) => boolean }) {
  const put = (key: keyof ChartAxis, v: unknown) => { const n = withOpt(axis ?? {}, key, v); onAxis(Object.keys(n).length ? n : undefined); };
  return (
    <fieldset className="ce-axis">
      <legend>{title}</legend>
      <TextCell label={"تسمية " + title} value={axis?.label} onChange={v => put("label", v)} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={invalid("label")} placeholder="التسمية" />
      {numeric && <TextCell label={"وحدة " + title} value={axis?.unit} onChange={v => put("unit", v)} max={CHART_LIMITS.unitChars} disabled={disabled} invalid={invalid("unit")} placeholder="الوحدة، مثال: mm" />}
      {numeric === true && <>
        <NumCell label={"أدنى قيمة على " + title} value={axis?.min} nullable onCommit={v => put("min", v === null ? undefined : v)} disabled={disabled} invalid={invalid("min")} />
        <NumCell label={"أعلى قيمة على " + title} value={axis?.max} nullable onCommit={v => put("max", v === null ? undefined : v)} disabled={disabled} invalid={invalid("max")} />
      </>}
    </fieldset>
  );
}

function Axes({ chart, set, name, disabled, bad, exact }: Part) {
  if (chart.kind === "pie" || chart.kind === "radar") return chart.kind === "pie"
    ? <div className="ce-row"><TextCell label={"وحدة قيم " + name} value={chart.unit} onChange={v => set(withOpt(chart, "unit", v))} max={CHART_LIMITS.unitChars} disabled={disabled} placeholder="وحدة القيم (اختياري)، مثال: %" /></div>
    : null;
  const horizontal = chart.kind === "bar" && chart.orientation === "horizontal";
  const xNumeric = chart.kind === "histogram" ? "unit" : chart.kind === "scatter" || horizontal;
  const yNumeric = chart.kind !== "heatmap" && !horizontal;
  // a min ≥ max issue is reported on the axis itself: both bounds are marked
  return (
    <div className="ce-axes">
      <AxisFields title={horizontal ? "المحور الأفقي (القيم)" : "المحور الأفقي"} axis={"xAxis" in chart ? chart.xAxis : undefined} numeric={xNumeric} disabled={disabled} invalid={f => !!bad?.("chart.xAxis." + f) || ((f === "min" || f === "max") && !!exact?.("chart.xAxis"))}
        onAxis={a => set(withOpt(chart, "xAxis", a))} />
      <AxisFields title={horizontal ? "المحور الرأسي (الفئات)" : "المحور الرأسي"} axis={"yAxis" in chart ? chart.yAxis : undefined} numeric={yNumeric} disabled={disabled} invalid={f => !!bad?.("chart.yAxis." + f) || ((f === "min" || f === "max") && !!exact?.("chart.yAxis"))}
        onAxis={a => set(withOpt(chart, "yAxis", a))} />
      {chart.kind === "combo" && chart.series.some(x => x.axis === "secondary") && (
        <AxisFields title="المحور الرأسي الثانوي" axis={chart.y2Axis} numeric disabled={disabled} invalid={f => !!bad?.("chart.y2Axis." + f) || ((f === "min" || f === "max") && !!exact?.("chart.y2Axis"))}
          onAxis={a => set(withOpt(chart, "y2Axis", a))} />
      )}
      {chart.kind === "heatmap" && <div className="ce-row"><TextCell label={"وحدة قيم " + name} value={chart.unit} onChange={v => set(withOpt(chart, "unit", v))} max={CHART_LIMITS.unitChars} disabled={disabled} placeholder="وحدة القيم (اختياري)" /></div>}
    </div>
  );
}

// ── data grids ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function DataGrid(p: Part) {
  const c = p.chart;
  switch (c.kind) {
    case "bar": case "line": case "area": case "combo": return <CategoryGrid {...p} chart={c} />;
    case "pie": return <RowsGrid {...p} />;
    case "histogram": return <RowsGrid {...p} />;
    case "boxplot": return <RowsGrid {...p} />;
    case "scatter": return <ScatterGrid {...p} />;
    case "radar": return <RadarGrid {...p} />;
    case "heatmap": return <HeatmapGrid {...p} />;
  }
}

function CategoryGrid({ chart, set, name, disabled, bad }: Omit<Part, "chart"> & { chart: CategoryChartSpec }) {
  const cats = chart.categories, series = chart.series;
  const points = cats.length * series.length;
  // a combo whose last secondary-axis series is removed / moved back also loses the (now unused) secondary axis
  const put = (next: Partial<CategoryChartSpec>) => {
    const merged = { ...chart, ...next };
    if (merged.y2Axis && !merged.series.some(x => x.axis === "secondary")) delete merged.y2Axis;
    set(merged as ChartSpecV1);
  };
  const setAxis = (si: number, a: "primary" | "secondary") => put({ series: series.map((s, k) => {
    if (k !== si) return s;
    const { axis: _a, ...rest } = s;
    void _a;
    return a === "secondary" ? { ...rest, axis: "secondary" as const } : rest;
  }) });
  const addCategory = () => put({ categories: [...cats, { id: freeId("c", cats.map(x => x.id)), label: freeLabel("الفئة ", cats.map(x => x.label)) }], series: series.map(s => ({ ...s, values: [...s.values, null] })) });
  const removeCategory = (i: number) => put({ categories: cats.filter((_, k) => k !== i), series: series.map(s => ({ ...s, values: s.values.filter((_, k) => k !== i) })) });
  const moveCategory = (i: number, delta: number) => put({ categories: moveItem(cats, i, delta), series: series.map(s => ({ ...s, values: moveItem(s.values, i, delta) })) });
  const addSeries = () => put({ series: [...series, { id: freeId("s", series.map(x => x.id)), label: freeLabel("السلسلة ", series.map(x => x.label)), values: cats.map(() => null), ...(chart.kind === "combo" ? { mark: "line" as const } : {}) }] });
  const setSeries = (si: number, next: CategoryChartSpec["series"][number]) => put({ series: series.map((s, k) => (k === si ? next : s)) });
  return (
    <div className="ce-grid-wrap" role="group" aria-label={"بيانات " + name}>
      <div className="ce-scroll">
        <table className="ce-grid">
          <thead>
            <tr>
              <th scope="col">الفئة</th>
              {series.map((s, si) => (
                <th scope="col" key={s.id}>
                  <TextCell label={"اسم السلسلة " + (si + 1)} value={s.label} onChange={v => setSeries(si, { ...s, label: v })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.series[" + si + "].label")} />
                  <div className="ce-tools">
                    {chart.kind === "combo" && (
                      <select className="sb-input sb-input-sm" value={s.mark ?? "bar"} aria-label={"شكل السلسلة " + (si + 1)} disabled={disabled} onChange={e => setSeries(si, { ...s, mark: e.target.value as "bar" | "line" })}>
                        <option value="bar">أعمدة</option><option value="line">خط</option>
                      </select>
                    )}
                    {chart.kind === "combo" && (
                      <select className="sb-input sb-input-sm" value={s.axis ?? "primary"} aria-label={"محور السلسلة " + (si + 1)} disabled={disabled} onChange={e => setAxis(si, e.target.value as "primary" | "secondary")}>
                        <option value="primary">المحور الأساسي</option><option value="secondary">المحور الثانوي</option>
                      </select>
                    )}
                    <IconBtn label={"تحريك السلسلة " + (si + 1) + " قبل"} glyph="→" onClick={() => put({ series: moveItem(series, si, -1) })} disabled={disabled || si === 0} />
                    <IconBtn label={"تحريك السلسلة " + (si + 1) + " بعد"} glyph="←" onClick={() => put({ series: moveItem(series, si, 1) })} disabled={disabled || si === series.length - 1} />
                    <IconBtn label={"حذف السلسلة " + (si + 1)} glyph="×" danger onClick={() => put({ series: series.filter((_, k) => k !== si) })} disabled={disabled || series.length <= 1} />
                  </div>
                </th>
              ))}
              <th className="ce-actions" aria-label="إجراءات الفئة" />
            </tr>
          </thead>
          <tbody>
            {cats.map((cat, ci) => (
              <tr key={cat.id}>
                <th scope="row"><TextCell label={"اسم الفئة " + (ci + 1)} value={cat.label} onChange={v => put({ categories: cats.map((x, k) => (k === ci ? { ...x, label: v } : x)) })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.categories[" + ci + "]")} /></th>
                {series.map((s, si) => (
                  <td key={s.id}>
                    <NumCell label={s.label + " — " + cat.label} value={s.values[ci]} nullable onCommit={v => setSeries(si, { ...s, values: s.values.map((x, k) => (k === ci ? v : x)) })} disabled={disabled} invalid={bad?.("chart.series[" + si + "].values[" + ci + "]")} />
                  </td>
                ))}
                <td className="ce-actions">
                  <div className="ce-tools">
                    <IconBtn label={"تحريك الفئة " + (ci + 1) + " لأعلى"} glyph="↑" onClick={() => moveCategory(ci, -1)} disabled={disabled || ci === 0} />
                    <IconBtn label={"تحريك الفئة " + (ci + 1) + " لأسفل"} glyph="↓" onClick={() => moveCategory(ci, 1)} disabled={disabled || ci === cats.length - 1} />
                    <IconBtn label={"حذف الفئة " + (ci + 1)} glyph="×" danger onClick={() => removeCategory(ci)} disabled={disabled || cats.length <= 1} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ce-row">
        <button type="button" className="sb-mini-btn" onClick={addCategory} disabled={disabled || cats.length >= CHART_LIMITS.categories || points + series.length > CHART_LIMITS.dataPoints}>+ فئة</button>
        <button type="button" className="sb-mini-btn" onClick={addSeries} disabled={disabled || series.length >= CHART_LIMITS.series || points + cats.length > CHART_LIMITS.dataPoints}>+ سلسلة</button>
        <span className="ce-hint">اترك الخلية فارغة لقيمة مفقودة (لا تُعامَل صفرًا).</span>
      </div>
    </div>
  );
}

/** One row per item with fixed numeric columns: pie slices, histogram bins, box-plot boxes. */
function RowsGrid({ chart, set, name, disabled, bad }: Part) {
  type Row = Record<string, unknown> & { id: string };
  const spec = chart.kind === "pie" ? { key: "slices", rows: chart.slices as Row[], label: true, cols: [["value", "القيمة"]], prefix: "p", stem: "الجزء ", max: CHART_LIMITS.slices, min: 1 }
    : chart.kind === "histogram" ? { key: "bins", rows: chart.bins as Row[], label: false, cols: [["start", "من"], ["end", "إلى (لا تشمل)"], ["count", "التكرار"]], prefix: "b", stem: "", max: CHART_LIMITS.bins, min: 1 }
    : chart.kind === "boxplot" ? { key: "boxes", rows: chart.boxes as Row[], label: true, cols: [["min", "الأدنى"], ["q1", "الربيع الأول"], ["median", "الوسيط"], ["q3", "الربيع الثالث"], ["max", "الأعلى"]], prefix: "x", stem: "المجموعة ", max: CHART_LIMITS.boxes, min: 1 }
    : null;
  if (!spec) return null;
  const rows = spec.rows;
  const put = (next: Row[]) => set({ ...chart, [spec.key]: next } as ChartSpecV1);
  const add = () => {
    const id = freeId(spec.prefix, rows.map(r => r.id));
    if (chart.kind === "histogram") {
      const last = chart.bins[chart.bins.length - 1];
      const width = last ? last.end - last.start : 10, start = last ? last.end : 0;
      put([...rows, { id, start, end: start + width, count: 0 }]);
    } else if (chart.kind === "pie") put([...rows, { id, label: freeLabel(spec.stem, rows.map(r => String(r.label))), value: 0 }]);
    else { const l = chart.kind === "boxplot" ? chart.boxes[chart.boxes.length - 1] : undefined; put([...rows, { id, label: freeLabel(spec.stem, rows.map(r => String(r.label))), min: l?.min ?? 0, q1: l?.q1 ?? 1, median: l?.median ?? 2, q3: l?.q3 ?? 3, max: l?.max ?? 4 }]); }
  };
  const itemName = (i: number) => (chart.kind === "histogram" ? "الفئة التكرارية " : chart.kind === "pie" ? "الجزء " : "المجموعة ") + (i + 1);
  return (
    <div className="ce-grid-wrap" role="group" aria-label={"بيانات " + name}>
      <div className="ce-scroll">
        <table className="ce-grid">
          <thead><tr>{spec.label && <th scope="col">التسمية</th>}{spec.cols.map(([k, l]) => <th scope="col" key={k}>{l}</th>)}<th className="ce-actions" aria-label="إجراءات" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                {spec.label && <th scope="row"><TextCell label={"تسمية " + itemName(i)} value={String(r.label ?? "")} onChange={v => put(rows.map((x, k) => (k === i ? { ...x, label: v } : x)))} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart." + spec.key + "[" + i + "].label")} /></th>}
                {spec.cols.map(([k, l]) => (
                  <td key={k}><NumCell label={l + " — " + itemName(i)} value={r[k]} onCommit={v => put(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} disabled={disabled} invalid={bad?.("chart." + spec.key + "[" + i + "]." + k) || (k === "start" && bad?.("chart." + spec.key + "[" + i + "]"))} /></td>
                ))}
                <td className="ce-actions"><div className="ce-tools">
                  {chart.kind !== "histogram" && <>
                    <IconBtn label={"تحريك " + itemName(i) + " لأعلى"} glyph="↑" onClick={() => put(moveItem(rows, i, -1))} disabled={disabled || i === 0} />
                    <IconBtn label={"تحريك " + itemName(i) + " لأسفل"} glyph="↓" onClick={() => put(moveItem(rows, i, 1))} disabled={disabled || i === rows.length - 1} />
                  </>}
                  <IconBtn label={"حذف " + itemName(i)} glyph="×" danger onClick={() => put(rows.filter((_, k) => k !== i))} disabled={disabled || rows.length <= spec.min} />
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ce-row">
        <button type="button" className="sb-mini-btn" onClick={add} disabled={disabled || rows.length >= spec.max}>{chart.kind === "histogram" ? "+ فئة تكرارية" : chart.kind === "pie" ? "+ جزء" : "+ مجموعة"}</button>
        {chart.kind === "histogram" && <span className="ce-hint">كل فئة تبدأ حيث تنتهي السابقة.</span>}
      </div>
    </div>
  );
}

function ScatterGrid({ chart, set, name, disabled, bad }: Part) {
  if (chart.kind !== "scatter") return null;
  const series = chart.series;
  const total = series.reduce((a, s) => a + s.points.length, 0);
  const allIds = series.flatMap(s => s.points.map(p => p.id));
  const put = (next: typeof series) => set({ ...chart, series: next });
  const setS = (si: number, next: (typeof series)[number]) => put(series.map((s, k) => (k === si ? next : s)));
  return (
    <div className="ce-grid-wrap" role="group" aria-label={"بيانات " + name}>
      {series.map((s, si) => (
        <fieldset className="ce-series" key={s.id}>
          <legend className="ce-row">
            <TextCell label={"اسم السلسلة " + (si + 1)} value={s.label} onChange={v => setS(si, { ...s, label: v })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.series[" + si + "].label")} />
            <IconBtn label={"حذف السلسلة " + (si + 1)} glyph="×" danger onClick={() => put(series.filter((_, k) => k !== si))} disabled={disabled || series.length <= 1} />
          </legend>
          <div className="ce-scroll">
            <table className="ce-grid">
              <thead><tr><th scope="col">تسمية النقطة (اختيارية)</th><th scope="col">x</th><th scope="col">y</th><th className="ce-actions" aria-label="إجراءات" /></tr></thead>
              <tbody>{s.points.map((p, pi) => {
                const at = "chart.series[" + si + "].points[" + pi + "]";
                const setP = (next: typeof p) => setS(si, { ...s, points: s.points.map((x, k) => (k === pi ? next : x)) });
                return (
                  <tr key={p.id}>
                    <th scope="row"><TextCell label={"تسمية النقطة " + (pi + 1) + " في السلسلة " + (si + 1)} value={p.label} onChange={v => setP(withOpt(p, "label", v))} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.(at + ".label")} /></th>
                    <td><NumCell label={"x للنقطة " + (pi + 1)} value={p.x} onCommit={v => setP({ ...p, x: v as number })} disabled={disabled} invalid={bad?.(at + ".x")} /></td>
                    <td><NumCell label={"y للنقطة " + (pi + 1)} value={p.y} onCommit={v => setP({ ...p, y: v as number })} disabled={disabled} invalid={bad?.(at + ".y")} /></td>
                    <td className="ce-actions"><IconBtn label={"حذف النقطة " + (pi + 1)} glyph="×" danger onClick={() => setS(si, { ...s, points: s.points.filter((_, k) => k !== pi) })} disabled={disabled || s.points.length <= 1} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <button type="button" className="sb-mini-btn" disabled={disabled || total >= CHART_LIMITS.scatterPoints}
            onClick={() => setS(si, { ...s, points: [...s.points, { id: freeId("pt", allIds), x: 0, y: 0 }] })}>+ نقطة</button>
        </fieldset>
      ))}
      <button type="button" className="sb-mini-btn" disabled={disabled || series.length >= CHART_LIMITS.scatterSeries || total >= CHART_LIMITS.scatterPoints}
        onClick={() => put([...series, { id: freeId("s", series.map(x => x.id)), label: freeLabel("السلسلة ", series.map(x => x.label)), points: [{ id: freeId("pt", allIds), x: 0, y: 0 }] }])}>+ سلسلة</button>
    </div>
  );
}

function RadarGrid({ chart, set, name, disabled, bad }: Part) {
  if (chart.kind !== "radar") return null;
  const { axes, series } = chart;
  const put = (next: Partial<typeof chart>) => set({ ...chart, ...next });
  return (
    <div className="ce-grid-wrap" role="group" aria-label={"بيانات " + name}>
      <div className="ce-scroll">
        <table className="ce-grid">
          <thead><tr><th scope="col">المحور</th><th scope="col">الحد الأعلى</th>
            {series.map((s, si) => (
              <th scope="col" key={s.id}>
                <TextCell label={"اسم السلسلة " + (si + 1)} value={s.label} onChange={v => put({ series: series.map((x, k) => (k === si ? { ...x, label: v } : x)) })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.series[" + si + "].label")} />
                <IconBtn label={"حذف السلسلة " + (si + 1)} glyph="×" danger onClick={() => put({ series: series.filter((_, k) => k !== si) })} disabled={disabled || series.length <= 1} />
              </th>
            ))}<th className="ce-actions" aria-label="إجراءات" /></tr></thead>
          <tbody>{axes.map((a, ai) => (
            <tr key={a.id}>
              <th scope="row"><TextCell label={"اسم المحور " + (ai + 1)} value={a.label} onChange={v => put({ axes: axes.map((x, k) => (k === ai ? { ...x, label: v } : x)) })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.axes[" + ai + "].label")} /></th>
              <td><NumCell label={"الحد الأعلى للمحور " + (ai + 1)} value={a.max} onCommit={v => put({ axes: axes.map((x, k) => (k === ai ? { ...x, max: v as number } : x)) })} disabled={disabled} invalid={bad?.("chart.axes[" + ai + "].max")} /></td>
              {series.map((s, si) => (
                <td key={s.id}><NumCell label={s.label + " — " + a.label} value={s.values[ai]} onCommit={v => put({ series: series.map((x, k) => (k === si ? { ...x, values: x.values.map((y, j) => (j === ai ? (v as number) : y)) } : x)) })} disabled={disabled} invalid={bad?.("chart.series[" + si + "].values[" + ai + "]")} /></td>
              ))}
              <td className="ce-actions"><IconBtn label={"حذف المحور " + (ai + 1)} glyph="×" danger onClick={() => put({ axes: axes.filter((_, k) => k !== ai), series: series.map(s => ({ ...s, values: s.values.filter((_, k) => k !== ai) })) })} disabled={disabled || axes.length <= CHART_LIMITS.radarAxesMin} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="ce-row">
        <button type="button" className="sb-mini-btn" disabled={disabled || axes.length >= CHART_LIMITS.radarAxes}
          onClick={() => put({ axes: [...axes, { id: freeId("a", axes.map(x => x.id)), label: freeLabel("المحور ", axes.map(x => x.label)), max: axes[axes.length - 1]?.max ?? 10 }], series: series.map(s => ({ ...s, values: [...s.values, 0] })) })}>+ محور</button>
        <button type="button" className="sb-mini-btn" disabled={disabled || series.length >= CHART_LIMITS.radarSeries}
          onClick={() => put({ series: [...series, { id: freeId("s", series.map(x => x.id)), label: freeLabel("السلسلة ", series.map(x => x.label)), values: axes.map(() => 0) }] })}>+ سلسلة</button>
      </div>
    </div>
  );
}

function HeatmapGrid({ chart, set, name, disabled, bad }: Part) {
  if (chart.kind !== "heatmap") return null;
  const { columns, rows, values } = chart;
  const put = (next: Partial<typeof chart>) => set({ ...chart, ...next });
  return (
    <div className="ce-grid-wrap" role="group" aria-label={"بيانات " + name}>
      <div className="ce-scroll">
        <table className="ce-grid">
          <thead><tr><th scope="col">الصف</th>
            {columns.map((c, ci) => (
              <th scope="col" key={c.id}>
                <TextCell label={"اسم العمود " + (ci + 1)} value={c.label} onChange={v => put({ columns: columns.map((x, k) => (k === ci ? { ...x, label: v } : x)) })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.columns[" + ci + "]")} />
                <IconBtn label={"حذف العمود " + (ci + 1)} glyph="×" danger onClick={() => put({ columns: columns.filter((_, k) => k !== ci), values: values.map(r => r.filter((_, k) => k !== ci)) })} disabled={disabled || columns.length <= 1} />
              </th>
            ))}<th className="ce-actions" aria-label="إجراءات" /></tr></thead>
          <tbody>{rows.map((r, ri) => (
            <tr key={r.id}>
              <th scope="row"><TextCell label={"اسم الصف " + (ri + 1)} value={r.label} onChange={v => put({ rows: rows.map((x, k) => (k === ri ? { ...x, label: v } : x)) })} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.rows[" + ri + "]")} /></th>
              {columns.map((c, ci) => (
                <td key={c.id}><NumCell label={r.label + " — " + c.label} value={values[ri]?.[ci]} nullable onCommit={v => put({ values: values.map((row, k) => (k === ri ? row.map((x, j) => (j === ci ? v : x)) : row)) })} disabled={disabled} invalid={bad?.("chart.values[" + ri + "][" + ci + "]")} /></td>
              ))}
              <td className="ce-actions"><IconBtn label={"حذف الصف " + (ri + 1)} glyph="×" danger onClick={() => put({ rows: rows.filter((_, k) => k !== ri), values: values.filter((_, k) => k !== ri) })} disabled={disabled || rows.length <= 1} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="ce-row">
        <button type="button" className="sb-mini-btn" disabled={disabled || rows.length >= CHART_LIMITS.heatmapRows}
          onClick={() => put({ rows: [...rows, { id: freeId("r", rows.map(x => x.id)), label: freeLabel("الصف ", rows.map(x => x.label)) }], values: [...values, columns.map(() => null)] })}>+ صف</button>
        <button type="button" className="sb-mini-btn" disabled={disabled || columns.length >= CHART_LIMITS.heatmapColumns}
          onClick={() => put({ columns: [...columns, { id: freeId("k", columns.map(x => x.id)), label: freeLabel("العمود ", columns.map(x => x.label)) }], values: values.map(row => [...row, null]) })}>+ عمود</button>
      </div>
    </div>
  );
}

function RefLines({ chart, set, name, disabled, bad }: Part) {
  if (!(chart.kind === "bar" || chart.kind === "line" || chart.kind === "area" || chart.kind === "combo" || chart.kind === "scatter")) return null;
  const lines = chart.referenceLines ?? [];
  const put = (next: typeof lines) => set(withOpt(chart, "referenceLines", next.length ? next : undefined));
  return (
    <fieldset className="ce-axis">
      <legend>خطوط مرجعية (اختيارية)</legend>
      {lines.map((l, i) => (
        <div className="ce-row" key={l.id}>
          <TextCell label={"تسمية الخط المرجعي " + (i + 1) + " في " + name} value={l.label} onChange={v => put(lines.map((x, k) => (k === i ? { ...x, label: v } : x)))} max={CHART_LIMITS.labelChars} disabled={disabled} invalid={bad?.("chart.referenceLines[" + i + "].label")} />
          <NumCell label={"قيمة الخط المرجعي " + (i + 1)} value={l.value} onCommit={v => put(lines.map((x, k) => (k === i ? { ...x, value: v as number } : x)))} disabled={disabled} invalid={bad?.("chart.referenceLines[" + i + "].value")} />
          <IconBtn label={"حذف الخط المرجعي " + (i + 1)} glyph="×" danger onClick={() => put(lines.filter((_, k) => k !== i))} disabled={disabled} />
        </div>
      ))}
      <button type="button" className="sb-mini-btn" disabled={disabled || lines.length >= CHART_LIMITS.referenceLines}
        onClick={() => put([...lines, { id: freeId("ref", lines.map(x => x.id)), value: 0, label: freeLabel("مرجع ", lines.map(x => x.label)) }])}>+ خط مرجعي</button>
    </fieldset>
  );
}
