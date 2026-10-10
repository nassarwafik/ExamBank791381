const crypto = require("crypto");
const storage = require("./platform-storage");
const model = require("./exam-governance-model");
const { canonicalizeExamContent, contentHashOf, stableStringify } = require("./exam-canonical");
const { requiredCapabilities } = require("./exam-governance-capabilities");
const inbox = require("./governance-inbox");
const { countExamQuestions, examOfficialStats } = require("./exam-structure");

// Phase 14A — the SERVER-OWNED exam publishing authority.
//
//   exam-governance/<examId>/manifest.json                 mutable ONLY through ETag compare-and-set (never last-write-wins)
//   exam-governance/<examId>/revisions/<revisionId>.json   immutable (create-only) — the exact exam content of one revision
//   exam-governance/<examId>/revision-meta/<n>-<id>.json   immutable — metadata only (listing never loads exam bodies)
//   exam-governance/<examId>/events/<seq>-<eventId>.json   immutable — the audit trail (revision ids, never exam bodies)
//
// Authority rules (see docs/enterprise-governance-14a.md):
//  • governance exists only after an explicit enableGovernance(); reading a legacy exam never creates anything;
//  • every mutation names the authority version it acted on (expectedStateVersion) and a requestId; a stale version is
//    409 STALE_STATE, a lost ETag race is 409 STALE_STATE, a replayed command returns its recorded outcome without a
//    second mutation, and a different command reusing a requestId is 409 REQUEST_ID_CONFLICT;
//  • the lifecycle table is enforced here — a client never picks an arbitrary target state;
//  • draft → in-review runs the SERVER finalization authority on the STORED revision (never a client body / flag);
//  • approval binds reviewRevisionId; publication binds approvedRevisionId, with server time and the authenticated actor;
//  • actor identity and every timestamp are server values; nothing here reads publishedBy / occurredAt from a request;
//  • the published revision is loaded manifest → publishedRevisionId → immutable revision, and fails CLOSED — through the
//    ONE validated manifest read (readManifest): a corrupt manifest is MANIFEST_CORRUPT, never "legacy";
//  • commit + audit-repair protocol (Review Fix 1): the audit event's identity/descriptor is allocated BEFORE the manifest
//    CAS and stored in the command record; after the CAS the create-only event is ensured, and every replay of the same
//    requestId re-ensures it (recreating the EXACT committed event when missing, failing closed on a conflicting one)
//    before reporting success — so a committed transition can never end up without its immutable audit event;
//  • audit continuity (final review fix): before ANY new state-changing mutation the most recent committed command
//    (the one whose recorded stateVersion equals the manifest's) has its event ensured first — repaired from its committed
//    descriptor, accepted when identical, AUDIT_INTEGRITY when conflicting, AUDIT_EVENT_PENDING (no new mutation) when the
//    repair write fails. mutation N committed ⇒ event N exists ⇒ only then may mutation N+1 commit, so an unresolved
//    descriptor can never be evicted from the bounded command ring;
//  • Phase 14B — the ASSIGNED review workflow lives INSIDE these states (manifest.reviewWorkflow: one cycle = one exact
//    revision + one author + one reviewer + one approver + one publisher, strict separation of duties, server cycleId).
//    Every workflow mutation (submit with assignments, complete-review, request-changes, approve, reject-approval,
//    publish, reject-publication, withdraw-review) is the SAME mutation authority: expectedStateVersion, requestId replay,
//    audit continuity preflight, manifest CAS, audit descriptor → create-only event. Human notes are immutable DECISION
//    records (exam-governance/<examId>/decisions/<seq>-<decisionId>.json) written create-only BEFORE the CAS and discarded
//    when the CAS loses; the audit event references the decisionId only. Inbox task pointers (governance-inbox.js) are
//    written before the CAS (a failed pointer write ⇒ no commit; a lost CAS ⇒ best-effort delete) and closed after it —
//    they are routing data, validated by their reader against this manifest; nothing here treats a pointer as authority.
class GovernanceError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.name = "GovernanceError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
const STALE_MESSAGE = "تغيرت حالة الامتحان في الخادم منذ فتح هذه الصفحة. تم تحديث الحالة؛ راجعها قبل إعادة المحاولة.";
const MAX_COMMANDS = 64;
const REQUEST_ID_MAX = 128;
const DEFAULT_PAGE = 20, MAX_PAGE = 50;

const nowOf = deps => (deps && typeof deps.now === "function" ? deps.now() : new Date().toISOString());
const newId = deps => (deps && typeof deps.newId === "function" ? deps.newId() : crypto.randomUUID());
const dlOf = deps => (deps && deps.downloadJsonOrNull) || storage.downloadJsonOrNull;

function invalid(message) { return new GovernanceError(400, "INVALID", message); }
function requireExamId(examId) { if (!model.isSafeExamId(examId)) throw invalid("معرّف الامتحان غير صالح."); return examId; }
function requireRequestId(requestId) { if (typeof requestId !== "string" || !requestId.trim() || requestId.length > REQUEST_ID_MAX) throw invalid("requestId مطلوب لكل أمر تعديل."); return requestId; }
function requireStateVersion(v) { if (!Number.isInteger(v) || v < 1) throw invalid("expectedStateVersion مطلوب لكل أمر تعديل."); return v; }
function requireActor(actor) {
  if (!actor || typeof actor !== "object" || typeof actor.id !== "string" || !actor.id) throw new GovernanceError(401, "UNAUTHORIZED", "Unauthorized");
  return { id: actor.id, capabilities: Array.isArray(actor.capabilities) ? actor.capabilities.filter(c => typeof c === "string") : [] };
}
function requireCapability(actor, action, fromState) {
  const needed = requiredCapabilities(action, fromState);
  if (needed.length && !needed.some(c => actor.capabilities.includes(c))) throw new GovernanceError(403, "FORBIDDEN", "لا تملك الصلاحية اللازمة لهذا الإجراء.");
}

