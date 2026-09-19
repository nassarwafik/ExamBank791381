import { useMemo, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { LearningActivityProps } from "./engine";

/**
 * Units 7–8 phase — `interactive-diagram / broadcast-address / v1` (Book 791381 PDF 70).
 *
 * Strictly the book's whole-octet level (/8, /16, /24 only — never a general subnet calculator). Two parts:
 *   EXAMPLES — the book's rows: pick one and SEE which octets are NETWORK and which are HOST (text badges, never
 *              colour-only), then the resulting broadcast address with the rule «keep the network octets, make the
 *              host octets 255».
 *   PRACTICE — guided attempts: each octet is a real button that toggles between its value and 255; the student
 *              sets the host octets to 255 and presses «تحقّق». The verdict is immediate (icon + word) and a wrong
 *              attempt says exactly which octet to CHECK; «أظهر الحل» reveals the expected address for that item.
 * Keyboard + touch (≥44px), shell reset (epoch stamp), no timers, no network, no persistence. LTR address rows.
 */
type Item = { network: string; prefix: 8 | 16 | 24; octets: [number, number, number, number] };
type Config = { examples: Item[]; practice: Item[]; networkLabel: string; hostLabel: string; rule: string };

function parseItem(raw: unknown): Item | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.network !== "string" || (o.prefix !== 8 && o.prefix !== 16 && o.prefix !== 24)) return null;
  const parts = o.network.trim().split(".");
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return { network: o.network.trim(), prefix: o.prefix, octets: [Number(parts[0]), Number(parts[1]), Number(parts[2]), Number(parts[3])] };
}
function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const str = (k: string, fb: string) => (typeof c[k] === "string" ? (c[k] as string) : fb);
  const examples = (Array.isArray(c.examples) ? c.examples : []).map(parseItem).filter((x): x is Item => x !== null);
  const practice = (Array.isArray(c.practice) ? c.practice : []).map(parseItem).filter((x): x is Item => x !== null);
  if (examples.length === 0) return null;
  return { examples, practice, networkLabel: str("networkLabel", "شبكة"), hostLabel: str("hostLabel", "جهاز"), rule: str("rule", "") };
}
const netOctets = (prefix: number) => prefix / 8;
const broadcastOf = (item: Item) => item.octets.map((v, i) => (i < netOctets(item.prefix) ? v : 255)).join(".");

