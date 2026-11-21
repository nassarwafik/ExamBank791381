import { useEffect, useMemo, useState, type ReactNode } from "react";
import Dialog from "../ui/Dialog";
import { useConfirm } from "../ui/useConfirm";
import { IconPlus, IconTrash, IconArrowUp, IconArrowDown } from "../icons";
import { TeacherHttpError } from "../teacherFetch";
import { loadSources, saveScheme } from "./gradebookApi";
import SchemeCopyPanel from "./SchemeCopyPanel";
import type { GbGradebook, GbSchemeSaved, GbSource, GbSources } from "./types";
import {
  type Draft, type DraftCategory, fromScheme, fromCopy, copyReport, summarize, toPayload, isDirty, addCategory, removeCategory, setCategoryTitle, setCategoryWeight,
  addItem, removeItem, setItemWeight, moveItem, equalizeCategories, equalizeItems, sourceKey, normalizeDigits, LIMITS
} from "./schemeDraft";

/**
 * Class gradebook GB3 — «مخطط العلامات»: the teacher defines the class's parts (each with its share of the final mark) and, in each part,
 * the assignments, exams, projects and manual columns that count, each with its weight inside the part (docs/enterprise-class-gradebook-gb.md
 * §4.6). The server validates and saves (POST scheme.save over the version the dialog was opened from); this dialog only guides:
 *   - a structural problem blocks «حفظ» with the reason next to the field;
 *   - sums that are not 100 are allowed and saved as a DRAFT (no final mark) — the button says so;
 *   - «توزيع بالتساوي» is the only way weights change without the teacher typing them.
 * A save refused because the scheme changed elsewhere (409 STALE_SCHEME) keeps the teacher's draft and offers to reload.
 */
export type SchemeBuilderDialogProps = {
  open: boolean;
  token: string;
  gradebook: GbGradebook;
  /** False for an archived class or a teacher without assignments.grading.grade: everything is shown read-only. */
  editable: boolean;
  /** GB6b — what the approvals lock (approved parts, or the whole scheme once the final is approved), shown at the top. */
  lockNote?: string;
  onClose: () => void;
  onSaved: (saved: GbSchemeSaved) => void;
  /** Reload the gradebook (after a stale save); the dialog reopens on the new version. */
  onReload: () => void;
};

type SourcesState = { status: "loading" } | { status: "ready"; data: GbSources } | { status: "error"; error: string };

