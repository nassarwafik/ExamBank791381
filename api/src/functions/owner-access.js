const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount, mutateTeacherAccount } = require("../lib/identity/teacher-accounts");
const { computeReadiness } = require("../lib/access/readiness");
const { ACCESS_REFUSAL: REFUSAL } = require("../lib/access/messages");
const { CAPABILITIES, reservedAdditions } = require("../lib/access/capabilities");
const { PRESETS, isCurrentPreset } = require("../lib/access/presets");
const { AccessError, REVISION_ID_RE, buildRevision, writeRevision, readRevision } = require("../lib/access/revisions");
const { readAccessMode, writeAccessMode } = require("../lib/access/access-mode");
const { readAccessHistory, MAX_HISTORY } = require("../lib/access/history");
const { resolveTeacherAccess } = require("../lib/access/resolver");
const { listCatalog, writeCourseStatus, STATUSES } = require("../lib/access/course-access");
const { publicWidgets } = require("../lib/dashboard-widgets");   // Tadris+ P7-A2
const { publicGames } = require("../lib/game-catalog");          // Tadris+ P7-B2
const { APPEARANCE } = require("../lib/appearance-registry");     // Tadris+ P8-A2
const publicAppearance = () => Object.entries(APPEARANCE).map(([part, spec]) => ({ part, values: [...spec.values], fallback: spec.fallback, capability: spec.capability }));
const { findLearningCourse } = require("../lib/learning-materials-registry");

// Tadris+ P3-A — the owner manages teacher capabilities. Route: /api/owner-access/{action?}   (owner session only)
//
//   GET                → { mode, capabilities (the registry), presets }
//   GET readiness      → P3-B: per teacher — the access in force (assigned, or the account's default) and what the OBSERVE mode
//                        recorded as «would have been refused»; `ready` = no active or invited teacher is left without access.
//   POST assign        { accountId, presetId, presetVersion, grants?, denies?, reason?, baseRevisionId? }
//                      → a NEW immutable revision (create-only), then a compare-and-set of the account's accessRevisionId.
//                        `baseRevisionId` (optional, null = "the account has none yet") refuses a stale screen (409).
//                        Refused with its code, never corrected: unknown preset / capability, a platform.* grant, a
//                        capability both granted and denied, a broken dependency.
//   GET history?accountId=   P4-B1 → the teacher's revisions, newest first (current pointer → parentRevisionId, ≤ 50), each
//                            re-validated with its effective capabilities; an untrusted link is shown invalid and ends the walk.
//   GET effective?accountId= P4-B1 → what the resolver gives that account right now (the same code every teacher request uses)
//                            and the mode, so the owner sees whether it is enforced; a revision that cannot be trusted → unavailable.
//   POST rollback      { accountId, revisionId, baseRevisionId?, reason? }   P4-B1
//                      → restores an earlier revision ON THIS ACCOUNT'S HISTORY as a NEW revision (same preset / grants / denies,
//                        parent = the current one), then the same compare-and-set as assign. History is never rewritten.
//   GET catalog              P5-A → every course with its catalog status (published / archived)
//   POST course-status { courseId, status: "published" | "archived" }   P5-A (owner decision D12) → for every teacher and student
//   assign / rollback  P5-A: `courses` (null / absent = every published course; an array = only those) is part of the revision.
//                      P7-A2: `widgets` likewise (null / absent = every dashboard widget; an array = only those).
//                      P7-B2: `games` likewise (null / absent = every educational game; an array = only those).
//   POST mode          { mode: "legacy" | "observe" | "enforce" }. P3-B2: "enforce" only while every active or invited teacher has
//                      access (readiness) — otherwise 409 ACCESS_NOT_READY naming them. Leaving enforce is always allowed.
//
// Every POST needs a recent second-factor check (step-up) and is written to the owner audit log. In P3-A nothing is enforced:
// the default mode is legacy, so assigning access changes no teacher's behaviour yet — it prepares P3-B.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });

const publicCapabilities = () => CAPABILITIES.map(c => ({ id: c.id, module: c.module, moduleLabel: c.moduleLabel, label: c.label, ownerOnly: c.ownerOnly, requires: [...c.requires], reserved: c.reserved, reservedNote: c.reservedNote }));   // P10-K: reserved
const publicPresets = () => PRESETS.map(p => ({ id: p.id, version: p.version, label: p.label, description: p.description, capabilities: [...p.capabilities], current: isCurrentPreset(p) }));   // P5-B4: `current`

