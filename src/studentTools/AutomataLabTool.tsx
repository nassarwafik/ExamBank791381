import { useId, useMemo, useState } from "react";
import type { AutomataLabToolV1 } from "./studentToolsSpec";
import { gridLayout, type PdaOp, type TmMove } from "../learning/activities/automaton";
import { buildScene } from "../learning/activities/automatonScene";
import { AutomatonPlayer } from "../learning/activities/AutomatonPlayer";
import {
  BLANK, BOTTOM, EPS, KIND_LABEL, LEFT_END, MAX_STATES, addState, addTrapState, cellKey, checkDraft, initialDraft, languageMaxLength,
  languageUpTo, missingArrows, nondeterminism, parseAlphabet, parseWords, removeState, runBatch, setAlphabet, unreachableStates,
  type AutomatonKind, type BatchRow, type LabDraft, type LanguageListing, type PdaRow, type TmRow,
} from "./automataLab";
import { LAB_EXAMPLES } from "./automataLabExamples";
import "../learning/activities/activities.css";
import "../learning/activities/automatonDesign.css";
import "./automataLab.css";

/**
 * AUTO-A4 (docs/enterprise-automata-lab-a4.md) — «مختبر الآلات», the automata lab tool of the course book (and of an exam whose teacher
 * allows it). The learner builds a machine of one of the teacher's kinds and works with it:
 *   ١ the machine: its kind and its alphabet (and a starting example per kind);
 *   ٢ the states (start, accepting, add / remove);
 *   ٣ the transitions: a table for a finite automaton (one target for a deterministic one, any set and ε for a non-deterministic one),
 *     a list of moves in the course's notation for a push-down automaton («ادفع a,⏊/S») and a Turing machine («a/A,R»);
 *   ٤ the checks: what keeps the draft from being a machine (in Arabic), then the course's checks — complete? (and «أضف حالة مصيدة»),
 *     deterministic?, states no path reaches;
 *   ٥ the drawing and a word step by step — the book's own player (AutomatonPlayer), so a machine runs exactly as the book's do;
 *   ٦ many words at once; ٧ «لغة آلتي»: every word up to a length the machine accepts.
 * Everything stays in this panel: nothing is stored, sent or graded. A result belongs to the machine it ran on: any edit clears it.
 */

type Stamped<T> = { stamp: string; value: T };
const MOVE_TEXT: Record<TmMove, string> = { R: "يمينًا R", L: "يسارًا L", S: "بلا حركة S" };
const OP_TEXT: Record<PdaOp, string> = { push: "ادفع", pop: "اسحب", none: "بلا تغيير" };
const shown = (w: string) => (w === "" ? "ε" : w);