export default function SchemeBuilderDialog(p: SchemeBuilderDialogProps) {
  const original = useMemo(() => fromScheme(p.gradebook.scheme), [p.gradebook.scheme]);
  const [draft, setDraft] = useState<Draft>(original);
  const [sources, setSources] = useState<SourcesState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [copied, setCopied] = useState<{ summary: string; missing: string[] } | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const classId = p.gradebook.classId;

  useEffect(() => {
    let live = true;
    loadSources(p.token, classId)
      .then(data => { if (live) setSources({ status: "ready", data }); })
      .catch(e => { if (live) setSources({ status: "error", error: e instanceof Error ? e.message : "تعذر تحميل الواجبات والمشاريع." }); });
    return () => { live = false; };
  }, [p.token, classId]);

  const summary = useMemo(() => summarize(draft), [draft]);
  const dirty = isDirty(draft, original);
  const readOnly = !p.editable;
  const titles = useMemo(() => sourceTitles(p.gradebook, sources.status === "ready" ? sources.data : null), [p.gradebook, sources]);

  async function close() {
    if (dirty && !readOnly && !(await confirm({ title: "تجاهل التعديلات؟", message: "لم تُحفظ تعديلات مخطط العلامات. هل تريد إغلاق النافذة وتجاهلها؟", confirmLabel: "تجاهل التعديلات", cancelLabel: "متابعة التعديل", tone: "danger" }))) return;
    p.onClose();
  }

  async function save() {
    setShowIssues(true);
    if (summary.blocking.length || busy) return;
    setBusy(true); setError(""); setStale(false);
    try {
      const saved = await saveScheme(p.token, classId, p.gradebook.etags.scheme, toPayload(draft));
      p.onSaved(saved);
    } catch (e) {
      if (e instanceof TeacherHttpError && e.code === "STALE_SCHEME") setStale(true);
      setError(e instanceof Error ? e.message : "تعذر حفظ مخطط العلامات.");
    } finally {
      setBusy(false);
    }
  }

  const saveLabel = summary.complete ? "حفظ المخطط" : "حفظ كمسودة";
  const footer = readOnly
    ? <button type="button" className="eb-button" onClick={p.onClose}>إغلاق</button>
    : <>
      <button type="button" className="eb-button" onClick={() => void close()} disabled={busy}>إلغاء</button>
      <button type="button" className="eb-button is-primary" onClick={() => void save()} disabled={busy || !dirty}>{busy ? "جارٍ الحفظ..." : saveLabel}</button>
    </>;

  return (
    <Dialog open={p.open} title={"مخطط العلامات — " + p.gradebook.className} onClose={() => void close()} size="lg" footer={footer} readOnly={readOnly} className="eb-gb-builder">
      <div className="eb-gb-builder-body">
        <p className="eb-muted eb-gb-intro">
          قسّم العلامة النهائية إلى أقسام (مثل الشهري والفصل الأول والفصل الثاني) ولكل قسم نسبته. ثم اختر ما يُحسب في كل قسم ووزن كل عنصر داخله.
          مجموع نسب الأقسام 100، ومجموع أوزان العناصر في كل قسم 100.
        </p>
        {p.lockNote && <p className="eb-gb-warning" role="status">{p.lockNote}</p>}
        {!readOnly && !p.lockNote && (
          <SchemeCopyPanel token={p.token} classId={classId} onCopied={async proposal => {
            if (draft.categories.length && !(await confirm({ title: "استبدال المخطط؟", message: "سيحلّ مخطط «" + proposal.from.name + "» محلّ المخطط في هذه النافذة. لا يُحفظ شيء قبل «حفظ».", confirmLabel: "استبدال", cancelLabel: "إلغاء" }))) return;
            setDraft(fromCopy(proposal)); setShowIssues(true); setCopied(copyReport(proposal));
          }} />
        )}
        {copied && (
          <div className={copied.missing.length ? "eb-gb-warning" : "platform-notice"} role="status">
            <p className="eb-gb-copy-summary">{copied.summary}</p>
            {copied.missing.length > 0 && <ul className="eb-gb-copy-missing">{copied.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </div>
        )}
        {readOnly && !p.lockNote && <p className="eb-muted" role="status">{p.gradebook.readOnly ? "للعرض فقط: هذا الصف في الأرشيف." : "للعرض فقط: تعديل المخطط يحتاج صلاحية التصحيح."}</p>}
        {error && (
          <div className="platform-error" role="alert">
            {error}
            {stale && <button type="button" className="eb-button is-quiet is-small" onClick={p.onReload}>إعادة التحميل</button>}
          </div>
        )}
        {sources.status === "error" && <div className="platform-error" role="alert">{sources.error}</div>}
        {p.gradebook.withheld.includes("projects") && <p className="eb-muted">أعمدة المشاريع غير متاحة لحسابك.</p>}

        <TotalLine label="مجموع نسب الأقسام" total={summary.categoryTotal} ok={summary.categoriesOk} empty={!draft.categories.length}
          action={!readOnly && draft.categories.length > 1 ? <button type="button" className="eb-button is-quiet is-small" onClick={() => setDraft(equalizeCategories)}>توزيع الأقسام بالتساوي</button> : null} />

        {!draft.categories.length && <p className="eb-muted">لا توجد أقسام بعد.</p>}
        <ol className="eb-gb-categories" aria-label="أقسام العلامة النهائية">
          {draft.categories.map((c, index) => (
            <CategoryCard key={c.key} category={c} index={index} readOnly={readOnly} titles={titles} sources={sources.status === "ready" ? sources.data : null}
              used={summary.usedSources} total={summary.perCategory[c.key]} issues={showIssues ? summary.blocking.filter(x => x.at === c.key || c.items.some(i => i.key === x.at)) : []}
              onChange={setDraft} onRemove={async () => {
                if (c.items.length && !(await confirm({ title: "حذف القسم؟", message: "سيُحذف «" + (c.title.trim() || "القسم") + "» وعناصره من المخطط. لا تُحذف الواجبات أو نتائجها.", confirmLabel: "حذف القسم", tone: "danger" }))) return;
                setDraft(d => removeCategory(d, c.key));
              }} />
          ))}
        </ol>
        {!readOnly && draft.categories.length < LIMITS.categories && (
          <button type="button" className="eb-button is-small" onClick={() => setDraft(d => addCategory(d))}><IconPlus size={16} aria-hidden="true" />إضافة قسم</button>
        )}

        {!readOnly && showIssues && summary.blocking.some(x => x.at === "scheme") && (
          <ul className="eb-gb-issues" role="alert">{summary.blocking.filter(x => x.at === "scheme").map((x, i) => <li key={i}>{x.message}</li>)}</ul>
        )}
        {!readOnly && !summary.complete && draft.categories.length > 0 && (
          <p className="eb-gb-draft-note" role="status">ما دام مجموع النسب ليس 100 يُحفظ المخطط مسودة، ولا تُحسب علامة نهائية للطلاب.</p>
        )}
      </div>
      {confirmDialog}
    </Dialog>
  );
}

function TotalLine({ label, total, ok, empty, action }: { label: string; total: number | null; ok: boolean; empty: boolean; action?: ReactNode }) {
  const text = empty ? "—" : total === null ? "غير مكتمل" : String(total) + " من 100";
  return (
    <div className={"eb-gb-total" + (empty ? "" : ok ? " is-ok" : " is-off")}>
      <span>{label}: <strong>{text}</strong></span>
      {!empty && <span className="eb-gb-total-state">{ok ? "✓ صحيح" : "يجب أن يكون 100"}</span>}
      {action}
    </div>
  );
}

type Titles = (s: GbSource) => { label: string; kind: string };

/** Titles a teacher often gives a mark they enter themselves; a click only fills the title field. */
const MANUAL_SUGGESTIONS = ["الحضور والمشاركة", "الحضور", "المشاركة", "امتحان ورقي"] as const;

function CategoryCard({ category: c, index, readOnly, titles, sources, used, total, issues, onChange, onRemove }: {
  category: DraftCategory; index: number; readOnly: boolean; titles: Titles; sources: GbSources | null; used: Set<string>;
  total: { total: number | null; ok: boolean }; issues: { at: string; message: string }[];
  onChange: (fn: (d: Draft) => Draft) => void; onRemove: () => void;
}) {
  const [pick, setPick] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualMax, setManualMax] = useState("");
  const titleId = "eb-gb-cat-" + c.key;
  const options = sources ? [
    ...sources.assignments.filter(a => !used.has("assignment:" + a.assignmentId)).map(a => ({ value: "assignment:" + a.assignmentId, label: a.title || "واجب بلا عنوان", group: "الواجبات والامتحانات" })),
    ...sources.projects.filter(x => !used.has("project:" + x.projectCode)).map(x => ({ value: "project:" + x.projectCode, label: x.title, group: "المشاريع" }))
  ] : [];
  const manualMaxNumber = Number(normalizeDigits(manualMax));
  const manualOk = manualTitle.trim() !== "" && Number.isInteger(manualMaxNumber) && manualMaxNumber >= 1 && manualMaxNumber <= LIMITS.manualMaxScore;
  const addPicked = () => {
    const [kind, id] = [pick.slice(0, pick.indexOf(":")), pick.slice(pick.indexOf(":") + 1)];
    if (!id) return;
    const source: GbSource = kind === "project" ? { kind: "project", projectCode: id } : { kind: "assignment", assignmentId: id };
    onChange(d => addItem(d, c.key, source)); setPick("");
  };

  return (
    <li className="eb-gb-category">
      <section aria-labelledby={titleId}>
        <div className="eb-gb-category-head">
          <h3 id={titleId} className="eb-gb-category-title">{c.title.trim() || "القسم " + (index + 1)}</h3>
          {!readOnly && <button type="button" className="eb-button is-quiet is-small" onClick={onRemove} aria-label={"حذف القسم " + (c.title.trim() || String(index + 1))}><IconTrash size={16} aria-hidden="true" />حذف القسم</button>}
        </div>
        <div className="eb-gb-category-fields">
          <label className="eb-gb-field">
            <span>عنوان القسم</span>
            <input type="text" value={c.title} maxLength={LIMITS.categoryTitle} disabled={readOnly} placeholder="مثل: علامة الفصل الأول"
              onChange={e => { const v = e.target.value; onChange(d => setCategoryTitle(d, c.key, v)); }} />
          </label>
          <label className="eb-gb-field is-weight">
            <span>النسبة من العلامة النهائية (%)</span>
            <input type="text" inputMode="decimal" value={c.weightText} disabled={readOnly} placeholder="40"
              onChange={e => { const v = e.target.value; onChange(d => setCategoryWeight(d, c.key, v)); }} />
          </label>
        </div>

        {c.items.length > 0 ? (
          <table className="eb-gb-items">
            <caption className="eb-visually-hidden">{"عناصر " + (c.title.trim() || "القسم")}</caption>
            <thead><tr><th scope="col">العنصر</th><th scope="col">النوع</th><th scope="col">الوزن داخل القسم (%)</th>{!readOnly && <th scope="col"><span className="eb-visually-hidden">إجراءات</span></th>}</tr></thead>
            <tbody>
              {c.items.map((item, i) => {
                const t = titles(item.source);
                return (
                  <tr key={item.key}>
                    <th scope="row">{t.label}</th>
                    <td>{t.kind}</td>
                    <td>
                      <input type="text" inputMode="decimal" className="eb-gb-weight" value={item.weightText} disabled={readOnly} aria-label={"وزن " + t.label}
                        onChange={e => { const v = e.target.value; onChange(d => setItemWeight(d, c.key, item.key, v)); }} />
                    </td>
                    {!readOnly && (
                      <td className="eb-gb-item-actions">
                        <button type="button" className="eb-icon-button" aria-label={"تحريك " + t.label + " إلى الأعلى"} disabled={i === 0} onClick={() => onChange(d => moveItem(d, c.key, item.key, -1))}><IconArrowUp size={16} aria-hidden="true" /></button>
                        <button type="button" className="eb-icon-button" aria-label={"تحريك " + t.label + " إلى الأسفل"} disabled={i === c.items.length - 1} onClick={() => onChange(d => moveItem(d, c.key, item.key, 1))}><IconArrowDown size={16} aria-hidden="true" /></button>
                        <button type="button" className="eb-icon-button" aria-label={"إزالة " + t.label} onClick={() => onChange(d => removeItem(d, c.key, item.key))}><IconTrash size={16} aria-hidden="true" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="eb-muted">لا توجد عناصر في هذا القسم بعد. أضف واجبًا أو امتحانًا من المنصة، أو علامة يرصدها المعلم بنفسه مثل الحضور والمشاركة.</p>}

        <TotalLine label="مجموع الأوزان في القسم" total={total.total} ok={total.ok} empty={!c.items.length}
          action={!readOnly && c.items.length > 1 ? <button type="button" className="eb-button is-quiet is-small" onClick={() => onChange(d => equalizeItems(d, c.key))}>توزيع بالتساوي</button> : null} />

        {!readOnly && c.items.length < LIMITS.itemsPerCategory && (
          <div className="eb-gb-add">
            <fieldset className="eb-gb-add-source">
              <legend>من المنصة: واجب أو امتحان أو مشروع</legend>
              <div className="eb-gb-add-row">
            <label className="eb-gb-field">
              <span>إضافة واجب أو امتحان أو مشروع</span>
              <select value={pick} onChange={e => setPick(e.target.value)} disabled={!sources}>
                <option value="">{sources ? (options.length ? "اختر…" : "لا يوجد ما يُضاف") : "جارٍ التحميل…"}</option>
                {["الواجبات والامتحانات", "المشاريع"].map(group => {
                  const list = options.filter(o => o.group === group);
                  return list.length ? <optgroup key={group} label={group}>{list.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup> : null;
                })}
              </select>
            </label>
            <button type="button" className="eb-button is-small" disabled={!pick} onClick={addPicked}><IconPlus size={16} aria-hidden="true" />إضافة</button>
              </div>
            </fieldset>
            <fieldset className="eb-gb-manual">
              <legend>علامة يرصدها المعلم (بلا واجب على المنصة)</legend>
              <p className="eb-muted eb-gb-manual-help">للحضور والمشاركة والامتحان الورقي، وكل علامة تضعها بنفسك. ترصدها بعد الحفظ من «تعديل العلامات».</p>
              <div className="eb-gb-suggest" role="group" aria-label="عناوين مقترحة">
                {MANUAL_SUGGESTIONS.map(s => <button key={s} type="button" className="eb-button is-small is-quiet" onClick={() => setManualTitle(s)}>{s}</button>)}
              </div>
              <div className="eb-gb-add-row">
                <label className="eb-gb-field"><span>العنوان</span><input type="text" value={manualTitle} maxLength={LIMITS.manualTitle} placeholder="مثل: الحضور والمشاركة" onChange={e => setManualTitle(e.target.value)} /></label>
                <label className="eb-gb-field is-weight"><span>العلامة القصوى</span><input type="text" inputMode="numeric" value={manualMax} onChange={e => setManualMax(e.target.value)} placeholder="10" /></label>
                <button type="button" className="eb-button is-small" disabled={!manualOk} onClick={() => {
                  onChange(d => addItem(d, c.key, { kind: "manual", title: manualTitle.trim(), maxScore: manualMaxNumber }));
                  setManualTitle(""); setManualMax("");
                }}><IconPlus size={16} aria-hidden="true" />إضافة علامة يرصدها المعلم</button>
              </div>
            </fieldset>
          </div>
        )}
        {issues.length > 0 && <ul className="eb-gb-issues" role="alert">{issues.map((x, i) => <li key={i}>{x.message}</li>)}</ul>}
      </section>
    </li>
  );
}

/** The label and kind of a source: the server's column titles first, then the sources list; an unknown one says so. */
function sourceTitles(gradebook: GbGradebook, sources: GbSources | null): Titles {
  const byKey = new Map<string, string>();
  for (const col of gradebook.columns) { const k = sourceKey(col.source); if (k && col.title) byKey.set(k, col.title); }
  for (const a of sources?.assignments || []) byKey.set("assignment:" + a.assignmentId, a.title);
  for (const x of sources?.projects || []) byKey.set("project:" + x.projectCode, x.title);
  return s => {
    if (s.kind === "manual") return { label: s.title + " (من " + s.maxScore + ")", kind: "يرصدها المعلم" };
    const k = sourceKey(s) as string;
    return { label: byKey.get(k) || (s.kind === "project" ? "مشروع غير متاح" : "واجب غير متاح"), kind: s.kind === "project" ? "مشروع" : "واجب / امتحان" };
  };
}
