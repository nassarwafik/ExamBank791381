// Phase 21B: owned, closed 3D surface contract. It contains data, never executable code or renderer options.
import { parseExpression, type ExprNode } from "../parametricExpression";
import { CONTROL, RAW_HTML, UNSAFE_BIDI, UNSAFE_INVISIBLE } from "../richContent/proseGuard";

export const SURFACE_LIMITS = Object.freeze({
  textChars: 160, descriptionChars: 600, expressionChars: 500,
  axisAbsMax: 1000, minSteps: 4, maxSteps: 40, maxVertices: 1681,
  maxFaces: 3200, maxEvaluations: 9800
});
export type SurfaceViewport = { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
export type SurfaceCamera = { azimuth: number; elevation: number };
export type SurfaceSpecV1 = {
  version: 1; id: string; title: string; description: string; expression: string;
  viewport: SurfaceViewport; grid: { xSteps: number; ySteps: number };
  camera?: SurfaceCamera;
};
export type SurfaceIssue = { code: string; path: string; message: string };
export type SurfaceResult = { ok: true; value: SurfaceSpecV1; ast: ExprNode; issues: [] }
  | { ok: false; issues: SurfaceIssue[] };

const own = (o: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

function validate(raw: unknown): SurfaceResult {
  const issues: SurfaceIssue[] = [];
  const fail = (code: string, path: string, message: string) => { issues.push({ code, path, message }); };
  const object = (o: unknown, path: string, keys: readonly string[]): Record<string, unknown> | null => {
    if (!isPlain(o)) { fail("SURFACE_OBJECT_INVALID", path, "مطلوب كائن بيانات عادي."); return null; }
    for (const key of Object.keys(o)) if (!keys.includes(key)) fail("SURFACE_UNKNOWN_KEY", path + "." + key, "حقل غير مسموح.");
    return o;
  };
  const number = (v: unknown, path: string, lo: number, hi: number): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      fail("SURFACE_NUMBER_INVALID", path, "قيمة عددية خارج الحدود المسموحة.");
      return null;
    }
    return v === 0 ? 0 : v;
  };
  const text = (v: unknown, path: string, max: number): string | null => {
    if (typeof v !== "string" || !v.trim() || v.length > max || CONTROL.test(v) || RAW_HTML.test(v) || UNSAFE_BIDI.test(v) || UNSAFE_INVISIBLE.test(v)) {
      fail("SURFACE_TEXT_INVALID", path, "النص غير صالح أو يتضمن علامات تحكم غير مسموحة.");
      return null;
    }
    return v;
  };
  const top = object(raw, "surface", ["version", "id", "title", "description", "expression", "viewport", "grid", "camera"]);
  if (!top) return { ok: false, issues };
  if (top.version !== 1) fail("SURFACE_VERSION_INVALID", "surface.version", "إصدار رسم السطح غير مدعوم.");
  const id = top.id;
  if (typeof id !== "string" || !ID.test(id) || ["constructor", "prototype", "__proto__"].includes(id)) fail("SURFACE_ID_INVALID", "surface.id", "معرّف الرسم غير صالح.");
  const title = text(top.title, "surface.title", SURFACE_LIMITS.textChars);
  const description = text(top.description, "surface.description", SURFACE_LIMITS.descriptionChars);
  const expression = top.expression;
  let ast: ExprNode | null = null;
  if (typeof expression !== "string" || expression.trim() === "" || expression.length > SURFACE_LIMITS.expressionChars) {
    fail("SURFACE_EXPRESSION_INVALID", "surface.expression", "اكتب z=f(x,y) بتعبير آمن حتى 500 محرف.");
  } else {
    const parsed = parseExpression(expression, { language: 3 });
    if (!parsed.ok) fail(parsed.code, "surface.expression", "تعذر قراءة معادلة السطح؛ استخدم * للضرب و ^ للأسس.");
    else if (parsed.refs.some(ref => ref !== "x" && ref !== "y")) fail("SURFACE_VARIABLE_INVALID", "surface.expression", "المتغيران الوحيدان هما x و y.");
    else ast = parsed.ast;
  }
  const v = object(top.viewport, "surface.viewport", ["xMin", "xMax", "yMin", "yMax", "zMin", "zMax"]);
  let viewport: SurfaceViewport | null = null;
  if (v) {
    const xMin = number(v.xMin, "surface.viewport.xMin", -SURFACE_LIMITS.axisAbsMax, SURFACE_LIMITS.axisAbsMax);
    const xMax = number(v.xMax, "surface.viewport.xMax", -SURFACE_LIMITS.axisAbsMax, SURFACE_LIMITS.axisAbsMax);
    const yMin = number(v.yMin, "surface.viewport.yMin", -SURFACE_LIMITS.axisAbsMax, SURFACE_LIMITS.axisAbsMax);
    const yMax = number(v.yMax, "surface.viewport.yMax", -SURFACE_LIMITS.axisAbsMax, SURFACE_LIMITS.axisAbsMax);
    const zMin = number(v.zMin, "surface.viewport.zMin", -SURFACE_LIMITS.axisAbsMax, SURFACE_LIMITS.axisAbsMax);
    const zMax = number(v.zMax, "surface.viewport.zMax", -SURFACE_LIMITS.axisAbsMax, SURFACE_LIMITS.axisAbsMax);
    if ([xMin, xMax, yMin, yMax, zMin, zMax].every(n => n !== null)) {
      if (xMin! >= xMax! || yMin! >= yMax! || zMin! >= zMax!) fail("SURFACE_VIEW_INVALID", "surface.viewport", "حدود x و y و z يجب أن تكون تصاعدية.");
      else viewport = { xMin: xMin!, xMax: xMax!, yMin: yMin!, yMax: yMax!, zMin: zMin!, zMax: zMax! };
    }
  }
  const gridRaw = object(top.grid, "surface.grid", ["xSteps", "ySteps"]);
  let grid: SurfaceSpecV1["grid"] | null = null;
  if (gridRaw) {
    const xSteps = number(gridRaw.xSteps, "surface.grid.xSteps", SURFACE_LIMITS.minSteps, SURFACE_LIMITS.maxSteps);
    const ySteps = number(gridRaw.ySteps, "surface.grid.ySteps", SURFACE_LIMITS.minSteps, SURFACE_LIMITS.maxSteps);
    if (xSteps !== null && ySteps !== null) {
      if (!Number.isInteger(xSteps) || !Number.isInteger(ySteps)) fail("SURFACE_GRID_INVALID", "surface.grid", "عدد خطوات الشبكة يجب أن يكون صحيحًا.");
      else grid = { xSteps, ySteps };
    }
  }
  let camera: SurfaceCamera | undefined;
  if (own(top, "camera")) {
    const c = object(top.camera, "surface.camera", ["azimuth", "elevation"]);
    if (c) {
      const azimuth = number(c.azimuth, "surface.camera.azimuth", -Math.PI, Math.PI);
      const elevation = number(c.elevation, "surface.camera.elevation", 0.15, 1.35);
      if (azimuth !== null && elevation !== null) camera = { azimuth, elevation };
    }
  }
  if (issues.length || !title || !description || !viewport || !grid || !ast || typeof id !== "string" || typeof expression !== "string") {
    return { ok: false, issues };
  }
  return { ok: true, value: {
    version: 1, id, title, description, expression, viewport, grid,
    ...(camera ? { camera } : {})
  }, ast, issues: [] };
}
/** Never throws for malformed, hostile, or unsupported input; a canonical copy is emitted on success. */
export function validateSurfaceSpec(raw: unknown): SurfaceResult {
  try { return validate(raw); } catch { return { ok: false, issues: [{ code: "SURFACE_INVALID", path: "surface", message: "تعذر التحقق من رسم السطح." }] }; }
}
