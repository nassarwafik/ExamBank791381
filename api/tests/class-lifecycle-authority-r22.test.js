import { describe, it, expect } from "vitest";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { handler as assignmentHandler } from "../src/functions/manage-assignments.js";
import { normalizeClassStatus } from "../src/lib/class-lifecycle.js";
import { studentCodeHash } from "../src/lib/student-auth.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #22 — Canonical Class-Lifecycle Authority for teacher membership & assignment gates.
//
// The teacher mutation gates now use normalizeClassStatus(classroom) === "archived" instead of the raw
// classroom.active === false. normalizeClassStatus treats EITHER status:"archived" OR active:false as
// archived, so these tests specifically exercise INCONSISTENT class blobs where the two lifecycle fields
// disagree (a legacy/migrated/hand-edited representation), plus the canonical/legacy/active baselines to
// prove no normal behavior changed. Drives the real handlers over the in-memory container.

const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
function deps(ctx) { return { ...AUTH_OK, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} }; }
const stuReq = (action, body) => ({ method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) });
const asgReq = (action, body) => ({ method: "POST", url: "https://x/api/assignments", json: async () => ({ action, ...body }) });
const cls = (over) => ({ name: "صف", studentIds: [], ...over });
const validStudent = (over = {}) => ({ firstName: "علي", familyName: "حسن", identityNumber: "123456789", ...over });

// A class whose two lifecycle fields DISAGREE: normalizeClassStatus must still call it archived.
const INCONSISTENT_ARCHIVED = { statusOnly: { status: "archived" }, statusArchivedActiveTrue: { status: "archived", active: true } };

describe("R22 sanity — normalizeClassStatus is the single authority (inconsistent blobs are archived)", () => {
  it("treats status:'archived' (active missing) AND status:'archived',active:true AND legacy active:false as archived", () => {
    expect(normalizeClassStatus({ classId: "c", status: "archived" })).toBe("archived");
    expect(normalizeClassStatus({ classId: "c", status: "archived", active: true })).toBe("archived");
    expect(normalizeClassStatus({ classId: "c", active: false })).toBe("archived");
    expect(normalizeClassStatus({ classId: "c", active: true })).toBe("active");
    expect(normalizeClassStatus({ classId: "c" })).toBe("active");
  });
});

describe("R22 A/B — create student into an INCONSISTENT archived class is rejected", () => {
  it("A: status:'archived' with active MISSING → create rejected, no account created", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", ...INCONSISTENT_ARCHIVED.statusOnly }) });
    const r = await studentHandler(stuReq("create", validStudent({ classId: "c1" })), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
  it("B: status:'archived' with active:true → create rejected, no account created", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }) });
    const r = await studentHandler(stuReq("create", validStudent({ classId: "c1" })), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
});

describe("R22 C — bulk import into an inconsistent archived class is rejected", () => {
  it("status:'archived',active:true → bulkImport rejected (400), no accounts", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }) });
    const r = await studentHandler(stuReq("bulkImport", { classId: "c1", students: [validStudent()] }), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
});

describe("R22 D — moving a student INTO an inconsistent archived class (profile update) is rejected", () => {
  it("update action targeting status:'archived',active:true → 400, student not moved", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/cLive.json": cls({ classId: "cLive", active: true }),
      "platform/classes/cArch.json": cls({ classId: "cArch", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }),
      "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "cLive", displayName: "علي حسن", firstName: "علي", familyName: "حسن", code: "123456789", identityNumber: "123456789" }
    });
    const r = await studentHandler(stuReq("update", { userId: "s1", firstName: "علي", familyName: "حسن", identityNumber: "123456789", classId: "cArch" }), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("cLive");   // not moved
  });
});

describe("R22 E — bulk MOVE into an inconsistent archived class is rejected per-row", () => {
  it("bulkAction move targeting status:'archived',active:true → failed row, student not moved", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/cLive.json": cls({ classId: "cLive", active: true, studentIds: ["s1"] }),
      "platform/classes/cArch.json": cls({ classId: "cArch", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }),
      "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "cLive", displayName: "علي", code: "123456789", identityNumber: "123456789" }
    });
    const r = await studentHandler(stuReq("bulkAction", { operation: "move", userIds: ["s1"], targetClassId: "cArch" }), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.processed).toBe(0);
    expect(r.jsonBody.failed).toBe(1);
    expect(ctx.getJson("platform/users/s1.json").classId).toBe("cLive");   // not moved into archived
  });
});

