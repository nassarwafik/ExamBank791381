// Phase 21D-A.2 — physicsLab@1 classroom presets (fresh copies on every call; UI only). Each preset is a complete, valid experiment with
// student controls, tasks and PRIVATE checks (never sent to a student). Certification values, computed by hand from the governing
// equations and independent of the implementation:
//   SIM-05 pendulum  L = 1 m, θ₀ = 10°, γ = 0, m = 0.5 kg, g = 9.8:  T₀ = 2π√(L/g) = 2.00709 s; k = sin 5° = 0.0871557,
//                    T = T₀·(1 + k²/4 + 9k⁴/64 + …) = 2.01092 s; v_max = √(2gL(1 − cos θ₀)) = √(19.6 × 0.0151922) = 0.545681 m/s; E₀ = mgL(1 − cos θ₀) = 0.0744420 J.
//   SIM-06 spring    k = 20 N/m, m = 0.5 kg, x₀ = 0.1 m, c = 0, g = 9.8:  T = 2π√(m/k) = 0.993459 s, ω₀ = √40 = 6.32456 rad/s,
//                    Δ = mg/k = 0.245 m, F(x₀) = k·x₀ = 2 N, v(equilibrium) = ω₀·x₀ = 0.632456 m/s (first at T/4 = 0.248365 s), ½k·x₀² = 0.1 J.
//   SIM-07 energy    m = 2 kg, h₀ = 20 m, v₀ = +10 m/s, b = 0, g = 9.8:  E₀ = ½·2·100 + 2·9.8·20 = 492 J, H = 20 + 100/19.6 = 25.1020 m,
//                    t = (10 + √492)/9.8 = 3.28378 s, KE at impact = E₀ = 492 J (nothing dissipated without drag).
//   SIM-08 circuit   V = 12 V, R1 = 2 Ω, R2 = 6 Ω, R3 = 3 Ω, R1 + (R2 ∥ R3):  R2∥R3 = 2 Ω, R_eq = 4 Ω, I = 3 A, V1 = 6 V, V2 = V3 = 6 V,
//                    I2 = 1 A, I3 = 2 A, P = 36 W; on the I–V characteristic the point at 6 V is I = 1.5 A.
import type { LabConfigV1 } from "../physicsLabModel";
import type { LabKind } from "../physics/labCore";

export type LabPreset = { config: LabConfigV1; checks: Record<string, unknown>[] };
const ref = (id: string, label: string, weight: number, measurementId: string, quantity: string, tolerance: number) => ({ id, label, weight, kind: "lab.referenceValue", measurementId, quantity, tolerance });

