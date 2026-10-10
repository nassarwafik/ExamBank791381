import { useId, useMemo } from "react";
import { useOrbitCamera, type OrbitLimits } from "../interactive3d/orbitCamera";
import { evaluateExpression } from "../parametricExpression";
import { projectSurface, sampleSurface } from "./surfaceMesh";
import { type SurfaceCamera, type SurfaceSpecV1, validateSurfaceSpec } from "./surfaceSpec";
import "./surface-3d.css";

// Phase 21B surface viewer: owned SVG + bounded mesh, shared by persisted RichContent and teacher authoring.
// No WebGL, eval, remote scripts, renderer options or new rendering dependency; camera state is presentation-only.
const FILLS = ["#e1effb", "#c8e1f6", "#a9d0eb", "#89b9dd", "#6aa2d1", "#4987b9", "#3671a5", "#285b91"];
// Phase 21D: the camera is the shared orbit controller — azimuth turns without a stop (21B clamped it to ±π), elevation stays in
// [0.15, 1.35] (the surface is always seen from above its plane), and the view resets only when the surface's content changes.
const start = (s: SurfaceSpecV1): SurfaceCamera => s.camera ?? { azimuth: -0.75, elevation: 0.6 };
const SURFACE_LIMITS: OrbitLimits = { pitchMin: 0.15, pitchMax: 1.35, zoomMin: 1, zoomMax: 1 };
export default function Surface3DView({ spec }: { spec: SurfaceSpecV1 }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const checked = useMemo(() => validateSurfaceSpec(spec), [spec]);
  const authored = start(spec);
  const { camera: orbit, rotateBy, reset: resetCamera, onKeyDown, attachTo, pointerHandlers } = useOrbitCamera({
    initial: { yaw: authored.azimuth, pitch: authored.elevation, zoom: 1 },
    resetKey: spec.id + "|" + authored.azimuth + "|" + authored.elevation, limits: SURFACE_LIMITS, rotate: true, zoom: false
  });
  const camera: SurfaceCamera = useMemo(() => ({ azimuth: orbit.yaw, elevation: orbit.pitch }), [orbit]);
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
        <button type="button" onClick={() => rotateBy(-0.2, 0)}>تدوير لليسار</button>
        <button type="button" onClick={() => rotateBy(0.2, 0)}>تدوير لليمين</button>
        <button type="button" onClick={() => rotateBy(0, 0.15)}>رفع المنظور</button>
        <button type="button" onClick={() => rotateBy(0, -0.15)}>خفض المنظور</button>
        <button type="button" onClick={resetCamera}>إعادة العرض</button>
      </div>
      <p id={uid + "-help"} className="ex3d-help">يمكن تدوير السطح بالسحب، أو بمفاتيح الأسهم بعد التركيز على الرسم. مفتاح Home يعيد زاوية العرض.</p>
      <svg ref={attachTo} className="ex3d-scene" viewBox={"0 0 " + scene.width + " " + scene.height} role="img" tabIndex={0}
        aria-describedby={uid + "-help"} aria-label={"سطح ثلاثي الأبعاد للدالة z = " + checked.value.expression + "، يمكن تدويره بالسحب أو بمفاتيح الأسهم."}
        data-azimuth={Math.round(camera.azimuth * 1000) / 1000} data-elevation={Math.round(camera.elevation * 1000) / 1000}
        onKeyDown={e => { if (onKeyDown(e)) e.preventDefault(); }} {...pointerHandlers}>
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
