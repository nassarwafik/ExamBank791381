import { useEffect, useRef, useState } from "react";
import { STUDENT_QUICK_NAV, scrollToStudentSection, type StudentQuickNavDestination, type StudentQuickNavKey } from "./studentQuickNav";
import "./studentMobileNav.css";

// Phase 12C — Student mobile quick navigation: a phone-only (≤767px, CSS-gated) bottom bar of five in-page
// destinations on the ordinary portal. It is NOT a router: every item scrolls to an EXISTING section heading of the
// main portal (no URL hash, no history entry, no data read). StudentPortal decides WHEN it exists (only on the main
// view — never over the exam page, the Reader, Messages, Games or a screen-takeover dialog) and StudentShell places
// it. Messages / notifications stay in the top bar; Games stays its own destination; achievements stay on the page.

// The section whose box crosses this thin horizontal band (≈45% down the viewport) is the one being read. Only one
// observed section can cross it at a time (sections are stacked, never overlapping); between two observed sections
// (a gap, or an unlisted section such as «ماذا عليّ أن أفعل الآن؟») the last active item simply stays.
const SPY_MARGIN = "-45% 0px -54% 0px";
// A user gesture ends a tap's scroll hand-off (see `pending` below). Events only — no timers, no polling.
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

export default function StudentMobileNav({ reducedMotion, hidden = false }: { reducedMotion: boolean; hidden?: boolean }) {
  const [active, setActive] = useState<StudentQuickNavKey>("today");
  const [missing, setMissing] = useState<ReadonlySet<StudentQuickNavKey>>(() => new Set());
  const activeRef = useRef<StudentQuickNavKey>("today");
  const missingKey = useRef("");
  // After a tap the smooth scroll passes over the sections in between; they must not flash active. The tapped item
  // stays active until its own section reaches the band, or until the student takes over (a gesture/key).
  const pending = useRef<StudentQuickNavKey | null>(null);
  const navRef = useRef<HTMLElement>(null);

  function activate(key: StudentQuickNavKey) {
    if (activeRef.current === key) return;              // unchanged → no state update, no render
    activeRef.current = key;
    setActive(key);
  }

  useEffect(() => {
    const scope = navRef.current?.closest(".eb-student-shell") ?? document.body;
    const IO = typeof window !== "undefined" ? window.IntersectionObserver : undefined;
    const crossing = new Set<StudentQuickNavKey>();
    const keyOf = new Map<Element, StudentQuickNavKey>();
    const observed = new Map<StudentQuickNavKey, Element>();
    const io = typeof IO === "function" ? new IO(entries => {
      for (const e of entries) {
        const key = keyOf.get(e.target);
        if (!key) continue;
        if (e.isIntersecting) crossing.add(key); else crossing.delete(key);
      }
      if (pending.current) {
        if (!crossing.has(pending.current)) return;      // still travelling to the tapped section
        pending.current = null;
      }
      const next = STUDENT_QUICK_NAV.find(d => crossing.has(d.key));
      if (next) activate(next.key);
    }, { rootMargin: SPY_MARGIN, threshold: 0 }) : null;

    // (Re)attach to the sections that exist now: the project panel appears only after its own read, and a section can
    // be re-mounted. Never reads data — it only looks up the five existing heading ids.
    function sync() {
      const absent: StudentQuickNavKey[] = [];
      for (const d of STUDENT_QUICK_NAV) {
        const heading = document.getElementById(d.target);
        const section = heading ? heading.closest("section") ?? heading : null;
        if (!section) absent.push(d.key);
        const prev = observed.get(d.key);
        if (prev === section) continue;
        if (prev) { io?.unobserve(prev); keyOf.delete(prev); crossing.delete(d.key); observed.delete(d.key); }
        if (section) { keyOf.set(section, d.key); observed.set(d.key, section); io?.observe(section); }
      }
      const k = absent.join(",");
      if (k !== missingKey.current) { missingKey.current = k; setMissing(new Set(absent)); }
    }
    sync();
    const MO = typeof window !== "undefined" ? window.MutationObserver : undefined;
    const mo = typeof MO === "function" ? new MO(sync) : null;
    mo?.observe(scope, { childList: true, subtree: true });
    const release = () => { pending.current = null; };
    for (const t of USER_SCROLL_EVENTS) window.addEventListener(t, release, { passive: true, capture: true });
    return () => {
      io?.disconnect(); mo?.disconnect();
      for (const t of USER_SCROLL_EVENTS) window.removeEventListener(t, release, { capture: true });
    };
  }, []);

  function go(d: StudentQuickNavDestination) {
    if (!scrollToStudentSection(d.target, reducedMotion)) return;
    pending.current = d.key;
    activate(d.key);
  }

  return (
    <nav ref={navRef} className="eb-sp-quicknav" aria-label="التنقل السريع في بوابة الطالب" hidden={hidden || undefined}>
      <ul className="eb-sp-quicknav-list">
        {STUDENT_QUICK_NAV.map(d => {
          const isActive = active === d.key, unavailable = missing.has(d.key);
          return (
            <li key={d.key}>
              <button
                type="button"
                className={"eb-sp-quicknav-item" + (isActive ? " is-active" : "")}
                data-target={d.target}
                aria-label={unavailable ? d.ariaLabel + " — غير متاحة الآن" : d.ariaLabel}
                aria-current={isActive ? "location" : undefined}
                aria-disabled={unavailable || undefined}
                onClick={() => { if (!unavailable) go(d); }}
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