// ── storage primitives ──────────────────────────────────────────────────────────────────────────────────────────────
async function readManifestRaw(container, examId, deps) {
  const name = model.manifestName(examId);
  if (deps && deps.downloadJsonWithEtagOrNull) { const r = await deps.downloadJsonWithEtagOrNull(container, name); return { manifest: r.value, etag: r.etag }; }
  if (deps && deps.downloadJsonOrNull) return { manifest: await deps.downloadJsonOrNull(container, name), etag: null };
  const { value, etag } = await storage.downloadJsonWithEtagOrNull(container, name);
  return { manifest: value, etag };
}
async function readManifest(container, examId, deps) {
  const { manifest, etag } = await readManifestRaw(container, examId, deps);
  if (!manifest) return { manifest: null, etag: null };
  const issues = model.validateManifest(manifest);
  if (issues.length) throw new GovernanceError(500, "MANIFEST_CORRUPT", "سجل الحوكمة غير صالح: " + issues.join("، "));
  return { manifest, etag };
}
async function requireManifest(container, examId, deps) {
  const r = await readManifest(container, examId, deps);
  if (!r.manifest) throw new GovernanceError(404, "NOT_GOVERNED", "هذا الامتحان غير مسجّل في إدارة النشر.");
  return r;
}
async function writeImmutable(container, name, doc) {
  try { await storage.uploadJsonConditional(container, name, doc, null); }
  catch (e) { if (storage.isConcurrencyConflict(e)) throw new GovernanceError(409, "IMMUTABLE", "لا يمكن الكتابة فوق سجل غير قابل للتغيير."); throw e; }
}
async function writeRevisionDocument(container, revision) {
  const r = revision || {};
  if (!model.isSafeExamId(r.examId) || !model.isSafeRevisionId(r.revisionId) || !Number.isInteger(r.revisionNumber) || r.revisionNumber < 1) throw invalid("سجل الإصدار غير صالح.");
  await writeImmutable(container, model.revisionName(r.examId, r.revisionId), r);
}
async function writeRevisionMetaDocument(container, meta) {
  await writeImmutable(container, model.revisionMetaName(meta.examId, meta.revisionNumber, meta.revisionId), meta);
}
async function writeEventDocument(container, event) {
  const e = event || {};
  if (!model.isSafeExamId(e.examId) || !Number.isInteger(e.sequence) || e.sequence < 1 || typeof e.eventId !== "string") throw invalid("سجل الحدث غير صالح.");
  await writeImmutable(container, model.eventName(e.examId, e.sequence, e.eventId), e);
}
async function casManifest(container, examId, manifest, etag) {
  try { return await storage.uploadJsonConditional(container, model.manifestName(examId), manifest, etag); }
  catch (e) {
    if (storage.isConcurrencyConflict(e)) throw new GovernanceError(etag === null ? 409 : 409, etag === null ? "ALREADY_GOVERNED" : "STALE_STATE", etag === null ? "هذا الامتحان مسجّل في إدارة النشر بالفعل." : STALE_MESSAGE);
    throw e;
  }
}
// A revision written before a manifest CAS that then lost the race was never referenced by any authority version;
// removing it is server housekeeping (no author operation can delete a referenced revision — there is no such action).
async function discardUnreferenced(container, names) {
  for (const name of names) { try { await storage.deleteBlob(container, name); } catch { /* best effort */ } }
}

// ── documents ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Revision + metadata are written before the manifest references them; if the metadata write fails, the revision is not
// referenced by any authority version and is discarded (best effort) so no orphan lingers.
async function writeRevisionPair(container, revision, meta) {
  await writeRevisionDocument(container, revision);
  try { await writeRevisionMetaDocument(container, meta); }
  catch (e) { await discardUnreferenced(container, [model.revisionName(revision.examId, revision.revisionId)]); throw e; }
}
function buildRevision({ examId, exam, revisionNumber, sourceRevisionId, actor, deps }) {
  const content = canonicalizeExamContent(exam);
  if (content.examId !== examId) throw invalid("معرّف الامتحان في المحتوى لا يطابق الطلب.");
  const revision = {
    schemaVersion: 1, examId, revisionId: "rev-" + newId(deps), revisionNumber,
    createdAt: nowOf(deps), createdBy: actor.id,
    ...(sourceRevisionId ? { sourceRevisionId } : {}),
    contentHash: contentHashOf(content),
    exam: content
  };
  return revision;
}
function metaOf(revision) {
  const stats = examOfficialStats(revision.exam);
  return {
    schemaVersion: 1, examId: revision.examId, revisionId: revision.revisionId, revisionNumber: revision.revisionNumber,
    createdAt: revision.createdAt, createdBy: revision.createdBy, ...(revision.sourceRevisionId ? { sourceRevisionId: revision.sourceRevisionId } : {}),
    contentHash: revision.contentHash, title: String(revision.exam.title || ""), questionCount: countExamQuestions(revision.exam), totalMarks: stats.totalMarks
  };
}
function rolesOf(manifest, revisionId) {
  const roles = [];
  if (manifest.latestRevisionId === revisionId) roles.push("latest");
  if (manifest.reviewRevisionId === revisionId) roles.push("review");
  if (manifest.approvedRevisionId === revisionId) roles.push("approved");
  if (manifest.publishedRevisionId === revisionId) roles.push("published");
  return roles;
}
function recordCommand(manifest, entry) {
  const commands = Array.isArray(manifest.commands) ? manifest.commands.slice(-(MAX_COMMANDS - 1)) : [];
  commands.push(entry);
  return commands;
}
function findCommand(manifest, requestId) {
  return (Array.isArray(manifest.commands) ? manifest.commands : []).find(c => c && c.requestId === requestId) || null;
}
function replayOrConflict(manifest, requestId, type) {
  const recorded = findCommand(manifest, requestId);
  if (!recorded) return null;
  if (recorded.type !== type) throw new GovernanceError(409, "REQUEST_ID_CONFLICT", "معرّف الطلب مستعمل لأمر مختلف.");
  return recorded;
}
// ── commit + audit-repair protocol ───────────────────────────────────────────────────────────────────────────────────
// The audit descriptor is allocated BEFORE the manifest CAS and stored inside the command record (bounded: ids, type,
// states, actor, time — never exam content). After the CAS commits, ensureAuditEvent() makes the create-only event exist;
// every replay of the same requestId runs it again, so a missing event is recreated EXACTLY from the committed descriptor,
// an identical existing event is accepted, and a conflicting event at the authoritative name fails closed.
function auditDescriptorOf({ manifestAfter, type, revisionId, fromState, toState, actor, at, deps, cycleId, decisionId }) {
  return {
    eventId: "ev-" + newId(deps), sequence: manifestAfter.eventCount, type,
    ...(revisionId ? { revisionId } : {}), ...(fromState ? { fromState } : {}), ...(toState ? { toState } : {}),
    ...(cycleId ? { cycleId } : {}), ...(decisionId ? { decisionId } : {}),
    actorId: actor.id, occurredAt: at
  };
}
function eventFromAudit(examId, audit, requestId) {
  return {
    schemaVersion: 1, eventId: audit.eventId, examId, type: audit.type,
    ...(audit.revisionId ? { revisionId: audit.revisionId } : {}), ...(audit.fromState ? { fromState: audit.fromState } : {}), ...(audit.toState ? { toState: audit.toState } : {}),
    ...(audit.cycleId ? { cycleId: audit.cycleId } : {}), ...(audit.decisionId ? { decisionId: audit.decisionId } : {}),
    actorId: audit.actorId, occurredAt: audit.occurredAt, requestId, sequence: audit.sequence
  };
}
async function ensureAuditEvent(container, examId, command, deps) {
  const audit = command && command.audit;
  if (!audit || typeof audit.eventId !== "string" || !Number.isInteger(audit.sequence) || audit.sequence < 1 || !model.GOVERNANCE_EVENT_TYPES.includes(audit.type) || typeof audit.actorId !== "string" || typeof audit.occurredAt !== "string") {
    throw new GovernanceError(500, "AUDIT_INTEGRITY", "سجل الأمر المعتمد لا يحمل واصف حدث تدقيق صالح.");
  }
  const expected = eventFromAudit(examId, audit, command.requestId);
  const name = model.eventName(examId, audit.sequence, audit.eventId);
  const conflict = () => new GovernanceError(500, "AUDIT_INTEGRITY", "يوجد حدث تدقيق مخالف باسم السجل المعتمد؛ لا يمكن الكتابة فوقه.");
  // Read first: the normal path (event already committed) costs one read and writes nothing.
  const present = await dlOf(deps)(container, name);
  if (present) { if (stableStringify(present) === stableStringify(expected)) return present; throw conflict(); }
  try { await storage.uploadJsonConditional(container, name, expected, null); return expected; }
  catch (e) {
    if (storage.isConcurrencyConflict(e)) {
      const existing = await dlOf(deps)(container, name);
      if (existing && stableStringify(existing) === stableStringify(expected)) return existing;
      throw conflict();
    }
    const pending = new GovernanceError(503, "AUDIT_EVENT_PENDING", "اكتملت العملية على الخادم لكن حدث التدقيق لم يُسجَّل بعد؛ أعد المحاولة بنفس requestId لإتمام التسجيل.");
    pending.cause = e;
    throw pending;
  }
}
// Audit continuity preflight: the most recent committed state-changing command is the one whose recorded stateVersion equals
// the manifest's current stateVersion (every committing mutation increments stateVersion and records exactly that number;
// a no-op createRevision records nothing). Its event must exist and match before any NEW mutation may commit. A manifest
// whose latest committed command cannot be found fails closed: audit continuity cannot be verified.
function latestCommittedCommand(manifest) {
  const commands = Array.isArray(manifest.commands) ? manifest.commands : [];
  for (let i = commands.length - 1; i >= 0; i--) { const c = commands[i]; if (c && c.stateVersion === manifest.stateVersion) return c; }
  return null;
}
async function ensureCommittedAudit(container, examId, manifest, deps) {
  const latest = latestCommittedCommand(manifest);
  if (!latest) throw new GovernanceError(500, "AUDIT_INTEGRITY", "لا يمكن التحقق من استمرارية سجل التدقيق للحالة الحالية؛ لا يُسمح بتعديل جديد.");
  await ensureAuditEvent(container, examId, latest, deps);
}
// The manifest as returned to callers: internal idempotency bookkeeping never leaves the server.
function publicManifest(manifest) {
  if (!manifest) return null;
  const { commands: _commands, ...rest } = manifest;
  return rest;
}

