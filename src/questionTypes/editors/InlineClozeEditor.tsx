import { useRef, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { INLINE_CLOZE_LIMITS, inlineClozePreviewText, validateInlineClozeConfig, validateInlineClozeQuestion, type InlineClozeScoringMode } from "../../inlineClozeQuestion";
import "../../inlineCloze/inlineCloze.css";

// Phase 19A — inlineCloze@1 authoring (lazy). A lightweight TOKEN editor, never raw JSON and never contentEditable: the passage is a
// sequence of TEXT pieces (plain textareas) and BLANK cards (a text blank or a dropdown). «إدراج … عند المؤشر» splits the text
// piece at the caret and inserts the blank between the two halves; removing a blank merges its neighbouring text. Blank ids are
// STABLE (a new blank takes the next unused number; editing text never renumbers or re-ids anything), so the private key under
// `answer.blanks` always follows its blank. The canonical passage written to the node never contains an empty text segment
// (the local model keeps empty pieces so the teacher can type between two blanks). Values are stored as typed; INLINE validation
// runs the ONE canonical validator (validateInlineClozeQuestion — the same rules finalization and the grader apply).
type Raw = Record<string, unknown>;
type Piece = { k: "text"; text: string } | { k: "blank"; seg: Raw };
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const SCORING_LABELS: Record<InlineClozeScoringMode, string> = { proportional: "علامة نسبية: علامة السؤال × (الفراغات الصحيحة ÷ كل الفراغات)", allOrNothing: "كل شيء أو لا شيء: العلامة كاملة فقط إذا كانت كل الفراغات صحيحة" };

/** node segments → local pieces: a text piece at the start, at the end and between two blanks (empty when the passage has none). */
function toPieces(segs: unknown[]): Piece[] {
  const out: Piece[] = [];
  for (const s of segs) {
    if (isObj(s) && s.type === "text" && typeof s.text === "string") {
      const last = out[out.length - 1];
      if (last && last.k === "text") last.text += s.text; else out.push({ k: "text", text: s.text });
    } else {
      if (!out.length || out[out.length - 1].k !== "text") out.push({ k: "text", text: "" });
      out.push({ k: "blank", seg: isObj(s) ? s : { type: String(s) } });
    }
  }
  if (!out.length || out[out.length - 1].k !== "text") out.push({ k: "text", text: "" });
  return out;
}
/** local pieces → canonical node segments (empty text dropped, adjacent text merged; blank segments written exactly as edited). */
function toSegments(pieces: Piece[]): Raw[] {
  const out: Raw[] = [];
  for (const p of pieces) {
    if (p.k === "blank") { out.push(p.seg); continue; }
    if (p.text === "") continue;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.text = String(last.text) + p.text; else out.push({ type: "text", text: p.text });
  }
  return out;
}
const mergeText = (pieces: Piece[]): Piece[] => {
  const out: Piece[] = [];
  for (const p of pieces) { const last = out[out.length - 1]; if (p.k === "text" && last && last.k === "text") last.text += p.text; else out.push(p.k === "text" ? { ...p } : p); }
  return out;
};
const nextId = (prefix: string, used: string[]) => prefix + (used.reduce((m, id) => { const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN; return Number.isInteger(n) && n > m ? n : m; }, 0) + 1);
const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

export default function InlineClozeEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const cfg = isObj(node.inlineCloze) ? (node.inlineCloze as Raw) : {};
  const segs: unknown[] = Array.isArray(cfg.segments) ? cfg.segments : [];
  const answer: Raw = isObj(node.answer) ? node.answer : {};
  const keys: Raw = isObj(answer.blanks) ? (answer.blanks as Raw) : {};
  const [local, setLocal] = useState<Piece[]>(() => toPieces(segs));
  // The local model follows the node: after an external change (undo / redo / import) the pieces are rebuilt from the node.
  const pieces = JSON.stringify(toSegments(local)) === JSON.stringify(segs) ? local : toPieces(segs);
  const textRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const write = (next: Piece[], nextKeys: Raw = keys, scoring: unknown = answer.scoring) => {
    setLocal(next);
    onChange({ inlineCloze: { v: 1, segments: toSegments(next) } as never, answer: { ...answer, scoring, blanks: nextKeys } });
  };
  const blankIds = pieces.flatMap(p => (p.k === "blank" && typeof p.seg.id === "string" ? [p.seg.id] : []));
  const insertAt = (ti: number, control: "text" | "dropdown") => {
    let seen = -1;
    const at = pieces.findIndex(p => p.k === "text" && ++seen === ti);
    const piece = pieces[at] as { k: "text"; text: string };
    const el = textRefs.current[ti];
    const pos = el && typeof el.selectionStart === "number" ? Math.min(el.selectionStart, piece.text.length) : piece.text.length;
    const id = nextId("b", [...blankIds, ...Object.keys(keys)]);
    const seg: Raw = control === "text" ? { type: "blank", id, control: "text" } : { type: "blank", id, control: "dropdown", options: [{ id: "o1", label: "" }, { id: "o2", label: "" }] };
    const key = control === "text" ? { accepted: [], caseSensitive: false } : { correctOptionId: "" };
    write([...pieces.slice(0, at), { k: "text", text: piece.text.slice(0, pos) }, { k: "blank", seg }, { k: "text", text: piece.text.slice(pos) }, ...pieces.slice(at + 1)], { ...keys, [id]: key });
  };
  const removeBlank = (bi: number) => {
    let seen = -1;
    const at = pieces.findIndex(p => p.k === "blank" && ++seen === bi);
    if (at < 0) return;
    const seg = (pieces[at] as { k: "blank"; seg: Raw }).seg;
    const nextKeys = { ...keys };
    if (typeof seg.id === "string") delete nextKeys[seg.id];
    write(mergeText(pieces.filter((_, i) => i !== at)), nextKeys);
  };
  const setSeg = (at: number, seg: Raw) => write(pieces.map((p, i) => (i === at ? { k: "blank", seg } : p)));
  const setKey = (id: string, key: Raw) => write(pieces, { ...keys, [id]: key });

  const issues = validateInlineClozeQuestion(node as unknown as Raw);
  const valid = validateInlineClozeConfig(node.inlineCloze);
  const scoring = answer.scoring === "proportional" || answer.scoring === "allOrNothing" ? answer.scoring : "";

  let textIndex = 0, blankIndex = 0;
  return (
    <div className="qt-editor qt-editor-inlineCloze" data-testid="qt-editor-inlineCloze">
      <p className="sb-hint">اكتب النص في المقاطع، وضع المؤشر حيث تريد الفراغ ثم اختر «فراغ كتابة» أو «قائمة منسدلة». الإجابات المقبولة والخيار الصحيح خاصة بالمعلم ولا تظهر للطالب.</p>
      <div className="cloze-pieces">
        {pieces.map((p, i) => {
          if (p.k === "text") {
            const ti = textIndex++;
            const n = ti + 1;
            return (
              <div key={"t" + i} className="cloze-piece-text">
                <textarea ref={el => { textRefs.current[ti] = el; }} aria-label={"نص المقطع " + n} value={p.text} maxLength={INLINE_CLOZE_LIMITS.textChars} disabled={disabled} dir="auto"
                  onChange={e => write(pieces.map((q, j) => (j === i ? { k: "text", text: e.target.value } : q)))} />
                <div className="cloze-piece-tools">
                  <button type="button" className="sb-mini-btn" aria-label={"إدراج فراغ كتابة عند المؤشر في المقطع " + n} disabled={disabled} onClick={() => insertAt(ti, "text")}>+ فراغ كتابة</button>
                  <button type="button" className="sb-mini-btn" aria-label={"إدراج قائمة منسدلة عند المؤشر في المقطع " + n} disabled={disabled} onClick={() => insertAt(ti, "dropdown")}>+ قائمة منسدلة</button>
                </div>
              </div>
            );
          }
          const bi = blankIndex++;
          const n = bi + 1;
          const seg = p.seg;
          const id = str(seg.id);
          const key = isObj(keys[id]) ? (keys[id] as Raw) : {};
          const remove = <button type="button" className="sb-mini-btn" aria-label={"حذف الفراغ " + n} disabled={disabled} onClick={() => removeBlank(bi)}>حذف</button>;
          if (seg.control === "text") {
            const accepted: unknown[] = Array.isArray(key.accepted) ? key.accepted : [];
            const shown = accepted.length ? accepted : [""];
            const setAccepted = (next: unknown[]) => setKey(id, { ...key, accepted: next });
            return (
              <div key={id || "b" + i} className="cloze-card" data-testid="cloze-blank-card">
                <div className="cloze-card-head"><span>الفراغ {n} — فراغ كتابة</span>{remove}</div>
                {shown.map((a, m) => (
                  <div key={m} className="cloze-row">
                    <input type="text" aria-label={"الإجابة المقبولة " + (m + 1) + " للفراغ " + n} value={str(a)} maxLength={INLINE_CLOZE_LIMITS.acceptedChars} dir="auto" disabled={disabled}
                      onChange={e => { const next = [...shown]; next[m] = e.target.value; setAccepted(next); }} />
                    {shown.length > 1 && <button type="button" className="sb-mini-btn" aria-label={"حذف الإجابة " + (m + 1) + " للفراغ " + n} disabled={disabled} onClick={() => setAccepted(shown.filter((_, j) => j !== m))}>×</button>}
                  </div>
                ))}
                <div className="cloze-row">
                  <button type="button" className="sb-mini-btn" aria-label={"+ إجابة مقبولة للفراغ " + n} disabled={disabled || shown.length >= INLINE_CLOZE_LIMITS.accepted} onClick={() => setAccepted([...shown, ""])}>+ إجابة مقبولة</button>
                  <label className="cloze-row"><input type="checkbox" aria-label={"مطابقة حالة الأحرف للفراغ " + n} checked={key.caseSensitive === true} disabled={disabled} onChange={e => setKey(id, { ...key, accepted: shown, caseSensitive: e.target.checked })} />مطابقة حالة الأحرف (A ≠ a)</label>
                </div>
              </div>
            );
          }
          if (seg.control === "dropdown") {
            const options: Raw[] = Array.isArray(seg.options) ? seg.options.filter(isObj) : [];
            const optIds = options.map(o => str(o.id));
            const setOptions = (next: Raw[], correct: unknown = key.correctOptionId) => {
              const nextSegs = pieces.map((q, j) => (j === i ? { k: "blank" as const, seg: { ...seg, options: next } } : q));
              const keep = next.some(o => o.id === correct) ? correct : "";
              write(nextSegs, { ...keys, [id]: { correctOptionId: keep } });
            };
            return (
              <div key={id || "b" + i} className="cloze-card" data-testid="cloze-blank-card">
                <div className="cloze-card-head"><span>الفراغ {n} — قائمة منسدلة</span>{remove}</div>
                {options.map((o, m) => (
                  <div key={str(o.id) || m} className="cloze-row">
                    <input type="radio" name={"cloze-correct-" + id} aria-label={"الخيار " + (m + 1) + " هو الصحيح للفراغ " + n} checked={key.correctOptionId === o.id} disabled={disabled} onChange={() => setKey(id, { correctOptionId: o.id })} />
                    <input type="text" aria-label={"الخيار " + (m + 1) + " للفراغ " + n} value={str(o.label)} maxLength={INLINE_CLOZE_LIMITS.labelChars} dir="auto" disabled={disabled}
                      onChange={e => setSeg(i, { ...seg, options: options.map((x, j) => (j === m ? { ...x, label: e.target.value } : x)) })} />
                    {options.length > INLINE_CLOZE_LIMITS.minOptions && <button type="button" className="sb-mini-btn" aria-label={"حذف الخيار " + (m + 1) + " للفراغ " + n} disabled={disabled} onClick={() => setOptions(options.filter((_, j) => j !== m))}>×</button>}
                  </div>
                ))}
                <div className="cloze-row"><button type="button" className="sb-mini-btn" aria-label={"+ خيار للفراغ " + n} disabled={disabled || options.length >= INLINE_CLOZE_LIMITS.options} onClick={() => setOptions([...options, { id: nextId("o", optIds), label: "" }])}>+ خيار</button></div>
              </div>
            );
          }
          return <div key={"x" + i} className="cloze-card" data-testid="cloze-blank-card"><div className="cloze-card-head"><span>الفراغ {n} — نوع غير مدعوم «{str(seg.control)}»</span>{remove}</div></div>;
        })}
      </div>
      <label className="sb-inline"><span>طريقة الاحتساب</span>
        <select className="sb-input sb-input-sm" aria-label="طريقة الاحتساب" value={scoring} disabled={disabled} onChange={e => write(pieces, keys, e.target.value)}>
          {scoring === "" && <option value="">— اختر —</option>}
          {(Object.keys(SCORING_LABELS) as InlineClozeScoringMode[]).map(m => <option key={m} value={m}>{SCORING_LABELS[m]}</option>)}
        </select>
      </label>
      <p className="cloze-author-preview" dir="auto" data-testid="cloze-author-preview">{valid.ok ? inlineClozePreviewText(valid.config) : "المعاينة غير متاحة حتى يصبح النص صالحًا."}</p>
      <ul className="cloze-issues" data-testid="cloze-issues" aria-live="polite">{issues.map((x, j) => <li key={j}>{x.message}</li>)}</ul>
    </div>
  );
}
