import { useEffect, useRef, useState, type RefObject } from "react";
import { ATTEMPT_POLICY_OPTIONS, type AttemptPolicy } from "./attemptPolicy";
import { RESULTS_RELEASE_OPTIONS, type ResultsRelease } from "./resultsRelease";
import type { WindowField, WindowIssue } from "./assignmentWindow";
import IconButton from "../ui/IconButton";
import EmptyState from "../ui/EmptyState";
import { IconClose, IconEye, IconBuilder, IconPlus, IconChevronBack } from "../icons";
import { WIZARD_STEPS, stepIssues, canReachStep, stepIndex, reviewRows, copiesCount, type WizardStep } from "./assignmentWizard";
import { categoryLabel, type LibraryCatalogItem } from "../examLibrary";
import type { Classroom, Exam, SavedExam, SourceMode } from "./types";

export type AssignmentComposerProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  busy: boolean;
  examLoading: boolean;
  // source
  sourceMode: SourceMode; onSourceMode: (m: SourceMode) => void;
  sourceExam: Exam | null; sourceCount: number;
  currentExam: Exam | null; hasCurrent: boolean;
  savedExams: SavedExam[]; examSource: string; onChooseExam: (value: string) => void;
  // library
  libraryLoading: boolean; libraryItems: LibraryCatalogItem[]; libraryCategories: string[];
  librarySearch: string; onLibrarySearch: (v: string) => void;
  libraryCategory: string; onLibraryCategory: (v: string) => void;
  librarySelectedId: string; onChooseLibraryItem: (it: LibraryCatalogItem) => void;
  onPreview: (it: LibraryCatalogItem) => void; previewBusyId: string;
  onCopyToBuilder?: (it: LibraryCatalogItem) => void; copyBusyId: string;
  // fields
  activeClasses: Classroom[];
  /** Phase 21G.6 — the chosen classes (one copy of the assignment per class, D4). */
  classIds: readonly string[]; onToggleClass: (id: string) => void; onAllClasses: (on: boolean) => void;
  /** Preview the chosen content (ExamPreview scrubs every grading secret). */
  onPreviewContent?: () => void;
  /** The step the wizard opens on (default: the first). */
  initialStep?: WizardStep;
  title: string; onTitle: (v: string) => void;
  instructions: string; onInstructions: (v: string) => void;
  openAt: string; onOpenAt: (v: string) => void;
  dueAt: string; onDueAt: (v: string) => void;
  maxAttempts: number; onMaxAttempts: (v: number) => void;
  durationMinutes: number; onDurationMinutes: (v: number) => void;
  attemptPolicy: AttemptPolicy; onAttemptPolicy: (v: AttemptPolicy) => void;
  resultsRelease?: ResultsRelease; onResultsRelease?: (v: ResultsRelease) => void;
  publish: boolean; onPublish: (v: boolean) => void;
  /** Phase 21G.0 — the opening time / deadline issues, shown at their field. */
  windowIssues?: readonly WindowIssue[];
  canCreate: boolean; onCreate: () => void;
};

