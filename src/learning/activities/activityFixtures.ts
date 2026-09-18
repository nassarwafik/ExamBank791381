// Learning Materials — Phase 3A: SYNTHETIC ACTIVITY FIXTURES ONLY.
//
// Imported only by *.test.ts(x). This is NOT production content and is never exposed to real students (the
// production registry in engine.ts ships EMPTY). It wires trivial demo renderers (from demoActivities.tsx) into a
// demo registry + a set of synthetic activity descriptors, so the engine shell (resolve → lazy-load → boundary →
// fallback → fullscreen → events) can be exercised deterministically without any real simulation and no network.
// It exports DATA only (no component definitions) so it stays fast-refresh clean.

import { createActivityRegistry } from "./engine";
import { DemoActivity, ThrowingActivity } from "./demoActivities";
import type {
  ActivityBlock, SimulationBlock, AnimationBlock, GuidedBlock, InteractiveDiagramBlock, ContentPage,
} from "../content/types";

// ── demo registry (trusted repo code; keys/versions are data, components are never named by content) ────────────
export const demoActivityRegistry = createActivityRegistry([
  { kind: "simulation", key: "vlan", versions: [1], load: async () => ({ default: DemoActivity }), capabilities: { fullscreen: true } },
  { kind: "animation", key: "packet-flow", versions: [1], load: async () => ({ default: DemoActivity }) },
  { kind: "guided", key: "build-subnet", versions: [1], load: async () => ({ default: DemoActivity }), capabilities: { fullscreen: true } },
  { kind: "interactive-diagram", key: "switch-ports", versions: [1], load: async () => ({ default: DemoActivity }) },
  { kind: "simulation", key: "boom", versions: [1], load: async () => ({ default: ThrowingActivity }) },
]);

// ── synthetic activity descriptors ──────────────────────────────────────────────────────────────────────────
export const simBlock: SimulationBlock = {
  id: "sb-sim", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", version: 1,
  title: "محاكاة VLAN", description: "توزيع المنافذ على شبكات VLAN.", capabilities: { fullscreen: true },
};
export const animBlock: AnimationBlock = {
  id: "sb-anim", type: "animation", origin: "teacher-enrichment", animationType: "packet-flow", version: 1,
  title: "رحلة الحزمة", description: "تتبّع مسار الحزمة.",
};
export const guidedBlock: GuidedBlock = {
  id: "sb-guided", type: "guided", origin: "teacher-enrichment", guidedType: "build-subnet", version: 1,
  title: "ابنِ شبكة فرعية", capabilities: { fullscreen: true },
};
export const diagramBlock: InteractiveDiagramBlock = {
  id: "sb-diagram", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "switch-ports", version: 1,
  title: "منافذ السويتش", fallback: { text: "مخطط ثابت للمنافذ.", src: "/learning/791381/ports.png", alt: "مخطط المنافذ" },
};
/** Registered key but an UNSUPPORTED version → must render the static fallback (graceful version mismatch). */
export const unsupportedVersionBlock: SimulationBlock = {
  id: "sb-oldver", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", version: 99,
  title: "محاكاة قديمة",
};
/** Key with NO registered renderer → static fallback (the Phase-3A production path for every descriptor). */
export const unregisteredBlock: SimulationBlock = {
  id: "sb-unreg", type: "simulation", origin: "teacher-enrichment", simulationType: "does-not-exist", version: 1,
  title: "محاكاة غير مسجّلة", description: "لا يوجد مكوّن مسجّل لها.",
};
/** A live renderer that throws → boundary catches → static fallback. */
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
