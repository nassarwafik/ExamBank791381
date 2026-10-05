// Phase 19D — the ONE shared VISUAL GEOMETRY engine for the visual question families (hotspot@1, labelDiagram@1). Pure (no DOM, no
// React, no I/O, no randomness, no dependencies): compiled into the shared server build so authoring, finalization, the student
// renderer, the authoritative grader and the teacher review apply byte-identical geometry.
//
// Coordinate system: NORMALIZED coordinates relative to the displayed image CONTENT — x and y in [0, 1] (0,0 = top-left of the
// image content, 1,1 = bottom-right). Browser pixels, device DPI and responsive layout never enter academic authority: the UI
// converts a pointer position to this space (clientPointToNormalized, letterboxing excluded) and everything persisted is normalized.
// Shapes are defined IN normalized space: a circle is a circle of radius r in (x, y) units — on a non-square image it renders as an
// ellipse, consistently with grading.
//
// Strictness: published geometry is VALIDATED, never repaired. Unknown or prototype-sensitive keys, non-finite numbers, values
// outside [0, 1], rectangles extending past the image, zero / tiny shapes, oversized radii, polygons outside 3..20 points, duplicate
// vertices, self-intersecting or zero-area polygons are refused with a stable code. Clamping exists ONLY for UI pointer input.
//
// Boundary semantics (deterministic, documented): rectangle edges, circle circumference and polygon edges / vertices count as INSIDE,
// with a numeric epsilon of 1e-9 to absorb floating representation error.

export const VISUAL_EPSILON = 1e-9;
export const VISUAL_LIMITS = Object.freeze({ regions: 50, polygonPoints: 20, minSize: 0.005, maxRadius: 0.5, minPolygonArea: 0.0001, idChars: 32, decimals: 6 });
export type NormalizedPoint = { x: number; y: number };
export type VisualRect = { kind: "rect"; x: number; y: number; width: number; height: number };
export type VisualCircle = { kind: "circle"; cx: number; cy: number; r: number };
export type VisualPolygon = { kind: "polygon"; points: NormalizedPoint[] };
export type VisualShape = VisualRect | VisualCircle | VisualPolygon;
export type VisualBox = { x: number; y: number; width: number; height: number };
export type VisualShapeResult = { ok: true; shape: VisualShape } | { ok: false; code: string };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
/** Own keys are EXACTLY `keys` (no extra, no missing, no prototype-sensitive key). */
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && own.every(k => keys.includes(k) && !FORBIDDEN_KEYS.has(k));
};
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
/** A stable visual id (region / zone / label): ASCII letter first, then letters / digits / _ / -, ≤ 32 chars, never prototype-sensitive. */
export const isVisualId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v) && !FORBIDDEN_KEYS.has(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A finite number in [0, 1] (boundaries included). */
export const isNormalizedCoordinate = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1;

/** Exactly `{ x, y }`, both finite in [0, 1]; anything else is null (published / submitted data is never clamped). */
export function validateNormalizedPoint(raw: unknown): NormalizedPoint | null {
  if (!isPlain(raw) || !exactKeys(raw, ["x", "y"]) || !isNormalizedCoordinate(raw.x) || !isNormalizedCoordinate(raw.y)) return null;
  return { x: raw.x, y: raw.y };
}

// ── polygon helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Absolute polygon area (shoelace). */
export function polygonArea(points: readonly NormalizedPoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) { const p = points[i], q = points[(i + 1) % points.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}
const cross = (o: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const onSegment = (p: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint): boolean => {
  if (Math.abs(cross(a, b, p)) > VISUAL_EPSILON) return false;
  return p.x >= Math.min(a.x, b.x) - VISUAL_EPSILON && p.x <= Math.max(a.x, b.x) + VISUAL_EPSILON && p.y >= Math.min(a.y, b.y) - VISUAL_EPSILON && p.y <= Math.max(a.y, b.y) + VISUAL_EPSILON;
};
/** True when segments ab and cd intersect or touch (collinear overlap included). */
function segmentsIntersect(a: NormalizedPoint, b: NormalizedPoint, c: NormalizedPoint, d: NormalizedPoint): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > VISUAL_EPSILON && d2 < -VISUAL_EPSILON) || (d1 < -VISUAL_EPSILON && d2 > VISUAL_EPSILON)) && ((d3 > VISUAL_EPSILON && d4 < -VISUAL_EPSILON) || (d3 < -VISUAL_EPSILON && d4 > VISUAL_EPSILON))) return true;
  return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}
/** A simple polygon: no two NON-adjacent edges intersect or touch. */
function isSimplePolygon(points: readonly NormalizedPoint[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;                 // adjacent edges share a vertex by construction
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false;
    }
  }
  return true;
}

