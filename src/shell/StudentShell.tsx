import type { ReactNode } from "react";
import { IconLogout, IconMail, IconSparkles } from "../icons";
import "../ui/ui.css";
import "../shell.css";

// UX-2 — Student shell: the portal's existing top bar (brand + logout, same class hooks so platform.css keeps
// styling it) plus a small identity area (name · class) and the main content container. The top bar is the
// student's only chrome/nav surface, so the Educational Games entry lives here (when `onOpenGames` is given): it
// opens the dedicated Games destination — the games cards are NOT a permanent dashboard section. Phase 5C adds the
// «الرسائل» entry (when `onOpenMessages` is given) with the same dedicated-destination pattern.
type Props = { studentName: string; className?: string; onLogout: () => void; onOpenGames?: () => void; onOpenMessages?: () => void; children: ReactNode };

export default function StudentShell({ studentName, className, onLogout, onOpenGames, onOpenMessages, children }: Props) {
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
        <div className="student-topbar-actions">
          {onOpenMessages && (
            <button type="button" className="student-topbar-link eb-student-messages-entry" onClick={onOpenMessages}>
              <IconMail size={16} />الرسائل
            </button>
          )}
          {onOpenGames && (
            <button type="button" className="student-topbar-link eb-student-games-entry" onClick={onOpenGames}>
              <IconSparkles size={16} />الألعاب التعليمية
            </button>
          )}
          <button type="button" className="student-logout" onClick={onLogout}><IconLogout size={16} />تسجيل الخروج</button>
        </div>
      </header>
      <section className="student-shell">{children}</section>
    </main>
  );
}
