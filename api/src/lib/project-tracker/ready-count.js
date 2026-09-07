// Pure helper: counts ready_for_review stages across a class's progress docs, applying the SAME
// exactness rules as the ready-for-review report so the sidebar badge and the report always agree:
//   * only progress of a current class MEMBER (isMemberFn(studentId) — non-archived student of the class)
//   * only stages that still exist in the class snapshot AND are active (activeStageIds)
// A stage of an archived student, an inactive stage, or a stageId no longer in the snapshot is ignored.
function countReadyStages(progressDocs, activeStageIds, isMemberFn) {
  const set = activeStageIds instanceof Set ? activeStageIds : new Set(activeStageIds || []);
  let n = 0;
  for (const doc of (Array.isArray(progressDocs) ? progressDocs : [])) {
    if (!doc) continue;
    if (!isMemberFn(String(doc.studentId))) continue;
    const stages = doc.stages || {};
    for (const stageId of Object.keys(stages)) {
      if (stages[stageId] && stages[stageId].status === "ready_for_review" && set.has(stageId)) n += 1;
    }
  }
  return n;
}

module.exports = { countReadyStages };