export default function BroadcastAddressBuilder({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ example: 0, item: 0, toggled: [false, false, false, false] as boolean[], checked: false, revealed: false, epoch: 0 });
  const fresh = { example: 0, item: 0, toggled: [false, false, false, false], checked: false, revealed: false, epoch: commands.reset };
  const live = state.epoch === commands.reset ? state : fresh;

  if (!cfg) return <p className="learning-bcast-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const ex = cfg.examples[Math.min(live.example, cfg.examples.length - 1)];
  const nEx = netOctets(ex.prefix);
  const item = cfg.practice.length ? cfg.practice[Math.min(live.item, cfg.practice.length - 1)] : null;
  const nIt = item ? netOctets(item.prefix) : 0;
  const attempt = item ? item.octets.map((v, i) => (live.toggled[i] ? 255 : v)) : [];
  const expected = item ? broadcastOf(item) : "";
  const wrongIndex = item ? item.octets.findIndex((_, i) => (i < nIt ? live.toggled[i] : !live.toggled[i])) : -1;
  const right = item ? wrongIndex === -1 : false;

  const update = (patch: Partial<typeof state>, name: string, detail: Record<string, unknown>) => {
    setState({ ...live, ...patch, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name, detail });
  };
  const toggle = (i: number) => {
    const toggled = live.toggled.map((t, j) => (j === i ? !t : t));
    update({ toggled, checked: false }, "bcast-toggle", { index: i, value: toggled[i] ? 255 : item!.octets[i] });
  };

  return (
    <div className="learning-bcast" data-reduced-motion={reducedMotion || undefined}>
      {/* Part 1 — the book's examples */}
      <div className="learning-bcast-examples" role="radiogroup" aria-label="أمثلة الكتاب">
        {cfg.examples.map((e, i) => (
          <button key={e.network + e.prefix} type="button" role="radio" aria-checked={i === live.example} className={"learning-bcast-chip" + (i === live.example ? " is-active" : "")}
            onClick={() => update({ example: i }, "bcast-example", { network: e.network, prefix: e.prefix })}>
            <span dir="ltr">{e.network} /{e.prefix}</span>
          </button>
        ))}
      </div>
      <div className="learning-bcast-row" dir="ltr" role="group" aria-label={`${ex.network} /${ex.prefix}`}>
        {ex.octets.map((v, i) => (
          <span key={i} className={"learning-bcast-cell " + (i < nEx ? "is-network" : "is-host")}>
            {i > 0 && <span className="learning-bcast-dot" aria-hidden="true">.</span>}
            <span className="learning-bcast-octet"><span className="learning-bcast-value">{v}</span><span className="learning-bcast-badge">{i < nEx ? cfg.networkLabel : cfg.hostLabel}</span></span>
          </span>
        ))}
      </div>
      <p className="learning-bcast-result" aria-live="polite">
        مع <code dir="ltr">/{ex.prefix}</code>: نبقي {nEx === 1 ? "القسم الأول" : nEx === 2 ? "القسمين الأولين" : "الأقسام الثلاثة الأولى"} (<code dir="ltr">{ex.octets.slice(0, nEx).join(".")}</code>) ونجعل {4 - nEx === 1 ? "القسم الأخير" : 4 - nEx === 2 ? "القسمين الأخيرين" : "الأقسام الثلاثة الأخيرة"} <code dir="ltr">255</code> — عنوان Broadcast: <code dir="ltr" className="learning-bcast-answer">{broadcastOf(ex)}</code>
      </p>
      {cfg.rule && <p className="learning-bcast-rule">{cfg.rule}</p>}

      {/* Part 2 — guided practice */}
      {item && (
        <div className="learning-bcast-task">
          <p className="learning-bcast-task-prompt">تدريب: ابنِ عنوان Broadcast — اضغط على كل قسم للجهاز لتجعله 255، ثم «تحقّق».</p>
          <div className="learning-bcast-items" role="radiogroup" aria-label="شبكة التدريب">
            {cfg.practice.map((p, i) => (
              <button key={p.network + p.prefix} type="button" role="radio" aria-checked={i === live.item} className={"learning-bcast-chip" + (i === live.item ? " is-active" : "")}
                onClick={() => update({ item: i, toggled: [false, false, false, false], checked: false, revealed: false }, "bcast-item", { network: p.network, prefix: p.prefix })}>
                <span dir="ltr">{p.network} /{p.prefix}</span>
              </button>
            ))}
          </div>
          <div className="learning-bcast-row is-practice" dir="ltr" role="group" aria-label={`${item.network} /${item.prefix}`}>
            {item.octets.map((_v, i) => (
              <span key={i} className="learning-bcast-cell">
                {i > 0 && <span className="learning-bcast-dot" aria-hidden="true">.</span>}
                <button type="button" className={"learning-bcast-toggle" + (live.toggled[i] ? " is-255" : "")} aria-pressed={live.toggled[i]} aria-label={`القسم ${i + 1}: ${attempt[i]}`} onClick={() => toggle(i)}>
                  <span className="learning-bcast-value">{attempt[i]}</span>
                  <span className="learning-bcast-badge">{live.toggled[i] ? "255" : "كما هو"}</span>
                </button>
              </span>
            ))}
          </div>
          <div className="learning-bcast-actions">
            <button type="button" className="eb-button is-primary learning-bcast-check" onClick={() => update({ checked: true }, "bcast-check", { attempt: attempt.join("."), right })}>تحقّق</button>
            <button type="button" className="eb-button is-quiet learning-bcast-reveal" aria-pressed={live.revealed} onClick={() => update({ revealed: !live.revealed }, "bcast-reveal", { revealed: !live.revealed })}>أظهر الحل</button>
          </div>
          {live.checked && (
            <p className={"learning-bcast-verdict " + (right ? "is-right" : "is-wrong")} role="status">
              {right
                ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح — <code dir="ltr">{attempt.join(".")}</code>: أقسام الشبكة كما هي وأقسام الجهاز 255.</>
                : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — افحص القسم {wrongIndex + 1}: {wrongIndex < nIt ? `هو قسم شبكة مع /${item.prefix} فيجب أن يبقى ${item.octets[wrongIndex]}.` : `هو قسم جهاز مع /${item.prefix} فيجب أن يصبح 255.`}</>}
            </p>
          )}
          {live.revealed && <p className="learning-bcast-solution">الحل: <code dir="ltr">{expected}</code> — مع <code dir="ltr">/{item.prefix}</code> {nIt === 1 ? "قسم واحد" : nIt === 2 ? "قسمان" : "ثلاثة أقسام"} للشبكة والباقي للجهاز.</p>}
        </div>
      )}
    </div>
  );
}
