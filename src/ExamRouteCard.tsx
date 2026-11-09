import { useId } from "react";
import "./exam-route.css";
import type { ComposerPrefill, ExamRoute, ExamRouteDecision } from "./examRequestRouting";

// Phase 21I — «كيف سيُبنى هذا الامتحان؟»: the result of analysing the free prompt. It names the subject the request is about, explains
// (in the teacher's words) why the request goes to the classified bank or to the AI Full Exam Composer, lets the teacher switch between the
// routes the code allows, and — on the composer route — shows what the composer form will be pre-filled with. Nothing is generated from
// here: «فتح المؤلف الذكي» opens a NEW structured exam with the composer dialog filled in, and the teacher presses «توليد» there.

const ROUTE_TEXT: Record<ExamRoute, { title: string; body: string }> = {
  bank: {
    title: "اختيار الأسئلة من مخزن الأسئلة المصنف",
    body: "أسئلة جاهزة ومصنفة من امتحانات 791381 ومن أسئلتك الخاصة — شبكات الاتصال فقط. تراجع الفلاتر ثم تنشئ الامتحان."
  },
  composer: {
    title: "تأليف امتحان جديد بالمؤلف الذكي",
    body: "امتحان منظّم لأي موضوع: برمجة، فيزياء، كيمياء، رياضيات وغيرها، بأنواع الأسئلة الحديثة (برمجة، محاكاة، معطيات متغيرة، إجابة مفتوحة بسلّم تقييم). تراجعه وتعدّله قبل الحفظ."
  }
};
const DIFFICULTY: Record<ComposerPrefill["difficulty"], string> = { easy: "سهل", medium: "متوسط", hard: "صعب", mixed: "متنوع" };
const LANGUAGE: Record<ComposerPrefill["language"], string> = { ar: "العربية", en: "الإنجليزية", he: "العبرية" };
const CAPABILITY: Record<string, string> = { coding: "أسئلة برمجة", smartSim: "محاكاة SmartSim", parametric: "معطيات متغيرة لكل طالب", charts: "رسوم بيانية" };

type Props = {
  decision: ExamRouteDecision;
  prefill: ComposerPrefill | null;
  activeRoute: ExamRoute;
  onChangeRoute: (route: ExamRoute) => void;
  onOpenComposer: () => void;
  busy?: boolean;
};

export default function ExamRouteCard({ decision, prefill, activeRoute, onChangeRoute, onOpenComposer, busy = false }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const headingId = "exam-route-title-" + uid;
  const enabledCaps = prefill ? Object.entries(prefill.capabilities).filter(([, on]) => on).map(([k]) => CAPABILITY[k] ?? k) : [];
  return (
    <section id="exam-route-panel" className="builder-card exam-route-card" aria-labelledby={headingId} data-route={activeRoute} data-domain={decision.domain}>
      <div className="builder-heading">
        <div>
          <h2 id={headingId}>كيف سيُبنى هذا الامتحان؟</h2>
          <p>
            موضوع الطلب: <strong>{decision.subjectLabel}</strong>
            {decision.subjectLabel !== decision.domainLabel && <> ({decision.domainLabel})</>}
          </p>
        </div>
      </div>

      {decision.needsConfirmation && (
        <p className="platform-warning exam-route-confirm" role="status">
          لم نتأكد من موضوع الطلب بدقة. راجع الموضوع ومصدر الأسئلة أدناه قبل المتابعة.
        </p>
      )}

      {decision.reasons.length > 0 && (
        <ul className="exam-route-reasons">
          {decision.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      )}

      <fieldset className="exam-route-options">
        <legend>مصدر الأسئلة</legend>
        {decision.allowedRoutes.map(route => (
          <label key={route} className={"exam-route-option" + (activeRoute === route ? " is-active" : "")}>
            <input type="radio" name={"exam-route-" + uid} value={route} checked={activeRoute === route} disabled={busy} onChange={() => onChangeRoute(route)} />
            <span>
              <strong>{ROUTE_TEXT[route].title}{route === decision.route && <span className="exam-route-recommended"> — المقترح</span>}</strong>
              <small>{ROUTE_TEXT[route].body}</small>
            </span>
          </label>
        ))}
        {!decision.allowedRoutes.includes("bank") && (
          <p className="exam-route-note">مخزن الأسئلة المصنف لا يحتوي أسئلة «{decision.domainLabel}»، لذلك لا يُعرض خيار المخزن لهذا الطلب.</p>
        )}
      </fieldset>

      {activeRoute === "composer" && (
        prefill ? (
          <div className="exam-route-composer">
            <h3>ما سيُعبّأ في نموذج المؤلف الذكي</h3>
            <dl className="exam-route-summary">
              <div><dt>المادة</dt><dd>{prefill.subject}</dd></div>
              {prefill.grade && <div><dt>الصف</dt><dd>{prefill.grade}</dd></div>}
              {prefill.course && <div><dt>المساق</dt><dd>{prefill.course}</dd></div>}
              <div><dt>اللغة</dt><dd>{LANGUAGE[prefill.language]}</dd></div>
              <div><dt>مجموع العلامات</dt><dd>{prefill.totalMarks}</dd></div>
              <div><dt>عدد الأسئلة</dt><dd>{prefill.questionTarget ?? "يقترحه المؤلف"}</dd></div>
              <div><dt>الصعوبة</dt><dd>{DIFFICULTY[prefill.difficulty]}</dd></div>
              {prefill.durationMinutes && <div><dt>المدة</dt><dd>{prefill.durationMinutes} دقيقة</dd></div>}
              {prefill.requiredTopics.length > 0 && <div><dt>المواضيع</dt><dd>{prefill.requiredTopics.join("، ")}</dd></div>}
              {enabledCaps.length > 0 && <div><dt>ميزات مفعّلة</dt><dd>{enabledCaps.join("، ")}</dd></div>}
            </dl>
            {prefill.notes.length > 0 && (
              <ul className="exam-route-notes">
                {prefill.notes.map((note, i) => <li key={i}>{note}</li>)}
              </ul>
            )}
            <div className="exam-route-actions">
              <button type="button" className="generate-button" onClick={onOpenComposer} disabled={busy}>
                فتح المؤلف الذكي بهذا الطلب
              </button>
              <span className="helper-text">
                يفتح امتحانًا منظّمًا جديدًا ونموذج المؤلف الذكي معبّأً من طلبك. لا يُولَّد شيء قبل أن تضغط «توليد»، ولا يُحفظ أو يُنشر شيء قبل أن تفعل ذلك بنفسك.
              </span>
            </div>
          </div>
        ) : (
          <p className="platform-warning" role="status">تعذّر تجهيز نموذج المؤلف الذكي من هذا الطلب؛ أعد تحليل الطلب.</p>
        )
      )}
    </section>
  );
}
