import { cloneElement, useId, useState, type KeyboardEvent, type ReactElement } from "react";

/**
 * UX-R3 — Tooltip: the reference's small dark hint (primary fill, white text). WCAG 1.4.13: it appears on hover AND on
 * keyboard focus, stays while the pointer moves onto it (it lives inside the host), and Escape dismisses it without moving
 * focus. The trigger gets aria-describedby, so the hint is read as a description — never as the control's name (a control
 * must already have its own name). Supplementary text only: nothing essential may live in a tooltip.
 */
export default function Tooltip({ text, children }: { text: string; children: ReactElement<{ "aria-describedby"?: string }> }) {
  const [open, setOpen] = useState(false);
  const id = "eb-tip-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const existing = children.props["aria-describedby"];
  function onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  }
  return (
    <span
      className="eb-tooltip-host"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={onKeyDown}
    >
      {cloneElement(children, { "aria-describedby": existing ? existing + " " + id : id })}
      <span role="tooltip" id={id} className="eb-tooltip" hidden={!open}>{text}</span>
    </span>
  );
}
