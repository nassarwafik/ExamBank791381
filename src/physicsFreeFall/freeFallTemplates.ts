// Phase 20A.2 — physicsFreeFall@1 authoring presets (fresh copies on every call). The classroom drop: 20 m, released from rest, g = 9.8 m/s².
// Certification values (independent of the implementation): t_impact = √(2·20 / 9.8) ≈ 2.0203 s, impact speed = √(2·9.8·20) ≈ 19.799 m/s,
// y(1) = 15.1 m, v(1) = −9.8 m/s. The checks hold the PRIVATE tolerances and weights (total 12) and never reach a student.
import type { FreeFallConfigV1 } from "../physicsFreeFallModel";

export const freeFallClassroomConfig = (): FreeFallConfigV1 => ({
  v: 1,
  model: { initialHeight: 20, initialVelocity: 0, gravity: 9.8 },
  view: { maxTime: 3, showVelocityGraph: true },
  tasks: {
    measurements: [
      { id: "impactTime", label: "زمن الوصول إلى الأرض", unit: "s" },
      { id: "impactSpeed", label: "سرعة الارتطام بالأرض (مقدار)", unit: "m/s" },
      { id: "heightAt1s", label: "الارتفاع عند الزمن 1 ث", unit: "m" },
      { id: "velocityAt1s", label: "السرعة المتجهة عند الزمن 1 ث (الأعلى موجب)", unit: "m/s" }
    ],
    points: [
      { id: "impactPoint", label: "نقطة الارتطام على منحنى الارتفاع–الزمن" },
      { id: "pointAt1s", label: "نقطة من منحنى الارتفاع–الزمن عند 1 ث" }
    ]
  }
});
export const freeFallClassroomChecks = (): Record<string, unknown>[] => [
  { id: "impact-time", label: "زمن الوصول إلى الأرض", weight: 3, kind: "physics.impactTime", measurementId: "impactTime", tolerance: 0.05 },
  { id: "impact-speed", label: "سرعة الارتطام", weight: 3, kind: "physics.impactSpeed", measurementId: "impactSpeed", tolerance: 0.1 },
  { id: "height-1s", label: "الارتفاع عند 1 ث", weight: 2, kind: "physics.heightAtTime", measurementId: "heightAt1s", time: 1, tolerance: 0.05 },
  { id: "velocity-1s", label: "السرعة المتجهة عند 1 ث", weight: 1, kind: "numericNear@1", valueId: "velocityAt1s", expected: -9.8, tolerance: 0.05 },
  { id: "impact-point", label: "نقطة الارتطام على المنحنى", weight: 2, kind: "pointNear@1", pointId: "impactPoint", expected: { x: 2.0203, y: 0 }, tolerance: 0.05 },
  { id: "point-1s", label: "نقطة على منحنى الحركة", weight: 1, kind: "physics.pointOnTrajectory", pointId: "pointAt1s", tolerance: 0.1 }
];
/** A blank-but-valid starting config used when a teacher picks the plugin (no checks: the teacher adds them or applies the preset). */
export const freeFallStarterConfig = (): FreeFallConfigV1 => freeFallClassroomConfig();
