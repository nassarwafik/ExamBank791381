import type { ReactNode } from "react";
import { IconLogout } from "../icons";
import "../ui/ui.css";
import "../shell.css";

// UX-2 — Student shell: the portal's existing top bar (brand + logout, same class hooks so platform.css keeps
// styling it) plus a small identity area (name · class) and the main content container. No navigation,
// no bottom bar, no content reordering here (UX-7 owns the task-first redesign).
type Props = { studentName: string; className?: string; onLogout: () => void; children: ReactNode };

export default function StudentShell({ studentName, className, onLogout, children }: Props) {
  return (
    <main className="student-portal eb-student-shell" dir="rtl">
      <header className="student-topbar">
        <div className="student-brand">
          <span className="student-logo" aria-hidden="true">EB</span>
          <div><h1>ExamBank 2.0</h1><p>بوابة الطالب للتدريب والواجبات</p></div>
        </div>
        {studentName && (
          <div className="eb-student-identity" aria-label="الطالب الحالي">
            <strong>{studentName}</strong>
            {className && <span>{className}</span>}
          </div>
        )}
        <button type="button" className="student-logout" onClick={onLogout}><IconLogout size={16} />تسجيل الخروج</button>
      </header>
      <section className="student-shell">{children}</section>
    </main>
  );
}
