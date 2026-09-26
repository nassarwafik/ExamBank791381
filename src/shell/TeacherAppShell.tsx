import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import PageHeader from "../ui/PageHeader";
import IconButton from "../ui/IconButton";
import VisuallyHidden from "../ui/VisuallyHidden";
import useFocusTrap from "../ui/useFocusTrap";
import {
  IconDashboard, IconStudents, IconAssignments, IconProjects, IconReports, IconBuilder, IconUpload, IconAudit,
  IconBank, IconBook, IconSparkles, IconLogout, IconUser, IconMenu, IconClose, IconSidebar, IconMail
} from "../icons";
import {
  NAV_LABELS, EXAM_BANK_GROUP_LABEL, EXAM_BANK_HEAD, PRIMARY_NAV, EXAM_BANK_NAV, FOOTER_NAV,
  activeNavId, breadcrumbFor, pageTitleFor, type TeacherNavId, type TeacherNavState
} from "./teacherNav";
import TeacherIdentity from "../teacher/TeacherIdentity";
import type { TeacherProfile } from "../teacher/teacherProfile";
import "../ui/ui.css";
import "../shell.css";

// UX-2 — Teacher App Shell. Consumes the existing navigation state (App.tsx owns it) and renders: skip link,
// sidebar (expanded ≥1280 / compact rail 1024–1279 / drawer <1024, plus a manual compact toggle), page header
// with breadcrumb + <h1>, footer navigation (audit, user, logout). No data fetching, no routing authority.
const ICONS: Record<TeacherNavId, (p: { size?: number }) => ReactNode> = {
  dashboard: IconDashboard, learning: IconBook, students: IconStudents, assignments: IconAssignments, messages: IconMail, projects: IconProjects,
  reports: IconReports, games: IconSparkles, bank: IconBank, builder: IconBuilder, import: IconUpload, audit: IconAudit
};
/** Phase 8B — every teacher page title carries its destination's sidebar icon (the ONE central ICONS mapping; the
 *  icon is decorative — PageHeader hides it from assistive technology, so the <h1> text stays the only name). */
function pageIcon(id: TeacherNavId): ReactNode {
  const Icon = ICONS[id];
  return <Icon size={22} />;
}
const DESKTOP_QUERY = "(min-width: 1024px)";

type Props = {
  nav: TeacherNavState;
  projectReadyTotal: number;
  /** Phase 5D — unread student replies (server-derived; App owns it). `capped` → "99+". */
  messageUnread?: { total: number; capped: boolean };
  displayName: string;
  /** Teacher identity (self-profile): the sidebar shows the photo / preset icon + name and opens the profile dialog. */
  identity?: { token: string; profile: TeacherProfile | null; onProfileChange: (p: TeacherProfile) => void };
  onNavigate: (id: TeacherNavId) => void;
  onLogout: () => void;
  children: ReactNode;
};

