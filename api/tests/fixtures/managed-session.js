// Tadris+ P10-A — a managed teacher session for tests, issued EXACTLY as the platform issues one: the v3 token is minted and its
// session recorded in the teacher's account document with the production function (`withTeacherSession`, the same call
// platform-login and owner-handoff make). There is no bypass: a token minted without this record is refused, as in production.
// The account document must already exist in `mem` (the in-memory container of the API tests).
import { createRequire } from "node:module";
const cjs = createRequire(import.meta.url);
const { createManagedTeacherToken } = cjs("../../src/lib/identity/teacher-token.js");
const { teacherAccountName, withTeacherSession } = cjs("../../src/lib/identity/teacher-accounts.js");

/** Same arguments and result as createManagedTeacherToken, plus the container whose account document receives the session. */
export function recordedManagedToken(mem, claim, { nowMs = Date.now(), via = "login" } = {}) {
  const issued = createManagedTeacherToken(claim, { nowMs });
  const name = teacherAccountName(claim.accountId);
  const account = mem.getJson(name);
  if (!account) throw new Error("recordedManagedToken: create the teacher account " + claim.accountId + " before its session");
  mem.setJson(name, withTeacherSession(account, { sid: claim.sid, expiresAtMs: issued.payload.exp * 1000, nowMs, via }));
  return issued;
}
