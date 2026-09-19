// Learning Materials — Phase 3A: Interactive Learning ENGINE FOUNDATION (runtime contract).
//
// This module defines the trusted activity registry + the no-op event sink + the props every activity renderer
// receives. It contains NO React components — every renderer lives behind a code-split import thunk registered
// here. Security invariants encoded here:
//   - Content supplies only a registry KEY (a plain string) + opaque `config` DATA — never a component name,
//     function, module path, or executable code. There is no eval, no new Function, and no dynamic import of a
//     string taken from content. A renderer is reached ONLY through a statically-authored `load` thunk.
//   - The registry is TRUSTED code in this repo. The production registry is an EXACT allowlist — every entry is
//     enumerated in `productionActivityRegistry` below and pinned by engine.test.ts / activities.guards.test.ts
//     (the enumerated, test-pinned production activity allowlist — the tests, not this comment, carry the count); any descriptor without a trusted renderer for its exact identity
//     renders its faithful static fallback, and an activity chunk is loaded only when a matching descriptor renders. Generic built-in presenters (builtins.ts)
//     resolve with the same {kind, key, version} discipline — never by block type alone.
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
  /** Number of registered entries (the production allowlist is pinned by tests; 0 for an empty test registry). */
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
 * diagrams). It is an EXACT allowlist of the entries below (pinned by engine.test.ts / activities.guards.test.ts):
 * interactive-diagram network-scope/v1 (Phase 3B), ipv4-octets/v1 (Phase 3E), cidr-network-host/v1 and
 * network-topologies/v1 (Units 4–6), cable-comparison/v1, mac-address-anatomy/v1 and broadcast-address/v1 (Units 7–8),
 * osi-layers/v1 (Batch 3), network-domains/v1 (Batch 4); animation gateway-flow/v1 (Units 4–6); simulation hub-switch-router-flow/v1 (Units 4–6)
 * and message-delivery/v1 (Units 7–8) — each behind a
 * code-split `load` thunk, so a chunk is imported only when a matching descriptor renders. Any other descriptor
 * renders its faithful static fallback. The generic BUILT-IN presenters (see builtins.ts — currently only
 * guided/reveal/v1) are resolved separately with the same identity discipline. New renderers are registered here;
 * the Reader never changes.
 */
export const productionActivityRegistry: LearningActivityRegistry = createActivityRegistry([
  // Phase 3B — the FIRST real registry-backed production activity (the PAN/LAN/WAN scope diagram for PDF 11).
  // Loaded lazily as its own chunk only when a matching descriptor renders. An interactive DIAGRAM (the first
  // simulation / animation renderers arrived later, in the Units 4–6 phase).
  {
    kind: "interactive-diagram",
    key: "network-scope",
    versions: [1],
    load: () => import("./NetworkScopeDiagram"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  // Phase 3E — the SECOND registry-backed production activity: the four-octet IPv4 structure diagram for PDF 27.
  // Also an interactive DIAGRAM (select one of four parts; no validity rules, no CIDR/subnet/class, no input, no
  // scoring). Its own lazy chunk. No CLI renderer exists in any phase.
  {
    kind: "interactive-diagram",
    key: "ipv4-octets",
    versions: [1],
    load: () => import("./IPv4OctetsDiagram"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  // Units 4–6 phase — Unit 4 (PDF 40): the CIDR network-part / host-part visualizer (/8, /16, /24 at the book's
  // whole-octet level, with a small "another device in the same network" task). Its own lazy chunk.
  {
    kind: "interactive-diagram",
    key: "cidr-network-host",
    versions: [1],
    load: () => import("./CidrNetworkHostDiagram"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  // Units 4–6 phase — Unit 4 (PDF 45): the FIRST animation renderer — local traffic via the switch versus traffic
  // that leaves through the default gateway. Stepped, text-mirrored, reduced-motion aware. Its own lazy chunk.
  {
    kind: "animation",
    key: "gateway-flow",
    versions: [1],
    load: () => import("./GatewayFlowAnimation"),
    capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
  },
  // Units 4–6 phase — Unit 5 (PDF 49): the FIRST simulation renderer — Hub broadcasts to every attached device,
  // Switch delivers to the intended device only, Router carries traffic between two networks (and out). Stepped,
  // text-mirrored, reduced-motion aware, conceptual only. Its own lazy chunk.
  {
    kind: "simulation",
    key: "hub-switch-router-flow",
    versions: [1],
    load: () => import("./HubSwitchRouterFlow"),
    capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
  },
  // Units 4–6 phase — Unit 6 (PDF 58–60): the topology explorer — P2P / Bus / Ring / Star / Tree / Hybrid redrawn
  // on selection, «أرسل» path highlight with a text mirror, the book's conceptual Bus collision. Its own lazy chunk.
  {
    kind: "interactive-diagram",
    key: "network-topologies",
    versions: [1],
    load: () => import("./NetworkTopologiesExplorer"),
    capabilities: { fullscreen: true, reset: true, animated: true, interactive: true },
  },
  // Units 7–8 phase — Unit 7 (PDF 62–63): the cable comparison / chooser — UTP, STP, Fiber Optic, Coaxial with the
  // book's traits, then teacher-enrichment scenarios with immediate feedback. No timers. Its own lazy chunk.
  {
    kind: "interactive-diagram",
    key: "cable-comparison",
    versions: [1],
    load: () => import("./CableComparisonDiagram"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  // Units 7–8 phase — Unit 7 (PDF 64): the MAC address anatomy — six two-digit groups (12 hex digits), the
  // broadcast MAC toggle, the "which string has the MAC shape?" task. No timers. Its own lazy chunk.
  {
    kind: "interactive-diagram",
    key: "mac-address-anatomy",
    versions: [1],
    load: () => import("./MacAddressAnatomy"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  // Units 7–8 phase — Unit 8 (PDF 67–69): the SECOND simulation renderer — Unicast (one receiver), Multicast (the
  // selected group), Broadcast (every local device; the Router boundary «يتوقّف هنا»). Stepped, prose-mirrored,
  // reduced-motion aware, conceptual only. Its own lazy chunk.
  {
    kind: "simulation",
    key: "message-delivery",
    versions: [1],
    load: () => import("./MessageDeliverySimulation"),
    capabilities: { fullscreen: true, reset: true, replay: true, animated: true, interactive: true },
  },
  // Units 7–8 phase — Unit 8 (PDF 70): the broadcast-address builder at the book's whole-octet level (/8, /16, /24
  // only): inspect the book's rows, then build the address by making host octets 255. No timers. Its own lazy chunk.
  {
    kind: "interactive-diagram",
    key: "broadcast-address",
    versions: [1],
    load: () => import("./BroadcastAddressBuilder"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  // Batch 3 — «نماذج الاتصال» (PDF 80): the OSI seven-layer explorer — tap a layer for its book function, send
  // (7 → 1) / receive (1 → 7) order toggle. No timers, no protocol functions. Its own lazy chunk.
  {
    kind: "interactive-diagram",
    key: "osi-layers",
    versions: [1],
    load: () => import("./OsiLayersExplorer"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
  {
    // Batch 4 — the collision / broadcast domains explorer for PDF 101 («المجالات والمفاهيم»).
    kind: "interactive-diagram",
    key: "network-domains",
    versions: [1],
    load: () => import("./NetworkDomainsExplorer"),
    capabilities: { fullscreen: true, reset: true, interactive: true },
  },
]);
