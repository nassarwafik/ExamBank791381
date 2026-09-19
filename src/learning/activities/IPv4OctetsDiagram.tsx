import { useMemo, useState } from "react";
import type { LearningActivityProps } from "./engine";

/**
 * Phase 3E — the SECOND registry-backed production activity: `interactive-diagram / ipv4-octets / v1`.
 *
 * It helps the student SEE that an IPv4 address is made of exactly FOUR parts (octets) separated by dots, and that
 * each part is a number in the book's stated range — precisely the concept on Book 791381 PDF 27 and NOTHING beyond
 * it (no validity rules, no CIDR, no subnet mask, no Class A/B/C, no free-text input, no scoring). The student
 * selects one of the four octet segments (real <button>s: keyboard + touch, ≥44px, `aria-pressed` + a visible
 * check mark so the selected state is never colour-only); the detail line names the selected part and its value.
 * The address row is rendered `dir="ltr"` so the digits and the dot order are never reversed inside the RTL page.
 * All display text (the example address, the range wording, the caption) comes from the block's `config` — the
 * component holds no book wording. Reduced-motion removes the transition. No network, no persistence, no Canvas.
 */
type Octets = readonly [string, string, string, string];

/** Accept only a well-formed dotted-quad example from CONFIG (four 1–3 digit parts, each 0–255). This is a sanity
 *  check on authored data, not a validator for arbitrary user input — the activity has no input field. */
function readOctets(config: unknown): Octets | null {
  const address = (config as { address?: unknown } | undefined)?.address;
  if (typeof address !== "string") return null;
  const parts = address.trim().split(".");
  if (parts.length !== 4) return null;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    if (Number(p) > 255) return null;
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

function readString(config: unknown, key: string, fallback = ""): string {
  const v = (config as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : fallback;
}

export default function IPv4OctetsDiagram({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const octets = useMemo(() => readOctets(block.config), [block.config]);
  const rangeText = readString(block.config, "rangeText");   // e.g. "كل قسم بين 0 و 255." (the book's wording)
  const caption = readString(block.config, "caption");       // e.g. "اختر قسمًا من الأقسام الأربعة."
  const note = readString(block.config, "note");
  // The shell only issues `reset` because this renderer declares the capability; derive from the reset epoch.
  const [pick, setPick] = useState({ index: 0, epoch: 0 });
  const index = pick.epoch === commands.reset ? pick.index : 0;

  if (!octets) {
    return <p className="learning-octets-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;
  }

  const select = (i: number) => {
    setPick({ index: i, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name: "octet-select", detail: { octet: i + 1, value: octets[i] } });
  };

  return (
    <div className="learning-octets" data-reduced-motion={reducedMotion || undefined}>
      {caption && <p className="learning-octets-caption">{caption}</p>}

      {/* The address itself: an LTR row of four selectable parts with visible dot separators (MSB-left, never
          reversed by the surrounding RTL page). Real buttons → Tab focus + Enter/Space for free. */}
      <div className="learning-octets-row" dir="ltr" role="group" aria-label={octets.join(".")}>
        {octets.map((value, i) => (
          <span key={i} className="learning-octets-cell">
            {i > 0 && <span className="learning-octets-dot" aria-hidden="true">.</span>}
            <button
              type="button"
              className={"learning-octets-octet" + (i === index ? " is-active" : "")}
              aria-pressed={i === index}
              aria-label={`القسم ${i + 1} من 4: ${value}`}
              onClick={() => select(i)}
            >
              <span className="learning-octets-value">{value}</span>
              {i === index && <span className="learning-octets-mark" aria-hidden="true">✓</span>}
            </button>
          </span>
        ))}
      </div>

      <div className="learning-octets-detail" aria-live="polite">
        <p className="learning-octets-title">
          <span className="learning-octets-badge">{index + 1} / 4</span>
          القسم {index + 1} من 4 — قيمته <code dir="ltr">{octets[index]}</code>
        </p>
        {rangeText && <p className="learning-octets-range">{rangeText}</p>}
      </div>

      {note && <p className="learning-octets-note">{note}</p>}
    </div>
  );
}
