// HOTFIX regression — the successful TEACHER branch of /api/platform-login runs against the REAL handler, REAL
// builder-credential validation (env-configured), a REAL memory container and the REAL teacher display-name
// resolver. PR #119 called `resolveTeacherDisplayName` in this branch without requiring it, so every valid
// teacher login threw a ReferenceError after the credentials were accepted and surfaced as
// 500 «تعذر تسجيل الدخول حاليًا.» — no earlier test exercised this branch without stubbing the credential check.
// Nothing about the display-name resolver is mocked here: that is the point of the test.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

process.env.BANK_SETUP_KEY = process.env.BANK_SETUP_KEY || "hotfix-test-secret";
process.env.BUILDER_USER_CODE = "ADMIN";
process.env.BUILDER_PASSWORD = "correct-pw";
delete process.env.TEACHER_DISPLAY_NAME;

const { handler: loginHandler } = await import("../src/functions/platform-login.js");
const { verifyBuilderToken } = await import("../src/lib/builder-auth.js");
const { profileDocName, DEFAULT_DISPLAY_NAME } = await import("../src/lib/teacher-profile.js");
const { createMemoryContainer } = await import("./fixtures/memory-container.js");

/** Real handler + real storage helpers; only the throttle is a pass-through (its semantics are covered by R8). */
const deps = ctx => ({
  getContainer: () => ctx.container,
  container: ctx.container,
  clientIdFromRequest: () => "ip-hotfix",
  reserveLoginAttempt: async () => ({ allowed: true }),
  clearLoginThrottle: async () => {},
});
const login = (ctx, body) => loginHandler({ json: async () => body, headers: { get: () => null } }, deps(ctx));

describe("hotfix — teacher login resolves the display name through the real, imported resolver", () => {
  let savedCode, savedPw;
  beforeAll(() => { savedCode = process.env.BUILDER_USER_CODE; savedPw = process.env.BUILDER_PASSWORD; });
  afterAll(() => { process.env.BUILDER_USER_CODE = savedCode; process.env.BUILDER_PASSWORD = savedPw; });

  it("A. valid teacher credentials, NO profile document → 200, role teacher, a verifiable token, the canonical fallback name — never a 500", async () => {
    const ctx = createMemoryContainer({});
    const r = await login(ctx, { userCode: "ADMIN", password: "correct-pw" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.role).toBe("teacher");
    expect(r.jsonBody.userCode).toBe("ADMIN");
    expect(r.jsonBody.displayName).toBe(DEFAULT_DISPLAY_NAME);                       // «المعلم»
    expect(r.jsonBody.expiresInSeconds).toBeGreaterThan(0);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const payload = verifyBuilderToken(r.jsonBody.token);
    expect(payload).toBeTruthy(); expect(payload.role).toBe("teacher"); expect(payload.sub).toBe("ADMIN");
    expect(JSON.stringify(r.jsonBody)).not.toContain("تعذر تسجيل الدخول");
  });

  it("B. valid teacher credentials WITH a saved profile name → the login response carries that name (real document read)", async () => {
    const ctx = createMemoryContainer({ [profileDocName("ADMIN")]: { schemaVersion: 1, teacherId: "ADMIN", displayName: "أ. سامر", avatarId: "a3", updatedAt: "2026-09-19T00:00:00.000Z" } });
    const r = await login(ctx, { userCode: "ADMIN", password: "correct-pw" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.role).toBe("teacher");
    expect(r.jsonBody.displayName).toBe("أ. سامر");
  });

  it("invalid teacher credentials still fail with the generic 401 (wrong password, wrong user code)", async () => {
    const ctx = createMemoryContainer({});
    const wrongPw = await login(ctx, { userCode: "ADMIN", password: "nope" });
    expect(wrongPw.status).toBe(401); expect(wrongPw.jsonBody.error).toBe("بيانات الدخول غير صحيحة.");
    const wrongCode = await login(ctx, { userCode: "OTHER", password: "correct-pw" });
    expect(wrongCode.status).toBe(401);
    expect(ctx.names("platform/")).toEqual([]);                                      // nothing written on failure
  });

  it("source guard: platform-login requires the canonical resolver from ../lib/teacher-profile (no local duplicate)", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/functions/platform-login.js", import.meta.url)), "utf8");
    expect(src).toMatch(/const \{ resolveTeacherDisplayName \} = require\("\.\.\/lib\/teacher-profile"\);/);
    expect(src).not.toMatch(/function resolveTeacherDisplayName/);
    expect((src.match(/resolveTeacherDisplayName/g) || []).length).toBeGreaterThanOrEqual(2);   // required AND used
  });
});
