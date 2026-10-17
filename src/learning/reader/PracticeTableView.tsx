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
 *
 * SERVER CHECK (L.6b): a SERVED worksheet carries no cell key (`serverCheck` instead). Every change of the choices is then sent
 * to the host and each cell shows the server's verdict for its choice (a verdict once received is reused for the same choice).
 * While a reply is on its way the cell says so; when the server cannot be reached the table says that and offers a retry — never
 * a wrong mark. Without a host the choices can be made but are not checked.
 */
const cellChoice = (cell: string, value: string) => cell + "\u0000" + value;
const stampOf = (choices: Record<string, string>) => JSON.stringify(Object.keys(choices).sort().map(k => [k, choices[k]]));
type TableCheck = { stamp: string; kind: "pending" } | { stamp: string; kind: "done"; correct: boolean } | { stamp: string; kind: "error" };
export default function PracticeTableView({ block, pageId, study }: { block: PracticeTableBlock; pageId?: string; study?: StudyHost }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<StudyAttemptResponse | null>(null);
  const reportedRef = useRef<string | null>(null);        // the choices the server ACCEPTED (never re-reported)
  const inFlightRef = useRef<string | null>(null);        // the choices currently being reported (never duplicated)
  const latestStampRef = useRef<string | null>(null);     // the choices currently on screen (a late outcome for old choices is dropped)
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const [verdicts, setVerdicts] = useState<Record<string, boolean>>({});   // server mode: cellChoice(cell, value) → right?
  const [check, setCheck] = useState<TableCheck | null>(null);
  const askingRef = useRef(new Set<string>());
  const repliesRef = useRef(new Map<string, StudyAttemptResponse>());
  const baseId = useId();
  const cellKey = (r: number, c: number) => r + ":" + c;
  const isSelect = (cell: PracticeTableBlock["rows"][number][number]): cell is PracticeTableSelectCell => typeof cell !== "string";
  const answered = Object.keys(choices).length > 0;
  const key = practiceTableKey(block);
  const cells = key && key.kind === "practice-table" ? key.cells : null;
  const server = block.serverCheck === true;
  const serverReady = server && !!study && !!pageId;
  const eligible = !!study && !!pageId && (server || cells !== null) && block.studyEligible !== false;   // opt-out: still checked, just earns no point
  const allRight = server
    ? check?.kind === "done" && check.correct && check.stamp === stampOf(choices)
    : cells !== null && Object.entries(cells).every(([k, expected]) => choices[k] === expected);

  // Server mode: ask about the choices on screen (once per distinct set; a reply to an older set still teaches its cells).
  const ask = (next: Record<string, string>) => {
    if (!serverReady || !study || !pageId) return;
    if (Object.keys(next).length === 0) { latestStampRef.current = null; setCheck(null); return; }
    const stamp = stampOf(next);
    latestStampRef.current = stamp;
    const known = repliesRef.current.get(stamp);
    if (known) { setCheck({ stamp, kind: "done", correct: known.correct }); return; }
    setCheck({ stamp, kind: "pending" });
    if (askingRef.current.has(stamp)) return;
    askingRef.current.add(stamp);
    study.report(pageId, block.id, { kind: "practice-table", choices: { ...next } })
      .then(res => {
        repliesRef.current.set(stamp, res);
        if (!mountedRef.current) return;
        setVerdicts(prev => { const n = { ...prev }; for (const [cell, ok] of Object.entries(res.cells ?? {})) if (typeof next[cell] === "string") n[cellChoice(cell, next[cell])] = ok === true; return n; });
        if (latestStampRef.current === stamp) { setCheck({ stamp, kind: "done", correct: res.correct }); if (res.correct) setOutcome(res); }
      })
      .catch(() => { if (mountedRef.current && latestStampRef.current === stamp) setCheck({ stamp, kind: "error" }); })
      .finally(() => { askingRef.current.delete(stamp); });
  };

  // Same retry-safe, duplicate-safe reporting as PracticeBlockView: accepted → never again; in flight → never twice;
  // a transport failure releases the marker so the same fully-right table can be reported again.
  useEffect(() => {
    if (server) return;                                    // server mode: every change was already asked (see `ask`)
    if (!eligible || !study || !pageId || !allRight) { latestStampRef.current = null; return; }
    const stamp = JSON.stringify(choices);
    latestStampRef.current = stamp;
    if (reportedRef.current === stamp || inFlightRef.current === stamp) return;
    inFlightRef.current = stamp;
    study.report(pageId, block.id, { kind: "practice-table", choices: { ...choices } })
      .then(r => { reportedRef.current = stamp; if (mountedRef.current && latestStampRef.current === stamp) setOutcome(r); })
      .catch(() => { /* quiet */ })
      .finally(() => { if (inFlightRef.current === stamp) inFlightRef.current = null; });
  }, [server, eligible, study, pageId, block.id, allRight, choices]);

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
                  const said = verdicts[cellChoice(k, value)];
                  const state = value === "" || (server && !serverReady) ? "empty"
                    : !server ? (value === cell.key ? "right" : "wrong")
                    : said === true ? "right" : said === false ? "wrong" : check?.kind === "error" ? "unreachable" : "checking";
                  const feedbackId = baseId + "-fb-" + r + "-" + c;
                  return (
                    <td key={c} dir={block.columnDirs?.[c]} className="learning-reader-practice-cell">
                      <select
                        className={"learning-reader-practice-select" + (state === "empty" ? "" : " is-" + state)}
                        aria-label={rowLabel(row, r) + " — " + block.headers[c]}
                        aria-describedby={state === "empty" ? undefined : feedbackId}
                        value={value}
                        onChange={e => { const v = e.target.value; const n = { ...choices }; if (v === "") delete n[k]; else n[k] = v; setChoices(n); if (server) { setOutcome(null); ask(n); } }}
                      >
                        <option value="">اختر...</option>
                        {cell.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {state !== "empty" && (
                        <span id={feedbackId} className={"learning-reader-practice-feedback is-" + state} role="status">
                          {state === "right" ? <><IconCheck size={14} aria-hidden="true" />✓ صحيح</>
                            : state === "wrong" ? <><IconClose size={14} aria-hidden="true" />✕ غير صحيح — حاول مرة أخرى</>
                            : state === "checking" ? "جارٍ التحقق…" : "لم يتم التحقق"}
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
      {server && check?.kind === "error" && (
        <p className="learning-reader-practice-unreachable" role="status">
          تعذّر التحقق من إجاباتك الآن. تحقق من الاتصال ثم أعد المحاولة.{" "}
          <button type="button" className="eb-button is-small" onClick={() => ask(choices)}>أعد المحاولة</button>
        </p>
      )}
      <div className="learning-reader-practice-foot">
        <p className="learning-reader-practice-hint">{server && !serverReady ? "التحقق من هذه الإجابات يتم على المنصة، وهو غير متاح هنا." : eligible ? "تمرين ذاتي: اختر الإجابة في كل صف لترى النتيجة فورًا، وغيّرها كما تشاء. إكمال الجدول كله صحيحًا يُضيف نقطة دراسة (حتى نقطتين للصفحة)." : "تمرين ذاتي: اختر الإجابة في كل صف لترى النتيجة فورًا، وغيّرها كما تشاء. لا يُحفظ شيء ولا تُحسب نقاط."}</p>
        {answered && <button type="button" className="eb-button is-quiet is-small" onClick={() => { setChoices({}); setOutcome(null); setCheck(null); if (server) latestStampRef.current = null; }}>امسح الإجابات</button>}
      </div>
    </div>
  );
}
