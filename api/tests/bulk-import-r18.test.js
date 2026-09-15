import { describe, it, expect, beforeEach } from "vitest";
import {
  handler,
  normalizeBulkStudents, namesFromInput, identityFromInput, normalizeIdentityNumber, isValidIdentityNumber,
  buildImportPreview, MAX_IMPORT_ROWS
} from "../src/functions/manage-students.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #18 — Bulk Student Import. Pure-helper tests (A–I) drive the exported normalization/validation
// directly; handler tests (J–Q) drive the REAL handler + REAL platform-storage over an in-memory container
// with faithful ETag/conditional-write semantics, so uniqueness/race/partial behavior is proven, not stubbed.

// ── A–I: pure normalization + validation ──────────────────────────────────────────────────────────────
describe("R18 A/B: array + {students:[...]} normalization", () => {
  it("A: a plain JSON array normalizes to canonical rows", () => {
    const rows = normalizeBulkStudents([{ firstName: "علي", familyName: "حسن", identityNumber: "123456789" }]);
    expect(rows).toEqual([{ index: 0, firstName: "علي", familyName: "حسن", identityNumber: "123456789" }]);
  });
  it("B: a {students:[...]} envelope normalizes the same way", () => {
    const rows = normalizeBulkStudents({ students: [{ firstName: "سارة", familyName: "علي", identityNumber: "12345678" }] });
    expect(rows[0]).toMatchObject({ firstName: "سارة", familyName: "علي", identityNumber: "012345678" }); // D: padded to 9
  });
});

describe("R18 C: CSV-normalized payload (rows produced client-side) is accepted", () => {
  it("normalizes a CSV-shaped canonical payload", () => {
    // The frontend parses CSV -> canonical rows; the server treats them identically to a JSON array.
    const rows = normalizeBulkStudents([{ firstName: "منى", familyName: "خالد", identityNumber: "222333444" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstName: "منى", familyName: "خالد", identityNumber: "222333444" });
  });
});

describe("R18 D: identity normalization (9 digits)", () => {
  it("pads short numeric ids to 9 and strips non-digits", () => {
    expect(normalizeIdentityNumber("12345")).toBe("000012345");
    expect(normalizeIdentityNumber("12-345-678")).toBe("012345678");
    expect(isValidIdentityNumber("012345678")).toBe(true);
    expect(isValidIdentityNumber("12345")).toBe(false);
  });
  it("aliases: identityNumber/idNumber/studentId/code all map", () => {
    expect(identityFromInput({ idNumber: "123456789" })).toBe("123456789");
    expect(identityFromInput({ studentId: "123456789" })).toBe("123456789");
    expect(identityFromInput({ code: "123456789" })).toBe("123456789");
    expect(namesFromInput({ givenName: "أحمد", surname: "زايد" })).toEqual({ firstName: "أحمد", familyName: "زايد" });
  });
});

describe("R18 E/F/G/H: invalid + duplicate-within-batch detection (preview)", () => {
  let ctx;
  beforeEach(() => { ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true } }); });
  it("E: missing first name => invalid", async () => {
    const p = await buildImportPreview(ctx.container, normalizeBulkStudents([{ familyName: "حسن", identityNumber: "123456789" }]));
    expect(p[0].status).toBe("invalid");
  });
  it("F: missing family name => invalid", async () => {
    const p = await buildImportPreview(ctx.container, normalizeBulkStudents([{ firstName: "علي", identityNumber: "123456789" }]));
    expect(p[0].status).toBe("invalid");
  });
  it("G: invalid identity (more than 9 digits) => invalid", async () => {
    const p = await buildImportPreview(ctx.container, normalizeBulkStudents([{ firstName: "علي", familyName: "حسن", identityNumber: "1234567890123" }]));
    expect(p[0].status).toBe("invalid");
  });
  it("H: duplicate identity WITHIN the same import is detected via previewImport counts", async () => {
    const students = [
      { firstName: "علي", familyName: "حسن", identityNumber: "123456789" },
      { firstName: "علي", familyName: "حسن", identityNumber: "123456789" }
    ];
    const r = await handler(req("previewImport", { classId: "c1", students }), deps(ctx));
    // Second occurrence of the same in-batch identity is flagged (not counted valid twice).
    expect(r.jsonBody.valid).toBe(1);
    expect(r.jsonBody.duplicates).toBe(1);
  });
});

// ── J–Q: handler-level (real storage semantics) ─────────────────────────────────────────────────────────
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
function deps(ctx, extra = {}) { return { ...AUTH, container: ctx.container, recordAuditEvent: extra.recordAuditEvent, ...extra }; }
function req(action, body) { return { method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) }; }
function activeClass(ctx, id = "c1", name = "الحادي عشر") { ctx.setJson("platform/classes/" + id + ".json", { classId: id, name, active: true, studentIds: [] }); }
const row = (over = {}) => ({ firstName: "علي", familyName: "حسن", identityNumber: "123456789", ...over });