/** A query parameter (Azure Functions `request.query`, or parsed from the URL). */
function queryParam(request, name) {
  try { if (request.query && typeof request.query.get === "function") return request.query.get(name) || ""; } catch { /* fall through */ }
  try { return new URL(String(request.url || ""), "http://localhost").searchParams.get(name) || ""; } catch { return ""; }
}

const CONFLICT = error => reply(409, { ok: false, code: "ACCESS_CONFLICT", error });
const STALE_SCREEN = "تغيّرت صلاحيات هذا المعلم منذ فتحت الصفحة. حدّث الصفحة وأعد المحاولة.";

/**
 * Stores a built revision (create-only) and moves the account's pointer to it with a compare-and-set against `currentRevision`.
 * → { ok: true, next } | { ok: false, response }   (a concurrent change → 409; the new revision then stays an orphan)
 */
async function applyRevision(container, accountId, currentRevision, rev) {
  await writeRevision(container, rev);                                    // 1. immutable, create-only
  let conflict = false;
  const next = await mutateTeacherAccount(container, accountId, a => {      // 2. compare-and-set the pointer
    if ((a.accessRevisionId || null) !== currentRevision) { conflict = true; return a; }
    return { ...a, accessRevisionId: rev.revisionId, accessPreset: { ...rev.preset }, accessGrants: rev.grants.length, accessDenies: rev.denies.length, updatedAt: rev.createdAt };
  });
  if (conflict) return { ok: false, response: CONFLICT("تغيّرت صلاحيات هذا المعلم في اللحظة نفسها. حدّث الصفحة وأعد المحاولة.") };
  return { ok: true, next };
}
const accessOut = rev => ({ revisionId: rev.revisionId, preset: rev.preset, grants: rev.grants.length, denies: rev.denies.length });
// Tadris+ P5-A — the course entitlement of a request: `courses` absent / null = every published course; an array = only those.
// Tadris+ P7-A2 — the widget entitlement, the same rule: `widgets` absent / null = every widget; an array = only those.
// Tadris+ P7-B2 — the game entitlement, the same rule: `games` absent / null = every game; an array = only those.
// Tadris+ P8-A2 — the appearance restriction, the same rule: `appearance` absent / null = every value of every part.
const resourcesOf = (courses, widgets, games, appearance) => ({
  ...(courses === undefined || courses === null ? {} : { courses }),
  ...(widgets === undefined || widgets === null ? {} : { widgets }),
  ...(games === undefined || games === null ? {} : { games }),
  ...(appearance === undefined || appearance === null ? {} : { appearance })
});
const coursesOf = rev => (rev.resources && Array.isArray(rev.resources.courses) ? [...rev.resources.courses] : null);
const entitledWidgetsOf = rev => (rev.resources && Array.isArray(rev.resources.widgets) ? [...rev.resources.widgets] : null);
const entitledGamesOf = rev => (rev.resources && Array.isArray(rev.resources.games) ? [...rev.resources.games] : null);
const appearanceOfRev = rev => (rev.resources && rev.resources.appearance && typeof rev.resources.appearance === "object" ? { ...rev.resources.appearance } : null);

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method === "GET" && !action) {
      let mode;
      try { mode = (await readAccessMode(container)).mode; } catch (e) { if (e instanceof AccessError) mode = "invalid"; else throw e; }
      return reply(200, { ok: true, mode, capabilities: publicCapabilities(), presets: publicPresets(), widgets: publicWidgets(), games: publicGames(), appearance: publicAppearance() });
    }
    if (method === "GET" && action === "readiness") {
      let mode;
      try { mode = (await readAccessMode(container)).mode; } catch (e) { if (e instanceof AccessError) mode = "invalid"; else throw e; }
      const r = await computeReadiness(container);
      return reply(200, { ok: true, mode, ready: r.ready, teachers: r.teachers });
    }
    if (method === "GET" && (action === "history" || action === "effective")) {
      const accountId = queryParam(request, "accountId");
      if (!isTeacherAccountId(accountId)) return reply(400, { ok: false, code: "ACCOUNT_ID_INVALID", error: "معرّف الحساب غير صالح." });
      const account = await readTeacherAccount(container, accountId);
      if (!account) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const current = account.accessRevisionId || null;
      if (action === "history") {
        const h = await readAccessHistory(container, accountId, current);
        return reply(200, { ok: true, accountId, currentRevisionId: current, entries: h.entries, truncated: h.truncated, limit: MAX_HISTORY });
      }
      let mode;
      try { mode = (await readAccessMode(container)).mode; } catch (e) { if (e instanceof AccessError) mode = "invalid"; else throw e; }
      let access;
      try {
        const r = await resolveTeacherAccess({ am: "managed", sub: accountId, accessRevisionId: current }, { container });
        access = { status: "ok", source: r.source, revisionId: r.revisionId, preset: r.preset, capabilities: r.capabilities, courses: r.courses, widgets: r.widgets, games: r.games, appearance: r.appearance };
      } catch (e) {
        if (!(e instanceof AccessError)) throw e;
        access = { status: "unavailable", code: e.code, revisionId: current, preset: null, capabilities: [] };
      }
      return reply(200, { ok: true, accountId, accountStatus: account.status, mode, enforced: mode === "enforce" || mode === "invalid", access });
    }
    if (method === "GET" && action === "catalog") return reply(200, { ok: true, courses: await listCatalog(container) });   // Tadris+ P5-A
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    if (action === "mode") {
      const wanted = String(body.mode || "");
      let enforceReady = false;
      if (wanted === "enforce") {
        const r = await computeReadiness(container);
        if (!r.ready) return reply(409, { ok: false, code: "ACCESS_NOT_READY", error: "لا يمكن تفعيل التطبيق: معلمون بلا حزمة صلاحيات سيُمنعون من كل شيء. اختر لهم حزمة أولًا.", missing: r.missing });
        enforceReady = true;
      }
      try {
        const r = await writeAccessMode(container, wanted, actor, nowMs, {}, { enforceReady });
        await audit(container, { actor, action: "owner.access.mode", targetType: "platform", targetId: "access-control", details: { from: r.previous, to: r.mode } });
        return reply(200, { ok: true, mode: r.mode });
      } catch (e) {
        if (e instanceof AccessError) return reply(409, { ok: false, code: e.code, error: "هذا الوضع غير معروف." });
        throw e;
      }
    }

    // Tadris+ P5-A — the course catalog (owner decision D12): publish / archive a course for every teacher and student at once.
    if (action === "course-status") {
      const courseId = String(body.courseId || "");
      if (!findLearningCourse(courseId) || findLearningCourse(courseId).courseId !== courseId) return reply(404, { ok: false, code: "COURSE_UNKNOWN", error: "المقرر غير موجود." });
      const status = String(body.status || "");
      if (!STATUSES.includes(status)) return reply(400, { ok: false, code: "COURSE_STATUS_INVALID", error: "الحالة غير صالحة." });
      const r = await writeCourseStatus(container, courseId, status, actor, nowMs);
      await audit(container, { actor, action: "owner.catalog.course-status", targetType: "course", targetId: courseId, targetLabel: findLearningCourse(courseId).title, details: { from: r.previous, to: r.status } });
      return reply(200, { ok: true, courseId, status: r.status });
    }

    if (action === "assign") {
      const accountId = String(body.accountId || "");
      if (!isTeacherAccountId(accountId)) return reply(400, { ok: false, code: "ACCOUNT_ID_INVALID", error: "معرّف الحساب غير صالح." });
      const current = await readTeacherAccount(container, accountId);
      if (!current) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const currentRevision = current.accessRevisionId || null;
      const hasBase = Object.prototype.hasOwnProperty.call(body, "baseRevisionId");
      if (hasBase && (body.baseRevisionId || null) !== currentRevision) return CONFLICT(STALE_SCREEN);
      let built;
      try {
        built = buildRevision({ accountId, parentRevisionId: currentRevision, presetId: body.presetId, presetVersion: body.presetVersion, grants: body.grants === undefined ? [] : body.grants, denies: body.denies === undefined ? [] : body.denies, resources: resourcesOf(body.courses, body.widgets, body.games, body.appearance), reason: body.reason, createdBy: actor, nowMs });
      } catch (e) {
        if (e instanceof AccessError) return reply(400, { ok: false, code: e.code, error: REFUSAL[e.code] || REFUSAL.REVISION_MALFORMED, details: e.details });
        throw e;
      }
      const rev = built.revision;
      // Tadris+ P10-K (O11) — a NEW grant or deny of a reserved capability is refused before anything is written; an entry the
      // current revision already holds stays. An unreadable current revision counts as holding none (the owner re-chooses).
      let parent = {};
      if (currentRevision) { try { parent = (await readRevision(container, currentRevision, accountId)).revision || {}; } catch (e) { if (!(e instanceof AccessError)) throw e; } }
      const added = reservedAdditions(rev, parent, built.capabilities);
      if (added.length) return reply(400, { ok: false, code: "CAPABILITY_RESERVED", error: REFUSAL.CAPABILITY_RESERVED, details: { capabilities: added } });
      const applied = await applyRevision(container, accountId, currentRevision, rev);
      if (!applied.ok) return applied.response;
      await audit(container, {
        actor, action: "owner.access.assigned", targetType: "teacher-account", targetId: accountId, targetLabel: applied.next.username,
        details: { revisionId: rev.revisionId, parentRevisionId: rev.parentRevisionId, preset: rev.preset, grants: rev.grants, denies: rev.denies, courses: coursesOf(rev), widgets: entitledWidgetsOf(rev), games: entitledGamesOf(rev), appearance: appearanceOfRev(rev) }
      });
      return reply(200, { ok: true, accountId, access: accessOut(rev), capabilities: built.capabilities, courses: coursesOf(rev), widgets: entitledWidgetsOf(rev), games: entitledGamesOf(rev), appearance: appearanceOfRev(rev) });
    }

    if (action === "rollback") {
      const accountId = String(body.accountId || "");
      if (!isTeacherAccountId(accountId)) return reply(400, { ok: false, code: "ACCOUNT_ID_INVALID", error: "معرّف الحساب غير صالح." });
      const targetId = String(body.revisionId || "");
      if (!REVISION_ID_RE.test(targetId)) return reply(400, { ok: false, code: "REVISION_ID_INVALID", error: "معرّف النسخة غير صالح." });
      const current = await readTeacherAccount(container, accountId);
      if (!current) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const currentRevision = current.accessRevisionId || null;
      const hasBase = Object.prototype.hasOwnProperty.call(body, "baseRevisionId");
      if (hasBase && (body.baseRevisionId || null) !== currentRevision) return CONFLICT(STALE_SCREEN);
      if (targetId === currentRevision) return reply(409, { ok: false, code: "ROLLBACK_ALREADY_CURRENT", error: "هذه النسخة هي المطبّقة حاليًا." });
      // Only a revision on THIS account's own chain (never an orphan, never another teacher's), re-validated (fail closed).
      const history = await readAccessHistory(container, accountId, currentRevision);
      const onChain = history.entries.find(e => e.revisionId === targetId);
      if (!onChain) return reply(409, { ok: false, code: "ROLLBACK_NOT_IN_HISTORY", error: "هذه النسخة ليست في سجل صلاحيات هذا المعلم." });
      let target;
      try { target = (await readRevision(container, targetId, accountId)).revision; } catch (e) {
        if (e instanceof AccessError) return reply(409, { ok: false, code: "ROLLBACK_TARGET_INVALID", error: "لا يمكن استعادة هذه النسخة: محتواها غير صالح." });
        throw e;
      }
      const note = String(body.reason || "").trim();
      let built;
      try {
        built = buildRevision({ accountId, parentRevisionId: currentRevision, presetId: target.preset.id, presetVersion: target.preset.version, grants: [...(target.grants || [])], denies: [...(target.denies || [])], resources: resourcesOf(coursesOf(target), entitledWidgetsOf(target), entitledGamesOf(target), appearanceOfRev(target)), reason: "استعادة " + targetId + (note ? " — " + note : ""), createdBy: actor, nowMs });
      } catch (e) {
        if (e instanceof AccessError) return reply(409, { ok: false, code: "ROLLBACK_TARGET_INVALID", error: "لا يمكن استعادة هذه النسخة: محتواها غير صالح." });
        throw e;
      }
      const rev = built.revision;
      const applied = await applyRevision(container, accountId, currentRevision, rev);
      if (!applied.ok) return applied.response;
      await audit(container, {
        actor, action: "owner.access.rolled-back", targetType: "teacher-account", targetId: accountId, targetLabel: applied.next.username,
        details: { revisionId: rev.revisionId, restoredFrom: targetId, parentRevisionId: rev.parentRevisionId, preset: rev.preset, grants: rev.grants, denies: rev.denies, courses: coursesOf(rev), widgets: entitledWidgetsOf(rev), games: entitledGamesOf(rev), appearance: appearanceOfRev(rev) }
      });
      return reply(200, { ok: true, accountId, restoredFrom: targetId, access: accessOut(rev), capabilities: built.capabilities, courses: coursesOf(rev), widgets: entitledWidgetsOf(rev), games: entitledGamesOf(rev), appearance: appearanceOfRev(rev) });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    if (e?.code === "TEACHER_NOT_FOUND") return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
    obs?.logError("owner.access.error", e, { action });
    return reply(503, { ok: false, code: "OWNER_ACCESS_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });
  }
}

app.http("ownerAccess", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-access/{action?}", handler: withObservability("owner-access", handler) });
module.exports = { handler };