// ── reads ────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function getGovernanceStatus(container, examId, deps = {}) {
  requireExamId(examId);
  const { manifest } = await readManifest(container, examId, deps);
  return manifest ? { governed: true, manifest } : { governed: false, manifest: null };
}

// ── enable ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function enableGovernance(container, { examId, exam, actor: rawActor, requestId }, deps = {}) {
  requireExamId(examId); requireRequestId(requestId);
  const actor = requireActor(rawActor);
  requireCapability(actor, "enable");
  if (!exam || typeof exam !== "object") throw invalid("محتوى الامتحان مطلوب.");
  const existing = await readManifestRaw(container, examId, deps);
  if (existing.manifest) {
    const recorded = replayOrConflict(existing.manifest, requestId, "enable");
    if (recorded) { await ensureAuditEvent(container, examId, recorded, deps); return { manifest: existing.manifest, replayed: true }; }
    throw new GovernanceError(409, "ALREADY_GOVERNED", "هذا الامتحان مسجّل في إدارة النشر بالفعل.");
  }
  const revision = buildRevision({ examId, exam, revisionNumber: 1, actor, deps });
  const meta = metaOf(revision);
  await writeRevisionPair(container, revision, meta);
  const at = nowOf(deps);
  const manifest = model.newManifest({ examId, revisionId: revision.revisionId, now: at, actorId: actor.id });
  manifest.latestContentHash = revision.contentHash;
  manifest.eventCount = 1;
  manifest.lastTransition = { type: "governance-enabled", at, by: actor.id, requestId };
  const audit = auditDescriptorOf({ manifestAfter: manifest, type: "governance-enabled", revisionId: revision.revisionId, toState: "draft", actor, at, deps });
  const command = { requestId, type: "enable", at, stateVersion: 1, result: { revisionId: revision.revisionId }, audit };
  manifest.commands = [command];
  try { await casManifest(container, examId, manifest, null); }
  catch (e) { await discardUnreferenced(container, [model.revisionName(examId, revision.revisionId), model.revisionMetaName(examId, 1, revision.revisionId)]); throw e; }
  const event = await ensureAuditEvent(container, examId, command, deps);
  return { manifest, revision, meta, event, replayed: false };
}

// ── create revision (draft only) ─────────────────────────────────────────────────────────────────────────────────────
async function createRevision(container, { examId, exam, actor: rawActor, requestId, expectedStateVersion }, deps = {}) {
  requireExamId(examId); requireRequestId(requestId); requireStateVersion(expectedStateVersion);
  const actor = requireActor(rawActor);
  requireCapability(actor, "create-revision");
  if (!exam || typeof exam !== "object") throw invalid("محتوى الامتحان مطلوب.");
  const content = canonicalizeExamContent(exam);
  if (content.examId !== examId) throw invalid("معرّف الامتحان في المحتوى لا يطابق الطلب.");
  const { manifest, etag } = await requireManifest(container, examId, deps);
  await ensureCommittedAudit(container, examId, manifest, deps);          // audit continuity before any new mutation
  const recorded = replayOrConflict(manifest, requestId, "create-revision");
  if (recorded) { await ensureAuditEvent(container, examId, recorded, deps); return { manifest, created: recorded.result ? recorded.result.created === true : false, replayed: true }; }
  if (manifest.stateVersion !== expectedStateVersion) { const e = new GovernanceError(409, "STALE_STATE", STALE_MESSAGE); e.manifest = manifest; throw e; }
  if (manifest.lifecycleState !== "draft") { const e = new GovernanceError(409, "ILLEGAL_TRANSITION", "لا يمكن إنشاء إصدار جديد إلا في حالة المسودة؛ أعد الامتحان إلى المسودة أولًا."); e.manifest = manifest; throw e; }
  const hash = contentHashOf(content);
  if (hash === manifest.latestContentHash) return { manifest, created: false, replayed: false };
  const revision = buildRevision({ examId, exam: content, revisionNumber: manifest.latestRevisionNumber + 1, sourceRevisionId: manifest.latestRevisionId, actor, deps });
  const meta = metaOf(revision);
  await writeRevisionPair(container, revision, meta);
  const at = nowOf(deps);
  const next = {
    ...manifest, stateVersion: manifest.stateVersion + 1, updatedAt: at,
    latestRevisionId: revision.revisionId, latestRevisionNumber: revision.revisionNumber, latestContentHash: revision.contentHash,
    revisions: [...manifest.revisions, { revisionId: revision.revisionId, revisionNumber: revision.revisionNumber }],
    eventCount: manifest.eventCount + 1,
    lastTransition: { type: "revision-created", at, by: actor.id, requestId }
  };
  const audit = auditDescriptorOf({ manifestAfter: next, type: "revision-created", revisionId: revision.revisionId, fromState: "draft", toState: "draft", actor, at, deps });
  const command = { requestId, type: "create-revision", at, stateVersion: next.stateVersion, result: { revisionId: revision.revisionId, created: true }, audit };
  next.commands = recordCommand(manifest, command);
  try { await casManifest(container, examId, next, etag); }
  catch (e) { await discardUnreferenced(container, [model.revisionName(examId, revision.revisionId), model.revisionMetaName(examId, revision.revisionNumber, revision.revisionId)]); throw e; }
  const event = await ensureAuditEvent(container, examId, command, deps);
  return { manifest: next, revision, meta, event, created: true, replayed: false };
}

