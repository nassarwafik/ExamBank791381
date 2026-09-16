import SectionHeader from "../ui/SectionHeader";
import IconButton from "../ui/IconButton";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import ActionMenu from "./ActionMenu";
import { IconPlus, IconRefresh, IconArchive, IconRestore, IconGraduation } from "../icons";
import { normalizeClassStatus } from "../classLifecycle";
import { getClassProgramCodes } from "../projects/classPrograms";
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
  onRefresh: () => void;
  loading: boolean;
  busy: boolean;
  fmtDate: (value: string) => string;
};

export default function ClassesPane(p: ClassesPaneProps) {
  const isActive = (c: Classroom) => normalizeClassStatus(c) === "active";
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
      <div className="eb-segmented" role="group" aria-label="عرض الصفوف">
        <button type="button" aria-pressed={p.view === "active"} onClick={() => p.onViewChange("active")}>الصفوف النشطة<span className="eb-segmented-count">{p.activeCount}</span></button>
        <button type="button" aria-pressed={p.view === "archived"} onClick={() => p.onViewChange("archived")}>الأرشيف<span className="eb-segmented-count">{p.archivedCount}</span></button>
      </div>
      {p.loading && p.classes.length === 0 && <div className="platform-loading" role="status">جارٍ التحميل...</div>}
      <ul className="class-list eb-class-list">
        {p.classes.map(classroom => {
          const active = isActive(classroom);
          const codes = getClassProgramCodes(classroom);
          const selected = classroom.classId === p.selectedClassId;
          return (
            <li key={classroom.classId} className={"class-row eb-class-row" + (selected ? " selected" : "") + (active ? "" : " archived")}>
              <button type="button" className="eb-class-select" aria-pressed={selected} onClick={() => p.onSelect(classroom.classId)}>
                <span className="eb-class-name">{classroom.name}</span>
                <span className="eb-class-meta">{classroom.grade || "—"} · {classroom.studentCount} طالب{classroom.schoolYear ? " · " + classroom.schoolYear : ""}</span>
                <span className="eb-class-chips">
                  {codes.length ? codes.map(code => <span key={code} className="eb-chip">{p.projectTitle(code)}</span>) : <span className="eb-chip is-muted">بدون مشروع</span>}
                </span>
                {!active && <span className="eb-class-meta"><StatusBadge tone="neutral">{classroom.archiveReason === "graduated" ? "مُخرَّج" : "مؤرشف"}</StatusBadge>{classroom.archivedAt ? " · " + p.fmtDate(classroom.archivedAt) : ""}{classroom.graduationYear ? " · دفعة " + classroom.graduationYear : ""}</span>}
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
                {active && p.isGraduationEligible(classroom) && <button type="button" className="eb-menu-item" onClick={() => p.onGraduate(classroom)} disabled={p.busy}><IconGraduation size={16} />تخريج وأرشفة الصف</button>}
                <button type="button" className="eb-menu-item" onClick={() => p.onToggleArchive(classroom)} disabled={p.busy}>{active ? <><IconArchive size={16} />أرشفة الصف</> : <><IconRestore size={16} />تفعيل</>}</button>
              </ActionMenu>
            </li>
          );
        })}
      </ul>
      {!p.loading && p.classes.length === 0 && (
        p.view === "active"
          ? <EmptyState compact title="لا توجد صفوف نشطة بعد." description="أنشئ أول صف لبدء إضافة الطلاب." action={<button type="button" className="eb-button is-primary is-small" onClick={p.onCreate}><IconPlus size={16} />إنشاء صف</button>} />
          : <EmptyState compact title="لا توجد صفوف مؤرشفة." description="الصفوف المؤرشفة أو المُخرَّجة تظهر هنا مع الاحتفاظ ببياناتها." />
      )}
    </section>
  );
}