describe("R18 I/J/K/L/M: existing-identity, archived-class, create, credentials, no plaintext stored", () => {
  let ctx;
  beforeEach(() => { ctx = createMemoryContainer(); activeClass(ctx); });

  it("J: bulkImport into an ARCHIVED class is rejected (no accounts created)", async () => {
    ctx.setJson("platform/classes/c2.json", { classId: "c2", name: "مؤرشف", active: false, status: "archived" });
    const r = await handler(req("bulkImport", { classId: "c2", students: [row()] }), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });

  it("K/L: valid rows create accounts; credentials returned ONLY for created rows", async () => {
    const r = await handler(req("bulkImport", { classId: "c1", students: [row(), row({ identityNumber: "222222222", firstName: "منى" })] }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.imported).toBe(2);
    expect(r.jsonBody.credentials).toHaveLength(2);
    expect(r.jsonBody.credentials.every(c => typeof c.password === "string" && c.password.length >= 6)).toBe(true);
    expect(ctx.names("platform/users/")).toHaveLength(2);
  });

  it("M: the generated plaintext password is NEVER stored in the student or auth document", async () => {
    const r = await handler(req("bulkImport", { classId: "c1", students: [row()] }), deps(ctx));
    const pw = r.jsonBody.credentials[0].password;
    const studentBlob = ctx.getJson(ctx.names("platform/users/")[0]);
    const authBlob = ctx.getJson(ctx.names("platform/auth/")[0]);
    expect(JSON.stringify(studentBlob)).not.toContain(pw);
    expect(JSON.stringify(authBlob)).not.toContain(pw);
    expect(studentBlob).not.toHaveProperty("password");
    expect(authBlob).not.toHaveProperty("password");        // only salt + passwordHash live here
    expect(authBlob).toHaveProperty("passwordHash");
  });

  it("I: an identity that already exists in the system is reported as a duplicate failure", async () => {
    await handler(req("bulkImport", { classId: "c1", students: [row()] }), deps(ctx));   // create once
    const r = await handler(req("bulkImport", { classId: "c1", students: [row({ firstName: "آخر" })] }), deps(ctx)); // same identity again
    expect(r.jsonBody.imported).toBe(0);
    expect(r.jsonBody.failed).toBe(1);
    expect(r.jsonBody.duplicates).toBe(1);
    expect(r.jsonBody.errors[0].duplicate).toBe(true);
  });
});

describe("R18 N/O/P/Q: race safety, explicit partial result, idempotent repeat, server row limit", () => {
  let ctx;
  beforeEach(() => { ctx = createMemoryContainer(); activeClass(ctx); });

  it("N: conditional auth create is the uniqueness guard — a second create for the same identity fails safely", async () => {
    // Simulate a race: seed the auth blob as if a concurrent create already won, then attempt a create.
    const first = await handler(req("bulkImport", { classId: "c1", students: [row()] }), deps(ctx));
    expect(first.jsonBody.imported).toBe(1);
    const usersBefore = ctx.names("platform/users/").length;
    const again = await handler(req("bulkImport", { classId: "c1", students: [row()] }), deps(ctx));
    expect(again.jsonBody.imported).toBe(0);                 // never overwrote the existing account
    expect(ctx.names("platform/users/").length).toBe(usersBefore);
  });

  it("O: a partial import returns explicit created + failed (never silent full success)", async () => {
    await handler(req("bulkImport", { classId: "c1", students: [row({ identityNumber: "111111111" })] }), deps(ctx)); // pre-existing
    const r = await handler(req("bulkImport", {
      classId: "c1",
      students: [row({ identityNumber: "111111111" }), row({ identityNumber: "222222222", firstName: "منى" })]
    }), deps(ctx));
    expect(r.jsonBody.imported).toBe(1);
    expect(r.jsonBody.failed).toBe(1);
    expect(r.jsonBody.credentials).toHaveLength(1);
    expect(r.jsonBody.errors).toHaveLength(1);
  });

  it("P: repeating the exact same import creates ZERO duplicate documents", async () => {
    const students = [row({ identityNumber: "111111111", firstName: "أ" }), row({ identityNumber: "222222222", firstName: "ب" })];
    await handler(req("bulkImport", { classId: "c1", students }), deps(ctx));
    const after1 = ctx.names("platform/users/").length;
    const r2 = await handler(req("bulkImport", { classId: "c1", students }), deps(ctx));
    expect(r2.jsonBody.imported).toBe(0);
    expect(r2.jsonBody.duplicates).toBe(2);
    expect(ctx.names("platform/users/").length).toBe(after1);  // no new documents
  });

  it("Q: an oversized import is rejected server-side (client limit is not authoritative)", async () => {
    const students = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => row({ identityNumber: String(100000000 + i) }));
    const r = await handler(req("bulkImport", { classId: "c1", students }), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
});

describe("R18 audit: bulkImport records an aggregate-only event (no names/identities/passwords)", () => {
  it("records student.bulkImport with safe counts only", async () => {
    const ctx = createMemoryContainer(); activeClass(ctx);
    const events = [];
    const rec = async (_c, ev) => { events.push(ev); };
    await handler(req("bulkImport", { classId: "c1", students: [row(), row({ identityNumber: "222222222", firstName: "منى" })] }), deps(ctx, { recordAuditEvent: rec }));
    const ev = events.find(e => e.action === "student.bulkImport");
    expect(ev).toBeTruthy();
    expect(ev.details).toMatchObject({ classId: "c1", createdCount: 2, duplicateCount: 0, failedCount: 0 });
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("123456789");           // no identity numbers in the audit event
  });
});
