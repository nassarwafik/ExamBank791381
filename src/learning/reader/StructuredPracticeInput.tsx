import { useState } from "react";
import { IconCheck, IconClose } from "../../icons";
import type { PracticeQuestion, StructuredQuestionKind } from "../content/types";
import type { LearningResponse } from "../practice/evaluator";
import type { StudyReveal } from "../study/types";

// 791381s Phase 3 — the answering surfaces of the STRUCTURED kinds (owner request: مخزن كلمات، وصل، ترتيب، تصنيف). Each one
// keeps its own draft (the learner's work in progress) and hands a complete response to PracticeBlockView with «تحقّق»; the
// judging, the server check, the study report and the reveal stay in PracticeBlockView, exactly as for multipleChoice.
//
//   • wordBank — a passage with blanks and a bank of word chips: pick a chip to fill the selected (or next empty) blank; pick a
//     filled blank to give its word back. Every chip is used at most once.
//   • matching — each left item gets a native <select> of the right items (one row per item; keyboard / screen-reader native).
//   • ordering — the items in a list with ▲ / ▼ buttons; «تحقّق» sends the order.
//   • classify — each item gets one button per group (a radio group per item).
//
// After a verdict every part shows right / wrong (icon + words, never colour only). In REVEAL mode the surface locks and each
// wrong part shows its right answer («الصحيح: …»); outside reveal mode the learner edits and checks again (`onEdit` clears the
// verdict). Nothing of the key is ever read here before a verdict: `revealed` is null until the answer has been judged.

export type PartVerdict = "right" | "wrong" | undefined;
type StructuredQuestion = Extract<PracticeQuestion, { kind: StructuredQuestionKind }>;
type Props<Q> = {
  question: Q;
  labelledBy: string;
  /** Reveal mode after a verdict: no more edits. */
  locked: boolean;
  /** The verdict on one part (blank / left item / item) — undefined while there is none. */
  partOf: (part: string) => PartVerdict;
  /** The right answer (reveal mode, after a verdict), else null. */
  revealed: StudyReveal | null;
  onSubmit: (response: LearningResponse) => void;
  /** The draft changed after a verdict (outside reveal mode): the parent clears that verdict. */
  onEdit: () => void;
};

export default function StructuredPracticeInput(props: Props<StructuredQuestion>) {
  const q = props.question;
  switch (q.kind) {
    case "wordBank": return <WordBankInput {...props} question={q} />;
    case "matching": return <MatchingInput {...props} question={q} />;
    case "ordering": return <OrderingInput {...props} question={q} />;
    case "classify": return <ClassifyInput {...props} question={q} />;
  }
}

function PartMark({ verdict }: { verdict: PartVerdict }) {
  if (verdict === "right") return <span className="learning-practice-partmark is-right"><IconCheck size={13} aria-hidden="true" /><span className="learning-practice-sr">صحيح</span></span>;
  if (verdict === "wrong") return <span className="learning-practice-partmark is-wrong"><IconClose size={13} aria-hidden="true" /><span className="learning-practice-sr">خطأ</span></span>;
  return null;
}
const partClass = (v: PartVerdict) => (v ? " is-" + v : "");

function CheckButton({ disabled, onClick, locked }: { disabled: boolean; onClick: () => void; locked: boolean }) {
  if (locked) return null;
  return <button type="button" className="eb-button is-primary is-small learning-practice-check" disabled={disabled} onClick={onClick}>تحقّق</button>;
}

