const crypto = require("crypto");
const storage = require("../platform-storage");
const { createOnly } = require("../identity/owner-store");
const { isCapability, isOwnerOnly, unmetDependencies } = require("./capabilities");
const { preset } = require("./presets");
const { findLearningCourse } = require("../learning-materials-registry");
const { widget: findWidget } = require("../dashboard-widgets");
const { game: findGame } = require("../game-catalog");
const { APPEARANCE } = require("../appearance-registry");

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
//   (owner decisions §19.13: an entitlement only NARROWS — absent = every published course).
//   Tadris+ P7-A2 — `resources.widgets` (optional): the ONLY dashboard widgets this teacher may see, as known widget ids
//   (lib/dashboard-widgets.js), without duplicates; absent = every widget (the same «only narrows» rule).
//   Tadris+ P7-B2 — `resources.games` (optional): the ONLY educational games this teacher (and so their students) may use, as known
//   game ids (lib/game-catalog.js), without duplicates; absent = every game.
//   Tadris+ P8-A2 — `resources.appearance` (optional): { theme?, palette?, density? } — for each part present, the ONLY values this
//   teacher may choose (lib/appearance-registry.js), without duplicates; a part absent = every value; the part's default is always
//   allowed. Any other key is refused.
// A problem is REFUSED with its code — never corrected silently.

const REVISION_PREFIX = "platform/access/revisions/";
const REVISION_ID_RE = /^ar_[0-9a-z]{9}_[a-f0-9]{16}$/;
const MAX_REASON = 300;
const MAX_LIST = 80;
const RESOURCE_KEYS = new Set(["courses", "widgets", "games", "appearance"]);   // P5-A, P7-A2, P7-B2, P8-A2

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
  let courses = null, widgets = null, games = null, appearance = null;
  if (rev.resources !== undefined) {
    const r = rev.resources;
    if (typeof r !== "object" || r === null || Array.isArray(r) || Object.keys(r).some(k => !RESOURCE_KEYS.has(k))) return { ok: false, code: "RESOURCES_NOT_SUPPORTED" };
    if (r.courses !== undefined) {
      if (!Array.isArray(r.courses) || r.courses.length > MAX_LIST) return { ok: false, code: "REVISION_MALFORMED", details: { field: "resources.courses" } };
      const unknown = r.courses.filter(c => typeof c !== "string" || !findLearningCourse(c) || findLearningCourse(c).courseId !== c);
      if (unknown.length) return { ok: false, code: "COURSE_UNKNOWN", details: { courses: unknown.map(String).slice(0, 10) } };
      if (new Set(r.courses).size !== r.courses.length) return { ok: false, code: "COURSE_DUPLICATE" };
      courses = [...r.courses].sort();
    }
    if (r.widgets !== undefined) {
      if (!Array.isArray(r.widgets) || r.widgets.length > MAX_LIST) return { ok: false, code: "REVISION_MALFORMED", details: { field: "resources.widgets" } };
      const unknown = r.widgets.filter(w => typeof w !== "string" || !findWidget(w));
      if (unknown.length) return { ok: false, code: "WIDGET_UNKNOWN", details: { widgets: unknown.map(String).slice(0, 10) } };
      if (new Set(r.widgets).size !== r.widgets.length) return { ok: false, code: "WIDGET_DUPLICATE" };
      widgets = [...r.widgets].sort();
    }
    if (r.games !== undefined) {
      if (!Array.isArray(r.games) || r.games.length > MAX_LIST) return { ok: false, code: "REVISION_MALFORMED", details: { field: "resources.games" } };
      const unknown = r.games.filter(g => typeof g !== "string" || !findGame(g));
      if (unknown.length) return { ok: false, code: "GAME_UNKNOWN", details: { games: unknown.map(String).slice(0, 10) } };
      if (new Set(r.games).size !== r.games.length) return { ok: false, code: "GAME_DUPLICATE" };
      games = [...r.games].sort();
    }
    if (r.appearance !== undefined) {
      const ap = r.appearance;
      if (!ap || typeof ap !== "object" || Array.isArray(ap) || Object.keys(ap).some(k => !Object.prototype.hasOwnProperty.call(APPEARANCE, k))) return { ok: false, code: "APPEARANCE_RESOURCE_INVALID" };
      appearance = {};
      for (const [k, list] of Object.entries(ap)) {
        if (!Array.isArray(list) || list.some(v => typeof v !== "string" || !APPEARANCE[k].values.includes(v))) return { ok: false, code: "APPEARANCE_RESOURCE_INVALID", details: { part: k } };
        if (new Set(list).size !== list.length) return { ok: false, code: "APPEARANCE_RESOURCE_INVALID", details: { part: k } };
        appearance[k] = APPEARANCE[k].values.filter(v => list.includes(v));   // registry order
      }
    }
  }
  const set = new Set(p.capabilities);
  for (const c of lists.grants) set.add(c);
  for (const c of lists.denies) set.delete(c);
  for (const c of [...set]) if (isOwnerOnly(c)) set.delete(c);      // defence in depth: platform.* never reaches a teacher
  const unmet = unmetDependencies(set);
  if (unmet.length) return { ok: false, code: "DEPENDENCY_UNMET", details: { unmet } };
  return { ok: true, capabilities: [...set].sort(), preset: { id: p.id, version: p.version }, courses, widgets, games, appearance };
}

/** Only the known resource keys that are present (P5-A courses, P7-A2 widgets); anything else is passed on to be refused. */
function keptResources(resources) {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) return resources;
  if (Object.keys(resources).some(k => !RESOURCE_KEYS.has(k))) return resources;
  const out = {};
  for (const k of RESOURCE_KEYS) if (resources[k] !== undefined) out[k] = resources[k];
  return out;
}

/** Builds and validates a new revision for `accountId` (not stored yet). Throws AccessError on a refusal. */
function buildRevision({ accountId, parentRevisionId = null, presetId, presetVersion, grants = [], denies = [], resources = {}, reason = "", createdBy, nowMs = Date.now() }) {
  const rev = {
    schemaVersion: 1, revisionId: newRevisionId(nowMs), accountId: String(accountId), parentRevisionId: parentRevisionId || null,
    preset: { id: String(presetId || ""), version: Number(presetVersion) }, grants, denies, resources: keptResources(resources),
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
  const entry = Object.freeze({ revision: doc, capabilities: Object.freeze(verdict.capabilities), preset: verdict.preset, courses: verdict.courses ? Object.freeze(verdict.courses) : null, widgets: verdict.widgets ? Object.freeze(verdict.widgets) : null, games: verdict.games ? Object.freeze(verdict.games) : null, appearance: verdict.appearance ? Object.freeze(verdict.appearance) : null });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(revisionId, entry);
  return entry;
}

/** Tests only. */
function resetRevisionCache() { cache.clear(); }

module.exports = { REVISION_PREFIX, REVISION_ID_RE, AccessError, newRevisionId, revisionName, evaluateRevision, buildRevision, writeRevision, readRevision, resetRevisionCache };
