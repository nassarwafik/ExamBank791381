// Phase 21D-A.4 — SurfacePlotSpecV2: the versioned MULTI-SURFACE 3D plot contract (pure data; compiled into the shared server build).
//
// One plot draws 1 … 5 explicit surfaces z = f(x, y) in ONE coordinate system (shared viewport and axes), each with its own formula,
// display label and colour. It lives in the existing `functionSurface3D` rich-content block (`surface.version: 2`), next to the frozen
// Phase 21B SurfaceSpecV1 (`surface.version: 1`), which keeps its validator, renderer and behaviour unchanged. The contract holds data
// only — formulas are parsed by the safe expression engine (language 3, variables x and y), never evaluated as code — and every field is
// checked strictly: unknown keys, foreign variables, duplicate ids / colours, inverted or non-finite windows and a surface that is not
// visible anywhere in the authored window are REFUSED with a reason, never clamped or silently drawn as nonsense.
import { evaluateExpression, parseExpression, type ExprNode } from "../parametricExpression";
import { CONTROL, RAW_HTML, UNSAFE_BIDI, UNSAFE_INVISIBLE } from "../richContent/proseGuard";
import type { SurfaceViewport } from "./surfaceSpec";

export const SURFACE_PLOT_VERSION = 2 as const;
/** The text, formula and axis bounds of the Phase 21B contract, kept equal for V2 (a separate contract: the V2 module never imports V1). */
const SURFACE_LIMITS = Object.freeze({ textChars: 160, descriptionChars: 600, expressionChars: 500, axisAbsMax: 1000 });
const SURFACE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const SURFACE_PLOT_LIMITS = Object.freeze({
  surfacesMin: 1, surfacesMax: 5, labelChars: 60, axisLabelChars: 24, unitChars: 16,
  titleChars: SURFACE_LIMITS.textChars, descriptionChars: SURFACE_LIMITS.descriptionChars, expressionChars: SURFACE_LIMITS.expressionChars,
  azimuthAbs: Math.PI, pitchAbs: 1.45, zoomMin: 0.6, zoomMax: 2.5,
  /** visibility probe: a surface must have at least one defined point inside the z window on this (n + 1)² lattice */
  probeSteps: 24
});
/** Surface colours: hue families of the shared 3D palette (Phase 21D lighting), distinct in hue and lightness. */
export const SURFACE_PLOT_COLORS = Object.freeze(["blue", "amber", "green", "rose", "lavender"] as const);
export type SurfacePlotColor = (typeof SURFACE_PLOT_COLORS)[number];
export const SURFACE_PLOT_COLOR_LABELS: Readonly<Record<SurfacePlotColor, string>> = Object.freeze({ blue: "أزرق", amber: "كهرماني", green: "أخضر", rose: "وردي", lavender: "بنفسجي فاتح" });
/** The starting view of a plot without an authored camera (x towards the viewer on the right, y away, seen from above). */
export const DEFAULT_PLOT_CAMERA: Readonly<SurfacePlotCamera> = Object.freeze({ azimuth: -0.6, elevation: 0.45, zoom: 1 });
export const SURFACE_PLOT_QUALITIES = Object.freeze(["standard", "high"] as const);
export type SurfacePlotQuality = (typeof SURFACE_PLOT_QUALITIES)[number];
export const SURFACE_PLOT_STYLES = Object.freeze(["solid", "mesh", "transparent"] as const);
export type SurfacePlotStyle = (typeof SURFACE_PLOT_STYLES)[number];

export type SurfacePlotSurfaceV2 = { id: string; label: string; expression: string; color: SurfacePlotColor };
export type SurfacePlotAxis = { label: string; unit?: string };
export type SurfacePlotCamera = { azimuth: number; elevation: number; zoom: number };
export type SurfacePlotSpecV2 = {
  version: 2; id: string; title: string; description: string;
  surfaces: SurfacePlotSurfaceV2[];
  viewport: SurfaceViewport;
  axes: { x: SurfacePlotAxis; y: SurfacePlotAxis; z: SurfacePlotAxis };
  quality: SurfacePlotQuality;
  display: { style: SurfacePlotStyle; grid: boolean };
  controls: { rotate: boolean; zoom: boolean; toggleSurfaces: boolean };
  camera?: SurfacePlotCamera;
};
export type SurfacePlotIssue = { code: string; path: string; message: string };
export type SurfacePlotResult = { ok: true; value: SurfacePlotSpecV2; asts: ExprNode[]; issues: [] } | { ok: false; issues: SurfacePlotIssue[] };

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const RESERVED = ["constructor", "prototype", "__proto__"];
const L = SURFACE_PLOT_LIMITS;

