import { describe, expect, it } from "vitest";
import { evaluateExpression, parseExpression } from "../parametricExpression";
import { validateRichContent, richContentPlainText } from "../richContent/richContentModel";
import { sampleSurface } from "./surfaceMesh";
import { validateSurfaceSpec, type SurfaceViewport } from "./surfaceSpec";
import { surfaceTemplate } from "./surfaceEditing";
import { SURFACE_PLOT_LIMITS, isSurfacePlotPayload, validateSurfacePlotSpec, type SurfacePlotSpecV2 } from "./surfacePlotSpec";
import { SURFACE_PLOT_PRESET_KEYS, surfacePlotFromV1, surfacePlotPreset } from "./surfacePlotPresets";
import { SURFACE_PLOT_BUDGETS, buildSurfacePlotMesh, clipRing, plotAxes, plotScreen, projectSurfacePlot, surfaceBudget, type PlotPolygon, type SurfacePlotLevel } from "./surfacePlotMesh";

// Phase 21D-A.4 — SurfacePlotSpecV2 contract, adaptive mesh, discontinuity handling, projection and the rich-content authority.
const ast = (e: string) => { const p = parseExpression(e, { language: 3 }); if (!p.ok) throw new Error(e); return p.ast; };
const V = (xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number): SurfaceViewport => ({ xMin, xMax, yMin, yMax, zMin, zMax });
const plot = (patch: Partial<SurfacePlotSpecV2> = {}): SurfacePlotSpecV2 => ({ ...surfacePlotPreset("paraboloids", "plot-test"), ...patch });
const codes = (raw: unknown) => { const r = validateSurfacePlotSpec(raw); return r.ok ? [] : r.issues.map(i => i.code); };
const mesh = (e: string, v: SurfaceViewport, level: SurfacePlotLevel = "standard", count = 1) => buildSurfacePlotMesh(ast(e), v, level, count);
const mathOf = (v: SurfaceViewport, X: number, Y: number) => [v.xMin + ((X + 1) / 2) * (v.xMax - v.xMin), v.yMin + ((Y + 1) / 2) * (v.yMax - v.yMin)];
const normZ = (e: string, v: SurfaceViewport, x: number, y: number) => { const r = evaluateExpression(ast(e), new Map([["x", x], ["y", y]])); return r.ok ? (2 * (r.value - v.zMin)) / (v.zMax - v.zMin) - 1 : NaN; };
/** worst deviation (normalised z) between the true surface and the mean of a polygon's vertices, at the polygon centroid */
function centroidDeviation(e: string, v: SurfaceViewport, polys: { pts: number[] }[]) {
  let worst = 0;
  for (const p of polys) {
    const n = p.pts.length / 3;
    if (p.pts.some((q, i) => i % 3 === 2 && Math.abs(q) >= 1 - 1e-9)) continue;          // clipped polygons are compared elsewhere
    let X = 0, Y = 0, Z = 0;
    for (let t = 0; t < n; t++) { X += p.pts[3 * t]; Y += p.pts[3 * t + 1]; Z += p.pts[3 * t + 2]; }
    const [x, y] = mathOf(v, X / n, Y / n), z = normZ(e, v, x, y);
    if (Number.isFinite(z)) worst = Math.max(worst, Math.abs(z - Z / n));
  }
  return worst;
}
/** covered area of the domain in math units (shoelace of every polygon projected on the x-y plane) */
function area(v: SurfaceViewport, polys: { pts: number[] }[]) {
  let A = 0;
  for (const p of polys) { const n = p.pts.length / 3; let s = 0; for (let t = 0; t < n; t++) { const u = (t + 1) % n; s += p.pts[3 * t] * p.pts[3 * u + 1] - p.pts[3 * u] * p.pts[3 * t + 1]; } A += s / 2; }
  return (A / 4) * (v.xMax - v.xMin) * (v.yMax - v.yMin);
}
/** the V1 (Phase 21B) mesh at its finest grid, in the same normalised polygon form */
function v1Polygons(e: string, v: SurfaceViewport) {
  const s = validateSurfaceSpec({ version: 1, id: "a", title: "t", description: "d", expression: e, viewport: v, grid: { xSteps: 40, ySteps: 40 } });
  if (!s.ok) throw new Error("v1");
  const m = sampleSurface(s.value, s.ast);
  return m.faces.map(f => ({ pts: f.flatMap(ix => { const p = m.vertices[ix]!; return [(2 * (p.x - v.xMin)) / (v.xMax - v.xMin) - 1, (2 * (p.y - v.yMin)) / (v.yMax - v.yMin) - 1, (2 * (p.z - v.zMin)) / (v.zMax - v.zMin) - 1]; }) }));
}

