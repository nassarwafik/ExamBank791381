import { describe, it, expect, beforeEach } from "vitest";
import { handler } from "../src/functions/manage-students.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #21 — Atomic Classroom Membership & Bulk Import Concurrency Hardening.
//
// bulkImport now adds the successfully-created students to the classroom roster through the canonical
// retry-safe membership authority (mutateClassroomStudentIds → mutateJsonWithRetry + conditional ETag
// write) instead of a stale whole-blob saveClassroom overwrite. These tests drive the REAL handler +
// REAL platform-storage over the in-memory container, and use the fixture's beforeConditionalUpload hook
// to inject a genuine concurrent writer during the classroom compare-and-set, proving the old
// lost-update can no longer happen.

const CLASS = "platform/classes/c1.json";
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
function deps(ctx, extra = {}) { return { ...AUTH_OK, container: ctx.container, recordAuditEvent: async () => {}, ...extra }; }
function req(action, body) { return { method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) }; }
const row = (over = {}) => ({ firstName: "علي", familyName: "حسن", identityNumber: "123456789", ...over });
function activeClass(studentIds = [], extra = {}) { return { "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, studentIds, ...extra } }; }
const studentIdsOf = ctx => (ctx.getJson(CLASS).studentIds || []);
const createdUserIds = res => (res.jsonBody.credentials || []).map(c => c.userId);

describe("R21 concurrent ADDITION — no lost update", () => {
  it("class [A] + import(B,C) + concurrent add(D) during the membership CAS => final {A,B,C,D}", async () => {
    let fired = false;
    const ctx = createMemoryContainer(activeClass(["uA"]), {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLASS) return;
        fired = true;                                   // one-shot: simulate D landing between our read and write
        const cls = api.getJson(name); cls.studentIds.push("uD"); api.setJson(name, cls);
      }
    });
    const res = await handler(req("bulkImport", { classId: "c1", students: [row({ identityNumber: "111111111", firstName: "B" }), row({ identityNumber: "222222222", firstName: "C" })] }), deps(ctx));
    expect(res.jsonBody.imported).toBe(2);
    expect(res.jsonBody.rosterSynced).toBe(true);
    const [uB, uC] = createdUserIds(res);
    const ids = studentIdsOf(ctx);
    for (const id of ["uA", "uD", uB, uC]) expect(ids).toContain(id);   // nothing lost — D preserved, B,C added
    expect(ids.length).toBe(4);
  });
});

describe("R21 concurrent REMOVAL — bulk import never resurrects a removed student", () => {
  it("class [A,X] + import(B) + concurrent remove(X) during the CAS => final {A,B}, X gone", async () => {
    let fired = false;
    const ctx = createMemoryContainer(activeClass(["uA", "uX"]), {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLASS) return;
        fired = true;
        const cls = api.getJson(name); cls.studentIds = cls.studentIds.filter(id => id !== "uX"); api.setJson(name, cls);
      }
    });
    const res = await handler(req("bulkImport", { classId: "c1", students: [row({ identityNumber: "111111111", firstName: "B" })] }), deps(ctx));
    expect(res.jsonBody.imported).toBe(1);
    const [uB] = createdUserIds(res);
    const ids = studentIdsOf(ctx);
    expect(ids).toContain("uA");
    expect(ids).toContain(uB);
    expect(ids).not.toContain("uX");                     // the authoritative concurrent removal is preserved
  });
});

describe("R21 forced ETag conflict — retry succeeds without duplication", () => {
  it("a single CAS conflict is resolved by retry; the imported id appears exactly once", async () => {
    let fired = false;
    const ctx = createMemoryContainer(activeClass(["uA"]), {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLASS) return;
        fired = true;
        const cls = api.getJson(name); api.setJson(name, cls);   // touch → bump etag → force ONE 412
      }
    });
    const res = await handler(req("bulkImport", { classId: "c1", students: [row({ identityNumber: "111111111", firstName: "B" })] }), deps(ctx));
    expect(res.jsonBody.imported).toBe(1);
    expect(res.jsonBody.rosterSynced).toBe(true);
    const [uB] = createdUserIds(res);
    const ids = studentIdsOf(ctx);
    expect(ids.filter(id => id === uB).length).toBe(1);  // no duplication under retry
    expect(ids.length).toBe(2);
  });
});

describe("R21 repeat import — deduplicated membership, existing data untouched", () => {
  it("a second identical import adds no new member and never resets the existing student", async () => {
    const ctx = createMemoryContainer(activeClass([]));
    const first = await handler(req("bulkImport", { classId: "c1", students: [row()] }), deps(ctx));
    const [uB] = createdUserIds(first);
    const authName = ctx.names("platform/auth/")[0];
    const authBefore = JSON.stringify(ctx.getJson(authName));
    const membershipBefore = studentIdsOf(ctx);
    expect(membershipBefore).toEqual([uB]);

    const second = await handler(req("bulkImport", { classId: "c1", students: [row({ firstName: "مختلف" })] }), deps(ctx));   // same identity
    expect(second.jsonBody.imported).toBe(0);
    expect(second.jsonBody.duplicates).toBe(1);
    expect(studentIdsOf(ctx)).toEqual([uB]);                       // still deduped, unchanged
    expect(JSON.stringify(ctx.getJson(authName))).toBe(authBefore);// credentials/auth untouched
  });
});

describe("R21 unrelated classroom fields — never overwritten by bulk import", () => {
  it("a concurrent rename during the membership CAS survives; bulk import only appends studentIds", async () => {
    let fired = false;
    const ctx = createMemoryContainer(activeClass(["uA"], { name: "الاسم الأصلي", grade: "11" }), {
      beforeConditionalUpload: (name, api) => {
        if (fired || name !== CLASS) return;
        fired = true;
        const cls = api.getJson(name); cls.name = "اسم مُحدّث بالتزامن"; api.setJson(name, cls);
      }
    });
    const res = await handler(req("bulkImport", { classId: "c1", students: [row({ identityNumber: "111111111", firstName: "B" })] }), deps(ctx));
    const [uB] = createdUserIds(res);
    const cls = ctx.getJson(CLASS);
    expect(cls.name).toBe("اسم مُحدّث بالتزامن");   // concurrent field change preserved (not reverted)
    expect(cls.grade).toBe("11");                    // unrelated field intact
    expect(cls.studentIds).toContain(uB);
    expect(cls.studentIds).toContain("uA");
  });
});

describe("R21 retry EXHAUSTION — bounded recovery keeps authoritative membership + credentials", () => {
  it("persistent CAS conflicts => rosterSynced:false, but users created (authoritative classId), credentials returned, no duplicate users", async () => {
    const ctx = createMemoryContainer(activeClass(["uA"]), {
      beforeConditionalUpload: (name, api) => {
        if (name !== CLASS) return;                    // NEVER self-disables → every attempt conflicts
        const cls = api.getJson(name); api.setJson(name, cls);
      }
    });
    const res = await handler(req("bulkImport", { classId: "c1", students: [row()] }), deps(ctx));
    expect(res.status).toBe(200);
    expect(res.jsonBody.imported).toBe(1);             // the student WAS created
    expect(res.jsonBody.rosterSynced).toBe(false);     // error surfaced, not swallowed
    expect(res.jsonBody.credentials).toHaveLength(1);  // one-time credentials not lost
    const [uB] = createdUserIds(res);
    const user = ctx.getJson("platform/users/" + uB + ".json");
    expect(user.classId).toBe("c1");                   // authoritative membership is coherent
    expect(ctx.names("platform/users/")).toHaveLength(1); // no duplicate user documents
  });
});
