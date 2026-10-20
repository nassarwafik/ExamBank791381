// Shared storage/orchestration helpers for the Project Tracker backend. Keeps the Azure functions thin and gives
// ONE place for snapshot creation, student listing, progress loading and — since Roadmap #33 — the write
// operations (progress update, project reset, template update) and the class catalogue, all parameterized by
// projectCode via the registry's storage namespace (so 794589 hits its legacy paths and every other project hits
// its own isolated namespace).
//
// Roadmap #33 — Legacy 794589 Convergence contract: every function here returns DOMAIN results (documents,
// outcomes, counts) or throws the storage/engine errors the callers already map; it never builds an HTTP response,
// never chooses a status code or Arabic message, never records a route-owned audit event and never decides a body
// shape. The generic route (project-tracker) calls these functions and keeps its own, unchanged contract on top
// (Phase P-9 removed the legacy project-794589 route that shared them).
const crypto = require("crypto");
const { downloadJsonOrNull, uploadJson, listJson, listBlobNames, deleteBlob, mutateJsonWithRetry, mapConcurrent, StorageConflictError } = require("../platform-storage");
const { getProjectDefinition, getStorageNamespace, getSnapshotUpgradePolicy } = require("./registry");
const { classHasProject } = require("./class-programs");
const { normalizeClassStatus } = require("../class-lifecycle");
const { classHasMeaningfulProgress } = require("../project-794589-migration");
const { applyProgressUpdate } = require("../project-794589-progress");
const { applySelfReport } = require("./self-report");
const { normalizeScore } = require("./score");
const { recordAuditEvent } = require("../audit-log");
const { isStudentClassMember } = require("../class-membership");
const { listUsersForReadViews } = require("./user-directory-cache");
const condense = require("./condense");

// Pure decision: should an existing snapshot be auto-upgraded? Only an ACTIVE class on an older
// template version with NO meaningful student progress. Exported for unit tests.
function shouldUpgradeSnapshot(existing, isActive, currentVersion, hasMeaningfulProgress) {
  if (!existing || !isActive) return false;
  if (Number(existing.templateVersion || 1) >= currentVersion) return false;
  return !hasMeaningfulProgress;
}

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";

// A class snapshot is a self-contained, teacher-editable copy of the project definition (frozen at
// creation), carrying its own tracks/weights/config/groups/stages so later default-template edits
// never change a class that already started.
function buildClassSnapshot(definition, classId, now) {
  const clone = JSON.parse(JSON.stringify({
    trackWeights: definition.trackWeights,
    config: definition.config,
    groups: definition.groups,
    stages: definition.stages
  }));
  return {
    schemaVersion: 1,
    projectCode: definition.projectCode,
    classId,
    templateVersion: definition.templateVersion,
    tracks: definition.tracks,
    trackWeights: clone.trackWeights,
    config: clone.config,
    groups: clone.groups,
    stages: clone.stages,
    createdAt: now,
    updatedAt: now
  };
}

// Roadmap #33: the snapshot factory used ONLY when a class has no snapshot yet: buildClassSnapshot (projectCode +
// tracks shape). Phase P-9 removed the `createSnapshot` override, whose only user was the legacy 794589 route.
// Existing snapshots, including the version-aware upgrade path, are never affected by it.
function snapshotFactory(projectCode) {
  return (classId, now) => buildClassSnapshot(getProjectDefinition(projectCode), classId, now);
}

// The object the engine operates on: track metadata is authoritative from the registry (titles/icons),
// while weights/config/groups/stages come from the (teacher-editable) class snapshot.
function workingDefinition(projectCode, snapshot) {
  const def = getProjectDefinition(projectCode);
  return {
    projectCode,
    title: def.title,
    tracks: def.tracks,
    templateVersion: snapshot.templateVersion,
    trackWeights: snapshot.trackWeights,
    config: snapshot.config,
    groups: snapshot.groups,
    stages: snapshot.stages
  };
}

async function loadClassroom(container, classId) {
  return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json");
}

