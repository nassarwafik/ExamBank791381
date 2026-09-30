// Phase 14A §20–§22 — server-owned governance capabilities.
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
const GOVERNANCE_CAPABILITIES = Object.freeze(["author", "review", "approve", "publish"]);

function sanitizeList(list) {
  if (!Array.isArray(list)) return null;
  return GOVERNANCE_CAPABILITIES.filter(c => list.includes(c));
}

function parseCapabilityConfig(env) {
  const raw = env && env.GOVERNANCE_CAPABILITIES;
  if (raw === undefined || raw === null || !String(raw).trim()) return { kind: "default-single-teacher", malformed: false };
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    const users = {};
    if (parsed.users && typeof parsed.users === "object" && !Array.isArray(parsed.users)) {
      for (const [sub, list] of Object.entries(parsed.users)) { const clean = sanitizeList(list); if (clean) users[sub] = clean; }
    }
    return { kind: "configured", malformed: false, default: sanitizeList(parsed.default), users };
  } catch {
    return { kind: "configuration-error", malformed: true };
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
function requiredCapabilities(action, fromState) {
  switch (action) {
    case "enable": case "create-revision": case "submit-review": return ["author"];
    case "approve": return ["approve"];
    case "publish": return ["publish"];
    case "return-to-draft":
      if (fromState === "in-review") return ["author", "review"];
      if (fromState === "approved") return ["author", "approve"];
      return ["author"];
    default: return [];
  }
}

function isCapabilityConfigurationBroken(env = process.env) { return parseCapabilityConfig(env).kind === "configuration-error"; }
module.exports = { GOVERNANCE_CAPABILITIES, parseCapabilityConfig, resolveGovernanceCapabilities, describeCapabilitySource, isCapabilityConfigurationBroken, requiredCapabilities, isTeacherIdentity };
