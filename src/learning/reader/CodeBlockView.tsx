import { lazy, Suspense } from "react";
import type { CodeBlock } from "../content/types";
import type { CodeRunTarget } from "./CSharpCodePanel";

// The Reader's `code` block. The established languages (cli / text / config) keep their exact markup. A C# block (899371 P1,
// docs/enterprise-899371-learning-plan.md §13) is a program panel (CSharpCodePanel.tsx: highlighting, line numbers, «نسخ الكود»),
// loaded lazily; until it arrives the same code is shown as plain text, so the book's code is never missing from the page.
const CSharpCodePanel = lazy(() => import("./CSharpCodePanel"));

export default function CodeBlockView({ block, run }: { block: CodeBlock; run?: Omit<CodeRunTarget, "blockId"> }) {
  if (block.language !== "csharp") {
    return (
      <div className="learning-reader-codewrap">
        <pre className="learning-reader-code"><code dir="ltr" className={"lang-" + block.language}>{block.code}</code></pre>
      </div>
    );
  }
  return <Suspense fallback={<PlainCSharpCode code={block.code} />}><CSharpCodePanel code={block.code} run={run ? { ...run, blockId: block.id } : undefined} /></Suspense>;
}

/** The C# code as plain text, shown until the panel arrives. Like the panel, it scrolls sideways on a phone, so it is focusable and
 *  named for the keyboard (axe scrollable-region-focusable, plan §18). */
export function PlainCSharpCode({ code }: { code: string }) {
  return (
    <div className="learning-reader-codewrap is-csharp">
      <pre className="learning-reader-code" dir="ltr" tabIndex={0} aria-label="كود C#"><code dir="ltr" className="lang-csharp">{code}</code></pre>
    </div>
  );
}