const pendulum = (): LabPreset => ({
  config: {
    v: 1, experiment: "pendulum", params: { length: 1, initialAngle: 10, damping: 0, mass: 0.5, gravity: 9.8 },
    controls: [{ param: "length", min: 0.2, max: 5, step: 0.1 }, { param: "initialAngle", min: 1, max: 90, step: 1 }, { param: "damping", min: 0, max: 1, step: 0.05 }, { param: "gravity", min: 1.6, max: 24.8, step: 0.1 }],
    view: { maxTime: 10, graphs: ["angularVelocity", "energy"], showVectors: true },
    tasks: { measurements: [{ id: "period", label: "دور البندول المقيس", unit: "s" }, { id: "smallAnglePeriod", label: "الدور المحسوب بتقريب الزاوية الصغيرة", unit: "s" }, { id: "maxSpeed", label: "أقصى سرعة للثقل", unit: "m/s" }], points: [] }
  },
  checks: [ref("period", "الدور المقيس", 2, "period", "measuredPeriod", 0.03), ref("small-angle", "دور الزاوية الصغيرة", 1, "smallAnglePeriod", "smallAnglePeriod", 0.01), ref("max-speed", "أقصى سرعة", 1, "maxSpeed", "maxSpeed", 0.02)]
});
const spring = (): LabPreset => ({
  config: {
    v: 1, experiment: "spring", params: { springConstant: 20, mass: 0.5, initialDisplacement: 0.1, damping: 0, gravity: 9.8 },
    controls: [{ param: "springConstant", min: 5, max: 100, step: 1 }, { param: "mass", min: 0.1, max: 2, step: 0.1 }, { param: "initialDisplacement", min: -0.3, max: 0.3, step: 0.01 }, { param: "damping", min: 0, max: 5, step: 0.1 }],
    view: { maxTime: 5, graphs: ["force", "velocity", "energy"], showVectors: true },
    tasks: {
      measurements: [{ id: "period", label: "دور الاهتزاز", unit: "s" }, { id: "equilibrium", label: "استطالة النابض عند الاتزان", unit: "m" }, { id: "restoringForce", label: "القوة المُعيدة عند الإفلات", unit: "N" }],
      points: [{ id: "firstEquilibrium", label: "أول مرور بموضع الاتزان على منحنى الإزاحة–الزمن" }]
    }
  },
  checks: [
    ref("period", "الدور", 2, "period", "period", 0.02), ref("equilibrium", "استطالة الاتزان", 1, "equilibrium", "equilibriumExtension", 0.005), ref("restoring", "القوة المُعيدة", 1, "restoringForce", "restoringForceAtRelease", 0.05),
    { id: "first-equilibrium", label: "أول مرور بالاتزان", weight: 1, kind: "pointNear@1", pointId: "firstEquilibrium", expected: { x: 0.2484, y: 0 }, tolerance: 0.02 }
  ]
});
const energy = (): LabPreset => ({
  config: {
    v: 1, experiment: "energy", params: { mass: 2, initialHeight: 20, initialVelocity: 10, drag: 0, gravity: 9.8 },
    controls: [{ param: "mass", min: 0.5, max: 10, step: 0.5 }, { param: "initialHeight", min: 0, max: 50, step: 1 }, { param: "initialVelocity", min: -20, max: 30, step: 1 }, { param: "drag", min: 0, max: 2, step: 0.05 }],
    view: { maxTime: 5, graphs: ["height", "velocity"], showVectors: true },
    tasks: { measurements: [{ id: "initialEnergy", label: "الطاقة الميكانيكية الابتدائية", unit: "J" }, { id: "maxHeight", label: "أقصى ارتفاع", unit: "m" }, { id: "impactKineticEnergy", label: "الطاقة الحركية عند الارتطام", unit: "J" }], points: [] }
  },
  checks: [ref("initial-energy", "الطاقة الابتدائية", 1, "initialEnergy", "initialEnergy", 1), ref("max-height", "أقصى ارتفاع", 1, "maxHeight", "maxHeight", 0.1), ref("impact-ke", "الطاقة الحركية عند الارتطام", 2, "impactKineticEnergy", "impactKineticEnergy", 2)]
});
const circuit = (): LabPreset => ({
  config: {
    v: 1, experiment: "circuit", params: { voltage: 12, r1: 2, r2: 6, r3: 3, topology: 3 },
    controls: [{ param: "voltage", min: 1, max: 24, step: 1 }, { param: "r1", min: 1, max: 20, step: 1 }, { param: "r2", min: 1, max: 20, step: 1 }, { param: "r3", min: 1, max: 20, step: 1 }, { param: "topology", min: 1, max: 4, step: 1 }],
    view: { maxTime: 10, graphs: ["power"], showVectors: true },
    tasks: {
      measurements: [{ id: "equivalentResistance", label: "المقاومة المكافئة", unit: "Ω" }, { id: "totalCurrent", label: "التيار الكلي", unit: "A" }, { id: "current2", label: "التيار المار في R2", unit: "A" }, { id: "voltage1", label: "فرق الجهد على R1", unit: "V" }],
      points: [{ id: "iv6", label: "نقطة على منحنى التيار–الجهد عند 6 V" }]
    }
  },
  checks: [
    ref("req", "المقاومة المكافئة", 2, "equivalentResistance", "equivalentResistance", 0.05), ref("itotal", "التيار الكلي", 2, "totalCurrent", "totalCurrent", 0.05),
    ref("i2", "تيار R2", 1, "current2", "current2", 0.05), ref("v1", "جهد R1", 1, "voltage1", "voltage1", 0.1),
    { id: "iv-point", label: "نقطة التيار–الجهد", weight: 1, kind: "pointNear@1", pointId: "iv6", expected: { x: 6, y: 1.5 }, tolerance: 0.05 }
  ]
});
export const LAB_PRESETS: Readonly<Record<LabKind, () => LabPreset>> = Object.freeze({ pendulum, spring, energy, circuit });
/** The starting config when a teacher picks physicsLab@1 (the pendulum classroom experiment). */
export const labStarterConfig = (): LabConfigV1 => pendulum().config;
