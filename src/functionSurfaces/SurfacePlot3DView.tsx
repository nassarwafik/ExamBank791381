import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { evaluateExpression, type ExprNode } from "../parametricExpression";
import { useOrbitCamera, type OrbitLimits } from "../interactive3d/orbitCamera";
import { SCENE3D_PALETTE, shadeScene3DFace } from "../interactive3d/sceneMesh";
import { buildSurfacePlotMesh, plotAxes, plotTicks, projectSurfacePlot, type SurfacePlotLevel, type SurfacePlotMesh } from "./surfacePlotMesh";
import { DEFAULT_PLOT_CAMERA, SURFACE_PLOT_COLOR_LABELS, SURFACE_PLOT_LIMITS, validateSurfacePlotSpec, type SurfacePlotColor, type SurfacePlotSpecV2, type SurfacePlotStyle } from "./surfacePlotSpec";
import "./surface-plot.css";

// Phase 21D-A.4 — the viewer of SurfacePlotSpecV2 (lazy; student exam, teacher preview and review). Owned SVG renderer — no WebGL, no
// external asset, no new dependency. It REUSES the Phase 21D 3D runtime: the shared orbit-camera controller (drag / touch rotation with
// inertia, pinch and deliberate wheel zoom, keys, reset, reduced motion, content-keyed reset, full listener / frame cleanup) and the
// Phase 21D lighting model; the geometry is the adaptive surface mesh of surfacePlotMesh.ts. Detail follows the 21D level-of-detail
// rule: a light "motion" mesh while the camera moves (and for the first paint), the authored quality at rest. Camera, display style,
// grid and which surfaces are shown are PRESENTATION state: never stored, never part of an answer.
const LIMITS: OrbitLimits = { pitchMin: -SURFACE_PLOT_LIMITS.pitchAbs, pitchMax: SURFACE_PLOT_LIMITS.pitchAbs, zoomMin: SURFACE_PLOT_LIMITS.zoomMin, zoomMax: SURFACE_PLOT_LIMITS.zoomMax };
/** colour → index of the shared Phase 21D palette (1-based), so surfaces are lit exactly like the 3D models */
const PALETTE: Readonly<Record<SurfacePlotColor, number>> = Object.freeze({ blue: 3, amber: 7, green: 5, rose: 6, lavender: 8 });
const swatch = (c: SurfacePlotColor) => SCENE3D_PALETTE[PALETTE[c] - 1];
const darken = (hex: string, t: number) => "#" + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + 0x17 * t).toString(16).padStart(2, "0")).join("");
const STYLE_LABELS: Readonly<Record<SurfacePlotStyle, string>> = Object.freeze({ solid: "سطح مصمت", mesh: "سطح مع خطوط الشبكة", transparent: "شفاف مع خطوط الشبكة" });
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => String(Number(n.toPrecision(4)));

// meshes are shared between viewers and re-renders (bounded): a parent that re-derives an identical plot never rebuilds geometry
const MESHES = new Map<string, SurfacePlotMesh>();
function meshFor(ast: ExprNode, expression: string, plot: SurfacePlotSpecV2, level: SurfacePlotLevel): SurfacePlotMesh {
  const key = level + "|" + plot.surfaces.length + "|" + JSON.stringify(plot.viewport) + "|" + expression, hit = MESHES.get(key);
  if (hit) return hit;
  const mesh = buildSurfacePlotMesh(ast, plot.viewport, level, plot.surfaces.length);
  MESHES.set(key, mesh);
  if (MESHES.size > 40) MESHES.delete(MESHES.keys().next().value as string);
  return mesh;
}
const axisTitle = (a: { label: string; unit?: string }) => a.label + (a.unit ? " (" + a.unit + ")" : "");

