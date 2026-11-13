const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordOwnerChange } = require("../lib/audit-log");   // Tadris+ P10-L: recorded before the change
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { listTeacherAccounts } = require("../lib/identity/teacher-accounts");
const { libraryItemEntry } = require("../lib/exam-library-store");
const { AUDIENCES, MAX_TEACHERS, LibraryAccessError, readAudienceDoc, audienceOf, mutateAudience } = require("../lib/access/library-access");
const IMP = require("../lib/exam-library-imported");   // Tadris+ P6-E — exams the owner imports
const LP = require("../lib/library-publish");   // Tadris+ P6-E / P6-F — preparation and publication of a library exam
const LS = require("../lib/library-submissions");   // Tadris+ P6-F — the exams teachers send
const { readTeacherAccount } = require("../lib/identity/teacher-accounts");
const { hydrateBankAssets } = require("../lib/bank-asset-hydrate");
const { evaluateServerFinalization, summarizeFinalization } = require("../lib/server-finalization");

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
        return { libraryItemId: i.libraryItemId, title: String(i.title || ""), category: String(i.category || ""), questionCount: Number(i.questionCount || 0), totalMarks: Number(i.totalMarks || 0), audience: a.audience, teachers: a.teachers, decided: a.stored || a.audience === "all", imported: IMP.IMPORTED_ID.test(i.libraryItemId), ...(i.activityType ? { activityType: i.activityType } : {}),
          // Tadris+ P6-F — an exam a teacher sent, and the versions of one exam (an updated version replaces the previous one)
          ...(i.source && i.source.kind === "teacher-submission" ? { fromTeacher: true } : {}), ...(i.replaces ? { replaces: i.replaces } : {}), ...(i.replacedBy ? { replacedBy: i.replacedBy } : {}) };
      });
      return reply(200, { ok: true, items, teachers });
    }
    // ── Tadris+ P6-F — reading the submissions (no change: no step-up) ─────────────────────────────────────────────────────────────
    if (method === "GET" && action === "submissions") return await listSubmissions(container, deps);
    if (method === "GET" && action === "submission") return await oneSubmission(container, deps, new URL(request.url, "https://x").searchParams.get("id"));
    if (method === "GET" && action === "own-exams") return await ownExams(owner, deps);
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
    // Tadris+ P6-F — deciding the submissions
    if (action === "publish-submission") return await publishSubmission(body, { container, deps, actor, iso, write });
    if (action === "decline-submission") return await declineSubmission(body, { container, deps, actor, iso, write });
    if (action === "complete-replacement") return await finishReplacement(body, { container, deps, actor, iso, write });
    if (action === "take-own") return await takeOwnExam(body, { owner, container, deps, actor, iso, write });

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
    if (e instanceof IMP.ImportedLibraryError || e instanceof LS.SubmissionsUnavailableError || e instanceof LibraryAccessError) return UNAVAILABLE();
    if (e instanceof LS.SubmissionRefusal) return reply(e.status, { ok: false, code: e.code, error: e.error, ...e.extra });
    obs?.logError?.("owner.library.error", e);
    return reply(500, { ok: false, error: "تعذر تنفيذ هذا الإجراء حاليًا." });
  }
}

// ── Tadris+ P6-E — POST import (the preparation and the publication are lib/library-publish.js, shared with P6-F) ─────────────────
async function importExam(body, { container, deps, actor, iso, write }) {
  const prepared = LP.prepareLibraryExam(body.exam);
  if (!prepared.ok) return prepared.response;
  const m = LP.publishMeta(body);
  if (!m.ok) return m.response;
  const sourceFileName = LP.text(body.sourceFileName, 200);
  return LP.publishLibraryItem(container, {
    prepared, meta: m.meta, source: { kind: "owner-import", ...(sourceFileName ? { sourceFile: sourceFileName } : {}) },
    auditAction: "owner.library.item-imported", auditDetails: { sourceFile: sourceFileName }
  }, { actor, iso, write, deps });
}

// ── Tadris+ P6-F — the exams teachers send (docs/enterprise-library-submissions-p6f.md) ──────────────────────────────────────────
const ownerRow = r => ({ submissionId: r.submissionId, teacherId: r.teacherId, teacherName: r.teacherName || "", title: r.title, questionCount: r.questionCount,
  totalMarks: r.totalMarks, status: r.status, submittedAt: r.submittedAt, sentBy: r.sentBy || "teacher", governed: !!r.governed,
  ...(r.decidedAt ? { decidedAt: r.decidedAt } : {}), ...(r.reason ? { reason: r.reason } : {}), ...(r.libraryItemId ? { libraryItemId: r.libraryItemId } : {}) });

