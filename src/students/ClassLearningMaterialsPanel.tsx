import { useId, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import Dialog from "../ui/Dialog";
import { IconBook, IconPlus } from "../icons";
import { classLearningMaterials } from "./classLearningMaterials";
import type { Classroom, ClassLearningMaterial, LearningCatalogCourse } from "./types";

/**
 * Class Learning Materials panel (المواد التعليمية لهذا الصف) — the teacher's PROGRESSIVE RELEASE control for the
 * selected class. Presentation only: TeacherPlatform owns the catalog request, every mutation, the confirmations,
 * the authoritative refresh and the stale-selected-class protection. Two concepts, kept visibly distinct:
 *   • course ASSIGNMENT — the class uses book X (a card exists, even with nothing released yet);
 *   • module PUBLICATION — each module is «منشور للطلاب» or «مخفي عن الطلاب» (a checkbox per module).
 * Teachers control VISIBILITY only; the content order is the book's canonical order and never changes. Nothing
 * here is checked by default when a course is added. An archived class is read-only (configuration still shown).
 */
export type ClassLearningMaterialsPanelProps = {
  classroom: Classroom | null;
  classActive: boolean;
  /** The publishable catalog; null while loading / unavailable. */
  catalog: LearningCatalogCourse[] | null;
  catalogError: string;
  busy: boolean;
  onRetryCatalog: () => void;
  onAddCourse: (classroom: Classroom, courseId: string, moduleIds: string[]) => void;
  onToggleModule: (classroom: Classroom, courseId: string, moduleId: string, publish: boolean) => void;
  onRemoveCourse: (classroom: Classroom, courseId: string) => void;
};

export default function ClassLearningMaterialsPanel(p: ClassLearningMaterialsPanelProps) {
  // The add dialog is open FOR one class id: a class switch closes it by derivation (never adds to a class the
  // teacher has left), with no effect-driven reset.
  const [addOpenFor, setAddOpenFor] = useState("");
  const classroom = p.classroom;
  const addOpen = Boolean(classroom) && addOpenFor === classroom!.classId;
  const setAddOpen = (open: boolean) => setAddOpenFor(open && classroom ? classroom.classId : "");
  const materials = classLearningMaterials(classroom);
  const attachedIds = new Set(materials.map(m => m.courseId));
  const addable = (p.catalog || []).filter(c => !attachedIds.has(c.courseId));
  const editable = Boolean(classroom) && p.classActive;

  // The add affordance exists only while there is something left to add (catalog loaded, a course not yet attached).
  const addButton = classroom && p.classActive && p.catalog && addable.length > 0 ? (
    <button type="button" className="eb-button is-primary is-small" onClick={() => setAddOpen(true)} disabled={p.busy}>
      <IconPlus size={16} aria-hidden="true" />إضافة مادة تعليمية
    </button>
  ) : null;

  return (
    <section className="eb-lm-class-panel" aria-labelledby="eb-lm-class-title">
      <SectionHeader
        level={2}
        id="eb-lm-class-title"
        title="المواد التعليمية لهذا الصف"
        description={classroom ? "اختر الفصول التي يراها طلاب «" + classroom.name + "» الآن. النشر تدريجي: يمكنك نشر فصل أو إخفاؤه في أي وقت دون حذف المحتوى." : undefined}
        actions={materials.length > 0 ? addButton : undefined}
      />
      {!classroom && <EmptyState title="اختر صفًا لعرض مواده التعليمية" description="اختر صفًا من القائمة لإضافة كتاب والتحكم في الفصول المنشورة لطلابه." />}
      {classroom && !p.classActive && <p className="eb-muted eb-lm-class-readonly">للعرض فقط: هذا الصف في الأرشيف، ولا يمكن نشر الفصول أو إخفاؤها أو إزالة المواد حتى يُعاد تفعيله.</p>}
      {classroom && p.catalogError && !p.catalog && (
        <div className="platform-error" role="alert">
          {p.catalogError}
          <button type="button" className="eb-button is-quiet is-small" onClick={p.onRetryCatalog}>إعادة المحاولة</button>
        </div>
      )}
      {classroom && materials.length === 0 && (
        <EmptyState
          title="لا توجد مواد تعليمية مضافة لهذا الصف."
          description={p.classActive ? "أضف كتابًا ثم انشر فصوله للطلاب خطوة بخطوة." : undefined}
          action={materials.length === 0 ? addButton : undefined}
        />
      )}
      {classroom && materials.length > 0 && (
        <ul className="eb-lm-class-list" aria-label="المواد التعليمية المضافة">
          {materials.map(entry => <CourseCard key={entry.courseId} classroom={classroom} entry={entry} course={(p.catalog || []).find(c => c.courseId === entry.courseId) || null} editable={editable} busy={p.busy} onToggleModule={p.onToggleModule} onRemoveCourse={p.onRemoveCourse} />)}
        </ul>
      )}
      {classroom && (
        <AddCourseDialog
          key={addOpen ? "open-" + classroom.classId : "closed"}   // fresh selection state on every open
          open={addOpen}
          classroom={classroom}
          courses={addable}
          busy={p.busy}
          onClose={() => setAddOpen(false)}
          onAdd={(courseId, moduleIds) => { setAddOpen(false); p.onAddCourse(classroom, courseId, moduleIds); }}
        />
      )}
    </section>
  );
}

function CourseCard({ classroom, entry, course, editable, busy, onToggleModule, onRemoveCourse }: {
  classroom: Classroom; entry: ClassLearningMaterial; course: LearningCatalogCourse | null; editable: boolean; busy: boolean;
  onToggleModule: ClassLearningMaterialsPanelProps["onToggleModule"]; onRemoveCourse: ClassLearningMaterialsPanelProps["onRemoveCourse"];
}) {
  const headingId = "eb-lm-class-course-" + entry.courseId;
  const modules = course ? course.modules.slice().sort((a, b) => a.order - b.order) : [];
  const visible = new Set(entry.visibleModuleIds);
  const published = modules.filter(m => visible.has(m.moduleId)).length;
  return (
    <li className="eb-lm-class-card">
      <article aria-labelledby={headingId}>
        <div className="eb-lm-class-card-head">
          <span className="eb-lm-class-cover" aria-hidden="true"><IconBook size={26} /></span>
          <div className="eb-lm-class-card-text">
            <h3 id={headingId} className="eb-lm-class-card-title">{course ? course.title : "مادة تعليمية"}</h3>
            <p className="eb-lm-class-card-meta">كتاب {entry.courseId}{course?.subject ? " · " + course.subject : ""}</p>
          </div>
          <StatusBadge tone={published > 0 ? "success" : "neutral"}>{published > 0 ? "يرى الطلاب " + published + " من " + modules.length : "لا شيء منشور بعد"}</StatusBadge>
        </div>
        {!course && <p className="eb-muted">تعذر تحميل قائمة الفصول لهذه المادة.</p>}
        {course && (
          <ul className="eb-lm-class-modules" aria-label={"فصول " + course.title}>
            {modules.map(m => {
              const on = visible.has(m.moduleId);
              const inputId = "eb-lm-mod-" + classroom.classId + "-" + m.moduleId;
              return (
                <li key={m.moduleId} className={"eb-lm-class-module" + (on ? " is-on" : "")}>
                  <label htmlFor={inputId} className="eb-lm-class-module-label">
                    <input id={inputId} type="checkbox" checked={on} disabled={!editable || busy} onChange={e => onToggleModule(classroom, entry.courseId, m.moduleId, e.target.checked)} />
                    <span className="eb-lm-class-module-order" aria-hidden="true">{m.order}</span>
                    <span className="eb-lm-class-module-title">{m.title}</span>
                  </label>
                  <StatusBadge tone={on ? "success" : "neutral"}>{on ? "منشور للطلاب" : "مخفي عن الطلاب"}</StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
        {editable && (
          <div className="eb-lm-class-card-foot">
            <button type="button" className="eb-button is-quiet is-small" disabled={busy} onClick={() => onRemoveCourse(classroom, entry.courseId)}>إزالة المادة من الصف</button>
          </div>
        )}
      </article>
    </li>
  );
}

/** Add a course to the class: pick ONE catalog course, then the initial modules (NONE pre-checked; [] is valid). */
function AddCourseDialog({ open, classroom, courses, busy, onClose, onAdd }: {
  open: boolean; classroom: Classroom; courses: LearningCatalogCourse[]; busy: boolean; onClose: () => void; onAdd: (courseId: string, moduleIds: string[]) => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const groupId = useId();
  const course = courses.find(c => c.courseId === courseId) || null;
  const modules = course ? course.modules.slice().sort((a, b) => a.order - b.order) : [];
  const toggle = (id: string, on: boolean) => setPicked(prev => on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id));
  return (
    <Dialog
      open={open}
      title={"إضافة مادة تعليمية للصف «" + classroom.name + "»"}
      onClose={onClose}
      size="md"
      className="eb-lm-add-dialog"
      footer={<>
        <button type="button" className="eb-button" onClick={onClose}>إلغاء</button>
        <button type="button" className="eb-button is-primary" disabled={!course || busy} onClick={() => course && onAdd(course.courseId, picked)}>إضافة</button>
      </>}
    >
      {courses.length === 0 && <EmptyState compact title="لا توجد مواد تعليمية أخرى متاحة للإضافة" />}
      {courses.length > 0 && (
        <fieldset className="eb-lm-add-courses">
          <legend className="eb-lm-add-legend">المادة التعليمية</legend>
          {courses.map(c => {
            const id = groupId + "-course-" + c.courseId;
            return (
              <label key={c.courseId} htmlFor={id} className={"eb-lm-add-course" + (c.courseId === courseId ? " is-on" : "")}>
                <input id={id} type="radio" name={groupId + "-course"} value={c.courseId} checked={c.courseId === courseId} onChange={() => { setCourseId(c.courseId); setPicked([]); }} />
                <span className="eb-lm-class-cover" aria-hidden="true"><IconBook size={22} /></span>
                <span className="eb-lm-add-course-text"><strong>{c.title}</strong><span className="eb-muted">كتاب {c.courseId} · {c.subject}</span></span>
              </label>
            );
          })}
        </fieldset>
      )}
      {course && (
        <fieldset className="eb-lm-add-modules">
          <legend className="eb-lm-add-legend">الفصول المنشورة للطلاب الآن <span className="eb-muted">(اختياري — يمكنك النشر لاحقًا)</span></legend>
          {modules.map(m => {
            const id = groupId + "-mod-" + m.moduleId;
            const on = picked.includes(m.moduleId);
            return (
              <label key={m.moduleId} htmlFor={id} className={"eb-lm-class-module-label eb-lm-add-module" + (on ? " is-on" : "")}>
                <input id={id} type="checkbox" checked={on} onChange={e => toggle(m.moduleId, e.target.checked)} />
                <span className="eb-lm-class-module-order" aria-hidden="true">{m.order}</span>
                <span className="eb-lm-class-module-title">{m.title}</span>
              </label>
            );
          })}
          <p className="eb-muted eb-lm-add-hint">{picked.length === 0 ? "لن يرى الطلاب شيئًا حتى تنشر فصلًا." : "سيرى الطلاب " + picked.length + " من " + modules.length + " فصول."}</p>
        </fieldset>
      )}
    </Dialog>
  );
}
