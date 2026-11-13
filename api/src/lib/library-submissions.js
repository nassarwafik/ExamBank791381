const crypto = require("crypto");
const storage = require("./platform-storage");
const { BlobServiceClient } = require("@azure/storage-blob");
const { storedOwnerOf } = require("./saved-exam-access");
const { countExamQuestions } = require("./exam-structure");
const { resolveGovernedExamSource, GovernanceError } = require("./exam-governance");

// Tadris+ P6-F — a teacher sends an exam they built to the platform bank; the owner reviews it and publishes it (an IMP-nnn library
// exam, lib/library-publish.js) or declines it with a reason (docs/enterprise-library-submissions-p6f.md; owner decisions (2), (أ)).
//
//   platform/catalog/library-submissions/<id>.json    ONE submission: who sent it, from which saved exam, and the FROZEN exam as it
//                                                      was at that moment. Written once (create-only), never changed.
//   platform/catalog/library-submissions-index.json   the index: every submission's summary and its STATUS — the only mutable part,
//                                                      compare-and-set. A submission not listed does not exist.
//
// The server reads the exam from storage itself (the teacher's own saved exam — or, when it is governed, its PUBLISHED revision);
// a browser never sends an exam body. Anything that cannot be understood fails CLOSED (SubmissionsUnavailableError → 503).

const SUBMISSION_PREFIX = "platform/catalog/library-submissions/";
const INDEX_DOC = "platform/catalog/library-submissions-index.json";
const SUBMISSION_ID = /^sub_[0-9a-f]{20}$/;
const STATUSES = Object.freeze(["pending", "published", "declined", "withdrawn", "superseded"]);
const MAX_PENDING_PER_TEACHER = 20;
const MAX_INDEX = 5000;
const MAX_REASON = 300;
const SAVED_EXAM_BLOB = /^exams\/[A-Za-z0-9._-]{1,200}\.json$/;
const BANK_CONTAINER = "bank";

class SubmissionsUnavailableError extends Error {
  constructor(message) { super(message); this.name = "SubmissionsUnavailableError"; this.code = "LIBRARY_SUBMISSIONS_UNAVAILABLE"; }
}
/** A refusal the routes answer as is ({ status, code, error }). */
class SubmissionRefusal extends Error {
  constructor(status, code, error, extra = {}) { super(code); this.status = status; this.code = code; this.error = error; this.extra = extra; }
}

const submissionName = id => SUBMISSION_PREFIX + id + ".json";
/** The series an exam belongs to: one teacher's one saved exam. An updated version of it replaces the previous one (decision (أ)). */
const lineageOf = (teacherId, savedExamBlob) => teacherId + ":" + savedExamBlob;
const isSafeSavedExamBlob = v => typeof v === "string" && SAVED_EXAM_BLOB.test(v) && !v.includes("..");
const validIso = v => typeof v === "string" && Number.isFinite(Date.parse(v));

function validRow(r) {
  return !!r && typeof r === "object" && SUBMISSION_ID.test(String(r.submissionId || "")) && typeof r.teacherId === "string" && !!r.teacherId
    && isSafeSavedExamBlob(r.savedExamBlob) && typeof r.title === "string" && STATUSES.includes(r.status) && validIso(r.submittedAt)
    && typeof r.contentHash === "string" && /^[0-9a-f]{64}$/.test(r.contentHash) && r.lineage === lineageOf(r.teacherId, r.savedExamBlob);
}
/** Validates a stored index ({ items: [] } when there is none). Throws SubmissionsUnavailableError when it cannot be understood. */
function parseIndex(doc) {
  if (!doc) return { schemaVersion: 1, items: [] };
  if (doc.schemaVersion !== 1 || !Array.isArray(doc.items) || doc.items.length > MAX_INDEX) throw new SubmissionsUnavailableError("submissions index invalid");
  const seen = new Set();
  for (const r of doc.items) {
    if (!validRow(r) || seen.has(r.submissionId)) throw new SubmissionsUnavailableError("submissions index entry invalid");
    seen.add(r.submissionId);
  }
  return doc;
}
async function readIndex(container, deps = {}) {
  let doc;
  try { doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, INDEX_DOC); }
  catch { throw new SubmissionsUnavailableError("submissions index unreadable"); }
  return parseIndex(doc);
}
async function mutateIndex(container, change, deps = {}) {
  let result;
  await (deps.mutateJsonWithRetry || storage.mutateJsonWithRetry)(container, INDEX_DOC, current => {
    const doc = JSON.parse(JSON.stringify(parseIndex(current)));
    result = change(doc);
    parseIndex(doc);
    return doc;
  });
  return result;
}

