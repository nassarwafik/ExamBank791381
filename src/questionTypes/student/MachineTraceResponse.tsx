import { useId, useMemo, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { projectMachineTraceConfigForStudent, engineOfTraceMachine, parseTape, tapeText, MACHINE_TRACE_LIMITS, type TraceRow, type MachineTraceAnswer } from "../../machineTraceQuestion";
import type { Machine } from "../../learning/activities/automaton";
import MachineTraceTable from "../../automata/MachineTraceTable";
import "../../automata/machineTrace.css";

// AUTO-A15a — the student renderer of machineTrace@1 (lazy): the machine as its transition table (never a player: the run is the answer),
// the word, then the run the student writes — a row per configuration in the kind's own fields (a state; a set of states; the state and the
// stack bottom → top; the state, the tape and the head's cell) — and the verdict. The special symbols (⏊ ├ ∆ and the machine's own) are
// buttons, never typed; a new row starts as a copy of the one above it. Nothing here knows the true run: the grade is the server's.
type UiRow = { state: string; states: string[]; stack: string; cells: string; head: number };
const chars = (s: string) => [...s];
const emptyRow = (): UiRow => ({ state: "", states: [], stack: "", cells: "", head: 0 });
function uiOfRow(r: TraceRow): UiRow {
  const t = typeof r.tape === "string" ? parseTape(r.tape) : null;
  return { state: r.state ?? "", states: r.states ?? [], stack: r.stack ?? "", cells: t ? t.cells.join("") : (r.tape ?? "").replace(/[[\]]/g, ""), head: t ? t.head : 0 };
}
function rowOfUi(m: Machine, u: UiRow): TraceRow {
  if (m.kind === "NFA") return { states: m.states.filter(s => u.states.includes(s)) };
  if (m.kind === "PDA") return { state: u.state, stack: u.stack };
  if (m.kind === "TM") { const cs = chars(u.cells); return { state: u.state, tape: cs.length ? tapeText(cs, Math.min(u.head, cs.length - 1)) : "" }; }
  return { state: u.state };
}

export default function MachineTraceResponse({ q, id, answer, onAnswer, disabled }: StudentRendererProps) {
  const cfg = useMemo(() => projectMachineTraceConfigForStudent((q as { machineTrace?: unknown }).machineTrace), [q]);
  const m = useMemo(() => (cfg ? engineOfTraceMachine(cfg.machine) : null), [cfg]);
  if (!cfg || !m) return <p className="vq-unavailable" role="note" data-testid="machine-trace-unavailable">تعذّر عرض سؤال تتبّع الآلة؛ أبلغ معلّمك.</p>;
  return <Tracer key={id} m={m} word={cfg.word} answer={answer?.kind === "machineTrace" ? (answer as MachineTraceAnswer) : null} onAnswer={onAnswer} disabled={disabled} />;
}

function Tracer({ m, word, answer, onAnswer, disabled }: { m: Machine; word: string; answer: MachineTraceAnswer | null; onAnswer: StudentRendererProps["onAnswer"]; disabled?: boolean }) {
  const ids = "mt" + useId().replace(/:/g, "");
  const [rows, setRows] = useState<UiRow[]>(() => (answer && answer.rows.length ? answer.rows.map(uiOfRow) : [emptyRow()]));
  const [verdict, setVerdict] = useState<"accept" | "reject" | null>(answer?.verdict ?? null);
  const send = (nextRows: UiRow[], nextVerdict: "accept" | "reject" | null) => {
    if (disabled) return;
    setRows(nextRows); setVerdict(nextVerdict);
    onAnswer({ kind: "machineTrace", rows: nextRows.map(r => rowOfUi(m, r)), verdict: nextVerdict } as never);
  };
  const setRow = (k: number, patch: Partial<UiRow>) => send(rows.map((r, i) => (i === k ? { ...r, ...patch } : r)), verdict);
  const stackSymbols = m.kind === "PDA" ? [m.bottom, ...m.stackAlphabet] : [];
  const tapeSymbols = m.kind === "TM" ? [...new Set([...(m.leftEnd !== undefined ? [m.leftEnd] : []), ...m.tapeAlphabet.filter(s => s !== m.leftEnd), m.blank])] : [];
  const fields = m.kind === "NFA" ? "مجموعة الحالات بعد قراءة كل رمز" : m.kind === "PDA" ? "الحالة ومحتوى المكدّس من القاع إلى القمة بعد كل رمز" : m.kind === "TM" ? "الحالة والشريط وموضع الرأس بعد كل خطوة" : "الحالة بعد قراءة كل رمز";

  return (
    <div className="mt-response" dir="rtl" data-testid="machine-trace-response">
      <MachineTraceTable m={m} testId="machine-trace-machine" />
      <p className="mt-word">الكلمة: <bdi dir="ltr" className="mt-word-value">{word === "" ? "ε" : word}</bdi></p>
      <p className="mt-help" role="note">اكتب تشغيل الآلة على الكلمة: السطر 0 هو البداية، ثم سطر لكل خطوة ({fields})، ثم النتيجة. كل خطوة صحيحة تأخذ جزءًا من العلامة، والخطأ لا يُحسب مرتين.</p>
      <ol className="mt-rows" aria-label="خطوات التشغيل" start={0}>
        {rows.map((r, k) => (
          <li key={k} className="mt-row" data-testid="machine-trace-row">
            <span className="mt-row-n" aria-hidden="true">{k}</span>
            <fieldset className="mt-row-fields" disabled={disabled}>
              <legend className="mt-sr">السطر {k}</legend>
              {m.kind !== "NFA" && (
                <label className="mt-field">الحالة
                  <select value={r.state} onChange={e => setRow(k, { state: e.target.value })}>
                    <option value="">—</option>
                    {m.states.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              )}
              {m.kind === "NFA" && (
                <div className="mt-field" role="group" aria-label={"الحالات في السطر " + k}>
                  <span>الحالات</span>
                  {m.states.map(s => <label key={s} className="mt-check"><input type="checkbox" checked={r.states.includes(s)} onChange={e => setRow(k, { states: e.target.checked ? [...r.states, s] : r.states.filter(x => x !== s) })} /><bdi dir="ltr">{s}</bdi></label>)}
                  {r.states.length === 0 && <span className="mt-empty">∅</span>}
                </div>
              )}
              {m.kind === "PDA" && (
                <SymbolField label="المكدّس (من القاع)" value={r.stack} symbols={stackSymbols} onChange={v => setRow(k, { stack: v })} id={ids + "-s" + k} />
              )}
              {m.kind === "TM" && (
                <>
                  <SymbolField label="الشريط" value={r.cells} symbols={tapeSymbols} onChange={v => setRow(k, { cells: v, head: Math.min(r.head, Math.max(0, chars(v).length - 1)) })} id={ids + "-t" + k} />
                  <label className="mt-field">موضع الرأس
                    <select value={chars(r.cells).length ? Math.min(r.head, chars(r.cells).length - 1) : ""} onChange={e => setRow(k, { head: Number(e.target.value) })} disabled={!chars(r.cells).length}>
                      {chars(r.cells).map((c, i) => <option key={i} value={i}>{i + 1}: {c}</option>)}
                    </select>
                  </label>
                </>
              )}
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="mt-row-actions">
        <button type="button" className="eb-button is-small" disabled={disabled || rows.length >= MACHINE_TRACE_LIMITS.rows} onClick={() => send([...rows, { ...rows[rows.length - 1] ?? emptyRow() }], verdict)}>أضف خطوة (نسخة من السابقة)</button>
        <button type="button" className="eb-button is-small is-quiet" disabled={disabled || rows.length <= 1} onClick={() => send(rows.slice(0, -1), verdict)}>احذف آخر خطوة</button>
      </div>
      <fieldset className="mt-verdict" disabled={disabled}>
        <legend>النتيجة</legend>
        <label><input type="radio" name={ids + "-verdict"} checked={verdict === "accept"} onChange={() => send(rows, "accept")} />الكلمة مقبولة</label>
        <label><input type="radio" name={ids + "-verdict"} checked={verdict === "reject"} onChange={() => send(rows, "reject")} />الكلمة مرفوضة</label>
      </fieldset>
    </div>
  );
}

/** A left-to-right field of single symbols: typed, or added with a button per symbol (⏊ ├ ∆ …); ⌫ removes the last one. */
function SymbolField({ label, value, symbols, onChange, id }: { label: string; value: string; symbols: string[]; onChange: (v: string) => void; id: string }) {
  return (
    <div className="mt-field mt-symbols">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" dir="ltr" value={value} maxLength={MACHINE_TRACE_LIMITS.tapeChars} onChange={e => onChange(e.target.value.replace(/\s+/g, ""))} autoComplete="off" spellCheck={false} />
      <span className="mt-symbol-buttons" role="group" aria-label={"رموز " + label}>
        {symbols.map(s => <button key={s} type="button" className="mt-symbol" onClick={() => onChange(value + s)} aria-label={"أضف " + s}>{s}</button>)}
        <button type="button" className="mt-symbol" onClick={() => onChange(chars(value).slice(0, -1).join(""))} aria-label="احذف آخر رمز">⌫</button>
      </span>
    </div>
  );
}
