import { Fragment, useRef } from "react";
import Dialog from "../ui/Dialog";
import StatusBadge from "../ui/StatusBadge";
import VisuallyHidden from "../ui/VisuallyHidden";
import { IconKey, IconCopy, IconMedal, IconEye, IconPlus, IconEdit } from "../icons";
import { MEDAL_COLORS, MEDAL_LABELS, medalTier } from "../medals";
import { resolveGradingStatus } from "../gradingStatus";
import { stageVisual } from "../studentStageVisuals";
import type { ProfileSection, StudentProfile, SubmittedAssignment } from "./types";

/** Concise Strength / recognition line-up (server values only; nothing recomputed). Absent on older payloads. */
function StrengthSummary({ profile }: { profile: StudentProfile }) {
  const s = profile.strength, r = profile.recognition;
  if (!s && !r) return null;
  // The SERVER's stage (1..25) — the same authority as the student's portal; an older payload without a stage shows
  // the points only (never a client-side stage).
  const stage = s && Number.isInteger(s.stageNumber) && (s.stageNumber as number) >= 1 ? stageVisual(s.stageNumber as number) : null;
  return (
    <div className="eb-profile-strength" aria-label="القوة والتقدير">
      {s && (
        <p className="eb-profile-strength-rank">
          {stage ? <><img src={stage.image} alt="" aria-hidden="true" width={32} height={32} loading="lazy" decoding="async" /><strong>{stage.title}</strong><span className="eb-muted">المرحلة {stage.stageNumber} من {s.stageCount ?? 25}</span></> : null}
          <span className="eb-muted">نقاط القوة: <strong dir="ltr">{s.stagePoints !== undefined && s.stageMaxPoints !== undefined ? s.stagePoints + " / " + s.stageMaxPoints : s.totalPoints}</strong></span>
          {s.rawTotalPoints !== undefined && s.stageMaxPoints !== undefined && s.rawTotalPoints > s.stageMaxPoints && <span className="eb-muted">الإجمالي الفعلي: <strong dir="ltr">{s.rawTotalPoints}</strong></span>}
        </p>
      )}
      {r && (
        <p className="eb-profile-recognition">
          <span>الميداليات: <strong>{r.medals.total}</strong></span>
          <span>التفاعلات المستلمة: <strong>{r.reactionsReceived.total}</strong></span>
          <span>الإنجازات: <strong>{r.achievements.total}</strong></span>
        </p>
      )}
      {profile.projectSummaries && profile.projectSummaries.length > 0 && (
        <p className="eb-profile-projects">
          {profile.projectSummaries.map(p => <span key={p.projectCode}>{p.title}: <strong dir="ltr">{p.overallProgress}%</strong>{p.complete ? " · مكتمل" : ""}</span>)}
        </p>
      )}
    </div>
  );
}

function medalItemsFor(assignments: StudentProfile["assignments"]) {
  return assignments
    .filter(a => a.latestPercentage !== null)
    .map(a => ({ assignmentId: a.assignmentId, title: a.title, submittedAt: a.submittedAt, tier: medalTier(a.latestPercentage as number) }))
    .filter((item): item is { assignmentId: string; title: string; submittedAt: string; tier: "gold" | "silver" | "bronze" } => item.tier !== null);
}

export type StudentDialogProps = {
  profile: StudentProfile;
  section: ProfileSection;
  onClose: () => void;
  busy: boolean;
  suspended: boolean;
  passwordReveal: { password: string; secondsLeft: number } | null;
  onResetPassword: () => void;
  onCopyPassword: (password: string) => void;
  onReview: (item: SubmittedAssignment) => void;
  onAllowRetry: (item: SubmittedAssignment) => void;
  deadlineFor: string | null;
  deadlineValue: string;
  onDeadlineValue: (value: string) => void;
  onOpenDeadline: (item: SubmittedAssignment) => void;
  onCloseDeadline: () => void;
  onSaveDeadline: (item: SubmittedAssignment) => void;
  onClearDeadline: (item: SubmittedAssignment) => void;
  fmtDate: (value: string) => string;
};

/**
 * StudentDialog — ONE dialog for the student profile. Two entry points share the same
 * `GET /api/students?profileUserId=` payload: "التفاصيل" opens on the summary, "الوظائف" opens the same
 * dialog with focus on the assignments/history section. No tabs: plain sections plus a small in-dialog
 * section navigator.
 */
