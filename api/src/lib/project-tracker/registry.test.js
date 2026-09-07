import { describe, it, expect } from "vitest";
import {
  getSupportedProjects, isSupportedProject, getProjectDefinition, getProjectMeta, getStorageNamespace
} from "./registry.js";

describe("project registry", () => {
  it("supports exactly the three project codes", () => {
    expect(getSupportedProjects().sort()).toEqual(["794589", "883589", "899373"]);
    expect(isSupportedProject("794589")).toBe(true);
    expect(isSupportedProject("000000")).toBe(false);
  });

  it("794589 keeps its two tracks and full 105-stage template", () => {
    const d = getProjectDefinition("794589");
    expect(d.tracks.map(t => t.trackId)).toEqual(["book", "packetTracer"]);
    expect(d.stages).toHaveLength(105);
  });

  it("getProjectMeta returns lightweight track info without the heavy template", () => {
    const m = getProjectMeta("883589");
    expect(m.tracks.map(t => t.trackId)).toEqual(["book", "visualStudio"]);
    expect(m.stages).toBeUndefined();
  });
});

describe("899373 template", () => {
  const d = getProjectDefinition("899373");
  const book = d.stages.filter(s => s.track === "book");
  const access = d.stages.filter(s => s.track === "access");
  it("has book=20, access=8, total=28", () => {
    expect(book).toHaveLength(20);
    expect(access).toHaveLength(8);
    expect(d.stages).toHaveLength(28);
  });
  it("has the correct anchors and no duplicate ids", () => {
    const byId = Object.fromEntries(d.stages.map(s => [s.stageId, s.title]));
    expect(byId.B01).toBe("صفحة الغلاف");
    expect(byId.B20).toBe("مصادر");
    expect(byId.A01).toBe("الجدول الأول");
    expect(byId.A08).toBe("تقارير");
    const ids = d.stages.map(s => s.stageId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every stage defaults to weight 1, required, active, empty description", () => {
    for (const s of d.stages) {
      expect(s.weight).toBe(1); expect(s.required).toBe(true); expect(s.active).toBe(true); expect(s.description).toBe("");
    }
  });
  it("track weights are 50/50 by trackId", () => {
    expect(d.trackWeights).toEqual({ book: 50, access: 50 });
  });
});

describe("883589 template", () => {
  const d = getProjectDefinition("883589");
  const book = d.stages.filter(s => s.track === "book");
  const vs = d.stages.filter(s => s.track === "visualStudio");
  it("has book=35, visualStudio=17, total=52", () => {
    expect(book).toHaveLength(35);
    expect(vs).toHaveLength(17);
    expect(d.stages).toHaveLength(52);
  });
  it("has the correct anchors and no duplicate ids", () => {
    const byId = Object.fromEntries(d.stages.map(s => [s.stageId, s.title]));
    expect(byId.B01).toBe("صفحة الغلاف");
    expect(byId.B35).toBe("مصادر");
    expect(byId.V01).toBe("تعريف المشروع بشكل صحيح");
    expect(byId.V17).toBe("تقارير");
    const ids = d.stages.map(s => s.stageId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("keeps 'Web Services' as an organizing group, not a stage", () => {
    expect(d.groups.some(g => g.title === "Web Services")).toBe(true);
    expect(d.stages.some(s => s.title === "Web Services")).toBe(false);
  });
  it("every stage defaults to weight 1, required, active, empty description", () => {
    for (const s of d.stages) {
      expect(s.weight).toBe(1); expect(s.required).toBe(true); expect(s.active).toBe(true); expect(s.description).toBe("");
    }
  });
});

describe("storage namespace isolation", () => {
  it("794589 uses the exact legacy (un-namespaced) paths", () => {
    const ns = getStorageNamespace("794589");
    expect(ns.configName("c1")).toBe("platform/project-trackers/classes/c1.json");
    expect(ns.progressPrefix("c1")).toBe("platform/project-progress/c1/");
    expect(ns.progressName("c1", "s1")).toBe("platform/project-progress/c1/s1.json");
  });
  it("new projects get isolated, project-scoped paths", () => {
    const a = getStorageNamespace("899373");
    const b = getStorageNamespace("883589");
    expect(a.configName("c1")).toBe("platform/project-trackers/899373/classes/c1.json");
    expect(b.configName("c1")).toBe("platform/project-trackers/883589/classes/c1.json");
    // No two projects (incl. legacy 794589) ever resolve the same blob for the same classId/student.
    const paths = [
      getStorageNamespace("794589").progressName("c1", "s1"),
      a.progressName("c1", "s1"),
      b.progressName("c1", "s1")
    ];
    expect(new Set(paths).size).toBe(3);
  });
});
