import { describe, it, expect, afterEach } from "vitest";
import { parseBuilderUsers, listBuilderAccounts, getBuilderAccount } from "../src/lib/builder-users.js";
import { validateBuilderCredentials, builderAuthConfigurationStatus } from "../src/lib/builder-auth.js";

// Tadris+ O17 (security review docs/enterprise-security-review-p9b3.md; approved design docs/enterprise-info-items-o15-o17.md):
// a teacher's tenant is the token subject, both for a BUILDER_USERS account (multi-user) and for a managed account. Managed ids
// have reserved forms — "t_" + 16 hex (console accounts) and "t_legacy" (the imported shared-password workspace) — and a
// BUILDER_USERS account with one of them would share that managed account's tenant and data. Such an account is now SKIPPED on
// its own (the others keep working; a configuration left with no account fails closed as today). TEST data only.
const SAVED = { ...process.env };
afterEach(() => { process.env = { ...SAVED }; });
const configure = users => {
  process.env.BUILDER_USERS = JSON.stringify({ users: Object.fromEntries(Object.entries(users).map(([id, env]) => [id, { passwordEnv: env, displayName: "معلم " + id }])) });
  for (const env of Object.values(users)) process.env[env] = "pw-" + env;
};

describe("O17 — a BUILDER_USERS account with a managed id form is skipped, alone", () => {
  it("fail-first: t_legacy and t_<16 hex> are not accounts; the ordinary one still is (baseline: all three)", () => {
    configure({ "teacher-1": "PW_T1", t_legacy: "PW_LEG", t_00112233445566aa: "PW_HEX" });
    const cfg = parseBuilderUsers(process.env);
    expect(cfg.kind).toBe("configured");
    expect(Object.keys(cfg.users)).toEqual(["teacher-1"]);
    expect(cfg.reservedSkipped).toBe(2);
    expect(listBuilderAccounts(process.env).map(a => a.actorId)).toEqual(["teacher-1"]);
    expect(getBuilderAccount(process.env, "t_legacy")).toBeNull();
    expect(getBuilderAccount(process.env, "t_00112233445566aa")).toBeNull();
  });

  it("the skipped accounts cannot sign in; the others sign in exactly as before", () => {
    configure({ "teacher-1": "PW_T1", t_legacy: "PW_LEG", t_00112233445566aa: "PW_HEX" });
    expect(validateBuilderCredentials("t_legacy", "pw-PW_LEG")).toBe(false);
    expect(validateBuilderCredentials("t_00112233445566aa", "pw-PW_HEX")).toBe(false);
    expect(validateBuilderCredentials("teacher-1", "pw-PW_T1")).toBe(true);
    expect(validateBuilderCredentials("teacher-1", "wrong")).toBe(false);
  });

  it("the configuration status says how many were skipped (a count, never a name)", () => {
    configure({ "teacher-1": "PW_T1", t_legacy: "PW_LEG" });
    const status = builderAuthConfigurationStatus(process.env);
    expect(status).toEqual({ mode: "multi-user", broken: false, reservedSkipped: 1 });
    expect(JSON.stringify(status)).not.toContain("t_legacy");
    configure({ "teacher-1": "PW_T1" });
    expect(builderAuthConfigurationStatus(process.env)).toEqual({ mode: "multi-user", broken: false });   // unchanged without one
  });

  it("a configuration whose every account is reserved has no account left: it fails closed, as an empty one does today", () => {
    configure({ t_legacy: "PW_LEG", t_ffffffffffffffff: "PW_HEX" });
    expect(parseBuilderUsers(process.env)).toEqual({ kind: "configuration-error", reason: "no accounts" });
    expect(validateBuilderCredentials("t_legacy", "pw-PW_LEG")).toBe(false);
  });

  it("ids that only look alike stay ordinary accounts", () => {
    configure({ t_0011: "PW_A", t_00112233445566AA: "PW_B", "t_00112233445566aab": "PW_C", t_legacy2: "PW_D", "teacher-1": "PW_E" });
    const cfg = parseBuilderUsers(process.env);
    expect(Object.keys(cfg.users).sort()).toEqual(["t_0011", "t_00112233445566AA", "t_00112233445566aab", "t_legacy2", "teacher-1"].sort());
    expect(cfg.reservedSkipped).toBeUndefined();
  });
});
