// Phase 3A — activity block schema helpers (isActivityBlock / activityKey / activityDescriptor). Pure.
import { describe, it, expect } from "vitest";
import {
  isActivityBlock, activityKey, activityDescriptor, ACTIVITY_BLOCK_TYPES, BLOCK_TYPES,
} from "./types";
import { pageActivities, pageSimulation } from "./content.fixtures";

describe("Phase 3A — activity block helpers", () => {
  it("BLOCK_TYPES is a superset that includes the four activity families", () => {
    expect(ACTIVITY_BLOCK_TYPES).toEqual(["simulation", "animation", "guided", "interactive-diagram"]);
    for (const t of ACTIVITY_BLOCK_TYPES) expect(BLOCK_TYPES).toContain(t);
  });

  it("isActivityBlock narrows the four families and rejects other block types", () => {
    expect(isActivityBlock(pageSimulation.blocks[0])).toBe(true);
    for (const b of pageActivities.blocks) expect(isActivityBlock(b)).toBe(true);
    expect(isActivityBlock({ type: "text" })).toBe(false);
    expect(isActivityBlock({ type: "callout" })).toBe(false);
    expect(isActivityBlock({})).toBe(false);
  });

  it("activityKey reads each family's own key field uniformly", () => {
    const [anim, guided, diagram] = pageActivities.blocks;
    const sim = pageSimulation.blocks[0];
    if (!isActivityBlock(sim) || !isActivityBlock(anim) || !isActivityBlock(guided) || !isActivityBlock(diagram)) throw new Error("fixture not an activity");
    expect(activityKey(sim)).toBe("vlan");
    expect(activityKey(anim)).toBe("packet-flow");
    expect(activityKey(guided)).toBe("reveal");
    expect(activityKey(diagram)).toBe("switch-ports");
  });

  it("activityDescriptor projects {kind, key, version, capabilities} without inventing fields", () => {
    const guided = pageActivities.blocks[1];
    if (!isActivityBlock(guided)) throw new Error("fixture");
    const d = activityDescriptor(guided);
    expect(d.kind).toBe("guided");
    expect(d.key).toBe("reveal");
    expect(d.version).toBe(1);
    expect(d.capabilities?.fullscreen).toBe(true);
  });

  it("a guided block carries a STRUCTURED walkthrough (prompt / ordered steps with stable ids / result / explanation)", () => {
    const guided = pageActivities.blocks[1];
    if (guided.type !== "guided") throw new Error("fixture");
    expect(guided.steps.map(s => s.id)).toEqual(["fg-b2-s1", "fg-b2-s2"]);
    expect(guided.steps[0].text[0].text).toContain("حدّد");
    expect(guided.prompt?.[0].text).toContain("المطلوب");
    expect(guided.result?.[0].text).toBe("255.255.255.128");
    expect(guided.explanation).toBeTruthy();
  });
});
