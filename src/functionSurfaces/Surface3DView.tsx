import { useId, useMemo, useRef, useState } from "react";
import { evaluateExpression } from "../parametricExpression";
import { projectSurface, sampleSurface } from "./surfaceMesh";
import { type SurfaceCamera, type SurfaceSpecV1, validateSurfaceSpec } from "./surfaceSpec";
import "./surface-3d.css";

// Phase 21B surface viewer: owned SVG + bounded mesh, shared by persisted RichContent and teacher authoring.
// No WebGL, eval, remote scripts, renderer options or new rendering dependency; camera state is presentation-only.
const FILLS = ["#e1effb", "#c8e1f6", "#a9d0eb", "#89b9dd", "#6aa2d1", "#4987b9", "#3671a5", "#285b91"];
const start = (s: SurfaceSpecV1): SurfaceCamera => s.camera ?? { azimuth: -0.75, elevation: 0.6 };
// Phase 21D: the azimuth wraps (a surface can be turned round and round; clamping it at ±π stopped the rotation dead)
const limitAngle = (n: number) => n - 2 * Math.PI * Math.round(n / (2 * Math.PI));
const limitElevation = (n: number) => Math.max(0.15, Math.min(1.35, n));
export default function Surface3DView({ spec }: { spec: SurfaceSpecV1 }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const checked = useMemo(() => validateSurfaceSpec(spec), [spec]);
  const [camera, setCamera] = useState<SurfaceCamera>(() => start(spec));
  const drag = useRef<{ id: number; x: number; y: number; azimuth: number; elevation: number } | null>(null);
  // Phase 21D: the camera resets when the surface CONTENT changes, never because a parent passed an identical spec object again
  // (state adjusted while rendering, React's pattern for a prop change)
  const contentKey = useMemo(() => JSON.stringify(spec), [spec]);
  const [shownKey, setShownKey] = useState(contentKey);
  if (shownKey !== contentKey) { setShownKey(contentKey); setCamera(start(spec)); }
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
  const resetCamera = () => setCamera(start(spec));
  const keyCamera = (key: string) => {
    if (key === "ArrowLeft") setCamera(v => ({ ...v, azimuth: limitAngle(v.azimuth - 0.2) }));
    else if (key === "ArrowRight") setCamera(v => ({ ...v, azimuth: limitAngle(v.azimuth + 0.2) }));
    else if (key === "ArrowUp") setCamera(v => ({ ...v, elevation: limitElevation(v.elevation + 0.15) }));
    else if (key === "ArrowDown") setCamera(v => ({ ...v, elevation: limitElevation(v.elevation - 0.15) }));
    else if (key === "Home") resetCamera();
    else return false;
    return true;
  };
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
        <button type="button" onClick={resetCamera}>إعادة العرض</button>
      </div>
      <p id={uid + "-help"} className="ex3d-help">يمكن تدوير السطح بالسحب، أو بمفاتيح الأسهم بعد التركيز على الرسم. مفتاح Home يعيد زاوية العرض.</p>
      <svg className="ex3d-scene" viewBox={"0 0 " + scene.width + " " + scene.height} role="img" tabIndex={0}
        aria-describedby={uid + "-help"} aria-label={"سطح ثلاثي الأبعاد للدالة z = " + checked.value.expression + "، يمكن تدويره بالسحب أو بمفاتيح الأسهم."}
        onKeyDown={e => { if (keyCamera(e.key)) e.preventDefault(); }}
        onPointerDown={e => {
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, azimuth: camera.azimuth, elevation: camera.elevation };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          setCamera({ azimuth: limitAngle(d.azimuth + (e.clientX - d.x) * 0.01), elevation: limitElevation(d.elevation - (e.clientY - d.y) * 0.008) });
        }}
        onPointerUp={e => { if (drag.current?.id === e.pointerId) drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
        onPointerCancel={e => { if (drag.current?.id === e.pointerId) drag.current = null; }}>
        <rect width={scene.width} height={scene.height} fill="#f8fbff" />
        {scene.faces.map(f => <polygon key={f.id} points={f.points} fill={FILLS[f.shade]}
          stroke="#2f4f74" strokeWidth="0.35" />)}
      </svg>
      <p className="ex3d-status" dir="ltr">x ∈ [{checked.value.viewport.xMin}, {checked.value.viewport.xMax}] · y ∈ [{checked.value.viewport.yMin}, {checked.value.viewport.yMax}] · z display ∈ [{checked.value.viewport.zMin}, {checked.value.viewport.zMax}]</p>
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