async function listSubmissions(container, deps) {
  const index = await LS.readIndex(container, deps);
  const order = r => (r.status === "pending" ? 0 : 1);
  const submissions = index.items.map(ownerRow).sort((a, b) => order(a) - order(b) || String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return reply(200, { ok: true, submissions, pending: submissions.filter(r => r.status === "pending").length });
}

/** The library exam an exam's series currently stands for (the latest published version not yet replaced), or null. */
async function currentVersionOf(container, lineage, deps, lsIndex = null, impIndex = null) {
  const subs = (lsIndex || (await LS.readIndex(container, deps))).items.filter(r => r.lineage === lineage && r.status === "published" && r.libraryItemId);
  if (!subs.length) return null;
  const imp = impIndex || (await IMP.readImportedIndex(container, deps));
  const live = subs.map(r => imp.items.find(m => m.libraryItemId === r.libraryItemId)).filter(m => m && !m.replacedBy);
  live.sort((a, b) => String(b.convertedAt).localeCompare(String(a.convertedAt)));
  return live[0] ? { libraryItemId: live[0].libraryItemId, title: live[0].title } : null;
}

async function oneSubmission(container, deps, id) {
  const lsIndex = await LS.readIndex(container, deps);
  const found = await LS.readSubmission(container, id, deps, lsIndex);
  if (!found) return reply(404, { ok: false, code: "SUBMISSION_NOT_FOUND", error: "الإرسال غير موجود." });
  let decision = null;
  try { decision = evaluateServerFinalization(found.doc.examSnapshot); } catch { decision = null; }
  const replaces = await currentVersionOf(container, found.row.lineage, deps, lsIndex);
  return reply(200, { ok: true, submission: ownerRow(found.row), exam: hydrateBankAssets(found.doc.examSnapshot),
    finalization: decision ? summarizeFinalization(decision) : null, blockers: decision ? decision.blockers.slice(0, 12).map(b => String(b.message || "")) : [], replaces });
}

async function publishSubmission(body, { container, deps, actor, iso, write }) {
  const lsIndex = await LS.readIndex(container, deps);
  const found = await LS.readSubmission(container, body.submissionId, deps, lsIndex);
  if (!found) return reply(404, { ok: false, code: "SUBMISSION_NOT_FOUND", error: "الإرسال غير موجود." });
  const { row, doc } = found;
  if (row.status !== "pending") return reply(409, { ok: false, code: "SUBMISSION_NOT_PENDING", error: "لم يعد هذا الإرسال قيد المراجعة." });
  // The server decides again, on the FROZEN exam the teacher sent (never a browser body).
  const prepared = LP.prepareLibraryExam(doc.examSnapshot, { notReadyMessage: "الامتحان المرسل غير جاهز للنشر. ارفضه مع ذكر ما يجب إصلاحه." });
  if (!prepared.ok) return prepared.response;
  const m = LP.publishMeta(body);
  if (!m.ok) return m.response;
  const current = await currentVersionOf(container, row.lineage, deps, lsIndex);
  return LP.publishLibraryItem(container, {
    prepared, meta: m.meta, source: { kind: "teacher-submission", submissionId: row.submissionId }, replaces: current ? current.libraryItemId : null,
    auditAction: "owner.library.submission-published", auditDetails: { submissionId: row.submissionId, teacherId: row.teacherId },
    after: async item => {
      try { await LS.setStatus(container, row.submissionId, "pending", { status: "published", decidedAt: iso, libraryItemId: item.libraryItemId }, deps); }
      catch (e) { if (e instanceof LS.SubmissionRefusal) return { submissionId: row.submissionId, submissionNote: e.code }; throw e; }
      return { submissionId: row.submissionId };
    }
  }, { actor, iso, write, deps });
}

async function declineSubmission(body, { container, deps, actor, iso, write }) {
  const id = String(body.submissionId || "");
  const reason = LP.text(body.reason, LS.MAX_REASON);
  if (!reason) return reply(400, { ok: false, code: "REASON_REQUIRED", error: "اكتب سبب الرفض ليصل إلى المعلم." });
  const index = await LS.readIndex(container, deps);
  const row = index.items.find(r => r.submissionId === id);
  if (!row) return reply(404, { ok: false, code: "SUBMISSION_NOT_FOUND", error: "الإرسال غير موجود." });
  if (row.status !== "pending") return reply(409, { ok: false, code: "SUBMISSION_NOT_PENDING", error: "لم يعد هذا الإرسال قيد المراجعة." });
  return await recordOwnerChange(container, { actor, action: "owner.library.submission-declined", targetType: "library-submission", targetId: id, targetLabel: row.title,
    details: { teacherId: row.teacherId, reasonLength: reason.length } }, async () => {
    const updated = await LS.setStatus(container, id, "pending", { status: "declined", decidedAt: iso, reason }, deps);
    return reply(200, { ok: true, submission: ownerRow(updated) });
  }, { write });
}

async function finishReplacement(body, { container, deps, actor, iso, write }) {
  const id = String(body.libraryItemId || "");
  const index = await IMP.readImportedIndex(container, deps);
  const fresh = index.items.find(m => m.libraryItemId === id);
  const oldId = fresh && fresh.replaces;
  if (!fresh || !oldId) return reply(404, { ok: false, code: "REPLACEMENT_NOT_FOUND", error: "لا توجد نسخة سابقة لهذا الامتحان." });
  const old = index.items.find(m => m.libraryItemId === oldId);
  if (old && old.replacedBy === id) return reply(200, { ok: true, libraryItemId: id, replaces: oldId, alreadyComplete: true });
  return await recordOwnerChange(container, { actor, action: "owner.library.replacement-completed", targetType: "library-item", targetId: id, targetLabel: fresh.title, details: { replaces: oldId } }, async () => {
    await LP.completeReplacement(container, id, oldId, { actor, iso, deps });
    return reply(200, { ok: true, libraryItemId: id, replaces: oldId });
  }, { write });
}

/** The teacher account linked to the owner (P4-D) — the owner's own workspace — or "". */
const linkedAccountOf = owner => (owner && isTeacherAccountId(owner.linkedTeacherAccountId) ? owner.linkedTeacherAccountId : "");

async function ownExams(owner, deps) {
  const linked = linkedAccountOf(owner);
  if (!linked) return reply(200, { ok: true, linked: false, exams: [] });
  const bankContainer = deps.bankContainer || (deps.getBankContainer || LS.getBankContainer)();
  return reply(200, { ok: true, linked: true, exams: await LS.linkedSavedExams(bankContainer, linked, deps) });
}

async function takeOwnExam(body, { owner, container, deps, actor, iso, write }) {
  const linked = linkedAccountOf(owner);
  if (!linked) return reply(409, { ok: false, code: "NO_LINKED_WORKSPACE", error: "اربط حسابك بمساحة معلم أولًا من «نظرة عامة» ← «مساحة المعلم الخاصة بك»." });
  const savedExamBlob = String(body.blobName || "");
  const bankContainer = deps.bankContainer || (deps.getBankContainer || LS.getBankContainer)();
  const found = await LS.sendableExam({ bankContainer, platformContainer: container, teacherId: linked, savedExamBlob, deps });
  const prepared = LP.prepareLibraryExam(found.exam, { invalidMessage: "يُنشر في البنك الامتحان المنظّم فقط.", notReadyMessage: "الامتحان غير جاهز للنشر: أصلح ما يلي في الباني (مساحتك كمعلم) ثم أعد المحاولة." });
  if (!prepared.ok) return prepared.response;
  const account = await (deps.readTeacherAccount || readTeacherAccount)(container, linked, deps);
  return await recordOwnerChange(container, { actor, action: "owner.library.own-exam-taken", targetType: "saved-exam", targetId: savedExamBlob, targetLabel: found.title,
    details: { teacherId: linked, questionCount: prepared.stats.questionCount } }, async () => {
    const row = await LS.createSubmission(container, { teacherId: linked, teacherName: account ? account.displayName || account.username : "", savedExamBlob, governed: found.governed,
      prepared, title: found.title, sentBy: "owner", iso }, deps);
    return reply(200, { ok: true, submission: ownerRow(row) });
  }, { write });
}

app.http("ownerLibrary", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-library/{action?}", handler: withObservability("owner-library", handler) });

module.exports = { handler };
