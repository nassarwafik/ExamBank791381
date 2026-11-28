import type { PdaOp, TmMove } from "../learning/activities/automaton";
import { BLANK, BOTTOM, LEFT_END, MOVE_TEXT, OP_TEXT, type LabDraft, type PdaRow, type TmRow } from "./automataLab";
import "./automataLab.css";

// AUTO-A10 — the push-down automaton's and the Turing machine's transition rows (the course's notation), moved out of the lab tool
// (AutomataLabTool.tsx) unchanged so the book's «صمّم الآلة» exercises for these machines use the very same editor.

/** The symbols a row editor suggests: the alphabet, the stack's bottom (PDA) or the blank and the left end (TM), and those already used. */
export function rowSymbols(draft: LabDraft, kind: "pda" | "tm"): string[] {
  const used = new Set<string>([...draft.alphabet, ...(kind === "pda" ? [BOTTOM] : [BLANK, ...(draft.leftEnd ? [LEFT_END] : [])])]);
  for (const r of kind === "pda" ? draft.pda : draft.tm) { for (const c of [...r.write]) used.add(c); if ("top" in r) used.add(r.top); else used.add(r.read); }
  return [...used];
}

function StateSelect({ value, states, onChange, label }: { value: string; states: string[]; onChange: (v: string) => void; label: string }) {
  return (
    <select className="learning-autodesign-select" dir="ltr" value={states.includes(value) ? value : ""} onChange={e => onChange(e.target.value)} aria-label={label}>
      {!states.includes(value) && <option value="">—</option>}
      {states.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function SymbolInput({ value, onChange, label, list, allowEmpty }: { value: string; onChange: (v: string) => void; label: string; list: string; allowEmpty?: boolean }) {
  return (
    <input className="stt-input alab-sym" dir="ltr" value={value} maxLength={allowEmpty ? 8 : 2} list={list} autoComplete="off" spellCheck={false}
      aria-label={label} onChange={e => onChange(allowEmpty ? e.target.value.replace(/\s/g, "") : [...e.target.value.replace(/\s/g, "")].slice(-1).join(""))} />
  );
}

export function PdaRows({ draft, ids, symbols, set, remove, add }: { draft: LabDraft; ids: string; symbols: string[]; set: (i: number, p: Partial<PdaRow>) => void; remove: (i: number) => void; add: () => void }) {
  const list = ids + "-pda-syms";
  return (
    <>
      <p className="stt-hint">كل انتقال بترميز المادة: «ادفع a,{BOTTOM}/S» = نقرأ a وفي القمة {BOTTOM} فندفع S. «اسحب b,A/A» يسحب القمة A. «بلا تغيير» لا يمسّ المكدّس. القاع {BOTTOM}.</p>
      <datalist id={list}>{symbols.map(s => <option key={s} value={s} />)}</datalist>
      <div className="learning-autodesign-tablewrap" tabIndex={0} role="region" aria-label="انتقالات أوتومات المكدّس">
        <table className="learning-autodesign-table alab-rows">
          <thead><tr><th scope="col">#</th><th scope="col">من</th><th scope="col">يقرأ</th><th scope="col">القمة</th><th scope="col">العملية</th><th scope="col">يُكتب</th><th scope="col">إلى</th><th scope="col">بالترميز</th><th scope="col"><span className="alab-sr">حذف</span></th></tr></thead>
          <tbody>
            {draft.pda.map((r, i) => {
              const n = "الانتقال " + (i + 1) + ": ";
              return (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  <td><StateSelect value={r.from} states={draft.states} onChange={v => set(i, { from: v })} label={n + "من"} /></td>
                  <td>
                    <select className="learning-autodesign-select" dir="ltr" value={draft.alphabet.includes(r.read) ? r.read : ""} onChange={e => set(i, { read: e.target.value })} aria-label={n + "يقرأ"}>
                      {!draft.alphabet.includes(r.read) && <option value="">—</option>}
                      {draft.alphabet.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><SymbolInput value={r.top} onChange={v => set(i, { top: v })} label={n + "القمة"} list={list} /></td>
                  <td>
                    <select className="learning-autodesign-select" value={r.op} onChange={e => set(i, { op: e.target.value as PdaOp })} aria-label={n + "العملية"}>
                      {(["push", "pop", "none"] as PdaOp[]).map(o => <option key={o} value={o}>{OP_TEXT[o]}</option>)}
                    </select>
                  </td>
                  <td><SymbolInput value={r.write} onChange={v => set(i, { write: v })} label={n + "يُكتب"} list={list} allowEmpty /></td>
                  <td><StateSelect value={r.to} states={draft.states} onChange={v => set(i, { to: v })} label={n + "إلى"} /></td>
                  <td dir="rtl" className="alab-notation">{OP_TEXT[r.op] + " " + (r.read || "?") + "," + (r.top || "?") + "/" + r.write}</td>
                  <td><button type="button" className="learning-autodesign-btn is-quiet" onClick={() => remove(i)} aria-label={"احذف " + n.slice(0, -2)}>حذف</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="stt-btn" onClick={add}>إضافة انتقال</button>
    </>
  );
}

export function TmRows({ draft, ids, symbols, set, remove, add }: { draft: LabDraft; ids: string; symbols: string[]; set: (i: number, p: Partial<TmRow>) => void; remove: (i: number) => void; add: () => void }) {
  const list = ids + "-tm-syms";
  return (
    <>
      <p className="stt-hint">كل انتقال بترميز المادة: «a/A,R» = نقرأ a فنكتب A ونتحرك يمينًا. الفراغ {BLANK}{draft.leftEnd ? "، وبداية الشريط " + LEFT_END : ""}. تتوقف الآلة حين لا انتقال، وتقبل إن توقفت في حالة قبول.</p>
      <datalist id={list}>{symbols.map(s => <option key={s} value={s} />)}</datalist>
      <div className="learning-autodesign-tablewrap" tabIndex={0} role="region" aria-label="انتقالات آلة تورنغ">
        <table className="learning-autodesign-table alab-rows">
          <thead><tr><th scope="col">#</th><th scope="col">من</th><th scope="col">يقرأ</th><th scope="col">يكتب</th><th scope="col">الحركة</th><th scope="col">إلى</th><th scope="col">بالترميز</th><th scope="col"><span className="alab-sr">حذف</span></th></tr></thead>
          <tbody>
            {draft.tm.map((r, i) => {
              const n = "الانتقال " + (i + 1) + ": ";
              return (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  <td><StateSelect value={r.from} states={draft.states} onChange={v => set(i, { from: v })} label={n + "من"} /></td>
                  <td><SymbolInput value={r.read} onChange={v => set(i, { read: v })} label={n + "يقرأ"} list={list} /></td>
                  <td><SymbolInput value={r.write} onChange={v => set(i, { write: v })} label={n + "يكتب"} list={list} /></td>
                  <td>
                    <select className="learning-autodesign-select" value={r.move} onChange={e => set(i, { move: e.target.value as TmMove })} aria-label={n + "الحركة"}>
                      {(["R", "L", "S"] as TmMove[]).map(m => <option key={m} value={m}>{MOVE_TEXT[m]}</option>)}
                    </select>
                  </td>
                  <td><StateSelect value={r.to} states={draft.states} onChange={v => set(i, { to: v })} label={n + "إلى"} /></td>
                  <td dir="ltr" className="alab-notation">{(r.read || "?") + "/" + (r.write || "?") + "," + r.move}</td>
                  <td><button type="button" className="learning-autodesign-btn is-quiet" onClick={() => remove(i)} aria-label={"احذف " + n.slice(0, -2)}>حذف</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="stt-btn" onClick={add}>إضافة انتقال</button>
    </>
  );
}
