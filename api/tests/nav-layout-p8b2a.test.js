import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P8-B2a — the teacher's own order of the sidebar on their account (owner decision §19.31): GET answers `navLayout` (null =
// the default order); «setNavLayout» stores { order, hidden } of the arrangeable destinations only, needs appearance.layout.choose
// (enforce only, like every capability), stores the default as the field's absence, and is audited. Presentation only: no access
// module reads it (the P8-A1 static check covers the profile document). A feature (no fail-first). TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p8b2a-nav-layout-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: profile } = await import("../src/functions/teacher-profile.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { profileDocName, NAV_LAYOUT_IDS } = await import("../src/lib/teacher-profile.js");
const { AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
function setup({ mode = "enforce", denies = [] } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 2, denies, createdBy: "owner:x" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, token, deps: { getContainer: () => mem.container, container: mem.container } };
}
const hdr = ctx => ({ get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) });
const get = ctx => profile({ method: "GET", url: "https://x/api/teacher-profile", headers: hdr(ctx) }, ctx.deps);
const post = (ctx, body) => profile({ method: "POST", url: "https://x/api/teacher-profile", headers: hdr(ctx), json: async () => body }, ctx.deps);
const set = (ctx, layout) => post(ctx, { action: "setNavLayout", layout });
const stored = ctx => (ctx.mem.getJson(profileDocName(SARA)) || {}).appearance;

describe("P8-B2a — the teacher's order of the sidebar", () => {
  it("GET: the default order (null), and that it may be changed", async () => {
    const r = (await get(setup())).jsonBody;
    expect([r.navLayout, r.layoutChoosable]).toEqual([null, true]);
  });
  it("saved, read back, audited; kept beside the appearance and the «اليوم» arrangement; the default removes the field", async () => {
    const ctx = setup();
    await post(ctx, { action: "setAppearance", appearance: { palette: "ocean" } });
    await post(ctx, { action: "setDashboardLayout", layout: { order: ["messages.unread"], hidden: [] } });
    const r = await set(ctx, { order: ["messages", "assignments"], hidden: ["games"] });
    expect([r.status, r.jsonBody.navLayout]).toEqual([200, { order: ["messages", "assignments"], hidden: ["games"] }]);
    expect((await get(ctx)).jsonBody.navLayout).toEqual({ order: ["messages", "assignments"], hidden: ["games"] });
    expect(stored(ctx)).toEqual({ palette: "ocean", dashboardLayout: { order: ["messages.unread"], hidden: [] }, navLayout: { order: ["messages", "assignments"], hidden: ["games"] } });
    const back = await set(ctx, { order: [], hidden: [] });
    expect([back.status, back.jsonBody.navLayout]).toEqual([200, null]);
    expect(stored(ctx)).toEqual({ palette: "ocean", dashboardLayout: { order: ["messages.unread"], hidden: [] } });
    const ev = ctx.mem.names(AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "teacher.profile.setNavLayout");
    expect(ev.map(e => e.details)).toEqual([{ order: 2, hidden: 1 }, { order: 0, hidden: 0 }]);
  });
  it("refused: «لوحة المتابعة», an exam-bank or unknown destination, a duplicate, a non-list, nothing at all — nothing is stored", async () => {
    const ctx = setup();
    for (const bad of [{ hidden: ["dashboard"] }, { order: ["builder"] }, { order: ["audit"] }, { order: ["x"] }, { order: ["games", "games"] }, { order: "games" }, { hidden: [7] }, null, ["games"]]) {
      const r = await set(ctx, bad);
      expect([r.status, r.jsonBody.code], JSON.stringify(bad)).toEqual([400, "NAV_LAYOUT_INVALID"]);
    }
    expect(stored(ctx)).toBeUndefined();
  });
  it("needs appearance.layout.choose while enforcing (403, nothing stored); observe: allowed", async () => {
    const ctx = setup({ denies: ["appearance.layout.choose"] });
    expect((await get(ctx)).jsonBody.layoutChoosable).toBe(false);
    const r = await set(ctx, { order: ["games"] });
    expect([r.status, r.jsonBody.code, r.jsonBody.capability]).toEqual([403, "CAPABILITY_DENIED", "appearance.layout.choose"]);
    expect(stored(ctx)).toBeUndefined();
    expect((await set(setup({ mode: "observe", denies: ["appearance.layout.choose"] }), { order: ["games"] })).status).toBe(200);
  });
  it("a stored order that is not valid any more reads back as the default", async () => {
    const ctx = setup();
    ctx.mem.setJson(profileDocName(SARA), { schemaVersion: 1, teacherId: SARA, appearance: { navLayout: { order: ["builder"], hidden: [] } } });
    expect((await get(ctx)).jsonBody.navLayout).toBeNull();
  });
  it("the server's arrangeable destinations are the client's main destinations without «لوحة المتابعة» (src/shell/teacherNav.ts)", () => {
    const src = readFileSync(path.join(import.meta.dirname, "../../src/shell/teacherNav.ts"), "utf8");
    const m = src.match(/export const PRIMARY_NAV: TeacherNavId\[\] = \[([^\]]*)\]/);
    expect(m).toBeTruthy();
    const primary = [...m[1].matchAll(/"([a-z]+)"/g)].map(x => x[1]);
    expect([...NAV_LAYOUT_IDS]).toEqual(primary.filter(id => id !== "dashboard"));
  });
});
