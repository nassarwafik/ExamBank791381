const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { BlobServiceClient } = require("@azure/storage-blob");
const crypto = require("crypto");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { mutateJsonWithRetry, StorageConflictError, listJson } = require("../lib/platform-storage");
// Roadmap #25 — explicit, teacher-triggered roster-index repair (the only O(all-users) path in this function;
// the normal class list stays O(classes) and reads the cheap studentIds count).
const { canonicalMemberIds, reconcileRosterIndex } = require("../lib/class-roster-index");
const { normalizeClassStatus, applyClassLifecycleAction } = require("../lib/class-lifecycle");
const { recordAuditEvent } = require("../lib/audit-log");
const { isSupportedProject } = require("../lib/project-tracker/registry");
const { getClassProgramCodes, validateProgramCodes } = require("../lib/project-tracker/class-programs");

// A class's programCode is valid only when it is empty (no project) or a project the registry knows.
// Pure + exported so the rule is unit-tested and enforced server-side (never trusting the UI).
function programCodeAccepted(programCode) {
  const code = String(programCode || "").trim();
  return code === "" || isSupportedProject(code);
}

const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
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

async function listClasses(container, dl) {
  const classes = [];
  for await (const blob of container.listBlobsFlat({ prefix: CLASS_PREFIX })) {
    if (!blob.name.endsWith(".json")) continue;
    const document = await dl(container, blob.name);
    if (!document) continue;
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

function buildNewClassroomDocument({ name, grade, schoolYear, programCode }, now) {
  const doc = {
    schemaVersion: 1,
    classId: crypto.randomUUID(),
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
  const ls = deps.listJson || listJson;
  // Audit is secondary — a recorder failure must never fail the class mutation (Roadmap #19). The real
  // recordAuditEvent already swallows; this wrapper extends the guarantee to any injected recorder.
  const rawRec = deps.recordAuditEvent || recordAuditEvent;
  const rec = async (c, ev) => { try { await rawRec(c, ev); } catch { /* audit is secondary */ } };
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;
    const container = deps.container || getC();

    if (request.method === "GET") {
      return { status: 200, jsonBody: { ok: true, classes: await listClasses(container, dl) } };
    }

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const action = String(body?.action || "create").trim().toLowerCase();

    if (action === "create") {
      const name = String(body?.name || "").trim();
      const grade = String(body?.grade || "").trim();
      const schoolYear = String(body?.schoolYear || "").trim();
      const programCode = String(body?.programCode || "").trim();
      if (!name) return { status: 400, jsonBody: { ok: false, error: "اسم الصف مطلوب." } };
      if (!programCodeAccepted(programCode)) return { status: 400, jsonBody: { ok: false, error: "مشروع غير مدعوم." } };

      const now = new Date().toISOString();
      const classroom = buildNewClassroomDocument({ name, grade, schoolYear, programCode }, now);
      const classId = classroom.classId;
      await up(container, CLASS_PREFIX + classId + ".json", classroom);
      // Roadmap #19: audit the class creation (high-value lifecycle mutation).
      const programCodes = getClassProgramCodes(classroom);
      await rec(container, { actor: auth.user?.sub, action: "class.create", targetType: "class", targetId: classId, targetLabel: name, details: { grade, schoolYear, ...(programCodes.length ? { programCodes } : {}) } });
      return {
        status: 200,
        // programCodes is canonical; programCode is kept (first code or "") only for older clients of this response.
        jsonBody: { ok: true, classroom: { classId, name, grade, schoolYear, programCodes, programCode: programCodes[0] || "", active: true, studentCount: 0, createdAt: now } }
      };
    }

    // Modern multi-project action, and the legacy single-project setProgram kept as a thin wrapper
    // (setProgram("899373") -> ["899373"]; setProgram("") -> []). Both write the modern programCodes[]
    // canonical field and drop the legacy programCode so no stale logic depends on it.
    if (action === "setprograms" || action === "setprogram") {
      const classId = String(body?.classId || "").trim();
      if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId is required." } };
      let nextCodes;
      try {
        nextCodes = action === "setprogram"
          ? validateProgramCodes([String(body?.programCode || "").trim()].filter(Boolean))
          : validateProgramCodes(body?.programCodes);
      } catch (e) {
        return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message } };
      }

      let updatedLabel = "";
      try {
        const updated = await mut(container, CLASS_PREFIX + classId + ".json", current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          if (!programChangeAllowed(current)) { const blocked = new Error("الصف مؤرشف — لا يمكن تعديل مشاريعه."); blocked.httpStatus = 403; throw blocked; }
          current.programCodes = nextCodes;   // canonical modern field
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

      let updatedClassroom = null;
      try {
        updatedClassroom = await mut(container, blobName, current => {
          if (!current) { const notFound = new Error("الصف غير موجود."); notFound.httpStatus = 404; throw notFound; }
          return applyClassLifecycleAction(current, action, { actor: auth.user?.sub, now: new Date().toISOString() });
        });
      } catch (mutateError) {
        if (mutateError instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (mutateError?.httpStatus) return { status: mutateError.httpStatus, jsonBody: { ok: false, error: mutateError.message } };
        throw mutateError;
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

module.exports = { handler, buildNewClassroomDocument, programChangeAllowed, programCodeAccepted };
