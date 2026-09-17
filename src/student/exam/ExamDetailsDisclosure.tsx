import { useId, useState, type ReactNode } from "react";
import { IconChevronDown, IconInfo } from "../../icons";

/**
 * ExamDetailsDisclosure (UX-7b-1) — one accessible disclosure for the secondary exam metadata that used to fill the
 * running-exam header (instructions, due date, marks, duration, general instructions). A real button with
 * aria-expanded / aria-controls and an SVG chevron; the panel stays in the DOM (hidden) so nothing is lost.
 */
export default function ExamDetailsDisclosure({ summary, defaultOpen = false, children }: { summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const panelId = "iex-details-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className="iex-details">
      <button type="button" className="iex-details-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        <IconInfo size={16} aria-hidden="true" />
        <span className="iex-details-label">تفاصيل الامتحان والتعليمات</span>
        {summary && <span className="iex-details-summary">{summary}</span>}
        <IconChevronDown size={16} className={"eb-disclosure-chevron" + (open ? " is-open" : "")} aria-hidden="true" />
      </button>
      <div id={panelId} className="iex-details-panel" hidden={!open}>{children}</div>
    </div>
  );
}
