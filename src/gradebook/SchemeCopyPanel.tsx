import { useState } from "react";
import { loadCopy, loadCopyClasses } from "./gradebookApi";
import type { GbCopyClass, GbCopyProposal } from "./types";

/**
 * Class gradebook GB8 — «نسخ من صف آخر» inside the scheme builder (docs/enterprise-class-gradebook-gb.md §4.9). The teacher picks one of
 * their classes that has a scheme; the server proposes it for this class (parts and manual columns as they are, each assignment matched by
 * the same exam) and lists what it could not copy. The proposal only fills the builder: nothing is saved before «حفظ». Presentation only.
 */
type ListState = { status: "closed" } | { status: "loading" } | { status: "ready"; classes: GbCopyClass[] } | { status: "error"; error: string };

export default function SchemeCopyPanel({ token, classId, onCopied }: { token: string; classId: string; onCopied: (p: GbCopyProposal) => void | Promise<void> }) {
  const [list, setList] = useState<ListState>({ status: "closed" });
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setList({ status: "loading" }); setError("");
    try {
      const r = await loadCopyClasses(token, classId);
      setList({ status: "ready", classes: r.classes });
      setPicked(r.classes[0] ? r.classes[0].classId : "");
    } catch (e) { setList({ status: "error", error: e instanceof Error ? e.message : "تعذر تحميل الصفوف." }); }
  }
  async function copy() {
    if (!picked || busy) return;
    setBusy(true); setError("");
    try { await onCopied(await loadCopy(token, classId, picked)); setList({ status: "closed" }); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر نسخ المخطط."); }
    finally { setBusy(false); }
  }

  if (list.status === "closed") {
    return <button type="button" className="eb-button is-small is-quiet eb-gb-copy-open" onClick={() => void open()}>نسخ من صف آخر</button>;
  }
  return (
    <section className="eb-gb-copy" aria-labelledby="eb-gb-copy-title">
      <h3 id="eb-gb-copy-title" className="eb-gb-copy-title">نسخ مخطط صف آخر</h3>
      {list.status === "loading" && <p className="eb-muted" role="status">جارٍ تحميل صفوفك...</p>}
      {list.status === "error" && <p className="platform-error" role="alert">{list.error}</p>}
      {list.status === "ready" && !list.classes.length && <p className="eb-muted">لا يوجد صف آخر له مخطط علامات.</p>}
      {list.status === "ready" && list.classes.length > 0 && (
        <>
          <p className="eb-muted">تُنسخ الأقسام ونسبها والعلامات التي يرصدها المعلم كما هي، ويُطابَق كل واجب بواجب هذا الصف المأخوذ من الامتحان نفسه. ما لا يُطابَق يُذكر لك لتختار بديله. لا يُحفظ شيء قبل «حفظ».</p>
          <div className="eb-gb-copy-row">
            <label className="eb-gb-field">
              <span>الصف المصدر</span>
              <select value={picked} onChange={e => setPicked(e.target.value)}>
                {list.classes.map(c => (
                  <option key={c.classId} value={c.classId}>
                    {c.name + (c.schoolYear ? " · " + c.schoolYear : "") + (c.archived ? " (مؤرشف)" : "") + " — " + c.categories + " أقسام، " + c.items + " عناصر"}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="eb-button is-small is-primary" disabled={busy || !picked} onClick={() => void copy()}>{busy ? "جارٍ النسخ..." : "نسخ"}</button>
          </div>
        </>
      )}
      {error && <p className="platform-error" role="alert">{error}</p>}
      <button type="button" className="eb-button is-small is-quiet" disabled={busy} onClick={() => setList({ status: "closed" })}>إلغاء</button>
    </section>
  );
}