// ── lifecycle transitions ────────────────────────────────────────────────────────────────────────────────────────────
const ACTION_OF_TARGET = { "in-review": "submit-review", approved: "approve", published: "publish", draft: "return-to-draft" };
const WORKFLOW_ACTIONS = Object.freeze(["complete-review", "request-changes", "reject-approval", "reject-publication", "withdraw-review"]);

async function loadStoredRevision(container, examId, revisionId, deps) {
  if (!model.isSafeRevisionId(revisionId)) return null;
  return dlOf(deps)(container, model.revisionName(examId, revisionId));
}

// ── 14B — assigned directory + workflow helpers ──────────────────────────────────────────────────────────────────────
// The server directory snapshot (ids + current capabilities) is injected by the function layer from server configuration
// (exam-governance-capabilities.governanceDirectorySnapshot). `null` ⇒ single-teacher mode (14A rules).
function directoryOf(deps) { const d = deps && deps.directory; return d && d.mode === "assigned" && Array.isArray(d.actors) ? d : null; }
function directoryActor(dir, actorId) { return dir.actors.find(a => a && typeof a === "object" && a.actorId === actorId) || null; }
function directoryHolds(dir, actorId, capability) { const a = directoryActor(dir, actorId); return !!a && Array.isArray(a.capabilities) && a.capabilities.includes(capability); }
const identityUnavailable = () => new GovernanceError(503, "GOVERNANCE_IDENTITY_CONFIG_INVALID", "دورة المراجعة تتطلب دليل هويات معتمدًا على الخادم (BUILDER_USERS + mode assigned)؛ الإعداد الحالي غير صالح.");
const notAssigned = () => new GovernanceError(403, "NOT_ASSIGNED", "هذا الإجراء محجوز للشخص المعيَّن لهذه المرحلة في دورة المراجعة الحالية.");
// Assigned mode: the acting identity must be the assigned actor for the stage AND must still hold the capability in the
// SERVER directory at action time (a removed actor or a lost capability fails closed; nobody is substituted).
function requireAssigned(dir, actor, workflow, role, capability) {
  if (!dir) throw identityUnavailable();
  if (!workflow || workflow[role] !== actor.id) throw notAssigned();
  if (!directoryHolds(dir, actor.id, capability)) throw new GovernanceError(403, "FORBIDDEN", "لا تملك الصلاحية اللازمة لهذا الإجراء.");
}
function assignmentInvalid(message) { return new GovernanceError(400, "WORKFLOW_ASSIGNMENT_INVALID", message); }
// Server validation of the author's selections: ids only, each in the directory with the required capability, strict
// separation of duties across author / reviewer / approver / publisher.
function validateAssignments(dir, actor, assignments) {
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) throw assignmentInvalid("يجب تعيين مراجع ومعتمد وناشر من دليل الخادم قبل إرسال الإصدار للمراجعة.");
  const pick = (key, capability, label) => {
    const id = assignments[key];
    if (typeof id !== "string" || !id.trim() || id.length > 128) throw assignmentInvalid("يجب اختيار " + label + " من دليل الخادم.");
    if (!directoryActor(dir, id)) throw assignmentInvalid(label + " المختار غير موجود في دليل الحسابات المعتمد على الخادم.");
    if (!directoryHolds(dir, id, capability)) throw assignmentInvalid(label + " المختار لا يملك صلاحية «" + capability + "» حاليًا.");
    return id;
  };
  const reviewerId = pick("reviewerId", "review", "المراجع"), approverId = pick("approverId", "approve", "المعتمد"), publisherId = pick("publisherId", "publish", "الناشر");
  const ids = [actor.id, reviewerId, approverId, publisherId];
  if (new Set(ids).size !== ids.length) throw assignmentInvalid("فصل المهام صارم: يجب أن يكون المؤلف والمراجع والمعتمد والناشر أربع هويات مختلفة.");
  return { reviewerId, approverId, publisherId };
}
function requireNote(value, required) {
  const r = model.normalizeDecisionNote(value, { required });
  if (!r.ok) throw new GovernanceError(400, r.code, r.code === "NOTE_REQUIRED" ? "هذا القرار يستلزم ملاحظة مكتوبة." : r.code === "NOTE_TOO_LONG" ? "الملاحظة أطول من الحد المسموح (" + model.MAX_NOTE_LENGTH + " حرفًا)." : "الملاحظة غير صالحة.");
  return r.note;
}
function decisionRecordOf({ examId, workflow, stage, decision, actor, at, note, sequence, deps }) {
  return {
    schemaVersion: 1, decisionId: "dec-" + newId(deps), examId, cycleId: workflow.cycleId, revisionId: workflow.revisionId, revisionNumber: workflow.revisionNumber,
    stage, decision, actorId: actor.id, occurredAt: at, note: note || "", sequence
  };
}
async function writeDecisionDocument(container, record) {
  const r = record || {};
  if (!model.isSafeExamId(r.examId) || !Number.isInteger(r.sequence) || r.sequence < 1 || typeof r.decisionId !== "string" || !model.DECISION_TYPES.includes(r.decision)) throw invalid("سجل القرار غير صالح.");
  await writeImmutable(container, model.decisionName(r.examId, r.sequence, r.decisionId), r);
}
function lastDecisionOf(record) {
  return { decisionId: record.decisionId, stage: record.stage, decision: record.decision, actorId: record.actorId, at: record.occurredAt, cycleId: record.cycleId, revisionId: record.revisionId, revisionNumber: record.revisionNumber, hasNote: !!record.note };
}
async function revisionTitle(container, examId, workflow, deps) {
  try { const meta = await dlOf(deps)(container, model.revisionMetaName(examId, workflow.revisionNumber, workflow.revisionId)); return meta && typeof meta.title === "string" ? meta.title : ""; } catch { return ""; }
}
function pointerFor(stage, actorId, examId, workflow, title, at) {
  return inbox.buildTaskPointer({ actorId, stage, examId, cycleId: workflow.cycleId, revisionId: workflow.revisionId, revisionNumber: workflow.revisionNumber, title, authorId: workflow.authorId, submittedAt: workflow.submittedAt, createdAt: at });
}
const openTask = pointer => { let created = false; return { write: async () => { created = await inbox.writeTaskPointer(pointer.container, pointer.doc); }, undo: () => (created ? inbox.removeTaskPointer(pointer.container, pointer.doc) : Promise.resolve(false)) }; };
const decisionWrite = (container, record) => ({ write: () => writeDecisionDocument(container, record), undo: () => discardUnreferenced(container, [model.decisionName(record.examId, record.sequence, record.decisionId)]) });
const closeTask = (container, actorId, stage, examId, workflow) => () => inbox.removeTaskPointer(container, { actorId, stage, examId, cycleId: workflow.cycleId });
function clearCyclePointers(next) {
  delete next.reviewRevisionId; delete next.reviewRevisionNumber;
  delete next.approvedRevisionId; delete next.approvedRevisionNumber; delete next.approvedAt; delete next.approvedBy;
  delete next.reviewWorkflow;
}