/** Is this stored block payload a version-2 plot? (Anything else is validated by the frozen V1 authority, which refuses it.) */
export const isSurfacePlotPayload = (raw: unknown): boolean => isPlain(raw) && raw.version === SURFACE_PLOT_VERSION;

/** Whether a parsed surface has at least one defined point inside the z window on a (probeSteps + 1)² lattice of the domain. */
export function surfaceVisibleInWindow(ast: ExprNode, v: SurfaceViewport, steps: number = L.probeSteps): boolean {
  const values = new Map<string, number>([["x", 0], ["y", 0]]);
  for (let j = 0; j <= steps; j++) for (let i = 0; i <= steps; i++) {
    values.set("x", v.xMin + ((v.xMax - v.xMin) * i) / steps); values.set("y", v.yMin + ((v.yMax - v.yMin) * j) / steps);
    const r = evaluateExpression(ast, values);
    if (r.ok && Number.isFinite(r.value) && r.value >= v.zMin && r.value <= v.zMax) return true;
  }
  return false;
}

function validate(raw: unknown): SurfacePlotResult {
  const issues: SurfacePlotIssue[] = [];
  const fail = (code: string, path: string, message: string) => { issues.push({ code, path, message }); };
  const object = (o: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null => {
    if (!isPlain(o)) { fail("SURFACE_PLOT_OBJECT_INVALID", path, "مطلوب كائن بيانات عادي."); return null; }
    for (const key of Object.keys(o)) if (!keys.includes(key)) fail("SURFACE_PLOT_UNKNOWN_KEY", path + "." + key, "حقل غير مسموح في الرسم ثلاثي الأبعاد: " + key);
    for (const key of keys) if (!optional.includes(key) && !own(o, key)) fail("SURFACE_PLOT_MISSING_KEY", path + "." + key, "حقل مطلوب مفقود: " + key);
    return o;
  };
  const number = (v: unknown, path: string, lo: number, hi: number): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) { fail("SURFACE_PLOT_NUMBER_INVALID", path, "قيمة عددية خارج الحدود المسموحة (" + lo + " … " + hi + ")."); return null; }
    return v === 0 ? 0 : v;
  };
  const text = (v: unknown, path: string, max: number): string | null => {
    if (typeof v !== "string" || !v.trim() || v.length > max || CONTROL.test(v) || RAW_HTML.test(v) || UNSAFE_BIDI.test(v) || UNSAFE_INVISIBLE.test(v)) {
      fail("SURFACE_PLOT_TEXT_INVALID", path, "النص فارغ أو أطول من " + max + " محرفًا أو يتضمن علامات غير مسموحة."); return null;
    }
    return v;
  };
  const bool = (v: unknown, path: string): boolean | null => (typeof v === "boolean" ? v : (fail("SURFACE_PLOT_FLAG_INVALID", path, "القيمة يجب أن تكون صحيحًا أو خطأً."), null));
  const ident = (v: unknown, path: string): string | null =>
    typeof v === "string" && SURFACE_ID.test(v) && !RESERVED.includes(v) ? v : (fail("SURFACE_PLOT_ID_INVALID", path, "المعرّف غير صالح (حرف لاتيني أولًا، حتى 32 محرفًا)."), null);

  const top = object(raw, "surface", ["version", "id", "title", "description", "surfaces", "viewport", "axes", "quality", "display", "controls", "camera"], ["camera"]);
  if (!top) return { ok: false, issues };
  if (top.version !== SURFACE_PLOT_VERSION) fail("SURFACE_PLOT_VERSION_INVALID", "surface.version", "إصدار الرسم متعدد الأسطح غير مدعوم.");
  const id = ident(top.id, "surface.id");
  const title = text(top.title, "surface.title", SURFACE_LIMITS.textChars);
  const description = text(top.description, "surface.description", SURFACE_LIMITS.descriptionChars);

  // viewport (the shared coordinate system): the domain of x and y and the displayed z window
  const vr = object(top.viewport, "surface.viewport", ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"]);
  let viewport: SurfaceViewport | null = null;
  if (vr) {
    const A = SURFACE_LIMITS.axisAbsMax, at = (k: string) => number(vr[k], "surface.viewport." + k, -A, A);
    const [xMin, xMax, yMin, yMax, zMin, zMax] = ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"].map(at);
    if ([xMin, xMax, yMin, yMax, zMin, zMax].every(n => n !== null)) {
      if (xMin! >= xMax! || yMin! >= yMax! || zMin! >= zMax!) fail("SURFACE_PLOT_VIEW_INVALID", "surface.viewport", "حدود x و y و z يجب أن تكون تصاعدية (الأدنى أصغر من الأعلى).");
      else viewport = { xMin: xMin!, xMax: xMax!, yMin: yMin!, yMax: yMax!, zMin: zMin!, zMax: zMax! };
    }
  }

  // surfaces: 1 … 5, each its own formula, label and colour; ids and colours unique (colour is the visual distinction)
  const surfaces: SurfacePlotSurfaceV2[] = [], asts: ExprNode[] = [];
  if (!Array.isArray(top.surfaces) || top.surfaces.length < L.surfacesMin || top.surfaces.length > L.surfacesMax) {
    fail("SURFACE_PLOT_SURFACES_COUNT", "surface.surfaces", "الرسم يضم من " + L.surfacesMin + " إلى " + L.surfacesMax + " أسطح.");
  } else {
    const ids = new Set<string>(), colors = new Set<string>();
    top.surfaces.forEach((s, i) => {
      const at = "surface.surfaces[" + i + "]", o = object(s, at, ["id", "label", "expression", "color"]);
      if (!o) return;
      const sid = ident(o.id, at + ".id"), label = text(o.label, at + ".label", L.labelChars);
      const color = typeof o.color === "string" && (SURFACE_PLOT_COLORS as readonly string[]).includes(o.color) ? (o.color as SurfacePlotColor) : null;
      if (!color) fail("SURFACE_PLOT_COLOR_INVALID", at + ".color", "اللون غير مدعوم (" + SURFACE_PLOT_COLORS.join("، ") + ").");
      if (sid && ids.has(sid)) fail("SURFACE_PLOT_ID_DUPLICATE", at + ".id", "معرّف السطح مكرر: " + sid);
      if (color && colors.has(color)) fail("SURFACE_PLOT_COLOR_DUPLICATE", at + ".color", "لكل سطح لون مختلف ليتميز في الرسم وفي المفتاح.");
      let ast: ExprNode | null = null;
      const expression = o.expression;
      if (typeof expression !== "string" || !expression.trim() || expression.length > SURFACE_LIMITS.expressionChars) {
        fail("SURFACE_PLOT_EXPRESSION_INVALID", at + ".expression", "اكتب z = f(x, y) بتعبير آمن حتى " + SURFACE_LIMITS.expressionChars + " محرف.");
      } else {
        const parsed = parseExpression(expression, { language: 3 });
        if (!parsed.ok) fail("SURFACE_PLOT_EXPRESSION_INVALID", at + ".expression", "تعذر قراءة معادلة السطح «" + (label ?? expression) + "»؛ استخدم * للضرب و ^ للأسس. [" + parsed.code + "]");
        else if (parsed.refs.some(ref => ref !== "x" && ref !== "y")) fail("SURFACE_PLOT_VARIABLE_INVALID", at + ".expression", "المتغيران الوحيدان هما x و y.");
        else ast = parsed.ast;
      }
      if (sid) ids.add(sid);
      if (color) colors.add(color);
      if (sid && label && color && ast && typeof expression === "string") { surfaces.push({ id: sid, label, expression, color }); asts.push(ast); }
    });
  }

  // axes: a label for each axis and an optional unit
  const ar = object(top.axes, "surface.axes", ["x", "y", "z"]);
  let axes: SurfacePlotSpecV2["axes"] | null = null;
  if (ar) {
    const axis = (k: "x" | "y" | "z"): SurfacePlotAxis | null => {
      const at = "surface.axes." + k, o = object(ar[k], at, ["label", "unit"], ["unit"]);
      if (!o) return null;
      const label = text(o.label, at + ".label", L.axisLabelChars);
      const unit = own(o, "unit") ? text(o.unit, at + ".unit", L.unitChars) : undefined;
      return label && unit !== null ? { label, ...(unit ? { unit } : {}) } : null;
    };
    const x = axis("x"), y = axis("y"), z = axis("z");
    if (x && y && z) axes = { x, y, z };
  }
  const quality = (SURFACE_PLOT_QUALITIES as readonly unknown[]).includes(top.quality) ? (top.quality as SurfacePlotQuality) : (fail("SURFACE_PLOT_QUALITY_INVALID", "surface.quality", "جودة الرسم: standard أو high."), null);
  const dr = object(top.display, "surface.display", ["style", "grid"]);
  let display: SurfacePlotSpecV2["display"] | null = null;
  if (dr) {
    const style = (SURFACE_PLOT_STYLES as readonly unknown[]).includes(dr.style) ? (dr.style as SurfacePlotStyle) : (fail("SURFACE_PLOT_STYLE_INVALID", "surface.display.style", "نمط العرض: solid أو mesh أو transparent."), null);
    const grid = bool(dr.grid, "surface.display.grid");
    if (style && grid !== null) display = { style, grid };
  }
  const cr = object(top.controls, "surface.controls", ["rotate", "zoom", "toggleSurfaces"]);
  let controls: SurfacePlotSpecV2["controls"] | null = null;
  if (cr) {
    const rotate = bool(cr.rotate, "surface.controls.rotate"), zoom = bool(cr.zoom, "surface.controls.zoom"), toggleSurfaces = bool(cr.toggleSurfaces, "surface.controls.toggleSurfaces");
    if (rotate !== null && zoom !== null && toggleSurfaces !== null) controls = { rotate, zoom, toggleSurfaces };
  }
  let camera: SurfacePlotCamera | undefined;
  if (own(top, "camera")) {
    const c = object(top.camera, "surface.camera", ["azimuth", "elevation", "zoom"]);
    if (c) {
      const azimuth = number(c.azimuth, "surface.camera.azimuth", -L.azimuthAbs, L.azimuthAbs);
      const elevation = number(c.elevation, "surface.camera.elevation", -L.pitchAbs, L.pitchAbs);
      const zoom = number(c.zoom, "surface.camera.zoom", L.zoomMin, L.zoomMax);
      if (azimuth !== null && elevation !== null && zoom !== null) camera = { azimuth, elevation, zoom };
    }
  }
  // a surface that is undefined everywhere, or never inside the z window, would draw nothing: refused with a reason instead
  if (viewport && !issues.length) surfaces.forEach((s, i) => {
    if (!surfaceVisibleInWindow(asts[i], viewport!)) fail("SURFACE_PLOT_SURFACE_NOT_VISIBLE", "surface.surfaces[" + i + "]", "السطح «" + s.label + "» غير معرّف أو خارج نافذة z المعروضة في كل المجال؛ عدّل المجال أو حدود z.");
  });
  if (issues.length || !id || !title || !description || !viewport || !axes || !quality || !display || !controls || surfaces.length === 0) return { ok: false, issues };
  return { ok: true, value: { version: SURFACE_PLOT_VERSION, id, title, description, surfaces, viewport, axes, quality, display, controls, ...(camera ? { camera } : {}) }, asts, issues: [] };
}
/** Never throws for malformed, hostile or unsupported input; a canonical copy (fixed key order, no foreign field) is emitted on success. */
export function validateSurfacePlotSpec(raw: unknown): SurfacePlotResult {
  try { return validate(raw); } catch { return { ok: false, issues: [{ code: "SURFACE_PLOT_INVALID", path: "surface", message: "تعذر التحقق من الرسم ثلاثي الأبعاد." }] }; }
}
/** Characters of stored prose and formulas (rich-content document limits). */
export const surfacePlotStoredChars = (s: SurfacePlotSpecV2): number =>
  s.title.length + s.description.length + s.surfaces.reduce((n, x) => n + x.label.length + x.expression.length, 0) + s.axes.x.label.length + s.axes.y.label.length + s.axes.z.label.length;
/** Plain text of a plot (search, accessibility summaries). */
export const surfacePlotPlainText = (s: SurfacePlotSpecV2): string =>
  [s.title, s.description, ...s.surfaces.map(x => x.label + ": z = " + x.expression)].join("\n");