/** One submission's FROZEN exam: listed in the index and exactly the exam the index describes, else it fails closed. */
async function readSubmission(container, submissionId, deps = {}, index = null) {
  const id = String(submissionId || "");
  if (!SUBMISSION_ID.test(id)) return null;
  const row = (index || (await readIndex(container, deps))).items.find(r => r.submissionId === id);
  if (!row) return null;
  let doc;
  try { doc = await (deps.downloadJsonOrNull || storage.downloadJsonOrNull)(container, submissionName(id)); }
  catch { throw new SubmissionsUnavailableError("submission unreadable"); }
  if (!doc || doc.submissionId !== id || doc.teacherId !== row.teacherId || doc.contentHash !== row.contentHash || !doc.examSnapshot || typeof doc.examSnapshot !== "object") {
    throw new SubmissionsUnavailableError("submission invalid: " + id);
  }
  return { row, doc };
}

// ── the teacher's saved exams live in the bank container (manage-saved-exams.js) ─────────────────────────────────────────────────
function getBankContainer() {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");
  return BlobServiceClient.fromConnectionString(cs).getContainerClient(BANK_CONTAINER);
}

/**
 * The exam a teacher may send: THEIR OWN saved exam (its stored owner is exactly this account — an unowned or another teacher's exam
 * is answered like a missing one), structured; when it is governed (14A), its PUBLISHED revision — never a draft. Throws
 * SubmissionRefusal. Returns { exam, title, governed }.
 */
async function sendableExam({ bankContainer, platformContainer, teacherId, savedExamBlob, deps = {} }) {
  if (!isSafeSavedExamBlob(savedExamBlob)) throw new SubmissionRefusal(400, "SAVED_EXAM_INVALID", "الامتحان المحفوظ غير صالح.");
  let document;
  try { document = await (deps.downloadBankJsonOrNull || storage.downloadJsonOrNull)(bankContainer, savedExamBlob); }
  catch { throw new SubmissionsUnavailableError("saved exam unreadable"); }
  if (!document || !document.exam || storedOwnerOf(document) !== teacherId) throw new SubmissionRefusal(404, "EXAM_NOT_FOUND", "الامتحان غير موجود.");
  let exam = document.exam, governed = false;
  if (!Array.isArray(exam.sections)) throw new SubmissionRefusal(400, "EXAM_NOT_STRUCTURED", "يُرسل إلى بنك المنصة الامتحان المنظّم فقط. حوّله إلى منظّم من «امتحاناتي» أولًا.");
  try {
    const gov = await (deps.resolveGovernedExamSource || resolveGovernedExamSource)(platformContainer, String(exam.examId || ""), { downloadJsonOrNull: deps.downloadJsonOrNull || storage.downloadJsonOrNull });
    if (gov.governed) { exam = gov.revision.exam; governed = true; }
  } catch (e) {
    if (e instanceof GovernanceError) {
      throw new SubmissionRefusal(409, e.code === "NO_PUBLISHED_REVISION" ? "NO_PUBLISHED_REVISION" : "GOVERNANCE_UNAVAILABLE",
        e.code === "NO_PUBLISHED_REVISION" ? "هذا الامتحان يخضع لمراجعات النشر: انشره من «إدارة النشر والإصدارات» أولًا، ثم أرسله." : e.message);
    }
    throw e;
  }
  return { exam, title: String(exam.title || document.exam.title || "امتحان").slice(0, 200), governed };
}

/**
 * Records one submission from a prepared exam (lib/library-publish.js prepareLibraryExam). A pending submission of the same saved
 * exam is superseded (the teacher sent an update before the owner decided). At most MAX_PENDING_PER_TEACHER pending. Returns the row.
 */
