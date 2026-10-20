import { BRAND_NAME, BRAND_TAGLINE } from "../brand";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import PageHeader from "../ui/PageHeader";
import IconButton from "../ui/IconButton";
import VisuallyHidden from "../ui/VisuallyHidden";
import BrandMark from "../ui/BrandMark";
import useFocusTrap from "../ui/useFocusTrap";
import {
  IconDashboard, IconStudents, IconAssignments, IconProjects, IconReports, IconBuilder, IconUpload, IconAudit,
  IconBank, IconBook, IconSparkles, IconLogout, IconUser, IconMenu, IconClose, IconSidebar, IconMail, IconCheck } from "../icons";
import {
  NAV_LABELS, EXAM_BANK_GROUP_LABEL, EXAM_BANK_HEAD, EXAM_BANK_NAV, FOOTER_NAV, PRIMARY_SECTIONS, EXAM_SECTION_LABEL, ACCOUNT_SECTION_LABEL,
  activeNavId, breadcrumbFor, pageTitleFor, type TeacherNavId, type TeacherNavState
} from "./teacherNav";
import TeacherIdentity from "../teacher/TeacherIdentity";
import QuickNavSearch from "./QuickNavSearch";
import type { TeacherProfile } from "../teacher/teacherProfile";
import "../ui/ui.css";
import "../shell.css";
import "./teacher-nav-21e.css";

// UX-2 — Teacher App Shell. Consumes the existing navigation state (App.tsx owns it) and renders: skip link,
// sidebar (expanded ≥1280 / compact rail 1024–1279 / drawer <1024, plus a manual compact toggle), page header
// with breadcrumb + <h1>, footer navigation (audit, logout). No data fetching, no routing authority.
// UX-R2 — the redesign's light chrome: a full-width top bar above the sidebar and the page column holds the menu toggles
// (manual compact rail on desktop, the drawer below 1024), the brand, a «لوحة المتابعة» home pill, the quick navigation
// field and the teacher identity; the sidebar below it is white with hairline-separated groups.
const ICONS: Record<TeacherNavId, (p: { size?: number }) => ReactNode> = {
  dashboard: IconDashboard, learning: IconBook, students: IconStudents, assignments: IconAssignments, messages: IconMail, projects: IconProjects,
  reports: IconReports, games: IconSparkles, bank: IconBank, builder: IconBuilder, import: IconUpload, reviews: IconCheck, audit: IconAudit
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
  /** Phase P6 — stages the students marked as done that wait for the teacher's confirmation (counted in the same badge). */
  projectSelfReportedTotal?: number;
  /** Phase 5D — unread student replies (server-derived; App owns it). `capped` → "99+". */
  messageUnread?: { total: number; capped: boolean };
  displayName: string;
  /** Teacher identity (self-profile): the sidebar shows the photo / preset icon + name and opens the profile dialog. */
  identity?: { token: string; profile: TeacherProfile | null; onProfileChange: (p: TeacherProfile) => void };
  onNavigate: (id: TeacherNavId) => void;
  onLogout: () => void;
  children: ReactNode;
};

