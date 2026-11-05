import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P8-A1 — the teacher's appearance presets on their account (blueprint §9.3, owner decisions §19.27): GET answers the stored
// appearance and which parts may change; «setAppearance» stores registered values only, each part needing its capability (enforce
// only, like every capability); «default» is stored as the field's absence. Blueprint acceptance test 12: appearance grants NO
// capability — no security check reads it. A feature (no fail-first). TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p8a1-appearance-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: profile } = await import("../src/functions/teacher-profile.js");
const { handler: assignments } = await import("../src/functions/assignment-progress.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { profileDocName } = await import("../src/lib/teacher-profile.js");
const { AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
function setup({ mode = "enforce", preset = "full-teaching", version = 2, denies = [] } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: version, denies, createdBy: "owner:x" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, token, deps: { getContainer: () => mem.container, container: mem.container } };
}
const hdr = ctx => ({ get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) });
const get = ctx => profile({ method: "GET", url: "https://x/api/teacher-profile", headers: hdr(ctx) }, ctx.deps);
const set = (ctx, appearance) => profile({ method: "POST", url: "https://x/api/teacher-profile", headers: hdr(ctx), json: async () => ({ action: "setAppearance", appearance }) }, ctx.deps);
const stored = ctx => (ctx.mem.getJson(profileDocName(SARA)) || {}).appearance;

describe("P8-A1 — the teacher's appearance on their account", () => {
  it("GET: the defaults, and every part choosable (full-teaching)", async () => {
    const r = (await get(setup())).jsonBody;
    expect(r.appearance).toEqual({ theme: "light", palette: "default", density: "comfortable" });
    expect(r.appearanceChoosable).toEqual({ theme: true, palette: true, density: true });
  });

  it("saved, read back, audited; another part keeps its value; «default» removes the field", async () => {
    const ctx = setup();
    const r = await set(ctx, { palette: "ocean", density: "compact" });
    expect([r.status, r.jsonBody.appearance]).toEqual([200, { theme: "light", palette: "ocean", density: "compact" }]);
    expect((await set(ctx, { theme: "dark" })).jsonBody.appearance).toEqual({ theme: "dark", palette: "ocean", density: "compact" });
    expect((await get(ctx)).jsonBody.appearance).toEqual({ theme: "dark", palette: "ocean", density: "compact" });
    await set(ctx, { palette: "default", density: "comfortable", theme: "light" });
    expect(stored(ctx)).toEqual({});
    const ev = ctx.mem.names(AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.action === "teacher.profile.setAppearance");
    expect(ev.map(e => e.details)).toEqual([{ palette: "ocean", density: "compact" }, { theme: "dark" }, { palette: "default", density: "comfortable", theme: "light" }]);
  });

  it("the arrangement of the «اليوم» cards (P7-A2) is kept beside the appearance", async () => {
    const ctx = setup();
    await profile({ method: "POST", url: "https://x/api/teacher-profile", headers: hdr(ctx), json: async () => ({ action: "setDashboardLayout", layout: { order: ["messages.unread"], hidden: [] } }) }, ctx.deps);
    await set(ctx, { palette: "forest" });
    expect(stored(ctx)).toEqual({ dashboardLayout: { order: ["messages.unread"], hidden: [] }, palette: "forest" });
  });

  it("refused: an unknown part, an unknown value, a non-string, nothing at all — and nothing is stored", async () => {
    const ctx = setup();
    for (const bad of [{ font: "big" }, { palette: "neon" }, { density: 2 }, {}, null, ["ocean"]]) {
      const r = await set(ctx, bad);
      expect([r.status, r.jsonBody.code]).toEqual([400, "APPEARANCE_INVALID"]);
    }
    expect(stored(ctx)).toBeUndefined();
  });

  it("each part needs its capability while enforcing (a palette denied → 403, nothing stored; the others still work)", async () => {
    const ctx = setup({ denies: ["appearance.palette.choose"] });
    expect((await get(ctx)).jsonBody.appearanceChoosable).toEqual({ theme: true, palette: false, density: true });
    const r = await set(ctx, { palette: "sand", density: "compact" });
    expect([r.status, r.jsonBody.code, r.jsonBody.capability]).toEqual([403, "CAPABILITY_DENIED", "appearance.palette.choose"]);
    expect(stored(ctx)).toBeUndefined();
    expect((await set(ctx, { density: "compact" })).status).toBe(200);
    const observe = setup({ mode: "observe", denies: ["appearance.palette.choose"] });
    expect((await set(observe, { palette: "sand" })).status).toBe(200);
  });

  it("a stored value that is not registered reads back as that part's default", async () => {
    const ctx = setup();
    ctx.mem.setJson(profileDocName(SARA), { schemaVersion: 1, teacherId: SARA, appearance: { palette: "neon", density: "compact", theme: 7 } });
    expect((await get(ctx)).jsonBody.appearance).toEqual({ theme: "light", palette: "default", density: "compact" });
  });
});

describe("P8-A1 — acceptance test 12: appearance grants no capability", () => {
  it("a learning-only teacher with every appearance stored is still refused an assignments route", async () => {
    const ctx = setup({ preset: "learning-only", version: 1 });
    ctx.mem.setJson(profileDocName(SARA), { schemaVersion: 1, teacherId: SARA, appearance: { theme: "dark", palette: "ocean", density: "compact", capabilities: ["assignments.assignment.view"], role: "owner" } });
    const r = await assignments({ method: "GET", url: "https://x/api/assignment-progress?assignmentId=a1", headers: hdr(ctx) }, ctx.deps);
    expect([r.status, r.jsonBody.code]).toEqual([403, "CAPABILITY_DENIED"]);
  });
  it("no access / identity module reads the teacher profile document or its appearance", () => {
    const LIB = path.join(import.meta.dirname, "../src/lib");
    const files = [...readdirSync(path.join(LIB, "access")).map(f => path.join(LIB, "access", f)), path.join(LIB, "teacher-session.js"), path.join(LIB, "teacher-tenancy.js")];
    for (const f of files.filter(f => f.endsWith(".js"))) {
      const src = readFileSync(f, "utf8");
      expect(src, path.basename(f)).not.toMatch(/require\([^)]*teacher-profile|profileDocName|teacher-profiles\//);   // (route-capabilities only NAMES the exempt route)
      // P8-A2: the access modules now read the OWNER's restriction `resources.appearance` of the revision (what may be chosen). The
      // teacher's CHOICE lives only in the profile document, which the line above keeps out of every access / identity module.
    }
  });
});