// ── shape validation (strict, canonical) ───────────────────────────────────────────────────────────────────────────────────
/**
 * Validates a shape and returns its CANONICAL form (fixed key order). Codes: VISUAL_SHAPE_INVALID (not an object, unknown / missing /
 * prototype keys, non-finite or non-number values), VISUAL_SHAPE_KIND_UNKNOWN, VISUAL_SHAPE_OUT_OF_RANGE (a coordinate outside [0, 1]
 * or a rectangle extending past the image), VISUAL_SHAPE_DEGENERATE (zero / tiny size, duplicate vertices, zero-area polygon),
 * VISUAL_CIRCLE_RADIUS (radius above the safe bound), VISUAL_POLYGON_POINTS (3..20), VISUAL_POLYGON_SELF_INTERSECTING.
 */
export function validateVisualShape(raw: unknown): VisualShapeResult {
  if (!isPlain(raw)) return { ok: false, code: "VISUAL_SHAPE_INVALID" };
  const fail = (code: string): VisualShapeResult => ({ ok: false, code });
  if (raw.kind === "rect") {
    if (!exactKeys(raw, ["kind", "x", "y", "width", "height"])) return fail("VISUAL_SHAPE_INVALID");
    const { x, y, width, height } = raw;
    if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return fail("VISUAL_SHAPE_INVALID");
    if (!isNormalizedCoordinate(x) || !isNormalizedCoordinate(y)) return fail("VISUAL_SHAPE_OUT_OF_RANGE");
    if (width < VISUAL_LIMITS.minSize || height < VISUAL_LIMITS.minSize) return fail(width > 1 || height > 1 ? "VISUAL_SHAPE_OUT_OF_RANGE" : "VISUAL_SHAPE_DEGENERATE");
    if (x + width > 1 + VISUAL_EPSILON || y + height > 1 + VISUAL_EPSILON) return fail("VISUAL_SHAPE_OUT_OF_RANGE");
    return { ok: true, shape: { kind: "rect", x, y, width, height } };
  }
  if (raw.kind === "circle") {
    if (!exactKeys(raw, ["kind", "cx", "cy", "r"])) return fail("VISUAL_SHAPE_INVALID");
    const { cx, cy, r } = raw;
    if (!finite(cx) || !finite(cy) || !finite(r)) return fail("VISUAL_SHAPE_INVALID");
    if (!isNormalizedCoordinate(cx) || !isNormalizedCoordinate(cy)) return fail("VISUAL_SHAPE_OUT_OF_RANGE");
    if (r < VISUAL_LIMITS.minSize) return fail("VISUAL_SHAPE_DEGENERATE");
    if (r > VISUAL_LIMITS.maxRadius) return fail("VISUAL_CIRCLE_RADIUS");
    return { ok: true, shape: { kind: "circle", cx, cy, r } };
  }
  if (raw.kind === "polygon") {
    if (!exactKeys(raw, ["kind", "points"])) return fail("VISUAL_SHAPE_INVALID");
    const list = raw.points;
    if (!Array.isArray(list) || list.length < 3 || list.length > VISUAL_LIMITS.polygonPoints) return fail("VISUAL_POLYGON_POINTS");
    const points: NormalizedPoint[] = [];
    for (const p of list) {
      if (!isPlain(p) || !exactKeys(p, ["x", "y"]) || !finite(p.x) || !finite(p.y)) return fail("VISUAL_SHAPE_INVALID");
      if (!isNormalizedCoordinate(p.x) || !isNormalizedCoordinate(p.y)) return fail("VISUAL_SHAPE_OUT_OF_RANGE");
      points.push({ x: p.x, y: p.y });
    }
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++)
      if (Math.abs(points[i].x - points[j].x) <= VISUAL_EPSILON && Math.abs(points[i].y - points[j].y) <= VISUAL_EPSILON) return fail("VISUAL_SHAPE_DEGENERATE");
    if (!isSimplePolygon(points)) return fail("VISUAL_POLYGON_SELF_INTERSECTING");
    if (polygonArea(points) < VISUAL_LIMITS.minPolygonArea) return fail("VISUAL_SHAPE_DEGENERATE");
    return { ok: true, shape: { kind: "polygon", points } };
  }
  return fail(raw.kind === undefined || typeof raw.kind === "string" ? "VISUAL_SHAPE_KIND_UNKNOWN" : "VISUAL_SHAPE_INVALID");
}

