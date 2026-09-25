import type { RefObject } from "react";
import { ATTEMPT_POLICY_OPTIONS, type AttemptPolicy } from "./attemptPolicy";
import IconButton from "../ui/IconButton";
import EmptyState from "../ui/EmptyState";
import { IconClose, IconEye, IconBuilder, IconPlus } from "../icons";
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
  classId: string; onClassId: (v: string) => void;
  title: string; onTitle: (v: string) => void;
  instructions: string; onInstructions: (v: string) => void;
  openAt: string; onOpenAt: (v: string) => void;
  dueAt: string; onDueAt: (v: string) => void;
  maxAttempts: number; onMaxAttempts: (v: number) => void;
  durationMinutes: number; onDurationMinutes: (v: number) => void;
  attemptPolicy: AttemptPolicy; onAttemptPolicy: (v: AttemptPolicy) => void;
  publish: boolean; onPublish: (v: boolean) => void;
  canCreate: boolean; onCreate: () => void;
};

/** NON-MODAL composer: lives in the detail area so the library's ExamPreview overlay keeps its own, unchanged layering. */
export default function AssignmentComposer({ headingRef, ...p }: AssignmentComposerProps) {
  return (
    <section className="eb-assign-composer" aria-labelledby="eb-composer-title">
      <div className="eb-assign-detail-head">
        <div className="eb-assign-detail-text"><h2 id="eb-composer-title" ref={headingRef} tabIndex={-1} className="eb-assign-detail-title">إنشاء واجب جديد</h2><p className="eb-dialog-lead">اختر محتوى الواجب ثم حدّد الصف والمواعيد.</p></div>
        <div className="eb-assign-detail-actions"><IconButton label="إغلاق الإنشاء" icon={<IconClose size={18} />} onClick={p.onClose} /></div>
      </div>

      <div className="eb-composer-section">
        <h3 className="eb-subheading">مصدر الواجب</h3>
        <div className="eb-segmented" role="group" aria-label="مصدر محتوى الواجب">
          <button type="button" aria-pressed={p.sourceMode === "mine"} onClick={() => p.onSourceMode("mine")}>امتحاناتي</button>
          <button type="button" aria-pressed={p.sourceMode === "library"} onClick={() => p.onSourceMode("library")}>مكتبة 791381</button>
        </div>
        <div className="assignment-source-card eb-source-card">
          <div className="eb-source-card-text"><span>المحتوى المختار</span><strong>{p.sourceExam?.title || "لم يتم اختيار محتوى"}</strong><small>{p.sourceCount ? p.sourceCount + " سؤال" : "اختر محتوى الواجب"}{p.sourceExam?.totalMarks ? " · " + p.sourceExam.totalMarks + " علامة" : ""}</small></div>
          {p.sourceMode === "mine" && (
            <label className="eb-source-select">اختيار الامتحان<select value={p.examSource} onChange={e => p.onChooseExam(e.target.value)} disabled={p.examLoading}>
              <option value="">اختر امتحانًا محفوظًا</option>
              {p.hasCurrent && <option value="current">الامتحان المفتوح حاليًا · {p.currentExam?.title || "بدون عنوان"}</option>}
              {p.savedExams.map(x => <option key={x.blobName} value={x.blobName}>{x.title} · {x.questionCount} سؤال · {x.totalMarks} علامة</option>)}
            </select></label>
          )}
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
        <h3 className="eb-subheading">إعدادات الواجب</h3>
        <div className="assignment-create-grid eb-form-grid eb-form-grid-2">
          <label>الصف<select value={p.classId} onChange={e => p.onClassId(e.target.value)}><option value="">اختر الصف</option>{p.activeClasses.map(c => <option value={c.classId} key={c.classId}>{c.name}{c.grade ? " · " + c.grade : ""}</option>)}</select></label>
          <label>عنوان الواجب<input value={p.title} onChange={e => p.onTitle(e.target.value)} /></label>
          <label className="assignment-wide-field eb-span-2">تعليمات<textarea value={p.instructions} onChange={e => p.onInstructions(e.target.value)} /></label>
          <label>يفتح في<input type="datetime-local" value={p.openAt} onChange={e => p.onOpenAt(e.target.value)} /></label>
          <label>آخر موعد<input type="datetime-local" value={p.dueAt} onChange={e => p.onDueAt(e.target.value)} /></label>
          <label>عدد المحاولات<select value={p.maxAttempts} onChange={e => p.onMaxAttempts(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>مدة المحاولة (بالدقائق)<select value={p.durationMinutes} onChange={e => p.onDurationMinutes(Number(e.target.value))}><option value={0}>بدون مؤقت</option>{[15, 30, 45, 60, 90, 120, 180].map(n => <option key={n} value={n}>{n} دقيقة</option>)}</select></label>
          <label className="assignment-publish-toggle eb-check-inline"><input type="checkbox" checked={p.publish} onChange={e => p.onPublish(e.target.checked)} /><span>نشر مباشرة</span></label>
        </div>
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
      </div>

      <div className="eb-composer-foot">
        <button type="button" className="eb-button" onClick={p.onClose}>إلغاء</button>
        <button type="button" className="eb-button is-primary assignment-create-button" onClick={p.onCreate} disabled={!p.canCreate}><IconPlus size={16} />إنشاء الواجب</button>
      </div>
    </section>
  );
}
