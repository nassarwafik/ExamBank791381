import { describe, it, expect } from "vitest";
import { appendStudentRow, mergeStudentRow, removeStudentRow, pruneSelectedIds, needsAuthoritativeReload } from "./rosterPatch";

// Roadmap #32 — pure roster-patch helpers: rows change only from server-returned values, computed counters are
// preserved, and every ambiguous response is routed to the authoritative reload.

type Row = { userId: string; firstName: string; active: boolean; archived: boolean; classId: string; submittedAssignmentsCount: number; likesCount: number };
const row = (userId: string, over: Partial<Row> = {}): Row => ({ userId, firstName: "ط", active: true, archived: false, classId: "c1", submittedAssignmentsCount: 3, likesCount: 2, ...over });
const rows = () => [row("s1"), row("s2", { active: false })];

describe("R32 rosterPatch — pure helpers", () => {
  it("appendStudentRow appends the server student with counters at 0 and is idempotent on userId", () => {
    const out = appendStudentRow(rows(), { userId: "s3", firstName: "ج", active: true, archived: false, classId: "c1" });
    expect(out.map(r => r.userId)).toEqual(["s1", "s2", "s3"]);
    expect(out[2]).toMatchObject({ submittedAssignmentsCount: 0, likesCount: 0, firstName: "ج" });
    expect(appendStudentRow(out, { userId: "s3", firstName: "ج2", active: true, archived: false, classId: "c1" }).filter(r => r.userId === "s3")).toHaveLength(1);
  });

  it("mergeStudentRow merges server fields into the matching row only and PRESERVES the computed counters", () => {
    const out = mergeStudentRow(rows(), { userId: "s1", firstName: "جديد", active: false, submittedAssignmentsCount: 99, likesCount: 99 } as Partial<Row> & { userId: string });
    expect(out[0]).toMatchObject({ firstName: "جديد", active: false, submittedAssignmentsCount: 3, likesCount: 2 });
    expect(out[1]).toEqual(rows()[1]);
  });

  it("mergeStudentRow never injects a row for an unknown userId (a foreign roster stays untouched)", () => {
    const before = rows();
    expect(mergeStudentRow(before, { userId: "zzz", active: false })).toEqual(before);
  });

  it("removeStudentRow / pruneSelectedIds drop exactly the given id", () => {
    expect(removeStudentRow(rows(), "s1").map(r => r.userId)).toEqual(["s2"]);
    expect(removeStudentRow(rows(), "nope")).toHaveLength(2);
    expect(pruneSelectedIds(["s1", "s2"], "s2")).toEqual(["s1"]);
  });

  it("needsAuthoritativeReload — decision table", () => {
    const student = { userId: "s1", classId: "c1" };
    // create / update: complete document in the expected class → patchable.
    expect(needsAuthoritativeReload("create", { student, rosterSynced: true }, "c1")).toBe(false);
    expect(needsAuthoritativeReload("update", { student }, "c1")).toBe(false);
    // rosterSynced:false always reloads (self-heal), for every kind.
    expect(needsAuthoritativeReload("create", { student, rosterSynced: false }, "c1")).toBe(true);
    expect(needsAuthoritativeReload("archive", { archived: true, rosterSynced: false })).toBe(true);
    expect(needsAuthoritativeReload("delete", { deleted: true, rosterSynced: false })).toBe(true);
    expect(needsAuthoritativeReload("toggleActive", { active: true, rosterSynced: false })).toBe(true);
    // incomplete / unexpected documents.
    expect(needsAuthoritativeReload("create", {}, "c1")).toBe(true);
    expect(needsAuthoritativeReload("update", { student: null }, "c1")).toBe(true);
    expect(needsAuthoritativeReload("update", { student: { classId: "c1" } }, "c1")).toBe(true);
    expect(needsAuthoritativeReload("create", { student: { userId: "s1", classId: "c9" } }, "c1")).toBe(true);
    expect(needsAuthoritativeReload("update", null, "c1")).toBe(true);
    expect(needsAuthoritativeReload("update", undefined, "c1")).toBe(true);
    // toggle: only a boolean is patchable.
    expect(needsAuthoritativeReload("toggleActive", { active: false })).toBe(false);
    expect(needsAuthoritativeReload("toggleActive", { active: "false" })).toBe(true);
    expect(needsAuthoritativeReload("toggleActive", {})).toBe(true);
    // archive / unarchive / delete: exact confirmation flags.
    expect(needsAuthoritativeReload("archive", { archived: true, rosterSynced: true })).toBe(false);
    expect(needsAuthoritativeReload("archive", { archived: false })).toBe(true);
    expect(needsAuthoritativeReload("archive", {})).toBe(true);
    expect(needsAuthoritativeReload("unarchive", { archived: false, active: true, rosterSynced: true })).toBe(false);
    expect(needsAuthoritativeReload("unarchive", { archived: true })).toBe(true);
    expect(needsAuthoritativeReload("delete", { deleted: true, rosterSynced: true })).toBe(false);
    expect(needsAuthoritativeReload("delete", { deleted: "true" })).toBe(true);
  });
});
