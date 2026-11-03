const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { listTeacherAccounts } = require("../lib/identity/teacher-accounts");
const { readLibraryCatalog, libraryItemEntry } = require("../lib/exam-library-store");
const { AUDIENCES, MAX_TEACHERS, LibraryAccessError, readAudienceDoc, audienceOf, mutateAudience } = require("../lib/access/library-access");

// Tadris+ P6-D — each teacher's own exam bank. Route: /api/owner-library/{action?}   (owner session only)
//
//   GET                  → { items: [{ libraryItemId, title, category, questionCount, totalMarks, audience, teachers, decided }],
//                            teachers: [{ accountId, displayName, username, status }] }
//   POST set-audience   { itemId, audience: "all" | "selected", teachers: [accountId…] }
//                          one exam → everyone, or exactly this group of teachers (replaces its list)
//   POST set-teacher    { accountId, include: [itemId…], exclude: [itemId…] }
//                          one teacher's bank: add / remove exams. An exam that is «for all teachers» cannot be removed for one
//                          teacher here (change its audience instead): the whole request is refused, nothing written.
//
// Every POST needs a recent second-factor check (step-up) and is in the owner audit log. Unknown exams or teachers are refused
// (nothing written). Published assignments, attempts and grades are never touched. See lib/access/library-access.js.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const bad = (code, error) => reply(400, { ok: false, code, error });
const UNAVAILABLE = () => reply(503, { ok: false, code: "LIBRARY_AUDIENCE_UNAVAILABLE", error: "تعذر قراءة بنوك الامتحانات حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

class Refusal extends Error { constructor(status, code, error, extra = {}) { super(code); this.status = status; this.code = code; this.error = error; this.extra = extra; } }

const idList = (value, max) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [...new Set(value.map(v => String(v || "").trim()))];
  return out.some(v => !v) ? null : out;
};

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const iso = new Date(nowMs).toISOString();
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method === "GET" && !action) {
      let doc;
      try { doc = await readAudienceDoc(container, deps); } catch { return UNAVAILABLE(); }
      const teachers = (await (deps.listTeacherAccounts || listTeacherAccounts)(container))
        .map(t => ({ accountId: t.accountId, displayName: String(t.displayName || ""), username: String(t.username || ""), status: String(t.status || "") }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
      const items = readLibraryCatalog().map(i => {
        const a = audienceOf(doc, i.libraryItemId);
        return { libraryItemId: i.libraryItemId, title: String(i.title || ""), category: String(i.category || ""), questionCount: Number(i.questionCount || 0), totalMarks: Number(i.totalMarks || 0), audience: a.audience, teachers: a.teachers, decided: a.stored || a.audience === "all" };
      });
      return reply(200, { ok: true, items, teachers });
    }
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
    const knownTeachers = async () => new Set((await (deps.listTeacherAccounts || listTeacherAccounts)(container)).map(t => t.accountId));
    const knownItem = id => !!libraryItemEntry(id);

    if (action === "set-audience") {
      const itemId = String(body.itemId || "").trim();
      if (!knownItem(itemId)) return reply(404, { ok: false, code: "LIBRARY_ITEM_NOT_FOUND", error: "الامتحان غير موجود في المكتبة." });
      if (!AUDIENCES.includes(body.audience)) return bad("AUDIENCE_INVALID", "اختر: لكل المعلمين، أو معلمين محددين.");
      const list = body.audience === "all" ? [] : idList(body.teachers === undefined ? [] : body.teachers, MAX_TEACHERS);
      if (!list) return bad("TEACHERS_INVALID", "قائمة المعلمين غير صالحة.");
      const known = list.length ? await knownTeachers() : new Set();
      const unknown = list.filter(t => !isTeacherAccountId(t) || !known.has(t));
      if (unknown.length) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود.", unknown });
      const teachers = list.sort();
      let before;
      try {
        before = await mutateAudience(container, doc => {
          const prev = audienceOf(doc, itemId);
          doc.items[itemId] = { audience: body.audience, teachers, updatedAt: iso, updatedBy: actor };
          return prev;
        }, deps);
      } catch (e) { if (e instanceof LibraryAccessError) return UNAVAILABLE(); throw e; }
      const added = teachers.filter(t => !before.teachers.includes(t)), removed = before.teachers.filter(t => !teachers.includes(t));
      await audit(container, { actor, action: "owner.library.audience-set", targetType: "library-item", targetId: itemId, targetLabel: itemId, details: { audience: body.audience, previousAudience: before.audience, teachers: teachers.length, added, removed } });
      return reply(200, { ok: true, item: { libraryItemId: itemId, audience: body.audience, teachers, decided: true } });
    }

    if (action === "set-teacher") {
      const accountId = String(body.accountId || "").trim();
      if (!isTeacherAccountId(accountId) || !(await knownTeachers()).has(accountId)) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const include = idList(body.include === undefined ? [] : body.include, 1000), exclude = idList(body.exclude === undefined ? [] : body.exclude, 1000);
      if (!include || !exclude || include.some(id => exclude.includes(id))) return bad("ITEMS_INVALID", "قائمة الامتحانات غير صالحة.");
      const unknown = [...include, ...exclude].filter(id => !knownItem(id));
      if (unknown.length) return reply(404, { ok: false, code: "LIBRARY_ITEM_NOT_FOUND", error: "الامتحان غير موجود في المكتبة.", unknown });
      let changed;
      try {
        changed = await mutateAudience(container, doc => {
          const forAll = exclude.filter(id => audienceOf(doc, id).audience === "all");
          if (forAll.length) throw new Refusal(409, "ITEM_FOR_ALL", "هذا الامتحان لكل المعلمين. غيّر جمهوره من «بنك الامتحانات» لإزالته عن معلم بعينه.", { items: forAll });
          const added = [], removed = [];
          for (const id of include) {
            const a = audienceOf(doc, id);
            if (a.audience === "all" || a.teachers.includes(accountId)) continue;
            doc.items[id] = { audience: "selected", teachers: [...a.teachers, accountId].sort(), updatedAt: iso, updatedBy: actor };
            added.push(id);
          }
          for (const id of exclude) {
            const a = audienceOf(doc, id);
            if (!a.teachers.includes(accountId)) continue;
            doc.items[id] = { audience: "selected", teachers: a.teachers.filter(t => t !== accountId), updatedAt: iso, updatedBy: actor };
            removed.push(id);
          }
          return { added, removed };
        }, deps);
      } catch (e) {
        if (e instanceof Refusal) return reply(e.status, { ok: false, code: e.code, error: e.error, ...e.extra });
        if (e instanceof LibraryAccessError) return UNAVAILABLE();
        throw e;
      }
      if (changed.added.length || changed.removed.length) await audit(container, { actor, action: "owner.library.teacher-set", targetType: "teacher-account", targetId: accountId, targetLabel: accountId, details: changed });
      return reply(200, { ok: true, accountId, ...changed });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    obs?.logError?.("owner.library.error", e);
    return reply(500, { ok: false, error: "تعذر تنفيذ هذا الإجراء حاليًا." });
  }
}

app.http("ownerLibrary", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-library/{action?}", handler: withObservability("owner-library", handler) });

module.exports = { handler };
