const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordOwnerChange } = require("../lib/audit-log");   // Tadris+ P10-L: recorded before the change
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { listTeacherAccounts } = require("../lib/identity/teacher-accounts");
const { libraryItemEntry } = require("../lib/exam-library-store");
const { AUDIENCES, MAX_TEACHERS, LibraryAccessError, readAudienceDoc, audienceOf, mutateAudience } = require("../lib/access/library-access");
const IMP = require("../lib/exam-library-imported");   // Tadris+ P6-E — exams the owner imports
const { evaluateServerFinalization, summarizeFinalization } = require("../lib/server-finalization");
const { examOfficialStats } = require("../lib/exam-structure");
const crypto = require("crypto");

// Tadris+ P6-D — each teacher's own exam bank. Route: /api/owner-library/{action?}   (owner session only)
//
//   GET                  → { items: [{ libraryItemId, title, category, questionCount, totalMarks, audience, teachers, decided }],
//                            teachers: [{ accountId, displayName, username, status }] }
//   POST set-audience   { itemId, audience: "all" | "selected", teachers: [accountId…] }
//                          one exam → everyone, or exactly this group of teachers (replaces its list)
//   POST set-teacher    { accountId, include: [itemId…], exclude: [itemId…] }
//                          one teacher's bank: add / remove exams. An exam that is «for all teachers» cannot be removed for one
//                          teacher here (change its audience instead): the whole request is refused, nothing written.
//   POST import         { exam, title, category, activityType: "exam" | "training", description?, sourceFileName? }   (Tadris+ P6-E)
//                          adds ONE prepared structured exam to the library (lib/exam-library-imported.js) as IMP-nnn. The SERVER
//                          decides it is ready: the same finalization authority as the builder and governance (no blocker), embedded
//                          raster images only, ≤ 10 MB, not already in the library. The new exam is in NOBODY's bank («لم يُحدَّد بعد»)
//                          until the owner chooses its audience with set-audience. Never edited afterwards (a new import is a new exam).
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
  const write = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;
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
      let catalog;
      try { catalog = (await IMP.resolveLibraryCatalogEntry(container, deps)).value; } catch { return UNAVAILABLE(); }
      const items = catalog.map(i => {
        const a = audienceOf(doc, i.libraryItemId);
        return { libraryItemId: i.libraryItemId, title: String(i.title || ""), category: String(i.category || ""), questionCount: Number(i.questionCount || 0), totalMarks: Number(i.totalMarks || 0), audience: a.audience, teachers: a.teachers, decided: a.stored || a.audience === "all", imported: IMP.IMPORTED_ID.test(i.libraryItemId), ...(i.activityType ? { activityType: i.activityType } : {}) };
      });
      return reply(200, { ok: true, items, teachers });
    }
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
    const knownTeachers = async () => new Set((await (deps.listTeacherAccounts || listTeacherAccounts)(container)).map(t => t.accountId));
    // Tadris+ P6-E — a bundled exam, or one listed in the imported index (read once per request; unreadable → 503).
    let importedIds = null;
    const knownItem = async id => {
      if (libraryItemEntry(id)) return true;
      if (!IMP.IMPORTED_ID.test(id)) return false;
      if (!importedIds) importedIds = new Set((await IMP.readImportedIndex(container, deps)).items.map(m => m.libraryItemId));
      return importedIds.has(id);
    };

    if (action === "import") return await importExam(body, { container, deps, actor, iso, write });

    if (action === "set-audience") {
      const itemId = String(body.itemId || "").trim();
      if (!(await knownItem(itemId))) return reply(404, { ok: false, code: "LIBRARY_ITEM_NOT_FOUND", error: "الامتحان غير موجود في المكتبة." });
      if (!AUDIENCES.includes(body.audience)) return bad("AUDIENCE_INVALID", "اختر: لكل المعلمين، أو معلمين محددين.");
      const list = body.audience === "all" ? [] : idList(body.teachers === undefined ? [] : body.teachers, MAX_TEACHERS);
      if (!list) return bad("TEACHERS_INVALID", "قائمة المعلمين غير صالحة.");
      const known = list.length ? await knownTeachers() : new Set();
      const unknown = list.filter(t => !isTeacherAccountId(t) || !known.has(t));
      if (unknown.length) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود.", unknown });
      const teachers = list.sort();
      // Tadris+ P10-L (O14) — the record states the change before it happens: the current audience is read first.
      let before;
      try { before = audienceOf(await readAudienceDoc(container, deps), itemId); } catch (e) { if (e instanceof LibraryAccessError) return UNAVAILABLE(); throw e; }
      const added = teachers.filter(t => !before.teachers.includes(t)), removed = before.teachers.filter(t => !teachers.includes(t));
      return await recordOwnerChange(container, { actor, action: "owner.library.audience-set", targetType: "library-item", targetId: itemId, targetLabel: itemId, details: { audience: body.audience, previousAudience: before.audience, teachers: teachers.length, added, removed } }, async () => {
        try {
          await mutateAudience(container, doc => { doc.items[itemId] = { audience: body.audience, teachers, updatedAt: iso, updatedBy: actor }; }, deps);
        } catch (e) { if (e instanceof LibraryAccessError) return UNAVAILABLE(); throw e; }
        return reply(200, { ok: true, item: { libraryItemId: itemId, audience: body.audience, teachers, decided: true } });
      }, { write });
    }

    if (action === "set-teacher") {
      const accountId = String(body.accountId || "").trim();
      if (!isTeacherAccountId(accountId) || !(await knownTeachers()).has(accountId)) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const include = idList(body.include === undefined ? [] : body.include, 1000), exclude = idList(body.exclude === undefined ? [] : body.exclude, 1000);
      if (!include || !exclude || include.some(id => exclude.includes(id))) return bad("ITEMS_INVALID", "قائمة الامتحانات غير صالحة.");
      const unknown = [];
      for (const id of [...include, ...exclude]) if (!(await knownItem(id))) unknown.push(id);
      if (unknown.length) return reply(404, { ok: false, code: "LIBRARY_ITEM_NOT_FOUND", error: "الامتحان غير موجود في المكتبة.", unknown });
      // Tadris+ P10-L (O14) — what changes (and a refusal) is worked out from the current document BEFORE the record; the write below
      // applies the same rule again under compare-and-set. Nothing to change → nothing written, nothing recorded.
      const plan = doc => {
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
      };
      let planned;
      try { planned = plan(JSON.parse(JSON.stringify(await readAudienceDoc(container, deps)))); } catch (e) {
        if (e instanceof Refusal) return reply(e.status, { ok: false, code: e.code, error: e.error, ...e.extra });
        if (e instanceof LibraryAccessError) return UNAVAILABLE();
        throw e;
      }
      if (!planned.added.length && !planned.removed.length) return reply(200, { ok: true, accountId, added: [], removed: [] });
      return await recordOwnerChange(container, { actor, action: "owner.library.teacher-set", targetType: "teacher-account", targetId: accountId, targetLabel: accountId, details: planned }, async () => {
        let changed;
        try { changed = await mutateAudience(container, plan, deps); } catch (e) {
          if (e instanceof Refusal) return reply(e.status, { ok: false, code: e.code, error: e.error, ...e.extra });
          if (e instanceof LibraryAccessError) return UNAVAILABLE();
          throw e;
        }
        return reply(200, { ok: true, accountId, ...changed });
      }, { write });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    if (e instanceof IMP.ImportedLibraryError) return UNAVAILABLE();
    obs?.logError?.("owner.library.error", e);
    return reply(500, { ok: false, error: "تعذر تنفيذ هذا الإجراء حاليًا." });
  }
}

