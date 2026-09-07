import { describe, it, expect } from "vitest";
import { loadDefaultTemplate, buildClassSnapshotFromDefault, PROGRAM_CODE, TEMPLATE_VERSION } from "./project-794589-template.js";

const t = loadDefaultTemplate();
const book = t.stages.filter(s => s.track === "book");
const pt = t.stages.filter(s => s.track === "packetTracer");

// Contiguous, gap-free ids like B01..B54 / P01..P51.
function ids(list) { return list.map(s => s.stageId).sort(); }
function expectContiguous(list, prefix, count) {
  const set = new Set(ids(list));
  expect(set.size).toBe(count);
  for (let i = 1; i <= count; i++) expect(set.has(prefix + String(i).padStart(2, "0"))).toBe(true);
}

describe("default template V2", () => {
  it("is templateVersion 2", () => {
    expect(t.templateVersion).toBe(2);
    expect(TEMPLATE_VERSION).toBe(2);
  });
  it("has 54 book stages, 51 packet-tracer stages, 105 total", () => {
    expect(book).toHaveLength(54);
    expect(pt).toHaveLength(51);
    expect(t.stages).toHaveLength(105);
  });
  it("book ids are B01..B54 with no gaps and nothing above B54", () => {
    expectContiguous(book, "B", 54);
    expect(book.some(s => Number(s.stageId.slice(1)) > 54)).toBe(false);
  });
  it("packet-tracer ids are P01..P51 with no gaps and nothing above P51", () => {
    expectContiguous(pt, "P", 51);
    expect(pt.some(s => Number(s.stageId.slice(1)) > 51)).toBe(false);
  });
  it("has no leftover old-template ids (B55+, P52+)", () => {
    expect(t.stages.some(s => /^B/.test(s.stageId) && Number(s.stageId.slice(1)) > 54)).toBe(false);
    expect(t.stages.some(s => /^P/.test(s.stageId) && Number(s.stageId.slice(1)) > 51)).toBe(false);
  });
  it("anchor titles are exactly as approved", () => {
    const byId = Object.fromEntries(t.stages.map(s => [s.stageId, s.title]));
    expect(byId.B01).toBe("صفحة الغلاف");
    expect(byId.B54).toBe("مصادر");
    expect(byId.P01).toBe("تقسيم الأقسام");
    expect(byId.P51).toBe("تعريف سيرفيرات جوجل خارجية");
  });
  it("preserves the source text verbatim, including the intentional 'الفرع الأول' under later branches", () => {
    const byId = Object.fromEntries(t.stages.map(s => [s.stageId, s.title]));
    expect(byId.B39).toBe("صور للفرع الأول كامل");
    expect(byId.B49).toBe("صور للفرع الأول كامل");
  });
  it("every stage is required, active, weight 1, with the full schema", () => {
    for (const s of t.stages) {
      expect(typeof s.stageId).toBe("string");
      expect(["book", "packetTracer"]).toContain(s.track);
      expect(typeof s.groupId).toBe("string");
      expect(typeof s.title).toBe("string");
      expect(typeof s.description).toBe("string");
      expect(typeof s.order).toBe("number");
      expect(s.weight).toBe(1);
      expect(s.required).toBe(true);
      expect(s.active).toBe(true);
    }
  });
  it("has no invented relatedStageIds", () => {
    expect(t.stages.some(s => Array.isArray(s.relatedStageIds) && s.relatedStageIds.length)).toBe(false);
  });
  it("default track weights are 50/50", () => {
    expect(t.trackWeights).toEqual({ book: 50, packetTracer: 50 });
  });
  it("has 11 book groups and 10 packet-tracer groups, each referenced by its stages", () => {
    const bookGroups = t.groups.filter(g => g.track === "book");
    const ptGroups = t.groups.filter(g => g.track === "packetTracer");
    expect(bookGroups).toHaveLength(11);
    expect(ptGroups).toHaveLength(10);
    const groupIds = new Set(t.groups.map(g => g.groupId));
    for (const s of t.stages) expect(groupIds.has(s.groupId)).toBe(true);
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
  it("carries programCode, classId, templateVersion 2 and the 105 stages", () => {
    const snap = buildClassSnapshotFromDefault("c9", "2026-09-01T00:00:00.000Z");
    expect(snap.programCode).toBe(PROGRAM_CODE);
    expect(snap.classId).toBe("c9");
    expect(snap.templateVersion).toBe(2);
    expect(snap.stages).toHaveLength(105);
  });
});
