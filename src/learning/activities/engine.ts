// Learning Materials — Phase 3A: Interactive Learning ENGINE FOUNDATION (runtime contract).
//
// This module defines the trusted activity registry + the no-op event sink + the props every activity renderer
// receives. It contains NO real simulations/animations and NO React components — those live behind code-split
// import thunks registered here in later phases. Security invariants encoded here:
//   - Content supplies only a registry KEY (a plain string) + opaque `config` DATA — never a component name,
//     function, module path, or executable code. There is no eval, no new Function, and no dynamic import of a
//     string taken from content. A renderer is reached ONLY through a statically-authored `load` thunk.
//   - The registry is TRUSTED code in this repo. Production ships the registry-backed one EMPTY (Phase 3A builds
//     no real simulation/animation), so those descriptors render their faithful static fallback and no activity
//     chunk is ever loaded in production. Generic built-in presenters (builtins.ts) resolve with the same
//     {kind, key, version} discipline — never by block type alone.
//   - The engine performs ZERO persistence and ZERO network: the only sink shipped is a no-op (no progress, no
//     grades, no rank, no /api). Progress is a separate later domain.
//
// Registry indexing uses NESTED MAPS (kind -> key -> entries): there is NO delimiter/separator character at all,
// so a free-form registry key can never collide with an index separator (and the source carries no control bytes).

import type { ComponentType } from "react";
import {
  activityKey, type ActivityBlock, type ActivityBlockType, type ActivityCapabilities,
} from "../content/types";

// ── Event sink (no-op only) ───────────────────────────────────────────────────────────────────────────────────
/**
 * Events an activity/shell may emit. In Phase 3A they go NOWHERE by default (see `noopActivityEventSink`): they
 * are the injection seam a later Progress phase can attach to WITHOUT changing the engine. No event is persisted,
 * sent to a backend, or turned into a grade/rank/medal here.
 */
export type LearningActivityEvent =
  | { type: "ready"; activityId: string; kind: ActivityBlockType; key: string }
  | { type: "interaction"; activityId: string; name: string; detail?: Record<string, unknown> }
  | { type: "fullscreen"; activityId: string; open: boolean }
  | { type: "reset"; activityId: string }
  | { type: "replayed"; activityId: string }
  | { type: "error"; activityId: string; message: string };

export type LearningActivityEventSink = (event: LearningActivityEvent) => void;

/** The ONLY sink shipped in Phase 3A: it discards every event (no persistence, no network, no progress). */
export const noopActivityEventSink: LearningActivityEventSink = () => {};

// ── Renderer contract ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * Monotonic command signals the shell passes down. Each counter increments when the shell issues the matching
 * command (0 = never issued); the renderer reacts to a CHANGE. The shell only ever issues a command the renderer's
 * capabilities declare, so a renderer never receives a command it cannot honor.
 */
export interface ActivityCommandSignals {
  reset: number;
  replay: number;
}

/** Props every registered/built-in activity component receives. `config` on the block is opaque DATA, never executed. */
export interface LearningActivityProps {
  block: ActivityBlock;
  /** Session viewing context (a course id only — no student identity, no PII). */
  courseId: string;
  /** Reduced-motion contract: true means render a still, non-animated presentation. */
  reducedMotion: boolean;
  /** True while shown inside the fullscreen shell (same instance — never a second copy). */
  fullscreen: boolean;
  /** Reset/replay command signals (see `ActivityCommandSignals`). */
  commands: ActivityCommandSignals;
  /** Emit a no-op-safe event (the default sink discards it). */
  emit: LearningActivityEventSink;
}

export type ActivityComponent = ComponentType<LearningActivityProps>;
/** A statically-analyzable code-split loader for a trusted repo component. NEVER a path taken from content. */
export type ActivityComponentLoader = () => Promise<{ default: ActivityComponent }>;

/**
 * How a registered renderer's component is obtained: a LAZY `load` thunk (its own code-split chunk — the normal
 * case for real simulations/animations) or an EAGER `component` (a generic built-in presenter that ships inside the
 * engine chunk, e.g. the guided "reveal" walkthrough). Exactly one of the two.
 */
export type ActivityComponentSource =
  | { load: ActivityComponentLoader; component?: undefined }
  | { component: ActivityComponent; load?: undefined };

