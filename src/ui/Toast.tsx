import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconClose, IconInfo, IconWarning } from "../icons";
import IconButton from "./IconButton";
import "./toast.css";

/**
 * Phase 21E.1 (slice 2) — the platform's toast: a calm, short-lived message with at most ONE action (e.g. «تراجع»).
 *
 * Accessibility contract
 *  - Announced, never focus-stealing: an always-mounted polite live region (`role="status"`) receives the message text after the
 *    toast appears, so screen readers read it once; the visible card is a labelled group that keyboard users can Tab to.
 *  - Timing is adjustable (WCAG 2.2.1): the countdown pauses while the pointer is over the card or focus is inside it, and the
 *    card has a close button; Escape inside the card closes it.
 *  - The owner decides where focus goes when a toast closes while focus was inside it (`onDismiss(reason, hadFocus)`), because only
 *    the owner knows the sensible place (e.g. the restored question after «تراجع»).
 *  - One toast at a time: a new toast replaces the current one (`onDismiss("replaced")`).
 * Placement is the caller's: render `toastRegion` inside the surface that must show it (the structured builder renders it inside its
 * fixed overlay, whose stacking layer is above `--eb-z-toast`). Styles: ./toast.css (token-only, loaded with the first consumer).
 */
export type ToastTone = "neutral" | "success" | "info" | "warn";
export type ToastDismissReason = "timeout" | "close" | "escape" | "action" | "replaced" | "programmatic";
export type ToastAction = {
  /** Visible text of the action button (e.g. «تراجع»). */
  label: string;
  /** Full accessible name when the visible text alone is ambiguous (must contain `label`, WCAG 2.5.3). */
  accessibleLabel?: string;
  onAction: () => void;
  disabled?: boolean;
};
export type ToastOptions = {
  message: string;
  /** What screen readers hear instead of `message` (e.g. the message plus a keyboard hint). Defaults to `message`. */
  announcement?: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Visible lifetime in ms (paused while hovered / focused). Defaults to the hook's `defaultDurationMs`. */
  durationMs?: number;
  /** Called once when this toast leaves; `hadFocus` is true when keyboard focus was inside the card at that moment. */
  onDismiss?: (reason: ToastDismissReason, hadFocus: boolean) => void;
};
type ActiveToast = ToastOptions & { id: number };

const TONE_ICON: Record<Exclude<ToastTone, "neutral">, ReactNode> = {
  success: <IconCheck size={16} aria-hidden="true" />,
  info: <IconInfo size={16} aria-hidden="true" />,
  warn: <IconWarning size={16} aria-hidden="true" />,
};

/** `actionDisabled` disables the current action reactively (e.g. while the owner is saving), whatever the toast was shown with. */
export function useToast({ defaultDurationMs = 8000, actionDisabled = false }: { defaultDurationMs?: number; actionDisabled?: boolean } = {}) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const [announced, setAnnounced] = useState<{ id: number; text: string } | null>(null);
  const seq = useRef(0);
  const current = useRef<ActiveToast | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const finish = useCallback((reason: ToastDismissReason) => {
    const t = current.current;
    if (!t) return;
    const hadFocus = !!cardRef.current && typeof document !== "undefined" && cardRef.current.contains(document.activeElement);
    current.current = null;
    setToast(null);
    t.onDismiss?.(reason, hadFocus);
  }, []);

  // The countdown of the CURRENT toast (keyed by id, so a closing toast's timer can never shorten the next one's).
  const timing = useRef<{ id: number; remaining: number; startedAt: number }>({ id: 0, remaining: 0, startedAt: 0 });
  const showToast = useCallback((options: ToastOptions) => {
    if (current.current) finish("replaced");
    const next: ActiveToast = { ...options, id: ++seq.current };
    current.current = next;
    timing.current = { id: next.id, remaining: options.durationMs ?? defaultDurationMs, startedAt: 0 };
    setToast(next);
    return next.id;
  }, [finish, defaultDurationMs]);

  /** Closes the current toast (or only the one with `id`, so a stale caller cannot close a newer toast). */
  const dismissToast = useCallback((id?: number) => {
    if (!current.current || (id !== undefined && current.current.id !== id)) return;
    finish("programmatic");
  }, [finish]);

  // Announce AFTER the card is in the DOM: text inserted into a live region that already exists is read reliably (a region inserted
  // together with its text often is not). Keyed by toast id, so the region is empty until a new toast's text arrives (the same
  // message twice in a row is read twice).
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setAnnounced({ id: toast.id, text: toast.announcement ?? toast.message }), 60);
    return () => window.clearTimeout(t);
  }, [toast]);
  const announcement = toast && announced?.id === toast.id ? announced.text : "";

  // Countdown with pause: hover or focus inside the card stops it; leaving restarts it with the remaining time.
  const [pause, setPause] = useState<{ id: number; hover: boolean; focus: boolean }>({ id: 0, hover: false, focus: false });
  const isPaused = !!toast && pause.id === toast.id && (pause.hover || pause.focus);
  const setPaused = (id: number, key: "hover" | "focus", value: boolean) =>
    setPause(p => (p.id === id ? { ...p, [key]: value } : { id, hover: false, focus: false, [key]: value }));
  useEffect(() => {
    const tm = timing.current;
    if (!toast || isPaused || tm.id !== toast.id) return;
    tm.startedAt = Date.now();
    const id = toast.id;
    const t = window.setTimeout(() => { if (current.current?.id === id) finish("timeout"); }, Math.max(0, tm.remaining));
    return () => { window.clearTimeout(t); tm.remaining = Math.max(0, tm.remaining - (Date.now() - tm.startedAt)); };
  }, [toast, isPaused, finish]);

  useEffect(() => () => { current.current = null; }, []);

  const tone = toast?.tone ?? "neutral";
  const toastRegion = (
    <div className="eb-toast-layer" dir="rtl">
      <div className="eb-visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
      {toast && (
        <div
          key={toast.id}
          ref={cardRef}
          className={"eb-toast eb-on-dark tone-" + tone}
          role="group"
          aria-label="إشعار"
          data-toast-id={toast.id}
          onMouseEnter={() => setPaused(toast.id, "hover", true)}
          onMouseLeave={() => setPaused(toast.id, "hover", false)}
          onFocus={() => setPaused(toast.id, "focus", true)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(toast.id, "focus", false); }}
          onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); finish("escape"); } }}
        >
          {tone !== "neutral" && <span className="eb-toast-icon" aria-hidden="true">{TONE_ICON[tone]}</span>}
          <p className="eb-toast-message">{toast.message}</p>
          {toast.action && (
            <button
              type="button"
              className="eb-toast-action"
              aria-label={toast.action.accessibleLabel}
              disabled={actionDisabled || toast.action.disabled}
              onClick={() => { const action = toast.action; if (!action || action.disabled || actionDisabled) return; finish("action"); action.onAction(); }}
            >
              {toast.action.label}
            </button>
          )}
          <IconButton className="eb-toast-close" inverse label="إغلاق الإشعار" icon={<IconClose size={16} />} onClick={() => finish("close")} />
        </div>
      )}
    </div>
  );

  return { showToast, dismissToast, toastRegion, activeToastId: toast?.id ?? 0 };
}
