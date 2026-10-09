// Phase 21B: pure bounded mesh sampling. Undefined/off-window values become holes, never fake values.
import { evaluateExpression, type ExprNode } from "../parametricExpression";
import { type SurfaceSpecV1, type SurfaceCamera, SURFACE_LIMITS } from "./surfaceSpec";

export type SurfacePoint = { x: number; y: number; z: number };
export type SurfaceMesh = {
  vertices: (SurfacePoint | null)[]; faces: [number, number, number][];
  evaluations: number; skippedCells: number; xSteps: number; ySteps: number;
};
const finite = (n: number) => Number.isFinite(n);
export function sampleSurface(spec: SurfaceSpecV1, ast: ExprNode): SurfaceMesh {
  const { viewport: v } = spec, nx = spec.grid.xSteps, ny = spec.grid.ySteps;
  const xs = Array.from({ length: nx + 1 }, (_, i) => v.xMin + (v.xMax - v.xMin) * i / nx);
  const ys = Array.from({ length: ny + 1 }, (_, i) => v.yMin + (v.yMax - v.yMin) * i / ny);
  const values = new Map<string, number>([["x", 0], ["y", 0]]);
  let evaluations = 0;
  const probe = (x: number, y: number): SurfacePoint | null => {
    evaluations++;
    values.set("x", x); values.set("y", y);
    const r = evaluateExpression(ast, values);
    return r.ok && finite(r.value) && r.value >= v.zMin && r.value <= v.zMax ? { x, y, z: r.value } : null;
  };
  const vertices: (SurfacePoint | null)[] = [];
  for (const y of ys) for (const x of xs) vertices.push(probe(x, y));
  const faces: [number, number, number][] = [];
  let skippedCells = 0;
  const zSpan = v.zMax - v.zMin, stride = nx + 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    const p = [vertices[a], vertices[b], vertices[c], vertices[d]];
    if (p.some(q => q === null)) { skippedCells++; continue; }
    const q = p as SurfacePoint[];
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const middle = probe(xm, ym), left = probe(x0, ym), right = probe(x1, ym);
    const bottom = probe(xm, y0), top = probe(xm, y1);
    if (!middle || !left || !right || !bottom || !top) { skippedCells++; continue; }
    const cornerMean = (q[0].z + q[1].z + q[2].z + q[3].z) / 4;
    const zs = [...q.map(t => t.z), middle.z, left.z, right.z, bottom.z, top.z];
    // Conservative jump/curvature guard: don't draw cells whose centre sharply differs from the
    // interpolated corners, or where values jump across most of the displayed z range.
    if (Math.abs(middle.z - cornerMean) > zSpan * 0.3 ||
        Math.max(...zs) - Math.min(...zs) > zSpan * 0.85) { skippedCells++; continue; }
    faces.push([a, b, d], [a, d, c]);
  }
  if (vertices.length > SURFACE_LIMITS.maxVertices || faces.length > SURFACE_LIMITS.maxFaces || evaluations > SURFACE_LIMITS.maxEvaluations) {
    // This should be unreachable for a validator-approved grid. Return no geometry if a caller
    // bypasses validation rather than accidentally rendering unbounded geometry.
    return { vertices: [], faces: [], evaluations, skippedCells: nx * ny, xSteps: nx, ySteps: ny };
  }
  return { vertices, faces, evaluations, skippedCells, xSteps: nx, ySteps: ny };
}
export type ProjectedFace = { id: string; points: string; shade: number; depth: number };
export type SurfaceScene = { width: number; height: number; faces: ProjectedFace[] };
/** Orthographic projection and painter sorting. Camera affects presentation only, never stored grades. */
export function projectSurface(mesh: SurfaceMesh, spec: SurfaceSpecV1, camera: SurfaceCamera, width = 640, height = 440): SurfaceScene {
  const w = Math.max(160, Math.min(1600, width));
  const h = Math.max(160, Math.min(1200, height));
  const v = spec.viewport, a = camera.azimuth, e = camera.elevation;
  const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e), scale = Math.min(w, h) / 4.25;
  const projected = mesh.vertices.map(p => {
    if (!p) return null;
    const x = (2 * (p.x - v.xMin) / (v.xMax - v.xMin)) - 1;
    const y = (2 * (p.y - v.yMin) / (v.yMax - v.yMin)) - 1;
    const z = (2 * (p.z - v.zMin) / (v.zMax - v.zMin)) - 1;
    const u = ca * x - sa * y;
    const depth = ce * (sa * x + ca * y) + se * z;
    const vy = se * (sa * x + ca * y) - ce * z;
    return { x: w / 2 + u * scale, y: h / 2 + vy * scale, depth, z };
  });
  const faces: ProjectedFace[] = [];
  for (let i = 0; i < mesh.faces.length; i++) {
    const pts = mesh.faces[i].map(index => projected[index]);
    if (pts.some(p => !p)) continue;
    const q = pts as NonNullable<(typeof projected)[number]>[];
    const depth = (q[0].depth + q[1].depth + q[2].depth) / 3;
    const shade = Math.max(0, Math.min(7, Math.floor(((q[0].z + q[1].z + q[2].z) / 3 + 1) * 4)));
    const points = q.map(p => p.x.toFixed(2) + "," + p.y.toFixed(2)).join(" ");
    faces.push({ id: "face-" + i, points, shade, depth });
  }
  faces.sort((p, q) => p.depth - q.depth || p.id.localeCompare(q.id));
  return { width: w, height: h, faces };
}
