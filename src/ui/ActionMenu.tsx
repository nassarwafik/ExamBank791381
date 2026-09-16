import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconMore } from "../icons";

/**
 * ActionMenu — a labelled disclosure ("⋯") holding ordinary buttons / checkboxes. Deliberately NOT an
 * ARIA menu widget (no full menu keyboard model is implemented): it is a popover of normal controls.
 * Contract: labelled trigger with aria-expanded/controls · Escape closes · outside click closes ·
 * focus returns to the trigger · the panel is portalled with fixed positioning, so it never clips
 * inside an overflow container (tables, panes) and flips upward near the viewport bottom.
 * Activating any control inside closes the menu first (focus back on the trigger) and then runs the
 * control's own handler, so a dialog opened from the menu returns focus to the trigger on close.
 */
export default function ActionMenu({ label, children, icon, text, className, disabled }: { label: string; children: ReactNode; icon?: ReactNode; text?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const panelId = "eb-menu-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "");

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current, panel = panelRef.current;
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    const gap = 4;
    const below = t.bottom + gap + p.height <= vh || t.top - gap - p.height < 0;
    const top = below ? t.bottom + gap : Math.max(gap, t.top - gap - p.height);
    // Align the panel's inline-end (right edge in RTL) with the trigger, clamped inside the viewport.
    let right = Math.max(gap, vw - t.right);
    if (vw - right - p.width < gap) right = Math.max(gap, vw - p.width - gap);
    setStyle({ position: "fixed", top, right, maxHeight: Math.max(120, vh - gap * 2) });
    const first = panel.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])");
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const panel = panelRef.current; if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }
    function onLayout() { close(false); }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open]);

  // Any activated control closes the menu (focus back on the trigger) before its own handler runs.
  function onPanelClickCapture(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest("button, input[type='checkbox'], label")) close(true);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={"eb-menu-trigger" + (text ? " has-text" : "") + (className ? " " + className : "")} aria-label={label} title={label} aria-expanded={open} aria-controls={open ? panelId : undefined} disabled={disabled} onClick={() => (open ? close(true) : setOpen(true))}>
        {icon ?? <IconMore size={16} />}{text && <span>{text}</span>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} id={panelId} className="eb-menu-panel" role="group" aria-label={label} style={style} dir="rtl" onClickCapture={onPanelClickCapture}>
          {children}
        </div>,
        document.body
      )}
    </>
  );
}
