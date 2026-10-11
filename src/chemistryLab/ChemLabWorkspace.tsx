import { useId, useMemo, useState } from "react";
import type { SmartSimWorkspaceProps } from "../trustedSim/smartSimUiRegistry";
import { CHEM_LAB_LIMITS, emptyStateFor, validateChemLabConfig, type ChemLabConfigV1, type ChemLabStateV1 } from "../chemistryLabModel";
import { CHEM_LAB_MAX_ACTIONS, type ChemLabAction } from "../chemistryLabPlugin";
import { resolveSmartSimPlugin } from "../trustedSimPlugins";
import { replaySmartSimActions } from "../trustedSimQuestion";
import { PhBench, RateBench, SolutionsBench, TitrationBench, type BenchProps } from "./LabBenches";
import { LabAnswers, LabRecord } from "./LabAnswers";
import { experimentTitle, isolateQuantities, ltr } from "./labView";
import "../chemistryStructure/chem.css";
import "./chemLab.css";

// Phase 21D-D.3 — the chemistryLab@1 STUDENT workspace (lazy; also the teacher preview). It renders ONLY the canonical public config.
//   * Every bench operation (choose a flask, weigh, pipette, make up, measure, add titrant, run a trial, record, reset) and every saved answer
//     is ONE semantic action replayed through the registered plugin — the code the server grades with. The server re-derives the state by
//     replay; the state emitted here is only a restore cache.
//   * Presentation is never recorded: the time cursor of the rate lab, which plot or explanation is open, the typed draft of an answer.
//   * Answers are kept apart from the lab: saving an answer replaces that task's earlier answer and never touches the bench.
// The page is RTL; formulas, units and numbers are LTR islands.
const replayState = (cfg: ChemLabConfigV1, actions: readonly unknown[]): { ok: true; state: ChemLabStateV1 } | { ok: false } => {
  const plugin = resolveSmartSimPlugin("chemistryLab", 1), r = plugin ? replaySmartSimActions(plugin, cfg, actions) : null;
  return r && r.ok ? { ok: true, state: r.state as ChemLabStateV1 } : { ok: false };
};
type Act = { type?: unknown; taskId?: unknown };
const isAnswer = (a: unknown): boolean => { const t = (a as Act | null)?.type; return typeof t === "string" && t.startsWith("answer."); };
/** Setters whose repetition replaces the previous one (the intermediate choice has no effect): the action list stays short. */
const SETTERS: ReadonlySet<string> = new Set(["solution.flask", "solution.mass", "solution.pipette", "titration.indicator"]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function ChemLabWorkspace({ config, actions, onChange, disabled, label }: SmartSimWorkspaceProps) {
  const cfg = useMemo<ChemLabConfigV1 | null>(() => { const r = validateChemLabConfig(config); return r.ok ? r.config : null; }, [config]);
  const replay = useMemo(() => (cfg ? replayState(cfg, actions) : null), [cfg, actions]);
  const [announce, setAnnounce] = useState("");
  const [confirm, setConfirm] = useState(false);
  const uid = "clab" + useId().replace(/[^A-Za-z0-9_-]/g, "");
  if (!cfg) return <p className="ncli-unavailable" role="note" data-testid="clab-unavailable">إعداد المختبر الكيميائي لهذا السؤال غير متوفر في هذا الإصدار.</p>;
  const restored = !!replay && replay.ok;
  const state: ChemLabStateV1 = replay && replay.ok ? replay.state : emptyStateFor(cfg);
  const base = restored ? [...actions] : [];
  const emit = (next: unknown[]) => { const r = replayState(cfg, next); if (r.ok) onChange(next, r.state); return r.ok; };
  const atLimit = base.length >= CHEM_LAB_MAX_ACTIONS;
  const act = (a: ChemLabAction, message: string) => {
    if (disabled) return;
    if (atLimit) { setAnnounce("بلغت الحد الأقصى لعدد العمليات المحفوظة (" + CHEM_LAB_MAX_ACTIONS + ")؛ لا تُحفظ عمليات جديدة."); return; }
    const last = base[base.length - 1] as Act | undefined;
    const next = SETTERS.has(a.type) && last?.type === a.type ? [...base.slice(0, -1), a] : [...base, a];
    const r = replayState(cfg, next);
    if (!r.ok) { setAnnounce("تعذّر تنفيذ العملية."); return; }
    if (same(r.state, state)) { setAnnounce("لم يتغير شيء في التجربة."); return; }
    onChange(next, r.state);
    setAnnounce(message);
  };
  const answer = (taskId: string, a: ChemLabAction | null, message: string) => {
    if (disabled) return;
    const next = [...base.filter(x => !(isAnswer(x) && (x as Act).taskId === taskId)), ...(a ? [a] : [])];
    if (next.length > CHEM_LAB_MAX_ACTIONS) { setAnnounce("بلغت الحد الأقصى لعدد العمليات المحفوظة؛ لم تُحفظ الإجابة."); return; }
    if (emit(next)) setAnnounce(message);
  };
  const recordFull = state.observations.length >= CHEM_LAB_LIMITS.observations;
  const bench: BenchProps = { cfg, state, disabled, act, recordFull, uid };
  const kind = cfg.experiment.kind;
  return (
    <div className="chem clab" dir="rtl" data-testid="clab-workspace" data-experiment={kind} aria-label={(label ? label + " — " : "") + "المختبر الكيميائي الافتراضي"}>
      <header className="clab-head">
        <h3 className="clab-h">{experimentTitle(cfg)}</h3>
        <p className="chem-help clab-disclaimer">محاكاة افتراضية للتعلّم مبنية على نموذج علمي مبسّط ({ltr("25 °C")}، محاليل مثالية)، وليست دليلًا لإجراء تجارب حقيقية؛ لا تُجرِ أي تجربة دون إشراف مختص.</p>
        {actions.length > 0 && !restored && <p className="chem-error" role="alert">تعذّر استعادة العمليات السابقة لهذا السؤال؛ بدأت التجربة من جديد.</p>}
      </header>
      {kind === "solutions" && <SolutionsBench {...bench} />}
      {kind === "ph" && <PhBench {...bench} />}
      {kind === "titration" && <TitrationBench {...bench} />}
      {kind === "rate" && <RateBench {...bench} />}
      <p className="clab-status" role="status" aria-live="polite" data-testid="clab-status">{isolateQuantities(announce)}</p>
      <LabRecord cfg={cfg} state={state} limit={CHEM_LAB_LIMITS.observations} />
      <LabAnswers cfg={cfg} state={state} disabled={disabled} uid={uid}
        onNumber={(taskId, value, unit) => answer(taskId, { type: "answer.number", taskId, value, unit }, "حُفظت الإجابة.")}
        onChoice={(taskId, options) => answer(taskId, { type: "answer.choose", taskId, options }, "حُفظ الاختيار.")}
        onClear={taskId => answer(taskId, null, "مُسحت الإجابة.")} />
      {!disabled && (
        <div className="chem-row">
          {confirm
            ? <><button type="button" className="is-danger" data-testid="clab-reset-all-confirm" onClick={() => { setConfirm(false); emit([]); setAnnounce("بدأت التجربة من جديد: مُسحت الأدوات والسجل والإجابات."); }}>تأكيد البدء من جديد (يمسح السجل والإجابات)</button>
              <button type="button" className="is-secondary" onClick={() => setConfirm(false)}>إلغاء</button></>
            : <button type="button" className="is-secondary" data-testid="clab-reset-all" disabled={base.length === 0} onClick={() => setConfirm(true)}>البدء من جديد</button>}
        </div>
      )}
    </div>
  );
}
