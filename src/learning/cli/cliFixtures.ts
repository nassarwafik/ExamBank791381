// Learning Materials — CLI simulator: SYNTHETIC exercise fixtures for tests ONLY (imported by *.test.ts(x)).
// These are generic demo scenarios (a switch trunk task, a guided walkthrough, a challenge) that exercise the
// engine independently of any book content; they are never shipped to students and never wired into a module.
import type { CliExerciseConfig } from "./types";
import type { SimulationBlock } from "../content/types";

/** The multi-step configuration TASK from the simulator specification: trunk f0/1 with VLANs 10, 20, 30. */
export const trunkTask: CliExerciseConfig = {
  kind: "task",
  device: "switch",
  intro: "اجعل المنفذ f0/1 منفذ Trunk يسمح بـ VLAN 10 و 20 و 30.",
  goals: [
    { id: "g-mode", label: "المنفذ f0/1 في وضع Trunk", condition: { kind: "interface", name: "f0/1", prop: "switchportMode", value: "trunk" } },
    { id: "g-allowed", label: "المنفذ f0/1 يسمح بـ VLAN 10 و 20 و 30", condition: { kind: "interface", name: "f0/1", prop: "allowedVlans", value: [10, 20, 30] } },
  ],
  hints: ["فكر في الوضع الذي يجب أن تكون فيه قبل تعديل إعدادات المنفذ.", "بعد الدخول إلى interface استخدم أمرًا يبدأ بـ switchport."],
};

/** A GUIDED walkthrough: enter global configuration then select an interface. */
export const guidedModes: CliExerciseConfig = {
  kind: "guided",
  device: "switch",
  steps: [
    { id: "s1", instruction: "انتقل إلى وضع الأوامر المتقدّم", expect: { mode: "privileged" }, success: "✓ أحسنت، انتقلت إلى وضع الأوامر المتقدّم", hints: ["الأمر الأول الذي يفتح الوضع المتقدّم.", "يبدأ بـ en."] },
    { id: "s2", instruction: "انتقل إلى وضع الإعداد العام", expect: { mode: "global" }, success: "✓ أحسنت، انتقلت إلى وضع الإعداد العام", hints: ["من الوضع المتقدّم فقط.", "يبدأ بـ configure."] },
    { id: "s3", instruction: "اختر الواجهة f0/1", expect: { command: "interface", args: { interfaces: ["f0/1"] } }, hints: ["أمر اختيار الواجهة.", "يبدأ بـ interface."] },
  ],
  completion: "✓ أحسنت، أنهيت المثال الموجّه",
};

/** A single-command CHALLENGE that starts inside interface configuration mode. */
export const trunkChallenge: CliExerciseConfig = {
  kind: "challenge",
  device: "switch",
  startMode: "interface",
  startInterface: "f0/1",
  steps: [
    { id: "c1", instruction: "اكتب الأمر الذي يحوّل المنفذ إلى Trunk", expect: { command: "switchport-mode", args: { mode: "trunk" } }, hints: ["فكر في الوضع الذي يجب أن تكون فيه قبل تعديل إعدادات المنفذ.", "بعد الدخول إلى interface استخدم أمرًا يبدأ بـ switchport."] },
  ],
  allowed: ["switchport-mode"],
};

/** A synthetic cli-terminal block wrapping an exercise (for component tests). */
export function cliBlock(config: CliExerciseConfig, id = "cli-demo"): SimulationBlock {
  return {
    id, type: "simulation", origin: "teacher-enrichment", simulationType: "cli-terminal", version: 1,
    title: "تدريب CLI تجريبي", capabilities: { fullscreen: true, reset: true, interactive: true },
    fallback: { text: "محاكاة سطر الأوامر غير متوفرة." },
    config: config as unknown as Record<string, unknown>,
  };
}