export default function TeacherAppShell({ nav, projectReadyTotal, projectSelfReportedTotal = 0, messageUnread, displayName, identity, onNavigate, onLogout, children }: Props) {
  const [compact, setCompact] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const active = activeNavId(nav);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // 21E.0 audit F16 (21E.1 slice 2) — when the teacher dismisses the phone menu (Escape, the backdrop or «إغلاق القائمة»), keyboard
  // focus goes back to the «القائمة» button that opens it. The trap alone restored whatever was focused when the drawer OPENED, which is
  // <body> whenever the tap did not focus the button (WebKit, scripted clicks) — focus was lost. Navigating to a page and the drawer
  // closing because the window became desktop-sized keep their behaviour.
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusToMenu = useRef(false);
  const dismissDrawer = useCallback(() => { returnFocusToMenu.current = true; setDrawerOpen(false); }, []);
  useEffect(() => {
    if (drawerOpen || !returnFocusToMenu.current) return;
    returnFocusToMenu.current = false;
    menuButtonRef.current?.focus();
  }, [drawerOpen]);

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
  useFocusTrap(asideRef, drawerOpen, dismissDrawer);

  function navigate(id: TeacherNavId) { onNavigate(id); setDrawerOpen(false); }

  function navButton(id: TeacherNavId, variant: "" | "group-head" | "child" = "") {
    const Icon = ICONS[id];
    const isActive = id === active;
    const badge = id === "projects" ? Math.max(0, projectReadyTotal) + Math.max(0, projectSelfReportedTotal) : 0;
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
            <VisuallyHidden>{projectSelfReportedTotal > 0 ? " مراحل بانتظار الفحص أو التأكيد" : " مراحل بانتظار الفحص"}</VisuallyHidden>
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

  // Phase 21E main navigation — a labelled section: a visible label that also names the group for assistive technology (the
  // compact rail hides the label visually, never from the accessibility tree).
  function section(id: string, label: string, body: ReactNode, extraClass = "") {
    const labelId = "eb-nav-section-" + id;
    return (
      <div key={id} className={"eb-nav-section" + extraClass} role="group" aria-labelledby={labelId}>
        <p id={labelId} className="eb-nav-section-label">{label}</p>
        {body}
      </div>
    );
  }

  const destinations = (Object.keys(ICONS) as TeacherNavId[]).map(id => ({ id, label: NAV_LABELS[id] }));
  const crumbs = breadcrumbFor(nav).map(c => ({ label: c.label, onSelect: c.navId ? () => onNavigate(c.navId as TeacherNavId) : undefined }));

  return (
    <div className={"builder-page eb-shell" + (compact ? " is-compact" : "") + (drawerOpen ? " is-drawer-open" : "")} dir="rtl">
      <a className="eb-skip-link" href="#eb-main">تجاوز إلى المحتوى</a>
      <header className="eb-topbar">
        <IconButton
          label={compact ? "توسيع القائمة" : "طيّ القائمة"}
          icon={<IconSidebar size={20} />}
          aria-pressed={compact}
          onClick={() => setCompact(v => !v)}
          className="eb-compact-toggle"
        />
        <IconButton
          ref={menuButtonRef}
          label="القائمة"
          icon={<IconMenu size={20} />}
          aria-expanded={drawerOpen}
          aria-controls="eb-sidebar"
          onClick={openDrawer}
          className="eb-drawer-toggle"
        />
        <div className="eb-brand">
          <span className="eb-brand-mark" aria-hidden="true"><BrandMark size={32} /></span>
          <span className="eb-brand-text"><bdi dir="ltr">{BRAND_NAME}</bdi><small>{BRAND_TAGLINE}</small></span>
        </div>
        {/* The home pill (the reference's «Projects» chip): a distinct name, so it never doubles the sidebar's «لوحة المتابعة». */}
        <button type="button" className="eb-topbar-pill" title={NAV_LABELS.dashboard} onClick={() => navigate("dashboard")}>
          الرئيسية
        </button>
        <QuickNavSearch destinations={destinations} onNavigate={id => navigate(id as TeacherNavId)} className="eb-topbar-search" />
        <div className="eb-topbar-actions">
          {identity
            ? <TeacherIdentity token={identity.token} profile={identity.profile} sessionDisplayName={displayName} onProfileChange={identity.onProfileChange} compact />
            : <div className="eb-topbar-user" title={displayName}><IconUser size={16} /><span>{displayName}</span></div>}
        </div>
      </header>
      {drawerOpen && <div className="eb-drawer-backdrop" aria-hidden="true" onClick={dismissDrawer} />}
      <aside
        id="eb-sidebar"
        ref={asideRef}
        className="eb-sidebar"
        aria-label="التنقل الرئيسي"
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
      >
        {drawerOpen && (
          <div className="eb-sidebar-top">
            <span className="eb-sidebar-title"><bdi dir="ltr">{BRAND_NAME}</bdi></span>
            <IconButton label="إغلاق القائمة" icon={<IconClose size={18} />} onClick={dismissDrawer} className="eb-drawer-close" />
          </div>
        )}
        <nav className="eb-nav" aria-label="الأقسام">
          {PRIMARY_SECTIONS.map(s => section(s.id, s.label, s.items.map(id => navButton(id))))}
          {/* UX-6c — the group head is a real destination (Exam Bank management); builder + import stay as its children. */}
          {section("exams", EXAM_SECTION_LABEL, (
            <div className="eb-nav-group" role="group" aria-label={EXAM_BANK_GROUP_LABEL}>
              {navButton(EXAM_BANK_HEAD, "group-head")}
              {EXAM_BANK_NAV.map(id => navButton(id, "child"))}
            </div>
          ))}
        </nav>
        <nav className="eb-nav eb-nav-footer" aria-label="إعدادات وحساب">
          {FOOTER_NAV.map(id => navButton(id))}
          {/* Phase 21E — the account controls at the bottom. UX-R2: who is signed in moved to the top bar; «تسجيل الخروج» stays here. */}
          {section("account", ACCOUNT_SECTION_LABEL, (
            <button type="button" className="eb-nav-link eb-logout app-sidebar-logout" title="تسجيل الخروج" onClick={onLogout}>
              <IconLogout size={18} /><span className="eb-nav-label">تسجيل الخروج</span>
            </button>
          ), " eb-nav-account")}
        </nav>
      </aside>
      <div className="app-shell-main eb-shell-main">
        <PageHeader title={pageTitleFor(nav)} icon={pageIcon(active)} breadcrumb={crumbs} />
        <main id="eb-main" className="eb-shell-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
