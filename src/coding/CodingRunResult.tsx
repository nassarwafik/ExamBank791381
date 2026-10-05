import { RUN_TRUNCATED_MESSAGE } from "./codingExecution";
import type { CodeExecutionResult } from "../codingContract";
import { MATCH_TEXT, matchOf } from "./runResultModel";

// Phase 19F — the practice-run result body, moved verbatim out of the coding@1/@2 renderer so the coding@3 locked-template renderer
// shows a practice result exactly the same way (TEXT only, LTR, bounded scroll; sample comparisons labelled «للتدريب فقط»).
export function ResultBody({ result, sample }: { result: CodeExecutionResult; sample?: string }) {
  const m = matchOf(result, sample);
  const meta = [typeof result.durationMs === "number" ? "زمن التنفيذ: " + Math.round(result.durationMs) + " ملّي ثانية" : "", typeof result.exitCode === "number" ? "رمز الخروج: " + result.exitCode : ""].filter(Boolean).join(" · ");
  return <>
    {m !== "none" && <span>{MATCH_TEXT[m]}</span>}
    {meta !== "" && <span className="cx-result-meta" data-testid="coding-result-meta">{meta}</span>}
    {result.status === "output-limit" && <p className="cx-result-note" data-testid="coding-output-truncated">{RUN_TRUNCATED_MESSAGE}</p>}
    {result.stdout !== "" && <div className="cx-io-block"><span>المخرجات</span><pre className="cx-run-output" dir="ltr">{result.stdout}</pre></div>}
    {result.stderr !== "" && <div className="cx-io-block"><span>{result.status === "compile-error" ? "رسائل المترجم" : "رسائل الخطأ"}</span><pre className="cx-run-output" dir="ltr">{result.stderr}</pre></div>}
  </>;
}
