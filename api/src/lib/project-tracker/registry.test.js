import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  getSupportedProjects, isSupportedProject, getProjectDefinition, getProjectMeta, getStorageNamespace
} from "./registry.js";

// Phase P7 — the defaults are the owner-approved condensed sets; the previous sets (the conversion source) are kept
// verbatim as fixtures and their content checks below now read them (updated deliberately).
const PRE_P7 = code => createRequire(import.meta.url)("../../../tests/fixtures/project-templates-pre-p7/" + code + ".json");

describe("project registry", () => {
  it("supports exactly the three project codes", () => {
    expect(getSupportedProjects().sort()).toEqual(["794589", "883589", "899373"]);
    expect(isSupportedProject("794589")).toBe(true);
    expect(isSupportedProject("000000")).toBe(false);
  });

  it("794589 keeps its two tracks; its condensed template has 20 stages (10 + 10) replacing the 105", () => {
    const d = getProjectDefinition("794589");
    expect(d.tracks.map(t => t.trackId)).toEqual(["book", "packetTracer"]);
    expect(d.stages).toHaveLength(20);
    expect(d.stages.filter(s => s.track === "book")).toHaveLength(10);
    expect(PRE_P7("794589").stages).toHaveLength(105);
  });

  it("getProjectMeta returns lightweight track info without the heavy template", () => {
    const m = getProjectMeta("883589");
    expect(m.tracks.map(t => t.trackId)).toEqual(["book", "visualStudio"]);
    expect(m.stages).toBeUndefined();
  });
});

describe("899373 template", () => {
  it("the condensed set: book=7, access=4, total=11", () => {
    const c = getProjectDefinition("899373");
    expect(c.stages.filter(s => s.track === "book")).toHaveLength(7);
    expect(c.stages.filter(s => s.track === "access")).toHaveLength(4);
  });
  const d = PRE_P7("899373");
  const book = d.stages.filter(s => s.track === "book");
  const access = d.stages.filter(s => s.track === "access");
  it("the previous set (conversion source): book=20, access=8, total=28", () => {
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
  it("the condensed set: book=12, visualStudio=6, total=18", () => {
    const c = getProjectDefinition("883589");
    expect(c.stages.filter(s => s.track === "book")).toHaveLength(12);
    expect(c.stages.filter(s => s.track === "visualStudio")).toHaveLength(6);
  });
  const d = PRE_P7("883589");
  const book = d.stages.filter(s => s.track === "book");
  const vs = d.stages.filter(s => s.track === "visualStudio");
  it("the previous set (conversion source): book=35, visualStudio=17, total=52", () => {
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
  it("keeps 'Web Services' as an organizing group, not a stage (the condensed set names it in its stage)", () => {
    expect(d.groups.some(g => g.title === "Web Services")).toBe(true);
    expect(d.stages.some(s => s.title === "Web Services")).toBe(false);
    expect(getProjectDefinition("883589").stages.find(s => s.mergedFrom.includes("B21")).title).toMatch(/^Web Services/);
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
