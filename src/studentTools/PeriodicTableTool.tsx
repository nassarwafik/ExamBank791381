import { useState } from "react";
import type { PeriodicTableToolV1 } from "./studentToolsSpec";
import { periodicElements, PERIODIC_CATEGORY_LABEL, CURRICULUM_Z_MAX, PERIODIC_Z_MAX, type PeriodicElement } from "./periodicTableData";
import { neutralConfiguration, formatConfiguration } from "../chemistry/electrons";

// Phase T6 — the student periodic table, laid out by period and group. Atomic mass and electron configuration appear only when the
// teacher allowed them. Its own lazy chunk.
// Phase T10 — the teacher chooses the range: Z 1–36 (the curriculum, and every exam published before T10) or all 118 elements, with the
// lanthanides and actinides in their own two rows. The electron configuration is shown for Z 1–36 only (the verified engine); an
// element without a standard atomic weight says so instead of showing a number.
const F_ROWS = [
  { key: "lanthanide", period: 6, label: "اللانثانيدات", span: "57–71" },
  { key: "actinide", period: 7, label: "الأكتينيدات", span: "89–103" }
] as const;

export default function PeriodicTableTool({ config }: { config: PeriodicTableToolV1 }) {
  const all = config.range === "all";
  const elements = periodicElements(all ? "all" : "curriculum");
  const [sel, setSel] = useState<PeriodicElement | null>(null);
  const periods = [...new Set(elements.map(e => e.period))].sort((a, b) => a - b);
  const cell = (e: PeriodicElement, key: number) => (
    <button key={key} type="button" role="gridcell" className={"stt-pt-cell is-" + e.category + (sel?.z === e.z ? " is-selected" : "")} aria-pressed={sel?.z === e.z}
      aria-label={e.nameAr + " " + e.symbol + "، العدد الذري " + e.z} onClick={() => setSel(e)}><small>{e.z}</small>{e.symbol}</button>
  );
  return (
    <div data-testid="tool-periodicTable">
      <p className="stt-hint">{all ? "العناصر كلها من 1 إلى " + PERIODIC_Z_MAX + "." : "العناصر من 1 إلى " + CURRICULUM_Z_MAX + " (نطاق المنهاج)."} اختر عنصرًا لعرض بياناته.</p>
      <div className="stt-pt" dir="ltr" role="grid" aria-label="الجدول الدوري">
        {periods.map(p => (
          <div key={p} className="stt-pt-row" role="row">
            {Array.from({ length: 18 }, (_, g) => {
              const e = elements.find(x => x.period === p && x.group === g + 1);
              if (e) return cell(e, g);
              const series = all && g === 2 ? F_ROWS.find(f => f.period === p) : undefined;
              return series
                ? <span key={g} className={"stt-pt-series is-" + series.key} role="gridcell" title={series.label}>{series.span}</span>
                : <span key={g} className="stt-pt-empty" role="gridcell" aria-hidden="true" />;
            })}
          </div>
        ))}
        {all && F_ROWS.map(f => (
          <div key={f.key} className="stt-pt-row is-series" role="row" aria-label={f.label}>
            <span className="stt-pt-empty" role="gridcell" aria-hidden="true" />
            <span className="stt-pt-empty" role="gridcell" aria-hidden="true" />
            {elements.filter(e => e.category === f.key).map(e => cell(e, e.z))}
            <span className="stt-pt-empty" role="gridcell" aria-hidden="true" />
          </div>
        ))}
      </div>
      {sel && (
        <dl className="stt-dl" aria-live="polite" data-testid="pt-detail">
          <div><dt>العنصر</dt><dd>{sel.nameAr} (<bdi dir="ltr">{sel.nameEn}</bdi>)</dd></div>
          <div><dt>الرمز</dt><dd><bdi dir="ltr">{sel.symbol}</bdi></dd></div>
          <div><dt>العدد الذري</dt><dd>{sel.z}</dd></div>
          {config.showMass && <div><dt>الكتلة الذرية</dt><dd>{sel.weightText ? <bdi dir="ltr">{sel.weightText}</bdi> : "لا كتلة ذرية قياسية (عنصر مشع لا نظائر مستقرة له)"}</dd></div>}
          <div><dt>الدورة · المجموعة</dt><dd>{sel.period} · {sel.group ?? "—"}</dd></div>
          <div><dt>الفئة</dt><dd>{PERIODIC_CATEGORY_LABEL[sel.category]}</dd></div>
          {config.showConfiguration && <div><dt>التوزيع الإلكتروني</dt><dd>{sel.z <= CURRICULUM_Z_MAX
            ? <bdi dir="ltr" className="stt-ltr">{formatConfiguration(neutralConfiguration(sel.z))}</bdi>
            : "يُعرض للعناصر من 1 إلى " + CURRICULUM_Z_MAX + " فقط"}</dd></div>}
        </dl>
      )}
    </div>
  );
}
