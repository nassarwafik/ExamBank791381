import { useId, useMemo, useState } from "react";
import { evaluateExpression } from "../parametricExpression";
import { projectSurface, sampleSurface } from "./surfaceMesh";
import { type SurfaceCamera, type SurfaceSpecV1, validateSurfaceSpec } from "./surfaceSpec";
import "./surface-3d.css";

// Phase 21B pilot surface viewer: owned SVG, bounded mesh; no WebGL, eval, remote scripts or new dependencies.
// Rich-content / exam authoring integration is deferred until this isolated surface contract passes certification.
const FILLS = ["#e1effb", "#c8e1f6", "#a9d0eb", "#89b9dd", "#6aa2d1", "#4987b9", "#3671a5", "#285b91"];
const start = (s: SurfaceSpecV1): SurfaceCamera => s.camera ?? { azimuth: -0.75, elevation: 0.6 };
const limitAngle = (n: number) => Math.max(-Math.PI, Math.min(Math.PI, n));
const limitElevation = (n: number) => Math.max(0.15, Math.min(1.35, n));
export default function Surface3DView({ spec }: { spec: SurfaceSpecV1 }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const checked = useMemo(() => validateSurfaceSpec(spec), [spec]);
  const [camera, setCamera] = useState<SurfaceCamera>(() => start(spec));
  const [currentSpec, setCurrentSpec] = useState(spec);
  if (currentSpec !== spec) { setCurrentSpec(spec); setCamera(start(spec)); }
  const mesh = useMemo(() => checked.ok ? sampleSurface(checked.value, checked.ast) : null, [checked]);
  const scene = useMemo(() => (checked.ok && mesh) ? projectSurface(mesh, checked.value, camera) : null, [checked, mesh, camera]);
  const table = useMemo(() => {
    if (!checked.ok) return [];
    const v = checked.value.viewport;
    const rows: { x: number; y: number; z: number | null }[] = [];
    for (const y of [v.yMin, (v.yMin + v.yMax) / 2, v.yMax]) for (const x of [v.xMin, (v.xMin + v.xMax) / 2, v.xMax]) {
      const z = evaluateExpression(checked.ast, new Map([["x", x], ["y", y]]));
      rows.push({ x, y, z: z.ok && z.value >= v.zMin && z.value <= v.zMax ? z.value : null });
    }
    return rows;
  }, [checked]);
  if (!checked.ok || !scene || !mesh) return <p role="alert">الرسم ثلاثي الأبعاد غير صالح، ويحتاج مراجعة المعلم.</p>;
  return (
    <figure className="ex3d" dir="rtl" aria-labelledby={uid + "-title"} data-surface-id={checked.value.id}>
      <figcaption>
        <strong id={uid + "-title"}>{checked.value.title}</strong>
        <p>{checked.value.description}</p>
        <span className="ex3d-expression" dir="ltr">z = {checked.value.expression}</span>
      </figcaption>
      <div className="ex3d-controls" role="group" aria-label="أدوات تدوير الرسم ثلاثي الأبعاد">
        <button type="button" onClick={() => setCamera(c => ({ ...c, azimuth: limitAngle(c.azimuth - 0.2) }))}>تدوير لليسار</button>
        <button type="button" onClick={() => setCamera(c => ({ ...c, azimuth: limitAngle(c.azimuth + 0.2) }))}>تدوير لليمين</button>
        <button type="button" onClick={() => setCamera(c => ({ ...c, elevation: limitElevation(c.elevation + 0.15) }))}>رفع المنظور</button>
        <button type="button" onClick={() => setCamera(c => ({ ...c, elevation: limitElevation(c.elevation - 0.15) }))}>خفض المنظور</button>
        <button type="button" onClick={() => setCamera(start(spec))}>إعادة العرض</button>
      </div>
      <svg className="ex3d-scene" viewBox={"0 0 " + scene.width + " " + scene.height} role="img"
        aria-label={"سطح ثلاثي الأبعاد للدالة z = " + checked.value.expression + "، يمكن تدويره من الأزرار أعلاه."}>
        <rect width={scene.width} height={scene.height} fill="#f8fbff" />
        {scene.faces.map(f => <polygon key={f.id} points={f.points} fill={FILLS[f.shade]}
          stroke="#2f4f74" strokeWidth="0.35" />)}
      </svg>
      <p className="ex3d-status">شبكة: {checked.value.grid.xSteps} × {checked.value.grid.ySteps} · مثلثات: {scene.faces.length} · خلايا مستبعدة: {mesh.skippedCells}</p>
      <details className="ex3d-table">
        <summary>جدول قيم بديل للرسم (يدعم قارئ الشاشة)</summary>
        <div className="ex3d-scroll" tabIndex={0} role="region" aria-label="جدول قيم السطح">
          <table>
            <caption>قيم مختارة للدالة z = f(x,y)</caption>
            <thead><tr><th scope="col">x</th><th scope="col">y</th><th scope="col">z</th></tr></thead>
            <tbody>{table.map((row, i) => <tr key={i}><td dir="ltr">{row.x.toFixed(2)}</td>
              <td dir="ltr">{row.y.toFixed(2)}</td><td dir="ltr">{row.z === null ? "غير معرّفة في العرض" : Number(row.z.toPrecision(5))}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
