import type { ReactNode } from "react";
import { IconLogout, IconMail, IconSparkles } from "../icons";
import VisuallyHidden from "../ui/VisuallyHidden";
import NotificationBell, { type NotificationCenterProps } from "../notifications/NotificationBell";
import "../ui/ui.css";
import "../shell.css";

// UX-2 — Student shell: the portal's existing top bar (brand + logout, same class hooks so platform.css keeps
// styling it) plus a small identity area (name · class) and the main content container. The top bar is the
// student's only chrome/nav surface, so the Educational Games entry lives here (when `onOpenGames` is given): it
// opens the dedicated Games destination — the games cards are NOT a permanent dashboard section. Phase 5C adds the
// «الرسائل» entry (when `onOpenMessages` is given) with the same dedicated-destination pattern.
// Phase 5D — `messagesUnread` (server-derived, owned by StudentPortal) badges the «الرسائل» entry; hidden at 0.
// Phase 6C — `notifications` (when given) adds the «الإشعارات» bell first in the bar; its badge is the SAME
// `messagesUnread` (no second count), and its panel data/navigation belong to StudentPortal.
type Props = { studentName: string; className?: string; onLogout: () => void; onOpenGames?: () => void; onOpenMessages?: () => void; messagesUnread?: { total: number; capped: boolean }; notifications?: NotificationCenterProps; children: ReactNode };

export default function StudentShell({ studentName, className, onLogout, onOpenGames, onOpenMessages, messagesUnread, notifications, children }: Props) {
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
          {notifications && <NotificationBell unread={messagesUnread} {...notifications} />}
          {onOpenMessages && (
            <button type="button" className="student-topbar-link eb-student-messages-entry" onClick={onOpenMessages}>
              <IconMail size={16} />الرسائل
              {messagesUnread && messagesUnread.total > 0 && (
                <span className="eb-nav-badge">
                  {messagesUnread.capped ? "99+" : messagesUnread.total}
                  <VisuallyHidden> رسائل غير مقروءة</VisuallyHidden>
                </span>
              )}
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
