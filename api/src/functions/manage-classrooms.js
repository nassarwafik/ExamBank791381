const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { mutateJsonWithRetry, StorageConflictError, uploadJsonConditional, isConcurrencyConflict } = require("../lib/platform-storage");
// Roadmap #25 — explicit, teacher-triggered roster-index repair (the only O(all-users) path in this function;
// the normal class list stays O(classes) and reads the cheap studentIds count).
const { canonicalMemberIds, reconcileRosterIndex } = require("../lib/class-roster-index");
const { normalizeClassStatus, applyClassLifecycleAction } = require("../lib/class-lifecycle");
const { recordAuditEvent } = require("../lib/audit-log");
// Phase 21G.0 — teacher tenancy: a teacher sees and changes only their own classes (shared pre-tenancy classes stay visible).
const { tenantOf, canAccessDocument, ownerStamp } = require("../lib/teacher-tenancy");
const { isSupportedProject } = require("../lib/project-tracker/registry");
const { getClassProgramCodes, normalizeProgramCodes, validateProgramCodes } = require("../lib/project-tracker/class-programs");
// Class Learning Materials — an INDEPENDENT domain from projects (programCodes): which book/course a class uses
// and which of its modules are currently published to students. Normalization + validation live in the lib; the
// handler only wires auth, lifecycle, CAS persistence and audit.
const { getClassLearningMaterials, setClassLearningCourseModules, removeClassLearningCourse, getVisibleLearningModuleIds } = require("../lib/class-learning-materials");
const { recordEventSafely } = require("../lib/notification-events");
const { validateLearningModuleIds, findLearningCourse } = require("../lib/learning-materials-registry");
// Classes & Students hardening — the classId is a blob-name segment: only the safe-id alphabet is accepted (a value such
// as "../auth/<hash>" would otherwise be resolved by the storage SDK to a document outside platform/classes/).
const { isSafeId, cleanText, LIMITS } = require("../lib/roster-input");
const { createPendingGradingReader, pendingForClassMembers, pendingClassMessage } = require("../lib/pending-grading");
const { loadDocs } = require("../lib/classes-students-read-cache");

/**
 * Validates + normalizes the teacher-typed class labels (NFC, invisible/bidi characters removed, whitespace
 * collapsed, bounded length). Returns { ok:true, value } or { ok:false, error } — pure, exported for unit tests.
 */
function normalizeClassFields(input) {
  const name = cleanText(input?.name);
  const grade = cleanText(input?.grade);
  const schoolYear = cleanText(input?.schoolYear);
  if (!name) return { ok: false, error: "اسم الصف مطلوب." };
  if (name.length > LIMITS.className) return { ok: false, error: "اسم الصف أطول من " + LIMITS.className + " حرفًا." };
  if (grade.length > LIMITS.grade) return { ok: false, error: "المرحلة أطول من " + LIMITS.grade + " حرفًا." };
  if (schoolYear.length > LIMITS.schoolYear) return { ok: false, error: "السنة الدراسية أطول من " + LIMITS.schoolYear + " حرفًا." };
  return { ok: true, value: { name, grade, schoolYear } };
}

// A class's programCode is valid only when it is empty (no project) or a project the registry knows.
// Pure + exported so the rule is unit-tested and enforced server-side (never trusting the UI).
function programCodeAccepted(programCode) {
  const code = String(programCode || "").trim();
  return code === "" || isSupportedProject(code);
}

const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// Thrown inside a CAS callback to mean "nothing to write" (idempotent no-op); carries the current document.
class NoChange extends Error { constructor(document) { super("no-change"); this.name = "NoChange"; this.document = document; } }
const BANK_CONTAINER = "bank";
const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function getContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");
  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(BANK_CONTAINER);
}

async function downloadJsonOrNull(container, blobName) {
  try {
    const response = await container.getBlobClient(blobName).download();
    if (!response.readableStreamBody) return null;
    return JSON.parse((await streamToBuffer(response.readableStreamBody)).toString("utf8"));
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === "BlobNotFound") return null;
    throw error;
  }
}

async function uploadJson(container, blobName, document) {
  const body = JSON.stringify(document, null, 2);
  await container.getBlockBlobClient(blobName).upload(body, Buffer.byteLength(body), {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
  });
}

