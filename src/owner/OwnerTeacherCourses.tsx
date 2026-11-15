import { useEffect, useMemo, useState } from "react";
import { IconWarning } from "../icons";
import type { AccessHistoryEntry, CatalogCourse, EffectiveAccess } from "./ownerApi";
import { coursesDraft, type CoursesDraft } from "./teacherCoursesDraft";

/**
 * Owner Console — the «المواد» tab of a teacher's page: which learning materials (courses) this teacher gets. The teacher sees only
 * these on «المواد التعليمية», and from them chooses what each class may read; a course outside the choice is refused to the teacher
 * AND to their students by the server (api/src/lib/access/course-access.js, P5-A).
 *
 * The choice is the `courses` entitlement of the teacher's access revision, the same field «الصلاحيات ← المحتوى المخوَّل» edits. This
 * tab changes ONLY that field: saving sends the current revision back unchanged (preset, grants, denies, games, widgets, appearance)
 * with the new course list, as a new immutable revision against the revision this page was opened on (a stale page → 409). Like
 * every entitlement it narrows only while the owner's access mode is ENFORCE; the tab says so when it is not.
 */

export default function OwnerTeacherCourses({ teacherName, courses, head, headBroken, effective, busy, onSave, onOpenAccess, onDirty }: {
  teacherName: string;
  /** Every course of the platform (null = the catalog could not be read: nothing is offered). */
  courses: CatalogCourse[] | null;
  /** The teacher's current access revision (undefined = none saved yet). */
  head: AccessHistoryEntry | undefined;
  headBroken: boolean;
  effective: EffectiveAccess;
  busy: boolean;
  onSave: (draft: CoursesDraft) => void;
  onOpenAccess: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const initial = head && head.valid && Array.isArray(head.courses) ? head.courses : null;
  const [mode, setMode] = useState<"all" | "some">(initial ? "some" : "all");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial || []));
  const [reason, setReason] = useState("");
  const dirty = mode !== (initial ? "some" : "all") || (mode === "some" && (chosen.size !== (initial || []).length || (initial || []).some(c => !chosen.has(c))));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const titles = useMemo(() => new Map((courses || []).map(c => [c.courseId, c.title])), [courses]);

  if (!courses) return <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />تعذر تحميل قائمة المواد التعليمية. أعد تحميل الصفحة.</div>;
  if (headBroken) return <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />نسخة صلاحيات هذا المعلم غير صالحة. أصلحها من تبويب «الصلاحيات» أولًا، ثم اختر المواد هنا.</div>;
  if (!head || !head.valid || !head.preset) return (
    <div className="eb-owner-courses-tab">
      <p className="eb-owner-hint" role="status">لم تُحفظ صلاحيات لهذا المعلم بعد. احفظ صلاحياته أولًا، ثم اختر المواد التعليمية هنا.</p>
      <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={onOpenAccess}>الذهاب إلى «الصلاحيات»</button></div>
    </div>
  );

  const toggle = (id: string, on: boolean) => setChosen(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const save = () => {
    const draft = coursesDraft(head, mode === "some" ? [...chosen] : null, reason.trim() || "المواد التعليمية");
    if (draft) onSave(draft);
  };
  const current = initial ? initial.map(id => titles.get(id) || id) : null;

  return (
    <div className="eb-owner-courses-tab">
      <p className="eb-owner-hint">
        اختر المواد التعليمية التي تظهر لـ<bdi>{teacherName}</bdi> في «المواد التعليمية». لا يرى المعلم غيرها، ومنها يختار ما يظهر لطلاب
        كل صف. ما يُحجب هنا يُمنع عن المعلم وعن طلابه، ولا يُحذف شيء مما حفظه الطلاب.
      </p>
      {!effective.enforced && (
        <p className="eb-owner-hint eb-owner-courses-mode" role="note">
          <IconWarning size={16} aria-hidden="true" /> وضع الصلاحيات الحالي لا يطبّق القيود بعد، فيرى المعلم كل المواد حتى تفعّل «التطبيق» من صفحة
          «الصلاحيات». يُحفظ اختيارك الآن ويسري عند التفعيل.
        </p>
      )}
      <p className="eb-owner-hint">الآن: <strong>{current ? (current.length ? current.join("، ") : "لا مادة") : "كل المواد المنشورة"}</strong></p>

      <fieldset className="eb-owner-access-options eb-owner-courses-choice">
        <legend>المواد التعليمية المخوَّلة</legend>
        <label className="eb-owner-access-option">
          <input type="radio" name="teacher-courses-mode" checked={mode === "all"} onChange={() => setMode("all")} />
          <span><strong>كل المواد المنشورة</strong><small>ومعها كل مادة تُنشر لاحقًا.</small></span>
        </label>
        <label className="eb-owner-access-option">
          <input type="radio" name="teacher-courses-mode" checked={mode === "some"} onChange={() => setMode("some")} />
          <span><strong>مواد محددة فقط</strong><small>لا يرى المعلم غيرها، ولا يقرؤها طلابه.</small></span>
        </label>
        {mode === "some" && courses.map(c => (
          <label key={c.courseId} className="eb-owner-check">
            <input type="checkbox" checked={chosen.has(c.courseId)} onChange={e => toggle(c.courseId, e.target.checked)} />
            <span><bdi>{c.title}</bdi>{c.subject ? <small> · {c.subject}</small> : null}{c.status === "archived" ? " (مؤرشفة: مغلقة للجميع حاليًا)" : ""}</span>
          </label>
        ))}
        {mode === "some" && chosen.size === 0 && <p className="eb-owner-hint">لم تختر أي مادة: لن يرى المعلم وطلابه أي مادة تعليمية.</p>}
      </fieldset>

      <label className="auth-field"><span>سبب التغيير (اختياري، يظهر في «السجل»)</span>
        <div className="auth-input"><input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} placeholder="المواد التعليمية" /></div>
      </label>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-primary" disabled={busy || !dirty} onClick={save}>حفظ المواد</button>
      </div>
      <p className="eb-owner-hint">يُحفظ الاختيار نسخةً جديدة في «السجل»، وتبقى بقية الصلاحيات كما هي.</p>
    </div>
  );
}
