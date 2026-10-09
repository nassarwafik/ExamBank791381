import { useMemo, useState } from "react";
import Dialog from "../ui/Dialog";
import { type SurfaceSpecV1, validateSurfaceSpec } from "./surfaceSpec";
import Surface3DView from "./Surface3DView";
import "./surface-3d.css";

// Preview only. Not part of a saved exam, student payload, answer or server grading.
const presets = [
  { id: "paraboloid", name: "القطع المكافئ", expr: "x^2+y^2", span: 2, lo: -1, hi: 9 },
  { id: "saddle", name: "السطح السرجي", expr: "x^2-y^2", span: 2, lo: -5, hi: 5 },
  { id: "wave", name: "موجة جيبية", expr: "sin(x)*cos(y)", span: 3.14159, lo: -1.5, hi: 1.5 },
  { id: "dome", name: "نصف كرة", expr: "sqrt(4-x^2-y^2)", span: 2, lo: -0.2, hi: 2.5 }
] as const;
export default function Surface3DLab({ onClose }: { onClose: () => void }) {
  const [preset, setPreset] = useState<string>("paraboloid");
  const [expression, setExpression] = useState<string>(presets[0].expr);
  const [span, setSpan] = useState<number>(2);
  const [zMin, setZMin] = useState<number>(-1);
  const [zMax, setZMax] = useState<number>(9);
  const [steps, setSteps] = useState<number>(20);
  const title = presets.find(p => p.id === preset)?.name ?? presets[0].name;
  const changePreset = (id: string) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setPreset(id); setExpression(p.expr); setSpan(p.span); setZMin(p.lo); setZMax(p.hi); setSteps(20);
  };
  const raw: SurfaceSpecV1 = useMemo(() => ({
    version: 1, id: "lab-surface", title,
    description: "عرض تجريبي للمعلم فقط؛ لا تُخزن هذه الدالة في الامتحان.",
    expression,
    viewport: { xMin: -span, xMax: span, yMin: -span, yMax: span, zMin, zMax },
    grid: { xSteps: steps, ySteps: steps }
  }), [title, expression, span, zMin, zMax, steps]);
  const validated = useMemo(() => validateSurfaceSpec(raw), [raw]);
  return (
    <Dialog open title="مختبر الدوال ثلاثية الأبعاد — تجريبي" onClose={onClose} size="lg" className="ex3d-lab">
      <p role="note" className="ex3d-notice">معاينة محلية للمعلم فقط. تغيير الرسوم هنا لا يغيّر الامتحان أو الإجابات ولا يحفظ شيئًا على الخادم.</p>
      <div className="ex3d-lab-form">
        <label>اختر مثالًا
          <select aria-label="مثال ثلاثي الأبعاد" value={preset} onChange={e => changePreset(e.target.value)}>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>معادلة z = f(x,y)
          <input dir="ltr" aria-label="معادلة السطح" spellCheck={false} autoComplete="off" value={expression} onChange={e => setExpression(e.target.value)} />
        </label>
        <label>المدى الأفقي ±
          <input type="number" aria-label="المدى الأفقي" min="0.1" max="1000" step="0.1" value={span} onChange={e => setSpan(Number(e.target.value))} />
        </label>
        <label>أدنى ارتفاع z
          <input type="number" aria-label="أدنى ارتفاع z" step="0.1" value={zMin} onChange={e => setZMin(Number(e.target.value))} />
        </label>
        <label>أعلى ارتفاع z
          <input type="number" aria-label="أعلى ارتفاع z" step="0.1" value={zMax} onChange={e => setZMax(Number(e.target.value))} />
        </label>
        <label>دقة الشبكة (4–40)
          <input type="number" aria-label="دقة الشبكة" min="4" max="40" step="1" value={steps} onChange={e => setSteps(Number(e.target.value))} />
        </label>
      </div>
      <p className="ex3d-hint">اكتب x^2+y^2 للأسس، و2*x للضرب، وsqrt(x) للجذر، وsin(x) للمثلثيات. المسموح فقط x وy؛ لا تستعمل z داخل التعبير.</p>
      {validated.ok
        ? <Surface3DView spec={validated.value} />
        : <div role="alert" className="ex3d-errors">
            <strong>تعذر عرض الدالة حتى تُصحح المدخلات:</strong>
            <ul>{validated.issues.map((issue, i) => <li key={i}>{issue.message} ({issue.code})</li>)}</ul>
          </div>}
      <div className="ex3d-lab-actions"><button type="button" onClick={onClose}>إغلاق المختبر</button></div>
    </Dialog>
  );
}
