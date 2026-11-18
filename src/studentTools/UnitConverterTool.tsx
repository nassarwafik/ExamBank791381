import { useId, useState } from "react";
import type { UnitConverterToolV1 } from "./studentToolsSpec";
import { UNITS, UNIT_CATEGORY_LABEL, convertUnit, type UnitCategory, type ConvertUnitResult } from "./unitConverter";

// Phase T6 — the student unit converter, limited to the teacher's categories.
export default function UnitConverterTool({ config }: { config: UnitConverterToolV1 }) {
  const id = useId();
  const cats = config.categories as UnitCategory[];
  const [cat, setCat] = useState<UnitCategory>(cats[0]);
  const [from, setFrom] = useState(UNITS[cats[0]][0].id);
  const [to, setTo] = useState(UNITS[cats[0]][1]?.id ?? UNITS[cats[0]][0].id);
  const [value, setValue] = useState("");
  const [res, setRes] = useState<ConvertUnitResult | null>(null);
  const pickCat = (c: UnitCategory) => { setCat(c); setFrom(UNITS[c][0].id); setTo(UNITS[c][1]?.id ?? UNITS[c][0].id); setRes(null); };
  const run = () => setRes(convertUnit(cat, from, to, value));
  const units = UNITS[cat];
  const label = (u: string) => units.find(x => x.id === u)?.label ?? u;
  return (
    <div data-testid="tool-unitConverter">
      {cats.length > 1 && <>
        <label className="stt-label" htmlFor={id + "-cat"}>الكمية</label>
        <select id={id + "-cat"} className="stt-input stt-select" value={cat} onChange={e => pickCat(e.target.value as UnitCategory)}>
          {cats.map(c => <option key={c} value={c}>{UNIT_CATEGORY_LABEL[c]}</option>)}
        </select>
      </>}
      <label className="stt-label" htmlFor={id + "-v"}>القيمة</label>
      <input id={id + "-v"} className="stt-input" dir="ltr" inputMode="decimal" autoComplete="off" maxLength={30} value={value}
        onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); run(); } }} />
      <div className="stt-row">
        <label className="stt-label" htmlFor={id + "-from"}>من</label>
        <select id={id + "-from"} className="stt-input stt-select" value={from} onChange={e => { setFrom(e.target.value); setRes(null); }}>{units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        <button type="button" className="stt-btn" aria-label="تبديل الوحدتين" onClick={() => { setFrom(to); setTo(from); setRes(null); }}>⇄</button>
      </div>
      <div className="stt-row">
        <label className="stt-label" htmlFor={id + "-to"}>إلى</label>
        <select id={id + "-to"} className="stt-input stt-select" value={to} onChange={e => { setTo(e.target.value); setRes(null); }}>{units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
      </div>
      <div className="stt-row stt-plot-actions"><button type="button" className="stt-btn is-primary" onClick={run}>حوّل</button></div>
      {res && !res.ok && <p className="stt-error" role="alert">{res.message}</p>}
      {res && res.ok && <p className="stt-result" aria-live="polite" data-testid="unit-result"><bdi dir="ltr">{value.trim()}</bdi> {label(from)} = <bdi dir="ltr">{res.display}</bdi> {label(to)}</p>}
    </div>
  );
}
