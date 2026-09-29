import { describe, it, expect } from "vitest";
import type { StructuredExam } from "./examTypes";
import { AUTOSAVE_SCHEMA_VERSION, autosaveKey, writeExamBackup, readExamBackup, clearExamBackup, isRecoveryCandidate, type BackupStorage } from "./examAutosave";

// Phase 13A — LOCAL autosave backup of unsaved builder work. Keyed by scope (teacher-safe namespace) + exam id,
// versioned, timestamped, validated on read; storage failures never throw; corrupt payloads are ignored.

const exam = (examId = "EX-1", title = "T"): StructuredExam => ({ examId, title, status: "draft", sections: [] } as StructuredExam);
function memoryStorage(): BackupStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => (map.has(k) ? map.get(k)! : null), setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
}

describe("13A autosave — key, payload, validation", () => {
  it("key is namespaced by schema version, scope and exam id (never a token)", () => {
    expect(autosaveKey("teacher-7", "EX-1")).toBe("eb-sb-backup:v" + AUTOSAVE_SCHEMA_VERSION + ":teacher-7:EX-1");
    expect(autosaveKey("a:b/c", "x y")).not.toContain(" ");
  });

  it("write → read round-trips the exam with schemaVersion + timestamp; the payload holds ONLY the exam", () => {
    const s = memoryStorage();
    const e = exam();
    expect(writeExamBackup(s, "t1", e, "2026-03-01T10:00:00.000Z")).toBe(true);
    const raw = JSON.parse(s.map.get(autosaveKey("t1", "EX-1"))!);
    expect(Object.keys(raw).sort()).toEqual(["exam", "examId", "savedAt", "schemaVersion", "scope"]);
    expect(raw.schemaVersion).toBe(AUTOSAVE_SCHEMA_VERSION);
    const back = readExamBackup(s, "t1", "EX-1");
    expect(back).toEqual({ exam: e, savedAt: "2026-03-01T10:00:00.000Z" });
  });

  it("read for another exam id or another scope returns null (no cross-exam / cross-teacher recovery)", () => {
    const s = memoryStorage();
    writeExamBackup(s, "t1", exam("EX-1"), "2026-03-01T10:00:00.000Z");
    expect(readExamBackup(s, "t1", "EX-2")).toBeNull();
    expect(readExamBackup(s, "t2", "EX-1")).toBeNull();
  });

  it("a payload whose inner exam id disagrees with its key is rejected", () => {
    const s = memoryStorage();
    s.setItem(autosaveKey("t1", "EX-1"), JSON.stringify({ schemaVersion: AUTOSAVE_SCHEMA_VERSION, scope: "t1", examId: "EX-1", savedAt: "2026-03-01T10:00:00.000Z", exam: exam("EX-2") }));
    expect(readExamBackup(s, "t1", "EX-1")).toBeNull();
  });

  it.each([
    ["corrupt JSON", "{ not json"],
    ["wrong schema", JSON.stringify({ schemaVersion: 99, scope: "t1", examId: "EX-1", savedAt: "x", exam: exam() })],
    ["not an exam", JSON.stringify({ schemaVersion: AUTOSAVE_SCHEMA_VERSION, scope: "t1", examId: "EX-1", savedAt: "x", exam: { hello: 1 } })],
    ["missing timestamp", JSON.stringify({ schemaVersion: AUTOSAVE_SCHEMA_VERSION, scope: "t1", examId: "EX-1", exam: exam() })],
    ["array", "[1,2]"],
    ["null", "null"],
  ])("invalid payload (%s) → null, and the bad entry is removed", (_n, raw) => {
    const s = memoryStorage();
    s.setItem(autosaveKey("t1", "EX-1"), raw);
    expect(readExamBackup(s, "t1", "EX-1")).toBeNull();
    expect(s.map.has(autosaveKey("t1", "EX-1"))).toBe(false);
  });

  it("clear removes only that exam's backup", () => {
    const s = memoryStorage();
    writeExamBackup(s, "t1", exam("EX-1"), "2026-03-01T10:00:00.000Z");
    writeExamBackup(s, "t1", exam("EX-2"), "2026-03-01T10:00:00.000Z");
    clearExamBackup(s, "t1", "EX-1");
    expect(readExamBackup(s, "t1", "EX-1")).toBeNull();
    expect(readExamBackup(s, "t1", "EX-2")).not.toBeNull();
  });
});

describe("13A autosave — storage failures never break the builder", () => {
  const throwing: BackupStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new DOMException("quota", "QuotaExceededError"); }, removeItem: () => { throw new Error("blocked"); } };
  it("quota / blocked storage: write returns false, read null, clear silent — no exception escapes", () => {
    expect(writeExamBackup(throwing, "t1", exam(), "2026-03-01T10:00:00.000Z")).toBe(false);
    expect(readExamBackup(throwing, "t1", "EX-1")).toBeNull();
    expect(() => clearExamBackup(throwing, "t1", "EX-1")).not.toThrow();
  });
  it("a missing storage (undefined / null) is treated as unavailable", () => {
    expect(writeExamBackup(null, "t1", exam(), "x")).toBe(false);
    expect(readExamBackup(undefined, "t1", "EX-1")).toBeNull();
  });
});

describe("13A autosave — recovery candidate rule", () => {
  const server = { ...exam(), updatedAt: "2026-03-01T10:00:00.000Z" };
  it("offered only when the backup is newer than the opened exam AND structurally different", () => {
    expect(isRecoveryCandidate({ exam: { ...server, title: "LOCAL" }, savedAt: "2026-03-01T10:05:00.000Z" }, server)).toBe(true);
    expect(isRecoveryCandidate({ exam: { ...server, title: "LOCAL" }, savedAt: "2026-03-01T09:00:00.000Z" }, server)).toBe(false);   // older than the server copy
    expect(isRecoveryCandidate({ exam: { ...server }, savedAt: "2026-03-01T10:05:00.000Z" }, server)).toBe(false);                  // identical content
    expect(isRecoveryCandidate(null, server)).toBe(false);
  });
  it("an opened exam without updatedAt (new / imported) accepts any different backup; a different exam id is never a candidate", () => {
    expect(isRecoveryCandidate({ exam: { ...exam(), title: "LOCAL" }, savedAt: "2026-03-01T10:05:00.000Z" }, exam())).toBe(true);
    expect(isRecoveryCandidate({ exam: exam("EX-2", "LOCAL"), savedAt: "2026-03-01T10:05:00.000Z" }, exam("EX-1"))).toBe(false);
  });
});
