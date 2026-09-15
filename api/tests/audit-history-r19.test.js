import { describe, it, expect, beforeEach } from "vitest";
import { handler as auditHandler, DEFAULT_LIMIT, HARD_MAX } from "../src/functions/audit-history.js";
import { redactAuditDetails } from "../src/lib/audit-redact.js";
import { AUDIT_PREFIX } from "../src/lib/audit-log.js";
import { handler as classHandler } from "../src/functions/manage-classrooms.js";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #19 — Audit History reader + redaction + coverage. The reader is driven through its real handler
// over the in-memory container; coverage tests drive the real class/student handlers with a capturing
// recordAuditEvent to prove which mutations emit events.

const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const AUTH_NONE = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
function getReq(query = "") { return { method: "GET", url: "https://x/api/audit-history" + (query ? "?" + query : "") }; }

// Write an audit blob directly under AUDIT_PREFIX with a name whose stamp orders it chronologically.
function seedEvent(ctx, isoTime, event) {
  const stamp = isoTime.replace(/[:.]/g, "-");
  ctx.setJson(AUDIT_PREFIX + stamp + "-" + Math.random().toString(16).slice(2, 10) + ".json", {
    schemaVersion: 1, timestamp: isoTime, actor: "teacher-1", targetType: "class", targetId: "c1", targetLabel: "صف", details: {}, ...event
  });
}

describe("R19 Z: unauthenticated audit read => 401 (no student access)", () => {
  it("returns 401 when builder auth fails", async () => {
    const ctx = createMemoryContainer();
    const r = await auditHandler(getReq(), { ...AUTH_NONE, container: ctx.container });
    expect(r.status).toBe(401);
  });
});

describe("R19 AA/AB/AC: newest-first, bounded default, hard max", () => {
  let ctx;
  beforeEach(() => {
    ctx = createMemoryContainer();
    for (let i = 0; i < 120; i++) {
      const t = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      seedEvent(ctx, t, { action: "class.create", targetId: "c" + i, targetLabel: "صف " + i });
    }
  });
  it("AA: returns events newest-first", async () => {
    const r = await auditHandler(getReq("limit=5"), { ...AUTH_OK, container: ctx.container });
    expect(r.status).toBe(200);
    const times = r.jsonBody.events.map(e => e.timestamp);
    expect(times).toEqual([...times].sort((a, b) => b.localeCompare(a)));   // descending
  });
  it("AB: default limit is bounded when no limit is given", async () => {
    const r = await auditHandler(getReq(), { ...AUTH_OK, container: ctx.container });
    expect(r.jsonBody.events.length).toBe(DEFAULT_LIMIT);
  });
  it("AC: a limit above the hard max is capped at HARD_MAX", async () => {
    const r = await auditHandler(getReq("limit=9999"), { ...AUTH_OK, container: ctx.container });
    expect(r.jsonBody.events.length).toBeLessThanOrEqual(HARD_MAX);
    expect(r.jsonBody.limit).toBe(HARD_MAX);
  });
});

describe("R19 AD/AE: redaction of secrets + survival of safe details", () => {
  it("AD: password/token/hash/salt/answer-key fields are redacted, nested everywhere", () => {
    const out = redactAuditDetails({
      classId: "c1", createdCount: 3,
      password: "SECRET", temporaryPassword: "SECRET", passwordHash: "SECRET", salt: "SECRET",
      token: "SECRET", authorization: "Bearer SECRET",
      nested: { credentials: [{ password: "SECRET", answer: "SECRET" }], correctAnswer: "SECRET" }
    });
    const s = JSON.stringify(out);
    expect(s).not.toContain("SECRET");
    expect(out.classId).toBe("c1");
    expect(out.createdCount).toBe(3);
  });

  it("AD2: KEY-NAME VARIANTS (not exact canonical names) are still redacted by containment, at any depth", () => {
    // A future call site could use a non-canonical name; the guard must catch it anyway.
    const out = redactAuditDetails({
      studentPassword: "L1", passwordSalt: "L2", sessionAuthToken: "L3", xBearerToken: "L4",
      correctAnswers: ["L5"], expectedAnswer: "L6", myApiKey: "L7",
      nested: { myPasswordHash: "L8", list: [{ userCredentials: "L9" }] }
    });
    const s = JSON.stringify(out);
    expect(s).toContain("[redacted]");   // redaction happened
    expect(s.match(/L\d/g)).toBeNull();  // NO leaked value survives, at any depth / inside arrays
  });

  it("AD3: safe aggregate detail keys are never over-redacted", () => {
    const details = { classId: "c1", createdCount: 2, duplicateCount: 1, failedCount: 0, grade: "11",
      graduationYear: "2027", programCodes: ["a"], fromClassId: "x", toClassId: "y", allowedAttempts: 2,
      dueAtOverride: "z", attemptNumber: 1, overriddenQuestions: 2, newScore: 9, effectiveAttemptEndsAt: "d" };
    const out = redactAuditDetails(details);
    for (const k of Object.keys(details)) expect(out[k]).not.toBe("[redacted]");
  });
  it("AE: the reader returns redacted details while keeping safe fields", async () => {
    const ctx = createMemoryContainer();
    seedEvent(ctx, "2026-02-01T00:00:00.000Z", {
      action: "student.bulkImport", targetType: "class",
      details: { classId: "c1", createdCount: 2, duplicateCount: 1, failedCount: 0, password: "LEAK", token: "LEAK" }
    });
    const r = await auditHandler(getReq(), { ...AUTH_OK, container: ctx.container });
    const ev = r.jsonBody.events[0];
    expect(ev.details.createdCount).toBe(2);
    expect(JSON.stringify(ev)).not.toContain("LEAK");
  });
});

