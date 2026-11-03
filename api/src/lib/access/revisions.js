const crypto = require("crypto");
const storage = require("../platform-storage");
const { createOnly } = require("../identity/owner-store");
const { isCapability, isOwnerOnly, unmetDependencies } = require("./capabilities");
const { preset } = require("./presets");
const { findLearningCourse } = require("../learning-materials-registry");

// Tadris+ P3-A — access revisions (blueprint §6.3). A revision is IMMUTABLE: written once (create-only), never changed. A teacher
// account points at its current revision (`accessRevisionId`); changing access = a NEW revision, then a compare-and-set on the
// account. If the second step never happens the new revision is an orphan nobody points at — there is no half-applied state.
// Rollback = a new revision with an older revision's content, so the history stays linear and auditable.
//
//   platform/access/revisions/<revisionId>.json
//   { schemaVersion: 1, revisionId, accountId, parentRevisionId, preset: { id, version }, grants: [], denies: [], resources: {},
//     reason, createdAt, createdBy }
//
// Validation (on save, and again whenever a stored revision is read — fail closed):
//   the preset version exists; grants / denies are known capabilities, without duplicates and never both; no platform.* grant;
//   the effective set meets every dependency.
//   Tadris+ P5-A — `resources.courses` (optional): the ONLY courses this teacher may use, as known course ids, without duplicates
//   (owner decisions §19.13: an entitlement only NARROWS — absent = every published course). Any other key is refused.
// A problem is REFUSED with its code — never corrected silently.

const REVISION_PREFIX = "platform/access/revisions/";
const REVISION_ID_RE = /^ar_[0-9a-z]{9}_[a-f0-9]{16}$/;
const MAX_REASON = 300;
const MAX_LIST = 80;

const newRevisionId = (nowMs = Date.now()) => "ar_" + Math.max(0, Math.floor(nowMs)).toString(36).padStart(9, "0").slice(-9) + "_" + crypto.randomBytes(8).toString("hex");
const revisionName = id => {
  if (!REVISION_ID_RE.test(String(id))) throw new Error("Invalid access revision id.");
  return REVISION_PREFIX + id + ".json";
};

class AccessError extends Error {
  constructor(code, details) { super(code); this.code = code; this.details = details || {}; }
}

/**
 * The effective capabilities of a revision-shaped object, or an AccessError describing why it is not acceptable.
 * → { ok: true, capabilities: string[] (sorted), preset } | { ok: false, code, details }
 */
function evaluateRevision(rev) {
  if (!rev || typeof rev !== "object") return { ok: false, code: "REVISION_MALFORMED" };
  const p = rev.preset && typeof rev.preset === "object" ? preset(rev.preset.id, rev.preset.version) : null;
  if (!p) return { ok: false, code: "PRESET_UNKNOWN" };
  const lists = {};
  for (const name of ["grants", "denies"]) {
    const v = rev[name] === undefined ? [] : rev[name];
    if (!Array.isArray(v) || v.length > MAX_LIST) return { ok: false, code: "REVISION_MALFORMED", details: { field: name } };
    const unknown = v.filter(c => !isCapability(c));
    if (unknown.length) return { ok: false, code: "CAPABILITY_UNKNOWN", details: { field: name, capabilities: unknown.map(String).slice(0, 10) } };
    if (new Set(v).size !== v.length) return { ok: false, code: "CAPABILITY_DUPLICATE", details: { field: name } };
    lists[name] = v;
  }
  const forbidden = lists.grants.filter(isOwnerOnly);
  if (forbidden.length) return { ok: false, code: "PLATFORM_CAPABILITY_FORBIDDEN", details: { capabilities: forbidden } };
  const both = lists.grants.filter(c => lists.denies.includes(c));
  if (both.length) return { ok: false, code: "CAPABILITY_CONFLICT", details: { capabilities: both } };
  let courses = null;
  if (rev.resources !== undefined) {
    const r = rev.resources;
    if (typeof r !== "object" || r === null || Array.isArray(r) || Object.keys(r).some(k => k !== "courses")) return { ok: false, code: "RESOURCES_NOT_SUPPORTED" };
    if (r.courses !== undefined) {
      if (!Array.isArray(r.courses) || r.courses.length > MAX_LIST) return { ok: false, code: "REVISION_MALFORMED", details: { field: "resources.courses" } };
      const unknown = r.courses.filter(c => typeof c !== "string" || !findLearningCourse(c) || findLearningCourse(c).courseId !== c);
      if (unknown.length) return { ok: false, code: "COURSE_UNKNOWN", details: { courses: unknown.map(String).slice(0, 10) } };
      if (new Set(r.courses).size !== r.courses.length) return { ok: false, code: "COURSE_DUPLICATE" };
      courses = [...r.courses].sort();
    }
  }
  const set = new Set(p.capabilities);
  for (const c of lists.grants) set.add(c);
  for (const c of lists.denies) set.delete(c);
  for (const c of [...set]) if (isOwnerOnly(c)) set.delete(c);      // defence in depth: platform.* never reaches a teacher
  const unmet = unmetDependencies(set);
  if (unmet.length) return { ok: false, code: "DEPENDENCY_UNMET", details: { unmet } };
  return { ok: true, capabilities: [...set].sort(), preset: { id: p.id, version: p.version }, courses };
}

