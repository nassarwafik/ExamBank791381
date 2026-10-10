// Phase 21D-A.1 — physicsMotion@1 classroom presets (fresh copies on every call; UI only). Each preset is a complete, valid experiment with
// student controls, tasks and PRIVATE checks (never sent to a student). Certification values, computed by hand from the governing
// equations and independent of the implementation:
//   SIM-01 free fall   h0 = 45 m, v0 = 0, g = 9.8:   t = √(2·45/9.8) = 3.03046 s, impact speed = √(2·9.8·45) = √882 = 29.6985 m/s.
//   SIM-02 projectile  v0 = 20 m/s, α = 45°, h0 = 0, g = 9.8:  T = 2·v0·sinα/g = 2.88615 s, R = v0²·sin2α/g = 40.8163 m,
//                      H = (v0·sinα)²/(2g) = 10.2041 m.
//   SIM-03 Newton 2    m = 2 kg, F = 10 N, μs = 0.3, μk = 0.2, g = 9.8:  N = 19.6 N, μs·N = 5.88 N < F ⇒ slides; μk·N = 3.92 N;
//                      a = (10 − 3.92)/2 = 3.04 m/s²; after 4 s: v = 12.16 m/s, x = 24.32 m; x(2 s) = 6.08 m.
//   SIM-04 incline     θ = 30°, m = 5 kg, L = 10 m, μs = 0.3, μk = 0.2, g = 9.8:  tanθ = 0.577 > μs ⇒ slides;
//                      a = g(sinθ − μk·cosθ) = 3.20259 m/s², N = m·g·cosθ = 42.4352 N, t = √(2L/a) = 2.49899 s, v = √(2aL) = 8.00324 m/s.
import type { MotionConfigV1 } from "../physicsMotionModel";
import type { MotionKind } from "../physics/motionCore";

export type MotionPreset = { config: MotionConfigV1; checks: Record<string, unknown>[] };