export default function AutomataLabTool({ config }: { config: AutomataLabToolV1 }) {
  const ids = useId().replace(/:/g, "");
  const kinds = config.kinds.length ? config.kinds : (["DFA"] as AutomatonKind[]);
  const [draft, setDraft] = useState<LabDraft>(() => initialDraft(kinds[0]));
  const [alphabetText, setAlphabetText] = useState(() => draft.alphabet.join(", "));
  const [alphabetError, setAlphabetError] = useState("");
  const [batchText, setBatchText] = useState("");
  const [batch, setBatch] = useState<Stamped<BatchRow[]> | null>(null);
  const [lengthWanted, setLengthWanted] = useState(4);
  const [listing, setListing] = useState<Stamped<LanguageListing> | null>(null);

  const checked = useMemo(() => checkDraft(draft), [draft]);
  const machine = checked.machine;
  const stamp = useMemo(() => (machine ? JSON.stringify(machine) : ""), [machine]);
  const scene = useMemo(() => (machine ? buildScene(machine, gridLayout(machine)) : null), [machine]);
  const batchNow = batch && batch.stamp === stamp ? batch.value : null;
  const listingNow = listing && listing.stamp === stamp ? listing.value : null;
  const isFa = draft.kind === "DFA" || draft.kind === "NFA";

  const edit = (next: LabDraft) => setDraft(next);
  const chooseKind = (kind: AutomatonKind) => edit({ ...draft, kind });
  const applyAlphabet = () => {
    const r = parseAlphabet(alphabetText);
    if (!r.ok) { setAlphabetError(r.message); return; }
    setAlphabetError("");
    setAlphabetText(r.alphabet.join(", "));
    edit(setAlphabet(draft, r.alphabet));
  };
  const loadExample = () => {
    const ex = LAB_EXAMPLES[draft.kind].draft;
    setDraft({ ...ex, cells: { ...ex.cells }, pda: ex.pda.map(r => ({ ...r })), tm: ex.tm.map(r => ({ ...r })) });
    setAlphabetText(ex.alphabet.join(", "));
    setAlphabetError("");
  };
  const clearAll = () => { const d = initialDraft(draft.kind); setDraft(d); setAlphabetText(d.alphabet.join(", ")); setAlphabetError(""); };

  const setCell = (q: string, s: string, to: string) => edit({ ...draft, cells: { ...draft.cells, [cellKey(q, s)]: to ? [to] : [] } });
  const toggleCell = (q: string, s: string, to: string) => {
    const now = draft.cells[cellKey(q, s)] ?? [];
    edit({ ...draft, cells: { ...draft.cells, [cellKey(q, s)]: now.includes(to) ? now.filter(t => t !== to) : [...now, to] } });
  };
  const setPda = (i: number, patch: Partial<PdaRow>) => edit({ ...draft, pda: draft.pda.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setTm = (i: number, patch: Partial<TmRow>) => edit({ ...draft, tm: draft.tm.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addPda = () => edit({ ...draft, pda: [...draft.pda, { from: draft.start, read: draft.alphabet[0] ?? "", top: BOTTOM, op: "push", write: "", to: draft.start }] });
  const addTm = () => edit({ ...draft, tm: [...draft.tm, { from: draft.start, read: draft.alphabet[0] ?? BLANK, write: draft.alphabet[0] ?? BLANK, move: "R", to: draft.start }] });

  const missing = missingArrows(draft);
  const nondet = draft.kind === "NFA" ? nondeterminism(draft) : [];
  const unreachable = machine ? unreachableStates(machine) : [];
  const maxLength = machine ? languageMaxLength(machine) : 0;
  const symbolsFor = (kind: "pda" | "tm") => {
    const used = new Set<string>([...draft.alphabet, ...(kind === "pda" ? [BOTTOM] : [BLANK, ...(draft.leftEnd ? [LEFT_END] : [])])]);
    for (const r of kind === "pda" ? draft.pda : draft.tm) { for (const c of [...r.write]) used.add(c); if ("top" in r) used.add(r.top); else used.add(r.read); }
    return [...used];
  };

  return (
    <div className="alab" data-testid="tool-automataLab" dir="rtl">
      <section className="learning-autodesign-section" aria-labelledby={ids + "-m"}>
        <h3 id={ids + "-m"} className="learning-autodesign-heading">١. الآلة</h3>
        {kinds.length > 1 ? (
          <fieldset className="alab-kinds">
            <legend className="stt-label">نوع الآلة</legend>
            {kinds.map(k => (
              <label key={k} className="learning-autodesign-toggle">
                <input type="radio" name={ids + "-kind"} checked={draft.kind === k} onChange={() => chooseKind(k)} />
                <span>{KIND_LABEL[k]}</span>
              </label>
            ))}
          </fieldset>
        ) : <p className="stt-hint">{KIND_LABEL[kinds[0]]}</p>}
        <div className="stt-row">
          <label className="stt-label" htmlFor={ids + "-alpha"}>الأبجدية Σ</label>
          <input id={ids + "-alpha"} className="stt-input alab-short" dir="ltr" value={alphabetText} maxLength={60} autoComplete="off" spellCheck={false}
            onChange={e => setAlphabetText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyAlphabet(); } }}
            aria-invalid={alphabetError ? true : undefined} aria-describedby={alphabetError ? ids + "-alpha-err" : undefined} />
          <button type="button" className="stt-btn" onClick={applyAlphabet}>اعتمد الأبجدية</button>
        </div>
        {alphabetError && <p id={ids + "-alpha-err"} className="stt-error" role="alert">{alphabetError}</p>}
        {draft.kind === "TM" && (
          <label className="learning-autodesign-toggle">
            <input type="checkbox" checked={draft.leftEnd} onChange={e => edit({ ...draft, leftEnd: e.target.checked })} />
            <span>علامة بداية الشريط {LEFT_END} قبل الكلمة (كما في المادة)</span>
          </label>
        )}
        <div className="stt-row">
          <button type="button" className="stt-btn" onClick={loadExample}>افتح مثالًا: {LAB_EXAMPLES[draft.kind].title}</button>
          <button type="button" className="stt-btn" onClick={clearAll}>آلة جديدة</button>
        </div>
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-s"}>
        <h3 id={ids + "-s"} className="learning-autodesign-heading">٢. الحالات</h3>
        <ul className="learning-autodesign-states">
          {draft.states.map(q => (
            <li key={q} className="learning-autodesign-staterow">
              <span className="learning-autodesign-statename" dir="ltr">{q}</span>
              {draft.labels[q] && <span className="stt-hint">({draft.labels[q]})</span>}
              <label className="learning-autodesign-toggle">
                <input type="radio" name={ids + "-start"} checked={draft.start === q} onChange={() => edit({ ...draft, start: q })} />
                <span>بداية</span>
              </label>
              <label className="learning-autodesign-toggle">
                <input type="checkbox" checked={draft.accept.includes(q)} onChange={() => edit({ ...draft, accept: draft.accept.includes(q) ? draft.accept.filter(s => s !== q) : [...draft.accept, q] })} />
                <span>قبول</span>
              </label>
              <button type="button" className="learning-autodesign-btn is-quiet" onClick={() => edit(removeState(draft, q))} disabled={draft.states.length <= 1} aria-label={"احذف الحالة " + q}>حذف</button>
            </li>
          ))}
        </ul>
        <button type="button" className="stt-btn" onClick={() => edit(addState(draft))} disabled={draft.states.length >= MAX_STATES}>
          إضافة حالة{draft.states.length >= MAX_STATES ? " (بلغت الحد " + MAX_STATES + ")" : ""}
        </button>
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-t"}>
        <h3 id={ids + "-t"} className="learning-autodesign-heading">٣. الانتقالات</h3>
        {isFa ? <FaTable draft={draft} ids={ids} setCell={setCell} toggleCell={toggleCell} />
          : draft.kind === "PDA" ? <PdaRows draft={draft} ids={ids} symbols={symbolsFor("pda")} set={setPda} remove={i => edit({ ...draft, pda: draft.pda.filter((_, k) => k !== i) })} add={addPda} />
          : <TmRows draft={draft} ids={ids} symbols={symbolsFor("tm")} set={setTm} remove={i => edit({ ...draft, tm: draft.tm.filter((_, k) => k !== i) })} add={addTm} />}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-c"}>
        <h3 id={ids + "-c"} className="learning-autodesign-heading">٤. الفحوص</h3>
        {checked.issues.length > 0 ? (
          <div role="status">
            <p className="stt-error">الآلة غير جاهزة بعد:</p>
            <ul className="alab-list">{checked.issues.map((i, k) => <li key={k}>{i.text}</li>)}</ul>
          </div>
        ) : (
          <ul className="alab-list" role="status">
            {draft.kind === "DFA" && (missing.length === 0
              ? <li>✓ الأوتومات كامل: سهم من كل حالة بكل رمز.</li>
              : <li>
                  الأوتومات غير كامل: {missing.length === 1 ? "ينقص سهم" : "تنقص " + missing.length + " أسهم"} —{" "}
                  <span dir="ltr">{missing.slice(0, 6).map(m => "(" + m.state + ", " + m.symbol + ")").join(" ")}{missing.length > 6 ? " …" : ""}</span>.
                  {" "}كلمة تصل إلى سهم ناقص تُرفض.{" "}
                  <button type="button" className="stt-btn" onClick={() => edit(addTrapState(draft))} disabled={draft.states.length >= MAX_STATES}>أضف حالة مصيدة</button>
                </li>)}
            {draft.kind === "NFA" && (nondet.length
              ? <li>الآلة غير حتمية: {nondet.slice(0, 4).join("؛ ")}{nondet.length > 4 ? " …" : ""}.</li>
              : <li>لا ε ولا أكثر من سهم لحالة ورمز: الآلة حتمية فعليًا.</li>)}
            {unreachable.length > 0 ? <li>حالات لا نصلها من البداية: <span dir="ltr">{unreachable.join("، ")}</span>.</li> : <li>✓ كل الحالات نصلها من البداية.</li>}
            {machine && machine.accept.length === 0 && <li>لا حالة قبول: الآلة ترفض كل كلمة.</li>}
          </ul>
        )}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-r"}>
        <h3 id={ids + "-r"} className="learning-autodesign-heading">٥. الرسم والتشغيل خطوة خطوة</h3>
        {machine && scene
          ? <AutomatonPlayer key={stamp} machine={machine} scene={scene} words={[]} initialWord="" />
          : <p className="stt-hint">تظهر الآلة هنا حين تصبح جاهزة (انظر «الفحوص»).</p>}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-b"}>
        <h3 id={ids + "-b"} className="learning-autodesign-heading">٦. كلمات كثيرة معًا</h3>
        <label className="stt-label" htmlFor={ids + "-batch"}>الكلمات (كلمة في كل سطر، أو بينها مسافات أو فواصل؛ ε للكلمة الفارغة)</label>
        <textarea id={ids + "-batch"} className="stt-input alab-batch" dir="ltr" rows={3} value={batchText} spellCheck={false} onChange={e => setBatchText(e.target.value)} />
        <button type="button" className="stt-btn is-primary" disabled={!machine} onClick={() => machine && setBatch({ stamp, value: runBatch(machine, parseWords(batchText)) })}>شغّل الكل</button>
        {batchNow && (batchNow.length === 0 ? <p className="stt-hint" role="status">اكتب كلمة واحدة على الأقل.</p> : (
          <div className="learning-autodesign-tablewrap" role="region" aria-label="نتائج الكلمات" tabIndex={0}>
            <table className="learning-autodesign-table" role="status">
              <thead><tr><th scope="col">الكلمة</th><th scope="col">النتيجة</th></tr></thead>
              <tbody>
                {batchNow.map(r => (
                  <tr key={r.word}>
                    <td dir="ltr">{shown(r.word)}</td>
                    <td>{r.tooLong ? "طويلة: 40 رمزًا على الأكثر" : r.bad !== undefined ? "الرمز " + r.bad + " ليس في الأبجدية"
                      : r.verdict === "accept" ? "✓ تُقبل" : r.verdict === "nohalt" ? "لم تتوقف (1000 خطوة)" : "✗ تُرفض"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="learning-autodesign-section" aria-labelledby={ids + "-l"}>
        <h3 id={ids + "-l"} className="learning-autodesign-heading">٧. لغة آلتي</h3>
        <div className="stt-row">
          <label className="stt-label" htmlFor={ids + "-len"}>كل الكلمات حتى الطول</label>
          <select id={ids + "-len"} className="stt-input alab-short" value={Math.min(lengthWanted, maxLength)} disabled={!machine} onChange={e => setLengthWanted(Number(e.target.value))}>
            {Array.from({ length: maxLength + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" className="stt-btn is-primary" disabled={!machine} onClick={() => machine && setListing({ stamp, value: languageUpTo(machine, Math.min(lengthWanted, maxLength)) })}>اعرض الكلمات التي تقبلها</button>
        </div>
        {listingNow && <Listing listing={listingNow} />}
      </section>
    </div>
  );
}

function Listing({ listing }: { listing: LanguageListing }) {
  return (
    <div role="status">
      <p className="stt-hint">
        تقبل الآلة {listing.acceptedCount} {listing.acceptedCount === 1 ? "كلمة" : "كلمات"} من {listing.tried} حتى الطول {listing.maxLength}
        {listing.acceptedCount > listing.accepted.length ? " (تظهر أول " + listing.accepted.length + ")" : ""}، من الأقصر إلى الأطول.
      </p>
      {listing.accepted.length > 0
        ? <p className="alab-words" dir="ltr">{listing.accepted.map(w => <span key={w} className="learning-autodesign-word">{shown(w)}</span>)}</p>
        : <p className="stt-hint">لا كلمة مقبولة حتى هذا الطول.</p>}
      {listing.nohalt.length > 0 && (
        <p className="stt-hint">لم تتوقف الآلة (1000 خطوة) على: <span dir="ltr">{listing.nohalt.slice(0, 12).map(shown).join("، ")}{listing.nohalt.length > 12 ? " …" : ""}</span></p>
      )}
    </div>
  );
}

function FaTable({ draft, ids, setCell, toggleCell }: { draft: LabDraft; ids: string; setCell: (q: string, s: string, to: string) => void; toggleCell: (q: string, s: string, to: string) => void }) {
  // a deterministic draft shows the ε column only while it still has ε arrows (left from a non-deterministic one), so they can be cleared
  const epsLeft = draft.states.some(q => (draft.cells[cellKey(q, EPS)] ?? []).some(t => draft.states.includes(t)));
  const symbols = draft.kind === "NFA" || epsLeft ? [...draft.alphabet, EPS] : draft.alphabet;
  return (
    <>
      <p className="stt-hint">{draft.kind === "DFA" ? "اختر لكل حالة ولكل رمز الحالة التي ننتقل إليها («—»: لا سهم)." : "اختر لكل حالة ولكل رمز كل الحالات التي يمكن الانتقال إليها، وعمود ε للانتقال الفارغ."}</p>
      <div className="learning-autodesign-tablewrap" tabIndex={0} role="region" aria-label="جدول الانتقالات" id={ids + "-fa"}>
        <table className="learning-autodesign-table">
          <thead><tr><th scope="col">الحالة</th>{symbols.map(s => <th key={s} scope="col" dir="ltr">{s}</th>)}</tr></thead>
          <tbody>
            {draft.states.map(q => (
              <tr key={q}>
                <th scope="row" dir="ltr">{q}</th>
                {symbols.map(s => {
                  const now = (draft.cells[cellKey(q, s)] ?? []).filter(t => draft.states.includes(t));
                  const label = "من " + q + " بالرمز " + s;
                  return (
                    <td key={s}>
                      {draft.kind === "DFA" && now.length <= 1 && s !== EPS
                        ? (
                          <select className="learning-autodesign-select" value={now[0] ?? ""} onChange={e => setCell(q, s, e.target.value)} aria-label={label + " إلى"} dir="ltr">
                            <option value="">—</option>
                            {draft.states.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        )
                        : (
                          <div className="learning-autodesign-targets" role="group" aria-label={label + " إلى"}>
                            {draft.states.map(t => (
                              <button key={t} type="button" dir="ltr" className={"learning-autodesign-target" + (now.includes(t) ? " is-on" : "")} aria-pressed={now.includes(t)} onClick={() => toggleCell(q, s, t)}>{t}</button>
                            ))}
                          </div>
                        )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
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

function PdaRows({ draft, ids, symbols, set, remove, add }: { draft: LabDraft; ids: string; symbols: string[]; set: (i: number, p: Partial<PdaRow>) => void; remove: (i: number) => void; add: () => void }) {
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

function TmRows({ draft, ids, symbols, set, remove, add }: { draft: LabDraft; ids: string; symbols: string[]; set: (i: number, p: Partial<TmRow>) => void; remove: (i: number) => void; add: () => void }) {
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