describe("SurfacePlotSpecV2 contract (versioned, strict, data only)", () => {
  it("every preset is valid and canonical; up to five surfaces share one coordinate system", () => {
    for (const k of SURFACE_PLOT_PRESET_KEYS) {
      const p = surfacePlotPreset(k, "plot-" + k), r = validateSurfacePlotSpec(p);
      expect(r.ok, k).toBe(true);
      if (r.ok) { expect(r.value).toEqual(p); expect(r.asts.length).toBe(p.surfaces.length); }
    }
    const five = plot({ surfaces: [["a", "x^2+y^2", "blue"], ["b", "4-x^2-y^2", "amber"], ["c", "x*y", "green"], ["d", "sin(x)", "rose"], ["e", "0.5*x+1", "lavender"]].map(([id, expression, color]) => ({ id, label: "السطح " + id, expression, color })) as SurfacePlotSpecV2["surfaces"] });
    expect(codes(five)).toEqual([]);
  });
  it("V1 stays V1: its validator and templates are unchanged, and the two versions refuse each other's payload", () => {
    const v1 = surfaceTemplate("paraboloid", "surface-a");
    expect(validateSurfaceSpec(v1).ok).toBe(true);
    expect(isSurfacePlotPayload(v1)).toBe(false);
    expect(isSurfacePlotPayload(plot())).toBe(true);
    expect(validateSurfaceSpec(plot()).ok).toBe(false);
    expect(codes(v1)).toContain("SURFACE_PLOT_VERSION_INVALID");
    const up = surfacePlotFromV1(v1);
    expect(codes(up)).toEqual([]);
    expect([up.id, up.surfaces.length, up.surfaces[0].expression, up.viewport]).toEqual([v1.id, 1, v1.expression, v1.viewport]);
  });
  it("refuses invalid configurations with a reason instead of drawing nonsense", () => {
    const s = plot().surfaces;
    expect(codes(plot({ surfaces: [] }))).toContain("SURFACE_PLOT_SURFACES_COUNT");
    expect(codes(plot({ surfaces: [...s, ...s.map((x, i) => ({ ...x, id: "z" + i })), ...s.map((x, i) => ({ ...x, id: "w" + i }))] }))).toContain("SURFACE_PLOT_SURFACES_COUNT");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], id: s[0].id }] }))).toContain("SURFACE_PLOT_ID_DUPLICATE");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], color: s[0].color }] }))).toContain("SURFACE_PLOT_COLOR_DUPLICATE");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], color: "black" as never }] }))).toContain("SURFACE_PLOT_COLOR_INVALID");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], expression: "x+t" }] }))).toContain("SURFACE_PLOT_VARIABLE_INVALID");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], expression: "x^^2" }] }))).toContain("SURFACE_PLOT_EXPRESSION_INVALID");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], expression: "log(x)" }] }))).toContain("SURFACE_PLOT_EXPRESSION_INVALID");     // ambiguous base refused
    expect(codes(plot({ surfaces: [s[0], { ...s[1], label: "<script>x</script>" }] }))).toContain("SURFACE_PLOT_TEXT_INVALID");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], label: "a‮b" }] }))).toContain("SURFACE_PLOT_TEXT_INVALID");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], id: "__proto__" }] }))).toContain("SURFACE_PLOT_ID_INVALID");
    for (const id of ["constructor", "prototype"]) {                                                     // pass the id pattern: refused by name
      expect(codes(plot({ surfaces: [s[0], { ...s[1], id }] })), id).toContain("SURFACE_PLOT_ID_INVALID");
      expect(codes(plot({ id })), id).toContain("SURFACE_PLOT_ID_INVALID");
    }
    expect(codes(plot({ viewport: V(2, -2, -2, 2, -1, 5) }))).toContain("SURFACE_PLOT_VIEW_INVALID");
    for (const empty of [V(1, 1, -2, 2, -1, 5), V(-2, 2, 0, 0, -1, 5), V(-2, 2, -2, 2, 3, 3)]) expect(codes(plot({ viewport: empty }))).toContain("SURFACE_PLOT_VIEW_INVALID");
    expect(codes(plot({ viewport: V(-2, 2, -2, 2, -1, Number.NaN) }))).toContain("SURFACE_PLOT_NUMBER_INVALID");
    expect(codes(plot({ quality: "ultra" as never }))).toContain("SURFACE_PLOT_QUALITY_INVALID");
    expect(codes(plot({ display: { style: "neon" as never, grid: true } }))).toContain("SURFACE_PLOT_STYLE_INVALID");
    expect(codes(plot({ controls: { rotate: true, zoom: "yes" as never, toggleSurfaces: true } }))).toContain("SURFACE_PLOT_FLAG_INVALID");
    expect(codes(plot({ camera: { azimuth: 0, elevation: 2, zoom: 1 } }))).toContain("SURFACE_PLOT_NUMBER_INVALID");
    expect(codes(plot({ camera: { azimuth: 0, elevation: 0.4, zoom: 9 } }))).toContain("SURFACE_PLOT_NUMBER_INVALID");
    expect(codes({ ...plot(), renderer: { svg: "<svg/>" } })).toContain("SURFACE_PLOT_UNKNOWN_KEY");
    expect(codes({ ...plot(), surfaces: [{ ...s[0], onload: "x" }] })).toContain("SURFACE_PLOT_UNKNOWN_KEY");
    expect(codes({ ...plot(), axes: { x: { label: "x", unit: "m", html: 1 }, y: { label: "y" }, z: { label: "z" } } })).toContain("SURFACE_PLOT_UNKNOWN_KEY");
    const { quality: _q, ...noQuality } = plot();
    expect(codes(noQuality)).toContain("SURFACE_PLOT_MISSING_KEY");
    // a surface that would draw nothing: undefined everywhere, or never inside the z window
    expect(codes(plot({ surfaces: [s[0], { ...s[1], expression: "sqrt(-1-x^2)" }] }))).toContain("SURFACE_PLOT_SURFACE_NOT_VISIBLE");
    expect(codes(plot({ surfaces: [s[0], { ...s[1], expression: "x^2+y^2+100" }] }))).toContain("SURFACE_PLOT_SURFACE_NOT_VISIBLE");
  });
  it("never throws for hostile input", () => {
    const hostile = [null, 1, "x", [], { version: 2 }, Object.create({ version: 2 }), new Proxy({}, { get() { throw new Error("trap"); }, ownKeys() { throw new Error("trap"); } })];
    for (const h of hostile) expect(() => validateSurfacePlotSpec(h)).not.toThrow();
    for (const h of hostile) expect(validateSurfacePlotSpec(h).ok).toBe(false);
  });
});

