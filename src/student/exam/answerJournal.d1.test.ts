// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { studentIdFromToken, writeJournal, readJournal, clearJournal, clearAllJournals, pruneExpiredJournals, JOURNAL_TTL_MS } from "./answerJournal";

// D1 — the device copy of unsent exam answers: keyed per student + assignment, validated on read, expired after a bounded time,
// removed entirely by an explicit logout. Storage failures never throw into the exam page.

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const entry = (over: Record<string, unknown> = {}) => ({ studentId: "s1", assignmentId: "a1", attempt: { attemptNumber: 1, startedAt: "2026-01-01T00:00:00.000Z" }, generation: 0, base: {}, answers: { q1: { kind: "text", value: "x" } }, ...over });
const KEY = "examBankAnswerJournal:v1:s1:a1";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("studentIdFromToken", () => {
  it("reads sub from the token payload (base64url, Arabic display fields included)", () => {
    expect(studentIdFromToken(b64url(JSON.stringify({ sub: "u-42", name: "سارة" })) + ".sig")).toBe("u-42");
  });
  it("anything unreadable, a missing / non-string sub, or a sub that could break the key → \"\" (no journal)", () => {
    for (const t of ["", "garbage", "!!!.sig", b64url("null") + ".s", b64url(JSON.stringify({ sub: 7 })) + ".s", b64url(JSON.stringify({ sub: "a:b" })) + ".s"]) {
      expect(studentIdFromToken(t)).toBe("");
    }
  });
});

describe("write / read / clear", () => {
  it("round-trips the entry for the same student + assignment only", () => {
    writeJournal(entry());
    expect(readJournal("s1", "a1")).toMatchObject({ v: 1, ...entry() });
    expect(readJournal("s2", "a1")).toBeNull();
    expect(readJournal("s1", "a2")).toBeNull();
    clearJournal("s1", "a1");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it("no student id → nothing written, nothing read", () => {
    writeJournal(entry({ studentId: "" }));
    expect(localStorage.length).toBe(0);
    expect(readJournal("", "a1")).toBeNull();
  });
  it("a malformed or foreign-shaped record is never returned and is removed", () => {
    const bad = [
      "{not json",
      JSON.stringify({ ...entry(), v: 2, at: Date.now() }),
      JSON.stringify({ ...entry(), studentId: "s2", at: Date.now() }),
      JSON.stringify({ ...entry(), answers: [], at: Date.now() }),
      JSON.stringify({ ...entry(), attempt: { attemptNumber: "1" }, at: Date.now() }),
      JSON.stringify({ ...entry(), generation: "0", at: Date.now() })
    ];
    for (const raw of bad) {
      localStorage.setItem(KEY, raw);
      expect(readJournal("s1", "a1")).toBeNull();
    }
    expect(localStorage.getItem(KEY) === null || localStorage.getItem(KEY) === "{not json").toBe(true);
  });
  it("a legacy record (attempt null) is valid", () => {
    writeJournal(entry({ attempt: null }));
    expect(readJournal("s1", "a1")!.attempt).toBeNull();
  });
  it("an expired copy is not returned and is removed", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    writeJournal(entry());
    vi.setSystemTime(1_000_000 + JOURNAL_TTL_MS);
    expect(readJournal("s1", "a1")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
  it("blocked storage never throws", () => {
    const fail = () => { throw new Error("SecurityError"); };
    vi.stubGlobal("localStorage", { setItem: fail, getItem: fail, removeItem: fail, key: fail, get length() { return fail(); } });
    expect(() => writeJournal(entry())).not.toThrow();
    expect(readJournal("s1", "a1")).toBeNull();
    expect(() => clearAllJournals()).not.toThrow();
    expect(() => pruneExpiredJournals()).not.toThrow();
  });
});

describe("clearAllJournals / pruneExpiredJournals", () => {
  it("logout removes every student's copy and nothing else", () => {
    writeJournal(entry());
    writeJournal(entry({ studentId: "s2", assignmentId: "a9" }));
    localStorage.setItem("examBankStrictExit:a1", "{}");
    localStorage.setItem("other", "1");
    clearAllJournals();
    expect(Object.keys(localStorage).sort()).toEqual(["examBankStrictExit:a1", "other"]);
  });
  it("prune removes only expired or unreadable copies", () => {
    vi.useFakeTimers({ now: 5_000_000 });
    writeJournal(entry({ studentId: "old" }));
    vi.setSystemTime(5_000_000 + JOURNAL_TTL_MS);
    writeJournal(entry({ studentId: "fresh" }));
    localStorage.setItem("examBankAnswerJournal:v1:broken:a1", "{");
    localStorage.setItem("other", "1");
    pruneExpiredJournals();
    expect(Object.keys(localStorage).sort()).toEqual(["examBankAnswerJournal:v1:fresh:a1", "other"]);
  });
});
