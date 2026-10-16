import type { StructuredExam } from "../examTypes";
import type { ExamSaveState } from "../examHistory";
import type { FinalizationDecision } from "../examFinalization";
import type { ToolbarItem } from "../builder/BuilderToolbar";
import { SAVE_LABELS } from "../teacher/saveLabels";
import { IconCheck, IconSave, IconHistory, IconAssignments, IconWarning } from "../icons";
import { publishTimeline, type PublishStageKey } from "./studioPublishState";
import type { StudioStepKey } from "./studioSteps";

// Phase 21F.7 — the Studio's publish step: where the exam stands (saved on the server · ready · final · assigned) and the ONE next
// action for it. Saving and finalizing are the builder's handlers (the final save re-checks the latest exam and opens the readiness
// panel on a refusal; the owner applies the same authority again); revisions are the governance panel; assigning is the existing
// assignments workspace, reached through the builder's unsaved-work guard.

type Props = {
  exam: StructuredExam;
  decision: FinalizationDecision;
  saveState?: ExamSaveState;
  saving: boolean;
  mediaPending: boolean;
  mediaWait: string;
  onSaveDraft?: () => void;
  onFinalize?: () => void;
  onAssign?: () => void;
  tools: readonly ToolbarItem[];
  onStep: (step: StudioStepKey) => void;
};

const STAGE_TEXT: Record<PublishStageKey, { title: string; done: string; todo: string }> = {
  saved: { title: "مسودة محفوظة على الخادم", done: "يحفظ الخادم ما تراه الآن.", todo: "توجد تغييرات لم تُحفظ على الخادم بعد." },
  ready: { title: "جاهز للاعتماد", done: "لا عوائق تمنع الاعتماد النهائي.", todo: "أصلح العوائق التي تمنع الاعتماد النهائي." },
  final: { title: "معتمد نهائيًا", done: "الامتحان معتمد ومحفوظ؛ حفظه كمسودة يعيده مسودة.", todo: "يُعتمد بعد الحفظ وإصلاح العوائق." },
  assigned: { title: "إسناد للطلاب", done: "", todo: "أنشئ واجبًا من هذا الامتحان في مساحة الواجبات." }
};

export default function StudioPublish({ exam, decision, saveState, saving, mediaPending, mediaWait, onSaveDraft, onFinalize, onAssign, tools, onStep }: Props) {
  const timeline = publishTimeline({ saveState: saving ? "saving" : saveState, canFinalize: decision.canFinalize, final: exam.status === "final" });
  const governance = tools.find(t => t.key === "governance" && !t.disabled);
  const busy = saving || mediaPending;
  const action = (key: PublishStageKey) => {
    if (key === "saved" && onSaveDraft) return <button type="button" className="st-btn is-primary" onClick={onSaveDraft} disabled={busy} title={mediaPending ? mediaWait : undefined}><IconSave size={16} aria-hidden="true" />{saving ? SAVE_LABELS.saving : SAVE_LABELS.saveDraft}</button>;
    if (key === "ready") return <button type="button" className="st-btn is-primary" onClick={() => onStep("review")}><IconWarning size={16} aria-hidden="true" />مراجعة العوائق ({decision.blockers.length})</button>;
    if (key === "final" && onFinalize) return <button type="button" className="st-btn is-primary" onClick={onFinalize} disabled={busy} aria-disabled={!decision.canFinalize || undefined}><IconCheck size={16} aria-hidden="true" />{SAVE_LABELS.finalizeExam}</button>;
    if (key === "assigned" && onAssign) return <button type="button" className="st-btn is-primary" onClick={onAssign}><IconAssignments size={16} aria-hidden="true" />الانتقال إلى الواجبات</button>;
    return null;
  };
  return (
    <div className="st-step-view st-publish" data-studio-step="publish">
      <div className="st-step-grid">
        <header className="st-step-head">
          <div>
            <h2>النشر</h2>
            <p>احفظ الامتحان، واعتمده نهائيًا بعد المراجعة، ثم أسنده إلى طلابك.</p>
          </div>
          <div className="st-row-actions">
            <button type="button" className="st-btn" onClick={() => onStep("review")}>العودة إلى المراجعة</button>
          </div>
        </header>
        <div className="st-cols is-two">
          <section className="st-panel" aria-labelledby="st-publish-state">
            <h3 id="st-publish-state">حالة الامتحان</h3>
            <ol className="st-timeline" aria-label="مراحل النشر">
              {timeline.map((s, i) => (
                <li key={s.key} className={"st-tl" + (s.state === "done" ? " is-done" : s.state === "now" ? " is-now" : "")} data-stage={s.key} data-stage-state={s.state} aria-current={s.state === "now" ? "step" : undefined}>
                  <span className="st-tl-dot" aria-hidden="true">{s.state === "done" ? <IconCheck size={14} /> : i + 1}</span>
                  <div className="st-tl-body">
                    <b>{STAGE_TEXT[s.key].title}<span className="st-visually-hidden">{s.state === "done" ? " (تم)" : s.state === "now" ? " (الخطوة الحالية)" : " (لاحقًا)"}</span></b>
                    <span>{s.state === "done" ? STAGE_TEXT[s.key].done : STAGE_TEXT[s.key].todo}</span>
                    {s.state === "now" && <div className="st-tl-action">{action(s.key)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <div className="st-review-side">
            <section className="st-panel" aria-labelledby="st-publish-final">
              <h3 id="st-publish-final">الاعتماد النهائي</h3>
              <p className="st-sub">{decision.canFinalize
                ? "يمكن اعتماد الامتحان. الاعتماد يتحقق من آخر نسخة مرة أخرى قبل الحفظ."
                : "الاعتماد غير متاح بعد: " + decision.blockers.length + " عائق. أصلحها من خطوة المراجعة."}</p>
              <div className="st-row-actions">
                {onSaveDraft && <button type="button" className="st-btn" onClick={onSaveDraft} disabled={busy}><IconSave size={16} aria-hidden="true" />{saving ? SAVE_LABELS.saving : SAVE_LABELS.saveDraft}</button>}
                {onFinalize && <button type="button" className={"st-btn is-primary" + (decision.canFinalize ? "" : " is-gated")} onClick={onFinalize} disabled={busy} aria-disabled={!decision.canFinalize || undefined}><IconCheck size={16} aria-hidden="true" />{SAVE_LABELS.finalizeExam}</button>}
              </div>
            </section>
            {governance && (
              <section className="st-panel" aria-labelledby="st-publish-gov">
                <h3 id="st-publish-gov">الإصدارات والمراجعة</h3>
                <p className="st-sub">إرسال الامتحان للمراجعة، والإصدارات المنشورة وسجلها.</p>
                <div className="st-row-actions">
                  <button type="button" className="st-btn" onClick={governance.onSelect} aria-haspopup="dialog"><IconHistory size={16} aria-hidden="true" />{governance.label}</button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
