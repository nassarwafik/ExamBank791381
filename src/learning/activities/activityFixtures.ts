// Learning Materials — Phase 3A: SYNTHETIC ACTIVITY FIXTURES ONLY.
//
// Imported only by *.test.ts(x). This is NOT production content and is never exposed to real students (the
// production registry in engine.ts ships EMPTY). It wires trivial demo renderers (from demoActivities.tsx) into a
// demo registry + a set of synthetic activity descriptors, so the engine shell (resolve -> lazy-load -> boundary ->
// fallback -> fullscreen -> commands -> events) can be exercised deterministically without any real simulation and
// no network. It exports DATA only (no component definitions) so it stays fast-refresh clean.

import { createActivityRegistry } from "./engine";
import { DemoActivity, StatefulDemoActivity, ThrowingActivity } from "./demoActivities";
import type {
  ActivityBlock, SimulationBlock, AnimationBlock, GuidedBlock, InteractiveDiagramBlock, ContentPage,
} from "../content/types";

// ── demo registry (trusted repo code; keys/versions/capabilities are data, components are never named by content) ─
export const demoActivityRegistry = createActivityRegistry([
  // fullscreen-capable, stateful — proves single-instance state preservation across inline <-> fullscreen
  { kind: "simulation", key: "vlan", versions: [1], load: async () => ({ default: StatefulDemoActivity }), capabilities: { fullscreen: true } },
  // declares reset + replay -> the shell shows both generic controls
  { kind: "simulation", key: "counter", versions: [1], load: async () => ({ default: StatefulDemoActivity }), capabilities: { reset: true, replay: true } },
  // declares NOTHING -> the shell shows no control at all, whatever the content block asks for
  { kind: "simulation", key: "plain", versions: [1], load: async () => ({ default: DemoActivity }) },
  { kind: "animation", key: "packet-flow", versions: [1], load: async () => ({ default: DemoActivity }) },
  { kind: "interactive-diagram", key: "switch-ports", versions: [1], load: async () => ({ default: DemoActivity }) },
  { kind: "simulation", key: "boom", versions: [1], load: async () => ({ default: ThrowingActivity }) },
]);

// ── synthetic activity descriptors ──────────────────────────────────────────────────────────────────────────
export const simBlock: SimulationBlock = {
  id: "sb-sim", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", version: 1,
  title: "محاكاة VLAN", description: "توزيع المنافذ على شبكات VLAN.", capabilities: { fullscreen: true },
};
/** Renderer declares reset + replay. */
export const commandsBlock: SimulationBlock = {
  id: "sb-cmd", type: "simulation", origin: "teacher-enrichment", simulationType: "counter", version: 1,
  title: "عدّاد تجريبي",
};
/** CONTENT asks for every control, but the renderer declares none -> no control may appear (registry authority). */
export const overclaimingBlock: SimulationBlock = {
  id: "sb-over", type: "simulation", origin: "teacher-enrichment", simulationType: "plain", version: 1,
  title: "محاكاة تدّعي قدرات", capabilities: { fullscreen: true, reset: true, replay: true, pause: true, speed: true },
};
export const animBlock: AnimationBlock = {
  id: "sb-anim", type: "animation", origin: "teacher-enrichment", animationType: "packet-flow", version: 1,
  title: "رحلة الحزمة", description: "تتبّع مسار الحزمة.",
};
/** A structured guided walkthrough (حل مع المعلم) rendered by the BUILT-IN progressive-reveal presenter. */
export const guidedBlock: GuidedBlock = {
  id: "sb-guided", type: "guided", origin: "teacher-enrichment", guidedType: "reveal", version: 1,
  title: "حوّل 44 إلى الثنائي خطوة بخطوة",
  prompt: [{ text: "المطلوب: تحويل العدد " }, { text: "44", dir: "ltr", style: "code" }, { text: " إلى النظام الثنائي." }],
  steps: [
    { id: "g1", text: [{ text: "اكتب قيم الخانات: " }, { text: "128 64 32 16 8 4 2 1", dir: "ltr", style: "code" }] },
    { id: "g2", text: [{ text: "أكبر قيمة لا تتجاوز 44 هي 32، ضع 1 تحتها." }], note: "المتبقي 12" },
    { id: "g3", text: [{ text: "12 = 8 + 4، ضع 1 تحت 8 و 4، وصفرًا تحت الباقي." }] },
  ],
  result: [{ text: "00101100", dir: "ltr", style: "code" }],
  explanation: "اجمع القيم التي تحتها 1: 32 + 8 + 4 = 44.",
};
export const diagramBlock: InteractiveDiagramBlock = {
  id: "sb-diagram", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "switch-ports", version: 1,
  title: "منافذ السويتش", fallback: { text: "مخطط ثابت للمنافذ.", src: "/learning/791381/ports.png", alt: "مخطط المنافذ" },
};
/** Registered key but an UNSUPPORTED version -> must render the static fallback (graceful version mismatch). */
export const unsupportedVersionBlock: SimulationBlock = {
  id: "sb-oldver", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", version: 99,
  title: "محاكاة قديمة",
};
/** Key with NO registered renderer -> static fallback (the Phase-3A production path for every registry family). */
export const unregisteredBlock: SimulationBlock = {
  id: "sb-unreg", type: "simulation", origin: "teacher-enrichment", simulationType: "does-not-exist", version: 1,
  title: "محاكاة غير مسجّلة", description: "لا يوجد مكوّن مسجّل لها.",
  source: { kind: "book", sourceId: "791381", pdfPageStart: 124 }, // ASSOCIATED with a book page; origin stays enrichment
};
/** A live renderer that throws -> boundary catches -> static fallback. */
export const throwingBlock: SimulationBlock = {
  id: "sb-throw", type: "simulation", origin: "teacher-enrichment", simulationType: "boom", version: 1,
  title: "محاكاة معطوبة",
};

export const allActivityBlocks: ActivityBlock[] = [simBlock, animBlock, guidedBlock, diagramBlock];

/**
 * A SYNTHETIC showcase page exercising all four activity families — used only by tests / a future internal preview.
 * It is deliberately NOT wired into any production route, catalog, or registry, so real students never see it.
 */
export const showcasePage: ContentPage = {
  id: "showcase-p01", title: "عرض الأنشطة التفاعلية (تجريبي)", order: 1,
  source: { kind: "book", sourceId: "791381", pdfPageStart: 1 },
  blocks: allActivityBlocks,
};