describe("R22 E2 — unarchiving a student whose class is inconsistently archived is rejected", () => {
  it("unarchive into status:'archived',active:true class → not ok, student stays archived", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/cArch.json": cls({ classId: "cArch", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }),
      "platform/users/s1.json": { userId: "s1", role: "student", active: false, archived: true, authVersion: 1, classId: "cArch", displayName: "علي", code: "123456789", identityNumber: "123456789" }
    });
    const r = await studentHandler(stuReq("unarchive", { userId: "s1" }), deps(ctx));
    expect(r.jsonBody.ok).not.toBe(true);                                   // rejected ("activate the class first")
    expect(ctx.getJson("platform/users/s1.json").archived).toBe(true);      // still archived (no restore)
  });
});

describe("R22 F/G — assignment create + publish into an inconsistent archived class are rejected", () => {
  it("F: create assignment targeting status:'archived',active:true → 400", async () => {
    const ctx = createMemoryContainer({ "platform/classes/cArch.json": cls({ classId: "cArch", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }) });
    const r = await assignmentHandler(asgReq("create", { classId: "cArch", title: "واجب", examSnapshot: { questions: [{ id: "q1", text: "س", marks: 5 }] } }), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/assignments/")).toHaveLength(0);
  });
  it("G: publishing a draft assignment whose class is inconsistently archived → 409, stays draft", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/cArch.json": cls({ classId: "cArch", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }),
      "platform/assignments/aD.json": { assignmentId: "aD", classId: "cArch", status: "draft", title: "مسودة", maxAttempts: 1, examSnapshot: { questions: [] } }
    });
    const r = await assignmentHandler(asgReq("setStatus", { assignmentId: "aD", status: "published" }), deps(ctx));
    expect(r.status).toBe(409);
    expect(ctx.getJson("platform/assignments/aD.json").status).toBe("draft");
  });
});

describe("R22 H/I/J — baselines unchanged (legacy archived, normal active, canonical archived)", () => {
  it("H: legacy { active:false } (no status) is still archived → create rejected", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", active: false }) });
    const r = await studentHandler(stuReq("create", validStudent({ classId: "c1" })), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
  it("I: a normal ACTIVE class ({active:true}) still ALLOWS create", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", active: true }) });
    const r = await studentHandler(stuReq("create", validStudent({ classId: "c1" })), deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(ctx.names("platform/users/")).toHaveLength(1);
  });
  it("I2: a normal ACTIVE class ({status:'active',active:true}) still ALLOWS create", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", status: "active", active: true }) });
    const r = await studentHandler(stuReq("create", validStudent({ classId: "c1", identityNumber: "222222222" })), deps(ctx));
    expect(r.status).toBe(200);
    expect(ctx.names("platform/users/")).toHaveLength(1);
  });
  it("J: canonical archived ({status:'archived',active:false}) → create rejected (unchanged)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": cls({ classId: "c1", status: "archived", active: false }) });
    const r = await studentHandler(stuReq("create", validStudent({ classId: "c1" })), deps(ctx));
    expect(r.status).toBe(400);
    expect(ctx.names("platform/users/")).toHaveLength(0);
  });
});

// Guard against an accidental auth-doc leak in the D-fixture setup (studentCodeHash import is used to
// prove no auth blob was touched when the archived gate rejects a move before any credential work).
describe("R22 — the archived gate rejects BEFORE any credential mutation on move (no auth write)", () => {
  it("update move into inconsistent-archived class writes no auth document", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/cLive.json": cls({ classId: "cLive", active: true }),
      "platform/classes/cArch.json": cls({ classId: "cArch", ...INCONSISTENT_ARCHIVED.statusArchivedActiveTrue }),
      "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "cLive", displayName: "علي حسن", firstName: "علي", familyName: "حسن", code: "123456789", identityNumber: "123456789" },
      ["platform/auth/" + studentCodeHash("123456789") + ".json"]: { userId: "s1", codeHash: studentCodeHash("123456789"), authVersion: 1, active: true, salt: "s", passwordHash: "h" }
    });
    const authBefore = JSON.stringify(ctx.getJson("platform/auth/" + studentCodeHash("123456789") + ".json"));
    const r = await studentHandler(stuReq("update", { userId: "s1", firstName: "علي", familyName: "حسن", identityNumber: "123456789", classId: "cArch", password: "newpass123" }), deps(ctx));
    expect(r.status).toBe(400);
    expect(JSON.stringify(ctx.getJson("platform/auth/" + studentCodeHash("123456789") + ".json"))).toBe(authBefore);
  });
});