// ── the ONE commit core (14A ordering, generalized for 14B side documents) ───────────────────────────────────────────
//   1. pre-CAS create-only writes in order (decision record, next-task pointer) — a failure undoes what was written and
//      the mutation does not commit;  2. fail-closed validation of the next manifest;  3. manifest CAS (a lost race undoes
//      the pre-CAS writes: no orphan decision, no uncommitted pointer);  4. ensureAuditEvent (commit + audit-repair
//      protocol);  5. best-effort closing of obsolete task pointers (readers filter them anyway).
async function commitMutation(container, examId, { manifest, etag, next, command, preWrites = [], postCleanup = [] }, deps) {
  const done = [];
  const undoAll = async () => { for (const w of done.reverse()) { try { await w.undo(); } catch { /* best effort */ } } };
  try { for (const w of preWrites) { await w.write(); done.push(w); } }
  catch (e) { await undoAll(); throw e; }
  const issues = model.validateManifest(next);
  if (issues.length) { await undoAll(); throw new GovernanceError(500, "MANIFEST_CORRUPT", "لا يمكن تنفيذ الانتقال: " + issues.join("، ")); }
  next.commands = recordCommand(manifest, command);
  try { await casManifest(container, examId, next, etag); }
  catch (e) { await undoAll(); throw e; }
  const event = await ensureAuditEvent(container, examId, command, deps);
  for (const c of postCleanup) { try { await c(); } catch { /* best effort — the inbox reader validates against the manifest */ } }
  return event;
}
function replayResult(manifest, recorded) {
  const r = recorded.result || {};
  return { manifest, replayed: true, ...(r.decision ? { decision: r.decision } : {}), ...(r.decisionId ? { decisionId: r.decisionId } : {}) };
}

