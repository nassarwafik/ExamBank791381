import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import useFocusTrap from "./useFocusTrap";
import IconButton from "./IconButton";
import { IconClose } from "../icons";

/**
 * Dialog — the one modal primitive (UX-4). Renders into document.body, `role="dialog"` + `aria-modal`,
 * labelled by its title, traps keyboard focus with the UX-2 `useFocusTrap`, closes on Escape and on
 * backdrop click, returns focus to the opening control, and locks body scroll while any dialog is open.
 *
 * Dialogs stack: only the TOP dialog owns the focus trap and the Escape key (a confirm above a form
 * never closes both). `suspended` hands the page over to a legacy overlay layered above (AssignmentReview)
 * without unmounting the dialog's content.
 */
const stack: symbol[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function push(token: symbol) { stack.push(token); emit(); }
function remove(token: symbol) { const i = stack.indexOf(token); if (i >= 0) { stack.splice(i, 1); emit(); } }
function topToken() { return stack[stack.length - 1]; }

export type DialogProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "danger";
  className?: string;
  /** Element to focus on open instead of the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** True while a legacy overlay is layered above: trap released, dialog hidden from AT. */
  suspended?: boolean;
  hideClose?: boolean;
  describedBy?: string;
};

export default function Dialog({ open, title, onClose, children, footer, size = "md", tone = "default", className, initialFocusRef, suspended = false, hideClose = false, describedBy }: DialogProps) {
  const reactId = useId();
  const titleId = "eb-dialog-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "") + "-title";
  const token = useRef<symbol | null>(null);
  if (token.current === null) token.current = Symbol("dialog");
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const t = token.current as symbol;
    push(t);
    return () => remove(t);
  }, [open]);
  const isTop = useSyncExternalStore(subscribe, () => topToken() === token.current, () => false);
  const trapActive = open && isTop && !suspended;

  useFocusTrap(panelRef, trapActive, onClose);
  useEffect(() => {
    if (!trapActive) return;
    const el = initialFocusRef?.current;
    if (el && typeof el.focus === "function") el.focus();
  }, [trapActive, initialFocusRef]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { if (stack.length === 0) document.body.style.overflow = previous; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const cls = ["eb-dialog", "size-" + size, "tone-" + tone, className || ""].filter(Boolean).join(" ");
  return createPortal(
    <div className={"eb-dialog-root" + (suspended ? " is-suspended" : "")} dir="rtl">
      <div className="eb-dialog-backdrop" onClick={onClose} aria-hidden="true" data-testid="eb-dialog-backdrop" />
      <div ref={panelRef} className={cls} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} aria-hidden={suspended ? true : undefined}>
        <div className="eb-dialog-head">
          <h2 id={titleId} className="eb-dialog-title">{title}</h2>
          {!hideClose && <IconButton label="إغلاق" icon={<IconClose size={18} />} onClick={onClose} className="eb-dialog-close" />}
        </div>
        <div className="eb-dialog-body">{children}</div>
        {footer && <div className="eb-dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
