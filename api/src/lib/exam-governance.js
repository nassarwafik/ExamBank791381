const crypto = require("crypto");
const storage = require("./platform-storage");
const model = require("./exam-governance-model");
const { canonicalizeExamContent, contentHashOf, stableStringify } = require("./exam-canonical");
const { requiredCapabilities } = require("./exam-governance-capabilities");
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
//    before reporting success — so a committed transition can never end up without its immutable audit event.
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
function auditDescriptorOf({ manifestAfter, type, revisionId, fromState, toState, actor, at, deps }) {
  return {
    eventId: "ev-" + newId(deps), sequence: manifestAfter.eventCount, type,
    ...(revisionId ? { revisionId } : {}), ...(fromState ? { fromState } : {}), ...(toState ? { toState } : {}),
    actorId: actor.id, occurredAt: at
  };
}
function eventFromAudit(examId, audit, requestId) {
  return {
    schemaVersion: 1, eventId: audit.eventId, examId, type: audit.type,
    ...(audit.revisionId ? { revisionId: audit.revisionId } : {}), ...(audit.fromState ? { fromState: audit.fromState } : {}), ...(audit.toState ? { toState: audit.toState } : {}),
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
  try { await storage.uploadJsonConditional(container, name, expected, null); return expected; }
  catch (e) {
    if (storage.isConcurrencyConflict(e)) {
      const existing = await dlOf(deps)(container, name);
      if (existing && stableStringify(existing) === stableStringify(expected)) return existing;
      throw new GovernanceError(500, "AUDIT_INTEGRITY", "يوجد حدث تدقيق مخالف باسم السجل المعتمد؛ لا يمكن الكتابة فوقه.");
    }
    const pending = new GovernanceError(503, "AUDIT_EVENT_PENDING", "اكتملت العملية على الخادم لكن حدث التدقيق لم يُسجَّل بعد؛ أعد المحاولة بنفس requestId لإتمام التسجيل.");
    pending.cause = e;
    throw pending;
  }
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

async function loadStoredRevision(container, examId, revisionId, deps) {
  if (!model.isSafeRevisionId(revisionId)) return null;
  return dlOf(deps)(container, model.revisionName(examId, revisionId));
}

async function transition(container, { examId, to, actor: rawActor, requestId, expectedStateVersion, revisionId }, deps = {}) {
  requireExamId(examId); requireRequestId(requestId); requireStateVersion(expectedStateVersion);
  const actor = requireActor(rawActor);
  if (!model.LIFECYCLE_STATES.includes(to)) throw invalid("الحالة المستهدفة غير معروفة.");
  const action = ACTION_OF_TARGET[to];
  const { manifest, etag } = await requireManifest(container, examId, deps);
  requireCapability(actor, action, manifest.lifecycleState);
  const recorded = replayOrConflict(manifest, requestId, "transition:" + to);
  if (recorded) { await ensureAuditEvent(container, examId, recorded, deps); return { manifest, replayed: true, ...(recorded.result && recorded.result.decision ? { decision: recorded.result.decision } : {}) }; }
  if (manifest.stateVersion !== expectedStateVersion) { const e = new GovernanceError(409, "STALE_STATE", STALE_MESSAGE); e.manifest = manifest; throw e; }
  const from = manifest.lifecycleState;
  if (!model.isLegalTransition(from, to)) { const e = new GovernanceError(409, "ILLEGAL_TRANSITION", "الانتقال من «" + from + "» إلى «" + to + "» غير مسموح."); e.manifest = manifest; throw e; }
  const at = nowOf(deps);
  const next = { ...manifest };
  let boundRevisionId = null;
  let decision;
  if (to === "in-review") {
    if (typeof revisionId !== "string" || revisionId !== manifest.latestRevisionId) { const e = new GovernanceError(409, "REVISION_MISMATCH", "يجب إرسال الإصدار الحالي بالضبط للمراجعة."); e.manifest = manifest; throw e; }
    const stored = await loadStoredRevision(container, examId, revisionId, deps);
    if (!stored || stored.revisionId !== revisionId || stored.examId !== examId) throw new GovernanceError(404, "REVISION_NOT_FOUND", "الإصدار المطلوب غير موجود.");
    // SERVER finalization on the STORED revision — the only authority for submission (client flags are ignored).
    const finalize = typeof deps.finalize === "function" ? deps.finalize : require("./server-finalization").evaluateServerFinalization;
    const { summarizeFinalization } = require("./server-finalization");
    decision = summarizeFinalization(finalize(stored.exam));
    if (!decision.canFinalize) throw new GovernanceError(422, "FINALIZATION_REFUSED", "الإصدار لا يستوفي متطلبات الجاهزية للاعتماد على الخادم.", decision);
    next.reviewRevisionId = revisionId;
    next.reviewRevisionNumber = manifest.latestRevisionNumber;
    boundRevisionId = revisionId;
  } else if (to === "approved") {
    boundRevisionId = manifest.reviewRevisionId;
    next.approvedRevisionId = boundRevisionId;
    next.approvedRevisionNumber = manifest.reviewRevisionNumber;
    next.approvedAt = at; next.approvedBy = actor.id;
  } else if (to === "published") {
    boundRevisionId = manifest.approvedRevisionId;
    next.publishedRevisionId = boundRevisionId;
    next.publishedRevisionNumber = manifest.approvedRevisionNumber;
    next.publishedAt = at; next.publishedBy = actor.id;
  } else {
    // → draft: begin a new editable lineage; review / approval pointers are cleared, the publication is untouched.
    delete next.reviewRevisionId; delete next.reviewRevisionNumber;
    delete next.approvedRevisionId; delete next.approvedRevisionNumber; delete next.approvedAt; delete next.approvedBy;
  }
  const type = model.transitionEventType(from, to);
  next.lifecycleState = to;
  next.stateVersion = manifest.stateVersion + 1;
  next.updatedAt = at;
  next.eventCount = manifest.eventCount + 1;
  next.lastTransition = { type, at, by: actor.id, requestId, fromState: from, toState: to };
  const audit = auditDescriptorOf({ manifestAfter: next, type, revisionId: boundRevisionId || undefined, fromState: from, toState: to, actor, at, deps });
  const command = { requestId, type: "transition:" + to, at, stateVersion: next.stateVersion, result: { ...(boundRevisionId ? { revisionId: boundRevisionId } : {}), ...(decision ? { decision } : {}) }, audit };
  next.commands = recordCommand(manifest, command);
  const issues = model.validateManifest(next);
  if (issues.length) throw new GovernanceError(500, "MANIFEST_CORRUPT", "لا يمكن تنفيذ الانتقال: " + issues.join("، "));
  await casManifest(container, examId, next, etag);
  const event = await ensureAuditEvent(container, examId, command, deps);
  return { manifest: next, event, replayed: false, ...(decision ? { decision } : {}) };
}
const submitForReview = (container, args, deps) => transition(container, { ...args, to: "in-review" }, deps);
const approve = (container, args, deps) => transition(container, { ...args, to: "approved" }, deps);
const publish = (container, args, deps) => transition(container, { ...args, to: "published" }, deps);
const returnToDraft = (container, args, deps) => transition(container, { ...args, to: "draft" }, deps);

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
  GovernanceError, STALE_MESSAGE,
  getGovernanceStatus, enableGovernance, createRevision, transition, submitForReview, approve, publish, returnToDraft,
  listRevisions, loadRevision, listEvents, loadPublishedRevision, resolveGovernedExamSource,
  writeRevisionDocument, writeEventDocument, ensureAuditEvent, publicManifest, rolesOf
};