// Phase S.2 — every class document is read through the shared ETag-verified cache (classes-students-read-cache): one listing,
// and only a new or changed document is downloaded (in parallel). `dl` (the handler's injected downloadJsonOrNull test seam)
// keeps the plain one-by-one read.
async function classDocuments(container, dl) {
  if (!dl) return loadDocs(container, CLASS_PREFIX);
  const docs = [];
  for await (const blob of container.listBlobsFlat({ prefix: CLASS_PREFIX })) if (blob.name.endsWith(".json")) docs.push(await dl(container, blob.name));
  return docs;
}

async function listClasses(container, dl, tenant = null) {
  const classes = [];
  for (const document of await classDocuments(container, dl)) {
    if (!document || !canAccessDocument(document, tenant)) continue;
    classes.push({
      classId: String(document.classId || ""),
      name: String(document.name || ""),
      grade: String(document.grade || ""),
      schoolYear: String(document.schoolYear || ""),
      programCode: String(document.programCode || ""),
      programCodes: getClassProgramCodes(document),
      active: document.active !== false,
      status: normalizeClassStatus(document),
      archivedAt: document.archivedAt || "",
      archivedBy: document.archivedBy || "",
      archiveReason: document.archiveReason || "",
      graduationYear: document.graduationYear || "",
      studentCount: Array.isArray(document.studentIds) ? document.studentIds.length : 0,
      // Normalized learning materials (course assignment + published module ids); [] when none. Derived from
      // this same document — no extra storage read.
      learningMaterials: getClassLearningMaterials(document),
      createdAt: String(document.createdAt || "")
    });
  }
  classes.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return classes;
}

// A class's project link may be changed only while the class is active (an archived class is read-only
// for the project tracker). Pure + exported so the rule is unit-tested.
function programChangeAllowed(classroom) {
  return normalizeClassStatus(classroom) !== "archived";
}

// Learning materials (course assignment / module publication) may be changed only while the class is active — an
// archived class is read-only for its teacher (view configuration, no publish/hide/remove). Same authority as the
// project link: normalizeClassStatus, never the raw `active` flag alone. Pure + exported for unit tests.
function learningMaterialsChangeAllowed(classroom) {
  return normalizeClassStatus(classroom) !== "archived";
}

// Batch-4 fix (D3) — a create request may carry a client `requestKey` (one per «إنشاء الصف» submission, reused by a
// double click or a retry). The class id is then derived from (teacher, key), so the same submission always names the same
// class and is stored with a create-only write: a repeat returns that class instead of creating a duplicate. Without a key
// (older clients) the id is random, as before.
const REQUEST_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
function classIdForRequestKey(requestKey, tenant) {
  if (typeof requestKey !== "string" || !REQUEST_KEY_PATTERN.test(requestKey.trim())) return null;
  return "cls-" + crypto.createHash("sha256").update(String(tenant || "") + "\u0000" + requestKey.trim()).digest("hex").slice(0, 32);
}