// Classes enrolled in a project (for the class selector), newest school year first. The enrollment gate is the
// ONE canonical predicate (class-programs.classHasProject: modern programCodes[] or the legacy programCode).
async function listProjectClasses(container, projectCode) {
  return (await listJson(container, CLASS_PREFIX))
    .filter(c => c && classHasProject(c, projectCode))
    .map(c => ({
      classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear,
      status: normalizeClassStatus(c), archivedAt: c.archivedAt || "", studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0
    }))
    .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)));
}

// Phase P-9 — the ONE decision both ensureClassConfig (writes) and readClassConfig / readClassView (reads) take, so a read
// always shows exactly what the next write persists: the snapshot, the write it still needs and (Phase P7) the view of a
// progress document under it. Reads never write; the first write persists.
//   - no snapshot yet → the first-create document; it is persisted only for an ACTIVE class (never on an archived one);
//   - Phase P7 — an ACTIVE class on `policy.condenseFrom` → the condensed snapshot, each document as it will be converted
//     ("condense": owner-approved rules, old entries archived; persisted by condenseClass). A class whose own stages
//     cannot be converted safely (id collision) is served as it is and marked skipped by the next write;
//   - Phase P7b (owner decision) — an ACTIVE class on `policy.resetFrom` WITH meaningful progress → the current set and
//     every document from zero ("reset": the old work deleted, Phase P7c);
//   - Phase P7c (owner decision) — a class P7b reset while the old work was still archived (`resetFrom` in its documents)
//     → "delete-reset-archive": the first write deletes the archives (reads show the same: the archive is never read);
//   - version-aware upgrade — only for a project that declares a policy (794589). NON-DESTRUCTIVE: an active class
//     with no meaningful progress is upgraded to the current template version (and audited when written); any other
//     class (or an archived one) is returned exactly as-is. Storage paths never change.
async function resolveClassConfig(container, projectCode, classroom) {
  const ns = getStorageNamespace(projectCode);
  const now = new Date().toISOString();
  const existing = await downloadJsonOrNull(container, ns.configName(classroom.classId));
  const r = resolveStoredClass(projectCode, classroom, existing, now);
  if (!r.needsProgressScan) return r;
  return resolveStoredClass(projectCode, classroom, existing, now, classHasMeaningfulProgress(await listJson(container, ns.progressPrefix(classroom.classId))));
}

// The pure part of resolveClassConfig (no I/O): `meaningful` = the class has meaningful progress. Only an active class
// below the current version that no conversion rule takes needs it; without it the result asks for the scan
// (`needsProgressScan`). The student's own read passes its own document's flag (no class scan).
function resolveStoredClass(projectCode, classroom, existing, now, meaningful) {
  const classId = classroom.classId;
  const isActive = normalizeClassStatus(classroom) === "active";
  if (!existing) return { snapshot: snapshotFactory(projectCode)(classId, now), write: isActive ? "create" : null };
  const policy = getSnapshotUpgradePolicy(projectCode);
  const fromVersion = Number(existing.templateVersion || 1);
  if (policy && isActive && policy.condenseFrom && fromVersion === policy.condenseFrom && !(existing.condenseSkipped && existing.condenseSkipped.toVersion === policy.currentVersion)) {
    const def = getProjectDefinition(projectCode);
    const plan = condense.buildCondensePlan(def.stages, def.groups, existing);
    const to = policy.currentVersion;
    if (plan.skip) return { snapshot: existing, write: "condense", existing, policy };
    return {
      snapshot: condense.condensedSnapshot(existing, plan, to, now), write: "condense", existing, policy,
      view: doc => condense.dropCondensedKeys(condense.condenseProgressDoc(doc, plan, to, fromVersion, now), plan, to)
    };
  }
  // Only a version BELOW the one the conversion replaces takes the reset / upgrade path; a class on that version that the
  // conversion skipped (id collision) is served exactly as it is.
  if (policy && isActive && fromVersion < (policy.condenseFrom || policy.currentVersion)) {
    if (meaningful === undefined) return { needsProgressScan: true };
    if (policy.resetFrom && fromVersion === policy.resetFrom && meaningful) {
      return {
        snapshot: { ...policy.buildUpgraded(existing, classId, now), resetAt: now, resetFromVersion: fromVersion, resetArchiveDeletedAt: now }, write: "reset", existing, policy,
        view: doc => condense.resetProgressDoc(doc, policy.currentVersion, fromVersion, now)
      };
    }
    if (shouldUpgradeSnapshot(existing, isActive, policy.currentVersion, meaningful)) {
      return { snapshot: policy.buildUpgraded(existing, classId, now), write: "upgrade", fromVersion, toVersion: policy.currentVersion };
    }
  }
  if (existing.resetFromVersion && !existing.resetArchiveDeletedAt) return { snapshot: existing, write: "delete-reset-archive", existing };
  return { snapshot: existing, write: null };
}

