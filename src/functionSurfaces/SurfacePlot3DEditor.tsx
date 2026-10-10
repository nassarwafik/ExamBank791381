import { useMemo, useState } from "react";
import SurfacePlot3DView from "./SurfacePlot3DView";
import { DEFAULT_PLOT_CAMERA, SURFACE_PLOT_COLORS, SURFACE_PLOT_COLOR_LABELS, SURFACE_PLOT_LIMITS, validateSurfacePlotSpec, type SurfacePlotAxis, type SurfacePlotColor, type SurfacePlotSpecV2, type SurfacePlotStyle } from "./surfacePlotSpec";
import { SURFACE_PLOT_PRESET_KEYS, SURFACE_PLOT_PRESET_LABELS, surfacePlotPreset, type SurfacePlotPresetKey } from "./surfacePlotPresets";
import "./surface-plot.css";

// Phase 21D-A.4 — authoring of a multi-surface 3D plot (lazy; the rich-content block editor). Structured fields only, never raw JSON:
// 1 … 5 surfaces (formula, label, colour), the shared domain and z window, axis labels and units, the rendering quality, the default
// display style and grid, which controls the student may use, and the starting view. Whatever the teacher types is kept as typed; the
// canonical validator reports every problem here and blocks finalization — nothing is clamped or repaired. The preview is the real viewer.
type Props = { surface: SurfacePlotSpecV2; name?: string; disabled?: boolean; onChange: (surface: SurfacePlotSpecV2) => void };
const DEG = 180 / Math.PI;
const STYLE_LABELS: Readonly<Record<SurfacePlotStyle, string>> = Object.freeze({ solid: "سطح مصمت", mesh: "سطح مع خطوط الشبكة", transparent: "شفاف مع خطوط الشبكة" });
const AXES = ["x", "y", "z"] as const;
const VIEW_KEYS = ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"] as const;

