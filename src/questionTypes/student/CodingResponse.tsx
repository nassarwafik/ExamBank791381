import { useContext, useMemo, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import CodingEditor from "../../coding/CodingEditor";
import { CodingExecutionContext, EXECUTION_STATUS_LABELS, RUN_UNAVAILABLE_MESSAGE, canRun } from "../../coding/codingExecution";
import { CODE_SOURCE_MAX_BYTES, codingLanguage, isCodingLanguage, projectCodingConfigForStudent } from "../../codingQuestion";
import { compareOutput, normalizeExecutionResult, type CodeExecutionResult } from "../../codingContract";
import { useConfirm } from "../../ui/useConfirm";

// Phase 17A — coding@1 student renderer (lazy). ONE component for the student exam AND the teacher preview (ExamPreview
// renders the same StudentQuestionCard). It reads ONLY the allow-listed public projection of `q.coding` (so even a teacher-
// side question handed to it can never put a hidden test or a reference solution into the DOM or component state) and emits
// the canonical Answer {kind:"code", language, languageVersion, source} through the generic onAnswer seam — the EXISTING
// autosave / restore / pause / submit pipeline persists it (no coding timer, no local storage, no second persistence system).
//   • starter code fills the editor; nothing is recorded until the student edits or picks a language;
//   • switching language on untouched code loads that language's starter; edited code is NEVER destroyed;
//   • «استعادة الكود الابتدائي» goes through the shared ConfirmDialog when meaningful source would be lost;
//   • «تشغيل» exists ONLY when a trusted execution provider reports the selected language (none in 17A): results are
//     ephemeral practice evidence, rendered as TEXT, never stored in the Answer and never an official score.
type Run = { testId?: string; title?: string; result: CodeExecutionResult; sample?: string };

export default function CodingResponse({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectCodingConfigForStudent((q as { coding?: unknown }).coding), [q]);
  const exec = useContext(CodingExecutionContext);
  const { confirm, confirmDialog } = useConfirm();
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const allowed = cfg?.allowedLanguages ?? [];
  const valid = !!cfg && allowed.length > 0 && allowed.every(isCodingLanguage) && typeof cfg.defaultLanguage === "string" && allowed.includes(cfg.defaultLanguage);
  if (!valid || !cfg) return <div className="cx-coding" data-testid="coding-config-invalid" role="note">إعداد سؤال البرمجة غير صالح أو يستخدم لغة غير مدعومة؛ لا يمكن عرض محرر الكود. أبلغ المعلم.</div>;

  const code = answer?.kind === "code" ? answer : undefined;
  const language = code && allowed.includes(code.language) ? code.language : cfg.defaultLanguage;
  const def = codingLanguage(language)!;
  const starter = (lang: string) => cfg.starterCode?.[lang] ?? "";
  const source = code ? code.source : starter(language);
  const limit = Math.min(CODE_SOURCE_MAX_BYTES, cfg.limits?.sourceBytes ?? CODE_SOURCE_MAX_BYTES);
  const emit = (lang: string, src: string) => onAnswer({ kind: "code", language: lang, languageVersion: codingLanguage(lang)!.version, source: src });
  const untouched = !code || code.source === starter(code.language) || code.source.trim() === "";
  const changeLanguage = (next: string) => { if (!allowed.includes(next) || next === language) return; setRuns([]); emit(next, untouched ? starter(next) : source); };
  const reset = async () => {
    const lost = source.trim() !== "" && source !== starter(language);
    if (lost && !(await confirm({ title: "استعادة الكود الابتدائي", message: "سيُستبدل الكود الحالي بالكود الابتدائي للغة " + def.label + ".\nلا يمكن التراجع عن هذا الإجراء.", confirmLabel: "استعادة", cancelLabel: "إلغاء", tone: "danger" }))) return;
    emit(language, starter(language));
  };
  const runnable = canRun(exec, language, def.version);
  const samples = cfg.publicTests ?? [];
  const run = async () => {
    if (!exec || !runnable || running) return;
    setRunning(true);
    const cases = samples.length ? samples : [{ id: undefined, title: undefined, input: "", sampleOutput: undefined }];
    const out: Run[] = [];
    for (const t of cases) {
      let result: CodeExecutionResult;
      try { result = normalizeExecutionResult(await exec.run({ language, languageVersion: def.version, source, stdin: t.input, ...(t.id ? { testId: t.id } : {}) }), cfg.limits?.outputBytes ?? 65536); }
      catch { result = { status: "internal-error", stdout: "", stderr: "" }; }
      out.push({ testId: t.id, title: t.title, result, sample: t.sampleOutput });
    }
    setRuns(out);
    setRunning(false);
  };

  return (
    <div className="cx-coding" data-testid="coding-response">
      <div className="cx-coding-toolbar">
        <label><span>لغة البرمجة</span>
          <select aria-label="لغة البرمجة" value={language} onChange={e => changeLanguage(e.target.value)} disabled={disabled}>
            {allowed.map(l => <option key={l} value={l}>{codingLanguage(l)!.label}</option>)}
          </select>
        </label>
        {starter(language) !== "" && <button type="button" onClick={() => void reset()} disabled={disabled}>استعادة الكود الابتدائي</button>}
      </div>
      <CodingEditor value={source} onChange={next => emit(language, next)} language={language} label={"محرر الكود — " + labelPrefix} readOnly={disabled} maxBytes={limit} />
      {samples.length > 0 && <div className="cx-samples">
        <strong>أمثلة</strong>
        {samples.map((t, i) => <section key={t.id || i} className="cx-sample" data-testid="coding-sample-test" aria-label={t.title || "مثال " + (i + 1)}>
          <span>{t.title || "مثال " + (i + 1)}</span>
          <div className="cx-io-grid">
            <div className="cx-io-block"><span>المدخلات</span><pre dir="ltr">{t.input}</pre></div>
            {t.sampleOutput !== undefined && <div className="cx-io-block"><span>المخرجات النموذجية</span><pre dir="ltr">{t.sampleOutput}</pre></div>}
          </div>
        </section>)}
      </div>}
      {runnable && !disabled
        ? <button type="button" className="cx-run-button" onClick={() => void run()} disabled={running}>تشغيل</button>
        : <p className="cx-run-note" data-testid="coding-run-unavailable" role="note">{RUN_UNAVAILABLE_MESSAGE}</p>}
      {runs.length > 0 && <div aria-live="polite">{runs.map((r, i) => (
        <div key={r.testId || i} className="cx-result" data-testid="coding-result" data-status={r.result.status}>
          <span className="cx-result-status">{(r.title ? r.title + ": " : "") + EXECUTION_STATUS_LABELS[r.result.status]}</span>
          {r.result.status === "success" && r.sample !== undefined && <span>{compareOutput(r.result.stdout, r.sample, "trimTrailingWhitespace") ? "يطابق المخرجات النموذجية (للتدريب فقط)" : "لا يطابق المخرجات النموذجية (للتدريب فقط)"}</span>}
          {r.result.stdout !== "" && <div className="cx-io-block"><span>المخرجات</span><pre dir="ltr">{r.result.stdout}</pre></div>}
          {r.result.stderr !== "" && <div className="cx-io-block"><span>رسائل الخطأ</span><pre dir="ltr">{r.result.stderr}</pre></div>}
        </div>))}
      </div>}
      {confirmDialog}
    </div>
  );
}
