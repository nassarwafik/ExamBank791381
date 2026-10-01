import { useMemo, useState } from "react";
import { CODING_COMPARATORS, codingLanguage } from "../codingQuestion";
import "./coding.css";

// Phase 17A — read-only display of a submitted (or reference) source for teacher review. The source is a React TEXT child of a
// <pre>: never HTML, never dangerouslySetInnerHTML / innerHTML / srcdoc, never highlighted by a library that could interpret
// it. Line numbers are ONE text node; the body scrolls inside a bounded box so a long submission never stretches the page.
type ViewProps = { source: string; language: string; label?: string; testIdPrefix?: string; copyLabel?: string };
const COMPARATOR_LABELS: Record<string, string> = { exact: "مطابقة حرفية تامة", trimTrailingWhitespace: "تجاهل المسافات في نهايات الأسطر", normalizeWhitespace: "توحيد كل المسافات" };

export function CodeSourceView({ source, language, label = "الكود المرسل", testIdPrefix = "code-review", copyLabel = "نسخ الكود" }: ViewProps) {
  const [copied, setCopied] = useState(false);
  const numbers = useMemo(() => { let n = 1; for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) n++; return Array.from({ length: n }, (_, i) => i + 1).join("\n"); }, [source]);
  const copy = async () => { try { await navigator.clipboard?.writeText(source); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="cx-code-view-wrap" dir="ltr">
      <div className="cx-code-view-head">
        <span className="cx-lang-badge" data-testid={testIdPrefix + "-language"}>{codingLanguage(language)?.label ?? language}</span>
        <button type="button" onClick={() => void copy()}>{copyLabel}</button>
        {copied && <span role="status">تم النسخ</span>}
      </div>
      <div className="cx-code-view-body">
        <pre className="cx-code-view-gutter" data-testid={testIdPrefix + "-gutter"} aria-hidden="true">{numbers}</pre>
        <pre className="cx-code-view" data-testid={testIdPrefix + "-source"} tabIndex={0} aria-label={label}>{source}</pre>
      </div>
    </div>
  );
}

/** Teacher-side summary of a coding answer key (review only — this data never reaches a student). */
export function CodeKeySummary({ answerKey }: { answerKey: unknown }) {
  const key = answerKey && typeof answerKey === "object" && !Array.isArray(answerKey) ? (answerKey as Record<string, unknown>) : {};
  const hidden = Array.isArray(key.hiddenTests) ? key.hiddenTests.length : 0;
  const comparator = typeof key.comparator === "string" && CODING_COMPARATORS.includes(key.comparator as never) ? COMPARATOR_LABELS[key.comparator] : "—";
  const refs = key.referenceSolutions && typeof key.referenceSolutions === "object" ? Object.entries(key.referenceSolutions as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][] : [];
  return (
    <div className="cx-key-summary" data-testid="code-review-key">
      <span>اختبارات مخفية: {hidden}</span>
      <span>طريقة مقارنة المخرجات: {comparator}</span>
      <span>التصحيح الآلي غير مفعّل في هذه المرحلة؛ علامة المعلم هي العلامة الرسمية.</span>
      {refs.map(([lang, src]) => <div key={lang}><span>حل مرجعي ({codingLanguage(lang)?.label ?? lang})</span><CodeSourceView source={src} language={lang} label={"حل مرجعي " + lang} testIdPrefix="code-key" copyLabel="نسخ الحل المرجعي" /></div>)}
    </div>
  );
}

export default CodeSourceView;