describe("rich content: one functionSurface3D block, two versions", () => {
  const doc = (...surfaces: unknown[]) => ({ schemaVersion: 1, blocks: surfaces.map(surface => ({ type: "functionSurface3D", surface })) });
  it("V1 and V2 blocks validate side by side; ids are unique across versions; the per-document limit counts V2 plots", () => {
    expect(validateRichContent(doc(surfaceTemplate("saddle", "s1"), plot())).ok).toBe(true);
    const dup = validateRichContent(doc(surfaceTemplate("saddle", "same"), plot({ id: "same" })));
    expect(dup.ok).toBe(false);
    const four = validateRichContent(doc(plot({ id: "p1" }), plot({ id: "p2" }), plot({ id: "p3" }), plot({ id: "p4" })));
    expect(four.ok ? [] : four.issues.map(i => i.code)).toContain("RICH_CONTENT_LIMIT");
  });
  it("the canonical copy drops nothing valid and refuses smuggled renderer data; plain text names every surface", () => {
    const r = validateRichContent(doc(plot()));
    expect(r.ok ? r.value?.blocks[0] : null).toEqual({ type: "functionSurface3D", surface: plot() });
    const bad = validateRichContent(doc({ ...plot(), renderer: { rawSvg: "<svg onload=alert(1) />" } }));
    expect(bad.ok ? [] : bad.issues.map(i => i.code)).toContain("RICH_CONTENT_FUNCTION_SURFACE");
    const text = richContentPlainText(doc(plot()));
    for (const s of plot().surfaces) expect(text).toContain(s.label);
  });
});