// ── wordBank ─────────────────────────────────────────────────────────────────────────────────────────────────
function WordBankInput({ question, labelledBy, locked, partOf, revealed, onSubmit, onEdit }: Props<Extract<StructuredQuestion, { kind: "wordBank" }>>) {
  const blanks = question.segments.filter((s): s is { blank: string } => typeof s !== "string").map(s => s.blank);
  const [fill, setFill] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(blanks[0] ?? null);
  const used = new Set(Object.values(fill));
  const firstEmpty = (f: Record<string, string>) => blanks.find(b => !f[b]) ?? null;
  const judged = blanks.some(b => partOf(b) !== undefined);
  const edit = (next: Record<string, string>, nextActive: string | null) => { setFill(next); setActive(nextActive); if (judged) onEdit(); };
  const pickWord = (word: string) => {
    if (locked || used.has(word)) return;
    const target = active && !fill[active] ? active : firstEmpty(fill);
    if (!target) return;
    const next = { ...fill, [target]: word };
    edit(next, firstEmpty(next));
  };
  const pickBlank = (blank: string) => {
    if (locked) return;
    if (fill[blank]) { const next = { ...fill }; delete next[blank]; edit(next, blank); } else setActive(blank);
  };
  const right = revealed?.kind === "wordBank" ? revealed.answers : null;
  const numberOf = (blank: string) => blanks.indexOf(blank) + 1;     // the blank's printed position («الفراغ 1, 2 …»)
  return (
    <div className="learning-practice-structured kind-wordbank">
      <p className="learning-practice-passage" aria-describedby={labelledBy}>
        {question.segments.map((seg, i) => {
          if (typeof seg === "string") return <span key={i}>{seg}</span>;
          const v = partOf(seg.blank), word = fill[seg.blank];
          return (
            <span key={i} className="learning-practice-blankwrap">
              <button
                type="button"
                className={"learning-practice-blank" + (word ? " is-filled" : "") + (active === seg.blank && !locked ? " is-active" : "") + partClass(v)}
                aria-label={`الفراغ ${numberOf(seg.blank)}: ${word ?? "فارغ"}`}
                aria-disabled={locked || undefined}
                onClick={() => pickBlank(seg.blank)}
              >{word ?? "   "}</button>
              <PartMark verdict={v} />
              {v === "wrong" && right?.[seg.blank] && <span className="learning-practice-fix">الصحيح: {right[seg.blank]}</span>}
            </span>
          );
        })}
      </p>
      <div className="learning-practice-bank" role="group" aria-label="مخزن الكلمات">
        <span className="learning-practice-banklabel" aria-hidden="true">مخزن الكلمات:</span>
        {question.bank.map(word => (
          <button key={word} type="button" className={"learning-practice-chip" + (used.has(word) ? " is-used" : "")} disabled={locked || used.has(word)} onClick={() => pickWord(word)}>{word}</button>
        ))}
      </div>
      <CheckButton locked={locked} disabled={blanks.some(b => !fill[b])} onClick={() => onSubmit({ kind: "wordBank", choices: { ...fill } })} />
    </div>
  );
}

// ── matching ─────────────────────────────────────────────────────────────────────────────────────────────────
function MatchingInput({ question, labelledBy, locked, partOf, revealed, onSubmit, onEdit }: Props<Extract<StructuredQuestion, { kind: "matching" }>>) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const right = revealed?.kind === "matching" ? revealed.pairs : null;
  const textOf = (id: string) => question.right.find(r => r.id === id)?.text ?? "";
  const judged = question.left.some(l => partOf(l.id) !== undefined);
  return (
    <div className="learning-practice-structured kind-matching">
      <ul className="learning-practice-rows">
        {question.left.map(l => {
          const v = partOf(l.id);
          return (
            <li key={l.id} className={"learning-practice-row" + partClass(v)}>
              <label className="learning-practice-rowlabel" htmlFor={labelledBy + "-m-" + l.id}>{l.text}</label>
              <select
                id={labelledBy + "-m-" + l.id}
                className="learning-practice-select"
                value={choice[l.id] ?? ""}
                disabled={locked}
                onChange={e => { setChoice(c => ({ ...c, [l.id]: e.target.value })); if (judged) onEdit(); }}
              >
                <option value="" disabled>اختر…</option>
                {question.right.map(r => <option key={r.id} value={r.id}>{r.text}</option>)}
              </select>
              <PartMark verdict={v} />
              {v === "wrong" && right?.[l.id] && <span className="learning-practice-fix">الصحيح: {textOf(right[l.id])}</span>}
            </li>
          );
        })}
      </ul>
      <CheckButton locked={locked} disabled={question.left.some(l => !choice[l.id])} onClick={() => onSubmit({ kind: "matching", choices: { ...choice } })} />
    </div>
  );
}

