import { useEffect, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import "./student-gradebook.css";
import { itemText, partText, type StudentGbClass } from "./studentGradebookView";

/**
 * Class gradebook GB6b — «علاماتي» in the student's «التقدم» view (docs/enterprise-class-gradebook-gb.md §4.8). The student's own marks of
 * the parts their teacher APPROVED (GET /api/student-gradebook): each part's items and its total, and the final mark once it is approved.
 * Everything is the server's frozen, approved value (one decimal, D6); nothing here computes a mark. A part not approved, or whose
 * results the teacher hid again, never reaches this page (the server withholds it).
 *
 * No approved part (or a failed read) → nothing is shown, like the project panel: the view never shows an empty or broken card, and a
 * missing mark is never shown as a zero.
 *
 * Read once per session when the portal opens, like every other section (UX-S2: switching views reads nothing).
 */
type Load = { token: string; classes: StudentGbClass[] | null };

export default function StudentGradebook({ token }: { token: string }) {
  const [load, setLoad] = useState<Load | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/student-gradebook", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
        const j = r.ok ? await r.json() : null;
        if (!cancelled) setLoad({ token, classes: j && j.ok && Array.isArray(j.classes) ? (j.classes as StudentGbClass[]) : null });
      } catch { if (!cancelled) setLoad({ token, classes: null }); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Only an answer for the CURRENT session is shown (a previous session's marks never appear in a new one).
  const classes = load && load.token === token ? load.classes : null;
  if (!classes || !classes.length) return null;
  const many = classes.length > 1;
  return (
    <section className="eb-sp-panel eb-sp-grades" aria-labelledby="eb-sp-grades-title">
      <SectionHeader level={2} id="eb-sp-grades-title" title="علاماتي" description="العلامات التي اعتمدها معلّمك. يظهر كل جزء بعد اعتماده." />
      {classes.map(c => (
        <div key={c.classId} className="eb-sp-grades-class">
          {many && <h3 className="eb-sp-grades-class-title">{c.className}</h3>}
          <ul className="eb-sp-grades-parts" aria-label={"أجزاء العلامة" + (many ? " — " + c.className : "")}>
            {c.parts.map(p => (
              <li key={p.categoryId} className="eb-sp-grades-part">
                <div className="eb-sp-grades-part-head">
                  <strong>{p.title}</strong>
                  <span className="eb-sp-grades-weight">{p.weight}% من العلامة النهائية</span>
                  <span className="eb-sp-grades-total" aria-label={"مجموع " + p.title + ": " + partText(p)}>{partText(p)}</span>
                </div>
                <ul className="eb-sp-grades-items">
                  {p.items.map(i => <li key={i.itemId}><span>{i.title || "عنصر"}</span><span className="eb-sp-grades-mark">{itemText(i)}</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
          <p className="eb-sp-grades-final">
            {c.final && c.final.display !== null
              ? <>العلامة النهائية: <strong>{c.final.display}</strong></>
              : <span className="eb-muted">العلامة النهائية لم تُعتمد بعد.</span>}
          </p>
        </div>
      ))}
    </section>
  );
}
