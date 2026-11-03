import { useEffect, useMemo, useRef, useState } from "react";
import { IconWarning } from "../icons";
import { ownerLibraryApi, type ApiResult, type OwnerLibraryItem } from "./ownerApi";
import { CATEGORY_LABELS, categoryLabel } from "../examLibrary";
import { SAVE_LABELS } from "../teacher/saveLabels";
import { matchesSearch } from "./OwnerLibrary";

/**
 * Tadris+ P6-D — the «الامتحانات» tab of a teacher's page: this teacher's exam bank, chosen exam by exam (and added to later).
 * An exam «لكل المعلمين» is in every bank: shown ticked and locked here (its audience is changed from «بنك الامتحانات»). Saving
 * sends only what changed (added / removed). Every change goes through the page's `send` (second-factor check asked inline, then
 * the same change is retried); the server decides everything.
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;

export default function OwnerTeacherExams({ token, accountId, teacherName, busy, send, onSignedOut }: {
  token: string; accountId: string; teacherName: string; busy: boolean; send: Send; onSignedOut: () => void;
}) {
  const [items, setItems] = useState<OwnerLibraryItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState("");
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);

  useEffect(() => {
    let live = true;
    void ownerLibraryApi.list(token).then(r => {
      if (!live) return;
      if (r.ok) {
        setItems(r.data.items);
        setChosen(new Set(r.data.items.filter(i => i.audience === "selected" && i.teachers.includes(accountId)).map(i => i.libraryItemId)));
        setLoadError("");
      } else if (r.status === 401) signedOut.current();
      else setLoadError(r.error);
    });
    return () => { live = false; };
  }, [token, accountId, nonce]);

  const original = useMemo(() => new Set((items || []).filter(i => i.audience === "selected" && i.teachers.includes(accountId)).map(i => i.libraryItemId)), [items, accountId]);
  const include = [...chosen].filter(id => !original.has(id));
  const exclude = [...original].filter(id => !chosen.has(id));
  const categories = useMemo(() => [...new Set((items || []).map(i => i.category).filter(Boolean))], [items]);
  const shown = (items || []).filter(i => (!category || i.category === category) && matchesSearch(i, query));
  const inBank = (items || []).filter(i => i.audience === "all" || chosen.has(i.libraryItemId)).length;
  const toggle = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (loadError) return <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{loadError} <button type="button" className="eb-owner-secondary" onClick={() => setNonce(n => n + 1)}>إعادة المحاولة</button></div>;
  if (!items) return <p className="eb-owner-hint" role="status">جارٍ تحميل بنك الامتحانات…</p>;
  return (
    <div className="eb-owner-teacher-exams">
      <p className="eb-owner-hint">بنك امتحانات <bdi>{teacherName}</bdi>: يرى منه الامتحانات ويسندها لطلابه كواجبات. الامتحانات «لكل المعلمين» في بنك الجميع (تُغيَّر من «بنك الامتحانات»). إزالة امتحان لا تمس الواجبات المنشورة منه.</p>
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}
      <div className="eb-owner-actions" role="search">
        <label className="auth-field"><span>بحث</span>
          <div className="auth-input"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="اسم الامتحان أو رمزه" /></div>
        </label>
        <label className="auth-field"><span>التصنيف</span>
          <div className="auth-input"><select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">الكل</option>
            {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ? categoryLabel(c) : c}</option>)}
          </select></div>
        </label>
      </div>
      <p className="eb-owner-hint">في بنك المعلم: {inBank} من {items.length} امتحانًا</p>
      <fieldset className="eb-owner-cap-group">
        <legend>امتحانات المكتبة</legend>
        <div className="eb-owner-actions">
          <button type="button" className="eb-owner-secondary" onClick={() => setChosen(s => new Set([...s, ...shown.filter(i => i.audience !== "all").map(i => i.libraryItemId)]))}>إضافة الظاهرة كلها</button>
          <button type="button" className="eb-owner-secondary" onClick={() => setChosen(s => { const n = new Set(s); for (const i of shown) n.delete(i.libraryItemId); return n; })}>إزالة الظاهرة كلها</button>
        </div>
        {shown.map(i => i.audience === "all" ? (
          <label key={i.libraryItemId} className="eb-owner-check"><input type="checkbox" checked disabled /> <bdi>{i.title}</bdi> <span className="eb-owner-hint">({i.libraryItemId} · للجميع)</span></label>
        ) : (
          <label key={i.libraryItemId} className="eb-owner-check"><input type="checkbox" checked={chosen.has(i.libraryItemId)} onChange={() => toggle(i.libraryItemId)} /> <bdi>{i.title}</bdi> <span className="eb-owner-hint">({i.libraryItemId} · {categoryLabel(i.category)})</span></label>
        ))}
        {!shown.length && <p className="eb-owner-hint">لا توجد امتحانات مطابقة.</p>}
      </fieldset>
      <div className="eb-owner-actions">
        <button type="button" className="auth-submit" disabled={busy || (!include.length && !exclude.length)}
          onClick={() => void send(() => ownerLibraryApi.setTeacher(token, accountId, include, exclude), d => {
            setNotice("حُفظ بنك المعلم: أُضيف " + d.added.length + "، وأُزيل " + d.removed.length + ".");
            setNonce(n => n + 1);
          })}>{SAVE_LABELS.saveChanges}</button>
        {(include.length > 0 || exclude.length > 0) && <span className="eb-owner-hint">تغييرات غير محفوظة: +{include.length} / −{exclude.length}</span>}
      </div>
    </div>
  );
}
