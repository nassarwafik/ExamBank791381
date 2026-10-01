import { useContext, useEffect, useMemo, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import CodingEditor from "../../coding/CodingEditor";
import { CodingExecutionContext, EXECUTION_STATUS_LABELS, RUN_STDIN_MAX_BYTES, RUN_UNAVAILABLE_MESSAGE, canRun, runErrorMessage, type CodingCapabilities } from "../../coding/codingExecution";
import { createApiCodingService, loadCodingCapabilities, type CodingRunFailure } from "../../coding/codingRunClient";
import { StudentAttemptContext } from "../studentAttemptContext";
import { CODE_SOURCE_MAX_BYTES, codingLanguage, isCodingLanguage, projectCodingConfigForStudent, utf8ByteLength } from "../../codingQuestion";
import { compareOutput, normalizeExecutionResult, type CodeExecutionResult } from "../../codingContract";
import { useConfirm } from "../../ui/useConfirm";

// Phase 17A / 17B — coding@1 student renderer (lazy). ONE component for the student exam AND the teacher preview (ExamPreview
// renders the same StudentQuestionCard). It reads ONLY the allow-listed public projection of `q.coding` (so even a teacher-
// side question handed to it can never put a hidden test or a reference solution into the DOM or component state) and emits
// the canonical Answer {kind:"code", language, languageVersion, source} through the generic onAnswer seam — the EXISTING
// autosave / restore / pause / submit pipeline persists it (no coding timer, no local storage, no second persistence system).
//   • starter code fills the editor; nothing is recorded until the student edits or picks a language;
//   • switching language on untouched code loads that language's starter; edited code is NEVER destroyed;
//   • «استعادة الكود الابتدائي» goes through the shared ConfirmDialog when meaningful source would be lost;
//   • «تشغيل» (Phase 17B) exists ONLY when the trusted runner reports the selected language: in the student exam the service
//     comes from the attempt seam (authenticated /api/coding/*), in tests from CodingExecutionContext; the teacher preview has
//     neither and shows the unavailable notice. One click = one practice run with the chosen stdin (a public sample's input or
//     custom input ≤ 16 KB). Results are ephemeral practice evidence rendered as TEXT (LTR, bounded scroll), announced politely,
//     never stored in the Answer and never a grade; a sample comparison is labelled «للتدريب فقط».
type Run = { title?: string; result: CodeExecutionResult; sample?: string };

export default function CodingResponse({ q, id, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectCodingConfigForStudent((q as { coding?: unknown }).coding), [q]);
  const injected = useContext(CodingExecutionContext);
  const attempt = useContext(StudentAttemptContext);
  const { confirm, confirmDialog } = useConfirm();
  const [run, setRun] = useState<Run | null>(null);
  const [runError, setRunError] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState<string>(() => cfg?.publicTests?.[0]?.input ?? "");
  const [remoteCaps, setRemoteCaps] = useState<CodingCapabilities | null>(null);
  useEffect(() => {
    if (injected || !attempt) return;
    let live = true;
    void loadCodingCapabilities(attempt).then(c => { if (live) setRemoteCaps(c); });   // cached per attempt seam: one request
    return () => { live = false; };
  }, [injected, attempt]);
  const exec = useMemo(() => injected ?? (attempt && remoteCaps ? createApiCodingService(attempt, id, remoteCaps) : undefined), [injected, attempt, remoteCaps, id]);

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
  const changeLanguage = (next: string) => { if (!allowed.includes(next) || next === language) return; setRun(null); setRunError(""); emit(next, untouched ? starter(next) : source); };
  const reset = async () => {
    const lost = source.trim() !== "" && source !== starter(language);
    if (lost && !(await confirm({ title: "استعادة الكود الابتدائي", message: "سيُستبدل الكود الحالي بالكود الابتدائي للغة " + def.label + ".\nلا يمكن التراجع عن هذا الإجراء.", confirmLabel: "استعادة", cancelLabel: "إلغاء", tone: "danger" }))) return;
    emit(language, starter(language));
  };
  const runnable = canRun(exec, language, def.version);
  const samples = cfg.publicTests ?? [];
  const stdinTooLarge = utf8ByteLength(stdin) > RUN_STDIN_MAX_BYTES;
  const loading = !injected && !!attempt && !remoteCaps;
  const execute = async () => {
    if (!exec || !runnable || running || stdinTooLarge) return;
    setRunning(true);
    setRunError("");
    const sample = samples.find(t => t.input === stdin);
    try {
      const raw = await exec.run({ language, languageVersion: def.version, source, stdin, ...(sample?.id ? { testId: sample.id } : {}) });
      setRun({ title: sample?.title, result: normalizeExecutionResult(raw, cfg.limits?.outputBytes ?? 65536), sample: sample?.sampleOutput });
    } catch (e) {
      setRun(null);
      const f = e as Partial<CodingRunFailure>;
      setRunError(typeof f.code === "string" ? runErrorMessage(f.code, f.retryAfterSeconds) : runErrorMessage("EXECUTION_FAILED"));
    } finally {
      setRunning(false);
    }
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
        ? <div className="cx-run-panel">
            <label className="cx-stdin-field"><span>مدخلات التشغيل</span>
              <textarea className="cx-stdin" aria-label="مدخلات التشغيل" dir="ltr" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={3} value={stdin} onChange={e => setStdin(e.target.value)} />
            </label>
            {samples.length > 0 && <div className="cx-sample-pick">{samples.map((t, i) => <button key={t.id || i} type="button" onClick={() => setStdin(t.input)}>{"استخدام مدخلات: " + (t.title || "مثال " + (i + 1))}</button>)}</div>}
            {stdinTooLarge && <p className="cx-run-error" data-testid="coding-stdin-too-large" role="alert">المدخلات أكبر من الحد المسموح (16 كيلوبايت).</p>}
            <button type="button" className="cx-run-button" aria-disabled={running || stdinTooLarge ? "true" : "false"} aria-busy={running ? "true" : "false"} onClick={() => void execute()}>تشغيل</button>
            {running && <span className="cx-run-progress">جارٍ التشغيل…</span>}
          </div>
        : <p className="cx-run-note" data-testid="coding-run-unavailable" role="note">{loading ? "جارٍ التحقق من بيئة التشغيل…" : RUN_UNAVAILABLE_MESSAGE}</p>}
      <div className="cx-run-results" aria-live="polite">
        {runError !== "" && <p className="cx-run-error" data-testid="coding-run-error">{runError}</p>}
        {run && <div className="cx-result" data-testid="coding-result" data-status={run.result.status}>
          <span className="cx-result-status">{(run.title ? run.title + ": " : "") + EXECUTION_STATUS_LABELS[run.result.status]}</span>
          {run.result.status === "success" && run.sample !== undefined && <span>{compareOutput(run.result.stdout, run.sample, "trimTrailingWhitespace") ? "يطابق المخرجات النموذجية (للتدريب فقط)" : "لا يطابق المخرجات النموذجية (للتدريب فقط)"}</span>}
          {run.result.stdout !== "" && <div className="cx-io-block"><span>المخرجات</span><pre className="cx-run-output" dir="ltr">{run.result.stdout}</pre></div>}
          {run.result.stderr !== "" && <div className="cx-io-block"><span>رسائل الخطأ</span><pre className="cx-run-output" dir="ltr">{run.result.stderr}</pre></div>}
        </div>}
      </div>
      {confirmDialog}
    </div>
  );
}
