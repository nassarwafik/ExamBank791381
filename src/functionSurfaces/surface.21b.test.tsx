// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import Surface3DView from "./Surface3DView";
import { validateSurfaceSpec, type SurfaceSpecV1, SURFACE_LIMITS } from "./surfaceSpec";
import { projectSurface, sampleSurface } from "./surfaceMesh";

afterEach(cleanup);
const spec = (): SurfaceSpecV1 => ({
  version: 1, id: "paraboloid", title: "سطح القطع المكافئ", description: "سطح الدالة z = x² + y².",
  expression: "x^2+y^2", viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, zMin: -1, zMax: 3 },
  grid: { xSteps: 8, ySteps: 8 }
});
const check = (v: unknown) => {
  const r = validateSurfaceSpec(v);
  return r.ok ? [] : r.issues.map(i => i.code);
};
const mutate = (f: (s: Record<string, unknown>) => void) => { const s = JSON.parse(JSON.stringify(spec())); f(s); return s; };

describe("21B-1 closed surface authority", () => {
  it("accepts validated x,y and language-3 math, retains source and rebuilds a new canonical object", () => {
    const s = spec(), r = validateSurfaceSpec(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual(s);
    expect(r.value).not.toBe(s);
    expect(validateSurfaceSpec({ ...s, expression: "sin(pi*x)*cos(y)" }).ok).toBe(true);
    expect(validateSurfaceSpec({ ...s, expression: "sqrt(1-x^2-y^2)" }).ok).toBe(true);
  });
  it("refuses wrong versions, prototype ids, unknown keys and injected content", () => {
    expect(check({ ...spec(), version: 2 })).toContain("SURFACE_VERSION_INVALID");
    expect(check({ ...spec(), id: "__proto__" })).toContain("SURFACE_ID_INVALID");
    expect(check({ ...spec(), renderer: "WebGL" })).toContain("SURFACE_UNKNOWN_KEY");
    expect(check(mutate(s => { (s.viewport as Record<string, number>).perspective = 50; }))).toContain("SURFACE_UNKNOWN_KEY");
    expect(check({ ...spec(), title: "<script>alert(1)</script>" })).toContain("SURFACE_TEXT_INVALID");
    expect(check({ ...spec(), title: "عنوان\u202Eمعكوس" })).toContain("SURFACE_TEXT_INVALID");
    expect(check({ ...spec(), title: "عنوان\u200Bمخفي" })).toContain("SURFACE_TEXT_INVALID");
  });
  it("rejects unsafe or ambiguous expressions and every undeclared variable", () => {
    expect(check({ ...spec(), expression: "log(x)" })).toContain("EXPR_AMBIGUOUS_LOG");
    expect(check({ ...spec(), expression: "x*z" })).toContain("SURFACE_VARIABLE_INVALID");
    expect(check({ ...spec(), expression: "constructor(x)" })).toContain("EXPR_FORBIDDEN_IDENTIFIER");
    expect(check({ ...spec(), expression: "2x+y" })).toContain("EXPR_SYNTAX");
    expect(check({ ...spec(), expression: "x^100+y" })).toEqual([]); // syntax is valid; runtime evaluation fails closed
    expect(check({ ...spec(), expression: "x;alert(1)" })).toContain("EXPR_TOKEN_INVALID");
  });
  it("refuses malformed coordinate windows, grid sizes, unknown nested keys and spoofed cameras", () => {
    expect(check(mutate(s => { (s.viewport as Record<string, number>).xMax = -1; }))).toContain("SURFACE_VIEW_INVALID");
    expect(check(mutate(s => { (s.grid as Record<string, number>).xSteps = 500; }))).toContain("SURFACE_NUMBER_INVALID");
    expect(check(mutate(s => { (s.grid as Record<string, number>).ySteps = 6.5; }))).toContain("SURFACE_GRID_INVALID");
    expect(check({ ...spec(), camera: { azimuth: 0, elevation: 0, foo: 1 } })).toContain("SURFACE_UNKNOWN_KEY");
    expect(check({ ...spec(), camera: { azimuth: 0, elevation: 9 } })).toContain("SURFACE_NUMBER_INVALID");
    expect(check({ ...spec(), viewport: { ...spec().viewport, zMax: Infinity } })).toContain("SURFACE_NUMBER_INVALID");
    expect(check({ ...spec(), viewport: { ...spec().viewport, xMin: "0" } })).toContain("SURFACE_NUMBER_INVALID");
  });
  it("never throws on malformed inputs or throwing proxies", () => {
    for (const value of [null, [], "x", 9, Object.create({ version: 1 }), new Proxy({}, { ownKeys() { throw Error("bad"); } })]) {
      expect(() => validateSurfaceSpec(value)).not.toThrow();
      expect(validateSurfaceSpec(value).ok).toBe(false);
    }
  });
});
describe("21B-2 bounded surface mesh and scene", () => {
  it("makes an eight-step paraboloid mesh with deterministic 128 triangles", () => {
    const r = validateSurfaceSpec(spec());
    if (!r.ok) throw Error("invalid fixture");
    const mesh = sampleSurface(r.value, r.ast);
    expect(mesh.vertices).toHaveLength(81);
    expect(mesh.faces).toHaveLength(128);
    expect(mesh.evaluations).toBe(81 + 5 * 64);
    expect(mesh.skippedCells).toBe(0);
    expect(sampleSurface(r.value, r.ast)).toEqual(mesh);
    const scene = projectSurface(mesh, r.value, { azimuth: -.75, elevation: .6 });
    expect(scene.faces).toHaveLength(128);
    expect(scene.faces.every(f => f.points.length > 10 && f.shade >= 0 && f.shade <= 7)).toBe(true);
    expect(scene.faces[0].depth).toBeLessThanOrEqual(scene.faces[127].depth);
  });
  it("bounds vertices, triangles and evaluation work at the maximum accepted mesh size", () => {
    const r = validateSurfaceSpec({ ...spec(), grid: { xSteps: 40, ySteps: 40 } });
    if (!r.ok) throw Error("invalid fixture");
    const mesh = sampleSurface(r.value, r.ast);
    expect(mesh.vertices.length).toBe(SURFACE_LIMITS.maxVertices);
    expect(mesh.faces.length).toBe(SURFACE_LIMITS.maxFaces);
    expect(mesh.evaluations).toBeLessThanOrEqual(SURFACE_LIMITS.maxEvaluations);
  });
  it("does not interpolate a fake surface across poles or outside the authored z window", () => {
    const r = validateSurfaceSpec({ ...spec(), expression: "1/(x-y)", viewport: { ...spec().viewport, zMin: -5, zMax: 5 } });
    if (!r.ok) throw Error("invalid fixture");
    const mesh = sampleSurface(r.value, r.ast);
    expect(mesh.skippedCells).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeLessThan(128);
    expect(mesh.vertices.some(p => p === null)).toBe(true);
  });
  it("is presentation-only: changing camera changes projected vertices but not the sampled surface", () => {
    const r = validateSurfaceSpec(spec());
    if (!r.ok) throw Error("invalid fixture");
    const m = sampleSurface(r.value, r.ast);
    expect(projectSurface(m, r.value, { azimuth: -.75, elevation: .6 }).faces.map(f => f.points))
      .not.toEqual(projectSurface(m, r.value, { azimuth: .75, elevation: .6 }).faces.map(f => f.points));
    expect(sampleSurface(r.value, r.ast)).toEqual(m);
  });
});
describe("21B-3 accessible SVG pilot renderer", () => {
  it("renders real surface geometry, controls and a keyboard-readable sample table", () => {
    const { container, getByText, getByRole } = render(<Surface3DView spec={spec()} />);
    expect(getByText("سطح القطع المكافئ")).toBeTruthy();
    expect(container.querySelectorAll("svg polygon")).toHaveLength(128);
    const before = container.querySelector("svg polygon")?.getAttribute("points");
    fireEvent.click(getByRole("button", { name: "تدوير لليمين" }));
    expect(container.querySelector("svg polygon")?.getAttribute("points")).not.toBe(before);
    fireEvent.click(getByRole("button", { name: "إعادة العرض" }));
    expect(container.querySelector("svg polygon")?.getAttribute("points")).toBe(before);
    const svg = container.querySelector("svg")!;
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(container.querySelector("svg polygon")?.getAttribute("points")).not.toBe(before);
    fireEvent.keyDown(svg, { key: "Home" });
    expect(container.querySelector("svg polygon")?.getAttribute("points")).toBe(before);
    fireEvent.pointerDown(svg, { pointerId: 7, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 7, clientX: 135, clientY: 115 });
    fireEvent.pointerUp(svg, { pointerId: 7, clientX: 135, clientY: 115 });
    expect(container.querySelector("svg polygon")?.getAttribute("points")).not.toBe(before);
    fireEvent.click(getByText("جدول قيم بديل للرسم (يدعم قارئ الشاشة)"));
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(9);
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("img");
  });
  it("fails closed rather than interpreting unsupported content", () => {
    const { container, getByRole } = render(<Surface3DView spec={{ ...spec(), expression: "x+z" }} />);
    expect(getByRole("alert").textContent).toContain("غير صالح");
    expect(container.querySelector("svg")).toBeNull();
  });
});
