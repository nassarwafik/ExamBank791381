// Learning Materials — Phase 3A: BUILT-IN activity presenters.
//
// Generic, content-driven presenters that ship inside the engine chunk (eager `component`, no lazy load) and are
// therefore available in production WITHOUT a registration in `productionActivityRegistry`. They are resolved with
// EXACTLY the same identity discipline as registry-backed renderers — {kind, key, version} through
// `createActivityRegistry` (nested maps, overlap protection) — never by block type alone. So a guided block whose
// key or version has no trusted presenter falls back gracefully, and a future presenter (e.g. a branching
// walkthrough, or `reveal` v2) is added HERE as a new entry without touching the Reader or the host.
//
// This is NOT a real networking simulation/animation: the only built-in is the generic progressive-reveal
// walkthrough (حل مع المعلم) that renders structured steps from content.

import { createActivityRegistry, type LearningActivityRegistry, type RegisteredActivity } from "./engine";
import GuidedActivity from "./GuidedActivity";

/** The exact identity the generic guided walkthrough presenter owns. */
export const GUIDED_REVEAL_IDENTITY = { kind: "guided", key: "reveal", version: 1 } as const;

const BUILTIN_ACTIVITIES: readonly RegisteredActivity[] = [
  {
    kind: GUIDED_REVEAL_IDENTITY.kind,
    key: GUIDED_REVEAL_IDENTITY.key,
    versions: [GUIDED_REVEAL_IDENTITY.version],
    component: GuidedActivity,
    // Renderer-authoritative controls: توسيع + إعادة تعيين (restart the reveal). No replay/pause/speed.
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
];

/** The built-in presenter registry (trusted repo code). Consulted by the host before the injected registry. */
export const builtinActivityRegistry: LearningActivityRegistry = createActivityRegistry(BUILTIN_ACTIVITIES);
