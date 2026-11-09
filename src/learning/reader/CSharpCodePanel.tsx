import { useCallback, useEffect, useRef, useState } from "react";
import { tokenizeCSharp } from "./csharpTokens";
import { arabicCount, type ArabicCountForms } from "../arabicCount";

// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — the C# program panel of the Reader's `code` block, loaded LAZILY by
// CodeBlockView only when a page has a C# block (it keeps the tokenizer out of the Reader's first-load graph, budget 40 KB):
//   • the code is shown EXACTLY: <code> holds the tokens of csharpTokens.ts as text spans, which join back to the block's code;
//   • line numbers sit in a gutter OUTSIDE <code>, hidden from assistive technology and left out of a text selection;
//   • the panel is focusable and named («كود C#، 5 أسطر») so a keyboard user can scroll a long line;
//   • «نسخ الكود» copies the block's code (not the rendered text), and a status line says whether it worked.

const LINES: ArabicCountForms = { zero: "بلا أسطر", one: "سطر واحد", two: "سطران", few: "{n} أسطر", many: "{n} سطرًا", other: "{n} سطر" };
const COPIED = "تم نسخ الكود";
const COPY_FAILED = "تعذّر النسخ، حدّد الكود وانسخه يدويًا";

export default function CSharpCodePanel({ code }: { code: string }) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const lineCount = code.split("\n").length;
  const copy = useCallback(async () => {
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") { await navigator.clipboard.writeText(code); ok = true; }
    } catch { ok = false; }
    setStatus(ok ? COPIED : COPY_FAILED);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 4000);
  }, [code]);
  return (
    <div className="learning-reader-codewrap is-csharp">
      <div className="learning-reader-code-bar">
        <span className="learning-reader-code-lang" dir="ltr" lang="en">C#</span>
        <span className="learning-reader-code-status" role="status">{status}</span>
        <button type="button" className="learning-reader-code-copy" onClick={copy}>نسخ الكود</button>
      </div>
      <pre className="learning-reader-code" dir="ltr" tabIndex={0} aria-label={"كود C#، " + arabicCount(lineCount, LINES)}>
        <span className="learning-reader-code-gutter" aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n")}</span>
        <code dir="ltr" className="lang-csharp">{tokenizeCSharp(code).map((t, i) => (t.kind === "plain" ? <span key={i}>{t.text}</span> : <span key={i} className={"cs-tok-" + t.kind}>{t.text}</span>))}</code>
      </pre>
    </div>
  );
}
