import { describe, it, expect } from "vitest";
import { loadDefaultTemplate, buildClassSnapshotFromDefault, PROGRAM_CODE } from "./project-794589-template.js";

describe("default template", () => {
  it("has 50 book stages and 62 packet-tracer stages", () => {
    const t = loadDefaultTemplate();
    expect(t.stages.filter(s => s.track === "book")).toHaveLength(50);
    expect(t.stages.filter(s => s.track === "packetTracer")).toHaveLength(62);
  });
  it("every stage has required schema fields", () => {
    for (const s of loadDefaultTemplate().stages) {
      expect(typeof s.stageId).toBe("string");
      expect(["book", "packetTracer"]).toContain(s.track);
      expect(typeof s.order).toBe("number");
      expect(s.active).toBe(true);
      expect(typeof s.required).toBe("boolean");
    }
  });
  it("default track weights are 50/50", () => {
    expect(loadDefaultTemplate().trackWeights).toEqual({ book: 50, packetTracer: 50 });
  });
});

describe("class snapshot", () => {
  it("is a deep copy - editing the snapshot never mutates the default template", () => {
    const snap = buildClassSnapshotFromDefault("c1", "2026-09-01T00:00:00.000Z");
    snap.stages[0].title = "CHANGED";
    snap.trackWeights.book = 99;
    const fresh = loadDefaultTemplate();
    expect(fresh.stages[0].title).not.toBe("CHANGED");
    expect(fresh.trackWeights.book).toBe(50);
  });
  it("carries programCode and classId", () => {
    const snap = buildClassSnapshotFromDefault("c9", "2026-09-01T00:00:00.000Z");
    expect(snap.programCode).toBe(PROGRAM_CODE);
    expect(snap.classId).toBe("c9");
    expect(snap.stages).toHaveLength(112);
  });
});
