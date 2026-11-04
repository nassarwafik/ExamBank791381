// Tadris+ P9-A1 — the owner's explicit decision for every class WITHOUT an owner (blueprint §11.2 step M7, §11.3; owner decisions
// §19.33; design docs/enterprise-legacy-ownership-p9a.md, approved). Nothing here runs by itself: every call comes from the owner's
// console (owner-legacy-classes.js — owner session, step-up, a written reason). TEST data only in this repository.
//
//   inventory()  every class without ownerId, its counts and the decision recorded for it (read only);
//   plan()       a DRY RUN: exactly which documents a decision would change (before → after), what stays untouched, who loses / gains
//                the class, and a DIGEST of every document read (its ETag) — nothing is written;
//   apply()      the decision, only when the digest still matches (anything changed since the preview → PREVIEW_STALE, nothing
//                written). The LEDGER (platform/migrations/<id>.json, create-only) is written FIRST, with the previous values (an
//                absent ownerId is recorded as absent); then every change by compare-and-set; then the ledger is completed. A run that
//                stopped half-way is resumed by the same requestKey (never applied twice);
//   undo()       back to the previous values — only when EVERY changed document still holds exactly what the decision wrote (no later
//                transfer, no other owner): all of them are checked before anything is written; otherwise UNDO_CONFLICT, nothing written.
//
// Decisions: "assign" (a teacher: class.ownerId, and every student of the class without an ownerId, archived ones too — a student that
// already carries an owner is never touched); "shared" (nothing changes: the decision itself is recorded); "archive" (the class is
// archived with the teachers' own lifecycle function — it keeps every result). Identities never change (classId, userId); assignments,
// submissions, results, messages and projects are never written: they follow the class (teacher-tenancy.js).
const crypto = require("crypto");
const storage = require("../platform-storage");
const { loadDocs } = require("../classes-students-read-cache");
const { normalizeClassStatus } = require("../class-lifecycle");
const { legacyDataOwner } = require("../teacher-tenancy");
const { createPendingGradingReader, pendingForClassMembers } = require("../pending-grading");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const ASSIGNMENT_PREFIX = "platform/assignments/";
const LEDGER_PREFIX = "platform/migrations/";
const KIND = "legacy-class-ownership";
const DECISIONS = Object.freeze(["assign", "shared", "archive"]);
const MIN_REASON = 5, MAX_REASON = 500;
const REQUEST_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

class LegacyRefusal extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

const hasOwner = doc => Boolean(doc && typeof doc.ownerId === "string" && doc.ownerId);
const isSafeId = id => SAFE_ID_RE.test(String(id || ""));
const classStudentsOf = (users, classId) => users.filter(u => u && u.role === "student" && String(u.classId || "") === classId && isSafeId(u.userId));
const sha = v => crypto.createHash("sha256").update(v).digest("hex");
const ledgerName = id => LEDGER_PREFIX + id + ".json";
/** The ledger id of a decision: one per (class, request key) — repeating the request resumes it, never applies it twice. */
const migrationIdFor = (classId, requestKey) => "mig-" + sha(KIND + "\n" + classId + "\n" + requestKey).slice(0, 24);

/** Who sees an unowned class today: the operator's LEGACY_DATA_OWNER, or «shared» (the original teachers and t_legacy). */
const visibilityToday = env => (legacyDataOwner(env) ? { kind: "legacy-owner", accountId: legacyDataOwner(env) } : { kind: "shared" });

/** The latest applied (not undone) decision of each class, from the ledgers. */
function decisionsByClass(ledgers) {
  const out = new Map();
  for (const l of ledgers) {
    if (!l || l.kind !== KIND || l.status !== "applied") continue;
    const prev = out.get(l.classId);
    if (!prev || String(l.at) > String(prev.at)) out.set(l.classId, l);
  }
  return out;
}
const decisionView = l => (l ? { migrationId: l.migrationId, decision: l.decision, toAccountId: l.to || "", at: l.at, by: l.by } : null);

