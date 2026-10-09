import { describe, expect, it } from "vitest";
import { validateRichContent, RICH_LIMITS } from "../richContent/richContentModel";
import { defaultSurface } from "./surfaceEditing";
import { projectSurface, sampleSurface } from "./surfaceMesh";
import { SURFACE_LIMITS, validateSurfaceSpec, type SurfaceSpecV1 } from "./surfaceSpec";

const base = (): SurfaceSpecV1 => ({
  version: 1, id: "surface-a", title: "سطح آمن", description: "وصف تعليمي آمن.",
  expression: "x^2+y^2", viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, zMin: -1, zMax: 3 },
  grid: { xSteps: 8, ySteps: 8 }, camera: { azimuth: 0, elevation: 0.6 }
});
const codes = (x: unknown) => { const r = validateSurfaceSpec(x); return r.ok ? [] : r.issues.map(i => i.code); };
const rich = (...blocks: unknown[]) => ({ schemaVersion: 1, blocks });

describe("21B mutation pins — surface authority", () => {
  it("pins plain objects, exact keys, version, prototype ids and text controls", () => {
    expect(validateSurfaceSpec(Object.create(base())).ok).toBe(false);
    expect(codes({ ...base(), future: true })).toContain("SURFACE_UNKNOWN_KEY");
    expect(codes({ ...base(), version: 2 })).toContain("SURFACE_VERSION_INVALID");
    expect(codes({ ...base(), id: "constructor" })).toContain("SURFACE_ID_INVALID");
    expect(codes({ ...base(), title: "abc\u202Edef" })).toContain("SURFACE_TEXT_INVALID");
    expect(codes({ ...base(), title: "abc\u200Bdef" })).toContain("SURFACE_TEXT_INVALID");
  });
  it("pins expression variables, view ordering, integer/bounded grids and camera elevation", () => {
    expect(codes({ ...base(), expression: "x+z" })).toContain("SURFACE_VARIABLE_INVALID");
    expect(codes({ ...base(), viewport: { ...base().viewport, xMin: 2 } })).toContain("SURFACE_VIEW_INVALID");
    expect(codes({ ...base(), grid: { xSteps: 41, ySteps: 8 } })).toContain("SURFACE_NUMBER_INVALID");
    expect(codes({ ...base(), grid: { xSteps: 8.5, ySteps: 8 } })).toContain("SURFACE_GRID_INVALID");
    expect(codes({ ...base(), camera: { azimuth: 0, elevation: 1.8 } })).toContain("SURFACE_NUMBER_INVALID");
  });
  it("pins off-window holes, discontinuity probes, deterministic work and projection clamps", () => {
    const good = validateSurfaceSpec(base()); if (!good.ok) throw Error("fixture");
    const mesh = sampleSurface(good.value, good.ast);
    expect(mesh.faces).toHaveLength(128);
    expect(mesh.evaluations).toBe(81 + 5 * 64);
    expect(mesh.skippedCells).toBe(0);
    const small = projectSurface(mesh, good.value, { azimuth: 0, elevation: .6 }, 1, 1);
    expect([small.width, small.height]).toEqual([160, 160]);

    const clipped = validateSurfaceSpec({ ...base(), expression: "100+x+y" });
    if (!clipped.ok) throw Error("clipped fixture");
    expect(sampleSurface(clipped.value, clipped.ast).vertices.every(v => v === null)).toBe(true);

    const corner = validateSurfaceSpec({ ...base(), expression: "x+y", viewport: { ...base().viewport, zMin: -3, zMax: 1.9 } });
    if (!corner.ok) throw Error("corner fixture");
    expect(() => sampleSurface(corner.value, corner.ast)).not.toThrow();
    expect(sampleSurface(corner.value, corner.ast).skippedCells).toBeGreaterThan(0);

    const curved = validateSurfaceSpec({ ...base(), expression: "1/(1+100*((x-0.125)^2+(y-0.125)^2))", viewport: { ...base().viewport, zMin: 0, zMax: 2 } });
    if (!curved.ok) throw Error("curvature fixture");
    expect(sampleSurface(curved.value, curved.ast).skippedCells).toBeGreaterThan(0);

    const jump = validateSurfaceSpec({ ...base(), expression: "1/(x+y-0.13)", viewport: { ...base().viewport, zMin: -210, zMax: 20 } });
    if (!jump.ok) throw Error("jump fixture");
    expect(sampleSurface(jump.value, jump.ast).skippedCells).toBeGreaterThan(0);

    const pole = validateSurfaceSpec({ ...base(), expression: "1/(x-y)", viewport: { ...base().viewport, zMin: -5, zMax: 5 } });
    if (!pole.ok) throw Error("pole fixture");
    const pm = sampleSurface(pole.value, pole.ast);
    expect(pm.skippedCells).toBeGreaterThan(0);
    expect(pm.faces.length).toBeLessThan(128);
  });
});

describe("21B mutation pins — persisted rich surface", () => {
  const block = (id: string) => ({ type: "functionSurface3D", surface: defaultSurface(id) });
  it("pins duplicate IDs, surface-count bound and nested surface authority", () => {
    expect(validateRichContent(rich(block("same"), block("same"))).ok).toBe(false);
    expect(validateRichContent(rich(...Array.from({ length: RICH_LIMITS.functionSurfaces + 1 }, (_, i) => block("surface-" + i)))).ok).toBe(false);
    const bad = block("bad") as { type: string; surface: Record<string, unknown> };
    bad.surface.renderer = { rawSvg: "<svg/>" };
    expect(validateRichContent(rich(bad)).ok).toBe(false);
  });
});
