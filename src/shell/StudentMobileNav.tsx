import { STUDENT_VIEWS, type StudentView } from "../student/portalViews";
import "./studentMobileNav.css";

// Phase 12C — Student mobile quick navigation: a phone-only (≤767px, CSS-gated) bottom bar of the portal's five destinations.
// UX-S2 (docs/enterprise-ux-student-s2.md §2.3) — each item now OPENS a view (the portal owns `active` and the #/s/<view> link)
// instead of scrolling one long page, so the former scroll spy (IntersectionObserver / MutationObserver) is gone. StudentPortal
// decides WHEN it exists (only on the main portal — never over the exam page, the Reader, Messages, Games or a screen-takeover
// dialog) and StudentShell places it. «المشاريع» is marked unavailable while the student has no project (the panel's own read).
export default function StudentMobileNav({ active, onSelect, unavailable = [], hidden = false }: {
  active: StudentView;
  onSelect: (view: StudentView) => void;
  unavailable?: readonly StudentView[];
  hidden?: boolean;
}) {
  return (
    <nav className="eb-sp-quicknav" aria-label="التنقل السريع في بوابة الطالب" hidden={hidden || undefined}>
      <ul className="eb-sp-quicknav-list">
        {STUDENT_VIEWS.map(d => {
          const isActive = active === d.key, off = unavailable.includes(d.key);
          return (
            <li key={d.key}>
              <button
                type="button"
                className={"eb-sp-quicknav-item" + (isActive ? " is-active" : "")}
                data-view={d.key}
                aria-label={off ? d.ariaLabel + " — غير متاحة الآن" : d.ariaLabel}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={off || undefined}
                onClick={() => { if (!off) onSelect(d.key); }}
              >
                <d.Icon size={22} aria-hidden={true} />
                <span className="eb-sp-quicknav-label">{d.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
