// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { loadReaderPosition, saveReaderPosition, clearReaderPosition } from "./readerPosition";

// Phase 9A — the per-student Reader marker: scoped by the server-issued userId, tolerant of missing/malformed storage.
describe("9A readerPosition — per-student device marker", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("round-trips one student's page and never reveals it to another student on the same device", () => {
    saveReaderPosition("u1", { courseId: "791381", pageId: "791381-m03-l01-p02" }, "2026-03-10T10:00:00.000Z");
    expect(loadReaderPosition("u1")).toEqual({ courseId: "791381", pageId: "791381-m03-l01-p02", at: "2026-03-10T10:00:00.000Z" });
    expect(loadReaderPosition("u2")).toBeNull();                                                  // another student: nothing
    expect(loadReaderPosition("")).toBeNull();                                                    // no identity: nothing
  });

  it("switching students keeps each marker separate; clearing one leaves the other", () => {
    saveReaderPosition("u1", { courseId: "791381", pageId: "p-u1" });
    saveReaderPosition("u2", { courseId: "791381", pageId: "p-u2" });
    expect(loadReaderPosition("u1")?.pageId).toBe("p-u1");
    expect(loadReaderPosition("u2")?.pageId).toBe("p-u2");
    clearReaderPosition("u1");
    expect(loadReaderPosition("u1")).toBeNull();
    expect(loadReaderPosition("u2")?.pageId).toBe("p-u2");
  });

  it("ignores malformed or incomplete markers and never throws when storage misbehaves", () => {
    window.localStorage.setItem("examBankReaderPosition:v1:u1", "{not json");
    expect(loadReaderPosition("u1")).toBeNull();
    window.localStorage.setItem("examBankReaderPosition:v1:u1", JSON.stringify({ courseId: "791381" }));
    expect(loadReaderPosition("u1")).toBeNull();
    saveReaderPosition("u1", { courseId: "", pageId: "x" });                                        // incomplete → not written
    expect(loadReaderPosition("u1")).toBeNull();
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error("quota"); };
    expect(() => saveReaderPosition("u1", { courseId: "791381", pageId: "p" })).not.toThrow();
    window.localStorage.setItem = original;
  });
});
