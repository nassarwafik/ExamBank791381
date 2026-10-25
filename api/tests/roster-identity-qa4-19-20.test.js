import { describe, it, expect, beforeAll } from "vitest";
import { handler as students } from "../src/functions/manage-students.js";
import { handler as login } from "../src/functions/platform-login.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// QA-4 / QA-19 / QA-20 — roster identity and names.
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297):
//   QA-4   a bulk import carrying the same identity twice: with an import key, the second row was "recovered" onto the account the
//          first row had just created — its password was reset (the printed credential of row 1 stopped working) and the second
//          student was never created nor reported as a duplicate;
//   QA-19  a student created from Arabic-Indic digits (stored as the canonical ASCII identity) could not log in typing the same
//          digits — nor with Persian digits, separators or without the leading zero;
//   QA-20  a name made only of ZWJ / ZWNJ (invisible) was accepted.
//
// Every test runs the REAL handlers on the in-memory store.

beforeAll(() => { process.env.STUDENT_SESSION_SECRET = "qa-roster-identity-secret-0123456789ab"; });
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), recordAuditEvent: async () => {} };
const sreq = body => ({ method: "POST", url: "https://x/api/students", json: async () => body });
const lreq = body => ({ method: "POST", url: "https://x/api/platform-login", headers: new Map(), json: async () => body });
const loginDeps = ctx => ({ getContainer: () => ctx.container, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "qa", validateBuilderCredentials: () => false });
const seed = () => { const ctx = createMemoryContainer(); ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, studentIds: [] }); return ctx; };
const call = (ctx, body) => students(sreq(body), { ...AUTH, container: ctx.container });
const signIn = (ctx, userCode, password) => login(lreq({ userCode, password }), loginDeps(ctx));
const IMPORT_ID = "abcdef0123456789abcd";

describe("QA-4 an identity repeated in one bulk import is a duplicate, never a reset of the first row's account", () => {
  const rows = [
    { firstName: "علي", familyName: "حسن", identityNumber: "111222333" },
    { firstName: "سارة", familyName: "خالد", identityNumber: "111222333" }
  ];
  it("with an import key: one account, row 2 reported as an in-file duplicate, row 1's printed password still logs in", async () => {
    const ctx = seed();
    const r = await call(ctx, { action: "bulkImport", classId: "c1", students: rows, importId: IMPORT_ID });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ imported: 1, duplicates: 1 });
    expect(r.jsonBody.recovered || 0).toBe(0);
    expect(r.jsonBody.credentials).toHaveLength(1);
    expect(r.jsonBody.credentials[0]).toMatchObject({ firstName: "علي" });
    expect(r.jsonBody.errors).toEqual([expect.objectContaining({ firstName: "سارة", duplicate: true, error: "رقم الهوية مكرر داخل الملف." })]);
    expect(ctx.names("platform/users/")).toHaveLength(1);
    expect((await signIn(ctx, "111222333", r.jsonBody.credentials[0].password)).status).toBe(200);
  });
  it("the same holds without an import key, and when the repeat is written differently (Arabic-Indic digits)", async () => {
    const ctx = seed();
    const r = await call(ctx, { action: "bulkImport", classId: "c1", students: [rows[0], { ...rows[1], identityNumber: "١١١٢٢٢٣٣٣" }] });
    expect(r.jsonBody).toMatchObject({ imported: 1, duplicates: 1 });
    expect(r.jsonBody.errors[0].error).toBe("رقم الهوية مكرر داخل الملف.");
  });
  it("unchanged (Phase S.3): a RETRY of the same import (lost response) still recovers its own rows with new passwords", async () => {
    const ctx = seed();
    const first = await call(ctx, { action: "bulkImport", classId: "c1", students: [rows[0]], importId: IMPORT_ID });
    expect(first.jsonBody.imported).toBe(1);
    const retry = await call(ctx, { action: "bulkImport", classId: "c1", students: [rows[0]], importId: IMPORT_ID });
    expect(retry.jsonBody).toMatchObject({ recovered: 1, duplicates: 0 });
    expect((await signIn(ctx, "111222333", retry.jsonBody.credentials[0].password)).status).toBe(200);
  });
  it("unchanged: distinct identities all import", async () => {
    const ctx = seed();
    const r = await call(ctx, { action: "bulkImport", classId: "c1", students: [rows[0], { ...rows[1], identityNumber: "444555666" }], importId: IMPORT_ID });
    expect(r.jsonBody).toMatchObject({ imported: 2, duplicates: 0 });
  });
});

describe("QA-19 the same identity typed in another digit script / format logs in", () => {
  it("Arabic-Indic, Persian, with separators, and without the leading zero all reach the account; a wrong password does not", async () => {
    const ctx = seed();
    expect((await call(ctx, { action: "create", classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "١٢٣٤٥٦٧٨٩", password: "secret12" })).jsonBody.student.code).toBe("123456789");
    for (const code of ["123456789", "١٢٣٤٥٦٧٨٩", "۱۲۳۴۵۶۷۸۹", "123-456-789", " 123 456 789 "]) expect((await signIn(ctx, code, "secret12")).status, code).toBe(200);
    expect((await signIn(ctx, "١٢٣٤٥٦٧٨٩", "wrong-pass")).status).toBe(401);
    const ctx2 = seed();
    await call(ctx2, { action: "create", classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "12345678", password: "secret12" });   // stored 012345678
    for (const code of ["012345678", "12345678", "۰۱۲۳۴۵۶۷۸", "12-345-678"]) expect((await signIn(ctx2, code, "secret12")).status, code).toBe(200);
  });
  it("a different identity never matches; a code with letters is not reinterpreted", async () => {
    const ctx = seed();
    await call(ctx, { action: "create", classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "123456789", password: "secret12" });
    expect((await signIn(ctx, "١٢٣٤٥٦٧٨٨", "secret12")).status).toBe(401);
    expect((await signIn(ctx, "12345678x", "secret12")).status).toBe(401);
  });
});

describe("QA-20 a name nobody can see is refused like a blank one", () => {
  it("a first name made only of ZWJ / ZWNJ (and spaces) → 400, nothing created", async () => {
    const ctx = seed();
    for (const firstName of ["‍‌", " ‌ ‍ "]) {
      const r = await call(ctx, { action: "create", classId: "c1", firstName, familyName: "حسن", identityNumber: "333444555" });
      expect(r.status, JSON.stringify(firstName)).toBe(400);
    }
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
  it("unchanged: ZWNJ inside a real word is kept", async () => {
    const ctx = seed();
    const r = await call(ctx, { action: "create", classId: "c1", firstName: "می‌خواهم", familyName: "حسن", identityNumber: "333444555" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.student.firstName).toBe("می‌خواهم");
  });
  it("the bulk preview marks an invisible-only name invalid", async () => {
    const ctx = seed();
    const r = await call(ctx, { action: "previewImport", classId: "c1", students: [{ firstName: "‌", familyName: "حسن", identityNumber: "333444555" }] });
    expect(r.jsonBody.preview[0].status).toBe("invalid");
  });
});