// ── Tadris+ P6-E — POST import ───────────────────────────────────────────────────────────────────────────────────────────────────
const MAX_EXAM_BYTES = 10 * 1024 * 1024;
const MAX_TITLE = 200, MAX_DESCRIPTION = 500, MAX_FILE_NAME = 200;
const ACTIVITY_TYPES = ["exam", "training"];
// A renderable image is shown verbatim (<img src>), so only an embedded raster data URL may be one (the client importer's rule,
// docs/STRUCTURED_EXAM_IMPORT.md): never a link, never SVG or another data: type.
const SAFE_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
function unsafeImages(node, depth = 0) {
  if (depth > 64) return 1;
  if (Array.isArray(node)) return node.reduce((n, v) => n + unsafeImages(v, depth + 1), 0);
  if (!node || typeof node !== "object") return 0;
  let n = 0;
  for (const [k, v] of Object.entries(node)) {
    if (k === "dataUrl" && v !== undefined && v !== null && v !== "" && !(typeof v === "string" && SAFE_IMAGE.test(v))) n++;
    else if (v && typeof v === "object") n += unsafeImages(v, depth + 1);
  }
  return n;
}
const text = (v, max) => (typeof v === "string" ? v.trim() : "").slice(0, max);

async function importExam(body, { container, deps, actor, iso, write }) {
  const exam = body.exam;
  if (!exam || typeof exam !== "object" || Array.isArray(exam) || !Array.isArray(exam.sections) || Array.isArray(exam.questions)) {
    return bad("EXAM_INVALID", "الملف ليس امتحانًا منظّمًا (sections).");
  }
  let raw;
  try { raw = JSON.stringify(exam); } catch { return bad("EXAM_INVALID", "الملف ليس امتحانًا منظّمًا (sections)."); }
  if (Buffer.byteLength(raw) > MAX_EXAM_BYTES) return reply(413, { ok: false, code: "EXAM_TOO_LARGE", error: "الامتحان كبير جدًّا (الحد الأقصى ~10 ميغابايت)." });
  const title = text(body.title, MAX_TITLE);
  if (!title) return bad("TITLE_REQUIRED", "اكتب عنوان الامتحان.");
  const category = text(body.category, 40);
  if (!IMP.CATEGORY.test(category)) return bad("CATEGORY_INVALID", "اختر تصنيف الامتحان.");
  if (!ACTIVITY_TYPES.includes(body.activityType)) return bad("ACTIVITY_TYPE_INVALID", "اختر: امتحان أو تدريب.");
  if (unsafeImages(exam)) return bad("IMAGE_UNSAFE", "في الامتحان صورة غير مضمّنة أو غير آمنة. الصور المقبولة: PNG أو JPEG أو WEBP أو GIF مضمّنة في الملف.");
  // The SERVER decides the exam is ready — the same authority as the builder's «اعتماد نهائي» and governance (shared-finalization).
  const snapshot = JSON.parse(raw);
  let decision;
  try { decision = evaluateServerFinalization(snapshot); } catch { decision = null; }
  if (!decision || decision.canFinalize !== true) {
    return reply(422, { ok: false, code: "EXAM_NOT_READY", error: "الامتحان غير جاهز للنشر: أصلح الأخطاء المتبقية في الملف ثم أعد الاستيراد.", finalization: decision ? summarizeFinalization(decision) : null });
  }
  const stats = examOfficialStats(snapshot);
  if (!stats.questionCount) return bad("EXAM_EMPTY", "لا يحتوي الامتحان على أسئلة.");
  // The same exam = the same sections (the examId and import time differ on every import of one file).
  const contentHash = crypto.createHash("sha256").update(JSON.stringify(snapshot.sections)).digest("hex");
  let index;
  try { index = await IMP.readImportedIndex(container, deps); } catch { return UNAVAILABLE(); }
  const same = index.items.find(m => m.contentHash === contentHash);
  if (same) return reply(409, { ok: false, code: "LIBRARY_ITEM_DUPLICATE", error: "هذا الامتحان موجود في البنك بالفعل («" + same.title + "»).", libraryItemId: same.libraryItemId });

  const description = text(body.description, MAX_DESCRIPTION), sourceFileName = text(body.sourceFileName, MAX_FILE_NAME);
  let id = IMP.nextImportedId(index);
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = {
      libraryItemId: id, title, category, description, tags: [], questionCount: stats.questionCount, totalMarks: stats.totalMarks,
      conversionStatus: "ready", publishable: true, activityType: body.activityType, libraryVersion: 1, contentHash, convertedAt: iso,
      source: { kind: "owner-import", ...(sourceFileName ? { sourceFile: sourceFileName } : {}) }, schemaVersion: 1,
      examSnapshot: { ...snapshot, examId: "LIB-" + id, title, status: "final", totalMarks: stats.totalMarks }
    };
    const response = await recordOwnerChange(container, {
      actor, action: "owner.library.item-imported", targetType: "library-item", targetId: id, targetLabel: title,
      details: { category, activityType: body.activityType, questionCount: stats.questionCount, totalMarks: stats.totalMarks, contentHash, sourceFile: sourceFileName }
    }, async () => {
      const outcome = await IMP.publishImportedItem(container, item, deps);
      if (outcome === "taken") return reply(409, { ok: false, code: "LIBRARY_ID_TAKEN", error: "تعارض مؤقت. حاول مرة أخرى." });
      if (outcome === "duplicate") return reply(409, { ok: false, code: "LIBRARY_ITEM_DUPLICATE", error: "هذا الامتحان موجود في البنك بالفعل." });
      return reply(200, { ok: true, item: { libraryItemId: id, title, category, activityType: body.activityType, questionCount: stats.questionCount, totalMarks: stats.totalMarks, audience: "selected", teachers: [], decided: false, imported: true } });
    }, { write });
    if (response.status !== 409 || response.jsonBody.code !== "LIBRARY_ID_TAKEN") return response;
    id = "IMP-" + String(Number(id.slice(4)) + 1).padStart(3, "0");
  }
  return reply(409, { ok: false, code: "LIBRARY_ID_TAKEN", error: "تعارض مؤقت. حاول مرة أخرى." });
}

app.http("ownerLibrary", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-library/{action?}", handler: withObservability("owner-library", handler) });

module.exports = { handler };