async function createSubmission(container, { teacherId, teacherName, savedExamBlob, governed, prepared, title, sentBy, iso }, deps = {}) {
  const lineage = lineageOf(teacherId, savedExamBlob);
  const index = await readIndex(container, deps);
  const pending = index.items.filter(r => r.teacherId === teacherId && r.status === "pending" && r.lineage !== lineage).length;
  if (pending >= MAX_PENDING_PER_TEACHER) throw new SubmissionRefusal(429, "TOO_MANY_PENDING", "لديك " + MAX_PENDING_PER_TEACHER + " امتحانًا قيد مراجعة المالك. انتظر قراره أو اسحب بعضها.");
  const submissionId = "sub_" + crypto.randomBytes(10).toString("hex");
  const doc = { schemaVersion: 1, submissionId, teacherId, savedExamBlob, lineage, contentHash: prepared.contentHash, governed: !!governed, sentBy, submittedAt: iso, examSnapshot: prepared.snapshot };
  try { await (deps.uploadJsonConditional || storage.uploadJsonConditional)(container, submissionName(submissionId), doc, null); }
  catch (e) { if (storage.isConcurrencyConflict(e)) throw new SubmissionRefusal(409, "SUBMISSION_CONFLICT", "تعارض مؤقت. حاول مرة أخرى."); throw e; }
  const row = { submissionId, teacherId, teacherName: String(teacherName || "").slice(0, 120), savedExamBlob, lineage, title, questionCount: prepared.stats.questionCount,
    totalMarks: prepared.stats.totalMarks, contentHash: prepared.contentHash, governed: !!governed, sentBy, submittedAt: iso, status: "pending" };
  await mutateIndex(container, idx => {
    const open = idx.items.filter(r => r.teacherId === teacherId && r.status === "pending" && r.lineage !== lineage).length;
    if (open >= MAX_PENDING_PER_TEACHER) throw new SubmissionRefusal(429, "TOO_MANY_PENDING", "لديك " + MAX_PENDING_PER_TEACHER + " امتحانًا قيد مراجعة المالك. انتظر قراره أو اسحب بعضها.");
    for (const r of idx.items) if (r.lineage === lineage && r.status === "pending") { r.status = "superseded"; r.decidedAt = iso; }
    idx.items.push(row);
    return row;
  }, deps);
  return row;
}

/**
 * Moves one submission from `from` (a status or a list) to `patch.status`, with the patch's fields. Refused (409) when it is not
 * in `from` any more — e.g. the teacher withdrew it while the owner was reviewing it. `check(row)` may refuse (throw) too.
 */
async function setStatus(container, submissionId, from, patch, deps = {}, check = null) {
  const allowed = Array.isArray(from) ? from : [from];
  return mutateIndex(container, idx => {
    const row = idx.items.find(r => r.submissionId === submissionId);
    if (!row) throw new SubmissionRefusal(404, "SUBMISSION_NOT_FOUND", "الإرسال غير موجود.");
    if (check) check(row);
    if (!allowed.includes(row.status)) throw new SubmissionRefusal(409, "SUBMISSION_NOT_PENDING", statusRefusal(row.status));
    Object.assign(row, patch);
    return { ...row };
  }, deps);
}
function statusRefusal(status) {
  return status === "withdrawn" ? "سحب المعلم هذا الإرسال." : status === "published" ? "نُشر هذا الإرسال بالفعل." : status === "declined" ? "رُفض هذا الإرسال بالفعل."
    : status === "superseded" ? "أرسل المعلم نسخة أحدث من هذا الامتحان." : "لم يعد هذا الإرسال قيد المراجعة.";
}

/** The summary a teacher sees of their own submissions (no exam body, nobody else's). */
const teacherView = r => ({ submissionId: r.submissionId, savedExamBlob: r.savedExamBlob, title: r.title, questionCount: r.questionCount, status: r.status,
  submittedAt: r.submittedAt, ...(r.decidedAt ? { decidedAt: r.decidedAt } : {}), ...(r.status === "declined" && r.reason ? { reason: r.reason } : {}),
  ...(r.status === "published" ? { published: true } : {}) });

/** The owner's own saved exams: those of the teacher account linked to the owner (P4-D), structured ones, newest first. */
async function linkedSavedExams(bankContainer, teacherId, deps = {}) {
  const out = [];
  let examined = 0;
  const list = deps.listBankBlobNames ? await deps.listBankBlobNames(bankContainer, "exams/") : await storage.listBlobNames(bankContainer, "exams/");
  for (const name of list) {
    if (out.length >= 100 || examined >= 2000) break;
    examined += 1;
    if (!isSafeSavedExamBlob(name)) continue;
    let document;
    try { document = await (deps.downloadBankJsonOrNull || storage.downloadJsonOrNull)(bankContainer, name); } catch { continue; }
    if (!document || !document.exam || storedOwnerOf(document) !== teacherId || !Array.isArray(document.exam.sections)) continue;
    out.push({ blobName: name, title: String(document.exam.title || "امتحان بدون عنوان"), savedAt: String(document.savedAt || document.exam.updatedAt || ""), questionCount: countExamQuestions(document.exam) });
  }
  return out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

module.exports = {
  SUBMISSION_PREFIX, INDEX_DOC, SUBMISSION_ID, STATUSES, MAX_PENDING_PER_TEACHER, MAX_REASON, SubmissionsUnavailableError, SubmissionRefusal,
  submissionName, lineageOf, isSafeSavedExamBlob, parseIndex, readIndex, mutateIndex, readSubmission, getBankContainer, sendableExam,
  createSubmission, setStatus, teacherView, linkedSavedExams
};
