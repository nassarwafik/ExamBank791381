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
 * Dialogs stack. Only the TOP, non-suspended dialog is active: it owns the focus trap and the Escape key,
 * and it is the only layer exposed to assistive technology — a covered (lower) dialog stays mounted but is
 * `aria-hidden` + `inert`. Focus return is owned by the dialog itself: the opener is captured once, when
 * the dialog genuinely opens, and focused again only when it genuinely closes — never because it was
 * temporarily covered (e.g. a ConfirmDialog above a form). `suspended` hands the page over to a legacy
 * overlay layered above (AssignmentReview) without unmounting the dialog's content.
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
  const openerRef = useRef<HTMLElement | null>(null);
  const initialFocusDone = useRef(false);

  // Genuine open / close: register in the stack, capture the opener once, and return focus to it on close.
  useLayoutEffect(() => {
    if (!open) return;
    const t = token.current as symbol;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusDone.current = false;
    push(t);
    return () => {
      remove(t);
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
    };
  }, [open]);
  const isTop = useSyncExternalStore(subscribe, () => topToken() === token.current, () => false);
  const covered = open && !isTop;
  const trapActive = open && isTop && !suspended;

  // Resume point: the last control focused inside this dialog. While covered the panel is inert, so a child
  // dialog's own focus return cannot land here; when this dialog regains top status it refocuses that control
  // itself, in the same commit that removes `inert` — the child's opener inside the parent, never the
  // parent's external opener.
  const lastFocusedInside = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const remember = (e: FocusEvent) => { if (e.target instanceof HTMLElement && panel.contains(e.target)) lastFocusedInside.current = e.target; };
    panel.addEventListener("focusin", remember);
    panel.addEventListener("focus", remember, true);
    return () => { panel.removeEventListener("focusin", remember); panel.removeEventListener("focus", remember, true); lastFocusedInside.current = null; };
  }, [open]);
  const wasCovered = useRef(false);
  useLayoutEffect(() => {
    if (wasCovered.current && open && !covered) {
      const el = lastFocusedInside.current;
      if (el && el.isConnected && panelRef.current?.contains(el) && typeof el.focus === "function") el.focus();
    }
    wasCovered.current = covered;
  }, [covered, open]);

  // The trap never restores focus on its own: losing top status is not closing.
  useFocusTrap(panelRef, trapActive, onClose, { restoreFocus: false });
  useEffect(() => {
    if (!trapActive || initialFocusDone.current) return;
    initialFocusDone.current = true;
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
  const hidden = covered || suspended;
  const cls = ["eb-dialog", "size-" + size, "tone-" + tone, className || ""].filter(Boolean).join(" ");
  return createPortal(
    <div className={"eb-dialog-root" + (suspended ? " is-suspended" : "") + (covered ? " is-covered" : "")} dir="rtl">
      <div className="eb-dialog-backdrop" onClick={hidden ? undefined : onClose} aria-hidden="true" data-testid="eb-dialog-backdrop" />
      <div ref={panelRef} className={cls} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} aria-hidden={hidden ? true : undefined} inert={hidden ? true : undefined}>
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
