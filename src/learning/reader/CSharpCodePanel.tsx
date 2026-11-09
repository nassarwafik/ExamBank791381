import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { tokenizeCSharp } from "./csharpTokens";
import { arabicCount, type ArabicCountForms } from "../arabicCount";
import type { CodeRunAccess } from "../run/runClient";
import { runnableList } from "../run/runAccess";

// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — the C# program panel of the Reader's `code` block, loaded LAZILY by
// CodeBlockView only when a page has a C# block (it keeps the tokenizer out of the Reader's first-load graph, budget 40 KB):
//   • the code is shown EXACTLY: <code> holds the tokens of csharpTokens.ts as text spans, which join back to the block's code;
//   • line numbers sit in a gutter OUTSIDE <code>, hidden from assistive technology and left out of a text selection;
//   • the panel is focusable and named («كود C#، 5 أسطر») so a keyboard user can scroll a long line;
//   • «نسخ الكود» copies the block's code (not the rendered text), and a status line says whether it worked.
//   • 899371 P8 (plan §21) — «جرّب الكود»: when the host gives a run transport and the SERVER lists this block as runnable for this
//     learner (one request per course, shared by every block), a button opens the editable copy (CodeRunPanel.tsx, its own lazy
//     chunk). The book's code above it never changes.

/** Where a run goes: the host's session access and the block's place in the course. */
export type CodeRunTarget = { access: CodeRunAccess; courseId: string; pageId: string; blockId: string };
const CodeRunPanel = lazy(() => import("./CodeRunPanel"));
/** Whether the server lets this learner run this block (false until it says so; false on any failure). */
function useRunnable(run: CodeRunTarget | undefined): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!run) return;
    let alive = true;
    runnableList(run.access, run.courseId)
      .then(r => { if (alive) setOk(r.available === true && (r.blocks[run.pageId] || []).includes(run.blockId)); })
      .catch(() => { if (alive) setOk(false); });
    return () => { alive = false; };
  }, [run?.access, run?.courseId, run?.pageId, run?.blockId]);   // eslint-disable-line react-hooks/exhaustive-deps
  return ok;
}

const LINES: ArabicCountForms = { zero: "بلا أسطر", one: "سطر واحد", two: "سطران", few: "{n} أسطر", many: "{n} سطرًا", other: "{n} سطر" };
const COPIED = "تم نسخ الكود";
const COPY_FAILED = "تعذّر النسخ، حدّد الكود وانسخه يدويًا";

export default function CSharpCodePanel({ code, run }: { code: string; run?: CodeRunTarget }) {
  const [status, setStatus] = useState("");
  const runnable = useRunnable(run);
  const [trying, setTrying] = useState(false);
  const panelId = useId();
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
  const panel = (
    <div className="learning-reader-codewrap is-csharp">
      <div className="learning-reader-code-bar">
        <span className="learning-reader-code-lang" dir="ltr" lang="en">C#</span>
        <span className="learning-reader-code-status" role="status">{status}</span>
        {runnable && run && <button type="button" className="learning-reader-code-copy learning-reader-code-try" aria-expanded={trying} aria-controls={trying ? panelId : undefined} onClick={() => setTrying(t => !t)}>{trying ? "إغلاق التجربة" : "جرّب الكود"}</button>}
        <button type="button" className="learning-reader-code-copy" onClick={copy}>نسخ الكود</button>
      </div>
      <pre className="learning-reader-code" dir="ltr" tabIndex={0} aria-label={"كود C#، " + arabicCount(lineCount, LINES)}>
        <span className="learning-reader-code-gutter" aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n")}</span>
        <code dir="ltr" className="lang-csharp">{tokenizeCSharp(code).map((t, i) => (t.kind === "plain" ? <span key={i}>{t.text}</span> : <span key={i} className={"cs-tok-" + t.kind}>{t.text}</span>))}</code>
      </pre>
    </div>
  );
  // The same tree shape open or closed, so the toggle keeps its focus.
  return (
    <>
      {panel}
      {trying && runnable && run && (
        <Suspense fallback={<p className="learning-run-loading" role="status">جارٍ فتح التجربة…</p>}>
          <CodeRunPanel id={panelId} code={code} target={run} />
        </Suspense>
      )}
    </>
  );
}
