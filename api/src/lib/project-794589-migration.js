// Pure, storage-free helpers for the version-aware migration of Project 794589 class snapshots from
// an older template to the current one. No I/O — the Azure function loads the snapshot + progress
// blobs and hands plain objects/arrays here so every rule is unit-testable.
//
// Safety contract (per the approved spec):
//   * A class with NO meaningful progress may be upgraded directly (its snapshot replaced).
//   * A class WITH meaningful progress is NEVER silently reset. If an explicit migration is run,
//     progress is carried over ONLY for stages whose (track + normalized title) matches EXACTLY and
//     UNIQUELY on both sides — never by stageId, because old B05 / P20 may mean something different
//     from the new B05 / P20. Ambiguous or unmatched stages are skipped, never guessed.

// Normalizes a stage title for safe comparison: Unicode NFKC, collapse internal whitespace, trim.
function normalizeTitle(title) {
  return String(title == null ? "" : title).normalize("NFKC").replace(/\s+/g, " ").trim();
}

// A single progress entry is "meaningful" if it carries a non-default status or a non-empty note.
function entryIsMeaningful(entry) {
  if (!entry) return false;
  if (entry.status && entry.status !== "not_started") return true;
  if (entry.note && String(entry.note).trim()) return true;
  return false;
}

// A progress document is meaningful if any entry is meaningful or it has any recorded history.
function progressDocIsMeaningful(doc) {
  if (!doc) return false;
  const stages = doc.stages || {};
  for (const key of Object.keys(stages)) {
    if (entryIsMeaningful(stages[key])) return true;
  }
  if (Array.isArray(doc.history) && doc.history.length > 0) return true;
  return false;
}

// True if any student in the class has meaningful progress.
function classHasMeaningfulProgress(progressDocs) {
  return (Array.isArray(progressDocs) ? progressDocs : []).some(progressDocIsMeaningful);
}

// Builds a safe old->new stageId mapping using (track + normalized title), requiring the key to be
// UNIQUE on both the old and new sides. Returns:
//   { map: { oldStageId: newStageId }, ambiguous: [oldStageId], oldOnly: [oldStageId], newOnly: [newStageId] }
function buildSafeStageMapping(oldStages, newStages) {
  const oldArr = Array.isArray(oldStages) ? oldStages : [];
  const newArr = Array.isArray(newStages) ? newStages : [];
  const keyOf = s => s.track + "\n" + normalizeTitle(s.title);

  const count = arr => {
    const m = new Map();
    for (const s of arr) { const k = keyOf(s); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  const oldCount = count(oldArr);
  const newCount = count(newArr);
  const newKeySet = new Set(newArr.map(keyOf));
  const uniqueNewByKey = new Map();
  for (const s of newArr) if (newCount.get(keyOf(s)) === 1) uniqueNewByKey.set(keyOf(s), s.stageId);

  const map = {};
  const ambiguous = [];
  const oldOnly = [];
  const usedNew = new Set();
  for (const s of oldArr) {
    const k = keyOf(s);
    if (oldCount.get(k) === 1 && uniqueNewByKey.has(k)) {
      const newId = uniqueNewByKey.get(k);
      map[s.stageId] = newId;
      usedNew.add(newId);
    } else if (newKeySet.has(k)) {
      ambiguous.push(s.stageId); // title exists in the new template but not confidently mappable
    } else {
      oldOnly.push(s.stageId);   // title has no counterpart in the new template
    }
  }
  const newOnly = newArr.filter(s => !usedNew.has(s.stageId)).map(s => s.stageId);
  return { map, ambiguous, oldOnly, newOnly };
}

// Dry-run analysis of what an explicit migration would do, without mutating anything.
// progressDocs: [{ studentId, stages, history }]
function analyzeMigration(oldStages, newStages, progressDocs) {
  const mapping = buildSafeStageMapping(oldStages, newStages);
  const perStudent = [];
  let migratedEntries = 0;
  let skippedEntries = 0;
  for (const doc of (Array.isArray(progressDocs) ? progressDocs : [])) {
    const stages = (doc && doc.stages) || {};
    let migrated = 0;
    let skipped = 0;
    for (const oldId of Object.keys(stages)) {
      if (!entryIsMeaningful(stages[oldId])) continue;
      if (mapping.map[oldId]) migrated += 1; else skipped += 1;
    }
    migratedEntries += migrated;
    skippedEntries += skipped;
    perStudent.push({ studentId: doc && doc.studentId, migrated, skipped });
  }
  return {
    exactMatches: Object.keys(mapping.map).length,
    ambiguous: mapping.ambiguous,
    oldOnly: mapping.oldOnly,
    newOnly: mapping.newOnly,
    migratedEntries,
    skippedEntries,
    perStudent,
    map: mapping.map
  };
}

// Produces a migrated copy of a single progress doc using a prebuilt safe map. Meaningful entries for
// mapped stages are carried over (status/note/timestamps kept); unmapped meaningful entries are
// dropped from the active stage set. History is preserved verbatim (never destroyed). Pure — returns
// a new object; the caller persists it.
function migrateProgressDoc(doc, map, now) {
  const src = (doc && doc.stages) || {};
  const nextStages = {};
  const skipped = [];
  for (const oldId of Object.keys(src)) {
    const entry = src[oldId];
    if (!entryIsMeaningful(entry)) continue;
    const newId = map[oldId];
    if (newId) nextStages[newId] = { ...entry };
    else skipped.push(oldId);
  }
  return {
    doc: {
      ...(doc || {}),
      stages: nextStages,
      history: Array.isArray(doc && doc.history) ? doc.history : [],
      migratedAt: now
    },
    skipped
  };
}

module.exports = {
  normalizeTitle,
  entryIsMeaningful,
  progressDocIsMeaningful,
  classHasMeaningfulProgress,
  buildSafeStageMapping,
  analyzeMigration,
  migrateProgressDoc
};