/** One trusted, registered renderer. Authored in this repo and registered by data — never named by content. */
export type RegisteredActivity = ActivityComponentSource & {
  /** The activity family this renderer serves (e.g. "simulation"). */
  kind: ActivityBlockType;
  /** The registry key it answers to (e.g. "vlan"), matched against `activityKey(block)`. */
  key: string;
  /** Content `version`s this renderer understands; a block with an unsupported version falls back gracefully. */
  versions: readonly number[];
  /** Capabilities the renderer declares — the AUTHORITY for which shell controls appear (content cannot add any). */
  capabilities?: ActivityCapabilities;
};

// ── Registry ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface LearningActivityRegistry {
  /** Resolve a block to its registered renderer, or undefined when none supports its {kind, key, version}. */
  resolve(block: ActivityBlock): RegisteredActivity | undefined;
  /** Whether ANY renderer is registered for {kind, key} (ignoring version). Pure; triggers no import. */
  has(kind: ActivityBlockType, key: string): boolean;
  /** All registered {kind, key, versions} for diagnostics/tests. Pure; triggers no component import. */
  list(): { kind: ActivityBlockType; key: string; versions: readonly number[] }[];
  /** Number of registered entries (production is 0). */
  readonly size: number;
}

/** Thrown at registry CONSTRUCTION when two trusted entries claim the same {kind, key, version} (fail fast). */
export class ActivityRegistryError extends Error {
  readonly kind: ActivityBlockType;
  readonly key: string;
  readonly version: number;
  constructor(kind: ActivityBlockType, key: string, version: number) {
    super(`activity registry: {${kind}, ${JSON.stringify(key)}, v${version}} is owned by more than one renderer`);
    this.name = "ActivityRegistryError";
    this.kind = kind;
    this.key = key;
    this.version = version;
  }
}

/**
 * Build an immutable activity registry from a fixed list of trusted entries. Indexed by NESTED MAPS
 * (kind -> key -> entries) — no delimiter, so a free-form key can never collide with a separator. Resolution is by
 * exact {kind, key} then a `version` match. Ownership of every {kind, key, version} must be UNIQUE: overlapping
 * version sets for the same kind+key (which would let one registration silently shadow another) throw an
 * `ActivityRegistryError` during construction; disjoint version sets (v1/v2 renderer + v3 renderer) are fine.
 * Pure data structure — constructing it imports NO lazily-loaded activity component.
 */
export function createActivityRegistry(entries: readonly RegisteredActivity[]): LearningActivityRegistry {
  const byKind = new Map<ActivityBlockType, Map<string, RegisteredActivity[]>>();
  for (const e of entries) {
    let byKey = byKind.get(e.kind);
    if (!byKey) { byKey = new Map(); byKind.set(e.kind, byKey); }
    const arr = byKey.get(e.key);
    if (arr) {
      for (const v of e.versions) if (arr.some(other => other.versions.includes(v))) throw new ActivityRegistryError(e.kind, e.key, v);
      arr.push(e);
    } else {
      byKey.set(e.key, [e]);
    }
  }
  return {
    resolve(block) {
      const arr = byKind.get(block.type)?.get(activityKey(block));
      return arr?.find(e => e.versions.includes(block.version));
    },
    has(kind, key) { return Boolean(byKind.get(kind)?.has(key)); },
    list() { return entries.map(e => ({ kind: e.kind, key: e.key, versions: e.versions })); },
    get size() { return entries.length; },
  };
}

/**
 * The PRODUCTION activity registry for REGISTRY-BACKED renderers (real simulations / animations / interactive
 * diagrams) — deliberately EMPTY in Phase 3A: none is shipped yet, so every registry-backed descriptor renders its
 * faithful static fallback and no activity chunk is ever imported in production. The generic BUILT-IN presenters
 * (see builtins.ts — currently only guided/reveal/v1) are resolved separately with the same identity discipline;
 * an empty production registry therefore does NOT mean every activity family falls back. Real renderers are
 * registered here (each behind a code-split `load` thunk) in later phases; the Reader never changes.
 */
export const productionActivityRegistry: LearningActivityRegistry = createActivityRegistry([
  // Phase 3B — the FIRST real registry-backed production activity (the PAN/LAN/WAN scope diagram for PDF 11).
  // Loaded lazily as its own chunk only when a matching descriptor renders. This is an interactive DIAGRAM, not a
  // simulation/animation — there are still ZERO real simulation/animation renderers registered.
  {
    kind: "interactive-diagram",
    key: "network-scope",
    versions: [1],
    load: () => import("./NetworkScopeDiagram"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
]);
