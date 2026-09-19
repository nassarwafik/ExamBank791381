import { useMemo, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { LearningActivityProps } from "./engine";

/**
 * Units 4–6 phase — `interactive-diagram / cidr-network-host / v1` (Book 791381 PDF 40).
 *
 * The student picks one of the page's example addresses and a book-level prefix (/8, /16 or /24) and SEES which
 * octets belong to the NETWORK part and which to the HOST part: each octet cell carries a text badge («شبكة» /
 * «جهاز») and a bracket, so the grouping is never colour-only; the detail line names both parts as LTR tokens.
 * A small guided task then asks for another valid host address in the SAME network (three candidates: the right
 * one keeps the network part and changes the host part; the distractors change a network octet or repeat the
 * address). Strictly the book's level: whole-octet prefixes only — no arbitrary-bit subnetting, no binary.
 * Real <button>s (keyboard + touch, ≥44px, aria-pressed / radio semantics), reduced-motion contract, shell reset,
 * no network, no persistence. All wording comes from the block's `config`; the component holds no book text.
 */
type Example = { address: string; label: string; octets: [number, number, number, number] };
type Config = {
  examples: Example[];
  prefixes: number[];
  initialPrefix: number;
  networkLabel: string;
  hostLabel: string;
  note: string;
  task?: { prompt: string; pick: string };
};

function parseOctets(address: unknown): [number, number, number, number] | null {
  if (typeof address !== "string") return null;
  const parts = address.trim().split(".");
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const examples: Example[] = [];
  for (const e of Array.isArray(c.examples) ? c.examples : []) {
    const o = e as Record<string, unknown>;
    const octets = parseOctets(o?.address);
    if (octets) examples.push({ address: String(o.address).trim(), label: typeof o.label === "string" ? o.label : String(o.address), octets });
  }
  const prefixes = (Array.isArray(c.prefixes) ? c.prefixes : []).filter((p): p is number => p === 8 || p === 16 || p === 24);
  if (examples.length === 0 || prefixes.length === 0) return null;
  const initialPrefix = prefixes.includes(c.initialPrefix as number) ? (c.initialPrefix as number) : prefixes[prefixes.length - 1];
  const str = (k: string, fb: string) => (typeof c[k] === "string" ? (c[k] as string) : fb);
  const task = c.task && typeof c.task === "object" ? (c.task as Record<string, unknown>) : null;
  return {
    examples, prefixes, initialPrefix,
    networkLabel: str("networkLabel", "شبكة"), hostLabel: str("hostLabel", "جهاز"), note: str("note", ""),
    task: task && typeof task.prompt === "string" ? { prompt: task.prompt, pick: typeof task.pick === "string" ? task.pick : "اختر" } : undefined,
  };
}

const octetsOf = (n: number) => n / 8;   // book level: /8 → 1 octet, /16 → 2, /24 → 3

/** Deterministic candidate list for the "another device in the same network" task. */
function candidates(ex: Example, prefix: number): { address: string; right: boolean; why: string }[] {
  const n = octetsOf(prefix);
  const o = ex.octets;
  const bump = (v: number) => (v >= 254 ? v - 1 : v + 1);
  const same = [...o] as number[]; same[3] = bump(o[3]);                    // same network part, different host part
  const other = [...o] as number[]; other[n - 1] = bump(o[n - 1]);         // a network octet changed
  const list = [
    { address: same.join("."), right: true, why: "جزء الشبكة كما هو، وجزء الجهاز مختلف." },
    { address: other.join("."), right: false, why: "تغيّر قسم من جزء الشبكة، فهذا جهاز في شبكة أخرى." },
    { address: ex.address, right: false, why: "هذا هو العنوان نفسه؛ لا يجوز إعطاء العنوان ذاته لجهازين." },
  ];
  const rot = (n + ex.octets[3]) % 3;                                        // stable, example-dependent order
  return [...list.slice(rot), ...list.slice(0, rot)];
}

export default function CidrNetworkHostDiagram({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ example: 0, prefix: 0, pick: -1, epoch: 0 });
  const live = state.epoch === commands.reset ? state : { example: 0, prefix: 0, pick: -1, epoch: commands.reset };

  if (!cfg) return <p className="learning-cidr-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const ex = cfg.examples[Math.min(live.example, cfg.examples.length - 1)];
  const prefix = live.prefix === 0 ? cfg.initialPrefix : live.prefix;
  const n = octetsOf(prefix);
  const networkPart = ex.octets.slice(0, n).join(".");
  const hostPart = ex.octets.slice(n).join(".");
  const options = cfg.task ? candidates(ex, prefix) : [];
  const picked = live.pick >= 0 ? options[live.pick] : null;

  const update = (patch: Partial<typeof state>, name: string, detail: Record<string, unknown>) => {
    setState({ ...live, ...patch, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name, detail });
  };

  return (
    <div className="learning-cidr" data-reduced-motion={reducedMotion || undefined} data-prefix={prefix}>
      {cfg.examples.length > 1 && (
        <div className="learning-cidr-examples" role="group" aria-label="أمثلة العناوين">
          {cfg.examples.map((e, i) => (
            <button key={e.address} type="button" className={"learning-cidr-chip" + (i === live.example ? " is-active" : "")} aria-pressed={i === live.example}
              onClick={() => update({ example: i, pick: -1 }, "cidr-example", { address: e.address })}>
              <span className="learning-cidr-chip-label">{e.label}</span>
              <span className="learning-cidr-chip-addr" dir="ltr">{e.address}</span>
            </button>
          ))}
        </div>
      )}

      <div className="learning-cidr-prefixes" role="radiogroup" aria-label="القناع بصيغة CIDR">
        {cfg.prefixes.map(p => (
          <button key={p} type="button" role="radio" aria-checked={p === prefix} className={"learning-cidr-prefix" + (p === prefix ? " is-active" : "")}
            onClick={() => update({ prefix: p, pick: -1 }, "cidr-prefix", { prefix: p })}>
            <span dir="ltr">/{p}</span>
            <span className="learning-cidr-prefix-sub">{octetsOf(p) === 1 ? "قسم واحد للشبكة" : octetsOf(p) === 2 ? "قسمان للشبكة" : "ثلاثة أقسام للشبكة"}</span>
          </button>
        ))}
      </div>

      {/* The address: an LTR row of four octets, each tagged NETWORK or HOST with a text badge + a bracket. */}
      <div className="learning-cidr-row" dir="ltr" role="group" aria-label={`${ex.address} /${prefix}`}>
        {ex.octets.map((v, i) => {
          const isNet = i < n;
          return (
            <span key={i} className={"learning-cidr-cell " + (isNet ? "is-network" : "is-host")}>
              {i > 0 && <span className="learning-cidr-dot" aria-hidden="true">.</span>}
              <span className="learning-cidr-octet">
                <span className="learning-cidr-value">{v}</span>
                <span className="learning-cidr-badge">{isNet ? cfg.networkLabel : cfg.hostLabel}</span>
              </span>
            </span>
          );
        })}
      </div>
      <div className="learning-cidr-brackets" dir="ltr" aria-hidden="true">
        <span className="learning-cidr-bracket is-network" style={{ flex: n }}>{cfg.networkLabel}</span>
        <span className="learning-cidr-bracket is-host" style={{ flex: 4 - n }}>{cfg.hostLabel}</span>
      </div>

      <div className="learning-cidr-detail" aria-live="polite">
        <p className="learning-cidr-line"><span className="learning-cidr-tag">جزء الشبكة</span><code dir="ltr">{networkPart}</code></p>
        <p className="learning-cidr-line"><span className="learning-cidr-tag">جزء الجهاز</span><code dir="ltr">{hostPart}</code></p>
        <p className="learning-cidr-sentence">مع <code dir="ltr">/{prefix}</code> يخص {octetsOf(prefix) === 1 ? "القسم الأول" : octetsOf(prefix) === 2 ? "القسمان الأولان" : "الأقسام الثلاثة الأولى"} الشبكة، والباقي للجهاز.</p>
      </div>

      {cfg.task && (
        <div className="learning-cidr-task">
          <p className="learning-cidr-task-prompt">{cfg.task.prompt}</p>
          <div className="learning-cidr-task-options" role="radiogroup" aria-label={cfg.task.prompt}>
            {options.map((o, i) => (
              <button key={o.address} type="button" role="radio" aria-checked={i === live.pick}
                className={"learning-cidr-option" + (i === live.pick ? (o.right ? " is-right" : " is-wrong") : "")}
                onClick={() => update({ pick: i }, "cidr-task", { address: o.address, right: o.right })}>
                <span dir="ltr">{o.address}</span>
              </button>
            ))}
          </div>
          {picked && (
            <p className={"learning-cidr-verdict " + (picked.right ? "is-right" : "is-wrong")} role="status">
              {picked.right ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح — {picked.why}</> : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — {picked.why}</>}
            </p>
          )}
        </div>
      )}

      {cfg.note && <p className="learning-cidr-note">{cfg.note}</p>}
    </div>
  );
}