// Returns the class snapshot, lazily creating+persisting it on first access for an ACTIVE class, or persisting (and
// auditing) its pending upgrade / Phase P7 conversion / P7b reset / P7c archive deletion. Only write paths call it.
async function ensureClassConfig(container, projectCode, classroom, options = {}) {
  const r = await resolveClassConfig(container, projectCode, classroom);
  if (r.write === "condense" || r.write === "reset") {
    // A conversion that fails (storage trouble) never fails the request on its own: the stored snapshot is returned (old
    // set) and the next write retries. Documents already converted refuse old-set writes (assertWritable).
    try { return await condenseClass(container, projectCode, classroom, r.existing, r.policy, new Date().toISOString(), r.write); }
    catch (e) {
      if (options.obs && typeof options.obs.logError === "function") options.obs.logError("project." + r.write + ".failed", e);
      return (await downloadJsonOrNull(container, getStorageNamespace(projectCode).configName(classroom.classId))) || r.existing;
    }
  }
  if (r.write === "delete-reset-archive") {
    // Same rule: a deletion that fails never fails the request; it is not marked done and the next write completes it.
    try { return await deleteResetArchives(container, projectCode, classroom, r.existing, new Date().toISOString()); }
    catch (e) {
      if (options.obs && typeof options.obs.logError === "function") options.obs.logError("project.reset_archive_delete.failed", e);
      return r.snapshot;
    }
  }
  if (r.write) await uploadJson(container, getStorageNamespace(projectCode).configName(classroom.classId), r.snapshot);
  if (r.write === "upgrade") {
    await recordAuditEvent(container, {
      actor: "system", action: "project.template.upgrade",
      targetType: "project-template", targetId: classroom.classId, targetLabel: classroom.name || "",
      details: { fromVersion: r.fromVersion, toVersion: r.toVersion, reason: "no-meaningful-progress" }
    });
  }
  return r.snapshot;
}

// Phase P-9 — the READ-side twin of ensureClassConfig: the same snapshot, never written and never audited (the in-memory
// first-create, upgraded, converted or reset document). Every GET uses it (project-tracker, reports), so a read has no
// side effect; the first write persists that same document.
async function readClassConfig(container, projectCode, classroom) {
  return (await resolveClassConfig(container, projectCode, classroom)).snapshot;
}

// Phase P7 — readClassConfig plus `view(doc)`: a progress document as the pending conversion / reset will store it (the
// identity when nothing is pending). Read paths pass it to the progress loaders so the progress matches the snapshot.
async function readClassView(container, projectCode, classroom) {
  const r = await resolveClassConfig(container, projectCode, classroom);
  return { config: r.snapshot, view: r.view || (doc => doc) };
}

// A CAS round that writes only when `fn` returns a NEW document (returning the current one, or undefined, writes nothing).
async function mutateIfChanged(container, name, fn) {
  try {
    return await mutateJsonWithRetry(container, name, current => {
      const next = fn(current);
      if (next === undefined || next === current) { const e = new Error("no change"); e.code = "CONDENSE_NOOP"; e.value = current; throw e; }
      return next;
    });
  } catch (e) {
    if (e && e.code === "CONDENSE_NOOP") return e.value;
    throw e;
  }
}

