const crypto = require("crypto");
const storage = require("./platform-storage");
const model = require("./exam-governance-model");

// Phase 14B Part I — the Governance Review Inbox index.
//
//   exam-governance-inbox/<actorKey>/<stage>-<examId>-<cycleId>.json
//
// A task POINTER is lightweight routing / display data (exam id, cycle, revision id + number, title, author, stamps) — never
// an exam body, never workflow authority. The manifest stays the authority: a reader validates EVERY pointer against the
// authoritative manifest (`isTaskLive`) and only then returns it as a live task; a stale pointer (its cycle moved on, its
// manifest is missing / corrupt, it names another actor) is never returned and is removed best-effort.
//
// Consistency contract with the authority (exam-governance.js):
//   • a transition that OPENS a task writes the next-task pointer BEFORE the manifest CAS; if that write fails the
//     transition does not commit; if the CAS loses, the uncommitted pointer is deleted best-effort — and even when that
//     cleanup fails (crash, outage) the reader filters it because the manifest never confirms it;
//   • a transition that CLOSES a task removes its pointer AFTER the committed CAS, best-effort — the reader filters it
//     meanwhile and cleans it on the next validated read.
// The actor key is a stable hash of the authenticated actor id (path safety / privacy): the raw id is never a path segment.
const INBOX_PREFIX = "exam-governance-inbox/";
const TASK_STAGES = Object.freeze(["review", "approve", "publish"]);
const MAX_SCAN = 200, DEFAULT_PAGE = 20, MAX_PAGE = 50;

function actorKey(actorId) { return crypto.createHash("sha256").update("governance-inbox:" + String(actorId || "")).digest("hex").slice(0, 32); }
function actorPrefix(actorId) { return INBOX_PREFIX + actorKey(actorId) + "/"; }
function assertStage(stage) { if (!TASK_STAGES.includes(stage)) throw new Error("Unknown inbox stage."); return stage; }
function assertSafe(value, what) { if (!model.isSafeId(value)) throw new Error("Unsafe " + what + " for an inbox pointer path."); return value; }
function taskName(actorId, stage, examId, cycleId) { return actorPrefix(actorId) + assertStage(stage) + "-" + assertSafe(examId, "examId") + "-" + assertSafe(cycleId, "cycleId") + ".json"; }

function buildTaskPointer({ actorId, stage, examId, cycleId, revisionId, revisionNumber, title, authorId, submittedAt, createdAt }) {
  return {
    schemaVersion: 1, actorId: String(actorId), stage: assertStage(stage), examId: assertSafe(examId, "examId"), cycleId: assertSafe(cycleId, "cycleId"),
    revisionId: String(revisionId), revisionNumber: Number.isInteger(revisionNumber) ? revisionNumber : null,
    title: String(title || "").slice(0, 200), authorId: String(authorId || ""), submittedAt: String(submittedAt || ""), createdAt: String(createdAt || "")
  };
}
/** Create-only: returns true when THIS call created the pointer, false when an equivalent pointer (same actor / stage / exam /
 *  cycle — e.g. left by a crashed earlier attempt, or written by a concurrent attempt on the same state) already exists. A
 *  caller undoes ONLY a pointer it created, so a losing concurrent mutation can never delete the winner's live task. */
async function writeTaskPointer(container, pointer) {
  try { await storage.uploadJsonConditional(container, taskName(pointer.actorId, pointer.stage, pointer.examId, pointer.cycleId), pointer, null); return true; }
  catch (e) { if (storage.isConcurrencyConflict(e)) return false; throw e; }
}
/** Best-effort removal (returns false instead of throwing): the reader filters whatever survives. */
async function removeTaskPointer(container, pointer) {
  try { await storage.deleteBlob(container, taskName(pointer.actorId, pointer.stage, pointer.examId, pointer.cycleId)); return true; } catch { return false; }
}

// The ONE liveness rule (pure): stage × lifecycle × reviewStatus × assigned actor × cycle × revision must all match the
// authoritative manifest, and the pointer must belong to the actor asking.
function isTaskLive(pointer, manifest, actorId) {
  if (!pointer || !manifest || typeof manifest !== "object") return false;
  const w = manifest.reviewWorkflow;
  if (!w || typeof w !== "object") return false;
  if (pointer.actorId !== actorId || pointer.cycleId !== w.cycleId || pointer.revisionId !== w.revisionId) return false;
  switch (pointer.stage) {
    case "review": return manifest.lifecycleState === "in-review" && w.reviewStatus === "pending" && w.reviewerId === actorId;
    case "approve": return manifest.lifecycleState === "in-review" && w.reviewStatus === "completed" && w.approverId === actorId;
    case "publish": return manifest.lifecycleState === "approved" && w.reviewStatus === "completed" && w.publisherId === actorId;
    default: return false;
  }
}
function clampLimit(limit) { const n = Number(limit); return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PAGE, Math.floor(n)) : DEFAULT_PAGE; }

/** My live tasks (validated against the manifests), newest first, bounded page. `stage` = one stage or "all". Never loads a
 *  revision body: pointers + manifests only. `counts` covers every live task of the actor regardless of the stage filter. */
async function listActorTasks(container, actorId, { stage = "all", cursor, limit } = {}, deps = {}) {
  const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
  const listNames = deps.listBlobNames || storage.listBlobNames;
  const wanted = stage === "all" || stage === undefined || stage === null || stage === "" ? null : assertStage(stage);
  const names = (await listNames(container, actorPrefix(actorId))).slice(0, MAX_SCAN);
  const pointers = [];
  for (const name of names) { const p = await dl(container, name); if (p && typeof p === "object") pointers.push({ name, pointer: p }); }
  const manifests = new Map();
  const manifestOf = async examId => {
    if (!model.isSafeExamId(examId)) return null;
    if (!manifests.has(examId)) {
      let m = null;
      try { const raw = await dl(container, model.manifestName(examId)); m = raw && model.validateManifest(raw).length === 0 ? raw : null; } catch { m = null; }
      manifests.set(examId, m);
    }
    return manifests.get(examId);
  };
  const live = [], counts = { review: 0, approve: 0, publish: 0 };
  for (const { pointer } of pointers) {
    const m = await manifestOf(pointer.examId);
    if (!isTaskLive(pointer, m, actorId)) { await removeTaskPointer(container, pointer); continue; }
    counts[pointer.stage] += 1;
    if (wanted && pointer.stage !== wanted) continue;
    live.push({
      examId: pointer.examId, cycleId: pointer.cycleId, revisionId: pointer.revisionId, revisionNumber: pointer.revisionNumber, stage: pointer.stage,
      title: pointer.title, authorId: pointer.authorId, submittedAt: pointer.submittedAt, createdAt: pointer.createdAt,
      lifecycleState: m.lifecycleState, stateVersion: m.stateVersion, reviewStatus: m.reviewWorkflow.reviewStatus,
      ...(m.reviewWorkflow.reviewedAt ? { reviewedAt: m.reviewWorkflow.reviewedAt } : {}), ...(m.reviewWorkflow.approvedAt ? { approvedAt: m.reviewWorkflow.approvedAt } : {})
    });
  }
  live.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.examId < b.examId ? 1 : -1));
  const size = clampLimit(limit);
  const start = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
  const items = live.slice(start, start + size);
  return { items, nextCursor: start + size < live.length ? start + size : null, counts };
}

module.exports = { INBOX_PREFIX, TASK_STAGES, actorKey, taskName, buildTaskPointer, writeTaskPointer, removeTaskPointer, isTaskLive, listActorTasks };
