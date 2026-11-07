import { BRAND_NAME, BRAND_TAGLINE } from "../brand";
import type { ReactNode } from "react";
import BrandMark from "../ui/BrandMark";
import { IconDownload, IconLogout, IconMail, IconSparkles } from "../icons";
import VisuallyHidden from "../ui/VisuallyHidden";
import NotificationBell, { type NotificationCenterProps } from "../notifications/NotificationBell";
import { useInstallEntry } from "../pwa/useInstallEntry";
import "../pwa/pwa.css";
import ActionMenu from "../ui/ActionMenu";
import ThemeSwitch from "../ui/ThemeSwitch";
import { DARK_MODE_RELEASED } from "../ui/themePreference";
import { clearAllJournals } from "../student/exam/answerJournal";
import "../ui/ui.css";
import "../ui/kit.css";
import "../shell.css";
import SchoolBadge from "../ui/SchoolBadge";
import type { SchoolBadgeView } from "./schoolIdentity";

// UX-2 — Student shell: the portal's existing top bar (brand + logout, same class hooks so platform.css keeps
// styling it) plus a small identity area (name · class) and the main content container. The top bar is the
// student's only chrome/nav surface, so the Educational Games entry lives here (when `onOpenGames` is given): it
// opens the dedicated Games destination — the games cards are NOT a permanent dashboard section. Phase 5C adds the
// «الرسائل» entry (when `onOpenMessages` is given) with the same dedicated-destination pattern.
// Phase 5D — `messagesUnread` (server-derived, owned by StudentPortal) badges the «الرسائل» entry; hidden at 0.
// Phase 6C/6D — `notifications` (when given) adds the «الإشعارات» bell first in the bar. Its badge is the server's
// UNIFIED count (`notifications.counts.bell` = messages + events); the «الرسائل» badge stays `messagesUnread`
// (message-only). Panel data/counts/navigation belong to StudentPortal.
// Phase 10C — the permanent «تثبيت التطبيق» entry (InstallAppEntry) renders itself only while the app is not
// installed; it is independent of the dashboard install card and of that card's temporary dismissal.
// Phase 12C — `quickNav` (the phone bottom bar, StudentMobileNav) is placed after the content ONLY when StudentPortal
// hands it over (the ordinary main portal); `has-quick-nav` then gives the content its phone-only bottom clearance.
// UX-S1 (docs/enterprise-ux-student-s1.md §2.2) — on a phone (≤ 720px) the bar no longer scrolls sideways with the logout off-screen:
// theme · notifications · messages stay, and «الألعاب التعليمية» / «تثبيت التطبيق» / «تسجيل الخروج» move into the shared ActionMenu
// «المزيد». The desktop bar is unchanged (CSS decides which of the two is shown). Logout is the SAME action from both places, and the
// install dialog lives here (useInstallEntry) so it survives the menu closing.
type Props = { studentName: string; className?: string; onLogout: () => void; onOpenGames?: () => void; onOpenMessages?: () => void; messagesUnread?: { total: number; capped: boolean }; notifications?: NotificationCenterProps; quickNav?: ReactNode; school?: SchoolBadgeView | null; children: ReactNode };

export default function StudentShell({ studentName, className, onLogout, onOpenGames, onOpenMessages, messagesUnread, notifications, quickNav, school = null, children }: Props) {
  const install = useInstallEntry();
  // D1 — the explicit logout removes every device copy of unsent exam answers (a 401 keeps them for the next sign-in).
  const logout = () => { clearAllJournals(); onLogout(); };
  return (
    <main className={"student-portal eb-student-shell" + (quickNav ? " has-quick-nav" : "")} dir="rtl">
      <header className="student-topbar">
        <div className="student-brand">
          <span className="student-logo" aria-hidden="true"><BrandMark size={43} /></span>
          <div><h1><bdi dir="ltr">{BRAND_NAME}</bdi></h1><p>{BRAND_TAGLINE} — بوابة الطالب للتدريب والواجبات</p></div>
        </div>
        {/* Tadris+ P4-C — the school of the student's teacher (owner decision §19.8); absent = nothing, as before. */}
        {school && <SchoolBadge name={school.name} logoUrl={school.logoUrl} size="lg" />}
        {studentName && (
          <div className="eb-student-identity" aria-label="الطالب الحالي">
            <strong>{studentName}</strong>
            {className && <span>{className}</span>}
          </div>
        )}
        <div className="student-topbar-actions">
          {/* UX-R18a — the dark-mode toggle (moon / sun), on this device; released in UX-R18c2. */}
          {DARK_MODE_RELEASED && <ThemeSwitch className="student-theme" />}
          {notifications && <NotificationBell {...notifications} />}
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
          {/* UX-S1 — the phone menu sits BEFORE the wide group in the DOM, so the bar's last control stays «تسجيل الخروج» (6C);
              CSS shows exactly one of the two: the menu at ≤ 720px (pushed to the end with margin-inline-start:auto), the group above. */}
          <ActionMenu label="المزيد" text="المزيد" className="student-topbar-more">
            {onOpenGames && <button type="button" className="eb-menu-item" onClick={onOpenGames}><IconSparkles size={16} />الألعاب التعليمية</button>}
            {install.visible && <button type="button" className="eb-menu-item" disabled={install.busy} onClick={install.start}><IconDownload size={16} />تثبيت التطبيق</button>}
            <button type="button" className="eb-menu-item is-danger" onClick={logout}><IconLogout size={16} />تسجيل الخروج</button>
          </ActionMenu>
          <span className="student-topbar-wide">
            {onOpenGames && (
              <button type="button" className="student-topbar-link eb-student-games-entry" onClick={onOpenGames}>
                <IconSparkles size={16} />الألعاب التعليمية
              </button>
            )}
            {install.visible && (
              <button type="button" className="student-topbar-link eb-student-install-entry" disabled={install.busy} onClick={install.start}>
                <IconDownload size={16} />تثبيت التطبيق
              </button>
            )}
            <button type="button" className="student-logout" onClick={logout}><IconLogout size={16} />تسجيل الخروج</button>
          </span>
        </div>
        {install.dialog}
      </header>
      <section className="student-shell">{children}</section>
      {quickNav}
    </main>
  );
}
