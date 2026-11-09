import { lazy, Suspense } from "react";
import type { CodeBlock } from "../content/types";

// The Reader's `code` block. The established languages (cli / text / config) keep their exact markup. A C# block (899371 P1,
// docs/enterprise-899371-learning-plan.md §13) is a program panel (CSharpCodePanel.tsx: highlighting, line numbers, «نسخ الكود»),
// loaded lazily; until it arrives the same code is shown as plain text, so the book's code is never missing from the page.
const CSharpCodePanel = lazy(() => import("./CSharpCodePanel"));

export default function CodeBlockView({ block }: { block: CodeBlock }) {
  if (block.language !== "csharp") {
    return (
      <div className="learning-reader-codewrap">
        <pre className="learning-reader-code"><code dir="ltr" className={"lang-" + block.language}>{block.code}</code></pre>
      </div>
    );
  }
  const plain = (
    <div className="learning-reader-codewrap is-csharp">
      <pre className="learning-reader-code" dir="ltr"><code dir="ltr" className="lang-csharp">{block.code}</code></pre>
    </div>
  );
  return <Suspense fallback={plain}><CSharpCodePanel code={block.code} /></Suspense>;
}
