const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");   // request id, duration, redacted errors; P10-I private, no-store
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
const { getContainer } = require("../lib/platform-storage");
const { recordAuditEvent } = require("../lib/audit-log");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount } = require("../lib/identity/teacher-accounts");
const LS = require("../lib/library-submissions");
const LP = require("../lib/library-publish");

// Tadris+ P6-F — «إرسال إلى بنك المنصة» (docs/enterprise-library-submissions-p6f.md; owner decision (2)). Route: /api/library-submissions
//
//   GET              → { submissions: [this teacher's own submissions: title, status, dates, the owner's reason when declined],
//                         consent: { version, text } }   (Tadris+ P6-G — the agreement the teacher's page shows before sending)
//   POST submit      { blobName, consentVersion }   sends THE TEACHER'S OWN saved exam (its stored owner is exactly this account). The server
//                                         reads it itself — when it is governed, its PUBLISHED revision — and freezes it: later edits
//                                         do not change what was sent. It must be ready (the shared finalization authority) — the
//                                         reasons are answered when it is not. A pending submission of the same exam is superseded.
//                                         P6-G: `consentVersion` must be the CURRENT agreement's version (the teacher agreed to the text
//                                         the server holds); else 400 CONSENT_REQUIRED with that text, nothing written.
//   POST withdraw    { submissionId }    the teacher's own pending submission → «سُحب».
//
// Capability: examBuilder.exam.save (route-capabilities.js) — sending is a use of what the teacher may save. Only an account-based
// (managed) session: an identity that predates the console has no account to attribute the exam to. Recorded in the teacher's
// activity log («سجل النشاط»). The owner decides in /api/owner-library (P6-F actions).

const reply = (status, body) => ({ status, jsonBody: body });
const UNAVAILABLE = () => ({ status: 503, headers: { "Retry-After": "5" }, jsonBody: { ok: false, code: "LIBRARY_SUBMISSIONS_UNAVAILABLE", error: "تعذر الوصول إلى إرسالات بنك المنصة حاليًا. حاول مرة أخرى." } });

async function handler(request, deps = {}, obs = null) {
  const auth = await requireTeacherSession(request, deps);
  if (!auth.ok) return auth.response;
  const method = String(request.method || "GET").toUpperCase();
  let body = {};
  if (method === "POST") { try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; } }
  const action = method === "GET" ? "GET" : String(body.action || "").trim().toLowerCase();
  const capabilityDenial = await requireCapability(auth, "library-submissions.js", action, deps, obs);   // Tadris+ P3-B
  if (capabilityDenial) return capabilityDenial;

  const teacherId = auth.user && auth.user.am === "managed" && isTeacherAccountId(auth.user.sub) ? auth.user.sub : "";
  if (!teacherId) return reply(403, { ok: false, code: "ACCOUNT_REQUIRED", error: "الإرسال إلى بنك المنصة متاح لحسابات المعلمين فقط." });
  const container = deps.container || (deps.getContainer || getContainer)();
  const iso = new Date(deps.now ? deps.now() : Date.now()).toISOString();

  try {
    if (method === "GET") {
      const index = await LS.readIndex(container, deps);
      const submissions = index.items.filter(r => r.teacherId === teacherId).map(LS.teacherView).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
      return reply(200, { ok: true, submissions, consent: { version: LS.CONSENT.version, text: LS.CONSENT.text } });
    }

    if (action === "submit") {
      const savedExamBlob = String(body.blobName || "");
      // Tadris+ P6-G — the agreement first: nothing is read or written for a teacher who has not agreed to the current text.
      if (body.consentVersion !== LS.CONSENT.version) {
        return reply(400, { ok: false, code: "CONSENT_REQUIRED", error: "وافق على إقرار حقوق الاستخدام لإرسال الامتحان.", consent: { version: LS.CONSENT.version, text: LS.CONSENT.text } });
      }
      const bankContainer = deps.bankContainer || (deps.getBankContainer || LS.getBankContainer)();
      const found = await LS.sendableExam({ bankContainer, platformContainer: container, teacherId, savedExamBlob, deps });
      const prepared = LP.prepareLibraryExam(found.exam, {
        invalidMessage: "يُرسل إلى بنك المنصة الامتحان المنظّم فقط.",
        notReadyMessage: "الامتحان غير جاهز للإرسال: افتحه في الباني وأصلح ما يمنع «اعتماد نهائي»، ثم احفظه وأرسله من جديد."
      });
      if (!prepared.ok) return prepared.response;
      const account = await (deps.readTeacherAccount || readTeacherAccount)(container, teacherId, deps);
      const row = await LS.createSubmission(container, { teacherId, teacherName: account ? account.displayName || account.username : "", savedExamBlob, governed: found.governed,
        prepared, title: found.title, sentBy: "teacher", iso, consent: { version: LS.CONSENT.version, at: iso } }, deps);
      await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: teacherId, action: "library.submission.sent", targetType: "saved-exam", targetId: savedExamBlob, targetLabel: row.title,
        details: { submissionId: row.submissionId, questionCount: row.questionCount, governed: row.governed, consentVersion: LS.CONSENT.version } });
      return reply(200, { ok: true, submission: LS.teacherView(row) });
    }

    if (action === "withdraw") {
      const submissionId = String(body.submissionId || "");
      if (!LS.SUBMISSION_ID.test(submissionId)) return reply(404, { ok: false, code: "SUBMISSION_NOT_FOUND", error: "الإرسال غير موجود." });
      const row = await LS.setStatus(container, submissionId, "pending", { status: "withdrawn", decidedAt: iso }, deps, r => {
        if (r.teacherId !== teacherId) throw new LS.SubmissionRefusal(404, "SUBMISSION_NOT_FOUND", "الإرسال غير موجود.");   // another teacher's: like a missing one
      });
      await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: teacherId, action: "library.submission.withdrawn", targetType: "saved-exam", targetId: row.savedExamBlob, targetLabel: row.title,
        details: { submissionId } });
      return reply(200, { ok: true, submission: LS.teacherView(row) });
    }

    return reply(400, { ok: false, code: "UNKNOWN_ACTION", error: "إجراء غير معروف." });
  } catch (e) {
    if (e instanceof LS.SubmissionRefusal) return reply(e.status, { ok: false, code: e.code, error: e.error, ...e.extra });
    if (e instanceof LS.SubmissionsUnavailableError) return UNAVAILABLE();
    obs?.logError?.("library.submissions.error", e);
    return reply(500, { ok: false, error: "تعذر تنفيذ هذا الإجراء حاليًا." });
  }
}

app.http("librarySubmissions", { methods: ["GET", "POST"], authLevel: "anonymous", route: "library-submissions", handler: withObservability("library-submissions", handler) });

module.exports = { handler };
