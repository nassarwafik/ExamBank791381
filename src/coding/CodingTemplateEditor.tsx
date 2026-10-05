import { useId, useRef, useState } from "react";
import { CODING_LANGUAGES, codingLanguage } from "../codingQuestion";
import { CODING_TEMPLATE_LIMITS, reconstructTemplateSource, templateStarterValues, type CodingTemplateV1 } from "../codingTemplate";
import { markGap, setSegmentText, templateFromSource, unmarkGap } from "./templateAuthoring";
import "./codingTemplate.css";

// Phase 19F — the coding@3 LOCKED TEMPLATE authoring section (inside the lazy coding editor). No JSON: the teacher pastes a whole
// program, selects a span inside locked text and turns it into an editable gap (its text becomes the gap's starter), edits locked text
// and starters in place, turns a gap back into locked text, and sees the program exactly as a student starts with it. Gap ids are
// generated (gap1, gap2, …). The canonical validator (in the editor's validation panel) reports every rule; nothing here grades.
type Props = { template: CodingTemplateV1 | null; onChange: (next: CodingTemplateV1) => void; disabled?: boolean };
const EMPTY = (language: string): CodingTemplateV1 => ({ language, segments: [] });

export default function CodingTemplateEditor({ template, onChange, disabled }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const t = template ?? EMPTY("python");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const lockedRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const gaps = t.segments.filter(s => s.kind === "editable").length;
  const languageLabel = codingLanguage(t.language)?.label ?? t.language;
  const usePaste = () => {
    if (paste.trim() === "") { setNote("الصق البرنامج الكامل أولًا."); return; }
    onChange(templateFromSource(t.language, paste));
    setPaste("");
    setNote("أصبح البرنامج نصًا مقفلًا كاملًا. حدّد الآن جزءًا منه واضغط «اجعل النص المحدد فراغًا».");
  };
  const mark = (i: number) => {
    const el = lockedRefs.current[i];
    const start = el ? el.selectionStart : 0, end = el ? el.selectionEnd : 0;
    if (gaps >= CODING_TEMPLATE_LIMITS.gaps) { setNote("بلغت الحد الأقصى لعدد الفراغات (" + CODING_TEMPLATE_LIMITS.gaps + ")."); return; }
    const next = markGap(t, i, start, end);
    if (!next) { setNote("حدّد نصًا داخل جزء مقفل أولًا."); return; }
    setNote(start === end ? "أُضيف فراغ فارغ عند موضع المؤشر." : "أصبح النص المحدد فراغًا قابلًا للتعديل؛ نصه الحالي هو النص الابتدائي للطالب.");
    onChange(next);
  };
  const preview = reconstructTemplateSource(t, templateStarterValues(t));
  let lockedNo = 0, gapNo = 0;

  return (
    <fieldset data-coding-section="القالب المقفل" data-testid="coding-template-editor" className="cx-tpl">
      <legend>القالب المقفل</legend>
      <p className="cx-help">يرى الطالب البرنامج كاملًا، ويكتب في الفراغات فقط؛ الأجزاء المقفلة لا يمكنه تعديلها. عند التسليم يعيد الخادم بناء البرنامج من هذا القالب المنشور وإجابات الفراغات — لا يُقبل أي كود كامل من المتصفح.</p>
      <label className="sb-inline"><span>لغة القالب</span>
        <select className="sb-input sb-input-sm" aria-label="لغة القالب" value={t.language} disabled={disabled} onChange={e => onChange({ ...t, language: e.target.value })}>
          {CODING_LANGUAGES.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
      </label>
      <div className="cx-io-block">
        <label htmlFor={"cx-tpl-paste-" + uid}>البدء من برنامج كامل</label>
        <textarea id={"cx-tpl-paste-" + uid} className="cx-tpl-input" dir="ltr" rows={6} value={paste} disabled={disabled} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          placeholder="الصق البرنامج الكامل هنا…" onChange={e => setPaste(e.target.value)} data-testid="coding-template-paste" />
        <button type="button" className="cx-ws-button" onClick={usePaste} disabled={disabled || paste.trim() === ""}>{t.segments.length ? "استبدال القالب بهذا البرنامج" : "استخدام هذا البرنامج كقالب"}</button>
      </div>
      <p className="cx-help" data-testid="coding-template-counts">{"اللغة: " + languageLabel + " · الفراغات: " + gaps + " من " + CODING_TEMPLATE_LIMITS.gaps + " · المقاطع: " + t.segments.length + " من " + CODING_TEMPLATE_LIMITS.segments}</p>
      {note !== "" && <p className="cx-run-note" role="status" data-testid="coding-template-note">{note}</p>}
      <ol className="cx-tpl-code" dir="ltr" data-testid="coding-template-segments" aria-label="مقاطع القالب">
        {t.segments.map((s, i) => {
          if (s.kind === "locked") {
            const n = ++lockedNo, id = "cx-tpl-l-" + uid + "-" + i;
            return (
              <li key={"l" + i} className="cx-tpl-locked" data-testid="coding-template-author-locked">
                <div className="cx-tpl-gap-bar" dir="rtl"><label className="cx-tpl-tag" htmlFor={id}>{"🔒 نص مقفل " + n}</label>
                  <button type="button" className="cx-tpl-reset" onClick={() => mark(i)} disabled={disabled}>اجعل النص المحدد فراغًا</button></div>
                <textarea id={id} ref={el => { lockedRefs.current[i] = el; }} className="cx-tpl-input" dir="ltr" rows={Math.min(14, Math.max(2, s.text.split("\n").length))} value={s.text} disabled={disabled}
                  spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" onChange={e => onChange(setSegmentText(t, i, e.target.value))} />
              </li>
            );
          }
          const n = ++gapNo, id = "cx-tpl-g-" + uid + "-" + i;
          return (
            <li key={s.id} className="cx-tpl-gap" data-testid="coding-template-author-gap" data-gap-id={s.id}>
              <div className="cx-tpl-gap-bar" dir="rtl"><label className="cx-tpl-tag is-gap" htmlFor={id}>{"✎ فراغ " + n + " (" + s.id + ") — النص الابتدائي"}</label>
                <button type="button" className="cx-tpl-reset" onClick={() => { const next = unmarkGap(t, i); if (next) onChange(next); }} disabled={disabled}>إلغاء الفراغ (يصبح نصًا مقفلًا)</button></div>
              <textarea id={id} className="cx-tpl-input" dir="ltr" rows={Math.min(10, Math.max(2, s.starter.split("\n").length))} value={s.starter} disabled={disabled}
                spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" onChange={e => onChange(setSegmentText(t, i, e.target.value))} />
            </li>
          );
        })}
      </ol>
      <details className="cx-tpl-full" open data-testid="coding-template-author-preview">
        <summary>البرنامج كما يبدأ به الطالب</summary>
        <pre dir="ltr" lang="en" tabIndex={0} aria-label="معاينة البرنامج كما يبدأ به الطالب">{preview || "—"}</pre>
      </details>
    </fieldset>
  );
}
