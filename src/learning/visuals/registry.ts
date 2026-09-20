// Learning Materials — SVG VISUAL ENRICHMENT registry (pilot, Chapter 1).
//
// The EXACT allowlist that maps a content `visualId` (a plain string) to a TRUSTED repo SVG component. Security
// discipline (same spirit as the activity engine): content never names a component, module path or code; a visual
// is reached ONLY through an entry enumerated here. An unknown key resolves to `null`, and the Reader then renders
// a faithful "قيد الإعداد" fallback (never a blank or a guess). Components are imported EAGERLY — each SVG is a few
// hundred bytes of markup, so a code-split chunk would cost more than it saves.
//
// This registry is course-agnostic: keys are namespaced (`791381/ch1/...`) so later chapters/courses add entries
// WITHOUT touching the Reader, the block type, or existing visuals. The enumerated set + its size are pinned by
// visuals.guards.test.ts (the test, not this comment, is the authority on the count).

import type { RegisteredVisual } from "./types";
import NetworkConnectedDevices from "./791381/chapter1/NetworkConnectedDevices";
import NetworkUsesMap from "./791381/chapter1/NetworkUsesMap";
import SharedPrinterDiagram from "./791381/chapter1/SharedPrinterDiagram";
import NetworkBuildingBlocks from "./791381/chapter1/NetworkBuildingBlocks";
import NetworkManagementCycle from "./791381/chapter1/NetworkManagementCycle";

const VISUALS: readonly RegisteredVisual[] = [
  { id: "791381/ch1/network-connected-devices", component: NetworkConnectedDevices, motion: true },
  { id: "791381/ch1/network-uses-map", component: NetworkUsesMap, motion: true },
  { id: "791381/ch1/shared-printer", component: SharedPrinterDiagram, motion: true },
  { id: "791381/ch1/network-building-blocks", component: NetworkBuildingBlocks, motion: true },
  { id: "791381/ch1/network-management-cycle", component: NetworkManagementCycle, motion: true },
];

// Build the lookup once. A duplicate id is a programming error (a later entry silently shadowing an earlier one), so
// fail loudly at module load rather than resolve ambiguously.
const BY_ID = new Map<string, RegisteredVisual>();
for (const v of VISUALS) {
  if (BY_ID.has(v.id)) throw new Error(`duplicate visual id "${v.id}" in registry`);
  BY_ID.set(v.id, v);
}

/** Resolve a content `visualId` to its trusted registered visual, or `null` when there is no exact match. */
export function resolveVisual(id: string): RegisteredVisual | null {
  return (typeof id === "string" && BY_ID.get(id)) || null;
}

/** The enumerated visual ids (stable order) — used by guards/tests and never derived from content. */
export const REGISTERED_VISUAL_IDS: readonly string[] = VISUALS.map(v => v.id);
