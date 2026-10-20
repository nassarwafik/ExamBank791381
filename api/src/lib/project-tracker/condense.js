// Phase P7 — condensed stages. Pure, storage-free conversion of ONE class from its old stage set to the owner-approved
// condensed template (each new stage lists the old stages it merges in `mergedFrom`). The orchestration (lock, CAS,
// passes, audit) lives in service.condenseClass; every rule here is unit-testable.
//
// Owner decisions (P7):
//   • every class that started converts automatically; nothing is lost: the old entries are archived in the progress
//     document (`condensedFrom`) and the old stage keys are removed only after the class snapshot switched;
//   • a new stage weighs as much as the old stages it merges (Σ of their weights, 1 each by default), so a fully
//     approved group keeps exactly the project value it had;
//   • a new stage whose old stages are ALL approved is approved (score = the average, only when every one is scored);
//     a stage the student finished only in part goes to «بانتظار الاعتماد» with a note listing what was done, and the
//     teacher decides (never an automatic approval, never a silent loss); otherwise in progress or not started.
// The conversion is computed over the old stages ACTIVE in the class snapshot (the teacher's own settings); a new
// stage with no active old stage is inactive. Teacher-added stages (ids outside the old template) are carried as they
// are. Only the stage set changes: track weights, config, createdAt and every other snapshot key are kept.
const { normalizeScore } = require("./score");

const STATUS_LABEL = { approved: "معتمدة", ready_for_review: "جاهزة للفحص", in_progress: "قيد التنفيذ", not_started: "لم تبدأ" };
const NOTE_MAX = 1000;
const LOCK_MS = 120000;                                                         // a conversion lock older than this is stale

const statusOf = e => (e && STATUS_LABEL[e.status] ? e.status : "not_started");
const weightOf = s => { const w = Number(s && s.weight); return Number.isFinite(w) && w > 0 ? w : 1; };
const isSelf = e => !!e && e.status === "approved" && typeof e.selfReportedAt === "string" && e.selfReportedAt !== "";
const latest = (list, key) => list.filter(x => x && typeof x[key] === "string" && x[key]).sort((a, b) => String(a[key]).localeCompare(String(b[key]))).pop() || null;

/**
 * The class's conversion plan, or { skip } when the class cannot be converted safely (left exactly as it is).
 * @param {object[]} templateStages  the condensed template's stages (with `mergedFrom`)
 * @param {object[]} templateGroups  the condensed template's groups
 * @param {object}   snapshot        the class snapshot as stored (old stage set, the teacher's settings)
 */
function buildCondensePlan(templateStages, templateGroups, snapshot) {
  const oldStages = (snapshot && Array.isArray(snapshot.stages)) ? snapshot.stages.filter(s => s && s.stageId) : [];
  const oldById = new Map(oldStages.map(s => [s.stageId, s]));
  const merged = new Set();
  for (const t of templateStages) for (const id of (t.mergedFrom || [])) merged.add(id);
  const newIds = new Set(templateStages.map(t => t.stageId));
  const newGroupIds = new Set(templateGroups.map(g => g.groupId));
  // Teacher-added stages (not part of the old template) are carried unchanged.
  const custom = oldStages.filter(s => !merged.has(s.stageId));
  const clash = custom.find(s => newIds.has(s.stageId));
  if (clash) return { skip: "stage-id-collision:" + clash.stageId };
  const groups = templateGroups.map(g => ({ ...g }));
  const firstGroupOf = track => groups.filter(g => g.track === track).sort((a, b) => a.order - b.order)[0];
  const oldGroups = new Map(((snapshot && snapshot.groups) || []).filter(g => g && g.groupId).map(g => [g.groupId, g]));
  const carried = [];
  for (const s of custom) {
    const g = oldGroups.get(s.groupId);
    // A teacher's own group travels with its stages; a stage in an old template group joins its track's first group.
    if (g && !merged.has(s.stageId) && isCustomGroup(g, oldStages, merged)) {
      if (newGroupIds.has(g.groupId)) return { skip: "group-id-collision:" + g.groupId };
      if (!groups.some(x => x.groupId === g.groupId)) groups.push({ ...g, order: 1000 + (Number(g.order) || 0) });
      carried.push({ ...s });
    } else {
      const target = firstGroupOf(s.track);
      if (!target) return { skip: "no-group-for-track:" + s.track };
      carried.push({ ...s, groupId: target.groupId });
    }
  }
  const stages = [];
  const map = {};
  for (const t of templateStages) {
    const olds = (t.mergedFrom || []).map(id => oldById.get(id)).filter(Boolean);
    const active = olds.filter(s => s.active === true);
    map[t.stageId] = active.map(s => s.stageId);
    const { mergedFrom, ...rest } = t;                                          // eslint-disable-line no-unused-vars
    stages.push({
      ...rest,
      mergedFrom: [...(t.mergedFrom || [])],
      active: active.length > 0,
      required: active.length ? active.some(s => s.required !== false) : t.required !== false,
      weight: active.length ? active.reduce((sum, s) => sum + weightOf(s), 0) : weightOf(t)
    });
  }
  const oldTitles = {};
  for (const s of oldStages) oldTitles[s.stageId] = s.title || s.stageId;
  return { stages: [...stages, ...carried], groups, map, mergedIds: [...merged].filter(id => oldById.has(id)), oldTitles };
}
function isCustomGroup(group, oldStages, merged) {
  // A group is the teacher's own when none of the old template's (merged) stages ever belonged to it.
  return !oldStages.some(s => s.groupId === group.groupId && merged.has(s.stageId));
}