// Phase P7 — converts ONE active class to the condensed stage set, with its progress, in idempotent passes:
//   0. lock: the snapshot carries `conversion` (a fresh lock held by another request → this request returns the snapshot
//      unchanged and writers refuse with a retryable conflict until the switch);
//   1. every progress document gains the new entries next to the old ones (archived in `condensedFrom`);
//   2. the snapshot switches to the condensed stages (only by the request holding the lock);
//   3. sweep: a document written under the old snapshot during the window is converted, and the old keys leave `stages`.
// A pass that fails leaves a state the next access completes (a stale lock is retaken after condense.LOCK_MS). A class
// whose own stages cannot be converted safely (an id collision) is marked skipped once and left exactly as it is.
// Phase P7b — mode "reset" (owner decision, `policy.resetFrom`): the same passes, but every document restarts from zero
// (condense.resetProgressDoc: the old work deleted, Phase P7c) and the snapshot becomes the current template
// (policy.buildUpgraded); audited once as `project.template.reset`.
async function condenseClass(container, projectCode, classroom, existing, policy, now, mode = "condense") {
  const ns = getStorageNamespace(projectCode);
  const classId = classroom.classId;
  const toVersion = policy.currentVersion, fromVersion = Number(existing.templateVersion || 1);
  const reset = mode === "reset";
  if (!reset && existing.condenseSkipped && existing.condenseSkipped.toVersion === toVersion) return existing;
  const def = getProjectDefinition(projectCode);
  const plan = reset ? { stages: [], mergedIds: [] } : condense.buildCondensePlan(def.stages, def.groups, existing);
  if (plan.skip) {
    const marked = await mutateIfChanged(container, ns.configName(classId), cur => (cur && Number(cur.templateVersion || 1) === fromVersion && !(cur.condenseSkipped && cur.condenseSkipped.toVersion === toVersion) ? { ...cur, condenseSkipped: { toVersion, reason: plan.skip, at: now } } : cur));
    if (marked && marked.condenseSkipped && marked.condenseSkipped.at === now) {
      await recordAuditEvent(container, { actor: "system", action: "project.template.condense_skipped", targetType: "project-template", targetId: classId, targetLabel: classroom.name || "", details: { projectCode, fromVersion, toVersion, reason: plan.skip } });
    }
    return marked || existing;
  }
  const lockId = crypto.randomUUID();
  const nowMs = Date.parse(now) || Date.now();
  const locked = await mutateIfChanged(container, ns.configName(classId), cur => {
    if (!cur || Number(cur.templateVersion || 1) !== fromVersion) return cur;          // converted (or replaced) meanwhile
    if (condense.lockIsFresh(cur, nowMs)) return cur;                                  // another request converts it now
    return { ...cur, conversion: { toVersion, lockId, startedAt: now } };
  });
  if (!locked || Number(locked.templateVersion || 1) !== fromVersion || !locked.conversion || locked.conversion.lockId !== lockId) return locked || existing;
  const names = () => listBlobNames(container, ns.progressPrefix(classId));
  const convert = name => mutateIfChanged(container, name, doc => (reset ? condense.resetProgressDoc(doc, toVersion, fromVersion, now) : condense.condenseProgressDoc(doc, plan, toVersion, fromVersion, now)));
  let switched;
  try {
    await mapConcurrent(await names(), 4, convert);
    switched = await mutateIfChanged(container, ns.configName(classId), cur => {
      if (!cur || !cur.conversion || cur.conversion.lockId !== lockId) { const e = new StorageConflictError("conversion lock lost"); throw e; }
      if (reset) { const { conversion, ...rest } = cur; return { ...policy.buildUpgraded(rest, classId, now), resetAt: now, resetFromVersion: fromVersion, resetArchiveDeletedAt: now }; }   // eslint-disable-line no-unused-vars
      return condense.condensedSnapshot(cur, plan, toVersion, now);
    });
  } catch (e) {
    // A failed pass releases the lock at once (best effort) so the next access retries the conversion instead of waiting
    // for the lock to go stale; the documents converted so far are kept (pass 1 is idempotent).
    await mutateIfChanged(container, ns.configName(classId), cur => {
      if (!cur || !cur.conversion || cur.conversion.lockId !== lockId) return cur;
      const { conversion, ...rest } = cur;                                       // eslint-disable-line no-unused-vars
      return rest;
    }).catch(() => {});
    throw e;
  }
  const all = await names();
  await mapConcurrent(all, 4, convert);                                                // documents created during the window
  if (reset) {
    await recordAuditEvent(container, {
      actor: "system", action: "project.template.reset", targetType: "project-template", targetId: classId, targetLabel: classroom.name || "",
      details: { projectCode, fromVersion, toVersion, students: all.length, archive: "deleted", reason: "owner-decision-restart-from-zero" }
    });
    return switched;
  }
  await mapConcurrent(all, 4, name => mutateIfChanged(container, name, doc => condense.dropCondensedKeys(doc, plan, toVersion)));
  await recordAuditEvent(container, {
    actor: "system", action: "project.template.condense", targetType: "project-template", targetId: classId, targetLabel: classroom.name || "",
    details: { projectCode, fromVersion, toVersion, students: all.length, stagesBefore: (existing.stages || []).length, stagesAfter: plan.stages.length }
  });
  return switched;
}