async function transition(container, { examId, to, actor: rawActor, requestId, expectedStateVersion, revisionId, assignments, note }, deps = {}) {
  requireExamId(examId); requireRequestId(requestId); requireStateVersion(expectedStateVersion);
  const actor = requireActor(rawActor);
  if (!model.LIFECYCLE_STATES.includes(to)) throw invalid("الحالة المستهدفة غير معروفة.");
  const action = ACTION_OF_TARGET[to];
  const { manifest, etag } = await requireManifest(container, examId, deps);
  requireCapability(actor, action, manifest.lifecycleState);
  await ensureCommittedAudit(container, examId, manifest, deps);          // audit continuity before any new mutation
  const recorded = replayOrConflict(manifest, requestId, "transition:" + to);
  if (recorded) { await ensureAuditEvent(container, examId, recorded, deps); return replayResult(manifest, recorded); }
  if (manifest.stateVersion !== expectedStateVersion) { const e = new GovernanceError(409, "STALE_STATE", STALE_MESSAGE); e.manifest = manifest; throw e; }
  const from = manifest.lifecycleState;
  if (!model.isLegalTransition(from, to)) { const e = new GovernanceError(409, "ILLEGAL_TRANSITION", "الانتقال من «" + from + "» إلى «" + to + "» غير مسموح."); e.manifest = manifest; throw e; }
  const dir = directoryOf(deps);
  const workflow = manifest.reviewWorkflow || null;
  const at = nowOf(deps);
  const next = { ...manifest };
  let boundRevisionId = null;
  let decision;
  const preWrites = [], postCleanup = [];
  const result = {};
  let cycleId, decisionId;
  if (to === "in-review") {
    if (typeof revisionId !== "string" || revisionId !== manifest.latestRevisionId) { const e = new GovernanceError(409, "REVISION_MISMATCH", "يجب إرسال الإصدار الحالي بالضبط للمراجعة."); e.manifest = manifest; throw e; }
    const stored = await loadStoredRevision(container, examId, revisionId, deps);
    if (!stored || stored.revisionId !== revisionId || stored.examId !== examId) throw new GovernanceError(404, "REVISION_NOT_FOUND", "الإصدار المطلوب غير موجود.");
    // SERVER finalization on the STORED revision — the only authority for submission (client flags are ignored).
    const finalize = typeof deps.finalize === "function" ? deps.finalize : require("./server-finalization").evaluateServerFinalization;
    const { summarizeFinalization } = require("./server-finalization");
    decision = summarizeFinalization(finalize(stored.exam));
    if (!decision.canFinalize) throw new GovernanceError(422, "FINALIZATION_REFUSED", "الإصدار لا يستوفي متطلبات الجاهزية للاعتماد على الخادم.", decision);
    // Phase 16B-A — every simulation question must pin a package that EXISTS in storage with exactly that id / version / hash
    // (finalization above only checks the reference's shape). deps-injectable for tests; the default reads the package store.
    const simulationAvailability = typeof deps.simulationAvailability === "function" ? deps.simulationAvailability : require("./smartsim/package-store").examSimulationAvailabilityIssues;
    const unavailable = await simulationAvailability(container, stored.exam);
    if (unavailable.length) throw new GovernanceError(422, "SIMULATION_PACKAGE_UNAVAILABLE", "حزمة محاكاة مثبّتة في الامتحان غير متاحة في المخزن؛ لا يمكن إرسال الإصدار للمراجعة.", { issues: unavailable });
    // Phase 21D-B.3 — every UPLOADED mesh model must exist in the mesh-asset store with the pinned length and every labelled part.
    const meshAvailability = typeof deps.meshAssetAvailability === "function" ? deps.meshAssetAvailability : require("./mesh-assets/store").examMeshAssetAvailabilityIssues;
    const missingModels = await meshAvailability(container, stored.exam);
    if (missingModels.length) throw new GovernanceError(422, "MESH_ASSET_UNAVAILABLE", "ملف نموذج ثلاثي الأبعاد مثبّت في الامتحان غير متاح في المخزن؛ لا يمكن إرسال الإصدار للمراجعة.", { issues: missingModels });
    next.reviewRevisionId = revisionId;
    next.reviewRevisionNumber = manifest.latestRevisionNumber;
    boundRevisionId = revisionId;
    if (dir) {
      // Assigned mode: a submission opens ONE server-owned review cycle bound to this exact revision and to four distinct
      // authenticated identities; the client cycleId / role / capability fields are never read.
      if (!directoryHolds(dir, actor.id, "author")) throw new GovernanceError(403, "FORBIDDEN", "لا تملك الصلاحية اللازمة لهذا الإجراء.");
      const chosen = validateAssignments(dir, actor, assignments);
      const cycle = { cycleId: "cyc-" + newId(deps), revisionId, revisionNumber: manifest.latestRevisionNumber, authorId: actor.id, ...chosen, submittedAt: at, submittedBy: actor.id, reviewStatus: "pending" };
      next.reviewWorkflow = cycle;
      cycleId = cycle.cycleId; result.cycleId = cycleId;
      preWrites.push(openTask({ container, doc: pointerFor("review", cycle.reviewerId, examId, cycle, String(stored.exam.title || ""), at) }));
    }
  } else if (to === "approved") {
    if (dir && !workflow) { const e = new GovernanceError(409, "WORKFLOW_REQUIRED", "أُرسل هذا الإصدار دون دورة مراجعة معيَّنة؛ أعده إلى المسودة ثم أعد إرساله مع تعيين المراجع والمعتمد والناشر."); e.manifest = manifest; throw e; }
    if (workflow) {
      requireAssigned(dir, actor, workflow, "approverId", "approve");
      if (workflow.reviewStatus !== "completed") { const e = new GovernanceError(409, "REVIEW_NOT_COMPLETED", "لا يمكن الاعتماد قبل أن يُتمّ المراجع المعيَّن مراجعته."); e.manifest = manifest; throw e; }
      cycleId = workflow.cycleId;
      const noteText = requireNote(note, false);
      const wf = { ...workflow, approvedAt: at, approvedBy: actor.id };
      if (noteText) {
        const record = decisionRecordOf({ examId, workflow, stage: "approval", decision: "approved", actor, at, note: noteText, sequence: manifest.eventCount + 1, deps });
        wf.approvalDecisionId = record.decisionId; decisionId = record.decisionId; result.decisionId = decisionId;
        preWrites.push(decisionWrite(container, record));
      }
      next.reviewWorkflow = wf;
      const title = await revisionTitle(container, examId, workflow, deps);
      preWrites.push(openTask({ container, doc: pointerFor("publish", workflow.publisherId, examId, workflow, title, at) }));
      postCleanup.push(closeTask(container, workflow.approverId, "approve", examId, workflow));
    }
    boundRevisionId = manifest.reviewRevisionId;
    next.approvedRevisionId = boundRevisionId;
    next.approvedRevisionNumber = manifest.reviewRevisionNumber;
    next.approvedAt = at; next.approvedBy = actor.id;
  } else if (to === "published") {
    if (dir && !workflow) { const e = new GovernanceError(409, "WORKFLOW_REQUIRED", "لا توجد دورة مراجعة معيَّنة لهذا الاعتماد؛ أعده إلى المسودة ثم أعد إرساله عبر دورة مراجعة."); e.manifest = manifest; throw e; }
    if (workflow) {
      requireAssigned(dir, actor, workflow, "publisherId", "publish");
      cycleId = workflow.cycleId;
      next.reviewWorkflow = { ...workflow, publishedAt: at, publishedBy: actor.id };
      postCleanup.push(closeTask(container, workflow.publisherId, "publish", examId, workflow));
    }
    boundRevisionId = manifest.approvedRevisionId;
    next.publishedRevisionId = boundRevisionId;
    next.publishedRevisionNumber = manifest.approvedRevisionNumber;
    next.publishedAt = at; next.publishedBy = actor.id;
  } else {
    // → draft: begin a new editable lineage; review / approval pointers are cleared, the publication is untouched.
    // BYPASS RULE (14B): while a review cycle is active (in-review / approved) the generic return-to-draft is refused for
    // everyone — the only exits are the explicit workflow actions (withdraw / request changes / reject). After publication
    // the cycle is complete and historical, so opening a new draft is the author's ordinary action.
    if (workflow && from !== "published") { const e = new GovernanceError(409, "WORKFLOW_ACTION_REQUIRED", "توجد دورة مراجعة معيَّنة نشطة؛ استخدم إجراءات الدورة (سحب طلب المراجعة، طلب تعديلات، رفض الاعتماد، إعادة قبل النشر) بدل الإرجاع العام إلى المسودة."); e.manifest = manifest; throw e; }
    if (workflow) cycleId = workflow.cycleId;
    clearCyclePointers(next);
  }
  const type = model.transitionEventType(from, to);
  next.lifecycleState = to;
  next.stateVersion = manifest.stateVersion + 1;
  next.updatedAt = at;
  next.eventCount = manifest.eventCount + 1;
  next.lastTransition = { type, at, by: actor.id, requestId, fromState: from, toState: to };
  const audit = auditDescriptorOf({ manifestAfter: next, type, revisionId: boundRevisionId || undefined, fromState: from, toState: to, actor, at, deps, cycleId, decisionId });
  if (boundRevisionId) result.revisionId = boundRevisionId;
  if (decision) result.decision = decision;
  const command = { requestId, type: "transition:" + to, at, stateVersion: next.stateVersion, result, audit };
  const event = await commitMutation(container, examId, { manifest, etag, next, command, preWrites, postCleanup }, deps);
  return { manifest: next, event, replayed: false, ...(decision ? { decision } : {}), ...(decisionId ? { decisionId } : {}) };
}
const submitForReview = (container, args, deps) => transition(container, { ...args, to: "in-review" }, deps);
const approve = (container, args, deps) => transition(container, { ...args, to: "approved" }, deps);
const publish = (container, args, deps) => transition(container, { ...args, to: "published" }, deps);
const returnToDraft = (container, args, deps) => transition(container, { ...args, to: "draft" }, deps);

