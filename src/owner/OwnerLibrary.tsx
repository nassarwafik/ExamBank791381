import { useEffect, useMemo, useState } from "react";
import { IconWarning } from "../icons";
import { ownerLibraryApi, type ApiResult, type LibraryAudience, type OwnerLibraryItem, type OwnerLibraryTeacher } from "./ownerApi";
import { CATEGORY_LABELS, categoryLabel } from "../examLibrary";
import { SAVE_LABELS } from "../teacher/saveLabels";
import StepUpPrompt from "./StepUpPrompt";
import { audienceText, matchesSearch } from "./libraryShared";

/**
 * Tadris+ P6-D — «بنك الامتحانات» in the Owner Console (#/owner/exams, /api/owner-library): who sees each library exam.
 *   - every exam with its audience: «لكل المعلمين» (in every teacher's bank, including teachers added later), «N معلمين» (only the
 *     teachers chosen), or «لم يُحدَّد بعد» (an exam added to the library later: nobody sees it until you choose);
 *   - «تحديد الجمهور» opens one exam: everyone, or a group of teachers chosen at once (with a search);
 *   - one teacher's whole bank is chosen on the teacher's page («الامتحانات»).
 * Removing an exam from a teacher never touches the assignments already published from it. Every change needs a recent second-factor
 * check (asked inline, then retried). The server decides everything; a 401 signs out.
 * UX-O3 — presentation only (design docs/enterprise-ux-owner-console-o3.md §2.1): the exams are a table (one row group per exam,
 * named after it), filtered by who sees them (the same rule as `audienceText`); «تحديد الجمهور» opens its editor in a full-width
 * row under the exam. The request, its step-up and its notice are unchanged.
 */
type AudienceFilter = "all" | "everyone" | "selected" | "undecided";
const AUDIENCE_FILTERS: { id: AudienceFilter; label: string; test: (i: OwnerLibraryItem) => boolean }[] = [
  { id: "all", label: "الكل", test: () => true },
  { id: "everyone", label: "لكل المعلمين", test: i => i.audience === "all" },
  { id: "selected", label: "معلمون محددون", test: i => i.audience !== "all" && i.decided },
  { id: "undecided", label: "لم يُحدَّد", test: i => i.audience !== "all" && !i.decided }
];

