import { useMemo, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { LearningActivityProps } from "./engine";

/**
 * Units 7–8 phase — `interactive-diagram / cable-comparison / v1` (Book 791381 PDF 62–63).
 *
 * Two small steps. (1) COMPARE: the student presses one of the four cable tabs (UTP / STP / Fiber Optic / Coaxial)
 * and sees a simple cross-section glyph plus the book's own traits for that cable — a TEXT list, never colour-only.
 * (2) CHOOSE: the student picks a scenario (teacher-enrichment) and then the cable they think fits; the verdict is
 * immediate (icon + word) and explains WHY with the book's trait. Wrong picks say what to check; the student can try
 * again. Nothing beyond the source: no categories, speeds, lengths or prices — only the traits in `config`.
 * Real <button>s (keyboard + touch, ≥44px, aria-pressed / radio semantics), shell reset (epoch stamp), no timers,
 * no network, no persistence, native SVG only. All wording comes from the block's `config`.
 */
type CableKind = "pair" | "fiber" | "coaxial";
type Cable = { id: string; name: string; title: string; traits: string[]; shield: boolean; kind: CableKind };
type Scenario = { id: string; prompt: string; answer: string; why: string };
type Config = { cables: Cable[]; scenarios: Scenario[]; rule: string; scenarioNote: string };

function readConfig(config: unknown): Config | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
  const cables: Cable[] = [];
  for (const raw of Array.isArray(c.cables) ? c.cables : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const traits = (Array.isArray(o.traits) ? o.traits : []).filter((t): t is string => typeof t === "string" && t.length > 0);
    if (typeof o.id !== "string" || !o.id || typeof o.name !== "string" || !o.name || traits.length === 0) continue;
    const kind: CableKind = o.kind === "fiber" || o.kind === "coaxial" ? o.kind : "pair";
    cables.push({ id: o.id, name: o.name, title: str(o.title, o.name), traits, shield: o.shield === true, kind });
  }
  const ids = new Set(cables.map(x => x.id));
  const scenarios: Scenario[] = [];
  for (const raw of Array.isArray(c.scenarios) ? c.scenarios : []) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.prompt !== "string" || typeof o.answer !== "string" || !ids.has(o.answer)) continue;
    scenarios.push({ id: o.id, prompt: o.prompt, answer: o.answer, why: str(o.why) });
  }
  if (cables.length < 2) return null;
  return { cables, scenarios, rule: str(c.rule), scenarioNote: str(c.scenarioNote) };
}

/** A schematic cross-section per cable kind (decorative; the traits list is the accessible content). */
function CableGlyph({ cable }: { cable: Cable }) {
  return (
    <svg className="learning-cable-glyph" viewBox="0 0 160 56" aria-hidden="true" focusable="false">
      <rect x="4" y="12" width="152" height="32" rx="16" className="learning-cable-jacket" />
      {cable.shield && <rect x="10" y="17" width="140" height="22" rx="11" className="learning-cable-shield" />}
      {cable.kind === "pair" && (
        <>
          <path d="M22 28 c 12 -12, 24 12, 36 0 s 24 -12, 36 0 s 24 12, 36 0" className="learning-cable-wire" />
          <path d="M22 28 c 12 12, 24 -12, 36 0 s 24 12, 36 0 s 24 -12, 36 0" className="learning-cable-wire is-second" />
        </>
      )}
      {cable.kind === "fiber" && (
        <>
          <line x1="20" y1="28" x2="140" y2="28" className="learning-cable-core is-glass" />
          {[40, 70, 100].map(x => <circle key={x} cx={x} cy="28" r="3" className="learning-cable-light" />)}
        </>
      )}
      {cable.kind === "coaxial" && (
        <>
          <rect x="20" y="22" width="120" height="12" rx="6" className="learning-cable-dielectric" />
          <line x1="24" y1="28" x2="136" y2="28" className="learning-cable-core is-copper" />
        </>
      )}
    </svg>
  );
}

