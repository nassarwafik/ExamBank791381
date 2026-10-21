import { useRef, type KeyboardEvent } from "react";

/**
 * UX-R3 — Segmented: the reference's bordered option group (periods, views). A WAI-ARIA radio group: one Tab stop (the
 * checked option), arrow keys move AND select, following the reading direction (in RTL the left arrow goes to the next
 * option), Home / End jump to the ends. The checked segment is a grey fill with heavier text (never colour alone).
 */
export type SegmentedOption = { value: string; label: string };

export default function Segmented({ label, options, value, onChange, className }: { label: string; options: SegmentedOption[]; value: string; onChange: (value: string) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex(o => o.value === value));

  function move(to: number) {
    const next = (to + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward || e.key === "ArrowDown") { e.preventDefault(); move(index + 1); }
    else if (e.key === back || e.key === "ArrowUp") { e.preventDefault(); move(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(options.length - 1); }
  }

  return (
    <div className={"eb-segctl" + (className ? " " + className : "")} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const checked = i === index;
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={"eb-segment" + (checked ? " is-checked" : "")}
            onClick={() => onChange(o.value)}
            onKeyDown={onKeyDown}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