export default function OwnerLibrary({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [data, setData] = useState<{ items: OwnerLibraryItem[]; teachers: OwnerLibraryTeacher[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUp, setStepUp] = useState<{ retry: () => Promise<void> } | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");

  useEffect(() => {
    let live = true;
    void ownerLibraryApi.list(token).then(r => {
      if (!live) return;
      if (r.ok) setData({ items: r.data.items, teachers: r.data.teachers });
      else if (r.status === 401) onSignedOut();
      else setError(r.error);
    });
    return () => { live = false; };
  }, [token, nonce, onSignedOut]);

  async function send<T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await call();
    setBusy(false);
    if (r.ok) { setStepUp(null); onOk(r.data); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp({ retry: () => send(call, onOk) }); return; }
    setStepUp(null);
    setError(r.error);
  }

  const categories = useMemo(() => [...new Set((data?.items || []).map(i => i.category).filter(Boolean))], [data]);
  const searched = (data?.items || []).filter(i => (!category || i.category === category) && matchesSearch(i, query));
  const counts = Object.fromEntries(AUDIENCE_FILTERS.map(f => [f.id, searched.filter(f.test).length])) as Record<AudienceFilter, number>;
  const byAudience = (AUDIENCE_FILTERS.find(f => f.id === audienceFilter) || AUDIENCE_FILTERS[0]).test;
  const shown = searched.filter(byAudience);
  const clearFilters = () => { setQuery(""); setCategory(""); setAudienceFilter("all"); };

  return (
    <section className="eb-owner-panel eb-owner-library" aria-labelledby="eb-owner-library-title">
      <h2 id="eb-owner-library-title" className="eb-owner-h2">بنك الامتحانات{data && <span className="eb-owner-h2-count"> · {data.items.length} امتحانًا</span>}</h2>
      <p className="eb-owner-hint">اختر من يرى كل امتحان: كل المعلمين، أو مجموعة تختارها. بنك المعلم يحوي ما هو «لكل المعلمين» وما اخترته له، ومنه يسند الواجبات لطلابه. لاختيار بنك معلم بعينه افتح صفحته ← «الامتحانات». إزالة امتحان لا تمس الواجبات المنشورة منه.</p>

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}

      {data === null && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل بنك الامتحانات…</p>}
      {data && (
        <>
          <div className="eb-owner-toolbar" role="search">
            <label className="auth-field eb-owner-search"><span>بحث</span>
              <div className="auth-input"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="اسم الامتحان أو رمزه" /></div>
            </label>
            <label className="auth-field eb-owner-library-category"><span>التصنيف</span>
              <div className="auth-input"><select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">الكل</option>
                {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ? categoryLabel(c) : c}</option>)}
              </select></div>
            </label>
            <div className="eb-owner-chips" role="group" aria-label="تصفية حسب من يراه">
              {AUDIENCE_FILTERS.map(f => (
                <button key={f.id} type="button" className={"eb-owner-chip" + (audienceFilter === f.id ? " is-on" : "")} aria-pressed={audienceFilter === f.id} onClick={() => setAudienceFilter(f.id)}>
                  {f.label}<span className="eb-owner-chip-count">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="eb-owner-hint">{shown.length} من {data.items.length} امتحانًا</p>
          <div className="eb-table-wrap eb-owner-teacher-table-wrap eb-owner-library-table-wrap">
            <table className="eb-table eb-owner-teacher-table eb-owner-library-table">
              <caption className="eb-visually-hidden">امتحانات المكتبة</caption>
              <thead>
                <tr><th scope="col">الامتحان</th><th scope="col">التصنيف</th><th scope="col">الأسئلة</th><th scope="col">من يراه</th><th scope="col"><span className="eb-visually-hidden">الإجراءات</span></th></tr>
              </thead>
              {shown.map(item => (
                <tbody key={item.libraryItemId} className="eb-owner-teacher-group" aria-label={item.title}>
                  <tr className={"eb-owner-teacher-row" + (editing === item.libraryItemId ? " is-open" : "")}>
                    <td className="eb-owner-teacher-who"><strong><bdi>{item.title}</bdi></strong><span className="eb-owner-teacher-user" dir="ltr">{item.libraryItemId}</span></td>
                    <td className="eb-owner-library-meta">{categoryLabel(item.category)}</td>
                    <td className="eb-owner-library-meta eb-owner-library-count"><bdi>{item.questionCount}</bdi><span className="eb-owner-library-unit"> سؤال</span></td>
                    <td className="eb-owner-library-meta"><span className={"eb-owner-status eb-owner-status--" + (item.audience === "all" ? "active" : item.decided ? "invited" : "suspended")}>{audienceText(item)}</span></td>
                    <td className="eb-owner-teacher-menu eb-owner-library-action">
                      <button type="button" className="eb-owner-secondary eb-owner-small" disabled={busy} aria-expanded={editing === item.libraryItemId}
                        onClick={() => setEditing(e => (e === item.libraryItemId ? null : item.libraryItemId))}>تحديد الجمهور</button>
                    </td>
                  </tr>
                  {editing === item.libraryItemId && (
                    <tr className="eb-owner-teacher-panel">
                      <td colSpan={5}>
                        <AudienceEditor item={item} teachers={data.teachers} busy={busy} onCancel={() => setEditing(null)}
                          onSave={(audience, teachers) => send(() => ownerLibraryApi.setAudience(token, item.libraryItemId, audience, teachers), () => {
                            setEditing(null);
                            setNotice("حُفظ جمهور «" + item.title + "».");
                            setNonce(n => n + 1);
                          })} />
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
              {shown.length === 0 && (
                <tbody>
                  <tr><td className="eb-table-empty" colSpan={5}>لا امتحان يطابق البحث. <button type="button" className="eb-owner-link" onClick={clearFilters}>مسح التصفية</button></td></tr>
                </tbody>
              )}
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function AudienceEditor({ item, teachers, busy, onSave, onCancel }: {
  item: OwnerLibraryItem; teachers: OwnerLibraryTeacher[]; busy: boolean; onSave: (audience: LibraryAudience, teachers: string[]) => void; onCancel: () => void;
}) {
  const [audience, setAudience] = useState<LibraryAudience>(item.audience);
  const [chosen, setChosen] = useState<Set<string>>(new Set(item.teachers));
  const [q, setQ] = useState("");
  const visible = teachers.filter(t => !q.trim() || (t.displayName + " " + t.username).toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const name = "eb-aud-" + item.libraryItemId;
  return (
    <form className="auth-form eb-owner-create" aria-label={"جمهور " + item.title} onSubmit={e => { e.preventDefault(); onSave(audience, audience === "all" ? [] : [...chosen].sort()); }}>
      <fieldset className="eb-owner-cap-group">
        <legend>من يرى هذا الامتحان؟</legend>
        <label className="eb-owner-check"><input type="radio" name={name} checked={audience === "all"} onChange={() => setAudience("all")} /> لكل المعلمين (ومن يُضاف لاحقًا)</label>
        <label className="eb-owner-check"><input type="radio" name={name} checked={audience === "selected"} onChange={() => setAudience("selected")} /> معلمون أختارهم</label>
      </fieldset>
      {audience === "selected" && (
        <fieldset className="eb-owner-cap-group">
          <legend>المعلمون ({chosen.size} مختار)</legend>
          <label className="auth-field"><span>بحث عن معلم</span>
            <div className="auth-input"><input type="search" value={q} onChange={e => setQ(e.target.value)} /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" onClick={() => setChosen(s => new Set([...s, ...visible.map(t => t.accountId)]))}>تحديد الظاهرين</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setChosen(new Set())}>إلغاء التحديد</button>
          </div>
          {visible.map(t => (
            <label key={t.accountId} className="eb-owner-check"><input type="checkbox" checked={chosen.has(t.accountId)} onChange={() => toggle(t.accountId)} /> <bdi>{t.displayName}</bdi> <span dir="ltr" className="eb-owner-hint">{t.username}</span></label>
          ))}
          {!visible.length && <p className="eb-owner-hint">لا يوجد معلمون مطابقون.</p>}
        </fieldset>
      )}
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>{SAVE_LABELS.saveChanges}</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