describe("adaptive mesh: accuracy, determinism and bounds", () => {
  const sinCos = V(-Math.PI, Math.PI, -Math.PI, Math.PI, -1.5, 1.5), bump = V(-2, 2, -2, 2, -0.2, 1.2);
  it("is deterministic: identical inputs give an identical mesh", () => {
    expect(mesh("sin(x)*cos(y)", sinCos, "high")).toEqual(mesh("sin(x)*cos(y)", sinCos, "high"));
    expect(mesh("1/(x^2+y^2)", V(-2, 2, -2, 2, 0, 10))).toEqual(mesh("1/(x^2+y^2)", V(-2, 2, -2, 2, 0, 10)));
  });
  it("every unclipped vertex lies exactly on its surface; every normal points up (z = f(x, y) is a graph)", () => {
    const v = V(-2, 2, -2, 2, -1, 9), m = mesh("x^2+y^2-x*y", v);
    let checked = 0;
    for (const p of m.polygons) {
      expect(p.n[2]).toBeGreaterThan(0);
      for (let t = 0; t < p.pts.length; t += 3) if (Math.abs(p.pts[t + 2]) < 1 - 1e-9) { const [x, y] = mathOf(v, p.pts[t], p.pts[t + 1]); expect(Math.abs(p.pts[t + 2] - normZ("x^2+y^2-x*y", v, x, y))).toBeLessThan(1e-9); checked++; }
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it("refines where the surface curves: closer to the true surface than the V1 mesh at its finest grid", () => {
    const gauss = "exp(-4*(x^2+y^2))", steep = "atan(20*x)", s2 = V(-2, 2, -2, 2, -2, 2);
    const g2 = centroidDeviation(gauss, bump, mesh(gauss, bump, "high").polygons), g1 = centroidDeviation(gauss, bump, v1Polygons(gauss, bump));
    const a2 = centroidDeviation(steep, s2, mesh(steep, s2).polygons), a1 = centroidDeviation(steep, s2, v1Polygons(steep, s2));
    expect(g2).toBeLessThan(0.004); expect(g1 / g2).toBeGreaterThan(5);                                   // measured 0.0024 vs 0.0247
    expect(a2).toBeLessThan(0.02); expect(a1 / a2).toBeGreaterThan(5);                                    // measured 0.0095 vs 0.1095
    expect(mesh(gauss, bump, "high").stats.refined).toBeGreaterThan(0);
    expect(mesh("x+y", V(-2, 2, -2, 2, -5, 5), "high").stats.refined).toBe(0);                            // a plane needs no refinement
  });
  it("clips exactly at the z window: a clean rim instead of a staircase of missing cells", () => {
    const v = V(-2, 2, -2, 2, -1, 4), m = mesh("x^2+y^2", v);
    let rim = 0;
    for (const p of m.polygons) for (let t = 0; t < p.pts.length; t += 3) {
      expect(Math.abs(p.pts[t + 2])).toBeLessThanOrEqual(1 + 1e-12);
      if (Math.abs(p.pts[t + 2] - 1) < 1e-12) { const [x, y] = mathOf(v, p.pts[t], p.pts[t + 1]); expect(Math.abs(x * x + y * y - 4)).toBeLessThan(0.02); rim++; }
    }
    expect(rim).toBeGreaterThan(100);
    expect(Math.abs(area(v, m.polygons) - 4 * Math.PI)).toBeLessThan(0.01 * 4 * Math.PI);                 // V1 misses ≈ 7 %
    expect(clipRing([{ X: 0, Y: 0, Z: 0, k: 1 }, { X: 1, Y: 0, Z: 2, k: 2 }, { X: 0, Y: 1, Z: 0, k: 3 }]).every(p => p.Z <= 1)).toBe(true);
  });
  it("keeps the defined part of boundary cells: the dome covers its true disc far better than V1", () => {
    const v = V(-2.5, 2.5, -2.5, 2.5, -0.5, 2.5), m = mesh("sqrt(4-x^2-y^2)", v), exact = 4 * Math.PI;
    const a2 = area(v, m.polygons), a1 = area(v, v1Polygons("sqrt(4-x^2-y^2)", v));
    expect(Math.abs(a2 - exact) / exact).toBeLessThan(0.03);                                              // measured −1.5 %
    expect(Math.abs(a1 - exact) / exact).toBeGreaterThan(0.06);                                           // V1: −9 %
    expect(m.stats.partial).toBeGreaterThan(0);
  });
});

describe("intersections of surfaces in one plot", () => {
  it("refines where another surface crosses inside the window: polygons along the intersection curve are finest-level", () => {
    const v = V(-2, 2, -2, 2, -1, 5), up = ast("x^2+y^2"), down = ast("4-x^2-y^2");
    const alone = buildSurfacePlotMesh(up, v, "standard", 2), paired = buildSurfacePlotMesh(up, v, "standard", 2, { others: [down] });
    expect(paired.stats.refined).toBeGreaterThan(alone.stats.refined);
    const finest = 4 / (surfaceBudget("standard", 2).base * 4);                                          // math units per finest cell
    let straddling = 0;
    for (const p of paired.polygons) {
      const pts = [] as [number, number, number][];
      for (let t = 0; t < p.pts.length; t += 3) pts.push([p.pts[t], p.pts[t + 1], p.pts[t + 2]]);
      const signs = new Set(pts.map(([X, Y, Z]) => { const [x, y] = mathOf(v, X, Y); return Math.sign(Z - normZ("4-x^2-y^2", v, x, y)); }));
      if (signs.has(1) && signs.has(-1)) {
        straddling++;
        const xs = pts.map(([X]) => mathOf(v, X, 0)[0]), ys = pts.map(([, Y]) => mathOf(v, 0, Y)[1]);
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(finest * 1.0001);
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(finest * 1.0001);
      }
    }
    expect(straddling).toBeGreaterThan(50);                                                               // the circle x² + y² = 2
    expect(buildSurfacePlotMesh(up, v, "motion", 2, { others: [down] })).toEqual(buildSurfacePlotMesh(up, v, "motion", 2));   // motion: unchanged
  });
});

describe("discontinuities, poles and undefined regions", () => {
  it("never draws a polygon across a jump (floor), while a steep CONTINUOUS surface keeps every polygon", () => {
    const v = V(-2.5, 2.5, -2, 2, -4, 4), m = mesh("floor(x)", v);
    expect(m.stats.discontinuities).toBeGreaterThan(0);
    for (const p of m.polygons) { const zs = p.pts.filter((_, i) => i % 3 === 2); expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1e-9); }
    expect(area(v, m.polygons)).toBeGreaterThan(0.95 * 20);
    for (const lvl of ["standard", "high", "motion"] as const) {
      const s = mesh("atan(20*x)", V(-2, 2, -2, 2, -2, 2), lvl);
      expect(s.stats.discontinuities, lvl).toBe(0);
      expect(area(V(-2, 2, -2, 2, -2, 2), s.polygons), lvl).toBeCloseTo(16, 6);
    }
  });
  it("a pole is cut at the window: nothing inside the blow-up, no NaN, no bridging across it", () => {
    const v = V(-2, 2, -2, 2, 0, 10), m = mesh("1/(x^2+y^2)", v);
    for (const p of m.polygons) {
      expect(p.pts.every(Number.isFinite)).toBe(true);
      const n = p.pts.length / 3; let X = 0, Y = 0;
      for (let t = 0; t < n; t++) { X += p.pts[3 * t]; Y += p.pts[3 * t + 1]; }
      const [x, y] = mathOf(v, X / n, Y / n);
      expect(Math.hypot(x, y)).toBeGreaterThan(0.3);                                                       // 1/r² = 10 at r ≈ 0.316
    }
    expect(Math.abs(area(v, m.polygons) - (16 - Math.PI / 10))).toBeLessThan(0.02);
    const tan = mesh("tan(x)", V(-3, 3, -1, 1, -6, 6));
    for (const p of tan.polygons) { const zs = p.pts.filter((_, i) => i % 3 === 2); expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1); }   // never spans ±∞
  });
  it("undefined points are holes, never zeros", () => {
    const m = mesh("ln(x)", V(-2, 2, -2, 2, -3, 1));
    for (const p of m.polygons) for (let t = 0; t < p.pts.length; t += 3) expect(p.pts[t]).toBeGreaterThan(-1e-9);   // only x ≥ 0 (X ≥ 0)
  });
  it("a hole narrower than the sampling lattice is never bridged by a polygon edge", () => {
    // undefined for |x − c| < h (h = 0.02), about ±1 on either side; the hole sits between lattice points, so only the edge bisection finds it
    const c = 0.0517, h = 0.02, v = V(-10, 10, -1, 1, -3, 3), m = mesh("(x-0.0517)/sqrt((x-0.0517)^2-0.0004)", v);
    const lo = (2 * (c - h - v.xMin)) / (v.xMax - v.xMin) - 1, hi = (2 * (c + h - v.xMin)) / (v.xMax - v.xMin) - 1;
    expect(m.polygons.length).toBeGreaterThan(0);
    for (const p of m.polygons) {
      const xs = p.pts.filter((_, i) => i % 3 === 0);
      expect(Math.min(...xs) < lo && Math.max(...xs) > hi).toBe(false);
    }
  });
});

describe("budgets, level of detail and projection", () => {
  it("every plot stays inside its polygon and evaluation budgets; the motion level stays light", () => {
    const hard = ["sin(8*x)*cos(8*y)", "floor(3*x)+floor(3*y)", "1/(x*y)", "sqrt(4-x^2-y^2)", "tan(x*y)"], v = V(-2, 2, -2, 2, -3, 3);
    for (const level of ["standard", "high", "motion"] as const) for (let count = 1; count <= 5; count++) {
      const asts = hard.slice(0, count).map(ast), ms = asts.map((a, i) => buildSurfacePlotMesh(a, v, level, count, { others: asts.filter((_, k) => k !== i) }));
      const polys = ms.reduce((n, m) => n + m.polygons.length, 0), evals = ms.reduce((n, m) => n + m.stats.evaluations, 0);
      expect(polys, level + count).toBeLessThanOrEqual(SURFACE_PLOT_BUDGETS[level].polygons);
      expect(evals, level + count).toBeLessThanOrEqual(SURFACE_PLOT_BUDGETS[level].evaluations);
    }
    expect(surfaceBudget("motion", 5).polygons * 5).toBeLessThanOrEqual(900);
    expect(SURFACE_PLOT_LIMITS.surfacesMax).toBe(5);
  });
  it("the framing never depends on the orientation; the whole box stays inside the view at zoom 1", () => {
    const scales = new Set<number>();
    for (let yaw = -3; yaw <= 3; yaw += 0.5) for (let pitch = -1.4; pitch <= 1.4; pitch += 0.35) {
      const S = plotScreen({ yaw, pitch, zoom: 1 }, 640, 460);
      scales.add(Math.round(S.scale * 1e9));
      for (const X of [-1, 1]) for (const Y of [-1, 1]) for (const Z of [-1, 1]) { const [x, y] = S.toScreen(X, Y, Z); expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(640); expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(460); }
    }
    expect(scales.size).toBe(1);
  });
  it("two-sided: a plane shows its upper side from above and its underside from below (a steep bowl shows both); painter order is back to front", () => {
    const flat = mesh("0.3*x+1", V(-2, 2, -2, 2, -1, 3)), m = mesh("x^2+y^2", V(-2, 2, -2, 2, -1, 9));
    const fromAbove = projectSurfacePlot([flat], [true], { yaw: -0.6, pitch: 0.6, zoom: 1 }, 640, 460, false), fromBelow = projectSurfacePlot([flat], [true], { yaw: -0.6, pitch: -0.6, zoom: 1 }, 640, 460, false);
    expect(fromAbove.polygons.every(p => p.front)).toBe(true);
    expect(fromBelow.polygons.every(p => !p.front)).toBe(true);
    const above = projectSurfacePlot([m], [true], { yaw: -0.6, pitch: 0.6, zoom: 1 }, 640, 460, false);
    const frontShare = above.polygons.filter(p => p.front).length / above.polygons.length;
    expect(frontShare).toBeGreaterThan(0.5); expect(frontShare).toBeLessThan(1);                         // the near wall's outside faces the viewer
    for (let i = 1; i < above.polygons.length; i++) expect(above.polygons[i].depth).toBeGreaterThanOrEqual(above.polygons[i - 1].depth);
    expect(above.polygons.every(p => p.normal[2] >= -1e-9)).toBe(true);                                   // lit on the visible side
    expect(projectSurfacePlot([m, m], [true, false], { yaw: 0, pitch: 0.5, zoom: 1 }, 640, 460, true).polygons.every(p => p.surface === 0)).toBe(true);
  });
  it("axes: three back panes, ticks on the axes and a title per axis, in every orientation", () => {
    const ticks = { x: [{ t: -1, text: "-2" }, { t: 0, text: "0" }, { t: 1, text: "2" }], y: [{ t: 0, text: "0" }], z: [{ t: -1, text: "-1" }, { t: 1, text: "5" }] };
    for (const camera of [{ yaw: -0.6, pitch: 0.45, zoom: 1 }, { yaw: 2.5, pitch: -0.8, zoom: 1.5 }]) {
      const a = plotAxes(camera, 640, 460, ticks, { x: "x (m)", y: "y", z: "z" }, true);
      expect(a.panes.length).toBe(3);
      expect(a.ticks.length).toBeGreaterThanOrEqual(5);                                                   // a corner collision may drop one
      for (let i = 0; i < a.ticks.length; i++) for (let j = i + 1; j < a.ticks.length; j++) expect(Math.abs(a.ticks[i].x - a.ticks[j].x) > 18 || Math.abs(a.ticks[i].y - a.ticks[j].y) > 12).toBe(true);
      expect(a.titles.map(t => t.text)).toEqual(["x (m)", "y", "z"]);
      expect(a.grid.length).toBeGreaterThan(0);
      expect(plotAxes(camera, 640, 460, ticks, { x: "x", y: "y", z: "z" }, false).grid.length).toBe(0);
    }
  });
  it("polygon shading normals are unit vectors and keep creases (the cone apex is not smoothed away)", () => {
    const m = mesh("sqrt(x^2+y^2)", V(-2, 2, -2, 2, 0, 3));
    const unit = (p: PlotPolygon) => Math.abs(Math.hypot(...p.s) - 1) < 1e-9 && Math.abs(Math.hypot(...p.n) - 1) < 1e-9;
    expect(m.polygons.every(unit)).toBe(true);
    const tilt = m.polygons.map(p => p.s[2]);
    expect(Math.max(...tilt) - Math.min(...tilt)).toBeLessThan(0.35);                                    // a cone: every facet tilted alike
    // a ridge of two planes (127° apart in normalised space): no smoothing across it, so every shading normal is the facet normal
    const ridge = mesh("abs(x)", V(-2, 2, -2, 2, -0.5, 2.5));
    expect(ridge.polygons.length).toBeGreaterThan(0);
    for (const p of ridge.polygons) expect(Math.hypot(p.s[0] - p.n[0], p.s[1] - p.n[1], p.s[2] - p.n[2])).toBeLessThan(1e-9);
    // a smooth surface is smoothed: shading normals differ from facet normals
    const bowl = mesh("x^2+y^2", V(-2, 2, -2, 2, -1, 9));
    expect(bowl.polygons.some(p => Math.hypot(p.s[0] - p.n[0], p.s[1] - p.n[1], p.s[2] - p.n[2]) > 1e-3)).toBe(true);
  });
});