// Phase P7c — owner decision: the v1 work a P7b reset archived (`resetFrom` in each progress document of the class) is
// deleted. Every document loses its archive (CAS, idempotent; nothing else in it changes), then the snapshot is marked
// (`resetArchiveDeletedAt`) so it runs once; audited once with the number of documents, never their content. A pass that
// fails leaves the snapshot unmarked and the next write completes it.
async function deleteResetArchives(container, projectCode, classroom, existing, now) {
  const ns = getStorageNamespace(projectCode);
  const classId = classroom.classId;
  const deleted = new Set();
  await mapConcurrent(await listBlobNames(container, ns.progressPrefix(classId)), 4, name => mutateIfChanged(container, name, doc => {
    const next = condense.deleteResetArchive(doc);
    if (next !== doc) deleted.add(name);
    return next;
  }));
  const marked = await mutateIfChanged(container, ns.configName(classId), cur => (cur && cur.resetFromVersion && !cur.resetArchiveDeletedAt ? { ...cur, resetArchiveDeletedAt: now } : cur));
  if (marked && marked.resetArchiveDeletedAt === now) {
    await recordAuditEvent(container, {
      actor: "system", action: "project.template.reset_archive_deleted", targetType: "project-template", targetId: classId, targetLabel: classroom.name || "",
      details: { projectCode, fromVersion: Number(existing.resetFromVersion), documents: deleted.size, reason: "owner-decision-delete-old-work" }
    });
  }
  return marked || existing;
}

// Phase P7 — a write must never land on a progress document converted to a NEWER stage set than the snapshot it was
// checked against (its old keys are about to leave), nor while a conversion holds the class: a retryable conflict.
function assertWritable(config, current) {
  if (config && config.conversion && condense.lockIsFresh(config, Date.now())) throw new StorageConflictError("class stages are being converted");
  if (current && Number(current.stageTemplateVersion) > Number((config && config.templateVersion) || 1)) throw new StorageConflictError("class stages were converted");
}

async function listClassStudents(container, classId) {
  return classStudentsFrom(await listJson(container, USER_PREFIX), classId);
}

// Phase P-2 — the SAME roster for the generic route's READ views (summary / students / board / analytics), built from the
// short-lived user-directory cache (user-directory-cache.js): one scan shared across the workspace tabs for ≤ 20 s. The
// membership rule is unchanged (user documents decide); write paths never use this.
async function listClassStudentsForReadViews(container, classId) {
  return classStudentsFrom(await listUsersForReadViews(container), classId);
}

