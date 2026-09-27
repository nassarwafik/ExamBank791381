// Phase 9D — Project Evaluation Drill-In: the transient navigation target App publishes when a teacher clicks a
// student row of the Today Hub's «تقييم المشاريع» card. App stays the ONE navigation authority (teacherView /
// projectCode); this object only tells the mounted ProjectTracker which class and student to open once the
// project's class list has been loaded and validated. `seq` makes every request observable, so the same row twice
// (or student A → student B inside the same project) is never a no-op. Nothing is persisted; no router is added.
export type ProjectDrillTarget = { projectCode: string; classId: string; studentId: string; seq: number };
/** What a Today Hub row hands to App (the three identifiers; App adds the sequence). */
export type ProjectStudentRef = { projectCode: string; classId: string; studentId: string };

// Phase 9F — Project Evaluation Queue: the transient evaluation session App starts when a teacher clicks a row of the
// Today Hub's «تقييم المشاريع» card. The items ARE the server-ordered `projectEvaluation.attention` rows the hub held
// at that moment (never re-sorted on the client); `index` is the current item; `completed` holds the keys of items
// this session saw fully graded (server `evaluation.ungradedStages === 0`), so next/previous skip them. Nothing is
// persisted (no backend, no localStorage); ordinary navigation ends the session.
export type ProjectEvaluationQueueItem = { projectCode: string; classId: string; studentId: string; displayName: string };
export type ProjectEvaluationQueue = { id: number; items: ProjectEvaluationQueueItem[]; index: number; completed: string[] };
/** What the open profile sees of the session: its position, and the neighbours it may move to (null at the ends). */
export type ProjectEvaluationQueueView = { position: number; total: number; previous: ProjectEvaluationQueueItem | null; next: ProjectEvaluationQueueItem | null };
export const queueItemKey = (i: { projectCode: string; classId: string; studentId: string }) => i.projectCode + "|" + i.classId + "|" + i.studentId;
/** The nearest not-yet-completed item in `dir` (−1 previous, +1 next), or null at the end of the queue. Pure. */
export function queueNeighbour(queue: ProjectEvaluationQueue, dir: -1 | 1): { index: number; item: ProjectEvaluationQueueItem } | null {
  const done = new Set(queue.completed);
  for (let i = queue.index + dir; i >= 0 && i < queue.items.length; i += dir) {
    if (!done.has(queueItemKey(queue.items[i]))) return { index: i, item: queue.items[i] };
  }
  return null;
}
export function queueView(queue: ProjectEvaluationQueue | null): ProjectEvaluationQueueView | null {
  if (!queue || !queue.items.length) return null;
  return { position: queue.index + 1, total: queue.items.length, previous: queueNeighbour(queue, -1)?.item ?? null, next: queueNeighbour(queue, 1)?.item ?? null };
}