/** The new stage's progress entry from the old entries of its ACTIVE old stages (null = nothing to record). */
function condenseEntry(oldIds, entries, titles) {
  const list = oldIds.map(id => ({ id, e: entries[id] || null }));
  const touched = list.filter(({ e }) => e && (statusOf(e) !== "not_started" || (typeof e.note === "string" && e.note.trim()) || normalizeScore(e.score) !== null));
  if (!list.length || !touched.length) return null;
  const statuses = list.map(({ e }) => statusOf(e));
  const allApproved = statuses.every(s => s === "approved");
  const anyApproved = statuses.includes("approved");
  const anyStarted = statuses.some(s => s !== "not_started");
  const allReady = statuses.every(s => s === "approved" || s === "ready_for_review");
  const status = allApproved ? "approved" : (anyApproved || allReady) ? "ready_for_review" : anyStarted ? "in_progress" : "not_started";
  const scores = list.map(({ e }) => normalizeScore(e && e.score));
  const allScored = scores.every(s => s !== null);
  const entry = { status };
  if (allScored) entry.score = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  const ups = list.map(({ e }) => e).filter(Boolean);
  const lastUpdate = latest(ups, "updatedAt");
  if (lastUpdate) entry.updatedAt = lastUpdate.updatedAt;
  if (status === "approved") {
    const last = latest(ups, "approvedAt");
    entry.approvedAt = last ? last.approvedAt : (entry.updatedAt || "");
    entry.approvedBy = last ? String(last.approvedBy || "") : "";
    const selfs = ups.filter(isSelf);
    if (selfs.length) {
      // Some of the work is still the student's own unconfirmed mark: the merged stage waits for the teacher too. An undo
      // returns it to «بانتظار الاعتماد» when part of it was teacher-approved, else to not started.
      const s = latest(selfs, "selfReportedAt");
      entry.approvedAt = s.selfReportedAt;
      entry.approvedBy = String(s.selfReportedBy || s.approvedBy || "");
      entry.selfReportedAt = s.selfReportedAt;
      entry.selfReportedBy = String(s.selfReportedBy || "");
      entry.selfReportedFrom = selfs.length < ups.length ? "ready_for_review" : "not_started";
    }
  }
  // A note only when the merge needs explaining (partial work, partial scores) or the teacher had written notes.
  const notes = list.filter(({ e }) => e && typeof e.note === "string" && e.note.trim());
  const explain = status !== "approved" || !allScored;
  if (explain || notes.length) {
    const parts = [];
    if (explain) {
      // What was done (status and score of every touched old stage), then one line naming the stages not started.
      const done = list.filter(({ e }) => touched.some(t => t.e === e));
      const rest = list.filter(({ e }) => !touched.some(t => t.e === e)).map(({ id }) => id);
      parts.push("تحويل المراحل المختصرة — " + done.map(({ id, e }) => id + " " + (titles[id] || "") + ": " + (isSelf(e) ? "حدّدها الطالب" : STATUS_LABEL[statusOf(e)]) + (normalizeScore(e && e.score) !== null ? " (" + normalizeScore(e.score) + ")" : "")).join(" · ") + (rest.length ? " · لم تبدأ: " + rest.join("، ") : ""));
    }
    for (const { id, e } of notes) parts.push(id + ": " + e.note.trim());
    let note = parts.join("\n");
    if (note.length > NOTE_MAX) note = note.slice(0, NOTE_MAX - 1) + "…";
    entry.note = note;
  }
  return entry;
}

