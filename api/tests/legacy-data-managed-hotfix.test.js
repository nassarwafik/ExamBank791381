import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ hotfix after P2-A2 — data created before teacher tenancy (21G.0) carries no ownerId. Without LEGACY_DATA_OWNER it was
// shared with EVERY tenant, so a brand-new managed teacher created from the Owner Console (account id t_…) saw all pre-tenancy
// classes, students, saved exams and bank questions. Owner rule: «لا تُسند البيانات القديمة عشوائيًا لأي معلم».
// Fixed rule (one place, canAccessDocument): an unowned document is NOT visible to a console-created managed account; existing
// teachers (BUILDER_USERS ids, the legacy single identity) keep today's behaviour (owner decision D7); LEGACY_DATA_OWNER still
// names an explicit owner. TEST data only. Written fail-first: run against the baseline 8be6fdda it fails.

process.env.BANK_SETUP_KEY = "hotfix-legacy-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.LEGACY_DATA_OWNER;

const { canAccessDocument } = await import("../src/lib/teacher-tenancy.js");
const { bankEntryVisible } = await import("../src/lib/bank-tenancy.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");

const MANAGED = "t_00112233445566aa";
const unowned = { classId: "c-old", name: "صف قديم" };

describe("hotfix — pre-tenancy data is never handed to a console-created managed teacher", () => {
  it("canAccessDocument: unowned → hidden from a managed t_ account; still visible to an existing (BUILDER_USERS) teacher", () => {
    expect(canAccessDocument(unowned, MANAGED, {})).toBe(false);
    expect(canAccessDocument(unowned, "teacher-author", {})).toBe(true);
    expect(canAccessDocument(unowned, null, {})).toBe(true);
    expect(canAccessDocument({ ...unowned, ownerId: MANAGED }, MANAGED, {})).toBe(true);
    expect(canAccessDocument({ ...unowned, ownerId: "teacher-author" }, MANAGED, {})).toBe(false);
  });

  it("an explicit LEGACY_DATA_OWNER still decides: the named teacher sees it, everyone else does not", () => {
    expect(canAccessDocument(unowned, MANAGED, { LEGACY_DATA_OWNER: MANAGED })).toBe(true);
    expect(canAccessDocument(unowned, "teacher-author", { LEGACY_DATA_OWNER: MANAGED })).toBe(false);
  });

  it("bank: an unowned teacher question is hidden from a managed account; official questions stay shared", () => {
    expect(bankEntryVisible({ questionId: "q1", sourceId: "manual-1" }, MANAGED, {})).toBe(false);
    expect(bankEntryVisible({ questionId: "q2", sourceId: "791381-2024-summer" }, MANAGED, {})).toBe(true);
  });

  it("end to end: a managed teacher's class list does not include a pre-tenancy class", async () => {
    const mem = createMemoryContainer({ "platform/classes/c-old.json": { ...unowned, status: "active", studentIds: [] } });
    mem.setJson(teacherAccountName(MANAGED), { schemaVersion: 1, accountId: MANAGED, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
    const { token } = createManagedTeacherToken({ accountId: MANAGED, sid: newTeacherSessionId(), authVersion: 1 });
    const req = { method: "GET", headers: { get: k => ({ "x-builder-token": token })[String(k).toLowerCase()] ?? null }, json: async () => ({}) };
    const r = await classrooms(req, { getContainer: () => mem.container });
    expect(r.status).toBe(200);
    expect(r.jsonBody.classes.map(c => c.classId)).toEqual([]);
  });
});

describe("hotfix — the console-account pattern is the managed account id pattern (pin)", () => {
  it("teacher-tenancy recognises exactly the ids the account store issues", async () => {
    const { CONSOLE_ACCOUNT_RE } = await import("../src/lib/teacher-tenancy.js");
    const { ACCOUNT_ID_RE } = await import("../src/lib/identity/teacher-token.js");
    const { newTeacherAccountId } = await import("../src/lib/identity/teacher-accounts.js");
    expect(CONSOLE_ACCOUNT_RE.source).toBe(ACCOUNT_ID_RE.source);
    for (let i = 0; i < 20; i++) expect(CONSOLE_ACCOUNT_RE.test(newTeacherAccountId())).toBe(true);
    for (const id of ["teacher-author", "t.sara", "builder", "t_123"]) expect(CONSOLE_ACCOUNT_RE.test(id)).toBe(false);
  });
});
