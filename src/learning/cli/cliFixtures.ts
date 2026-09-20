// Learning Materials — CLI simulator: SYNTHETIC exercise fixtures for tests ONLY (imported by *.test.ts(x)).
// These are generic demo scenarios (a switch trunk task, a guided walkthrough, a challenge, a Port Security task,
// a device-hardening task) that exercise the engine independently of any book content; they are never shipped to
// students and never wired into a module.
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

/** Batch 9 — a Port Security TASK checked on the final state (access port, enabled, max 2, sticky, shutdown). */
export const portSecurityTask: CliExerciseConfig = {
  kind: "task",
  device: "switch",
  intro: "أمّن المنفذ f0/1: وضع Access، فعّل Port Security، جهازان على الأكثر، Sticky، والإجراء shutdown.",
  goals: [
    { id: "g-access", label: "f0/1 في وضع Access", condition: { kind: "interface", name: "f0/1", prop: "switchportMode", value: "access" } },
    { id: "g-on", label: "Port Security مفعّل على f0/1", condition: { kind: "port-security", name: "f0/1", prop: "enabled", value: true } },
    { id: "g-max", label: "الحد الأقصى جهازان", condition: { kind: "port-security", name: "f0/1", prop: "maximum", value: 2 } },
    { id: "g-sticky", label: "Sticky MAC مفعّل", condition: { kind: "port-security", name: "f0/1", prop: "sticky", value: true } },
    { id: "g-violation", label: "الإجراء عند المخالفة shutdown", condition: { kind: "port-security", name: "f0/1", prop: "violation", value: "shutdown" } },
  ],
  hints: ["ادخل إلى الواجهة أولًا ثم استخدم أوامر switchport.", "أوامر Port Security كلها تبدأ بـ switchport port-security."],
};

/** Batch 9 — a device-hardening TASK: console + vty passwords with login, enable secret, password encryption. */
export const hardeningTask: CliExerciseConfig = {
  kind: "task",
  device: "switch",
  goals: [
    { id: "g-con-pw", label: "كلمة مرور Console هي cisco123", condition: { kind: "line", line: "console", prop: "password", value: "cisco123" } },
    { id: "g-con-login", label: "Console يطلب كلمة المرور", condition: { kind: "line", line: "console", prop: "login", value: true } },
    { id: "g-vty-pw", label: "كلمة مرور VTY هي cisco123", condition: { kind: "line", line: "vty", prop: "password", value: "cisco123" } },
    { id: "g-vty-login", label: "VTY يطلب كلمة المرور", condition: { kind: "line", line: "vty", prop: "login", value: true } },
    { id: "g-secret", label: "enable secret هو cisco123", condition: { kind: "device", prop: "enableSecret", value: "cisco123" } },
    { id: "g-enc", label: "تشفير كلمات المرور مفعّل", condition: { kind: "device", prop: "passwordEncryption", value: true } },
  ],
  hints: ["كل خط دخول له وضع خاص يبدأ بـ line.", "داخل الخط: password ثم login."],
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