export default function SurfacePlot3DView({ spec }: { spec: SurfacePlotSpecV2 }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const checked = useMemo(() => validateSurfacePlotSpec(spec), [spec]);
  const value = checked.ok ? checked.value : null, asts = checked.ok ? checked.asts : null;
  const contentKey = useMemo(() => (value ? JSON.stringify(value) : ""), [value]);
  const authored = value?.camera ?? DEFAULT_PLOT_CAMERA;
  const { camera, interacting, reset, rotateBy, zoomBy, attachTo, onKeyDown, pointerHandlers } = useOrbitCamera({
    initial: { yaw: authored.azimuth, pitch: authored.elevation, zoom: authored.zoom },
    // the view starts again from the authored camera only when the validated plot CONTENT changes, never on a re-derived equal object
    resetKey: contentKey, limits: LIMITS, rotate: !!value?.controls.rotate, zoom: !!value?.controls.zoom
  });
  // presentation choices follow the authored defaults whenever the content changes (state adjusted while rendering)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [style, setStyle] = useState<SurfacePlotStyle>(value?.display.style ?? "mesh");
  const [grid, setGrid] = useState<boolean>(value?.display.grid ?? true);
  const [shownKey, setShownKey] = useState(contentKey);
  if (shownKey !== contentKey) { setShownKey(contentKey); setHidden(new Set()); setStyle(value?.display.style ?? "mesh"); setGrid(value?.display.grid ?? true); }
  // the drawing follows the rendered width (crisp text and lines at every size; one column on phones)
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width ?? 0; if (w > 0) setWidth(Math.max(260, Math.min(960, Math.round(w)))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const height = Math.round(Math.max(250, Math.min(560, width * 0.72)));
  // first paint and motion: the light mesh; the authored-quality mesh is built after the first paint (never blocks the page)
  const motion = useMemo(() => (value && asts ? value.surfaces.map((s, i) => meshFor(asts[i], s.expression, value, "motion")) : []), [value, asts]);
  const [rest, setRest] = useState<{ key: string; meshes: SurfacePlotMesh[] } | null>(null);
  useEffect(() => {
    if (!value || !asts) return;
    let live = true;
    const id = setTimeout(() => { const meshes = value.surfaces.map((s, i) => meshFor(asts[i], s.expression, value, value.quality)); if (live) setRest({ key: contentKey, meshes }); }, 0);
    return () => { live = false; clearTimeout(id); };
  }, [value, asts, contentKey]);
  const restReady = !!rest && rest.key === contentKey;
  const level: SurfacePlotLevel = !value || interacting || !restReady ? "motion" : value.quality;
  const meshes = level === "motion" ? motion : rest!.meshes;
  const visible = useMemo(() => (value ? value.surfaces.map(s => !hidden.has(s.id)) : []), [value, hidden]);
  const withLines = style !== "solid" && level !== "motion";
  const projected = useMemo(() => (value ? projectSurfacePlot(meshes, visible, camera, width, height, withLines) : null), [value, meshes, visible, camera, width, height, withLines]);
  const ticks = useMemo(() => (value ? { x: plotTicks(value.viewport.xMin, value.viewport.xMax), y: plotTicks(value.viewport.yMin, value.viewport.yMax), z: plotTicks(value.viewport.zMin, value.viewport.zMax) } : null), [value]);
  const axes = useMemo(() => (value && ticks ? plotAxes(camera, width, height, ticks, { x: axisTitle(value.axes.x), y: axisTitle(value.axes.y), z: axisTitle(value.axes.z) }, grid) : null), [value, ticks, camera, width, height, grid]);
  const table = useMemo(() => {
    if (!value || !asts) return [];
    const v = value.viewport, rows: { surface: string; x: number; y: number; z: number | null }[] = [];
    value.surfaces.forEach((s, i) => {
      for (const y of [v.yMin, (v.yMin + v.yMax) / 2, v.yMax]) for (const x of [v.xMin, (v.xMin + v.xMax) / 2, v.xMax]) {
        const r = evaluateExpression(asts[i], new Map([["x", x], ["y", y]]));
        rows.push({ surface: s.label, x, y, z: r.ok && Number.isFinite(r.value) && r.value >= v.zMin && r.value <= v.zMax ? r.value : null });
      }
    });
    return rows;
  }, [value, asts]);
  if (!value || !projected || !axes) return <p className="sp3d-unavailable" role="alert">تعذّر عرض الرسم ثلاثي الأبعاد؛ يحتاج مراجعة المعلم.</p>;

  const transparent = style === "transparent";
  const items: ReactNode[] = [];
  const { polygons, lines } = projected;
  for (let i = 0, j = 0, slot = 0; i < polygons.length || j < lines.length; slot++) {
    if (j >= lines.length || (i < polygons.length && polygons[i].depth <= lines[j].depth)) {
      const p = polygons[i++], color = value.surfaces[p.surface].color, fill = shadeScene3DFace(PALETTE[color], { x: p.normal[0], y: p.normal[1], z: p.normal[2] }, true, p.front);
      items.push(<polygon key={slot} points={p.points} fill={fill} fillOpacity={transparent ? 0.6 : undefined} stroke={transparent ? "none" : fill} strokeWidth={transparent ? undefined : 0.6} data-s={p.surface} />);
    } else {
      const l = lines[j++];
      items.push(<line key={slot} x1={l.x1.toFixed(1)} y1={l.y1.toFixed(1)} x2={l.x2.toFixed(1)} y2={l.y2.toFixed(1)} stroke={darken(swatch(value.surfaces[l.surface].color), 0.55)} strokeWidth={0.7} strokeOpacity={transparent ? 0.75 : 0.5} className="sp3d-meshline" />);
    }
  }
  const shown = value.surfaces.filter((_, i) => visible[i]);
  const label = "رسم ثلاثي الأبعاد: " + value.title + ". يضم " + value.surfaces.length + (value.surfaces.length === 1 ? " سطحًا" : " أسطح") + ": " + value.surfaces.map(s => s.label + " (z = " + s.expression + ")").join("، ") + ".";
  const toggle = (id: string) => setHidden(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <figure className="sp3d" dir="rtl" aria-labelledby={uid + "-title"} data-plot-id={value.id}>
      <figcaption>
        <strong id={uid + "-title"}>{value.title}</strong>
        <p>{value.description}</p>
      </figcaption>
      <ul className="sp3d-legend" aria-label="مفتاح الأسطح">
        {value.surfaces.map((s, i) => (
          <li key={s.id} data-surface={s.id} className={visible[i] ? undefined : "is-hidden"}>
            {value.controls.toggleSurfaces
              ? <label><input type="checkbox" checked={visible[i]} onChange={() => toggle(s.id)} aria-label={"إظهار السطح " + s.label} /><Swatch color={s.color} /><span>{s.label}</span></label>
              : <span className="sp3d-legend-item"><Swatch color={s.color} /><span>{s.label}</span></span>}
            <bdi className="sp3d-formula" dir="ltr">z = {s.expression}</bdi>
          </li>
        ))}
      </ul>
      <div className="sp3d-controls" role="group" aria-label="أدوات عرض الرسم ثلاثي الأبعاد">
        {value.controls.rotate && <>
          <button type="button" className="sp3d-icon" title="تدوير لليسار" aria-label="تدوير لليسار" onClick={() => rotateBy(-0.2, 0)}>⟲</button>
          <button type="button" className="sp3d-icon" title="تدوير لليمين" aria-label="تدوير لليمين" onClick={() => rotateBy(0.2, 0)}>⟳</button>
          <button type="button" className="sp3d-icon" title="رفع المنظور" aria-label="رفع المنظور" onClick={() => rotateBy(0, 0.15)}>⤒</button>
          <button type="button" className="sp3d-icon" title="خفض المنظور" aria-label="خفض المنظور" onClick={() => rotateBy(0, -0.15)}>⤓</button>
        </>}
        {value.controls.zoom && <>
          <button type="button" className="sp3d-icon" title="تكبير" aria-label="تكبير" onClick={() => zoomBy(1.12)}>+</button>
          <button type="button" className="sp3d-icon" title="تصغير" aria-label="تصغير" onClick={() => zoomBy(1 / 1.12)}>−</button>
        </>}
        <button type="button" onClick={reset}>إعادة العرض</button>
      </div>
      <div className="sp3d-options">
        <label>طريقة العرض <select value={style} onChange={e => setStyle(e.target.value as SurfacePlotStyle)}>{(Object.keys(STYLE_LABELS) as SurfacePlotStyle[]).map(k => <option key={k} value={k}>{STYLE_LABELS[k]}</option>)}</select></label>
        <label className="sp3d-check"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> شبكة المحاور</label>
      </div>
      <p id={uid + "-help"} className="sp3d-help">
        {value.controls.rotate ? "اسحب الرسم لتدويره. " : ""}{value.controls.zoom ? "للتكبير: إصبعان على الشاشة اللمسية، أو عجلة الفأرة بعد النقر على الرسم (أو مع Ctrl). " : ""}بعد التركيز على الرسم: {value.controls.rotate ? "الأسهم للتدوير، " : ""}{value.controls.zoom ? "و+ و− للتكبير والتصغير، " : ""}وHome لإعادة العرض.
      </p>
      <div ref={frame} className="sp3d-frame">
        <svg ref={attachTo} className="sp3d-scene" viewBox={"0 0 " + width + " " + height} width="100%" role="img" tabIndex={0}
          aria-label={label} aria-describedby={uid + "-help"} direction="ltr"
          data-yaw={r3(camera.yaw)} data-pitch={r3(camera.pitch)} data-zoom={r3(camera.zoom)} data-level={level} data-polygons={polygons.length}
          data-visible={shown.map(s => s.id).join(" ")} data-interacting={interacting || undefined}
          onKeyDown={e => { if (onKeyDown(e)) e.preventDefault(); }} {...pointerHandlers}>
          <rect className="sp3d-bg" width={width} height={height} />
          {axes.panes.map((p, i) => <polygon key={"pane" + i} className="sp3d-pane" points={p} />)}
          {axes.grid.map((g, i) => <line key={"grid" + i} className="sp3d-grid" x1={g[0].toFixed(1)} y1={g[1].toFixed(1)} x2={g[2].toFixed(1)} y2={g[3].toFixed(1)} />)}
          {axes.edges.map((g, i) => <line key={"edge" + i} className="sp3d-edge" x1={g[0].toFixed(1)} y1={g[1].toFixed(1)} x2={g[2].toFixed(1)} y2={g[3].toFixed(1)} />)}
          {items}
          {axes.ticks.map((t, i) => <text key={"tick" + i} className="sp3d-tick" x={t.x.toFixed(1)} y={t.y.toFixed(1)} textAnchor={t.anchor}>{t.text}</text>)}
          {axes.titles.map(t => <text key={"title-" + t.axis} className="sp3d-axis-title" x={t.x.toFixed(1)} y={t.y.toFixed(1)} textAnchor={t.anchor} data-axis={t.axis}>{t.text}</text>)}
        </svg>
      </div>
      {shown.length === 0 && <p className="sp3d-note" role="status">كل الأسطح مخفية؛ فعّل سطحًا من المفتاح لعرضه.</p>}
      <p className="sp3d-status" dir="ltr">x ∈ [{value.viewport.xMin}, {value.viewport.xMax}] · y ∈ [{value.viewport.yMin}, {value.viewport.yMax}] · z ∈ [{value.viewport.zMin}, {value.viewport.zMax}]</p>
      <details className="sp3d-table">
        <summary>جدول قيم بديل للرسم (يدعم قارئ الشاشة)</summary>
        <div className="sp3d-scroll" tabIndex={0} role="region" aria-label="جدول قيم الأسطح">
          <table>
            <caption>قيم مختارة لكل سطح z = f(x, y)</caption>
            <thead><tr><th scope="col">السطح</th><th scope="col">x</th><th scope="col">y</th><th scope="col">z</th></tr></thead>
            <tbody>{table.map((row, i) => <tr key={i}><td>{row.surface}</td><td dir="ltr">{fmt(row.x)}</td><td dir="ltr">{fmt(row.y)}</td><td dir="ltr">{row.z === null ? "غير معرّفة في نافذة العرض" : fmt(row.z)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
function Swatch({ color }: { color: SurfacePlotColor }) {
  return <span className="sp3d-swatch" style={{ background: swatch(color) }} title={SURFACE_PLOT_COLOR_LABELS[color]} aria-hidden="true" />;
}