/**
 * Pass 1 — converts ONE progress document (idempotent): the new entries are added next to the old ones (old keys are kept
 * until the snapshot switched, so a reader of the old snapshot still sees them) and the old entries are archived. A new
 * key that already exists is never overwritten (a write made under the new snapshot wins). Returns the same object when
 * the document is already converted.
 */
function condenseProgressDoc(doc, plan, toVersion, fromVersion, now) {
  if (!doc || typeof doc !== "object") return doc;
  if (Number(doc.stageTemplateVersion) >= toVersion) return doc;
  const stages = { ...(doc.stages || {}) };
  const archived = {};
  for (const id of plan.mergedIds) if (stages[id]) archived[id] = stages[id];
  for (const [newId, oldIds] of Object.entries(plan.map)) {
    if (stages[newId]) continue;
    const entry = condenseEntry(oldIds, stages, plan.oldTitles);
    if (entry) stages[newId] = entry;
  }
  return { ...doc, stages, stageTemplateVersion: toVersion, condensedFrom: { templateVersion: fromVersion, at: now, stages: archived } };
}

/** Pass 3 — after the snapshot switched: the old keys leave `stages` (they stay archived in `condensedFrom`). */
function dropCondensedKeys(doc, plan, toVersion) {
  if (!doc || Number(doc.stageTemplateVersion) !== toVersion) return doc;
  const stages = { ...(doc.stages || {}) };
  let changed = false;
  for (const id of plan.mergedIds) if (id in stages) { delete stages[id]; changed = true; }
  return changed ? { ...doc, stages } : doc;
}

/**
 * Phase P7b — owner decision for 794589 classes still on template v1 WITH progress: they restart from zero on the
 * condensed set. The document keeps its identity (student, class, startedAt).
 * Phase P7c — owner decision: the old work is DELETED, not archived (no `resetFrom`). Idempotent: a document already on
 * `toVersion` only loses an archive an earlier reset left (deleteResetArchive).
 */
function resetProgressDoc(doc, toVersion, fromVersion, now) {
  if (!doc || typeof doc !== "object") return doc;
  if (Number(doc.stageTemplateVersion) >= toVersion) return deleteResetArchive(doc);
  const { resetFrom, ...rest } = doc;                                            // eslint-disable-line no-unused-vars
  return { ...rest, stages: {}, history: [], updatedAt: now, stageTemplateVersion: toVersion };
}

/** Phase P7c — the document without the `resetFrom` archive of an earlier P7b reset (the same document when it has none). */
function deleteResetArchive(doc) {
  if (!doc || typeof doc !== "object" || !("resetFrom" in doc)) return doc;
  const { resetFrom, ...rest } = doc;                                            // eslint-disable-line no-unused-vars
  return rest;
}

/** The converted class snapshot: only the stage set and its version change. */
function condensedSnapshot(existing, plan, toVersion, now) {
  const { conversion, ...rest } = existing;                                     // eslint-disable-line no-unused-vars
  return { ...rest, templateVersion: toVersion, groups: plan.groups, stages: plan.stages, updatedAt: now, condensedAt: now, condensedFromVersion: Number(existing.templateVersion || 1) };
}

const lockIsFresh = (snapshot, nowMs) => !!(snapshot && snapshot.conversion && Number.isFinite(Date.parse(snapshot.conversion.startedAt)) && nowMs - Date.parse(snapshot.conversion.startedAt) < LOCK_MS);

module.exports = { buildCondensePlan, condenseEntry, condenseProgressDoc, dropCondensedKeys, resetProgressDoc, deleteResetArchive, condensedSnapshot, lockIsFresh, LOCK_MS };