export default function StudentDialog(p: StudentDialogProps) {
  const historyRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const { profile } = p;
  const medals = medalItemsFor(profile.assignments);
  const jump = (id: string) => () => { const el = document.getElementById(id); if (el) { if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" }); (el as HTMLElement).focus(); } };
  return (
    <Dialog open title={profile.student.displayName} onClose={p.onClose} size="lg" suspended={p.suspended} initialFocusRef={p.section === "history" ? historyRef : summaryRef} className="eb-student-dialog">
      <p className="eb-dialog-lead">{profile.classroom?.name || "—"} · <span dir="ltr">{profile.student.identityNumber}</span> · <StatusBadge tone={profile.student.archived ? "neutral" : profile.student.active ? "success" : "warn"}>{profile.student.archived ? "مؤرشف" : profile.student.active ? "فعّال" : "معطّل"}</StatusBadge></p>
      <nav className="eb-dialog-nav" aria-label="أقسام ملف الطالب">
        <button type="button" onClick={jump("eb-student-summary")}>ملخص</button>
        <button type="button" onClick={jump("eb-student-info")}>بيانات الطالب</button>
        <button type="button" onClick={jump("eb-student-medals")}>الميداليات</button>
        <button type="button" onClick={jump("eb-student-history")}>الواجبات وسجل الوظائف</button>
      </nav>

      <section className="eb-dialog-section" aria-labelledby="eb-student-summary">
        <h3 id="eb-student-summary" ref={summaryRef} tabIndex={-1}>ملخص</h3>
        <div className="student-profile-stats eb-profile-stats">
          <article><strong>{profile.stats.assigned}</strong><span>واجبات</span></article>
          <article><strong>{profile.stats.completed}</strong><span>مكتملة</span></article>
          <article><strong>{profile.stats.pending}</strong><span>لم تُحل</span></article>
          <article><strong>{profile.stats.average === null ? "—" : profile.stats.average + "%"}</strong><span>المعدل</span></article>
        </div>
        <StrengthSummary profile={profile} />
      </section>

      <section className="eb-dialog-section" aria-labelledby="eb-student-info">
        <h3 id="eb-student-info" tabIndex={-1}>بيانات الطالب</h3>
        <dl className="eb-dl">
          <div><dt>رقم الهوية / الدخول</dt><dd dir="ltr">{profile.student.identityNumber || profile.student.code || "—"}</dd></div>
          <div><dt>الصف</dt><dd>{profile.classroom?.name || "—"}</dd></div>
          <div><dt>آخر دخول</dt><dd>{profile.stats.lastLoginAt ? p.fmtDate(profile.stats.lastLoginAt) : "لم يسجل الدخول بعد"}</dd></div>
          <div><dt>إنشاء الحساب</dt><dd>{p.fmtDate(profile.student.createdAt)}</dd></div>
        </dl>
        <div className="eb-inline-actions">
          <button type="button" className="eb-button is-small" onClick={p.onResetPassword} disabled={p.busy}><IconKey size={14} />كلمة مرور جديدة</button>
        </div>
        {p.passwordReveal && (
          <div className="credential-box eb-credential-box" role="status">
            <div className="credential-values"><div><span>كلمة المرور الجديدة</span><strong dir="ltr">{p.passwordReveal.password}</strong></div></div>
            <div className="eb-inline-actions"><button type="button" className="eb-button is-small" onClick={() => p.onCopyPassword(p.passwordReveal?.password || "")}><IconCopy size={14} />نسخ</button></div>
            <p className="eb-muted"><VisuallyHidden>ستختفي كلمة المرور تلقائيًا بعد عشر ثوانٍ. انسخها الآن.</VisuallyHidden><span aria-hidden="true">ستختفي كلمة المرور بعد {p.passwordReveal.secondsLeft} ثوانٍ</span></p>
          </div>
        )}
      </section>

      <section className="eb-dialog-section" aria-labelledby="eb-student-medals">
        <h3 id="eb-student-medals" tabIndex={-1}>الميداليات والإنجازات</h3>
        {medals.length
          ? <div className="medal-badge-grid">{medals.map(item => <div key={item.assignmentId} className="medal-badge"><IconMedal size={22} style={{ color: MEDAL_COLORS[item.tier] }} /><div><strong>ميدالية {MEDAL_LABELS[item.tier]}</strong><span>{item.title}</span>{item.submittedAt && <small>{p.fmtDate(item.submittedAt)}</small>}</div></div>)}</div>
          : <p className="medal-badge-empty">لم يحصل الطالب على ميداليات بعد.</p>}
      </section>

      <section className="eb-dialog-section" aria-labelledby="eb-student-history">
        <h3 id="eb-student-history" ref={historyRef} tabIndex={-1}>الواجبات وسجل الوظائف</h3>
        <h4 className="eb-subheading">واجبات الصف الحالي</h4>
        <div className="students-table-wrap"><table className="students-table">
          <thead><tr><th scope="col">الواجب</th><th scope="col">الحالة</th><th scope="col">المحاولات</th><th scope="col">العلامة</th><th scope="col">النسبة</th><th scope="col">آخر تسليم</th></tr></thead>
          <tbody>{profile.assignments.map(a => <tr key={a.assignmentId}>
            <td>{a.title}</td><td>{a.latestScore === null ? "لم يُحل" : resolveGradingStatus(a) === "final" ? "مصحح" : "بانتظار المراجعة"}</td><td>{a.attemptsUsed}</td>
            <td>{a.latestScore === null ? "—" : a.latestScore + "/" + a.totalMarks}</td><td>{a.latestPercentage === null ? "—" : a.latestPercentage + "%"}</td><td>{a.submittedAt ? p.fmtDate(a.submittedAt) : "—"}</td>
          </tr>)}{!profile.assignments.length && <tr><td colSpan={6}>لا توجد واجبات لهذا الصف.</td></tr>}</tbody>
        </table></div>
        <h4 className="eb-subheading">سجل الوظائف المسلّمة</h4>
        <div className="students-table-wrap"><table className="students-table">
          <thead><tr><th scope="col">اسم الوظيفة</th><th scope="col">تاريخ آخر تسليم</th><th scope="col">العلامة</th><th scope="col">عدد المحاولات</th><th scope="col">الحالة</th><th scope="col">إجراءات</th></tr></thead>
          <tbody>{profile.submittedAssignments.map(item => <Fragment key={item.assignmentId}>
            <tr>
              <td>{item.title || "—"}</td>
              <td>{item.submittedAt ? p.fmtDate(item.submittedAt) : "—"}</td>
              <td>{item.score + "/" + item.totalMarks + " - " + item.percentage + "%"}</td>
              <td>{item.attemptsUsed > 1 ? "المحاولات: " + item.attemptsUsed : item.attemptsUsed}</td>
              <td>{resolveGradingStatus(item) === "final" ? "تم التسليم" : "بانتظار المراجعة"}</td>
              <td><div className="eb-inline-actions">
                <button type="button" className="eb-button is-small" onClick={() => p.onReview(item)}><IconEye size={14} />فحص الوظيفة</button>
                {item.isCurrentClassAssignment ? <>
                  <button type="button" className="eb-button is-small" onClick={() => p.onAllowRetry(item)} disabled={p.busy}><IconPlus size={14} />محاولة إضافية</button>
                  <button type="button" className="eb-button is-small" aria-expanded={p.deadlineFor === item.assignmentId} onClick={() => p.deadlineFor === item.assignmentId ? p.onCloseDeadline() : p.onOpenDeadline(item)} disabled={p.busy}><IconEdit size={14} />تمديد الموعد</button>
                </> : <small className="result-code">سجل سابق</small>}
              </div></td>
            </tr>
            {p.deadlineFor === item.assignmentId && <tr className="deadline-edit-row"><td colSpan={6}><div className="deadline-edit-inline">
              <span>الموعد الأصلي: {p.fmtDate(item.dueAt)}</span>
              {item.dueAtOverride && <span>التمديد الحالي: {p.fmtDate(item.dueAtOverride)}</span>}
              <label className="eb-field-inline">الموعد الجديد<input type="datetime-local" value={p.deadlineValue} onChange={e => p.onDeadlineValue(e.target.value)} /></label>
              <button type="button" className="eb-button is-small is-primary" onClick={() => p.onSaveDeadline(item)} disabled={p.busy || !p.deadlineValue}>حفظ التمديد</button>
              {item.dueAtOverride && <button type="button" className="eb-button is-small" onClick={() => p.onClearDeadline(item)} disabled={p.busy}>إلغاء التمديد</button>}
              <button type="button" className="eb-button is-small" onClick={p.onCloseDeadline}>إغلاق</button>
            </div></td></tr>}
          </Fragment>)}
          {!profile.submittedAssignments.length && <tr><td colSpan={6}>لا توجد وظائف مسلّمة.</td></tr>}</tbody>
        </table></div>
      </section>
    </Dialog>
  );
}
