import { useCallback, useEffect, useState } from "react";
import { useCan } from "../shell/teacherAccessContext";
import SectionHeader from "../ui/SectionHeader";
import EmptyState from "../ui/EmptyState";
import { IconEdit, IconPlus } from "../icons";
import { loadGradebook } from "./gradebookApi";
import SchemeBuilderDialog from "./SchemeBuilderDialog";
import type { GbGradebook } from "./types";
import "./gradebook.css";

/**
 * Class gradebook — «سجل العلامات» for the selected class, under its roster (docs/enterprise-class-gradebook-gb.md §4.6, O2). GB3: the
 * scheme summary and the builder; GB4 adds the table of marks here. Presentation only: the server decides access (assignments.assignment.view
 * to read, assignments.grading.grade to edit — owner decision O1) and computes everything. A class switch drops the previous class's data
 * (a response for a class the teacher has left is ignored).
 */
type Load = { classId: string; status: "loading" } | { classId: string; status: "ready"; data: GbGradebook } | { classId: string; status: "error"; error: string };

export default function ClassGradebookPanel({ token, classroom, classActive }: { token: string; classroom: { classId: string; name: string } | null; classActive: boolean }) {
  const can = useCan();
  const classId = classroom?.classId || "";
  const [load, setLoad] = useState<Load | null>(null);
  // The builder and the notice belong to ONE class: switching class closes / hides them by derivation, with no effect-driven reset.
  const [builderFor, setBuilderFor] = useState("");
  const [noticeFor, setNoticeFor] = useState({ classId: "", text: "" });
  const builderOpen = builderFor !== "" && builderFor === classId;
  const notice = noticeFor.classId === classId ? noticeFor.text : "";

  // Fetches the class's gradebook; a response for a class the teacher has left is ignored. No state is set before the request:
  // a class without a loaded answer reads as «loading» (derived below).
  const fetchGradebook = useCallback((id: string) => {
    let live = true;
    loadGradebook(token, id)
      .then(data => { if (live) setLoad({ classId: id, status: "ready", data }); })
      .catch(e => { if (live) setLoad({ classId: id, status: "error", error: e instanceof Error ? e.message : "تعذر تحميل سجل العلامات." }); });
    return () => { live = false; };
  }, [token]);
  const refresh = (id: string) => { setLoad({ classId: id, status: "loading" }); fetchGradebook(id); };

  // A teacher who may not see assignments gets no panel and sends no request (the server would refuse it anyway).
  const allowed = can("assignments.assignment.view");
  useEffect(() => (classId && allowed ? fetchGradebook(classId) : undefined), [classId, allowed, fetchGradebook]);

  if (!classroom || !allowed) return null;
  const current = load && load.classId === classId ? load : null;
  const data = current && current.status === "ready" ? current.data : null;
  const editable = classActive && !(data && data.readOnly) && can("assignments.grading.grade");
  const scheme = data?.scheme || null;
  const action = data && (editable || scheme) ? (
    <button type="button" className={"eb-button is-small" + (scheme ? "" : " is-primary")} onClick={() => setBuilderFor(classId)}>
      {scheme ? <><IconEdit size={16} aria-hidden="true" />{editable ? "تعديل مخطط العلامات" : "عرض مخطط العلامات"}</> : <><IconPlus size={16} aria-hidden="true" />إنشاء مخطط العلامات</>}
    </button>
  ) : null;

  return (
    <section className="eb-gb-panel" aria-labelledby="eb-gb-panel-title">
      <SectionHeader level={2} id="eb-gb-panel-title" title="سجل العلامات"
        description={"كيف تُحسب العلامة النهائية لطلاب «" + classroom.name + "»: الأقسام ونسبها، وما يُحسب في كل قسم."}
        actions={scheme ? action : undefined} />
      {notice && <p className="platform-notice" role="status">{notice}</p>}
      {!current || current.status === "loading" ? <p className="eb-muted" role="status">جارٍ تحميل سجل العلامات...</p> : null}
      {current && current.status === "error" && (
        <div className="platform-error" role="alert">
          {current.error}
          <button type="button" className="eb-button is-quiet is-small" onClick={() => refresh(classId)}>إعادة المحاولة</button>
        </div>
      )}
      {data && !scheme && (
        <EmptyState title="لم يُعرَّف مخطط العلامات لهذا الصف بعد."
          description={editable ? "حدّد أقسام العلامة النهائية ونسبها، ثم اختر الواجبات والامتحانات والمشاريع التي تُحسب في كل قسم." : undefined}
          action={editable ? action : undefined} />
      )}
      {data && scheme && (
        <>
          <p className={"eb-gb-status" + (data.schemeStatus === "active" ? " is-ok" : " is-off")} role="status">
            {data.schemeStatus === "active" ? "✓ المخطط مكتمل: مجموع النسب 100." : "مسودة: مجموع النسب ليس 100، فلا تُحسب علامة نهائية بعد."}
          </p>
          <ul className="eb-gb-summary" aria-label="أقسام العلامة النهائية">
            {scheme.categories.map(c => (
              <li key={c.categoryId}><strong>{c.title}</strong> <span>{c.weight}%</span> <span className="eb-muted">{c.items.length === 1 ? "عنصر واحد" : c.items.length === 2 ? "عنصران" : c.items.length + " عناصر"}</span></li>
            ))}
          </ul>
          {data.warnings.length > 0 && <p className="eb-gb-warning" role="status">{"مصدر مفقود في " + data.warnings.length + " من الأعمدة: لا يُحسب صفرًا، راجع المخطط."}</p>}
          {data.readOnly && <p className="eb-muted">للعرض فقط: هذا الصف في الأرشيف.</p>}
        </>
      )}
      {data && builderOpen && (
        <SchemeBuilderDialog key={classId + ":" + (data.etags.scheme || "new")} open token={token} gradebook={data} editable={editable}
          onClose={() => setBuilderFor("")}
          onSaved={saved => { setBuilderFor(""); setNoticeFor({ classId, text: saved.status === "active" ? "✓ حُفظ مخطط العلامات." : "حُفظ المخطط مسودة: أكمل النسب حتى يصبح مجموعها 100." }); refresh(classId); }}
          onReload={() => { setBuilderFor(""); refresh(classId); }} />
      )}
    </section>
  );
}
