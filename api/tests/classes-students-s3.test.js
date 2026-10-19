import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { handler } from "../src/functions/manage-students.js";
import { verifyPassword } from "../src/lib/student-auth.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase S.3 — an import that can be retried safely. The teacher's browser sends ONE unguessable key with every attempt to
// import one previewed file. When the response of an attempt is lost, a retry with that key recovers the accounts the lost
// attempt created (a NEW password, the old one never reached anyone) instead of reporting them as duplicates; it never
// creates a second account, and it never touches an account it did not create, one already used, archived, moved, or old.
// Driven through the REAL handler over the in-memory container (real ETag / conditional-write semantics).

const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const audits = [];
const deps = ctx => ({ ...AUTH, container: ctx.container, recordAuditEvent: async (_c, e) => { audits.push(e); } });
const post = (ctx, action, body) => handler({ method: "POST", url: "https://x/api/students", json: async () => ({ action, ...body }) }, deps(ctx));
const get = (ctx, query) => handler({ method: "GET", url: "https://x/api/students?" + query, query: new URLSearchParams(query) }, deps(ctx));
const codeHash = code => crypto.createHash("sha256").update(String(code).normalize("NFKC").trim().toUpperCase()).digest("hex");
const authOf = (ctx, identity) => ctx.getJson("platform/auth/" + codeHash(identity) + ".json");
const userOf = (ctx, identity) => ctx.getJson("platform/users/" + authOf(ctx, identity).userId + ".json");
const logsIn = (ctx, identity, password) => { const a = authOf(ctx, identity); return verifyPassword(password, a.salt, a.passwordHash); };
const users = ctx => ctx.names("platform/users/").length;

const KEY = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const ROWS = [{ firstName: "ريم", familyName: "صالح", identityNumber: "555555555" }, { firstName: "زيد", familyName: "علي", identityNumber: "666666666" }];
let ctx;
beforeEach(() => {
  audits.length = 0;
  ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "الحادي عشر", active: true, status: "active", studentIds: [] },
    "platform/classes/c2.json": { classId: "c2", name: "العاشر", active: true, status: "active", studentIds: [] }
  });
});

describe("S.3 — a retry of the SAME import after a lost response", () => {
  it("recovers every account the lost attempt created: no second account, a NEW password that logs in, the old one no longer does", async () => {
    const lost = await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });        // response never reached the teacher
    expect(lost.jsonBody.imported).toBe(2);
    const oldPassword = lost.jsonBody.credentials[0].password;
    expect(users(ctx)).toBe(2);

    const retry = await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    expect(retry.status).toBe(200);
    expect(retry.jsonBody).toMatchObject({ ok: true, imported: 2, failed: 0, duplicates: 0, recovered: 2, errors: [] });
    expect(users(ctx)).toBe(2);                                                                          // no duplicate account
    const [a, b] = retry.jsonBody.credentials;
    expect(a).toMatchObject({ firstName: "ريم", familyName: "صالح", identityNumber: "555555555", recovered: true });
    expect(b).toMatchObject({ identityNumber: "666666666", recovered: true });
    expect(a.userId).toBe(lost.jsonBody.credentials[0].userId);                                          // the SAME account
    expect(logsIn(ctx, "555555555", a.password)).toBe(true);
    expect(logsIn(ctx, "555555555", oldPassword)).toBe(false);
    expect(userOf(ctx, "555555555").authVersion).toBe(2);                                                // sessions revoked like any reset
    expect(ctx.getJson("platform/classes/c1.json").studentIds.sort()).toEqual([a.userId, b.userId].sort()); // roster index: once each
    expect(audits.filter(e => e.action === "student.bulkImport").map(e => e.details)).toEqual([
      { classId: "c1", createdCount: 2, recoveredCount: 0, duplicateCount: 0, failedCount: 0 },
      { classId: "c1", createdCount: 0, recoveredCount: 2, duplicateCount: 0, failedCount: 0 }
    ]);
  });

  it("a retry that also holds rows the lost attempt never reached creates those and recovers the others", async () => {
    await post(ctx, "bulkImport", { classId: "c1", students: ROWS.slice(0, 1), importId: KEY });         // the attempt died after row 1
    const retry = await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    expect(retry.jsonBody).toMatchObject({ imported: 2, recovered: 1, failed: 0 });
    expect(retry.jsonBody.credentials.map(c => [c.identityNumber, c.recovered === true])).toEqual([["555555555", true], ["666666666", false]]);
    expect(users(ctx)).toBe(2);
  });

  it("an attempt that died after creating the accounts but BEFORE its roster-index write: the retry adds them to the index", async () => {
    const lost = await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    ctx.setJson("platform/classes/c1.json", { ...ctx.getJson("platform/classes/c1.json"), studentIds: [] });   // the index write never happened
    await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    expect(ctx.getJson("platform/classes/c1.json").studentIds.sort()).toEqual(lost.jsonBody.credentials.map(c => c.userId).sort());
  });

  it("the key is stored on the accounts it created, and never returned by a roster read", async () => {
    await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    expect(userOf(ctx, "555555555").importId).toBe(KEY);
    const roster = await get(ctx, "classId=c1");
    expect(roster.jsonBody.students).toHaveLength(2);
    expect(JSON.stringify(roster.jsonBody)).not.toContain(KEY);
  });
});

