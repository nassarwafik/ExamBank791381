const crypto = require("crypto");
const IMP = require("./exam-library-imported");
const { recordOwnerChange } = require("./audit-log");
const { NO_STORE } = require("./identity/owner-session");
const { evaluateServerFinalization, summarizeFinalization } = require("./server-finalization");
const { examOfficialStats } = require("./exam-structure");
const { normalizeBankAssetsForStorage } = require("./bank-asset-hydrate");
const { contentAssetPathOf } = require("./content-assets");
const { audienceOf, mutateAudience } = require("./access/library-access");

// Tadris+ P6-E / P6-F — the ONE way an exam becomes a library exam (IMP-nnn), whatever brought it: a JSON file the owner imported
// (P6-E) or an exam a teacher built and sent (P6-F). The SERVER decides it is ready (the shared finalization authority), only safe
// pictures are kept, an exam is never published twice, and every publication is recorded in the owner audit before it happens.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const bad = (code, error) => reply(400, { ok: false, code, error });
const UNAVAILABLE = () => reply(503, { ok: false, code: "LIBRARY_AUDIENCE_UNAVAILABLE", error: "تعذر قراءة بنوك الامتحانات حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

const MAX_EXAM_BYTES = 10 * 1024 * 1024;
const MAX_TITLE = 200, MAX_DESCRIPTION = 500, MAX_FILE_NAME = 200;
const ACTIVITY_TYPES = ["exam", "training"];
// A renderable image is shown verbatim (<img src>), so a stored one is: an embedded raster data URL (the client importer's rule,
// docs/STRUCTURED_EXAM_IMPORT.md), or — P6-F, an exam built in the builder — a protected library picture's stored path. A picture
// uploaded in the builder is a bank asset (identity only, no dataUrl: signed at delivery). Never a link, never SVG or another type.
const SAFE_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
function unsafeImages(node, depth = 0) {
  if (depth > 64) return 1;
  if (Array.isArray(node)) return node.reduce((n, v) => n + unsafeImages(v, depth + 1), 0);
  if (!node || typeof node !== "object") return 0;
  let n = 0;
  for (const [k, v] of Object.entries(node)) {
    if (k === "dataUrl" && v !== undefined && v !== null && v !== "" && !(typeof v === "string" && (SAFE_IMAGE.test(v) || contentAssetPathOf(v)))) n++;
    else if (v && typeof v === "object") n += unsafeImages(v, depth + 1);
  }
  return n;
}
const text = (v, max) => (typeof v === "string" ? v.trim() : "").slice(0, max);
const isStructured = exam => !!exam && typeof exam === "object" && !Array.isArray(exam) && Array.isArray(exam.sections) && !Array.isArray(exam.questions);
/** The same exam = the same sections (the examId and the time differ on every import / submission of one exam). */
const contentHashOf = snapshot => crypto.createHash("sha256").update(JSON.stringify(snapshot.sections)).digest("hex");

/**
 * Prepares an exam for the library: { ok: true, snapshot, stats, contentHash, finalization } or { ok: false, response }.
 * `invalidMessage` names what the caller received (a file, a saved exam). Assets are stored in their durable form (bank pictures:
 * identity only; protected pictures: their path) — nothing expiring is ever stored.
 */
function prepareLibraryExam(exam, { invalidMessage = "الملف ليس امتحانًا منظّمًا (sections).", notReadyMessage = "الامتحان غير جاهز للنشر: أصلح الأخطاء المتبقية في الملف ثم أعد الاستيراد." } = {}) {
  if (!isStructured(exam)) return { ok: false, response: bad("EXAM_INVALID", invalidMessage) };
  let raw;
  try { raw = JSON.stringify(normalizeBankAssetsForStorage(exam)); } catch { return { ok: false, response: bad("EXAM_INVALID", invalidMessage) }; }
  if (Buffer.byteLength(raw) > MAX_EXAM_BYTES) return { ok: false, response: reply(413, { ok: false, code: "EXAM_TOO_LARGE", error: "الامتحان كبير جدًّا (الحد الأقصى ~10 ميغابايت)." }) };
  const snapshot = JSON.parse(raw);
  if (unsafeImages(snapshot)) return { ok: false, response: bad("IMAGE_UNSAFE", "في الامتحان صورة غير مضمّنة أو غير آمنة. الصور المقبولة: PNG أو JPEG أو WEBP أو GIF مضمّنة في الملف.") };
  // The SERVER decides the exam is ready — the same authority as the builder's «اعتماد نهائي» and governance (shared-finalization).
  let decision;
  try { decision = evaluateServerFinalization(snapshot); } catch { decision = null; }
  if (!decision || decision.canFinalize !== true) {
    return { ok: false, response: reply(422, { ok: false, code: "EXAM_NOT_READY", error: notReadyMessage, finalization: decision ? summarizeFinalization(decision) : null,
      blockers: decision ? decision.blockers.slice(0, 12).map(b => String(b.message || "")) : [] }) };
  }
  const stats = examOfficialStats(snapshot);
  if (!stats.questionCount) return { ok: false, response: bad("EXAM_EMPTY", "لا يحتوي الامتحان على أسئلة.") };
  return { ok: true, snapshot, stats, contentHash: contentHashOf(snapshot), finalization: summarizeFinalization(decision) };
}

/** The owner's choices for a published exam: { ok: true, meta } or { ok: false, response }. */
function publishMeta(body) {
  const title = text(body.title, MAX_TITLE);
  if (!title) return { ok: false, response: bad("TITLE_REQUIRED", "اكتب عنوان الامتحان.") };
  const category = text(body.category, 40);
  if (!IMP.CATEGORY.test(category)) return { ok: false, response: bad("CATEGORY_INVALID", "اختر تصنيف الامتحان.") };
  if (!ACTIVITY_TYPES.includes(body.activityType)) return { ok: false, response: bad("ACTIVITY_TYPE_INVALID", "اختر: امتحان أو تدريب.") };
  return { ok: true, meta: { title, category, activityType: body.activityType, description: text(body.description, MAX_DESCRIPTION) } };
}

/**
 * P6-F — the replacement step of an updated version (owner decision (أ)): the new item takes the old one's audience, the old one is
 * shown to nobody, and both are marked (replaces / replacedBy). ONE compare-and-set of the audience record, then the index marks.
 * Idempotent: running it again changes nothing. Throws when storage refuses (the caller reports it).
 */
async function completeReplacement(container, newId, oldId, { actor, iso, deps = {} }) {
  await mutateAudience(container, doc => {
    // The new item takes the old one's audience — unless an audience was already chosen for it (by the owner, or by an earlier run of
    // this step): a choice is never overwritten. The old item is shown to nobody.
    if (!doc.items[newId]) { const old = audienceOf(doc, oldId); doc.items[newId] = { audience: old.audience, teachers: old.teachers, updatedAt: iso, updatedBy: actor }; }
    doc.items[oldId] = { audience: "selected", teachers: [], updatedAt: iso, updatedBy: actor };
  }, deps);
  await IMP.markReplacement(container, newId, oldId, deps);
}

/**
 * Publishes one prepared exam as IMP-nnn, recorded in the owner audit before it happens (P10-L). `source` is stored on the item;
 * `replaces` (P6-F) is the library item this one replaces; `after(item)` runs inside the recorded change once the item is listed
 * (e.g. the submission is marked published). Returns the route's response.
 */
async function publishLibraryItem(container, { prepared, meta, source, replaces = null, auditAction, auditDetails = {}, after = null }, { actor, iso, write, deps = {} }) {
  let index;
  try { index = await IMP.readImportedIndex(container, deps); } catch { return UNAVAILABLE(); }
  const same = index.items.find(m => m.contentHash === prepared.contentHash);
  if (same) return reply(409, { ok: false, code: "LIBRARY_ITEM_DUPLICATE", error: "هذا الامتحان موجود في البنك بالفعل («" + same.title + "»).", libraryItemId: same.libraryItemId });
  const { snapshot, stats, contentHash } = prepared;
  let id = IMP.nextImportedId(index);
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = {
      libraryItemId: id, title: meta.title, category: meta.category, description: meta.description, tags: [], questionCount: stats.questionCount, totalMarks: stats.totalMarks,
      conversionStatus: "ready", publishable: true, activityType: meta.activityType, libraryVersion: 1, contentHash, convertedAt: iso,
      source, ...(replaces ? { replaces } : {}), schemaVersion: 1,
      examSnapshot: { ...snapshot, examId: "LIB-" + id, title: meta.title, status: "final", totalMarks: stats.totalMarks }
    };
    const response = await recordOwnerChange(container, {
      actor, action: auditAction, targetType: "library-item", targetId: id, targetLabel: meta.title,
      details: { category: meta.category, activityType: meta.activityType, questionCount: stats.questionCount, totalMarks: stats.totalMarks, contentHash, ...(replaces ? { replaces } : {}), ...auditDetails }
    }, async () => {
      const outcome = await IMP.publishImportedItem(container, item, deps);
      if (outcome === "taken") return reply(409, { ok: false, code: "LIBRARY_ID_TAKEN", error: "تعارض مؤقت. حاول مرة أخرى." });
      if (outcome === "duplicate") return reply(409, { ok: false, code: "LIBRARY_ITEM_DUPLICATE", error: "هذا الامتحان موجود في البنك بالفعل." });
      const extra = after ? await after(item) : {};
      // P6-F — an updated version: its audience moves over now. If storage refuses, the new item stays «لم يُحدَّد بعد» and the old
      // one stays visible (nobody loses anything); the owner completes it later (complete-replacement).
      let replacementPending = false;
      if (replaces) {
        try { await completeReplacement(container, id, replaces, { actor, iso, deps }); } catch { replacementPending = true; }
      }
      return reply(200, { ok: true, ...extra, ...(replaces ? { replaces, replacementPending } : {}),
        item: { libraryItemId: id, title: meta.title, category: meta.category, activityType: meta.activityType, questionCount: stats.questionCount, totalMarks: stats.totalMarks,
          audience: "selected", teachers: [], decided: false, imported: true, ...(replaces ? { replaces } : {}) } });
    }, { write });
    if (response.status !== 409 || response.jsonBody.code !== "LIBRARY_ID_TAKEN") return response;
    id = "IMP-" + String(Number(id.slice(4)) + 1).padStart(3, "0");
  }
  return reply(409, { ok: false, code: "LIBRARY_ID_TAKEN", error: "تعارض مؤقت. حاول مرة أخرى." });
}

module.exports = {
  reply, bad, UNAVAILABLE, MAX_EXAM_BYTES, ACTIVITY_TYPES, SAFE_IMAGE, unsafeImages, text, isStructured, contentHashOf,
  prepareLibraryExam, publishMeta, publishLibraryItem, completeReplacement
};
