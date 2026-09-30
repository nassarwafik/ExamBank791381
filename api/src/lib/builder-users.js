// Phase 14B Part A — minimal SERVER-owned multi-teacher account configuration (BUILDER_USERS).
//
//   BUILDER_USERS='{"users":{"teacher-author":{"passwordEnv":"BUILDER_PASSWORD_AUTHOR","displayName":"Author Name"}, …}}'
//
// The variable holds account METADATA only: an account id (the future token subject), the NAME of a server environment
// variable that holds that account's password, and an optional display name. No plaintext password is ever accepted inside
// BUILDER_USERS (a `password` key is a configuration error), `passwordEnv` must match a strict environment-variable-name
// allow-list, may not name a reserved platform secret (the shared builder password, the signing secrets, the storage
// connection string, this variable itself), and no two accounts may share one secret — otherwise possession of one
// password would let a person claim another account. Nothing here reads a request: the client can never supply
// passwordEnv, an environment-variable name, capabilities, a role or account metadata.
//
// Modes:  absent / empty variable → "legacy" (the single-teacher login is unchanged, byte for byte);
//         valid non-empty         → "configured" (multi-user; NO fallback to BUILDER_PASSWORD / BANK_SETUP_KEY / BUILDER_USER_CODE);
//         malformed non-empty     → "configuration-error" (fails CLOSED: nobody can log in until an operator fixes it).
const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const RESERVED_ENV = Object.freeze(["BUILDER_USERS", "BUILDER_PASSWORD", "BUILDER_USER_CODE", "BANK_SETUP_KEY", "BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_SESSION_VERSION", "AZURE_STORAGE_CONNECTION_STRING", "GOVERNANCE_CAPABILITIES", "TEACHER_DISPLAY_NAME"]);
const MAX_ACCOUNTS = 200;
const MAX_DISPLAY_NAME = 60;

function isAccountId(value) { return typeof value === "string" && ACCOUNT_ID.test(value) && !value.includes(".."); }
function isAllowedPasswordEnv(name) { return typeof name === "string" && ENV_NAME.test(name) && !RESERVED_ENV.includes(name); }
function normalizeDisplayName(value) {
  if (value === undefined || value === null) return "";
  const name = String(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return name.length > MAX_DISPLAY_NAME ? name.slice(0, MAX_DISPLAY_NAME) : name;
}

/** Parses BUILDER_USERS. The `reason` of a configuration error is SAFE to log (structure only, never a value). */
function parseBuilderUsers(env = process.env) {
  const raw = env && env.BUILDER_USERS;
  if (raw === undefined || raw === null || !String(raw).trim()) return { kind: "legacy" };
  const error = reason => ({ kind: "configuration-error", reason });
  let parsed;
  try { parsed = JSON.parse(String(raw)); } catch { return error("not valid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("not an object");
  const users = parsed.users;
  if (!users || typeof users !== "object" || Array.isArray(users)) return error("users missing");
  const ids = Object.keys(users);
  if (!ids.length) return error("no accounts");
  if (ids.length > MAX_ACCOUNTS) return error("too many accounts");
  const out = {};
  const seenEnv = new Set();
  for (const id of ids) {
    const acct = users[id];
    if (!isAccountId(id)) return error("invalid account id");
    if (!acct || typeof acct !== "object" || Array.isArray(acct)) return error("invalid account record");
    if ("password" in acct || "passwordHash" in acct || "secret" in acct) return error("plaintext credential inside BUILDER_USERS");
    if (!isAllowedPasswordEnv(acct.passwordEnv)) return error("passwordEnv not allowed");
    if (seenEnv.has(acct.passwordEnv)) return error("two accounts share one secret");
    seenEnv.add(acct.passwordEnv);
    out[id] = Object.freeze({ actorId: id, passwordEnv: acct.passwordEnv, displayName: normalizeDisplayName(acct.displayName) });
  }
  return { kind: "configured", users: Object.freeze(out) };
}

function isMultiUserMode(env = process.env) { return parseBuilderUsers(env).kind === "configured"; }
function isBuilderUsersConfigurationBroken(env = process.env) { return parseBuilderUsers(env).kind === "configuration-error"; }

/** Public account metadata (id + display name) — never passwordEnv, never a secret value. Empty outside multi-user mode. */
function listBuilderAccounts(env = process.env) {
  const cfg = parseBuilderUsers(env);
  if (cfg.kind !== "configured") return [];
  return Object.values(cfg.users).map(u => ({ actorId: u.actorId, displayName: u.displayName || u.actorId }));
}
function getBuilderAccount(env, actorId) {
  const cfg = parseBuilderUsers(env);
  if (cfg.kind !== "configured" || !isAccountId(actorId) || !Object.prototype.hasOwnProperty.call(cfg.users, actorId)) return null;
  const u = cfg.users[actorId];
  return { actorId: u.actorId, displayName: u.displayName || u.actorId };
}
/** The configured account's server secret (INTERNAL to the credential validator; never leaves the auth module). */
function configuredPasswordFor(env, actorId) {
  const cfg = parseBuilderUsers(env);
  if (cfg.kind !== "configured" || !isAccountId(actorId) || !Object.prototype.hasOwnProperty.call(cfg.users, actorId)) return null;
  const value = env[cfg.users[actorId].passwordEnv];
  return typeof value === "string" && value.length > 0 ? value : null;
}

module.exports = { RESERVED_ENV, parseBuilderUsers, isMultiUserMode, isBuilderUsersConfigurationBroken, listBuilderAccounts, getBuilderAccount, configuredPasswordFor, isAccountId, isAllowedPasswordEnv };