/** Builds and validates a new revision for `accountId` (not stored yet). Throws AccessError on a refusal. */
function buildRevision({ accountId, parentRevisionId = null, presetId, presetVersion, grants = [], denies = [], resources = {}, reason = "", createdBy, nowMs = Date.now() }) {
  const rev = {
    schemaVersion: 1, revisionId: newRevisionId(nowMs), accountId: String(accountId), parentRevisionId: parentRevisionId || null,
    preset: { id: String(presetId || ""), version: Number(presetVersion) }, grants, denies, resources: resources && typeof resources === "object" && !Array.isArray(resources) && resources.courses !== undefined ? { courses: resources.courses } : resources,
    reason: String(reason || "").trim().slice(0, MAX_REASON), createdAt: new Date(nowMs).toISOString(), createdBy: String(createdBy || "")
  };
  const verdict = evaluateRevision(rev);
  if (!verdict.ok) throw new AccessError(verdict.code, verdict.details);
  return { revision: rev, capabilities: verdict.capabilities };
}

async function writeRevision(container, revision) {
  const created = await createOnly(container, revisionName(revision.revisionId), revision);
  if (!created) throw new AccessError("REVISION_EXISTS");
  return revision;
}

// Immutable → cached by id for the life of the process (bounded). Only VALID revisions are cached.
const CACHE_MAX = 500;
const cache = new Map();

/**
 * The stored revision `revisionId` for `accountId`, validated. Throws AccessError("REVISION_MISSING" | "REVISION_INVALID" | …)
 * for anything that cannot be trusted; a storage error propagates (the caller fails closed).
 */
async function readRevision(container, revisionId, accountId, deps = {}) {
  if (!REVISION_ID_RE.test(String(revisionId))) throw new AccessError("REVISION_INVALID", { reason: "id" });
  const hit = cache.get(revisionId);
  if (hit) {
    if (hit.revision.accountId !== accountId) throw new AccessError("REVISION_INVALID", { reason: "account" });
    return hit;
  }
  const doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, revisionName(revisionId));
  if (!doc) throw new AccessError("REVISION_MISSING");
  if (doc.schemaVersion !== 1 || doc.revisionId !== revisionId) throw new AccessError("REVISION_INVALID", { reason: "shape" });
  if (doc.accountId !== accountId) throw new AccessError("REVISION_INVALID", { reason: "account" });
  const verdict = evaluateRevision(doc);
  if (!verdict.ok) throw new AccessError("REVISION_INVALID", { reason: verdict.code });
  const entry = Object.freeze({ revision: doc, capabilities: Object.freeze(verdict.capabilities), preset: verdict.preset, courses: verdict.courses ? Object.freeze(verdict.courses) : null });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(revisionId, entry);
  return entry;
}

/** Tests only. */
function resetRevisionCache() { cache.clear(); }

module.exports = { REVISION_PREFIX, REVISION_ID_RE, AccessError, newRevisionId, revisionName, evaluateRevision, buildRevision, writeRevision, readRevision, resetRevisionCache };