// ── ordering ─────────────────────────────────────────────────────────────────────────────────────────────────
function OrderingInput({ question, locked, partOf, revealed, onSubmit, onEdit }: Props<Extract<StructuredQuestion, { kind: "ordering" }>>) {
  const [order, setOrder] = useState<string[]>(() => question.items.map(i => i.id));
  const textOf = (id: string) => question.items.find(i => i.id === id)?.text ?? "";
  const judged = order.some(id => partOf(id) !== undefined);
  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
    if (judged) onEdit();
  };
  const right = revealed?.kind === "ordering" ? revealed.order : null;
  return (
    <div className="learning-practice-structured kind-ordering">
      <ol className="learning-practice-rows">
        {order.map((id, i) => {
          const v = partOf(id);
          return (
            <li key={id} className={"learning-practice-row" + partClass(v)}>
              <span className="learning-practice-pos" aria-hidden="true">{i + 1}</span>
              <span className="learning-practice-rowlabel">{textOf(id)}</span>
              <PartMark verdict={v} />
              {!locked && (
                <span className="learning-practice-move">
                  <button type="button" className="eb-button is-quiet is-small" aria-label={"انقل للأعلى: " + textOf(id)} disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
                  <button type="button" className="eb-button is-quiet is-small" aria-label={"انقل للأسفل: " + textOf(id)} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>▼</button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {right && right.some((id, i) => order[i] !== id) && (
        <div className="learning-practice-fixlist">
          <p className="learning-practice-fix">الترتيب الصحيح:</p>
          <ol>{right.map(id => <li key={id}>{textOf(id)}</li>)}</ol>
        </div>
      )}
      <CheckButton locked={locked} disabled={false} onClick={() => onSubmit({ kind: "ordering", order: [...order] })} />
    </div>
  );
}

// ── classify ─────────────────────────────────────────────────────────────────────────────────────────────────
function ClassifyInput({ question, labelledBy, locked, partOf, revealed, onSubmit, onEdit }: Props<Extract<StructuredQuestion, { kind: "classify" }>>) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const right = revealed?.kind === "classify" ? revealed.assign : null;
  const labelOf = (id: string) => question.groups.find(g => g.id === id)?.text ?? "";
  const judged = question.items.some(it => partOf(it.id) !== undefined);
  return (
    <div className="learning-practice-structured kind-classify">
      <ul className="learning-practice-rows">
        {question.items.map(it => {
          const v = partOf(it.id);
          return (
            <li key={it.id} className={"learning-practice-row" + partClass(v)}>
              <span className="learning-practice-rowlabel" id={labelledBy + "-c-" + it.id}>{it.text}</span>
              <span className="learning-practice-groups" role="radiogroup" aria-labelledby={labelledBy + "-c-" + it.id}>
                {question.groups.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={choice[it.id] === g.id}
                    aria-disabled={locked || undefined}
                    className={"learning-practice-group" + (choice[it.id] === g.id ? " is-picked" : "")}
                    onClick={locked ? undefined : () => { setChoice(c => ({ ...c, [it.id]: g.id })); if (judged) onEdit(); }}
                  >{g.text}</button>
                ))}
              </span>
              <PartMark verdict={v} />
              {v === "wrong" && right?.[it.id] && <span className="learning-practice-fix">الصحيح: {labelOf(right[it.id])}</span>}
            </li>
          );
        })}
      </ul>
      <CheckButton locked={locked} disabled={question.items.some(it => !choice[it.id])} onClick={() => onSubmit({ kind: "classify", choices: { ...choice } })} />
    </div>
  );
}
