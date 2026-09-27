// Phase 9D — Project Evaluation Drill-In: the transient navigation target App publishes when a teacher clicks a
// student row of the Today Hub's «تقييم المشاريع» card. App stays the ONE navigation authority (teacherView /
// projectCode); this object only tells the mounted ProjectTracker which class and student to open once the
// project's class list has been loaded and validated. `seq` makes every request observable, so the same row twice
// (or student A → student B inside the same project) is never a no-op. Nothing is persisted; no router is added.
export type ProjectDrillTarget = { projectCode: string; classId: string; studentId: string; seq: number };
/** What a Today Hub row hands to App (the three identifiers; App adds the sequence). */
export type ProjectStudentRef = { projectCode: string; classId: string; studentId: string };
