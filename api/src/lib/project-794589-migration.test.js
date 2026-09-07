import { describe, it, expect } from "vitest";
import {
  normalizeTitle, entryIsMeaningful, progressDocIsMeaningful, classHasMeaningfulProgress,
  buildSafeStageMapping, analyzeMigration, migrateProgressDoc
} from "./project-794589-migration.js";

describe("normalizeTitle", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeTitle("  VTP   Configuration  ")).toBe("VTP Configuration");
  });
});

describe("meaningful progress detection", () => {
  it("empty / all-not_started / note-less docs are not meaningful", () => {
    expect(entryIsMeaningful({ status: "not_started" })).toBe(false);
    expect(progressDocIsMeaningful({ stages: { B01: { status: "not_started" } }, history: [] })).toBe(false);
    expect(classHasMeaningfulProgress([{ stages: {} }, null])).toBe(false);
  });
  it("a non-default status, a note, or history makes it meaningful", () => {
    expect(entryIsMeaningful({ status: "approved" })).toBe(true);
    expect(entryIsMeaningful({ status: "not_started", note: "check OSPF" })).toBe(true);
    expect(progressDocIsMeaningful({ stages: {}, history: [{ eventId: "e1" }] })).toBe(true);
    expect(classHasMeaningfulProgress([{ stages: { B01: { status: "in_progress" } } }])).toBe(true);
  });
});

describe("buildSafeStageMapping", () => {
  const oldStages = [
    { stageId: "B01", track: "book", title: "بيانات المشروع" },     // old-only (no such title in new)
    { stageId: "B02", track: "book", title: "DNS" },                 // unique both sides -> maps
    { stageId: "B05", track: "book", title: "VLAN" },               // VLAN repeats in new -> ambiguous
    { stageId: "P01", track: "packetTracer", title: "OSPF" }        // unique both sides -> maps
  ];
  const newStages = [
    { stageId: "B13", track: "book", title: "DNS" },
    { stageId: "B09", track: "book", title: "VLAN" },
    { stageId: "B34", track: "book", title: "VLAN" },               // duplicate -> not uniquely mappable
    { stageId: "B54", track: "book", title: "مصادر" },
    { stageId: "P25", track: "packetTracer", title: "OSPF" }
  ];

  it("maps only exact + unique (track,title) matches, never by id", () => {
    const r = buildSafeStageMapping(oldStages, newStages);
    expect(r.map).toEqual({ B02: "B13", P01: "P25" });
  });
  it("flags repeated-title stages as ambiguous, not mapped", () => {
    const r = buildSafeStageMapping(oldStages, newStages);
    expect(r.ambiguous).toContain("B05");
    expect(r.map.B05).toBeUndefined();
  });
  it("reports old-only and new-only stages", () => {
    const r = buildSafeStageMapping(oldStages, newStages);
    expect(r.oldOnly).toContain("B01");
    expect(r.newOnly).toEqual(expect.arrayContaining(["B09", "B34", "B54"]));
    expect(r.newOnly).not.toContain("B13");
  });
  it("does not map across tracks even with identical titles", () => {
    const r = buildSafeStageMapping(
      [{ stageId: "B99", track: "book", title: "OSPF" }],
      [{ stageId: "P25", track: "packetTracer", title: "OSPF" }]
    );
    expect(r.map).toEqual({});
    expect(r.oldOnly).toContain("B99");
  });
});

describe("migrateProgressDoc", () => {
  it("carries meaningful entries onto mapped ids and drops unmapped ones, preserving history", () => {
    const doc = {
      studentId: "s1",
      stages: {
        B02: { status: "approved", approvedAt: "2026-09-01T00:00:00.000Z", approvedBy: "t1" },
        B05: { status: "ready_for_review", note: "revise" }, // ambiguous -> unmapped -> dropped
        B10: { status: "not_started" }                        // not meaningful -> ignored
      },
      history: [{ eventId: "h1", stageId: "B02", type: "status", toStatus: "approved" }]
    };
    const map = { B02: "B13" };
    const { doc: out, skipped } = migrateProgressDoc(doc, map, "2026-09-07T00:00:00.000Z");
    expect(out.stages.B13).toEqual({ status: "approved", approvedAt: "2026-09-01T00:00:00.000Z", approvedBy: "t1" });
    expect(out.stages.B05).toBeUndefined();
    expect(out.stages.B02).toBeUndefined();
    expect(skipped).toContain("B05");
    expect(out.history).toBe(doc.history); // preserved verbatim
    expect(out.migratedAt).toBe("2026-09-07T00:00:00.000Z");
  });
});

describe("analyzeMigration", () => {
  it("summarises migrated vs skipped meaningful entries per student", () => {
    const oldStages = [
      { stageId: "B02", track: "book", title: "DNS" },
      { stageId: "B05", track: "book", title: "VLAN" }
    ];
    const newStages = [
      { stageId: "B13", track: "book", title: "DNS" },
      { stageId: "B09", track: "book", title: "VLAN" },
      { stageId: "B34", track: "book", title: "VLAN" }
    ];
    const progressDocs = [
      { studentId: "s1", stages: { B02: { status: "approved" }, B05: { status: "approved" } } }
    ];
    const r = analyzeMigration(oldStages, newStages, progressDocs);
    expect(r.exactMatches).toBe(1);
    expect(r.migratedEntries).toBe(1);
    expect(r.skippedEntries).toBe(1);
    expect(r.perStudent[0]).toEqual({ studentId: "s1", migrated: 1, skipped: 1 });
  });
});