/** NON-MODAL composer: lives in the detail area so the library's ExamPreview overlay keeps its own, unchanged layering. */
export default function AssignmentComposer({ headingRef, ...p }: AssignmentComposerProps) {
  const issueOf = (field: WindowField) => (p.windowIssues || []).find(i => i.field === field) || null;
  const fieldIssue = (field: WindowField) => {
    const issue = issueOf(field);
    return issue ? <span id={"eb-composer-" + field + "-issue"} className={issue.blocking ? "eb-field-error" : "eb-field-warning"} role={issue.blocking ? "alert" : "status"}>{issue.message}</span> : null;
  };
  const issueProps = (field: WindowField) => {
    const issue = issueOf(field);
    return issue ? { "aria-invalid": issue.blocking || undefined, "aria-describedby": "eb-composer-" + field + "-issue" } : {};
  };
  // Phase 21G.6 — the wizard: one step at a time; moving forward needs the step being left to be valid, moving back is always free.
  const [step, setStep] = useState<WizardStep>(p.initialStep ?? "content"), [examQuery, setExamQuery] = useState("");
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null), stepMoved = useRef(false);
  useEffect(() => { if (stepMoved.current) stepHeadingRef.current?.focus(); }, [step]);
  const goTo = (to: WizardStep) => { if (!canReachStep(step, to, wizardInput)) return; stepMoved.current = true; setStep(to); };
  const wizardInput = { hasContent: !!p.sourceExam && p.sourceCount > 0, contentLoading: p.examLoading, title: p.title, classIds: p.classIds, windowIssues: p.windowIssues || [] };
  const blocking = stepIssues(step, wizardInput), at = stepIndex(step), last = at === WIZARD_STEPS.length - 1;
  const needle = examQuery.trim().toLowerCase();
  const shownExams = needle ? p.savedExams.filter(x => x.blobName === p.examSource || String(x.title || "").toLowerCase().includes(needle)) : p.savedExams;
  return (
    <section className="eb-assign-composer" aria-labelledby="eb-composer-title">
      <div className="eb-assign-detail-head">
        <div className="eb-assign-detail-text"><h2 id="eb-composer-title" ref={headingRef} tabIndex={-1} className="eb-assign-detail-title">إنشاء واجب جديد</h2><p className="eb-dialog-lead">اختر محتوى الواجب ثم حدّد الصف والمواعيد.</p></div>
        <div className="eb-assign-detail-actions"><IconButton label="إغلاق الإنشاء" icon={<IconClose size={18} />} onClick={p.onClose} /></div>
      </div>

      <ol className="eb-wizard-steps" aria-label="خطوات إنشاء الواجب">
        {WIZARD_STEPS.map((st, i) => (
          <li key={st.key}>
            <button type="button" className={"eb-wizard-step" + (st.key === step ? " is-current" : i < at ? " is-done" : "")} aria-current={st.key === step ? "step" : undefined} onClick={() => goTo(st.key)} disabled={!canReachStep(step, st.key, wizardInput)}>
              <span className="eb-wizard-step-no" aria-hidden="true">{i + 1}</span><span>{st.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="eb-muted eb-wizard-hint">{WIZARD_STEPS[at].hint}</p>

      {step === "content" && (<>
      <div className="eb-composer-section">
        <h3 className="eb-subheading" ref={stepHeadingRef} tabIndex={-1}>مصدر الواجب</h3>
        <div className="eb-segmented" role="group" aria-label="مصدر محتوى الواجب">
          <button type="button" aria-pressed={p.sourceMode === "mine"} onClick={() => p.onSourceMode("mine")}>امتحاناتي</button>
          <button type="button" aria-pressed={p.sourceMode === "library"} onClick={() => p.onSourceMode("library")}>مكتبة 791381</button>
        </div>
        <div className="assignment-source-card eb-source-card">
          <div className="eb-source-card-text"><span>المحتوى المختار</span><strong>{p.sourceExam?.title || "لم يتم اختيار محتوى"}</strong><small>{p.sourceCount ? p.sourceCount + " سؤال" : "اختر محتوى الواجب"}{p.sourceExam?.totalMarks ? " · " + p.sourceExam.totalMarks + " علامة" : ""}</small></div>
          {p.sourceMode === "mine" && (<>
            {p.savedExams.length > 5 && <label className="eb-source-select eb-source-search">بحث في امتحاناتي<input type="search" value={examQuery} onChange={e => setExamQuery(e.target.value)} placeholder="عنوان الامتحان" /></label>}
            <label className="eb-source-select">اختيار الامتحان<select value={p.examSource} onChange={e => p.onChooseExam(e.target.value)} disabled={p.examLoading}>
              <option value="">اختر امتحانًا محفوظًا</option>
              {p.hasCurrent && <option value="current">الامتحان المفتوح حاليًا · {p.currentExam?.title || "بدون عنوان"}</option>}
              {shownExams.map(x => <option key={x.blobName} value={x.blobName}>{x.title} · {x.questionCount} سؤال · {x.totalMarks} علامة</option>)}
            </select></label>
          </>)}
          {p.onPreviewContent && p.sourceExam && !p.examLoading && <button type="button" className="eb-button is-small" onClick={p.onPreviewContent}><IconEye size={16} />معاينة المحتوى</button>}
          {p.examLoading && <span className="eb-muted" role="status">جارٍ فتح الامتحان...</span>}
        </div>
        {p.sourceMode === "library" && (
          <div className="library-picker eb-library-picker">
            {p.libraryLoading ? <div className="platform-loading" role="status">جارٍ تحميل مكتبة 791381...</div> : <>
              <div className="library-picker-controls">
                <label className="eb-field-inline eb-library-search">بحث<input className="library-search" value={p.librarySearch} onChange={e => p.onLibrarySearch(e.target.value)} placeholder="VLAN، DHCP، Subnet، CIDR..." /></label>
                <div className="library-cat-chips eb-chip-group" role="group" aria-label="تصنيف المكتبة">
                  <button type="button" className={"library-cat-chip" + (p.libraryCategory === "" ? " active" : "")} aria-pressed={p.libraryCategory === ""} onClick={() => p.onLibraryCategory("")}>الكل</button>
                  {p.libraryCategories.map(code => <button key={code} type="button" className={"library-cat-chip" + (p.libraryCategory === code ? " active" : "")} aria-pressed={p.libraryCategory === code} onClick={() => p.onLibraryCategory(code)}>{categoryLabel(code)}</button>)}
                </div>
              </div>
              <ul className="library-item-list" aria-label="عناصر المكتبة">
                {p.libraryItems.map(it => {
                  const selected = p.librarySelectedId === it.libraryItemId; const disabled = !it.publishable;
                  return (
                    <li key={it.libraryItemId} className={"library-item" + (selected ? " selected" : "") + (disabled ? " disabled" : "")}>
                      <button type="button" className="library-item-select" aria-pressed={selected} onClick={() => p.onChooseLibraryItem(it)} disabled={disabled || p.examLoading} aria-disabled={disabled}>
                        <span className="library-item-code">{it.libraryItemId}</span>
                        <span className="library-item-main"><strong>{it.title}</strong><small>{it.questionCount} سؤال · {it.totalMarks} علامة · {categoryLabel(it.category)}</small></span>
                        {disabled && <span className="library-item-badge">يحتاج مراجعة</span>}
                      </button>
                      <IconButton label={"معاينة " + it.title} icon={<IconEye size={18} />} className="library-item-preview" onClick={() => p.onPreview(it)} disabled={!!p.previewBusyId} aria-busy={p.previewBusyId === it.libraryItemId} />
                      {p.onCopyToBuilder && <IconButton label={"نسخ " + it.title + " إلى الباني"} icon={<IconBuilder size={18} />} className="library-item-preview" onClick={() => p.onCopyToBuilder?.(it)} disabled={!!p.copyBusyId} aria-busy={p.copyBusyId === it.libraryItemId} />}
                    </li>
                  );
                })}
              </ul>
              {!p.libraryItems.length && <EmptyState compact title="لا توجد عناصر مطابقة." />}
            </>}
          </div>
        )}
      </div>
      <div className="eb-composer-section">
        <h3 className="eb-subheading">عنوان الواجب وتعليماته</h3>
        <div className="assignment-create-grid eb-form-grid eb-form-grid-2">
          <label>عنوان الواجب<input value={p.title} onChange={e => p.onTitle(e.target.value)} /></label>
          <label className="assignment-wide-field eb-span-2">تعليمات<textarea value={p.instructions} onChange={e => p.onInstructions(e.target.value)} /></label>
        </div>
      </div>
      </>)}

      {step === "classes" && (
        <div className="eb-composer-section">
          <h3 className="eb-subheading" ref={stepHeadingRef} tabIndex={-1}>الصفوف</h3>
          <fieldset className="eb-class-picker">
            <legend className="eb-muted">الصفوف المستهدفة — تُنشأ نسخة مستقلة من الواجب لكل صف، ولكل صف نتائجه وطلابه.</legend>
            {p.activeClasses.length > 1 && <label className="eb-check-inline eb-class-all"><input type="checkbox" checked={p.classIds.length === p.activeClasses.length} onChange={e => p.onAllClasses(e.target.checked)} /><span>كل الصفوف</span></label>}
            <ul className="eb-class-options">
              {p.activeClasses.map(c => (
                <li key={c.classId}><label className={"eb-class-option" + (p.classIds.includes(c.classId) ? " is-selected" : "")}><input type="checkbox" checked={p.classIds.includes(c.classId)} onChange={() => p.onToggleClass(c.classId)} /><span>{c.name}{c.grade ? " · " + c.grade : ""}</span></label></li>
              ))}
            </ul>
            {!p.activeClasses.length && <EmptyState compact title="لا توجد صفوف نشطة." description="أنشئ صفًا من «الصفوف والطلاب» أولًا." />}
          </fieldset>
          {p.classIds.length > 1 && <p className="eb-muted" role="status">سيُنشأ {copiesCount(p.classIds.length)} من الواجب.</p>}
        </div>
      )}

      {step === "timing" && (
        <div className="eb-composer-section">
          <h3 className="eb-subheading" ref={stepHeadingRef} tabIndex={-1}>المواعيد والمحاولات</h3>
          <div className="assignment-create-grid eb-form-grid eb-form-grid-2">
            <div className="eb-window-field"><label>يفتح في<input type="datetime-local" value={p.openAt} onChange={e => p.onOpenAt(e.target.value)} {...issueProps("openAt")} /></label>{fieldIssue("openAt")}</div>
            <div className="eb-window-field"><label>آخر موعد<input type="datetime-local" value={p.dueAt} onChange={e => p.onDueAt(e.target.value)} {...issueProps("dueAt")} /></label>{fieldIssue("dueAt")}</div>
            <label>عدد المحاولات<select value={p.maxAttempts} onChange={e => p.onMaxAttempts(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <label>مدة المحاولة (بالدقائق)<select value={p.durationMinutes} onChange={e => p.onDurationMinutes(Number(e.target.value))}><option value={0}>بدون مؤقت</option>{[15, 30, 45, 60, 90, 120, 180].map(n => <option key={n} value={n}>{n} دقيقة</option>)}</select></label>
          </div>
        </div>
      )}

      {step === "rules" && (
        <div className="eb-composer-section">
          <h3 className="eb-subheading" ref={stepHeadingRef} tabIndex={-1}>القواعد والنشر</h3>
        {/* Phase 7A — assignment-level attempt policy: chosen explicitly here, persisted on the assignment, never
            changed afterwards (the same exam can be homework, a controlled exam or save-&-resume work). */}
        <fieldset className="eb-policy-group">
          <legend className="eb-subheading">طريقة المحاولة</legend>
          <p className="eb-policy-hint">تحدد ما يحدث إذا غادر الطالب صفحة الامتحان أثناء محاولته. لا يمكن تغييرها بعد إنشاء الواجب.</p>
          <div className="eb-policy-options">
            {ATTEMPT_POLICY_OPTIONS.map(o => (
              <label key={o.value} className={"eb-policy-option" + (p.attemptPolicy === o.value ? " is-selected" : "")}>
                <input type="radio" name="eb-attempt-policy" value={o.value} checked={p.attemptPolicy === o.value} onChange={() => p.onAttemptPolicy(o.value)} />
                <span className="eb-policy-text">
                  <strong>{o.label}</strong>
                  <span className="eb-policy-summary">{o.summary}</span>
                  <small className="eb-policy-detail">{o.detail}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {/* Phase 21G.5 (D2) — when students see their results; enforced by the server, editable later from the assignment page. */}
        {p.onResultsRelease && <fieldset className="eb-policy-group">
          <legend className="eb-subheading">متى يرى الطلاب نتائجهم</legend>
          <p className="eb-policy-hint">تُحجب العلامات والملاحظات عن الطلاب حتى موعد الإظهار. يمكنك تغييرها لاحقًا من صفحة الواجب.</p>
          <div className="eb-policy-options">
            {RESULTS_RELEASE_OPTIONS.map(o => (
              <label key={o.value} className={"eb-policy-option" + (p.resultsRelease === o.value ? " is-selected" : "")}>
                <input type="radio" name="eb-results-release" value={o.value} checked={p.resultsRelease === o.value} onChange={() => p.onResultsRelease?.(o.value)} />
                <span className="eb-policy-text"><strong>{o.label}</strong><span className="eb-policy-summary">{o.summary}</span></span>
              </label>
            ))}
          </div>
        </fieldset>}
          <div className="eb-publish-choice">
            <label className="assignment-publish-toggle eb-check-inline"><input type="checkbox" checked={p.publish} onChange={e => p.onPublish(e.target.checked)} aria-describedby="eb-composer-publish-hint" /><span>نشر مباشرة</span></label>
            <small id="eb-composer-publish-hint" className="eb-muted">{p.publish ? "يظهر الواجب للطلاب فور إنشائه." : "يبقى مسودة لا يراها الطلاب حتى تنشره."}</small>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="eb-composer-section">
          <h3 className="eb-subheading" ref={stepHeadingRef} tabIndex={-1}>مراجعة قبل الإنشاء</h3>
          <dl className="eb-dl eb-wizard-review">
            {reviewRows({ ...wizardInput, contentTitle: p.sourceExam?.title || "", questionCount: p.sourceCount, classNames: p.activeClasses.filter(c => p.classIds.includes(c.classId)).map(c => c.name), openAt: p.openAt, dueAt: p.dueAt, maxAttempts: p.maxAttempts, durationMinutes: p.durationMinutes, attemptPolicy: p.attemptPolicy, resultsRelease: p.resultsRelease || "immediate", publish: p.publish, fmt: v => new Date(v).toLocaleString("ar") }).map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
          </dl>
          {p.onPreviewContent && p.sourceExam && <button type="button" className="eb-button is-small" onClick={p.onPreviewContent}><IconEye size={16} />معاينة المحتوى</button>}
          {stepIssues("review", wizardInput).length === 0 && !p.canCreate && <p className="eb-muted" role="status">لا يمكن الإنشاء الآن؛ راجع الخطوات السابقة.</p>}
        </div>
      )}

      {blocking.length > 0 && <ul className="eb-wizard-issues" role="status" aria-label="ما يمنع المتابعة">{blocking.map(m => <li key={m}>{m}</li>)}</ul>}
      <div className="eb-composer-foot">
        <button type="button" className="eb-button" onClick={p.onClose}>إلغاء</button>
        {at > 0 && <button type="button" className="eb-button" onClick={() => goTo(WIZARD_STEPS[at - 1].key)}><IconChevronBack size={16} />السابق</button>}
        {!last && <button type="button" className="eb-button is-primary eb-wizard-next" onClick={() => goTo(WIZARD_STEPS[at + 1].key)} disabled={blocking.length > 0}>التالي</button>}
        {last && <button type="button" className="eb-button is-primary assignment-create-button" onClick={p.onCreate} disabled={!p.canCreate}><IconPlus size={16} />{p.classIds.length > 1 ? "إنشاء الواجب (" + copiesCount(p.classIds.length) + ")" : "إنشاء الواجب"}</button>}
      </div>
    </section>
  );
}
