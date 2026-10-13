import { useContext, useState, type ReactNode } from "react";
import { FieldRevealContext, useFieldIds } from "./fieldContext";
import "./field.css";

/**
 * Field — the one field frame for teacher editors (Phase 21E.2, generalised from RubricEditor's local Field):
 * a VISIBLE label bound to the control (`htmlFor` / `id`), optional help text, and an inline validation message.
 * The control receives `id`, `aria-describedby` (help + error ids) and `aria-invalid` through a render prop, so the
 * frame never wraps or clones the control and the error is never part of the control's accessible name.
 *
 * When the message shows: once the teacher has left the field (first blur inside the frame), when an ancestor reveals
 * the question's issues (FieldRevealContext — e.g. the teacher opened an issue from the builder's summary), or always
 * when `showError="always"`. A field never turns red while the teacher is still typing a new value for the first time.
 * The frame validates nothing itself: the caller passes the message derived from the canonical rules.
 */
export type FieldA11y = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

export type FieldProps = {
  label: ReactNode;
  help?: ReactNode;
  /** The validation message (from the canonical rules); absent / empty = valid. */
  error?: ReactNode;
  /** "touched" (default): after the first blur or a reveal; "always": whenever there is an error. */
  showError?: "touched" | "always";
  /** Keep the label for assistive technology only (dense repeated rows that already have a visible group legend). */
  hideLabel?: boolean;
  /** Layout: "stack" (label above, default) or "inline" (label beside a short control). */
  layout?: "stack" | "inline";
  className?: string;
  /** The "already visited" state belongs to this key: when it changes (e.g. the length of a list of rows the field sits in),
   *  the field counts as not visited again — so a row's state never moves onto another row after an insert / delete. */
  touchKey?: string | number;
  children: (a11y: FieldA11y) => ReactNode;
};

export default function Field({ label, help, error, showError = "touched", hideLabel, layout = "stack", className, touchKey = 0, children }: FieldProps) {
  const { id, helpId, errorId } = useFieldIds();
  const reveal = useContext(FieldRevealContext);
  const [touchedFor, setTouchedFor] = useState<string | number | null>(null);
  const touched = touchedFor === touchKey;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const visibleError = hasError && (showError === "always" || touched || reveal);
  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const a11y: FieldA11y = { id, ...(describedBy ? { "aria-describedby": describedBy } : {}), ...(visibleError ? { "aria-invalid": true as const } : {}) };
  return (
    <div className={["eb-field", "is-" + layout, visibleError ? "is-invalid" : "", className || ""].filter(Boolean).join(" ")} onBlur={() => { if (!touched) setTouchedFor(touchKey); }}>
      <label htmlFor={id} className={hideLabel ? "eb-field-label eb-visually-hidden" : "eb-field-label"}>{label}</label>
      <div className="eb-field-control">{children(a11y)}</div>
      {help && <p id={helpId} className="eb-field-help">{help}</p>}
      {visibleError && <p id={errorId} className="eb-field-error">{error}</p>}
    </div>
  );
}

/**
 * FieldGroup — the same frame for a GROUP of controls (radio choices, option rows, pairs): a fieldset whose legend is the
 * visible group label; help / error are linked to the group with aria-describedby. Controls inside that carry their own
 * invalid state get `aria-invalid` from the caller (via `groupA11y`).
 */
export function FieldGroup({ legend, help, error, showError = "touched", className, children }: { legend: ReactNode; help?: ReactNode; error?: ReactNode; showError?: "touched" | "always"; className?: string; children: (a11y: { "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode }) {
  const { helpId, errorId } = useFieldIds("eb-group");
  const reveal = useContext(FieldRevealContext);
  const [touched, setTouched] = useState(false);
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const visibleError = hasError && (showError === "always" || touched || reveal);
  const describedBy = [help ? helpId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className={["eb-field-group", visibleError ? "is-invalid" : "", className || ""].filter(Boolean).join(" ")} aria-describedby={describedBy} onBlur={e => { if (!touched && !e.currentTarget.contains(e.relatedTarget as Node | null)) setTouched(true); }}>
      <legend className="eb-field-label">{legend}</legend>
      {help && <p id={helpId} className="eb-field-help">{help}</p>}
      {children(visibleError ? { "aria-invalid": true, "aria-describedby": errorId } : {})}
      {visibleError && <p id={errorId} className="eb-field-error">{error}</p>}
    </fieldset>
  );
}