const freeFall = (): MotionPreset => ({
  config: {
    v: 1, experiment: "freeFall", params: { initialHeight: 45, initialVelocity: 0, gravity: 9.8 },
    controls: [{ param: "initialHeight", min: 5, max: 100, step: 5 }, { param: "gravity", min: 1.6, max: 24.8, step: 0.1 }],
    view: { maxTime: 5, graphs: ["velocity", "acceleration"], showVectors: true },
    tasks: {
      measurements: [{ id: "impactTime", label: "زمن الوصول إلى الأرض", unit: "s" }, { id: "impactSpeed", label: "سرعة الارتطام بالأرض (مقدار)", unit: "m/s" }],
      points: [{ id: "impactPoint", label: "نقطة الارتطام على منحنى الارتفاع–الزمن" }]
    }
  },
  checks: [
    { id: "impact-time", label: "زمن الوصول إلى الأرض", weight: 2, kind: "motion.referenceValue", measurementId: "impactTime", quantity: "impactTime", tolerance: 0.05 },
    { id: "impact-speed", label: "سرعة الارتطام", weight: 2, kind: "motion.referenceValue", measurementId: "impactSpeed", quantity: "impactSpeed", tolerance: 0.1 },
    { id: "impact-point", label: "نقطة الارتطام على المنحنى", weight: 1, kind: "pointNear@1", pointId: "impactPoint", expected: { x: 3.0305, y: 0 }, tolerance: 0.05 }
  ]
});
const projectile = (): MotionPreset => ({
  config: {
    v: 1, experiment: "projectile", params: { initialSpeed: 20, launchAngle: 45, launchHeight: 0, gravity: 9.8 },
    controls: [{ param: "initialSpeed", min: 5, max: 40, step: 1 }, { param: "launchAngle", min: 5, max: 85, step: 1 }, { param: "launchHeight", min: 0, max: 20, step: 1 }],
    view: { maxTime: 10, graphs: ["height", "velocity"], showVectors: true },
    tasks: {
      measurements: [{ id: "range", label: "المدى الأفقي", unit: "m" }, { id: "maxHeight", label: "أقصى ارتفاع", unit: "m" }, { id: "flightTime", label: "زمن الطيران", unit: "s" }],
      points: [{ id: "landingPoint", label: "نقطة سقوط المقذوف على المسار" }]
    }
  },
  checks: [
    { id: "range", label: "المدى الأفقي", weight: 2, kind: "motion.referenceValue", measurementId: "range", quantity: "range", tolerance: 0.2 },
    { id: "max-height", label: "أقصى ارتفاع", weight: 2, kind: "motion.referenceValue", measurementId: "maxHeight", quantity: "maxHeight", tolerance: 0.1 },
    { id: "flight-time", label: "زمن الطيران", weight: 1, kind: "motion.referenceValue", measurementId: "flightTime", quantity: "flightTime", tolerance: 0.05 },
    { id: "landing-point", label: "نقطة السقوط", weight: 1, kind: "pointNear@1", pointId: "landingPoint", expected: { x: 40.8163, y: 0 }, tolerance: 0.3 }
  ]
});
const newton2 = (): MotionPreset => ({
  config: {
    v: 1, experiment: "newton2", params: { mass: 2, appliedForce: 10, initialVelocity: 0, muStatic: 0.3, muKinetic: 0.2, gravity: 9.8 },
    controls: [{ param: "mass", min: 0.5, max: 10, step: 0.5 }, { param: "appliedForce", min: 0, max: 50, step: 1 }, { param: "muStatic", min: 0, max: 1, step: 0.05 }, { param: "muKinetic", min: 0, max: 1, step: 0.05 }],
    view: { maxTime: 4, graphs: ["velocity", "acceleration"], showVectors: true },
    tasks: {
      measurements: [{ id: "acceleration", label: "تسارع الجسم", unit: "m/s²" }, { id: "kineticFriction", label: "قوة الاحتكاك الحركي", unit: "N" }, { id: "finalVelocity", label: "السرعة بعد 4 ث", unit: "m/s" }],
      points: [{ id: "pointAt2s", label: "نقطة على منحنى الإزاحة–الزمن عند 2 ث" }]
    }
  },
  checks: [
    { id: "acceleration", label: "التسارع", weight: 2, kind: "motion.referenceValue", measurementId: "acceleration", quantity: "initialAcceleration", tolerance: 0.05 },
    { id: "kinetic-friction", label: "الاحتكاك الحركي", weight: 1, kind: "motion.referenceValue", measurementId: "kineticFriction", quantity: "kineticFriction", tolerance: 0.05 },
    { id: "final-velocity", label: "السرعة بعد 4 ث", weight: 1, kind: "motion.referenceValue", measurementId: "finalVelocity", quantity: "finalVelocity", tolerance: 0.1 },
    { id: "point-2s", label: "نقطة عند 2 ث", weight: 1, kind: "pointNear@1", pointId: "pointAt2s", expected: { x: 2, y: 6.08 }, tolerance: 0.1 }
  ]
});
const incline = (): MotionPreset => ({
  config: {
    v: 1, experiment: "incline", params: { angle: 30, mass: 5, length: 10, initialVelocity: 0, muStatic: 0.3, muKinetic: 0.2, gravity: 9.8 },
    controls: [{ param: "angle", min: 0, max: 60, step: 1 }, { param: "mass", min: 1, max: 20, step: 1 }, { param: "muStatic", min: 0, max: 1, step: 0.05 }, { param: "muKinetic", min: 0, max: 1, step: 0.05 }],
    view: { maxTime: 5, graphs: ["velocity", "acceleration"], showVectors: true },
    tasks: {
      measurements: [
        { id: "acceleration", label: "تسارع الجسم على المستوى", unit: "m/s²" }, { id: "normalForce", label: "القوة العمودية", unit: "N" },
        { id: "timeToBottom", label: "زمن الوصول إلى أسفل المستوى", unit: "s" }, { id: "speedAtBottom", label: "السرعة عند أسفل المستوى", unit: "m/s" }
      ],
      points: []
    }
  },
  checks: [
    { id: "acceleration", label: "التسارع", weight: 2, kind: "motion.referenceValue", measurementId: "acceleration", quantity: "initialAcceleration", tolerance: 0.05 },
    { id: "normal", label: "القوة العمودية", weight: 1, kind: "motion.referenceValue", measurementId: "normalForce", quantity: "normalForce", tolerance: 0.1 },
    { id: "time-bottom", label: "زمن الوصول إلى الأسفل", weight: 1, kind: "motion.referenceValue", measurementId: "timeToBottom", quantity: "timeToBottom", tolerance: 0.05 },
    { id: "speed-bottom", label: "السرعة عند الأسفل", weight: 1, kind: "motion.referenceValue", measurementId: "speedAtBottom", quantity: "speedAtBottom", tolerance: 0.1 }
  ]
});
export const MOTION_PRESETS: Readonly<Record<MotionKind, () => MotionPreset>> = Object.freeze({ freeFall, projectile, newton2, incline });
/** The starting config when a teacher picks physicsMotion@1 (the projectile classroom experiment). */
export const motionStarterConfig = (): MotionConfigV1 => projectile().config;