function classStudentsFrom(all, classId) {
  return all
    .filter(u => studentBelongsToClass(u, classId)) // single source of the class-membership policy
    .map(u => ({ studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
}

async function loadStudentUser(container, studentId) {
  return downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
}

// Pure CLASS-MEMBERSHIP rule for the TEACHER's project tracker (exported for unit tests). A user is a
// member of the class if it exists, is a student, is NOT archived, and belongs to that exact class.
// NOTE: active===false (a login-disabled account) is still a class member — a disabled student appears
// in the class roster and the teacher can view/approve their project. This is deliberately independent
// of student LOGIN eligibility (which the student-auth path enforces separately with active===false).
// Roadmap #24: delegates to the ONE canonical read-side membership predicate (lib/class-membership) so the
// project tracker, reports, the gradebook, item analysis and teacher analytics all share exactly one rule.
function studentBelongsToClass(user, classId) {
  return isStudentClassMember(user, classId);
}

// Verifies a studentId is a real student MEMBER of the given class BEFORE any read/write of that
// student's project progress. Prevents cross-class access and "ghost" progress blobs for arbitrary
// ids. Returns { ok:false } when membership fails; otherwise { ok:true, student }.
async function requireStudentInClass(container, studentId, classId) {
  const u = await loadStudentUser(container, studentId);
  if (!studentBelongsToClass(u, classId)) return { ok: false };
  return { ok: true, student: { studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code }, shareAchievements: u.shareAchievements !== false };
}

// Phase P7 — `view` (readClassView) shows each document as the pending conversion / reset will store it; reads only.
async function loadProgressEntries(container, projectCode, classId, students, view = doc => doc) {
  const ns = getStorageNamespace(projectCode);
  const blobs = await listJson(container, ns.progressPrefix(classId));
  const byId = new Map(blobs.filter(Boolean).map(p => [String(p.studentId), view(p)]));
  return students.map(s => ({ studentId: s.studentId, displayName: s.displayName, code: s.code, progress: byId.get(String(s.studentId)) || null }));
}

async function loadStudentProgress(container, projectCode, classId, studentId, view = doc => doc) {
  const doc = await downloadJsonOrNull(container, getStorageNamespace(projectCode).progressName(classId, studentId));
  return doc ? view(doc) : doc;
}

// Roadmap #33 — ONE progress-update pipeline for every route, in the exact order both routes always used:
//   1. canonical membership (foreign / archived / unknown id → { ok:false, reason:"not_member" }, nothing read
//      or written under the class),
//   2. snapshot load (lazy create / version-aware upgrade via ensureClassConfig),
//   3. the stage must exist AND be active in the class snapshot (→ { ok:false, reason:"stage_inactive" }),
//   4. CAS mutation of the student's progress blob through applyProgressUpdate.
// Engine/storage errors propagate unchanged so each handler keeps its own mapping: NO_CHANGE (e.code),
// invalid status (e.httpStatus 400) and StorageConflictError (retry budget exhausted). Returns everything a
// handler needs for its response AND its own audit records (outcome.statusChanged / noteChanged / from / to,
// the stage title) — audit formatting is deliberately NOT centralized here.
async function updateStudentProgress(container, projectCode, classroom, update) {
  const classId = classroom.classId;
  const { studentId, stageId, status, note, score, actor, now, expectedScore } = update;
  const membership = await requireStudentInClass(container, studentId, classId);
  if (!membership.ok) return { ok: false, reason: "not_member" };
  const config = await ensureClassConfig(container, projectCode, classroom);
  const stage = (config.stages || []).find(s => s.stageId === stageId && s.active === true);
  if (!stage) return { ok: false, reason: "stage_inactive", config };
  assertWritable(config, null);
  const ns = getStorageNamespace(projectCode);
  let outcome = null, previous = null;
  const written = await mutateJsonWithRetry(container, ns.progressName(classId, studentId), current => {
    assertWritable(config, current);
    previous = current || null;   // the authoritative BEFORE state of the same CAS round (milestone comparison)
    // Phase P4 — optional precondition (the score grid): the score the teacher's grid showed must still be the stored one
    // in THIS CAS round, otherwise nothing is written (another write changed it since the grid was read).
    if (expectedScore !== undefined) {
      const stored = normalizeScore(current && current.stages && current.stages[stageId] ? current.stages[stageId].score : null);
      if (stored !== expectedScore) { const e = new Error("stale score"); e.code = "STALE_SCORE"; e.currentScore = stored; throw e; }
    }
    return (outcome = applyProgressUpdate(current, { stageId, status, note, score, actor, now, programCode: projectCode, classId, studentId })).doc;
  });
  return { ok: true, config, workDef: workingDefinition(projectCode, config), stage, student: membership.student, shareAchievements: membership.shareAchievements, written, previous, outcome };
}

// Phase P2 — the student's own self-report write: canonical membership → snapshot → only stages ACTIVE in the snapshot
// → ONE CAS round applying the decision to every requested stage (self-report.applySelfReport). Inactive / unknown ids
// are reported as stage_inactive and never written. NO_CHANGE (nothing changed) propagates with its per-stage results.
async function selfReportStages(container, projectCode, classroom, { studentId, stageIds, mark, now }) {
  const classId = classroom.classId;
  const membership = await requireStudentInClass(container, studentId, classId);
  if (!membership.ok) return { ok: false, reason: "not_member" };
  const config = await ensureClassConfig(container, projectCode, classroom);
  const active = new Set((config.stages || []).filter(s => s && s.active === true).map(s => s.stageId));
  const writable = stageIds.filter(id => active.has(id));
  const inactive = stageIds.filter(id => !active.has(id)).map(stageId => ({ stageId, ok: false, changed: false, error: "stage_inactive" }));
  if (!writable.length) return { ok: true, config, workDef: workingDefinition(projectCode, config), student: membership.student, shareAchievements: membership.shareAchievements, written: null, previous: null, results: inactive, changed: 0 };
  assertWritable(config, null);
  const ns = getStorageNamespace(projectCode);
  let outcome = null, previous = null;
  const written = await mutateJsonWithRetry(container, ns.progressName(classId, studentId), current => {
    assertWritable(config, current);
    previous = current || null;
    return (outcome = applySelfReport(current, { stageIds: writable, mark, studentId, now, programCode: projectCode, classId })).doc;
  });
  const byId = new Map([...outcome.results, ...inactive].map(r => [r.stageId, r]));
  return { ok: true, config, workDef: workingDefinition(projectCode, config), student: membership.student, shareAchievements: membership.shareAchievements, written, previous, results: stageIds.map(id => byId.get(id)), changed: outcome.changed };
}

// Roadmap #33 — wipes ONLY this project's data for this class (every student progress blob under the project's
// namespace, then the class snapshot). The classroom, the student accounts, assignments, exams and OTHER projects
// are never touched (namespace isolation). Returns the count the handlers report and audit.
async function resetProject(container, projectCode, classId) {
  const ns = getStorageNamespace(projectCode);
  const progressBlobs = await listBlobNames(container, ns.progressPrefix(classId));
  for (const name of progressBlobs) await deleteBlob(container, name);
  await deleteBlob(container, ns.configName(classId));
  return { deletedProgressCount: progressBlobs.length };
}

// Roadmap #33 — CAS patch of the class snapshot (stages / groups / trackWeights / config merge). A missing snapshot
// starts from the first-create factory (see snapshotFactory). StorageConflictError propagates.
// Phase P-1 — `options.validate(current, patch)` (the generic route passes template-validation) runs against the snapshot
// of THIS CAS round before anything changes; an error it throws propagates and nothing is written.
async function updateTemplate(container, projectCode, classId, patch, now, options = {}) {
  const ns = getStorageNamespace(projectCode);
  const create = snapshotFactory(projectCode);
  return mutateJsonWithRetry(container, ns.configName(classId), current => {
    const config = current || create(classId, now);
    if (typeof options.validate === "function") options.validate(config, patch);
    if (Array.isArray(patch.stages)) config.stages = patch.stages;
    if (Array.isArray(patch.groups)) config.groups = patch.groups;
    if (patch.trackWeights && typeof patch.trackWeights === "object") config.trackWeights = patch.trackWeights;
    if (patch.config && typeof patch.config === "object") config.config = { ...config.config, ...patch.config };
    config.updatedAt = now;
    return config;
  });
}

module.exports = {
  CLASS_PREFIX, USER_PREFIX,
  buildClassSnapshot, workingDefinition, loadClassroom, ensureClassConfig, readClassConfig, readClassView,
  listClassStudents, listClassStudentsForReadViews, loadStudentUser, studentBelongsToClass, requireStudentInClass, loadProgressEntries, loadStudentProgress,
  listProjectClasses, updateStudentProgress, selfReportStages, resetProject, updateTemplate,
  shouldUpgradeSnapshot, condenseClass, resolveStoredClass
};