function buildNewClassroomDocument({ name, grade, schoolYear, programCode }, now, tenant = null, classId = null) {
  const doc = {
    schemaVersion: 1,
    classId: classId || crypto.randomUUID(),
    ...ownerStamp(tenant),
    name, grade, schoolYear,
    active: true,
    studentIds: [],
    createdAt: now,
    updatedAt: now
  };
  // Project membership is written in the CANONICAL multi-project shape (programCodes[]; [] = no project).
  // The legacy scalar `programCode` is never written for new documents — it stays readable through
  // class-programs.getClassProgramCodes for historical classrooms only (no migration).
  const code = String(programCode || "").trim();
  doc.programCodes = code ? [code] : [];
  return doc;
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}, obs = null) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const getC = deps.getContainer || getContainer;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const up = deps.uploadJson || uploadJson;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  // Phase S.2 — the class guards read the users through the shared ETag-verified cache (the documents are as current as a
  // plain listing: an unchanged ETag is the only reuse). deps.listJson stays the test seam.
  const ls = deps.listJson || loadDocs;
  // Audit is secondary — a recorder failure must never fail the class mutation (Roadmap #19). The real
  // recordAuditEvent already swallows; this wrapper extends the guarantee to any injected recorder.
  const rawRec = deps.recordAuditEvent || recordAuditEvent;
  const rec = async (c, ev) => { try { await rawRec(c, ev); } catch { /* audit is secondary */ } };
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;
    const container = deps.container || getC();
    const tenant = tenantOf(auth.user);

    if (request.method === "GET") {
      return { status: 200, jsonBody: { ok: true, classes: await listClasses(container, deps.downloadJsonOrNull ? dl : null, tenant) } };
    }

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "create").trim().toLowerCase();

    // Every action on an existing class names it by a SAFE id (checked before any storage read).
    if (action !== "create" && body?.classId !== undefined && body?.classId !== null && String(body.classId).trim() !== "" && !isSafeId(String(body.classId).trim())) {
      return { status: 400, jsonBody: { ok: false, error: "معرّف الصف غير صالح." } };
    }

    // Phase 21G.0 — every action on an existing class acts only on the teacher's own (or a shared pre-tenancy) class; another
    // teacher's class is reported exactly like a missing one. ownerId never changes after creation, so one check suffices.
    if (action !== "create" && tenant) {
      const targetId = String(body?.classId || "").trim();
      const target = targetId ? await dl(container, CLASS_PREFIX + targetId + ".json") : null;
      if (targetId && (!target || !canAccessDocument(target, tenant) || (target.classId !== undefined && String(target.classId) !== targetId))) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
    }

    if (action === "create") {
      const fields = normalizeClassFields(body);
      if (!fields.ok) return { status: 400, jsonBody: { ok: false, error: fields.error } };
      const { name, grade, schoolYear } = fields.value;
      const programCode = String(body?.programCode || "").trim();
      if (!programCodeAccepted(programCode)) return { status: 400, jsonBody: { ok: false, error: "مشروع غير مدعوم." } };

      if (body?.requestKey !== undefined && body?.requestKey !== null && !classIdForRequestKey(body.requestKey, tenant)) {
        return { status: 400, jsonBody: { ok: false, error: "مفتاح الطلب غير صالح." } };
      }
      const keyedId = classIdForRequestKey(body?.requestKey, tenant);
      const now = new Date().toISOString();
      const classroom = buildNewClassroomDocument({ name, grade, schoolYear, programCode }, now, tenant, keyedId);
      const classId = classroom.classId;
      if (keyedId) {
        try { await (deps.uploadJsonConditional || uploadJsonConditional)(container, CLASS_PREFIX + classId + ".json", classroom, null); }
        catch (e) {
          if (!isConcurrencyConflict(e)) throw e;
          // The same submission already created this class: answer with it, write and audit nothing.
          const existing = await dl(container, CLASS_PREFIX + classId + ".json");
          if (!existing || !canAccessDocument(existing, tenant)) throw e;
          const codes = getClassProgramCodes(existing);
          return {
            status: 200,
            jsonBody: { ok: true, duplicate: true, classroom: { classId, name: existing.name, grade: existing.grade, schoolYear: existing.schoolYear, programCodes: codes, programCode: codes[0] || "", active: existing.active !== false, studentCount: Array.isArray(existing.studentIds) ? existing.studentIds.length : 0, createdAt: existing.createdAt } }
          };
        }
      }
      else await up(container, CLASS_PREFIX + classId + ".json", classroom);
      // Roadmap #19: audit the class creation (high-value lifecycle mutation).
      const programCodes = getClassProgramCodes(classroom);
      await rec(container, { actor: auth.user?.sub, action: "class.create", targetType: "class", targetId: classId, targetLabel: name, details: { grade, schoolYear, ...(programCodes.length ? { programCodes } : {}) } });
      return {
        status: 200,
        // programCodes is canonical; programCode is kept (first code or "") only for older clients of this response.
        jsonBody: { ok: true, classroom: { classId, name, grade, schoolYear, programCodes, programCode: programCodes[0] || "", active: true, studentCount: 0, createdAt: now } }
      };
    }

    // Class details edit (name / grade / school year). CAS-protected; touches ONLY these labels + updatedAt (roster,
    // lifecycle, projects and learning materials untouched). An archived class is read-only (403), like every other
    // class mutation except the lifecycle itself. Idempotent: unchanged values write and audit nothing.
    if (action === "update") {
      const classId = String(body?.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      const fields = normalizeClassFields(body);
      if (!fields.ok) return { status: 400, jsonBody: { ok: false, error: fields.error } };
      let before = null;
      let updated = null;
      try {
        updated = await mut(container, CLASS_PREFIX + classId + ".json", current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          if (normalizeClassStatus(current) === "archived") { const blocked = new Error("الصف مؤرشف — فعّله أولًا لتعديل بياناته."); blocked.httpStatus = 403; throw blocked; }
          before = { name: String(current.name || ""), grade: String(current.grade || ""), schoolYear: String(current.schoolYear || "") };
          const next = fields.value;
          if (before.name === next.name && before.grade === next.grade && before.schoolYear === next.schoolYear) throw new NoChange(current);
          return { ...current, ...next, updatedAt: new Date().toISOString() };
        });
      } catch (mutateError) {
        if (mutateError instanceof NoChange) updated = null;
        else if (mutateError instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        else if (mutateError?.httpStatus) return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
        else throw mutateError;
      }
      if (updated) {
        const changed = ["name", "grade", "schoolYear"].filter(k => before[k] !== String(updated[k] || ""));
        await rec(container, { actor: auth.user?.sub, action: "class.update", targetType: "class", targetId: classId, targetLabel: String(updated.name || ""), details: { fields: changed, previousName: before.name } });
      }
      return { status: 200, jsonBody: { ok: true, classId, changed: Boolean(updated), ...fields.value } };
    }

    // Modern multi-project action, and the legacy single-project setProgram kept as a thin wrapper
    // (setProgram("899373") -> ["899373"]; setProgram("") -> []). Both write the modern programCodes[]
    // canonical field and drop the legacy programCode so no stale logic depends on it.
    if (action === "setprograms" || action === "setprogram") {
      const classId = String(body?.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      let nextCodes, baseCodes = null;
      try {
        nextCodes = action === "setprogram"
          ? validateProgramCodes([String(body?.programCode || "").trim()].filter(Boolean))
          : validateProgramCodes(body?.programCodes);
        // QA-7 — `baseProgramCodes` = the list this page started from. With it the request is applied as a CHANGE (codes it
        // added / removed) to the CURRENT stored list, so two teachers enrolling the class in different projects at the same
        // time both keep their enrollment. Without it (a bundle cached from before QA-7) the list is set as before.
        if (action !== "setprogram" && body?.baseProgramCodes !== undefined) {
          if (!Array.isArray(body.baseProgramCodes)) { const bad = new Error("قائمة المشاريع الأساسية غير صالحة."); bad.httpStatus = 400; throw bad; }
          baseCodes = normalizeProgramCodes(body.baseProgramCodes);
        }
      } catch (e) {
        return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message } };
      }

      let updatedLabel = "";
      try {
        const updated = await mut(container, CLASS_PREFIX + classId + ".json", current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          if (!programChangeAllowed(current)) { const blocked = new Error("الصف مؤرشف — لا يمكن تعديل مشاريعه."); blocked.httpStatus = 403; throw blocked; }
          if (baseCodes) {
            const added = nextCodes.filter(c => !baseCodes.includes(c)), removed = baseCodes.filter(c => !nextCodes.includes(c));
            const stored = getClassProgramCodes(current);
            current.programCodes = [...stored.filter(c => !removed.includes(c)), ...added.filter(c => !stored.includes(c))];
          } else current.programCodes = nextCodes;   // canonical modern field
          delete current.programCode;         // stop relying on the legacy field once migrated
          current.updatedAt = new Date().toISOString();
          return current;
        });
        updatedLabel = String(updated.name || "");
        // Roadmap #19: audit the project/program change (persistent class mutation, previously uncovered).
        await rec(container, { actor: auth.user?.sub, action: "class.setPrograms", targetType: "class", targetId: classId, targetLabel: updatedLabel, details: { programCodes: getClassProgramCodes(updated) } });
        return { status: 200, jsonBody: { ok: true, programCodes: getClassProgramCodes(updated) } };
      } catch (mutateError) {
        if (mutateError instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (mutateError?.httpStatus) return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
        throw mutateError;
      }
    }

    // Class Learning Materials — setLearningCourseModules: attach the course to the class if needed, then set
    // EXACTLY which of its modules are published to students (moduleIds:[] = attached, nothing released). Ids are
    // validated against the SERVER registry (unknown course/module → 400, skeleton modules are unknown here),
    // de-duplicated and canonicalized into content order. CAS-protected; touches ONLY learningMaterials +
    // updatedAt (projects, roster, lifecycle fields untouched). Archived class → 403. Audited.
    if (action === "setlearningcoursemodules") {
      const classId = String(body?.classId || "").trim();
      const courseId = String(body?.courseId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      if (!courseId) return { status: 400, jsonBody: { ok: false, error: "courseId is required." } };
      let moduleIds;
      try {
        moduleIds = validateLearningModuleIds(courseId, body?.moduleIds);
      } catch (e) {
        return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message } };
      }
      try {
        let newlyPublished = [];
        const updated = await mut(container, CLASS_PREFIX + classId + ".json", current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          if (!learningMaterialsChangeAllowed(current)) { const blocked = new Error("الصف مؤرشف — لا يمكن تعديل مواده التعليمية."); blocked.httpStatus = 403; throw blocked; }
          // Phase 6D — the AUTHORITATIVE previous publication (of the version this CAS attempt commits over) vs the next.
          const before = new Set(getVisibleLearningModuleIds(current, courseId));
          const next = setClassLearningCourseModules(current, courseId, moduleIds);
          newlyPublished = getVisibleLearningModuleIds(next, courseId).filter(id => !before.has(id));
          next.updatedAt = new Date().toISOString();
          return next;
        });
        // Phase 6D — one class notification per module NEWLY added to the published set (already-published, hidden or
        // unchanged modules notify nothing). Only ids are stored; titles come from the registry at read time and a module
        // hidden again drops out of the students' projection. Secondary: never fails the publication.
        for (const moduleId of newlyPublished) {
          await recordEventSafely(container, { scope: "class", classId, type: "learning_module_published", dedupeKey: "module:" + courseId + ":" + moduleId + ":" + updated.updatedAt, data: { courseId, moduleId } }, deps, obs);
        }
        const learningMaterials = getClassLearningMaterials(updated);
        await rec(container, { actor: auth.user?.sub, action: "class.learningMaterials.setModules", targetType: "class", targetId: classId, targetLabel: String(updated.name || ""), details: { courseId, moduleIds } });
        return { status: 200, jsonBody: { ok: true, classId, learningMaterials } };
      } catch (mutateError) {
        if (mutateError instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (mutateError?.httpStatus) return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
        throw mutateError;
      }
    }

    // Class Learning Materials — removeLearningCourse: detach the course (and its publication list) from THIS
    // class. Content is never deleted; students, assignments and projects are untouched. IDEMPOTENT: removing a
    // course that is not attached is a 200 with removed:false and writes/audits nothing. Archived class → 403.
    if (action === "removelearningcourse") {
      const classId = String(body?.classId || "").trim();
      const courseId = String(body?.courseId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      if (!courseId) return { status: 400, jsonBody: { ok: false, error: "courseId is required." } };
      let removed = false;
      let updated = null;
      try {
        updated = await mut(container, CLASS_PREFIX + classId + ".json", current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          if (!learningMaterialsChangeAllowed(current)) { const blocked = new Error("الصف مؤرشف — لا يمكن تعديل مواده التعليمية."); blocked.httpStatus = 403; throw blocked; }
          const result = removeClassLearningCourse(current, courseId);
          if (!result.changed) throw new NoChange(current);   // idempotent no-op: nothing is written
          result.classroom.updatedAt = new Date().toISOString();
          return result.classroom;
        });
        removed = true;
      } catch (mutateError) {
        if (mutateError instanceof NoChange) { updated = mutateError.document; removed = false; }
        else if (mutateError instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        else if (mutateError?.httpStatus) return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
        else throw mutateError;
      }
      const learningMaterials = getClassLearningMaterials(updated);
      if (removed) await rec(container, { actor: auth.user?.sub, action: "class.learningMaterials.removeCourse", targetType: "class", targetId: classId, targetLabel: String(updated.name || ""), details: { courseId, ...(findLearningCourse(courseId) ? { courseTitle: findLearningCourse(courseId).title } : {}) } });
      return { status: 200, jsonBody: { ok: true, classId, removed, learningMaterials } };
    }

    // Roadmap #25 — reconcileRoster: rebuild ONE class's denormalized studentIds index from the authoritative
    // user documents. Explicit and rare (repair-only), so a full users scan is acceptable here; it is never part
    // of the class listing. Returns counts only — no student data.
    if (action === "reconcileroster") {
      const classId = String(body?.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      const classroom = await dl(container, CLASS_PREFIX + classId + ".json");
      if (!classroom) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
      const scanStartedAt = Date.now();
      const memberIds = canonicalMemberIds(await ls(container, USER_PREFIX), classId);
      const result = await reconcileRosterIndex(container, classId, memberIds, { scanStartedAt, obs, operation: "reconcileRoster" });
      if (!result.synced) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
      if (result.changed) {
        await rec(container, { actor: auth.user?.sub, action: "class.reconcileRoster", targetType: "class", targetId: classId, targetLabel: String(classroom.name || ""), details: { beforeCount: result.beforeCount, authoritativeCount: result.authoritativeCount, repairedCount: result.repairedCount } });
      }
      return {
        status: 200,
        jsonBody: { ok: true, classId, beforeCount: result.beforeCount, authoritativeCount: result.authoritativeCount, repairedCount: result.repairedCount, changed: result.changed, skipped: result.skipped, rosterSynced: result.synced }
      };
    }

    if (action === "archive" || action === "unarchive" || action === "graduateandarchive") {
      const classId = String(body?.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      const blobName = CLASS_PREFIX + classId + ".json";

      // Phase S.1 (AGENTS.md §10) — an archived class takes its members' open attempts out of reach (submissions are
      // refused) and its pending results out of the day's follow-up: refused while a CURRENT member has such work.
      if (action !== "unarchive" && isSafeId(classId)) {
        const memberIds = canonicalMemberIds(await ls(container, USER_PREFIX), classId);
        const pending = memberIds.length ? await pendingForClassMembers(createPendingGradingReader(container), classId, memberIds) : 0;
        if (pending > 0) return { status: 409, jsonBody: { ok: false, code: "PENDING_GRADING", pendingCount: pending, error: pendingClassMessage(action, pending) } };
      }

      let updatedClassroom = null, beforeLifecycle = null;
      const lifecycleNow = new Date().toISOString();
      try {
        updatedClassroom = await mut(container, blobName, current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          beforeLifecycle = current;
          return applyClassLifecycleAction(current, action, { actor: auth.user?.sub, now: lifecycleNow });
        });
      } catch (mutateError) {
        if (mutateError instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (mutateError?.httpStatus) return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
        throw mutateError;
      }
      // QA2-8 — the archive and a student's startAttempt write different documents: re-check pending work AFTER the archive committed.
      // An attempt started in the meantime is now visible here: the archive is withdrawn (its own lifecycle fields restored, only if
      // nothing changed them since) and refused like the pre-check. The start side re-reads the class after it commits, so at least one
      // side sees the other.
      if (action !== "unarchive" && isSafeId(classId) && beforeLifecycle) {
        const memberIds = canonicalMemberIds(await ls(container, USER_PREFIX), classId);
        const pendingAfter = memberIds.length ? await pendingForClassMembers(createPendingGradingReader(container), classId, memberIds) : 0;
        if (pendingAfter > 0) {
          const LIFECYCLE = ["status", "active", "archivedAt", "archivedBy", "archiveReason", "graduationYear", "updatedAt"];
          await mut(container, blobName, cur => {
            if (!cur || cur.archivedAt !== lifecycleNow) return cur;
            const next = { ...cur };
            for (const k of LIFECYCLE) { if (Object.prototype.hasOwnProperty.call(beforeLifecycle, k)) next[k] = beforeLifecycle[k]; else delete next[k]; }
            return next;
          });
          return { status: 409, jsonBody: { ok: false, code: "PENDING_GRADING", pendingCount: pendingAfter, error: pendingClassMessage(action, pendingAfter) } };
        }
      }

      await rec(container, {
        actor: auth.user?.sub,
        action: action === "unarchive" ? "class.unarchive" : action === "graduateandarchive" ? "class.graduate" : "class.archive",
        targetType: "class",
        targetId: classId,
        targetLabel: updatedClassroom.name || "",
        ...(updatedClassroom.graduationYear ? { details: { graduationYear: updatedClassroom.graduationYear } } : {})
      });

      return {
        status: 200,
        jsonBody: {
          ok: true,
          active: updatedClassroom.active,
          status: normalizeClassStatus(updatedClassroom),
          archivedAt: updatedClassroom.archivedAt || "",
          archiveReason: updatedClassroom.archiveReason || "",
          graduationYear: updatedClassroom.graduationYear || ""
        }
      };
    }

    return { status: 400, jsonBody: { ok: false, error: "Unsupported classroom action." } };
  } catch (e) {
    obs?.logError("classrooms.manage.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء الصف حاليًا." } };
  }
}

app.http("manageClassrooms", { methods: ["GET", "POST"], authLevel: "anonymous", route: "classrooms", handler: withObservability("classrooms", handler) });

module.exports = { handler, buildNewClassroomDocument, classIdForRequestKey, programChangeAllowed, programCodeAccepted, learningMaterialsChangeAllowed, normalizeClassFields };
