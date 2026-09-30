// Phase 14A §20–§22 — server-owned governance capabilities. Phase 14B Part B — the ASSIGNED workflow mode.
//
// Capabilities are resolved from the AUTHENTICATED server identity (builder-auth payload: role "teacher" + sub) and
// server-owned configuration only. Nothing in a request body ({ role: "approver" }, { capabilities: [...] }) is ever read.
//
// Current deployment (documented honestly): there is ONE authenticated teacher/builder account model and no institutional
// Reviewer / Approver directory yet (Phase 14B). Therefore, when GOVERNANCE_CAPABILITIES is not configured, every
// authenticated teacher holds all four capabilities ("default-single-teacher"). An operator may configure
//   GOVERNANCE_CAPABILITIES='{"default":["author"],"users":{"<sub>":["review","approve","publish"]}}'
// to give distinct subjects distinct capabilities; unknown capability names are dropped, a subject absent from `users`
// receives `default` (or nothing). Review Fix 1: a NON-EMPTY malformed value is a `configuration-error` — it grants NOTHING
// (zero capabilities for everyone) until the operator fixes it; only an ABSENT / empty variable means the baseline. Reads
// stay available (the UI shows the administrator-facing source), mutations are refused by the API (GOVERNANCE_CONFIG_INVALID).
//
// 14B — the SAME configuration grammar gains `"mode": "assigned"`:
//   GOVERNANCE_CAPABILITIES='{"mode":"assigned","default":["author"],"users":{"teacher-reviewer":["review"], …}}'
// Assigned mode turns the lifecycle into the four-person workflow (Author → Reviewer → Approver → Publisher, strict
// separation of duties, per-cycle assignments). It is allowed ONLY when teacher identities are server-owned (a valid
// BUILDER_USERS) and every explicitly assigned governance actor exists in that account directory; otherwise the identity
// configuration is invalid (GOVERNANCE_IDENTITY_CONFIG_INVALID) and every mutation is refused — Assigned mode is never
// downgraded into single-teacher behaviour. Configurations without `mode: "assigned"` keep the exact 14A semantics.
const { parseBuilderUsers } = require("./builder-users");

const GOVERNANCE_CAPABILITIES = Object.freeze(["author", "review", "approve", "publish"]);
const WORKFLOW_MODES = Object.freeze(["single", "assigned"]);

function sanitizeList(list) {
  if (!Array.isArray(list)) return null;
  return GOVERNANCE_CAPABILITIES.filter(c => list.includes(c));
}

function parseCapabilityConfig(env) {
  const raw = env && env.GOVERNANCE_CAPABILITIES;
  if (raw === undefined || raw === null || !String(raw).trim()) return { kind: "default-single-teacher", malformed: false, mode: "single" };
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    let mode = "single";
    if (parsed.mode !== undefined) {
      if (parsed.mode !== "assigned" && parsed.mode !== "single") throw new Error("unknown mode");
      mode = parsed.mode;
    }
    const users = {};
    if (parsed.users && typeof parsed.users === "object" && !Array.isArray(parsed.users)) {
      for (const [sub, list] of Object.entries(parsed.users)) { const clean = sanitizeList(list); if (clean) users[sub] = clean; }
    }
    return { kind: "configured", malformed: false, mode, default: sanitizeList(parsed.default), users };
  } catch {
    return { kind: "configuration-error", malformed: true, mode: "single" };
  }
}

function isTeacherIdentity(user) {
  return !!user && typeof user === "object" && user.role === "teacher" && typeof user.sub === "string" && user.sub.length > 0;
}

function resolveGovernanceCapabilities(user, env = process.env) {
  if (!isTeacherIdentity(user)) return [];
  const cfg = parseCapabilityConfig(env);
  if (cfg.kind === "default-single-teacher") return [...GOVERNANCE_CAPABILITIES];
  if (cfg.kind !== "configured") return [];                       // configuration-error: fail SAFE, never open
  if (Object.prototype.hasOwnProperty.call(cfg.users, user.sub)) return [...cfg.users[user.sub]];
  return cfg.default ? [...cfg.default] : [];
}

function describeCapabilitySource(env = process.env) {
  const cfg = parseCapabilityConfig(env);
  return cfg.kind;
}

// Which capabilities may perform an action (ANY one of the returned list suffices). Reads need none beyond authentication.
// 14B: the assigned-actor check (reviewer / approver / publisher / cycle author) is enforced separately by the authority —
// capability alone is never sufficient in Assigned mode, and assignment alone is never sufficient either.
function requiredCapabilities(action, fromState) {
  switch (action) {
    case "enable": case "create-revision": case "submit-review": return ["author"];
    case "approve": return ["approve"];
    case "publish": return ["publish"];
    case "complete-review": case "request-changes": return ["review"];
    case "reject-approval": return ["approve"];
    case "reject-publication": return ["publish"];
    case "withdraw-review": return ["author"];
    case "return-to-draft":
      if (fromState === "in-review") return ["author", "review"];
      if (fromState === "approved") return ["author", "approve"];
      return ["author"];
    default: return [];
  }
}

function isCapabilityConfigurationBroken(env = process.env) { return parseCapabilityConfig(env).kind === "configuration-error"; }

// ── 14B — workflow mode + identity requirement ───────────────────────────────────────────────────────────────────────────
function governanceWorkflowMode(env = process.env) { return parseCapabilityConfig(env).mode === "assigned" ? "assigned" : "single"; }

/** Assigned mode is trustworthy only on top of server-owned identities. Returns { ok } or { ok: false, code, reason }. */
function governanceIdentityStatus(env = process.env) {
  const caps = parseCapabilityConfig(env);
  if (caps.mode !== "assigned") return { ok: true, mode: "single" };
  const accounts = parseBuilderUsers(env);
  if (accounts.kind !== "configured") return { ok: false, mode: "assigned", code: "GOVERNANCE_IDENTITY_CONFIG_INVALID", reason: accounts.kind === "legacy" ? "assigned mode requires BUILDER_USERS" : "BUILDER_USERS invalid" };
  for (const sub of Object.keys(caps.users)) {
    if (!Object.prototype.hasOwnProperty.call(accounts.users, sub)) return { ok: false, mode: "assigned", code: "GOVERNANCE_IDENTITY_CONFIG_INVALID", reason: "assigned actor outside the account directory" };
  }
  return { ok: true, mode: "assigned" };
}
function isGovernanceIdentityBroken(env = process.env) { return governanceIdentityStatus(env).ok === false; }

/** The server-owned directory snapshot the authority validates assignments against: every configured account with its
 *  resolved capabilities (ids only — display names are a presentation concern of governance-directory.js). Outside a valid
 *  Assigned mode the snapshot is `{ mode: "single" }` and the authority applies the 14A single-teacher rules. */
function governanceDirectorySnapshot(env = process.env) {
  const status = governanceIdentityStatus(env);
  if (status.mode !== "assigned" || !status.ok) return { mode: "single" };
  const accounts = parseBuilderUsers(env);
  const actors = Object.keys(accounts.users).map(sub => ({ actorId: sub, capabilities: resolveGovernanceCapabilities({ role: "teacher", sub }, env) }));
  return { mode: "assigned", actors };
}

module.exports = { GOVERNANCE_CAPABILITIES, WORKFLOW_MODES, parseCapabilityConfig, resolveGovernanceCapabilities, describeCapabilitySource, isCapabilityConfigurationBroken, requiredCapabilities, isTeacherIdentity, governanceWorkflowMode, governanceIdentityStatus, isGovernanceIdentityBroken, governanceDirectorySnapshot };