describe("S.3 — everything else is still a duplicate (pins of the existing rule)", () => {
  const dupOnly = r => { expect(r.jsonBody).toMatchObject({ imported: 0, failed: 2, duplicates: 2 }); expect(r.jsonBody.credentials).toEqual([]); };
  it("no key, or another key", async () => {
    const first = await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    const pw = first.jsonBody.credentials[0].password;
    dupOnly(await post(ctx, "bulkImport", { classId: "c1", students: ROWS }));
    dupOnly(await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: "2c5ea4c0-4067-11e9-8bad-9b1deb4d3b7d" }));
    expect(logsIn(ctx, "555555555", pw)).toBe(true);                                                     // password untouched
  });
  it("an account already used (logged in), archived, in another class, or created more than a day ago", async () => {
    const first = await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    const pw = first.jsonBody.credentials[0].password;
    const edit = (identity, patch) => { const u = userOf(ctx, identity); ctx.setJson("platform/users/" + u.userId + ".json", { ...u, ...patch }); };
    edit("555555555", { lastLoginAt: "2026-10-19T08:00:00.000Z" });
    edit("666666666", { archived: true, active: false });
    dupOnly(await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY }));
    edit("555555555", { lastLoginAt: "", classId: "c2" });
    edit("666666666", { archived: false, active: true, createdAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    dupOnly(await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY }));
    expect(logsIn(ctx, "555555555", pw)).toBe(true);
  });
  it("the same key against another class never recovers into it", async () => {
    await post(ctx, "bulkImport", { classId: "c1", students: ROWS, importId: KEY });
    dupOnly(await post(ctx, "bulkImport", { classId: "c2", students: ROWS, importId: KEY }));
  });
  it("an account created one by one (no import key) is never recovered by a key", async () => {
    const created = await post(ctx, "create", { classId: "c1", ...ROWS[0] });
    const r = await post(ctx, "bulkImport", { classId: "c1", students: ROWS.slice(0, 1), importId: KEY });
    expect(r.jsonBody).toMatchObject({ imported: 0, duplicates: 1 });
    expect(logsIn(ctx, "555555555", created.jsonBody.temporaryPassword)).toBe(true);
  });
  it("a malformed key is ignored (never stored, never used)", async () => {
    for (const bad of ["short", "../../platform/x", "a".repeat(65), 1234567890123456]) {
      ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "ص", active: true, status: "active", studentIds: [] } });
      await post(ctx, "bulkImport", { classId: "c1", students: ROWS.slice(0, 1), importId: bad });
      expect(userOf(ctx, "555555555").importId).toBeUndefined();
      const again = await post(ctx, "bulkImport", { classId: "c1", students: ROWS.slice(0, 1), importId: bad });
      expect(again.jsonBody).toMatchObject({ imported: 0, duplicates: 1 });
    }
  });
});