export default function SurfacePlot3DEditor({ surface, name = "الرسم ثلاثي الأبعاد متعدد الأسطح", disabled, onChange }: Props) {
  const checked = useMemo(() => validateSurfacePlotSpec(surface), [surface]);
  const [preset, setPreset] = useState<SurfacePlotPresetKey>("paraboloids");
  const surfaces = Array.isArray(surface.surfaces) ? surface.surfaces : [];
  const setSurface = (i: number, patch: Partial<SurfacePlotSpecV2["surfaces"][number]>) => onChange({ ...surface, surfaces: surfaces.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const addSurface = () => {
    const used = new Set(surfaces.map(s => s.color)), color = SURFACE_PLOT_COLORS.find(c => !used.has(c)) ?? "blue";
    let n = surfaces.length + 1;
    while (surfaces.some(s => s.id === "surface" + n)) n++;
    onChange({ ...surface, surfaces: [...surfaces, { id: "surface" + n, label: "السطح " + n, expression: "x+y", color }] });
  };
  const setAxis = (k: (typeof AXES)[number], patch: Partial<SurfacePlotAxis>) => {
    const next: SurfacePlotAxis = { ...surface.axes[k], ...patch };
    if (!next.unit) delete next.unit;
    onChange({ ...surface, axes: { ...surface.axes, [k]: next } });
  };
  const camera = surface.camera ?? DEFAULT_PLOT_CAMERA;
  const setCamera = (patch: Partial<typeof camera>) => onChange({ ...surface, camera: { ...camera, ...patch } });
  return (
    <div className="sp3d-editor" data-testid="surface-plot-editor" dir="rtl">
      <div className="sp3d-editor-row">
        <label>قالب جاهز<select aria-label="قالب رسم ثلاثي الأبعاد" value={preset} disabled={disabled} onChange={e => setPreset(e.target.value as SurfacePlotPresetKey)}>{SURFACE_PLOT_PRESET_KEYS.map(k => <option key={k} value={k}>{SURFACE_PLOT_PRESET_LABELS[k]}</option>)}</select></label>
        <div className="sp3d-editor-apply"><button type="button" disabled={disabled} onClick={() => onChange(surfacePlotPreset(preset, surface.id))}>تطبيق القالب</button></div>
      </div>
      <fieldset disabled={disabled}>
        <legend>{name}</legend>
        <div className="sp3d-editor-row">
          <label>العنوان<input value={surface.title} maxLength={SURFACE_PLOT_LIMITS.titleChars} onChange={e => onChange({ ...surface, title: e.target.value })} /></label>
          <label>الوصف<textarea value={surface.description} maxLength={SURFACE_PLOT_LIMITS.descriptionChars} rows={2} onChange={e => onChange({ ...surface, description: e.target.value })} /></label>
        </div>
      </fieldset>
      <fieldset disabled={disabled} data-testid="surface-plot-surfaces">
        <legend>الأسطح ({surfaces.length} من {SURFACE_PLOT_LIMITS.surfacesMax})</legend>
        {surfaces.map((s, i) => (
          <div className="sp3d-surface" key={i} data-testid="surface-plot-surface">
            <label>اسم السطح في المفتاح<input value={s.label} maxLength={SURFACE_PLOT_LIMITS.labelChars} onChange={e => setSurface(i, { label: e.target.value })} /></label>
            <label>المعادلة z = f(x, y)<input dir="ltr" spellCheck={false} autoComplete="off" value={s.expression} maxLength={SURFACE_PLOT_LIMITS.expressionChars} aria-label={"معادلة السطح " + (i + 1)} onChange={e => setSurface(i, { expression: e.target.value })} /></label>
            <label>اللون<select value={s.color} onChange={e => setSurface(i, { color: e.target.value as SurfacePlotColor })}>{SURFACE_PLOT_COLORS.map(c => <option key={c} value={c}>{SURFACE_PLOT_COLOR_LABELS[c]}</option>)}</select></label>
            <button type="button" disabled={surfaces.length <= SURFACE_PLOT_LIMITS.surfacesMin} aria-label={"حذف السطح " + (i + 1)} onClick={() => onChange({ ...surface, surfaces: surfaces.filter((_, k) => k !== i) })}>حذف</button>
          </div>
        ))}
        <button type="button" disabled={surfaces.length >= SURFACE_PLOT_LIMITS.surfacesMax} onClick={addSurface}>+ إضافة سطح</button>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>المجال ونافذة العرض (نظام إحداثيات واحد لكل الأسطح)</legend>
        <div className="sp3d-editor-row">
          {VIEW_KEYS.map(k => <label key={k}>{k}<input dir="ltr" type="number" step="0.1" value={surface.viewport[k]} onChange={e => onChange({ ...surface, viewport: { ...surface.viewport, [k]: Number(e.target.value) } })} /></label>)}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>المحاور</legend>
        <div className="sp3d-editor-row">
          {AXES.map(k => (
            <div key={k} className="sp3d-editor-row">
              <label>اسم المحور {k}<input value={surface.axes[k].label} maxLength={SURFACE_PLOT_LIMITS.axisLabelChars} onChange={e => setAxis(k, { label: e.target.value })} /></label>
              <label>الوحدة (اختيارية)<input value={surface.axes[k].unit ?? ""} maxLength={SURFACE_PLOT_LIMITS.unitChars} onChange={e => setAxis(k, { unit: e.target.value })} /></label>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>العرض وما يُسمح للطالب به</legend>
        <div className="sp3d-editor-row">
          <label>الدقة<select value={surface.quality} onChange={e => onChange({ ...surface, quality: e.target.value as SurfacePlotSpecV2["quality"] })}><option value="standard">قياسية</option><option value="high">عالية</option></select></label>
          <label>طريقة العرض الافتراضية<select value={surface.display.style} onChange={e => onChange({ ...surface, display: { ...surface.display, style: e.target.value as SurfacePlotStyle } })}>{(Object.keys(STYLE_LABELS) as SurfacePlotStyle[]).map(k => <option key={k} value={k}>{STYLE_LABELS[k]}</option>)}</select></label>
          <label className="sp3d-inline"><input type="checkbox" checked={surface.display.grid} onChange={e => onChange({ ...surface, display: { ...surface.display, grid: e.target.checked } })} />شبكة المحاور</label>
          <label className="sp3d-inline"><input type="checkbox" checked={surface.controls.rotate} onChange={e => onChange({ ...surface, controls: { ...surface.controls, rotate: e.target.checked } })} />السماح بالتدوير</label>
          <label className="sp3d-inline"><input type="checkbox" checked={surface.controls.zoom} onChange={e => onChange({ ...surface, controls: { ...surface.controls, zoom: e.target.checked } })} />السماح بالتكبير</label>
          <label className="sp3d-inline"><input type="checkbox" checked={surface.controls.toggleSurfaces} onChange={e => onChange({ ...surface, controls: { ...surface.controls, toggleSurfaces: e.target.checked } })} />السماح بإخفاء الأسطح وإظهارها</label>
        </div>
        <div className="sp3d-editor-row">
          <label>زاوية الدوران الابتدائية (°)<input dir="ltr" type="number" step="5" value={Math.round(camera.azimuth * DEG * 10) / 10} onChange={e => setCamera({ azimuth: Number(e.target.value) / DEG })} /></label>
          <label>زاوية الارتفاع الابتدائية (°)<input dir="ltr" type="number" step="5" value={Math.round(camera.elevation * DEG * 10) / 10} onChange={e => setCamera({ elevation: Number(e.target.value) / DEG })} /></label>
          <label>التكبير الابتدائي<input dir="ltr" type="number" step="0.1" value={camera.zoom} onChange={e => setCamera({ zoom: Number(e.target.value) })} /></label>
        </div>
      </fieldset>
      <p className="sp3d-help">اللغة الرياضية آمنة ومحدودة: استعمل x و y فقط، و * للضرب و ^ للأسس، والدوال sqrt و sin و cos و tan و exp و ln و abs وغيرها.</p>
      {checked.ok
        ? <SurfacePlot3DView spec={checked.value} />
        : <div className="sp3d-editor-errors" role="alert"><strong>صحّح الرسم قبل الحفظ النهائي:</strong><ul>{checked.issues.slice(0, 12).map((i, n) => <li key={n}>{i.message} ({i.code})</li>)}</ul></div>}
    </div>
  );
}
