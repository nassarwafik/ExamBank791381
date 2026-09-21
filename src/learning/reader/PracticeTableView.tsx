import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { PracticeTableBlock, PracticeTableSelectCell } from "../content/types";
import { practiceTableKey } from "../study/eligibility";
import type { StudyAttemptResponse, StudyHost } from "../study/types";
import { StudyOutcome } from "./PracticeBlockView";

/**
 * The generic interactive worksheet renderer for a `practice-table` block. Same table skeleton as the static
 * `table` (wrapper → table → thead/tbody, per-column direction) so the layout, RTL/LTR and scrolling contracts are
 * identical; answerable cells render a native <select> with a neutral placeholder. The choice is checked LOCALLY
 * against the block's data the moment it changes: immediate feedback that is never colour-only (an icon + a word),
 * announced to assistive tech, and always retryable (change the choice again, or reset the whole table).
 *
 * Nothing here is domain-specific: no page ids, no address logic, no course names — every rule lives in the data.
 * Nothing is stored, sent or scored: the state is component-local and disappears with the page; no Strength points
 * come from inline practice. The expected choice never appears in the DOM (no attribute, no hidden text).
 *
 * STUDY PRACTICE STRENGTH: with a study HOST (a student session) the whole worksheet is ONE eligible exercise — it is
 * reported once, when every answerable cell is right, and the server alone judges it and decides the points.
 */
export default function PracticeTableView({ block, pageId, study }: { block: PracticeTableBlock; pageId?: string; study?: StudyHost }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<StudyAttemptResponse | null>(null);
  const reportedRef = useRef<string | null>(null);        // the choices the server ACCEPTED (never re-reported)
  const inFlightRef = useRef<string | null>(null);        // the choices currently being reported (never duplicated)
  const latestStampRef = useRef<string | null>(null);     // the choices currently on screen (a late outcome for old choices is dropped)
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const baseId = useId();
  const cellKey = (r: number, c: number) => r + ":" + c;
  const isSelect = (cell: PracticeTableBlock["rows"][number][number]): cell is PracticeTableSelectCell => typeof cell !== "string";
  const answered = Object.keys(choices).length > 0;
  const key = practiceTableKey(block);
  const cells = key && key.kind === "practice-table" ? key.cells : null;
  const eligible = !!study && !!pageId && cells !== null && block.studyEligible !== false;   // opt-out: still checks locally, just earns no point
  const allRight = cells !== null && Object.entries(cells).every(([k, expected]) => choices[k] === expected);

  // Same retry-safe, duplicate-safe reporting as PracticeBlockView: accepted → never again; in flight → never twice;
  // a transport failure releases the marker so the same fully-right table can be reported again.
  useEffect(() => {
    if (!eligible || !study || !pageId || !allRight) { latestStampRef.current = null; return; }
    const stamp = JSON.stringify(choices);
    latestStampRef.current = stamp;
    if (reportedRef.current === stamp || inFlightRef.current === stamp) return;
    inFlightRef.current = stamp;
    study.report(pageId, block.id, { kind: "practice-table", choices: { ...choices } })
      .then(r => { reportedRef.current = stamp; if (mountedRef.current && latestStampRef.current === stamp) setOutcome(r); })
      .catch(() => { /* quiet */ })
      .finally(() => { if (inFlightRef.current === stamp) inFlightRef.current = null; });
  }, [eligible, study, pageId, block.id, allRight, choices]);

  // The row's accessible label is its first plain-text cell (the item being classified), else its ordinal.
  const rowLabel = (row: PracticeTableBlock["rows"][number], r: number) => {
    const first = row.find((cell): cell is string => typeof cell === "string" && cell.trim() !== "");
    return first ?? "الصف " + (r + 1);
  };

  return (
    <div className="learning-reader-practice-table">
      <div className="learning-reader-tablewrap">
        <table className="learning-reader-table is-practice" dir={block.dir}>
          {block.caption && <caption>{block.caption}</caption>}
          <thead><tr>{block.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  if (!isSelect(cell)) return <td key={c} dir={block.columnDirs?.[c]}>{cell}</td>;
                  const k = cellKey(r, c);
                  const value = choices[k] ?? "";
                  const state = value === "" ? "empty" : value === cell.key ? "right" : "wrong";
                  const feedbackId = baseId + "-fb-" + r + "-" + c;
                  return (
                    <td key={c} dir={block.columnDirs?.[c]} className="learning-reader-practice-cell">
                      <select
                        className={"learning-reader-practice-select" + (state === "empty" ? "" : " is-" + state)}
                        aria-label={rowLabel(row, r) + " — " + block.headers[c]}
                        aria-describedby={state === "empty" ? undefined : feedbackId}
                        value={value}
                        onChange={e => { const v = e.target.value; setChoices(prev => { const n = { ...prev }; if (v === "") delete n[k]; else n[k] = v; return n; }); }}
                      >
                        <option value="">اختر...</option>
                        {cell.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {state !== "empty" && (
                        <span id={feedbackId} className={"learning-reader-practice-feedback is-" + state} role="status">
                          {state === "right"
                            ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح</>
                            : <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — حاول مرة أخرى</>}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allRight && outcome && <StudyOutcome outcome={outcome} />}
      <div className="learning-reader-practice-foot">
        <p className="learning-reader-practice-hint">{eligible ? "تمرين ذاتي: اختر الإجابة في كل صف لترى النتيجة فورًا، وغيّرها كما تشاء. إكمال الجدول كله صحيحًا يُضيف نقطة دراسة (حتى نقطتين للصفحة)." : "تمرين ذاتي: اختر الإجابة في كل صف لترى النتيجة فورًا، وغيّرها كما تشاء. لا يُحفظ شيء ولا تُحسب نقاط."}</p>
        {answered && <button type="button" className="eb-button is-quiet is-small" onClick={() => { setChoices({}); setOutcome(null); }}>امسح الإجابات</button>}
      </div>
    </div>
  );
}