// ── containment (boundary inside, epsilon 1e-9) ────────────────────────────────────────────────────────────────────────────
export function pointInRect(p: NormalizedPoint, r: VisualRect): boolean {
  return p.x >= r.x - VISUAL_EPSILON && p.x <= r.x + r.width + VISUAL_EPSILON && p.y >= r.y - VISUAL_EPSILON && p.y <= r.y + r.height + VISUAL_EPSILON;
}
export function pointInCircle(p: NormalizedPoint, c: VisualCircle): boolean {
  const dx = p.x - c.cx, dy = p.y - c.cy, lim = c.r + VISUAL_EPSILON;
  return dx * dx + dy * dy <= lim * lim;
}
/** Even-odd ray casting; any point ON an edge or vertex counts as inside (checked first, so rays through vertices never matter there). */
export function pointInPolygon(p: NormalizedPoint, poly: VisualPolygon): boolean {
  const pts = poly.points, n = pts.length;
  for (let i = 0; i < n; i++) if (onSegment(p, pts[i], pts[(i + 1) % n])) return true;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function shapeContainsPoint(shape: VisualShape, p: NormalizedPoint): boolean {
  if (shape.kind === "rect") return pointInRect(p, shape);
  if (shape.kind === "circle") return pointInCircle(p, shape);
  return pointInPolygon(p, shape);
}
export function shapeBoundingBox(shape: VisualShape): VisualBox {
  if (shape.kind === "rect") return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  if (shape.kind === "circle") return { x: shape.cx - shape.r, y: shape.cy - shape.r, width: 2 * shape.r, height: 2 * shape.r };
  const xs = shape.points.map(q => q.x), ys = shape.points.map(q => q.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
/** The visual centre of a shape (label anchor): rectangle / bounding-box centre, circle centre, polygon vertex centroid. */
export function shapeAnchor(shape: VisualShape): NormalizedPoint {
  if (shape.kind === "circle") return { x: shape.cx, y: shape.cy };
  if (shape.kind === "polygon") return { x: shape.points.reduce((s, q) => s + q.x, 0) / shape.points.length, y: shape.points.reduce((s, q) => s + q.y, 0) / shape.points.length };
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

// ── one-to-one matching ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * MAXIMUM bipartite matching between points and shapes (a point satisfies at most one shape and a shape is satisfied at most once).
 * The SIZE is the maximum possible, hence independent of point / shape order (overlapping targets are resolved optimally — never by
 * greedy order); `targetOfPoint[i]` is the shape index assigned to point i (deterministic for a given input order) or null.
 * Bounded input (≤ 50 × 50) — augmenting paths (Kuhn), O(P·S·(P+S)).
 */
export function maxOneToOneMatching(points: readonly NormalizedPoint[], shapes: readonly VisualShape[]): { size: number; targetOfPoint: (number | null)[] } {
  const adj = points.map(p => shapes.map((s, j) => (shapeContainsPoint(s, p) ? j : -1)).filter(j => j >= 0));
  const pointOfShape: (number | null)[] = shapes.map(() => null);
  const tryAssign = (i: number, seen: boolean[]): boolean => {
    for (const j of adj[i]) {
      if (seen[j]) continue;
      seen[j] = true;
      const owner = pointOfShape[j];
      if (owner === null || tryAssign(owner, seen)) { pointOfShape[j] = i; return true; }
    }
    return false;
  };
  let size = 0;
  for (let i = 0; i < points.length; i++) if (tryAssign(i, shapes.map(() => false))) size++;
  const targetOfPoint: (number | null)[] = points.map(() => null);
  pointOfShape.forEach((i, j) => { if (i !== null) targetOfPoint[i] = j; });
  return { size, targetOfPoint };
}

// ── pointer conversion (UI only) ───────────────────────────────────────────────────────────────────────────────────────────
export type PixelBox = { left: number; top: number; width: number; height: number };
const roundTo = (v: number, d: number) => { const f = 10 ** d; return Math.round(v * f) / f; };
/** The rectangle the image CONTENT occupies inside a box rendered with `object-fit: contain` (letterboxing excluded), box-relative. */
export function containedContentRect(box: { width: number; height: number }, natural: { width: number; height: number }): PixelBox {
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale, height = natural.height * scale;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}
/**
 * A client (viewport) pointer position → normalized image-content coordinates, rounded to 6 decimals. `box` is the image ELEMENT's
 * client rect; with `natural` (the intrinsic image size) the content rectangle is computed as for `object-fit: contain`, and a pointer
 * in the letterbox (or outside the element, or before the image has a size) yields null. The ONLY clamping in the engine happens here,
 * for sub-pixel rounding at the content edge — never for published or submitted data.
 */
export function clientPointToNormalized(client: { x: number; y: number }, box: PixelBox, natural?: { width: number; height: number }): NormalizedPoint | null {
  if (!finite(client.x) || !finite(client.y) || !(box.width > 0) || !(box.height > 0)) return null;
  let content: PixelBox = { left: 0, top: 0, width: box.width, height: box.height };
  if (natural) {
    if (!(natural.width > 0) || !(natural.height > 0)) return null;
    content = containedContentRect(box, natural);
  }
  const x = (client.x - box.left - content.left) / content.width, y = (client.y - box.top - content.top) / content.height;
  const tol = 1e-6;
  if (x < -tol || x > 1 + tol || y < -tol || y > 1 + tol) return null;
  return { x: clampUnit(roundTo(x, VISUAL_LIMITS.decimals)), y: clampUnit(roundTo(y, VISUAL_LIMITS.decimals)) };
}
/** UI-only clamp into [0, 1] (pointer input, dragged shapes). NEVER used to repair published or submitted data. */
export const clampUnit = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Rounds a normalized value for persistence (authoring UI). */
export const roundNormalized = (v: number, decimals = 4): number => roundTo(v, decimals);

// ── the canonical question image as an asset IDENTITY ──────────────────────────────────────────────────────────────────────
// The visual types use the question's EXISTING canonical image (`image: { exists, visible, assets: [asset] }`, Phase 5B) — no second
// asset system. Its identity is either an EMBEDDED image (data:image/png|jpeg|webp|svg+xml, the uploaded / AI-generated path) or a
// BANK asset (origin "bank" + a safe blobName; the browser URL is a short-lived signed credential minted at delivery and never
// authority). Browser object URLs, remote / signed URLs on non-bank assets and local paths are refused.
export type VisualImageResult = { ok: true; source: "embedded" | "bank" } | { ok: false; code: "VISUAL_IMAGE_MISSING" | "VISUAL_IMAGE_HIDDEN" | "VISUAL_IMAGE_ASSET_INVALID" };
const EMBEDDED_IMAGE = /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/;
const SAFE_BLOB_NAME = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,255}$/;
export function validateVisualImage(raw: unknown): VisualImageResult {
  if (!isPlain(raw) || raw.exists !== true || !Array.isArray(raw.assets) || raw.assets.length === 0) return { ok: false, code: "VISUAL_IMAGE_MISSING" };
  // Same rule as student delivery (applyStudentMediaVisibility ships assets only when `visible` is true): a missing flag is hidden.
  if (raw.visible !== true) return { ok: false, code: "VISUAL_IMAGE_HIDDEN" };
  const a = raw.assets[0];
  if (!isPlain(a)) return { ok: false, code: "VISUAL_IMAGE_ASSET_INVALID" };
  if (a.origin === "bank") {
    const b = a.blobName;
    return typeof b === "string" && SAFE_BLOB_NAME.test(b) && !b.includes("..") && !b.includes("//") ? { ok: true, source: "bank" } : { ok: false, code: "VISUAL_IMAGE_ASSET_INVALID" };
  }
  return typeof a.dataUrl === "string" && EMBEDDED_IMAGE.test(a.dataUrl) ? { ok: true, source: "embedded" } : { ok: false, code: "VISUAL_IMAGE_ASSET_INVALID" };
}
/** The URL a renderer may load for a valid visual image (the embedded data URL, or the delivery-time signed bank URL), else null. */
export function visualImageSrc(raw: unknown): string | null {
  if (!validateVisualImage(raw).ok) return null;
  const a = (raw as { assets: Record<string, unknown>[] }).assets[0];
  return typeof a.dataUrl === "string" && a.dataUrl !== "" ? a.dataUrl : null;
}
/** Arabic messages for the image codes (authoring / finalization). */
export const VISUAL_IMAGE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  VISUAL_IMAGE_MISSING: "هذا السؤال يحتاج صورة: أضفها من «صورة السؤال».",
  VISUAL_IMAGE_HIDDEN: "صورة السؤال مخفية؛ أسئلة الصور تحتاج صورة ظاهرة للطالب.",
  VISUAL_IMAGE_ASSET_INVALID: "صورة السؤال ليست صورة مخزّنة صالحة (ارفعها من جديد)."
});
/** Arabic messages for the geometry codes. */
export const VISUAL_SHAPE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  VISUAL_SHAPE_INVALID: "شكل المنطقة غير صالح.",
  VISUAL_SHAPE_KIND_UNKNOWN: "نوع الشكل غير مدعوم (المدعوم: مستطيل، دائرة، مضلع).",
  VISUAL_SHAPE_OUT_OF_RANGE: "المنطقة تخرج عن حدود الصورة.",
  VISUAL_SHAPE_DEGENERATE: "المنطقة صغيرة جدًا أو بلا مساحة.",
  VISUAL_CIRCLE_RADIUS: "نصف قطر الدائرة أكبر من المسموح.",
  VISUAL_POLYGON_POINTS: "المضلع يحتاج من 3 إلى 20 نقطة.",
  VISUAL_POLYGON_SELF_INTERSECTING: "أضلاع المضلع متقاطعة؛ ارسمه دون تقاطع."
});