/** Every class without an owner, with its counts and its recorded decision (read only). */
async function inventory(container, deps = {}, env = process.env) {
  const ls = deps.listJson || loadDocs;
  const [classes, users, assignments, ledgers] = await Promise.all([ls(container, CLASS_PREFIX), ls(container, USER_PREFIX), ls(container, ASSIGNMENT_PREFIX), ls(container, LEDGER_PREFIX)]);
  const decided = decisionsByClass(ledgers);
  const rows = classes.filter(c => c && !hasOwner(c) && isSafeId(c.classId)).map(c => {
    const classId = String(c.classId);
    const studs = classStudentsOf(users, classId);
    const byStatus = {};
    for (const a of assignments) if (a && String(a.classId || "") === classId) { const s = String(a.status || "draft"); byStatus[s] = (byStatus[s] || 0) + 1; }
    return {
      classId, name: String(c.name || ""), grade: String(c.grade || ""), schoolYear: String(c.schoolYear || ""), status: normalizeClassStatus(c),
      students: { total: studs.length, archived: studs.filter(s => s.archived === true).length, withOwner: studs.filter(hasOwner).length },
      assignments: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
      decision: decisionView(decided.get(classId))
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "ar") || a.classId.localeCompare(b.classId));
  return { visibilityToday: visibilityToday(env), classes: rows };
}

function checkDecision(decision, to) {
  if (!DECISIONS.includes(decision)) throw new LegacyRefusal(400, "DECISION_INVALID", "اختر قرارًا: معلم محدد، أو يبقى مشتركًا، أو أرشفة.");
  if (decision === "assign" && !to) throw new LegacyRefusal(400, "TARGET_INVALID", "اختر المعلم الذي يُسند إليه الصف.");
}

/**
 * The DRY RUN of a decision: what it would change, what it leaves, who loses / gains the class, and the digest of every document it
 * read. Nothing is written. Throws LegacyRefusal for an impossible decision.
 */
async function plan(container, { classId, decision, to = "" }, deps = {}, env = process.env) {
  const read = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const ls = deps.listJson || loadDocs;
  checkDecision(decision, to);
  if (!isSafeId(classId)) throw new LegacyRefusal(404, "CLASS_NOT_FOUND", "الصف غير موجود.");
  const cls = await read(container, CLASS_PREFIX + classId + ".json");
  if (!cls.value || String(cls.value.classId || classId) !== classId) throw new LegacyRefusal(404, "CLASS_NOT_FOUND", "الصف غير موجود.");
  if (hasOwner(cls.value)) throw new LegacyRefusal(409, "CLASS_ALREADY_OWNED", "للصف مالك بالفعل. انقله من صفحة المعلم إن لزم.");
  const status = normalizeClassStatus(cls.value);
  if (decision === "archive" && status === "archived") throw new LegacyRefusal(409, "CLASS_ALREADY_ARCHIVED", "الصف مؤرشف بالفعل. اختر «يبقى مشتركًا» أو معلمًا محددًا.");

  const ids = classStudentsOf(await ls(container, USER_PREFIX), classId).map(s => String(s.userId)).sort();
  const students = [];
  for (const userId of ids) {
    const r = await read(container, USER_PREFIX + userId + ".json");
    if (r.value && r.value.role === "student" && String(r.value.classId || "") === classId) students.push({ userId, doc: r.value, etag: r.etag });
  }
  const changes = [], untouched = [];
  if (decision === "assign") {
    changes.push({ path: CLASS_PREFIX + classId + ".json", type: "class", field: "ownerId", before: null, after: to });
    for (const s of students) {
      if (hasOwner(s.doc)) untouched.push({ userId: s.userId, ownerId: s.doc.ownerId, reason: "owned" });
      else changes.push({ path: USER_PREFIX + s.userId + ".json", type: "student", userId: s.userId, field: "ownerId", before: null, after: to, archived: s.doc.archived === true });
    }
  } else if (decision === "archive") {
    changes.push({ path: CLASS_PREFIX + classId + ".json", type: "class", field: "status", before: status, after: "archived" });
  }
  const current = students.filter(s => s.doc.archived !== true).map(s => s.userId);
  const pendingGrading = decision === "archive" && current.length ? await pendingForClassMembers((deps.createPendingGradingReader || createPendingGradingReader)(container), classId, current) : 0;
  const before = visibilityToday(env);
  const visibility = {
    before,
    after: decision === "assign" ? { kind: "teacher", accountId: to } : before,
    // the students' services (messages, games, course entitlement) follow the class's teacher (student-services.js, course-access.js)
    studentServicesFollow: decision === "assign" ? to : (before.kind === "legacy-owner" ? before.accountId : "t_legacy")
  };
  const digest = sha(JSON.stringify({ kind: KIND, classId, decision, to: decision === "assign" ? to : "", classEtag: cls.etag, students: students.map(s => [s.userId, s.etag]) }));
  return {
    classId, className: String(cls.value.name || ""), status, decision, to: decision === "assign" ? to : "",
    changes, untouched, students: { total: students.length, changed: changes.filter(c => c.type === "student").length, untouched: untouched.length },
    pendingGrading, visibility, digest
  };
}

async function createLedgerOrResume(container, ledger, deps) {
  const upload = deps.uploadJsonConditional || storage.uploadJsonConditional;
  try { await upload(container, ledgerName(ledger.migrationId), ledger, null); return ledger; }
  catch (e) {
    if (!storage.isConcurrencyConflict(e)) throw e;
    return null;   // written meanwhile by the same request: the caller re-reads it
  }
}

/**
 * Applies a decision (see the header). `archiveClass(classId)` performs the teachers' archive (manage-classrooms changeClassLifecycle)
 * and answers its HTTP-like result. → { ledger, duplicate? } ; throws LegacyRefusal (nothing written) for a stale or impossible request.
 */
async function apply(container, { classId, decision, to = "", reason, previewDigest, requestKey, actor, nowMs = Date.now() }, deps = {}, env = process.env) {
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const note = String(reason || "").replace(/\s+/g, " ").trim();
  if (note.length < MIN_REASON || note.length > MAX_REASON) throw new LegacyRefusal(400, "REASON_REQUIRED", "اكتب سبب القرار (" + MIN_REASON + " أحرف على الأقل).");
  if (!REQUEST_KEY_RE.test(String(requestKey || ""))) throw new LegacyRefusal(400, "REQUEST_KEY_INVALID", "مفتاح الطلب غير صالح.");
  checkDecision(decision, to);
  const migrationId = migrationIdFor(classId, requestKey);
  const at = new Date(nowMs).toISOString();

  let ledger = await dl(container, ledgerName(migrationId));
  if (ledger && (ledger.classId !== classId || ledger.decision !== decision || (ledger.to || "") !== (decision === "assign" ? to : ""))) throw new LegacyRefusal(409, "REQUEST_KEY_REUSED", "مفتاح الطلب استُخدم لقرار آخر.");
  if (ledger && ledger.status !== "pending") return { ledger, duplicate: true };
  if (!ledger) {
    const p = await plan(container, { classId, decision, to }, deps, env);
    if (!previewDigest || p.digest !== previewDigest) throw new LegacyRefusal(409, "PREVIEW_STALE", "تغيّر الصف أو طلابه منذ المعاينة. أعد المعاينة.");
    const fresh = {
      schemaVersion: 1, migrationId, kind: KIND, classId, className: p.className, decision, to: p.to, reason: note, by: actor, at, previewDigest,
      status: "pending", visibility: p.visibility, changes: p.changes.map(c => ({ ...c, outcome: "pending" })), untouched: p.untouched
    };
    ledger = (await createLedgerOrResume(container, fresh, deps)) || await dl(container, ledgerName(migrationId));   // the ledger FIRST
  }

  // the changes, each by compare-and-set; every outcome is recorded in the ledger
  const outcomes = {};
  if (decision === "assign") {
    for (const c of ledger.changes) {
      try {
        let outcome = "skipped";
        await mut(container, c.path, cur => {
          if (c.type === "class") {
            if (!cur) throw new LegacyRefusal(404, "CLASS_NOT_FOUND", "الصف غير موجود.");
            const history = Array.isArray(cur.ownerHistory) ? cur.ownerHistory : [];
            if (cur.ownerId === to && history.length && history[history.length - 1].migrationId === migrationId) { outcome = "changed"; return cur; }   // resumed
            if (hasOwner(cur)) throw new LegacyRefusal(409, "CLASS_ALREADY_OWNED", "صار للصف مالك منذ المعاينة.");
            outcome = "changed";
            return { ...cur, ownerId: to, ownerHistory: [...history, { from: null, to, at, by: actor, reason: note, migrationId }], updatedAt: at };
          }
          if (!cur || cur.role !== "student" || String(cur.classId || "") !== classId) { outcome = "skipped"; return cur; }   // moved meanwhile
          if (cur.ownerId === to && cur.legacyOwnershipMigrationId === migrationId) { outcome = "changed"; return cur; }   // resumed
          if (hasOwner(cur)) { outcome = "skipped"; return cur; }   // never another owner's student
          outcome = "changed";
          return { ...cur, ownerId: to, legacyOwnershipMigrationId: migrationId, profileRevision: Number(cur.profileRevision || 0) + 1, updatedAt: at };
        });
        outcomes[c.path] = outcome;
      } catch (e) {
        if (e instanceof LegacyRefusal && c.type === "class") throw e;   // the class itself: refused, nothing else written
        outcomes[c.path] = "failed";
        deps.obs?.logError?.("legacy.ownership.student.error", e, { classId });
      }
    }
  } else if (decision === "archive") {
    const r = await deps.archiveClass(classId);
    if (!r || r.status >= 300) {
      const body = (r && r.jsonBody) || {};
      await mut(container, ledgerName(migrationId), cur => ({ ...cur, status: "refused", refusedCode: String(body.code || "ARCHIVE_REFUSED"), refusedAt: at }));
      throw new LegacyRefusal(r && r.status === 409 ? 409 : 503, String(body.code || "ARCHIVE_REFUSED"), String(body.error || "تعذرت أرشفة الصف."), body.pendingCount ? { pendingCount: body.pendingCount } : {});
    }
    const after = await dl(container, CLASS_PREFIX + classId + ".json");
    outcomes[CLASS_PREFIX + classId + ".json"] = "changed";
    ledger = { ...ledger, archivedAt: String(after?.archivedAt || "") };
  }

  const failed = Object.values(outcomes).filter(o => o === "failed").length;
  const done = await mut(container, ledgerName(migrationId), cur => ({
    ...cur, ...(ledger.archivedAt ? { archivedAt: ledger.archivedAt } : {}),
    changes: cur.changes.map(c => ({ ...c, outcome: outcomes[c.path] || c.outcome })),
    status: failed ? "pending" : "applied", ...(failed ? {} : { appliedAt: at })
  }));
  return { ledger: done };
}

/** Undo (see the header). `unarchiveClass(classId)` performs the teachers' unarchive. → { ledger } ; throws LegacyRefusal. */
async function undo(container, { migrationId, reason, actor, nowMs = Date.now() }, deps = {}) {
  const read = deps.downloadJsonWithEtagOrNull || storage.downloadJsonWithEtagOrNull;
  const upload = deps.uploadJsonConditional || storage.uploadJsonConditional;
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const note = String(reason || "").replace(/\s+/g, " ").trim();
  if (note.length < MIN_REASON || note.length > MAX_REASON) throw new LegacyRefusal(400, "REASON_REQUIRED", "اكتب سبب التراجع (" + MIN_REASON + " أحرف على الأقل).");
  if (!/^mig-[a-f0-9]{24}$/.test(String(migrationId || ""))) throw new LegacyRefusal(404, "MIGRATION_NOT_FOUND", "السجل غير موجود.");
  const { value: ledger } = await read(container, ledgerName(migrationId));
  if (!ledger || ledger.kind !== KIND) throw new LegacyRefusal(404, "MIGRATION_NOT_FOUND", "السجل غير موجود.");
  if (ledger.status !== "applied") throw new LegacyRefusal(409, "UNDO_NOT_APPLICABLE", "لا يمكن التراجع إلا عن قرار مُنفَّذ بالكامل.");
  const at = new Date(nowMs).toISOString();
  const changed = ledger.changes.filter(c => c.outcome === "changed");

  // 1. CHECK every changed document before writing anything: it must still hold exactly what this decision wrote
  const reads = [], conflicts = [];
  for (const c of changed) {
    const r = await read(container, c.path);
    const cur = r.value;
    let ok = false;
    if (ledger.decision === "assign" && c.type === "class") {
      const history = cur && Array.isArray(cur.ownerHistory) ? cur.ownerHistory : [];
      ok = Boolean(cur) && cur.ownerId === ledger.to && history.length > 0 && history[history.length - 1].migrationId === migrationId;
    } else if (ledger.decision === "assign" && c.type === "student") {
      ok = Boolean(cur) && cur.ownerId === ledger.to && cur.legacyOwnershipMigrationId === migrationId && String(cur.classId || "") === ledger.classId;
    } else if (ledger.decision === "archive") {
      ok = Boolean(cur) && normalizeClassStatus(cur) === "archived" && String(cur.archivedAt || "") === String(ledger.archivedAt || "") && !hasOwner(cur);
    }
    if (!ok) conflicts.push(c.type === "student" ? { type: "student", userId: c.userId } : { type: "class" });
    reads.push({ c, cur, etag: r.etag });
  }
  if (conflicts.length) throw new LegacyRefusal(409, "UNDO_CONFLICT", "تغيّر الصف أو بعض طلابه منذ القرار، فلا يمكن التراجع عنه تلقائيًا.", { conflicts });

  // 2. WRITE the previous values, each conditional on the ETag just checked (a change in between → stop: the ledger stays applied)
  if (ledger.decision === "assign") {
    const order = [...reads.filter(x => x.c.type === "student"), ...reads.filter(x => x.c.type === "class")];   // the class last
    for (const { c, cur, etag } of order) {
      const next = { ...cur, updatedAt: at };
      delete next.ownerId;
      if (c.type === "student") { delete next.legacyOwnershipMigrationId; next.profileRevision = Number(cur.profileRevision || 0) + 1; }
      else next.ownerHistory = [...cur.ownerHistory, { from: ledger.to, to: null, at, by: actor, reason: note, migrationId, undo: true }];
      try { await upload(container, c.path, next, etag); }
      catch (e) {
        if (storage.isConcurrencyConflict(e)) throw new LegacyRefusal(409, "UNDO_CONFLICT", "تغيّر الصف أو بعض طلابه أثناء التراجع. أعد المحاولة.", { conflicts: [{ type: c.type, ...(c.userId ? { userId: c.userId } : {}) }] });
        throw e;
      }
    }
  } else if (ledger.decision === "archive") {
    const r = await deps.unarchiveClass(ledger.classId);
    if (!r || r.status >= 300) throw new LegacyRefusal(503, "UNDO_FAILED", "تعذرت إعادة الصف إلى النشاط.");
  }
  const done = await mut(container, ledgerName(migrationId), cur => ({ ...cur, status: "undone", undoneAt: at, undoneBy: actor, undoReason: note }));
  return { ledger: done };
}

/** The ledgers of this kind, newest first. */
async function ledgerList(container, deps = {}) {
  const ls = deps.listJson || loadDocs;
  return (await ls(container, LEDGER_PREFIX)).filter(l => l && l.kind === KIND).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

module.exports = { inventory, plan, apply, undo, ledgerList, LegacyRefusal, DECISIONS, LEDGER_PREFIX, KIND, MIN_REASON, MAX_REASON, migrationIdFor };
