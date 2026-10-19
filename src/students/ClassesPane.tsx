import { useEffect, useRef, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import IconButton from "../ui/IconButton";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import ActionMenu from "../ui/ActionMenu";
import { IconPlus, IconRefresh, IconArchive, IconRestore, IconGraduation, IconEdit, IconSearch } from "../icons";
import { matchesSearch } from "./rosterText";
import { normalizeClassStatus } from "../classLifecycle";
import { getClassProgramCodes } from "../projects/classPrograms";
import { arabicCount, STUDENTS } from "../learning/arabicCount";
import type { Classroom, ClassArchiveView, ProjectOption } from "./types";

export type ClassesPaneProps = {
  classes: Classroom[];              // the rows for the current view (active or archived), already filtered by TeacherPlatform
  view: ClassArchiveView;
  onViewChange: (view: ClassArchiveView) => void;
  activeCount: number;
  archivedCount: number;
  selectedClassId: string;
  onSelect: (classId: string) => void;
  projects: ProjectOption[];
  projectTitle: (code: string) => string;
  isGraduationEligible: (classroom: Classroom) => boolean;
  onToggleProject: (classroom: Classroom, code: string, enable: boolean) => void;
  onToggleArchive: (classroom: Classroom) => void;
  onGraduate: (classroom: Classroom) => void;
  onCreate: () => void;
  /** Edit the class details (name / grade / school year). Omitted → no edit item (older hosts). */
  onEdit?: (classroom: Classroom) => void;
  onRefresh: () => void;
  loading: boolean;
  /** Phase S.0 — the classes read failed: an error with «إعادة المحاولة», never «no classes yet». */
  loadError?: string;
  onRetry?: () => void;
  busy: boolean;
  /** The archive date of an archived card (a day, not a time). */
  fmtDate: (value: string) => string;
};

// The class filter appears only once the list is long enough to need it; it folds Arabic spelling variants.
const CLASS_FILTER_THRESHOLD = 7;

export default function ClassesPane(p: ClassesPaneProps) {
  const isActive = (c: Classroom) => normalizeClassStatus(c) === "active";
  const [query, setQuery] = useState("");
  const showFilter = p.activeCount + p.archivedCount >= CLASS_FILTER_THRESHOLD;
  const rows = showFilter && query.trim() ? p.classes.filter(c => matchesSearch([c.name, c.grade, c.schoolYear], query)) : p.classes;
  // U.1 — the class bar scrolls on its own (two rows of cards on a wide screen, a sideways strip on a phone): the selected card is
  // kept in view by scrolling the LIST only, never the page (a teacher scrolled down the roster stays where they are).
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(".eb-class-row.selected");
    if (!list || !card) return;
    const l = list.getBoundingClientRect(), c = card.getBoundingClientRect();
    if (c.top < l.top) list.scrollTop -= l.top - c.top; else if (c.bottom > l.bottom) list.scrollTop += c.bottom - l.bottom;
    // sideways (the phone strip snaps each card's start edge): align the card's start with the strip's start — a snap position,
    // so the snapping does not pull the strip back
    const rtl = getComputedStyle(list).direction === "rtl";
    if (c.left < l.left || c.right > l.right) list.scrollLeft += rtl ? c.right - l.right : c.left - l.left;
  }, [p.selectedClassId, p.view, rows.length]);
  return (
    <section className="eb-classes-pane" aria-labelledby="eb-classes-title">
      <SectionHeader
        level={2}
        id="eb-classes-title"
        title="الصفوف"
        description={`${p.activeCount} نشطة · ${p.archivedCount} في الأرشيف`}
        actions={<>
          <button type="button" className="eb-button is-primary is-small" onClick={p.onCreate}><IconPlus size={16} />إنشاء صف</button>
          <IconButton label="تحديث" icon={<IconRefresh size={18} />} onClick={p.onRefresh} disabled={p.loading} />
        </>}
      />
      <div className="eb-class-toolbar">
        <div className="eb-segmented" role="group" aria-label="عرض الصفوف">
          <button type="button" aria-pressed={p.view === "active"} onClick={() => p.onViewChange("active")}>الصفوف النشطة<span className="eb-segmented-count">{p.activeCount}</span></button>
          <button type="button" aria-pressed={p.view === "archived"} onClick={() => p.onViewChange("archived")}>الأرشيف<span className="eb-segmented-count">{p.archivedCount}</span></button>
        </div>
        {showFilter && (
          <label className="student-search-field eb-search-field eb-class-filter">
            <IconSearch size={16} aria-hidden="true" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="تصفية الصفوف بالاسم أو المرحلة أو السنة" aria-label="تصفية الصفوف" />
          </label>
        )}
      </div>
      {p.loading && p.classes.length === 0 && <div className="platform-loading" role="status">جارٍ التحميل...</div>}
      <ul ref={listRef} className="class-list eb-class-list">
        {rows.map(classroom => {
          const active = isActive(classroom);
          const codes = getClassProgramCodes(classroom);
          const selected = classroom.classId === p.selectedClassId;
          return (
            <li key={classroom.classId} className={"class-row eb-class-row" + (selected ? " selected" : "") + (active ? "" : " archived")}>
              <button type="button" className="eb-class-select" aria-pressed={selected} onClick={() => p.onSelect(classroom.classId)}>
                <span className="eb-class-name">{classroom.name}</span>
                <span className="eb-class-meta">{classroom.grade || "—"} · {arabicCount(classroom.studentCount, STUDENTS)}{classroom.schoolYear ? <> · <bdi dir="ltr">{classroom.schoolYear}</bdi></> : ""}</span>
                <span className="eb-class-chips">
                  {codes.length ? codes.map(code => <span key={code} className="eb-chip">{p.projectTitle(code)}</span>) : <span className="eb-chip is-muted">بدون مشروع</span>}
                </span>
                {!active && (() => {
                  // U.2 — the archive line: the badge, then the day it was archived and the graduation year (no leading «·»)
                  const details = [classroom.archivedAt ? "في " + p.fmtDate(classroom.archivedAt) : "", classroom.graduationYear ? "دفعة " + classroom.graduationYear : ""].filter(Boolean).join(" · ");
                  return <span className="eb-class-meta eb-class-archive-line"><StatusBadge tone="neutral">{classroom.archiveReason === "graduated" ? "مُخرَّج" : "مؤرشف"}</StatusBadge>{details && <span>{details}</span>}</span>;
                })()}
              </button>
              <ActionMenu label={"إجراءات الصف " + classroom.name} className="eb-class-menu">
                {active && p.projects.length > 0 && (
                  <div className="eb-menu-group" role="group" aria-label="المشاريع">
                    <span className="eb-menu-label">المشاريع</span>
                    {p.projects.map(project => {
                      const on = codes.includes(project.projectCode);
                      return <label key={project.projectCode} className={"eb-menu-check" + (on ? " is-on" : "")}><input type="checkbox" checked={on} disabled={p.busy} onChange={e => p.onToggleProject(classroom, project.projectCode, e.target.checked)} />{project.title}</label>;
                    })}
                  </div>
                )}
                {active && p.onEdit && <button type="button" className="eb-menu-item" onClick={() => p.onEdit?.(classroom)} disabled={p.busy}><IconEdit size={16} />تعديل بيانات الصف</button>}
                {active && p.isGraduationEligible(classroom) && <button type="button" className="eb-menu-item" onClick={() => p.onGraduate(classroom)} disabled={p.busy}><IconGraduation size={16} />تخريج وأرشفة الصف</button>}
                <button type="button" className="eb-menu-item" onClick={() => p.onToggleArchive(classroom)} disabled={p.busy}>{active ? <><IconArchive size={16} />أرشفة الصف</> : <><IconRestore size={16} />تفعيل</>}</button>
              </ActionMenu>
            </li>
          );
        })}
      </ul>
      {showFilter && query.trim() && p.classes.length > 0 && rows.length === 0 && <p className="eb-muted">لا توجد صفوف مطابقة للتصفية.</p>}
      {p.loadError && p.classes.length === 0 && (
        <div className="eb-classes-load-error" role="alert">
          <EmptyState compact title="تعذر تحميل الصفوف." description={p.loadError} action={p.onRetry ? <button type="button" className="eb-button is-small" onClick={p.onRetry}><IconRefresh size={16} />إعادة المحاولة</button> : undefined} />
        </div>
      )}
      {!p.loading && !p.loadError && p.classes.length === 0 && (
        p.view === "active"
          ? <EmptyState compact title="لا توجد صفوف نشطة بعد." description="أنشئ أول صف لبدء إضافة الطلاب." action={<button type="button" className="eb-button is-primary is-small" onClick={p.onCreate}><IconPlus size={16} />إنشاء صف</button>} />
          : <EmptyState compact title="لا توجد صفوف مؤرشفة." description="الصفوف المؤرشفة أو المُخرَّجة تظهر هنا مع الاحتفاظ ببياناتها." />
      )}
    </section>
  );
}
