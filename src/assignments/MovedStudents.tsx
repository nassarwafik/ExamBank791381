import type { MovedStudentResult } from "./types";

/**
 * Tadris+ P5-B3b (owner decision §19.21, D16) — under the gradebook: the students the owner MOVED to another teacher keep their
 * result in this assignment as an archive, «منقول», read-only (no action: they are no longer in this class). Outside the class
 * statistics. Nothing about their new class is shown.
 *
 * Tadris+ P11-A — the same archive for a student who was REMOVED from this class as a shared class (`leftClass`: the account stayed
 * with its first teacher): «غادر الصف» instead of «منقول».
 */
export default function MovedStudents({ rows, fmt }: { rows: MovedStudentResult[]; fmt: (iso: string) => string }) {
  if (!rows.length) return null;
  return (
    <section className="eb-gradebook-moved" aria-labelledby="gb-moved-title">
      <h4 id="gb-moved-title">{rows.every(r => r.leftClass) ? "طلاب غادروا هذا الصف" : rows.some(r => r.leftClass) ? "طلاب منقولون أو غادروا هذا الصف" : "طلاب منقولون إلى معلم آخر"} <small>(أرشيف للقراءة فقط)</small></h4>
      <ul>
        {rows.map(r => (
          <li key={r.studentId}>
            <bdi>{r.studentName}</bdi> <span className="eb-gradebook-moved-badge">{r.leftClass ? "غادر الصف" : "منقول"}</span>
            {r.latestResult ? <> · {r.latestResult.score}/{r.latestResult.totalMarks} ({r.latestResult.percentage}%){r.gradingStatus === "pendingReview" ? " · بانتظار التصحيح" : ""}</> : " · لم يسلّم"}
            {r.movedAt ? <> · {r.leftClass ? "غادر في" : "نُقل في"} {fmt(r.movedAt)}</> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
