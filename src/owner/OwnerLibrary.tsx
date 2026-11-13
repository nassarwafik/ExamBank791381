import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { IconUpload, IconWarning } from "../icons";
import { ownerLibraryApi, type ApiResult, type OwnerLibraryItem, type OwnerLibraryTeacher } from "./ownerApi";
import { CATEGORY_LABELS, categoryLabel } from "../examLibrary";
import StepUpPrompt from "./StepUpPrompt";
import { audienceText, matchesSearch } from "./libraryShared";
import AudienceEditor from "./OwnerAudienceEditor";
import { lazyWithRetry } from "../lazyWithRetry";

// Tadris+ P6-E — the import (its parser and checks) loads only when the owner opens it.
const OwnerLibraryImport = lazy(lazyWithRetry(() => import("./OwnerLibraryImport"), "owner-library-import"));
// Tadris+ P6-F — the exams teachers send (and the owner's own): loads only when opened.
const OwnerLibrarySubmissions = lazy(lazyWithRetry(() => import("./OwnerLibrarySubmissions"), "owner-library-submissions"));

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
 * P6-E — «استيراد امتحان»: the owner adds an exam to the library from a JSON file (OwnerLibraryImport.tsx: checks → safe repair →
 * final check → publish → audience). There is no editor; an imported exam is marked «مستورد» and starts «لم يُحدَّد».
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
  const [importing, setImporting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pendingSent, setPendingSent] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void ownerLibraryApi.list(token).then(r => {
      if (!live) return;
      if (r.ok) setData({ items: r.data.items, teachers: r.data.teachers });
      else if (r.status === 401) onSignedOut();
      else setError(r.error);
    });
    // Tadris+ P6-F — how many exams teachers sent are waiting (the button's count; the list itself loads when opened)
    void ownerLibraryApi.submissions(token).then(r => { if (live && r.ok) setPendingSent(r.data.pending); });
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
      <div className="eb-owner-panel-head">
        <h2 id="eb-owner-library-title" className="eb-owner-h2">بنك الامتحانات{data && <span className="eb-owner-h2-count"> · {data.items.length} امتحانًا</span>}</h2>
        {data && !importing && !reviewing && (
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" onClick={() => { setNotice(""); setError(""); setReviewing(true); }}>امتحانات المعلمين{pendingSent ? <span className="eb-owner-chip-count">{pendingSent}</span> : null}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => { setNotice(""); setError(""); setImporting(true); }}><IconUpload size={16} aria-hidden="true" /> استيراد امتحان</button>
          </div>
        )}
      </div>
      <p className="eb-owner-hint">اختر من يرى كل امتحان: كل المعلمين، أو مجموعة تختارها. بنك المعلم يحوي ما هو «لكل المعلمين» وما اخترته له، ومنه يسند الواجبات لطلابه. لاختيار بنك معلم بعينه افتح صفحته ← «الامتحانات». إزالة امتحان لا تمس الواجبات المنشورة منه.</p>

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}

      {data && importing && (
        <Suspense fallback={<p className="eb-owner-hint" role="status">جارٍ فتح الاستيراد…</p>}>
          <OwnerLibraryImport token={token} busy={busy} send={send} teachers={data.teachers} categories={categories}
            onPublished={() => setNonce(n => n + 1)}
            onCancel={() => setImporting(false)}
            onDone={message => { setImporting(false); setNotice(message); setNonce(n => n + 1); }} />
        </Suspense>
      )}
      {data && reviewing && (
        <Suspense fallback={<p className="eb-owner-hint" role="status">جارٍ الفتح…</p>}>
          <OwnerLibrarySubmissions token={token} busy={busy} send={send} teachers={data.teachers} categories={categories} onSignedOut={onSignedOut}
            onChanged={() => setNonce(n => n + 1)}
            onDone={message => { setReviewing(false); setNotice(message); setNonce(n => n + 1); }} />
          <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={() => setReviewing(false)}>إغلاق</button></div>
        </Suspense>
      )}
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
                    <td className="eb-owner-teacher-who"><strong><bdi>{item.title}</bdi></strong><span className="eb-owner-teacher-user" dir="ltr">{item.libraryItemId}</span>{item.imported && <span className="eb-owner-library-tag">{item.fromTeacher ? "من معلم" : "مستورد"}{item.activityType === "training" ? " · تدريب" : ""}</span>}
                      {item.replacedBy && <span className="eb-owner-library-tag">نسخة سابقة ← {item.replacedBy}</span>}
                      {item.replaces && <span className="eb-owner-library-tag">نسخة محدَّثة من {item.replaces}</span>}</td>
                    <td className="eb-owner-library-meta">{categoryLabel(item.category)}</td>
                    <td className="eb-owner-library-meta eb-owner-library-count"><bdi>{item.questionCount}</bdi><span className="eb-owner-library-unit"> سؤال</span></td>
                    <td className="eb-owner-library-meta"><span className={"eb-owner-status eb-owner-status--" + (item.audience === "all" ? "active" : item.decided ? "invited" : "suspended")}>{audienceText(item)}</span></td>
                    <td className="eb-owner-teacher-menu eb-owner-library-action">
                      <button type="button" className="eb-owner-secondary eb-owner-small" disabled={busy} aria-expanded={editing === item.libraryItemId}
                        onClick={() => setEditing(e => (e === item.libraryItemId ? null : item.libraryItemId))}>تحديد الجمهور</button>
                      {item.replaces && data.items.some(o => o.libraryItemId === item.replaces && o.replacedBy !== item.libraryItemId) && (
                        <button type="button" className="eb-owner-secondary eb-owner-small" disabled={busy}
                          onClick={() => void send(() => ownerLibraryApi.completeReplacement(token, item.libraryItemId), () => { setNotice("اكتمل استبدال " + item.replaces + " بـ " + item.libraryItemId + "."); setNonce(n => n + 1); })}>إكمال الاستبدال</button>
                      )}
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
