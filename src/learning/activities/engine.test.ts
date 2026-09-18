// Phase 3A — activity ENGINE: registry resolution + the no-op event sink. Pure logic, no DOM.
import { describe, it, expect } from "vitest";
import {
  createActivityRegistry, productionActivityRegistry, noopActivityEventSink,
  type LearningActivityEvent, type ActivityComponent,
} from "./engine";
import type { SimulationBlock } from "../content/types";
import { simBlock, animBlock, unsupportedVersionBlock, unregisteredBlock } from "./activityFixtures";

const nullComponent: ActivityComponent = () => null;
const noop = async () => ({ default: nullComponent });

describe("Phase 3A — production activity registry is EMPTY", () => {
  it("ships zero registered activities, so every descriptor resolves to nothing (static fallback path)", () => {
    expect(productionActivityRegistry.size).toBe(0);
    expect(productionActivityRegistry.list()).toEqual([]);
    expect(productionActivityRegistry.resolve(simBlock)).toBeUndefined();
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

describe("Phase 3A — no-op event sink", () => {
  it("accepts every event shape and discards it (no throw, no return, no persistence)", () => {
    const events: LearningActivityEvent[] = [
      { type: "ready", activityId: "a", kind: "simulation", key: "vlan" },
      { type: "interaction", activityId: "a", name: "tick", detail: { n: 1 } },
      { type: "fullscreen", activityId: "a", open: true },
      { type: "error", activityId: "a", message: "boom" },
    ];
    for (const e of events) expect(noopActivityEventSink(e)).toBeUndefined();
  });
});
