import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../ui/useConfirm";
import { TeacherHttpError } from "../teacherFetch";
import { useCan } from "../shell/teacherAccessContext";
import SectionHeader from "../ui/SectionHeader";
import EmptyState from "../ui/EmptyState";
import { IconEdit, IconPlus } from "../icons";
import { loadGradebook, saveEntries } from "./gradebookApi";
import { type EntriesDraft, afterSave, applyColumnAction, invalidEdits, rebase, setDecision, setScoreText, toItems } from "./entriesDraft";
import SchemeBuilderDialog from "./SchemeBuilderDialog";
import GradebookTable from "./GradebookTable";
import type { AssignmentDrillTarget } from "../assignments/drillTarget";
import type { GbGradebook } from "./types";
import "./gradebook.css";

/**
 * Class gradebook — «سجل العلامات» for the selected class, under its roster (docs/enterprise-class-gradebook-gb.md §4.6, O2). GB3: the
 * scheme summary and the builder; GB4: the table of marks under it. Presentation only: the server decides access (assignments.assignment.view
 * to read, assignments.grading.grade to edit — owner decision O1) and computes everything. A class switch drops the previous class's data
 * (a response for a class the teacher has left is ignored).
 *
 * GB5 — «تعديل العلامات»: manual scores and excused / zero decisions are edited in the table and saved together («حفظ العلامات (N)»),
 * each with the value the teacher saw. The unsaved edits belong to their class (a class switch keeps them for when the teacher comes
 * back); leaving the edit mode or the page with unsaved edits asks first. After a save the gradebook is read again: applied edits leave
 * the draft, and an edit whose cell changed elsewhere stays, shown with the server's value.
 */
type Load = { classId: string; status: "loading" } | { classId: string; status: "ready"; data: GbGradebook } | { classId: string; status: "error"; error: string };

export default function ClassGradebookPanel({ token, classroom, classActive, onOpenAssignment }: { token: string; classroom: { classId: string; name: string } | null; classActive: boolean; onOpenAssignment?: (target: AssignmentDrillTarget) => void }) {
  const can = useCan();
  const classId = classroom?.classId || "";
  const [load, setLoad] = useState<Load | null>(null);
  // The builder and the notice belong to ONE class: switching class closes / hides them by derivation, with no effect-driven reset.
  const [builderFor, setBuilderFor] = useState("");
  const [noticeFor, setNoticeFor] = useState({ classId: "", text: "" });
  const builderOpen = builderFor !== "" && builderFor === classId;
  const notice = noticeFor.classId === classId ? noticeFor.text : "";
  const [editFor, setEditFor] = useState("");
  const [drafts, setDrafts] = useState<Record<string, EntriesDraft>>({});
  const [saving, setSaving] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const editing = editFor !== "" && editFor === classId;
  const draft = drafts[classId] || {};
  const dirtyCount = Object.keys(draft).length;
  const anyDirty = Object.values(drafts).some(d => Object.keys(d).length > 0);
  // Leaving the page (reload, close) with unsaved marks asks the browser's own question.
  useEffect(() => {
    if (!anyDirty) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [anyDirty]);

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
  const setDraft = (fn: (d: EntriesDraft) => EntriesDraft) => setDrafts(all => ({ ...all, [classId]: fn(all[classId] || {}) }));
  const invalid = data ? new Set(invalidEdits(draft, data)) : new Set<string>();

  async function leaveEditing() {
    if (dirtyCount && !(await confirm({ title: "تجاهل التعديلات؟", message: "لم تُحفظ " + dirtyCount + " من التعديلات. هل تريد إنهاء التعديل وتجاهلها؟", confirmLabel: "تجاهل التعديلات", cancelLabel: "متابعة التعديل", tone: "danger" }))) return;
    setDrafts(all => ({ ...all, [classId]: {} }));
    setEditFor("");
  }
  async function saveMarks() {
    if (!data || saving || !dirtyCount || invalid.size) return;
    const id = classId, items = toItems(draft, data);
    setSaving(true);
    let text = "";
    try {
      const saved = await saveEntries(token, id, items);
      setDrafts(all => ({ ...all, [id]: afterSave(all[id] || {}, saved.applied, []) }));
      text = "✓ حُفظ " + saved.applied.length + " من التعديلات." + (saved.stale.length ? " " + saved.stale.length + " خانة تغيّرت في مكان آخر: راجعها ثم احفظ." : "");
    } catch (e) {
      text = e instanceof TeacherHttpError && e.code === "STALE_ENTRIES" ? "تغيّرت هذه الخانات في مكان آخر قبل الحفظ: راجع القيم الظاهرة ثم احفظ." : (e instanceof Error ? e.message : "تعذر حفظ العلامات.");
    }
    try {
      const fresh = await loadGradebook(token, id);
      setLoad({ classId: id, status: "ready", data: fresh });
      setDrafts(all => ({ ...all, [id]: rebase(all[id] || {}, fresh) }));
    } catch { /* the table keeps the last read; the notice says what happened */ }
    setNoticeFor({ classId: id, text });
    setSaving(false);
  }
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
          {editable && !editing && <button type="button" className="eb-button is-small" onClick={() => setEditFor(classId)}><IconEdit size={16} aria-hidden="true" />تعديل العلامات</button>}
          {editing && (
            <div className="eb-gb-savebar" role="group" aria-label="حفظ العلامات">
              <p className="eb-muted">اكتب علامات الأعمدة اليدوية، أو اختر «معفى» أو «صفر» لأي خانة. لا يُحفظ شيء قبل «حفظ العلامات».</p>
              <button type="button" className="eb-button is-primary is-small" disabled={saving || !dirtyCount || invalid.size > 0} onClick={() => void saveMarks()}>{saving ? "جارٍ الحفظ..." : "حفظ العلامات (" + dirtyCount + ")"}</button>
              <button type="button" className="eb-button is-small" disabled={saving || !dirtyCount} onClick={() => setDrafts(all => ({ ...all, [classId]: {} }))}>تجاهل التغييرات</button>
              <button type="button" className="eb-button is-quiet is-small" disabled={saving} onClick={() => void leaveEditing()}>إنهاء التعديل</button>
              {invalid.size > 0 && <span className="eb-gb-edit-note is-error" role="alert">{"صحّح " + invalid.size + " من العلامات قبل الحفظ."}</span>}
            </div>
          )}
          <GradebookTable gradebook={data} onOpenAssignment={editing ? undefined : onOpenAssignment} edit={editing ? {
            draft, invalid,
            onDecision: (itemId, studentId, d) => setDraft(x => setDecision(x, data, itemId, studentId, d)),
            onScore: (itemId, studentId, t) => setDraft(x => setScoreText(x, data, itemId, studentId, t)),
            onColumnAction: (itemId, ids, a) => setDraft(x => applyColumnAction(x, data, itemId, ids, a))
          } : undefined} />
        </>
      )}
      {data && builderOpen && (
        <SchemeBuilderDialog key={classId + ":" + (data.etags.scheme || "new")} open token={token} gradebook={data} editable={editable}
          onClose={() => setBuilderFor("")}
          onSaved={saved => { setBuilderFor(""); setNoticeFor({ classId, text: saved.status === "active" ? "✓ حُفظ مخطط العلامات." : "حُفظ المخطط مسودة: أكمل النسب حتى يصبح مجموعها 100." }); refresh(classId); }}
          onReload={() => { setBuilderFor(""); refresh(classId); }} />
      )}
      {confirmDialog}
    </section>
  );
}
