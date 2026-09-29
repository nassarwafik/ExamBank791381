// Phase 13C-A — SYNTHETIC assessment-activity fixtures (test-only). Reuses the learning engine's demo renderers so the
// assessment host / registry / boundary / fallback paths are exercised without any real simulation. Never production.
import { createActivityRegistry } from "./learning/activities/engine";
import { DemoActivity, StatefulDemoActivity, ThrowingActivity } from "./learning/activities/demoActivities";
import type { AssessmentActivityDescriptor } from "./assessmentTypes";

export const assessmentDemoRegistry = createActivityRegistry([
  { kind: "simulation", key: "demo-stateful", versions: [1], load: async () => ({ default: StatefulDemoActivity }), capabilities: { fullscreen: true, reset: true, interactive: true } },
  { kind: "simulation", key: "demo-plain", versions: [1], load: async () => ({ default: DemoActivity }) },
  { kind: "interactive-diagram", key: "demo-diagram", versions: [1, 2], load: async () => ({ default: DemoActivity }) },
  { kind: "simulation", key: "boom", versions: [1], load: async () => ({ default: ThrowingActivity }) }
]);

export const statefulDescriptor: AssessmentActivityDescriptor = { id: "act-1", kind: "simulation", key: "demo-stateful", version: 1, title: "محاكاة تجريبية", description: "سياق تفاعلي للسؤال", config: { start: 0 } };
export const plainDescriptor: AssessmentActivityDescriptor = { id: "act-2", kind: "simulation", key: "demo-plain", version: 1, title: "سياق بسيط" };
export const unknownDescriptor: AssessmentActivityDescriptor = { id: "act-3", kind: "simulation", key: "does-not-exist", version: 1, title: "نشاط غير معروف" };
export const unsupportedVersionDescriptor: AssessmentActivityDescriptor = { id: "act-4", kind: "interactive-diagram", key: "demo-diagram", version: 9, title: "إصدار غير مدعوم" };
export const throwingDescriptor: AssessmentActivityDescriptor = { id: "act-5", kind: "simulation", key: "boom", version: 1, title: "نشاط يفشل" };