describe("R19 AF/AG/AH: coverage — class.create, class archive/unarchive/graduate, student.bulkImport aggregate", () => {
  const clsReq = (action, body) => ({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action, ...body }) });
  const stuReq = (action, body) => ({ method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) });

  it("AF: creating a class records class.create", async () => {
    const ctx = createMemoryContainer();
    const events = [];
    await classHandler(clsReq("create", { name: "الحادي عشر 7", grade: "11", schoolYear: "2026-2027" }),
      { ...AUTH_OK, container: ctx.container, recordAuditEvent: async (_c, ev) => events.push(ev) });
    expect(events.some(e => e.action === "class.create" && e.targetLabel === "الحادي عشر 7")).toBe(true);
  });

  it("AG: archive / unarchive / graduate remain recorded", async () => {
    const ctx = createMemoryContainer();
    ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", grade: "12", schoolYear: "2026-2027", active: true });
    const events = [];
    const rec = async (_c, ev) => events.push(ev);
    await classHandler(clsReq("archive", { classId: "c1" }), { ...AUTH_OK, container: ctx.container, recordAuditEvent: rec });
    await classHandler(clsReq("unarchive", { classId: "c1" }), { ...AUTH_OK, container: ctx.container, recordAuditEvent: rec });
    await classHandler(clsReq("graduateAndArchive", { classId: "c1" }), { ...AUTH_OK, container: ctx.container, recordAuditEvent: rec });
    const actions = events.map(e => e.action);
    expect(actions).toContain("class.archive");
    expect(actions).toContain("class.unarchive");
    expect(actions).toContain("class.graduate");
  });

  it("AH: bulkImport records ONE aggregate event with counts only (no names/identities/passwords)", async () => {
    const ctx = createMemoryContainer();
    ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, studentIds: [] });
    const events = [];
    await studentHandler(stuReq("bulkImport", { classId: "c1", students: [
      { firstName: "علي", familyName: "حسن", identityNumber: "123456789" }
    ] }), { ...AUTH_OK, container: ctx.container, recordAuditEvent: async (_c, ev) => events.push(ev) });
    const imports = events.filter(e => e.action === "student.bulkImport");
    expect(imports).toHaveLength(1);
    expect(imports[0].details).toMatchObject({ classId: "c1", createdCount: 1, duplicateCount: 0, failedCount: 0 });
    expect(JSON.stringify(imports[0])).not.toContain("123456789");
  });
});

describe("R19 AI: an audit-write failure does not fail the successful business mutation", () => {
  it("class.create still succeeds (200) when recordAuditEvent throws", async () => {
    const ctx = createMemoryContainer();
    const r = await classHandler(
      { method: "POST", url: "https://x/api/classrooms", json: async () => ({ action: "create", name: "صف", grade: "11", schoolYear: "2026" }) },
      { ...AUTH_OK, container: ctx.container, recordAuditEvent: async () => { throw new Error("audit sink down"); } }
    );
    // The real recordAuditEvent swallows errors; even a throwing injected one must not break creation.
    expect(r.status).toBe(200);
    expect(ctx.names("platform/classes/")).toHaveLength(1);
  });
});
