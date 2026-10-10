// Phase 21D-A.4 — classroom presets of SurfacePlotSpecV2 (fresh copies; UI only) and the one-way, explicit upgrade of a Phase 21B
// SurfaceSpecV1 to a single-surface V2 plot (the teacher chooses it in the editor; stored V1 plots are never converted silently).
import type { SurfaceSpecV1 } from "./surfaceSpec";
import { DEFAULT_PLOT_CAMERA, type SurfacePlotSpecV2 } from "./surfacePlotSpec";

export const SURFACE_PLOT_PRESET_KEYS = Object.freeze(["paraboloids", "saddlePlane", "conePlane", "single"] as const);
export type SurfacePlotPresetKey = (typeof SURFACE_PLOT_PRESET_KEYS)[number];
export const SURFACE_PLOT_PRESET_LABELS: Readonly<Record<SurfacePlotPresetKey, string>> = Object.freeze({
  paraboloids: "قطعان مكافئان متقابلان: z = x² + y² و z = 4 − x² − y²",
  saddlePlane: "سطح سرجي ومستوى: z = x² − y² و z = 1",
  conePlane: "مخروط ومستوى: z = √(x² + y²) و z = 0.5x + 1",
  single: "سطح واحد: z = x² + y²"
});
export const newSurfacePlotId = () => "plot-" + Math.random().toString(36).slice(2, 8);
const base = (id: string, title: string, description: string, viewport: SurfacePlotSpecV2["viewport"], surfaces: SurfacePlotSpecV2["surfaces"]): SurfacePlotSpecV2 => ({
  version: 2, id, title, description, surfaces, viewport,
  axes: { x: { label: "x" }, y: { label: "y" }, z: { label: "z" } },
  quality: "standard", display: { style: "mesh", grid: true }, controls: { rotate: true, zoom: true, toggleSurfaces: true },
  camera: { ...DEFAULT_PLOT_CAMERA }
});
export function surfacePlotPreset(key: SurfacePlotPresetKey, id = newSurfacePlotId()): SurfacePlotSpecV2 {
  if (key === "saddlePlane") return base(id, "سطح سرجي يقطعه مستوى", "السطح z = x² − y² والمستوى الأفقي z = 1 في نظام إحداثيات واحد.", { xMin: -2, xMax: 2, yMin: -2, yMax: 2, zMin: -4, zMax: 4 }, [
    { id: "saddle", label: "السطح السرجي z = x² − y²", expression: "x^2-y^2", color: "green" },
    { id: "plane", label: "المستوى z = 1", expression: "1", color: "amber" }
  ]);
  if (key === "conePlane") return base(id, "مخروط يقطعه مستوى مائل", "السطح المخروطي z = √(x² + y²) والمستوى المائل z = 0.5x + 1.", { xMin: -2, xMax: 2, yMin: -2, yMax: 2, zMin: 0, zMax: 3 }, [
    { id: "cone", label: "المخروط z = √(x² + y²)", expression: "sqrt(x^2+y^2)", color: "rose" },
    { id: "plane", label: "المستوى z = 0.5x + 1", expression: "0.5*x+1", color: "blue" }
  ]);
  if (key === "single") return base(id, "سطح القطع المكافئ", "السطح z = x² + y² بدقة عرض محسّنة.", { xMin: -2, xMax: 2, yMin: -2, yMax: 2, zMin: -1, zMax: 8 }, [
    { id: "paraboloid", label: "z = x² + y²", expression: "x^2+y^2", color: "blue" }
  ]);
  return base(id, "قطعان مكافئان متقابلان", "السطحان z = x² + y² و z = 4 − x² − y² يتقاطعان على الدائرة x² + y² = 2 عند z = 2.", { xMin: -2, xMax: 2, yMin: -2, yMax: 2, zMin: -1, zMax: 5 }, [
    { id: "upward", label: "القطع المكافئ z = x² + y²", expression: "x^2+y^2", color: "blue" },
    { id: "downward", label: "القطع المكافئ المقلوب z = 4 − x² − y²", expression: "4-x^2-y^2", color: "amber" }
  ]);
}
export const defaultSurfacePlot = (id = newSurfacePlotId()): SurfacePlotSpecV2 => surfacePlotPreset("single", id);
/** A V1 surface as a single-surface V2 plot (same id, texts, formula and window; the V2 default view and controls). */
export function surfacePlotFromV1(v1: SurfaceSpecV1): SurfacePlotSpecV2 {
  const label = ("z = " + v1.expression).length <= 60 ? "z = " + v1.expression : v1.title.slice(0, 60);
  return { ...base(v1.id, v1.title, v1.description, { ...v1.viewport }, [{ id: "surface1", label, expression: v1.expression, color: "blue" }]), controls: { rotate: true, zoom: true, toggleSurfaces: false } };
}