export default function TeacherAppShell({ nav, projectReadyTotal, messageUnread, displayName, identity, onNavigate, onLogout, children }: Props) {
  const [compact, setCompact] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const active = activeNavId(nav);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // The drawer exists only below the shell breakpoint (CSS hides its trigger above it); opening is refused on
  // desktop so the fixed rail can never become a modal dialog.
  function openDrawer() {
    if (typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches) return;
    setDrawerOpen(true);
  }
  // Drawer lifecycle: lock body scroll while open; close automatically when the viewport grows to desktop
  // (the sidebar becomes the fixed rail again, so an open "dialog" would otherwise keep trapping focus).
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const mq = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_QUERY) : null;
    const onChange = (e: { matches: boolean }) => { if (e.matches) closeDrawer(); };
    mq?.addEventListener("change", onChange);
    return () => { document.body.style.overflow = previousOverflow; mq?.removeEventListener("change", onChange); };
  }, [drawerOpen, closeDrawer]);
  useFocusTrap(asideRef, drawerOpen, closeDrawer);

  function navigate(id: TeacherNavId) { onNavigate(id); setDrawerOpen(false); }

  function navButton(id: TeacherNavId, variant: "" | "group-head" | "child" = "") {
    const Icon = ICONS[id];
    const isActive = id === active;
    const badge = id === "projects" && projectReadyTotal > 0 ? projectReadyTotal : 0;
    const unread = id === "messages" && messageUnread && messageUnread.total > 0 ? messageUnread : null;
    return (
      <button
        key={id}
        type="button"
        className={"eb-nav-link" + (isActive ? " is-active" : "") + (variant === "group-head" ? " eb-nav-group-head" : variant === "child" ? " eb-nav-child" : "")}
        aria-current={isActive ? "page" : undefined}
        title={NAV_LABELS[id]}
        onClick={() => navigate(id)}
      >
        <Icon size={20} />
        <span className="eb-nav-label">{NAV_LABELS[id]}</span>
        {badge > 0 && (
          <span className="eb-nav-badge">
            {badge}
            <VisuallyHidden> مراحل بانتظار الفحص</VisuallyHidden>
          </span>
        )}
        {unread && (
          <span className="eb-nav-badge">
            {unread.capped ? "99+" : unread.total}
            <VisuallyHidden> رسائل جديدة</VisuallyHidden>
          </span>
        )}
      </button>
    );
  }

  const crumbs = breadcrumbFor(nav).map(c => ({ label: c.label, onSelect: c.navId ? () => onNavigate(c.navId as TeacherNavId) : undefined }));

  return (
    <div className={"builder-page eb-shell" + (compact ? " is-compact" : "") + (drawerOpen ? " is-drawer-open" : "")} dir="rtl">
      <a className="eb-skip-link" href="#eb-main">تجاوز إلى المحتوى</a>
      {drawerOpen && <div className="eb-drawer-backdrop" aria-hidden="true" onClick={closeDrawer} />}
      <aside
        id="eb-sidebar"
        ref={asideRef}
        className="eb-sidebar eb-on-dark"
        aria-label="التنقل الرئيسي"
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
      >
        <div className="eb-sidebar-top">
          <div className="eb-brand">
            <span className="eb-brand-mark" aria-hidden="true">EB</span>
            <span className="eb-brand-text">ExamBank<small>791381</small></span>
          </div>
          {drawerOpen ? (
            <IconButton inverse label="إغلاق القائمة" icon={<IconClose size={18} />} onClick={closeDrawer} className="eb-drawer-close" />
          ) : (
            <IconButton
              inverse
              label={compact ? "توسيع القائمة" : "طيّ القائمة"}
              icon={<IconSidebar size={18} />}
              aria-pressed={compact}
              onClick={() => setCompact(v => !v)}
              className="eb-compact-toggle"
            />
          )}
        </div>
        {identity && <TeacherIdentity token={identity.token} profile={identity.profile} sessionDisplayName={displayName} onProfileChange={identity.onProfileChange} compact={compact} />}
        <nav className="eb-nav" aria-label="الأقسام">
          {PRIMARY_NAV.map(id => navButton(id))}
          {/* UX-6c — the group head is a real destination (Exam Bank management); builder + import stay as its children. */}
          <div className="eb-nav-group" role="group" aria-label={EXAM_BANK_GROUP_LABEL}>
            {navButton(EXAM_BANK_HEAD, "group-head")}
            {EXAM_BANK_NAV.map(id => navButton(id, "child"))}
          </div>
        </nav>
        <nav className="eb-nav eb-nav-footer" aria-label="إعدادات وحساب">
          {FOOTER_NAV.map(id => navButton(id))}
          {!identity && <div className="eb-user" title={displayName}><IconUser size={16} /><span className="eb-nav-label">{displayName}</span></div>}
          <button type="button" className="eb-nav-link eb-logout app-sidebar-logout" title="تسجيل الخروج" onClick={onLogout}>
            <IconLogout size={18} /><span className="eb-nav-label">تسجيل الخروج</span>
          </button>
        </nav>
      </aside>
      <div className="app-shell-main eb-shell-main">
        <PageHeader
          title={pageTitleFor(nav)}
          icon={pageIcon(active)}
          breadcrumb={crumbs}
          leading={
            <IconButton
              label="القائمة"
              icon={<IconMenu size={20} />}
              aria-expanded={drawerOpen}
              aria-controls="eb-sidebar"
              onClick={openDrawer}
              className="eb-drawer-toggle"
            />
          }
        />
        <main id="eb-main" className="eb-shell-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
