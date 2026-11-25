import { useState } from "react";
import { wordFacts, WORD_MAX, type WordFacts } from "./automataWords";

/**
 * AUTO-A6 — «أدوات الكلمات» of «مختبر الآلات», for unit 1 of the book: a word's length, how many times each symbol appears, and all its
 * prefixes, suffixes and subwords (by the book's definitions: ε and the word itself are both a prefix and a suffix), and its reverse.
 */
export default function AutomataWordTools({ ids, heading }: { ids: string; heading: string }) {
  const [text, setText] = useState("");
  const [shown, setShown] = useState<{ facts: WordFacts } | { message: string } | null>(null);
  const run = () => { const r = wordFacts(text); setShown(r.ok ? { facts: r.facts } : { message: r.message }); };
  const list = (words: string[]) => <span className="alab-words" dir="ltr">{words.map(w => <span key={w} className="learning-autodesign-word">{w === "" ? "ε" : w}</span>)}</span>;
  return (
    <section className="learning-autodesign-section" aria-labelledby={ids + "-w"}>
      <h3 id={ids + "-w"} className="learning-autodesign-heading">{heading}</h3>
      <div className="stt-row">
        <label className="stt-label" htmlFor={ids + "-word"}>الكلمة w (حتى {WORD_MAX} رمزًا)</label>
        <input id={ids + "-word"} className="stt-input alab-short" dir="ltr" value={text} maxLength={WORD_MAX * 2} autoComplete="off" spellCheck={false}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); run(); } }} />
        <button type="button" className="stt-btn is-primary" onClick={run}>حلّل الكلمة</button>
      </div>
      {shown && ("message" in shown ? <p className="stt-error" role="alert">{shown.message}</p> : (
        <dl className="alab-facts" role="status">
          <dt>الطول</dt><dd><span dir="ltr">|w| = {shown.facts.length}</span></dd>
          {shown.facts.counts.length > 0 && <><dt>عدد كل رمز</dt><dd dir="ltr">{shown.facts.counts.map(c => "#" + c.symbol + "(w) = " + c.count).join("، ")}</dd></>}
          <dt>البادئات ({shown.facts.prefixes.length})</dt><dd>{list(shown.facts.prefixes)}</dd>
          <dt>اللواحق ({shown.facts.suffixes.length})</dt><dd>{list(shown.facts.suffixes)}</dd>
          <dt>الكلمات الجزئية المختلفة ({shown.facts.subwords.length})</dt><dd>{list(shown.facts.subwords)}</dd>
          <dt>العكس</dt><dd>{list([shown.facts.reverse])}</dd>
        </dl>
      ))}
    </section>
  );
}
