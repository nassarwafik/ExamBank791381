import { useState } from "react";
import type { PeriodicTableToolV1 } from "./studentToolsSpec";
import { CHEM_ELEMENTS, CHEM_Z_MAX, CHEM_CATEGORY_LABEL, type ChemElement } from "../chemistry/elements";
import { neutralConfiguration, formatConfiguration } from "../chemistry/electrons";

// Phase T6 — the student periodic table: the platform's verified element catalog (Z 1–36, the curriculum's scope), laid out by
// period and group. Atomic mass and electron configuration appear only when the teacher allowed them. Its own lazy chunk.
export default function PeriodicTableTool({ config }: { config: PeriodicTableToolV1 }) {
  const [sel, setSel] = useState<ChemElement | null>(null);
  const periods = [...new Set(CHEM_ELEMENTS.map(e => e.period))].sort((a, b) => a - b);
  return (
    <div data-testid="tool-periodicTable">
      <p className="stt-hint">العناصر من 1 إلى {CHEM_Z_MAX} (نطاق المنهاج). اختر عنصرًا لعرض بياناته.</p>
      <div className="stt-pt" dir="ltr" role="grid" aria-label="الجدول الدوري">
        {periods.map(p => (
          <div key={p} className="stt-pt-row" role="row">
            {Array.from({ length: 18 }, (_, g) => {
              const e = CHEM_ELEMENTS.find(x => x.period === p && x.group === g + 1);
              return e
                ? <button key={g} type="button" role="gridcell" className={"stt-pt-cell is-" + e.category + (sel?.z === e.z ? " is-selected" : "")} aria-pressed={sel?.z === e.z}
                    aria-label={e.nameAr + " " + e.symbol + "، العدد الذري " + e.z} onClick={() => setSel(e)}><small>{e.z}</small>{e.symbol}</button>
                : <span key={g} className="stt-pt-empty" role="gridcell" aria-hidden="true" />;
            })}
          </div>
        ))}
      </div>
      {sel && (
        <dl className="stt-dl" aria-live="polite" data-testid="pt-detail">
          <div><dt>العنصر</dt><dd>{sel.nameAr} (<bdi dir="ltr">{sel.nameEn}</bdi>)</dd></div>
          <div><dt>الرمز</dt><dd><bdi dir="ltr">{sel.symbol}</bdi></dd></div>
          <div><dt>العدد الذري</dt><dd>{sel.z}</dd></div>
          {config.showMass && <div><dt>الكتلة الذرية</dt><dd><bdi dir="ltr">{sel.weightText}</bdi></dd></div>}
          <div><dt>الدورة · المجموعة</dt><dd>{sel.period} · {sel.group}</dd></div>
          <div><dt>الفئة</dt><dd>{CHEM_CATEGORY_LABEL[sel.category]}</dd></div>
          {config.showConfiguration && <div><dt>التوزيع الإلكتروني</dt><dd><bdi dir="ltr" className="stt-ltr">{formatConfiguration(neutralConfiguration(sel.z))}</bdi></dd></div>}
        </dl>
      )}
    </div>
  );
}