// ── 14B — explicit workflow decisions (Reviewer / Approver / Publisher / cycle Author) ───────────────────────────────
//   complete-review      in-review → in-review   assigned reviewer   optional note   review-completed (decision record always)
//   request-changes      in-review → draft       assigned reviewer   NOTE REQUIRED   changes-requested
//   reject-approval      in-review → draft       assigned approver   NOTE REQUIRED   approval-rejected  (only after completed review)
//   reject-publication   approved  → draft       assigned publisher  NOTE REQUIRED   publication-rejected
//   withdraw-review      in-review → draft       the cycle author    optional note   withdrawn
// Same authority as transition(): expectedStateVersion, requestId replay / conflict, audit continuity preflight, decision
// record + next-task pointer before the CAS (undone on a lost CAS), CAS, create-only audit event, pointer close after.
const DECISION_OF = {
  "complete-review": { stage: "review", decision: "review-completed", event: "review-completed", to: "in-review", noteRequired: false },
  "request-changes": { stage: "review", decision: "changes-requested", event: "changes-requested", to: "draft", noteRequired: true },
  "reject-approval": { stage: "approval", decision: "approval-rejected", event: "approval-rejected", to: "draft", noteRequired: true },
  "reject-publication": { stage: "publication", decision: "publication-rejected", event: "publication-rejected", to: "draft", noteRequired: true },
  "withdraw-review": { stage: "author", decision: "withdrawn", event: "review-withdrawn", to: "draft", noteRequired: false }
};
async function workflowDecision(container, { examId, action, actor: rawActor, requestId, expectedStateVersion, note }, deps = {}) {
  requireExamId(examId); requireRequestId(requestId); requireStateVersion(expectedStateVersion);
  const actor = requireActor(rawActor);
  const spec = Object.prototype.hasOwnProperty.call(DECISION_OF, action) ? DECISION_OF[action] : null;
  if (!spec) throw invalid("إجراء المراجعة غير معروف.");
  const { manifest, etag } = await requireManifest(container, examId, deps);
  requireCapability(actor, action, manifest.lifecycleState);
  await ensureCommittedAudit(container, examId, manifest, deps);          // audit continuity before any new mutation
  const recorded = replayOrConflict(manifest, requestId, "workflow:" + action);
  if (recorded) { await ensureAuditEvent(container, examId, recorded, deps); return replayResult(manifest, recorded); }
  if (manifest.stateVersion !== expectedStateVersion) { const e = new GovernanceError(409, "STALE_STATE", STALE_MESSAGE); e.manifest = manifest; throw e; }
  const from = manifest.lifecycleState;
  const workflow = manifest.reviewWorkflow || null;
  const illegal = message => { const e = new GovernanceError(409, "ILLEGAL_TRANSITION", message); e.manifest = manifest; throw e; };
  if (!workflow) illegal("لا توجد دورة مراجعة معيَّنة نشطة لهذا الامتحان.");
  const dir = directoryOf(deps);
  if (!dir) throw identityUnavailable();
  const expectedFrom = action === "reject-publication" ? "approved" : "in-review";
  if (from !== expectedFrom) illegal("هذا الإجراء غير متاح في الحالة «" + from + "».");
  if (action === "complete-review" || action === "request-changes") {
    requireAssigned(dir, actor, workflow, "reviewerId", "review");
    if (workflow.reviewStatus !== "pending") illegal("اكتملت المراجعة بالفعل؛ المرحلة الحالية عند المعتمد.");
  } else if (action === "reject-approval") {
    requireAssigned(dir, actor, workflow, "approverId", "approve");
    if (workflow.reviewStatus !== "completed") { const e = new GovernanceError(409, "REVIEW_NOT_COMPLETED", "لا يمكن رفض الاعتماد قبل أن يُتمّ المراجع المعيَّن مراجعته."); e.manifest = manifest; throw e; }
  } else if (action === "reject-publication") {
    requireAssigned(dir, actor, workflow, "publisherId", "publish");
  } else {
    requireAssigned(dir, actor, workflow, "authorId", "author");            // withdraw: only the cycle's own author
  }
  const noteText = requireNote(note, spec.noteRequired);
  const at = nowOf(deps);
  const next = { ...manifest };
  const record = decisionRecordOf({ examId, workflow, stage: spec.stage, decision: spec.decision, actor, at, note: noteText, sequence: manifest.eventCount + 1, deps });
  const preWrites = [decisionWrite(container, record)], postCleanup = [];
  const openStage = workflow.reviewStatus === "pending" ? "review" : from === "approved" ? "publish" : "approve";
  const openActor = openStage === "review" ? workflow.reviewerId : openStage === "approve" ? workflow.approverId : workflow.publisherId;
  if (action === "complete-review") {
    next.reviewWorkflow = { ...workflow, reviewStatus: "completed", reviewedAt: at, reviewedBy: actor.id, reviewDecisionId: record.decisionId };
    const title = await revisionTitle(container, examId, workflow, deps);
    preWrites.push(openTask({ container, doc: pointerFor("approve", workflow.approverId, examId, workflow, title, at) }));
  } else {
    clearCyclePointers(next);
    next.lastDecision = lastDecisionOf(record);
    next.lifecycleState = "draft";
  }
  postCleanup.push(closeTask(container, openActor, openStage, examId, workflow));
  next.stateVersion = manifest.stateVersion + 1;
  next.updatedAt = at;
  next.eventCount = manifest.eventCount + 1;
  next.lastTransition = { type: spec.event, at, by: actor.id, requestId, fromState: from, toState: spec.to };
  const audit = auditDescriptorOf({ manifestAfter: next, type: spec.event, revisionId: workflow.revisionId, fromState: from, toState: spec.to, actor, at, deps, cycleId: workflow.cycleId, decisionId: record.decisionId });
  const command = { requestId, type: "workflow:" + action, at, stateVersion: next.stateVersion, result: { revisionId: workflow.revisionId, cycleId: workflow.cycleId, decisionId: record.decisionId }, audit };
  const event = await commitMutation(container, examId, { manifest, etag, next, command, preWrites, postCleanup }, deps);
  return { manifest: next, event, decision: undefined, decisionId: record.decisionId, replayed: false };
}

