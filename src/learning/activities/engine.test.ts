// Phase 3A — activity ENGINE: registry resolution + the no-op event sink. Pure logic, no DOM.
import { describe, it, expect } from "vitest";
import {
  createActivityRegistry, productionActivityRegistry, noopActivityEventSink, ActivityRegistryError,
  type LearningActivityEvent, type ActivityComponent,
} from "./engine";
import type { SimulationBlock } from "../content/types";
import { simBlock, animBlock, unsupportedVersionBlock, unregisteredBlock } from "./activityFixtures";

const nullComponent: ActivityComponent = () => null;
const noop = async () => ({ default: nullComponent });

describe("production activity registry is an EXACT allowlist (3B, 3E and the Units 4–6 renderers)", () => {
  it("registers ONLY network-scope/v1, ipv4-octets/v1, cidr-network-host/v1 and gateway-flow/v1", () => {
    expect(productionActivityRegistry.list()).toEqual([
      { kind: "interactive-diagram", key: "network-scope", versions: [1] },
      { kind: "interactive-diagram", key: "ipv4-octets", versions: [1] },
      { kind: "interactive-diagram", key: "cidr-network-host", versions: [1] },
      { kind: "animation", key: "gateway-flow", versions: [1] },
    ]);
    expect(productionActivityRegistry.size).toBe(4);
    expect(productionActivityRegistry.has("interactive-diagram", "network-scope")).toBe(true);
    expect(productionActivityRegistry.has("interactive-diagram", "ipv4-octets")).toBe(true);
  });
  it("registers ZERO simulation renderers and exactly ONE animation (gateway-flow); no CLI/VLAN/subnet renderer", () => {
    expect(productionActivityRegistry.list().filter(e => e.kind === "simulation")).toEqual([]);
    expect(productionActivityRegistry.list().filter(e => e.kind === "animation").map(e => e.key)).toEqual(["gateway-flow"]);
    expect(productionActivityRegistry.resolve(simBlock)).toBeUndefined();   // no simulation renderer
    expect(productionActivityRegistry.has("simulation", "vlan")).toBe(false);
  });
});

describe("Phase 3A — createActivityRegistry resolution", () => {
  const reg = createActivityRegistry([
    { kind: "simulation", key: "vlan", versions: [1, 2], load: noop, capabilities: { fullscreen: true } },
    { kind: "animation", key: "packet-flow", versions: [1], load: noop },
  ]);

  it("resolves an exact {kind, key, version} match", () => {
    expect(reg.resolve(simBlock)?.kind).toBe("simulation");
    expect(reg.resolve(animBlock)?.key).toBe("packet-flow");
  });
  it("returns undefined when the key is registered but the version is unsupported", () => {
    expect(reg.resolve(unsupportedVersionBlock)).toBeUndefined(); // vlan v99 not in [1,2]
  });
  it("returns undefined for an unregistered key", () => {
    expect(reg.resolve(unregisteredBlock)).toBeUndefined();
  });
  it("never resolves across families (same key, different kind)", () => {
    // a SIMULATION block whose key is 'packet-flow' (only an ANIMATION renderer owns that key) → no match
    const crossed: SimulationBlock = { id: "x", type: "simulation", origin: "teacher-enrichment", simulationType: "packet-flow", version: 1, title: "t" };
    expect(reg.resolve(crossed)).toBeUndefined();
  });
  it("free-form keys that contain spaces, quotes or JSON punctuation resolve exactly (no delimiter collision)", () => {
    const weird = createActivityRegistry([
      { kind: "simulation", key: 'a b"c]', versions: [1], load: noop },
      { kind: "simulation", key: "a", versions: [1], load: noop },
    ]);
    const block: SimulationBlock = { id: "w", type: "simulation", origin: "teacher-enrichment", simulationType: 'a b"c]', version: 1, title: "t" };
    expect(weird.resolve(block)?.key).toBe('a b"c]');
    expect(weird.resolve({ ...block, simulationType: "a" })?.key).toBe("a");
    expect(weird.resolve({ ...block, simulationType: "a b" })).toBeUndefined();
  });
  it("exposes diagnostics (has / list / size) without importing any component", () => {
    expect(reg.size).toBe(2);
    expect(reg.has("simulation", "vlan")).toBe(true);
    expect(reg.has("simulation", "nope")).toBe(false);
    expect(reg.list()).toEqual([
      { kind: "simulation", key: "vlan", versions: [1, 2] },
      { kind: "animation", key: "packet-flow", versions: [1] },
    ]);
  });
});

describe("Phase 3A — registry ownership of {kind, key, version} is unique (fail fast at construction)", () => {
  const vlan = (versions: number[]) => ({ kind: "simulation" as const, key: "vlan", versions, load: noop });

  it("rejects duplicate exact ownership", () => {
    expect(() => createActivityRegistry([vlan([1]), vlan([1])])).toThrow(ActivityRegistryError);
  });
  it("rejects overlapping version sets ([1,2] + [2,3] → v2 ambiguous) and names the collision", () => {
    let caught: unknown;
    try { createActivityRegistry([vlan([1, 2]), vlan([2, 3])]); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ActivityRegistryError);
    const err = caught as ActivityRegistryError;
    expect(err.kind).toBe("simulation");
    expect(err.key).toBe("vlan");
    expect(err.version).toBe(2);
    expect(err.message).toContain('"vlan"');
  });
  it("accepts DISJOINT version sets for the same kind+key and resolves each version to its owner", () => {
    const v12: ActivityComponent = () => null;
    const v3: ActivityComponent = () => null;
    const reg = createActivityRegistry([
      { kind: "simulation", key: "vlan", versions: [1, 2], component: v12 },
      { kind: "simulation", key: "vlan", versions: [3], component: v3 },
    ]);
    const block = (version: number): SimulationBlock => ({ id: "b", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", version, title: "t" });
    expect(reg.resolve(block(1))?.component).toBe(v12);
    expect(reg.resolve(block(2))?.component).toBe(v12);
    expect(reg.resolve(block(3))?.component).toBe(v3);
    expect(reg.resolve(block(4))).toBeUndefined();
    expect(reg.size).toBe(2);
  });
  it("different keys and different families are unaffected by each other's versions", () => {
    expect(() => createActivityRegistry([
      vlan([1]),
      { kind: "simulation", key: "subnet", versions: [1], load: noop },     // same family, other key
      { kind: "animation", key: "vlan", versions: [1], load: noop },        // same key, other family
    ])).not.toThrow();
  });
});

describe("Phase 3A — no-op event sink", () => {
  it("accepts every event shape and discards it (no throw, no return, no persistence)", () => {
    const events: LearningActivityEvent[] = [
      { type: "ready", activityId: "a", kind: "simulation", key: "vlan" },
      { type: "interaction", activityId: "a", name: "tick", detail: { n: 1 } },
      { type: "fullscreen", activityId: "a", open: true },
      { type: "reset", activityId: "a" },
      { type: "replayed", activityId: "a" },
      { type: "error", activityId: "a", message: "boom" },
    ];
    for (const e of events) expect(noopActivityEventSink(e)).toBeUndefined();
  });
});
