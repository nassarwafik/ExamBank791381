const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount, mutateTeacherAccount } = require("../lib/identity/teacher-accounts");
const { computeReadiness } = require("../lib/access/readiness");
const { ACCESS_REFUSAL: REFUSAL } = require("../lib/access/messages");
const { CAPABILITIES } = require("../lib/access/capabilities");
const { PRESETS } = require("../lib/access/presets");
const { AccessError, buildRevision, writeRevision } = require("../lib/access/revisions");
const { readAccessMode, writeAccessMode } = require("../lib/access/access-mode");

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
//   POST mode          { mode: "legacy" | "observe" | "enforce" }. P3-B2: "enforce" only while every active or invited teacher has
//                      access (readiness) — otherwise 409 ACCESS_NOT_READY naming them. Leaving enforce is always allowed.
//
// Every POST needs a recent second-factor check (step-up) and is written to the owner audit log. In P3-A nothing is enforced:
// the default mode is legacy, so assigning access changes no teacher's behaviour yet — it prepares P3-B.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });

const publicCapabilities = () => CAPABILITIES.map(c => ({ id: c.id, module: c.module, moduleLabel: c.moduleLabel, label: c.label, ownerOnly: c.ownerOnly, requires: [...c.requires] }));
const publicPresets = () => PRESETS.map(p => ({ id: p.id, version: p.version, label: p.label, description: p.description, capabilities: [...p.capabilities] }));

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
      return reply(200, { ok: true, mode, capabilities: publicCapabilities(), presets: publicPresets() });
    }
    if (method === "GET" && action === "readiness") {
      let mode;
      try { mode = (await readAccessMode(container)).mode; } catch (e) { if (e instanceof AccessError) mode = "invalid"; else throw e; }
      const r = await computeReadiness(container);
      return reply(200, { ok: true, mode, ready: r.ready, teachers: r.teachers });
    }
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

    if (action === "assign") {
      const accountId = String(body.accountId || "");
      if (!isTeacherAccountId(accountId)) return reply(400, { ok: false, code: "ACCOUNT_ID_INVALID", error: "معرّف الحساب غير صالح." });
      const current = await readTeacherAccount(container, accountId);
      if (!current) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const currentRevision = current.accessRevisionId || null;
      const hasBase = Object.prototype.hasOwnProperty.call(body, "baseRevisionId");
      if (hasBase && (body.baseRevisionId || null) !== currentRevision) return reply(409, { ok: false, code: "ACCESS_CONFLICT", error: "تغيّرت صلاحيات هذا المعلم منذ فتحت الصفحة. حدّث الصفحة وأعد المحاولة." });
      let built;
      try {
        built = buildRevision({ accountId, parentRevisionId: currentRevision, presetId: body.presetId, presetVersion: body.presetVersion, grants: body.grants === undefined ? [] : body.grants, denies: body.denies === undefined ? [] : body.denies, reason: body.reason, createdBy: actor, nowMs });
      } catch (e) {
        if (e instanceof AccessError) return reply(400, { ok: false, code: e.code, error: REFUSAL[e.code] || REFUSAL.REVISION_MALFORMED, details: e.details });
        throw e;
      }
      const rev = built.revision;
      await writeRevision(container, rev);                                    // 1. immutable, create-only
      let conflict = false;
      const next = await mutateTeacherAccount(container, accountId, a => {      // 2. compare-and-set the pointer
        if ((a.accessRevisionId || null) !== currentRevision) { conflict = true; return a; }
        return { ...a, accessRevisionId: rev.revisionId, accessPreset: { ...rev.preset }, accessGrants: rev.grants.length, accessDenies: rev.denies.length, updatedAt: rev.createdAt };
      });
      if (conflict) return reply(409, { ok: false, code: "ACCESS_CONFLICT", error: "تغيّرت صلاحيات هذا المعلم في اللحظة نفسها. حدّث الصفحة وأعد المحاولة." });
      await audit(container, {
        actor, action: "owner.access.assigned", targetType: "teacher-account", targetId: accountId, targetLabel: next.username,
        details: { revisionId: rev.revisionId, parentRevisionId: rev.parentRevisionId, preset: rev.preset, grants: rev.grants, denies: rev.denies }
      });
      return reply(200, { ok: true, accountId, access: { revisionId: rev.revisionId, preset: rev.preset, grants: rev.grants.length, denies: rev.denies.length }, capabilities: built.capabilities });
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