// ── history readers (metadata only, bounded pages) ───────────────────────────────────────────────────────────────────
function clampLimit(limit) { const n = Number(limit); return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PAGE, Math.floor(n)) : DEFAULT_PAGE; }
async function listRevisions(container, { examId, cursor, limit }, deps = {}) {
  requireExamId(examId);
  const { manifest } = await requireManifest(container, examId, deps);
  const size = clampLimit(limit);
  const before = Number.isInteger(cursor) ? cursor : Infinity;
  const lineage = manifest.revisions.slice().sort((a, b) => b.revisionNumber - a.revisionNumber).filter(r => r.revisionNumber < before);
  const page = lineage.slice(0, size);
  const dl = dlOf(deps);
  const items = [];
  for (const r of page) {
    let meta = await dl(container, model.revisionMetaName(examId, r.revisionNumber, r.revisionId));
    if (!meta) { const body = await dl(container, model.revisionName(examId, r.revisionId)); meta = body ? metaOf(body) : { revisionId: r.revisionId, revisionNumber: r.revisionNumber, missing: true }; }
    const { schemaVersion: _sv, examId: _e, ...rest } = meta;
    items.push({ ...rest, roles: rolesOf(manifest, r.revisionId) });
  }
  const nextCursor = lineage.length > size ? page[page.length - 1].revisionNumber : null;
  return { items, nextCursor };
}
async function loadRevision(container, { examId, revisionId }, deps = {}) {
  requireExamId(examId);
  if (!model.isSafeRevisionId(revisionId)) throw new GovernanceError(404, "REVISION_NOT_FOUND", "الإصدار المطلوب غير موجود.");
  const revision = await dlOf(deps)(container, model.revisionName(examId, revisionId));
  if (!revision || revision.examId !== examId) throw new GovernanceError(404, "REVISION_NOT_FOUND", "الإصدار المطلوب غير موجود.");
  return revision;
}
async function listEvents(container, { examId, cursor, limit }, deps = {}) {
  requireExamId(examId);
  const size = clampLimit(limit);
  const before = Number.isInteger(cursor) ? cursor : Infinity;
  const prefix = model.eventsPrefix(examId);
  const names = await ((deps && deps.listBlobNames) || storage.listBlobNames)(container, prefix);
  const parsed = names.map(name => ({ name, sequence: Number(name.slice(prefix.length, prefix.length + 6)) })).filter(x => Number.isInteger(x.sequence) && x.sequence < before).sort((a, b) => b.sequence - a.sequence);
  const page = parsed.slice(0, size);
  const dl = dlOf(deps);
  const items = [];
  for (const p of page) { const ev = await dl(container, p.name); if (ev) items.push(ev); }
  return { items, nextCursor: parsed.length > size ? page[page.length - 1].sequence : null };
}

// ── 14B decision records (human notes; immutable, bounded pages, never exam bodies) ─────────────────────────────────
async function listDecisions(container, { examId, cursor, limit }, deps = {}) {
  requireExamId(examId);
  const size = clampLimit(limit);
  const before = Number.isInteger(cursor) ? cursor : Infinity;
  const prefix = model.decisionsPrefix(examId);
  const names = await ((deps && deps.listBlobNames) || storage.listBlobNames)(container, prefix);
  const parsed = names.map(name => ({ name, sequence: Number(name.slice(prefix.length, prefix.length + 6)) })).filter(x => Number.isInteger(x.sequence) && x.sequence < before).sort((a, b) => b.sequence - a.sequence);
  const page = parsed.slice(0, size);
  const dl = dlOf(deps);
  const items = [];
  for (const p of page) { const d = await dl(container, p.name); if (d) items.push(d); }
  return { items, nextCursor: parsed.length > size ? page[page.length - 1].sequence : null };
}
async function loadDecision(container, { examId, decisionId }, deps = {}) {
  requireExamId(examId);
  const missing = () => new GovernanceError(404, "DECISION_NOT_FOUND", "سجل القرار غير موجود.");
  if (!model.isSafeId(decisionId)) throw missing();
  const prefix = model.decisionsPrefix(examId);
  const names = await ((deps && deps.listBlobNames) || storage.listBlobNames)(container, prefix);
  const name = names.find(n => n.endsWith("-" + decisionId + ".json"));
  const d = name ? await dlOf(deps)(container, name) : null;
  if (!d || d.examId !== examId || d.decisionId !== decisionId) throw missing();
  return d;
}

// ── the ONE published-revision loader (fail closed) ──────────────────────────────────────────────────────────────────
async function loadPublishedRevision(container, examId, deps = {}) {
  requireExamId(examId);
  // The ONE validated manifest authority: absent → NOT_GOVERNED; present but malformed → MANIFEST_CORRUPT (never a
  // partial check, never a fallback to a draft, a browser body or legacy behaviour).
  const { manifest } = await readManifest(container, examId, deps);
  if (!manifest) throw new GovernanceError(404, "NOT_GOVERNED", "هذا الامتحان غير مسجّل في إدارة النشر.");
  const unavailable = () => new GovernanceError(409, "PUBLISHED_REVISION_UNAVAILABLE", "النسخة المنشورة غير متاحة أو غير سليمة؛ لا يمكن استخدام مسودة بدلًا منها.");
  if (!manifest.publishedRevisionId) throw new GovernanceError(409, "NO_PUBLISHED_REVISION", "لا توجد نسخة منشورة لهذا الامتحان. انشر الامتحان من «إدارة النشر والإصدارات» أولًا.");
  const id = manifest.publishedRevisionId;
  if (!model.isSafeRevisionId(id) || !Array.isArray(manifest.revisions) || !manifest.revisions.some(r => r && r.revisionId === id)) throw unavailable();
  const revision = await dlOf(deps)(container, model.revisionName(examId, id));
  if (!revision || revision.revisionId !== id || revision.examId !== examId || !revision.exam || typeof revision.exam !== "object") throw unavailable();
  let hash = null;
  try { hash = contentHashOf(revision.exam); } catch { throw unavailable(); }
  if (hash !== revision.contentHash) throw unavailable();
  return revision;
}
// Assignment integration: is this exam governed, and if so, which immutable published revision must be used?
// manifest absent ⇒ legacy / not governed · present and valid ⇒ governed · present but invalid ⇒ FAIL CLOSED (thrown).
async function resolveGovernedExamSource(container, examId, deps = {}) {
  if (!model.isSafeExamId(examId)) return { governed: false };
  const raw = await readManifestRaw(container, examId, deps);
  if (!raw.manifest) return { governed: false };
  const revision = await loadPublishedRevision(container, examId, deps);
  return { governed: true, manifest: publicManifest(raw.manifest), revision };
}

module.exports = {
  GovernanceError, STALE_MESSAGE, WORKFLOW_ACTIONS,
  getGovernanceStatus, enableGovernance, createRevision, transition, submitForReview, approve, publish, returnToDraft, workflowDecision,
  listRevisions, loadRevision, listEvents, listDecisions, loadDecision, loadPublishedRevision, resolveGovernedExamSource,
  writeRevisionDocument, writeEventDocument, writeDecisionDocument, ensureAuditEvent, ensureCommittedAudit, latestCommittedCommand, publicManifest, rolesOf
};