export default function CableComparisonDiagram({ block, reducedMotion, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readConfig(block.config), [block.config]);
  const [state, setState] = useState({ cable: 0, scenario: -1, pick: "", epoch: 0 });
  const live = state.epoch === commands.reset ? state : { cable: 0, scenario: -1, pick: "", epoch: commands.reset };

  if (!cfg) return <p className="learning-cable-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const cable = cfg.cables[Math.min(live.cable, cfg.cables.length - 1)];
  const scenario = live.scenario >= 0 ? cfg.scenarios[live.scenario] : null;
  const picked = scenario && live.pick ? cfg.cables.find(x => x.id === live.pick) ?? null : null;
  const right = Boolean(scenario && picked && picked.id === scenario.answer);
  const expected = scenario ? cfg.cables.find(x => x.id === scenario.answer) : null;

  const update = (patch: Partial<typeof state>, name: string, detail: Record<string, unknown>) => {
    setState({ ...live, ...patch, epoch: commands.reset });
    emit({ type: "interaction", activityId: block.id, name, detail });
  };

  return (
    <div className="learning-cable" data-reduced-motion={reducedMotion || undefined} data-cable={cable.id}>
      {/* Step 1 — compare */}
      <div className="learning-cable-tabs" role="tablist" aria-label="أنواع الكوابل">
        {cfg.cables.map((c, i) => (
          <button key={c.id} type="button" role="tab" aria-selected={i === live.cable} className={"learning-cable-tab" + (i === live.cable ? " is-active" : "")}
            onClick={() => update({ cable: i }, "cable-compare", { cable: c.id })}>
            <span className="learning-cable-tab-name" dir="ltr">{c.name}</span>
            <span className="learning-cable-tab-title">{c.title}</span>
          </button>
        ))}
      </div>
      <div className="learning-cable-card" role="tabpanel" aria-label={cable.name}>
        <CableGlyph cable={cable} />
        <div className="learning-cable-detail">
          <p className="learning-cable-title"><span dir="ltr">{cable.name}</span> <span className="learning-cable-badge">{cable.shield ? "محمي" : cable.kind === "fiber" ? "ينقل الضوء" : cable.kind === "coaxial" ? "موصّل واحد في المنتصف" : "غير محمي"}</span></p>
          <ul className="learning-cable-traits" aria-label={`صفات ${cable.name}`}>
            {cable.traits.map(t => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>
      {cfg.rule && <p className="learning-cable-rule">{cfg.rule}</p>}

      {/* Step 2 — choose the cable for a scenario */}
      {cfg.scenarios.length > 0 && (
        <div className="learning-cable-task">
          <p className="learning-cable-task-prompt">اختر سيناريو، ثم اختر الكابل الأنسب له:</p>
          <div className="learning-cable-scenarios" role="radiogroup" aria-label="السيناريو">
            {cfg.scenarios.map((s, i) => (
              <button key={s.id} type="button" role="radio" aria-checked={i === live.scenario} className={"learning-cable-scenario" + (i === live.scenario ? " is-active" : "")}
                onClick={() => update({ scenario: i, pick: "" }, "cable-scenario", { scenario: s.id })}>
                <span className="learning-cable-scenario-no" aria-hidden="true">{i + 1}</span>{s.prompt}
              </button>
            ))}
          </div>
          {scenario && (
            <div className="learning-cable-choices" role="radiogroup" aria-label="الكابل الأنسب">
              {cfg.cables.map(c => (
                <button key={c.id} type="button" role="radio" aria-checked={live.pick === c.id}
                  className={"learning-cable-choice" + (live.pick === c.id ? (c.id === scenario.answer ? " is-right" : " is-wrong") : "")}
                  onClick={() => update({ pick: c.id }, "cable-pick", { scenario: scenario.id, cable: c.id, right: c.id === scenario.answer })}>
                  <span dir="ltr">{c.name}</span>
                </button>
              ))}
            </div>
          )}
          {scenario && picked && (
            <p className={"learning-cable-verdict " + (right ? "is-right" : "is-wrong")} role="status">
              {right
                ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح — {scenario.why}</>
                : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — افحص صفات <span dir="ltr">{picked.name}</span>: {picked.traits.join("، ")}. أعد النظر في ما يحتاجه السيناريو{expected ? "" : ""}.</>}
            </p>
          )}
          {cfg.scenarioNote && <p className="learning-cable-note">{cfg.scenarioNote}</p>}
        </div>
      )}
    </div>
  );
}
