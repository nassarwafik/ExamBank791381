import { useMemo, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { LearningActivityProps } from "./engine";

/**
 * Units 7–8 phase — `interactive-diagram / mac-address-anatomy / v1` (Book 791381 PDF 64).
 *
 * The book's example MAC (A0:02:AF:2D:10:22) is shown as an LTR row of SIX two-digit groups. Pressing a group
 * highlights it and names its two hexadecimal digits in a text line (never colour-only); a running count states
 * «6 مجموعات × 2 = 12 منزلة». A toggle swaps the row for the BROADCAST MAC (FF:FF:FF:FF:FF:FF) with its meaning
 * («للجميع»). The book facts (physical / network card / OSI layer 2 / Switch) are listed as text. A small task asks
 * which of several strings has the MAC SHAPE — twelve hex digits in six colon-separated groups — with an immediate
 * verdict (icon + word) and the authored «why». Strictly the book's level: no OUI/vendor structure, no bit rules.
 * Real <button>s (keyboard + touch, ≥44px, aria-pressed / radio semantics), shell reset (epoch stamp), no timers,
 * no network, no persistence. All wording comes from the block's `config`; MAC strings are always dir="ltr".
 */
type Candidate = { value: string; why: string };
type Config = {
  example: string; broadcast: string; broadcastLabel: string; normalLabel: string;
  facts: string[]; hexDigits: string;
  task?: { prompt: string; candidates: Candidate[] };
};

const MAC_SHAPE = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i;
const groupsOf = (mac: string) => mac.split(":");

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
  if (typeof c.example !== "string" || !MAC_SHAPE.test(c.example)) return null;
  const broadcast = typeof c.broadcast === "string" && MAC_SHAPE.test(c.broadcast) ? c.broadcast : "FF:FF:FF:FF:FF:FF";
  const facts = (Array.isArray(c.facts) ? c.facts : []).filter((t): t is string => typeof t === "string" && t.length > 0);
  const t = c.task && typeof c.task === "object" ? (c.task as Record<string, unknown>) : null;
  const candidates: Candidate[] = [];
  for (const raw of t && Array.isArray(t.candidates) ? t.candidates : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.value === "string" && o.value) candidates.push({ value: o.value, why: str(o.why) });
  }
  return {
    example: c.example.toUpperCase(), broadcast: broadcast.toUpperCase(),
    broadcastLabel: str(c.broadcastLabel, "عنوان البث Broadcast"), normalLabel: str(c.normalLabel, "عنوان جهاز"),
    facts, hexDigits: str(c.hexDigits, "0 1 2 3 4 5 6 7 8 9 A B C D E F"),
    task: t && typeof t.prompt === "string" && candidates.length >= 2 ? { prompt: t.prompt, candidates } : undefined,
  };
}

export default function MacAddressAnatomy({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ group: -1, broadcast: false, pick: -1, epoch: 0 });
  const live = state.epoch === commands.reset ? state : { group: -1, broadcast: false, pick: -1, epoch: commands.reset };

  if (!cfg) return <p className="learning-mac-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const mac = live.broadcast ? cfg.broadcast : cfg.example;
  const groups = groupsOf(mac);
  const digits = groups.join("").length;
  const picked = cfg.task && live.pick >= 0 ? cfg.task.candidates[live.pick] : null;
  const pickedIsMac = picked ? MAC_SHAPE.test(picked.value) : false;

  const update = (patch: Partial<typeof state>, name: string, detail: Record<string, unknown>) => {
    setState({ ...live, ...patch, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name, detail });
  };

  return (
    <div className="learning-mac" data-reduced-motion={reducedMotion || undefined} data-broadcast={live.broadcast || undefined}>
      <div className="learning-mac-modes" role="radiogroup" aria-label="نوع العنوان">
        <button type="button" role="radio" aria-checked={!live.broadcast} className={"learning-mac-mode" + (!live.broadcast ? " is-active" : "")} onClick={() => update({ broadcast: false, group: -1 }, "mac-mode", { broadcast: false })}>{cfg.normalLabel}</button>
        <button type="button" role="radio" aria-checked={live.broadcast} className={"learning-mac-mode" + (live.broadcast ? " is-active" : "")} onClick={() => update({ broadcast: true, group: -1 }, "mac-mode", { broadcast: true })}>{cfg.broadcastLabel}</button>
      </div>

      {/* The address: an LTR row of six two-digit groups, each a real button. */}
      <div className="learning-mac-row" dir="ltr" role="group" aria-label={mac}>
        {groups.map((g, i) => (
          <span key={i} className="learning-mac-cell">
            {i > 0 && <span className="learning-mac-colon" aria-hidden="true">:</span>}
            <button type="button" className={"learning-mac-group" + (i === live.group ? " is-active" : "")} aria-pressed={i === live.group}
              aria-label={`المجموعة ${i + 1}: ${g}`} onClick={() => update({ group: i }, "mac-group", { index: i, value: g })}>
              <span className="learning-mac-value">{g}</span>
              <span className="learning-mac-index" aria-hidden="true">{i + 1}</span>
            </button>
          </span>
        ))}
      </div>

      <div className="learning-mac-detail" aria-live="polite">
        <p className="learning-mac-count">{groups.length} مجموعات × 2 = {digits} منزلة سداسية عشرية</p>
        {live.group >= 0 && <p className="learning-mac-line">المجموعة {live.group + 1}: <code dir="ltr">{groups[live.group]}</code> — المنزلتان <code dir="ltr">{groups[live.group][0]}</code> و <code dir="ltr">{groups[live.group][1]}</code></p>}
        {live.broadcast
          ? <p className="learning-mac-line is-broadcast"><code dir="ltr">{cfg.broadcast}</code>: كل المنازل F — {cfg.broadcastLabel}: الرسالة للجميع داخل الشبكة.</p>
          : <p className="learning-mac-line"><code dir="ltr">{cfg.example}</code>: {cfg.normalLabel} واحد.</p>}
      </div>

      <p className="learning-mac-hex">المنازل السداسية العشرية: <code dir="ltr">{cfg.hexDigits}</code></p>
      {cfg.facts.length > 0 && (
        <ul className="learning-mac-facts" aria-label="حقائق عنوان MAC">
          {cfg.facts.map(f => <li key={f}>{f}</li>)}
        </ul>
      )}

      {cfg.task && (
        <div className="learning-mac-task">
          <p className="learning-mac-task-prompt">{cfg.task.prompt}</p>
          <div className="learning-mac-task-options" role="radiogroup" aria-label={cfg.task.prompt}>
            {cfg.task.candidates.map((c, i) => (
              <button key={c.value} type="button" role="radio" aria-checked={i === live.pick}
                className={"learning-mac-option" + (i === live.pick ? (MAC_SHAPE.test(c.value) ? " is-right" : " is-wrong") : "")}
                onClick={() => update({ pick: i }, "mac-task", { value: c.value, right: MAC_SHAPE.test(c.value) })}>
                <span dir="ltr">{c.value}</span>
              </button>
            ))}
          </div>
          {picked && (
            <p className={"learning-mac-verdict " + (pickedIsMac ? "is-right" : "is-wrong")} role="status">
              {pickedIsMac ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح — {picked.why}</> : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — افحص الشكل: {picked.why}</>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
