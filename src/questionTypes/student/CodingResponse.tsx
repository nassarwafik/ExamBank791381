import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { StudentRendererProps } from "../registryTypes";
import CodingWorkspace from "../../coding/workspace/CodingWorkspace";
import { CodingExecutionContext, EXECUTION_STATUS_LABELS, PUBLIC_RUN_DISCLAIMER, RUN_PREVIEW_MESSAGE, RUN_STALE_MESSAGE, RUN_STDIN_MAX_BYTES, RUN_UNAVAILABLE_MESSAGE, canRun, runErrorMessage, type CodingCapabilities } from "../../coding/codingExecution";
import { createApiCodingService, loadCodingCapabilities, type CodingRunFailure } from "../../coding/codingRunClient";
import { otherLanguageDrafts, readLanguageDraft, rememberLanguageDraft, type DraftScope, type LanguageDrafts } from "../../coding/codingDrafts";
import { StudentAttemptContext, TeacherPreviewContext } from "../studentAttemptContext";
import { CODE_SOURCE_MAX_BYTES, codingLanguage, isCodingLanguage, projectCodingConfigForStudent, utf8ByteLength } from "../../codingQuestion";
import { normalizeExecutionResult, type CodeExecutionResult } from "../../codingContract";
import { ResultBody } from "../../coding/CodingRunResult";
import { matchOf, sampleTitle } from "../../coding/runResultModel";
import { useConfirm } from "../../ui/useConfirm";

// Phase 17A / 17B / 17E-B — coding@1 student renderer (lazy). ONE component for the student exam AND the teacher preview
// (ExamPreview renders the same StudentQuestionCard). It reads ONLY the allow-listed public projection of `q.coding` (so even a
// teacher-side question handed to it can never put a hidden test or a reference solution into the DOM or component state) and
// emits the canonical Answer {kind:"code", language, languageVersion, source} through the generic onAnswer seam — the EXISTING
// autosave / restore / pause / submit pipeline persists it (no coding timer, no local storage, no second persistence system).
// Phase 17E-B turns it into the student's practice WORKSPACE, in this order: language bar → editor (+ the question's limits) →
// stdin → run controls → output → public tests.
//   • starter code fills the editor; nothing is recorded until the student edits or picks a language; a restored answer always
//     wins; editing is never blocked by a run;
//   • per-language drafts: leaving a language remembers its source for this exam-page session (memory only, codingDrafts.ts) and
//     coming back restores it; the saved / submitted answer is always the selected language (said explicitly on screen);
//   • «تشغيل» / «تشغيل الأمثلة» exist ONLY when the trusted runner reports the selected language: the service comes from the
//     attempt seam (the authenticated /api/coding routes), in tests from CodingExecutionContext; the teacher preview shows an explicit
//     preview notice and never runs code. ONE practice run is active per question (a synchronous ref guard, not render state);
//     every run carries a generation id + the source snapshot it was sent with: a superseded run (language switch, unmount) is
//     aborted and its late answer is dropped, and a result whose snapshot differs from the current code is marked as such;
//   • results are ephemeral practice evidence rendered as TEXT (LTR, bounded scroll), announced politely, never stored in the
//     Answer and never a grade; sample comparisons are labelled «للتدريب فقط». Practice never reaches official grading.
type Snapshot = { language: string; source: string };
type CustomView = { mode: "custom"; snap: Snapshot; title?: string; result: CodeExecutionResult; sample?: string };
type PublicRow = { key: string; title: string; sample?: string; result?: CodeExecutionResult };
type PublicView = { mode: "public"; snap: Snapshot; rows: PublicRow[] };
type View = CustomView | PublicView;

export default function CodingResponse({ q, id, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectCodingConfigForStudent((q as { coding?: unknown }).coding), [q]);
  const injected = useContext(CodingExecutionContext);
  const attempt = useContext(StudentAttemptContext);
  const preview = useContext(TeacherPreviewContext);
  const { confirm, confirmDialog } = useConfirm();
  const [view, setView] = useState<View | null>(null);
  const [runError, setRunError] = useState<string>("");
  const [busy, setBusy] = useState<"" | "custom" | "public">("");
  const [progress, setProgress] = useState("");
  const [stdin, setStdin] = useState<string>(() => cfg?.publicTests?.[0]?.input ?? "");
  const [remoteCaps, setRemoteCaps] = useState<CodingCapabilities | null>(null);
  const [localDrafts] = useState<LanguageDrafts>(() => ({}));
  const draftScope: DraftScope = { owner: attempt?.request, questionId: id, local: localDrafts };
  // single flight + generation: `active` is read synchronously by every click (render state could be stale between taps)
  const seq = useRef(0), active = useRef<{ id: number; ctrl: AbortController } | null>(null), mounted = useRef(true);
  useEffect(() => {
    const live = mounted, generation = seq, inflight = active;
    live.current = true;
    return () => { live.current = false; generation.current++; inflight.current?.ctrl.abort(); inflight.current = null; };
  }, []);
  useEffect(() => {
    if (injected || !attempt || preview) return;
    let live = true;
    void loadCodingCapabilities(attempt).then(c => { if (live) setRemoteCaps(c); });   // cached per attempt seam: one request
    return () => { live = false; };
  }, [injected, attempt, preview]);
  const exec = useMemo(() => injected ?? (attempt && remoteCaps && !preview ? createApiCodingService(attempt, id, remoteCaps) : undefined), [injected, attempt, remoteCaps, id, preview]);

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

  /** Abandons the in-flight run (if any): it is aborted, its generation is retired, and its late answer is never shown. */
  const supersede = () => {
    seq.current++;
    if (active.current) { active.current.ctrl.abort(); active.current = null; }
    setBusy(""); setProgress("");
  };
  const changeLanguage = (next: string) => {
    if (!allowed.includes(next) || next === language) return;
    supersede(); setView(null); setRunError("");
    rememberLanguageDraft(draftScope, language, source);                           // remember what the student leaves behind
    const restored = readLanguageDraft(draftScope, next);
    emit(next, restored !== undefined ? restored : untouched ? starter(next) : source);
  };
  const reset = async () => {
    const lost = source.trim() !== "" && source !== starter(language);
    if (lost && !(await confirm({ title: "استعادة الكود الابتدائي", message: "سيُستبدل الكود الحالي بالكود الابتدائي للغة " + def.label + ".\nلا يمكن التراجع عن هذا الإجراء.", confirmLabel: "استعادة", cancelLabel: "إلغاء", tone: "danger" }))) return;
    emit(language, starter(language));
  };
  const runnable = !preview && canRun(exec, language, def.version);
  const samples = cfg.publicTests ?? [];
  const stdinTooLarge = utf8ByteLength(stdin) > RUN_STDIN_MAX_BYTES;
  const loading = !injected && !!attempt && !remoteCaps && !preview;

  const begin = (mode: "custom" | "public"): { id: number; ctrl: AbortController } | null => {
    if (!exec || !runnable || active.current) return null;
    const run = { id: ++seq.current, ctrl: new AbortController() };
    active.current = run;
    setBusy(mode); setRunError("");
    return run;
  };
  const current = (runId: number) => mounted.current && seq.current === runId;
  const finish = (runId: number) => {
    if (active.current?.id !== runId) return;
    active.current = null;
    if (mounted.current) { setBusy(""); setProgress(""); }
  };
  const failMessage = (e: unknown) => { const f = e as Partial<CodingRunFailure>; return typeof f.code === "string" ? runErrorMessage(f.code, f.retryAfterSeconds) : runErrorMessage("EXECUTION_FAILED"); };

  const execute = async () => {
    if (stdinTooLarge) return;
    const run = begin("custom");
    if (!run) return;
    const snap: Snapshot = { language, source }, input = stdin;
    const sample = samples.find(t => t.input === input);
    setProgress("جارٍ التشغيل…");
    try {
      const raw = await exec!.run({ language, languageVersion: def.version, source, stdin: input, ...(sample?.id ? { testId: sample.id } : {}) }, { signal: run.ctrl.signal });
      if (!current(run.id)) return;
      setView({ mode: "custom", snap, title: sample?.title, result: normalizeExecutionResult(raw, cfg.limits?.outputBytes ?? 65536), sample: sample?.sampleOutput });
    } catch (e) {
      if (!current(run.id)) return;
      setView(null);
      setRunError(failMessage(e));
    } finally {
      finish(run.id);
    }
  };
  const executePublic = async () => {
    if (samples.length === 0) return;
    const run = begin("public");
    if (!run) return;
    const snap: Snapshot = { language, source };
    let rows: PublicRow[] = samples.map((t, i) => ({ key: t.id || String(i), title: sampleTitle(t, i), sample: t.sampleOutput }));
    setView({ mode: "public", snap, rows });
    try {
      for (let i = 0; i < samples.length; i++) {                                    // sequential: one runner slot, one budget token at a time
        setProgress("جارٍ تشغيل الأمثلة… (" + (i + 1) + " من " + samples.length + ")");
        const t = samples[i];
        const raw = await exec!.run({ language, languageVersion: def.version, source, stdin: t.input, ...(t.id ? { testId: t.id } : {}) }, { signal: run.ctrl.signal });
        if (!current(run.id)) return;
        rows = rows.map((r, k) => (k === i ? { ...r, result: normalizeExecutionResult(raw, cfg.limits?.outputBytes ?? 65536) } : r));
        setView({ mode: "public", snap, rows });
      }
    } catch (e) {
      if (!current(run.id)) return;
      setRunError(failMessage(e));                                                    // the rows already run stay visible
    } finally {
      finish(run.id);
    }
  };

  const stale = !!view && (view.snap.language !== language || view.snap.source !== source);
  const otherDrafts = otherLanguageDrafts(draftScope, language, (l, src) => allowed.includes(l) && src.trim() !== "" && src !== starter(l)).length > 0;
  const lim = cfg.limits;
  const limitsText = lim ? [typeof lim.timeMs === "number" ? "الوقت " + lim.timeMs + " ملّي ثانية" : "", typeof lim.memoryMb === "number" ? "الذاكرة " + lim.memoryMb + " ميغابايت" : "", typeof lim.sourceBytes === "number" ? "حجم الكود " + lim.sourceBytes + " بايت" : ""].filter(Boolean).join(" · ") : "";

  return (
    <CodingWorkspace
      value={source} onChange={next => emit(language, next)} language={language} languageVersion={def.version} label={"محرر الكود — " + labelPrefix} readOnly={disabled} maxBytes={limit}
      title={labelPrefix} testId="coding-response"
      toolbarStart={
          <label data-testid="coding-language-bar"><span>لغة البرمجة</span>
            <select aria-label="لغة البرمجة" value={language} onChange={e => changeLanguage(e.target.value)} disabled={disabled}>
              {allowed.map(l => <option key={l} value={l}>{codingLanguage(l)!.label}</option>)}
            </select>
          </label>}
      toolbarEnd={starter(language) !== "" && <button type="button" className="cx-ws-button" onClick={() => void reset()} disabled={disabled}>استعادة الكود الابتدائي</button>}
      editorFooter={limitsText !== "" && <p className="cx-limits" data-testid="coding-limits">{"حدود التنفيذ: " + limitsText}</p>}>
      {otherDrafts && <p className="cx-run-note" data-testid="coding-drafts-note" role="note">{"تُحفظ وتُسلَّم إجابة لغة واحدة فقط: لغة " + def.label + " المختارة الآن. كود اللغات الأخرى محفوظ مؤقتًا في هذه الصفحة حتى تعود إليه، ولا يبقى بعد إعادة تحميل الصفحة."}</p>}
      {runnable && !disabled
        ? <>
            <div className="cx-stdin-panel cx-run-panel" data-testid="coding-stdin-panel">
              <label className="cx-stdin-field"><span>مدخلات التشغيل</span>
                <textarea className="cx-stdin" aria-label="مدخلات التشغيل" dir="ltr" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={3} value={stdin} onChange={e => setStdin(e.target.value)} />
              </label>
              {samples.length > 0 && <div className="cx-sample-pick">{samples.map((t, i) => <button key={t.id || i} type="button" onClick={() => setStdin(t.input)}>{"استخدام مدخلات: " + sampleTitle(t, i)}</button>)}</div>}
              {stdinTooLarge && <p className="cx-run-error" data-testid="coding-stdin-too-large" role="alert">المدخلات أكبر من الحد المسموح (16 كيلوبايت).</p>}
            </div>
            <div className="cx-run-controls" data-testid="coding-run-controls">
              <button type="button" className="cx-run-button" aria-disabled={busy !== "" || stdinTooLarge ? "true" : "false"} aria-busy={busy === "custom" ? "true" : "false"} onClick={() => void execute()}>تشغيل</button>
              {samples.length > 0 && <button type="button" className="cx-run-button is-secondary" aria-disabled={busy !== "" ? "true" : "false"} aria-busy={busy === "public" ? "true" : "false"} onClick={() => void executePublic()}>تشغيل الأمثلة</button>}
              {busy !== "" && <span className="cx-run-progress" role="status" data-testid="coding-run-progress">{progress}</span>}
            </div>
          </>
        : <p className="cx-run-note" data-testid={preview ? "coding-run-preview" : "coding-run-unavailable"} role="note">{preview ? RUN_PREVIEW_MESSAGE : loading ? "جارٍ التحقق من بيئة التشغيل…" : RUN_UNAVAILABLE_MESSAGE}</p>}
      <div className="cx-run-results" data-testid="coding-output-panel" aria-live="polite" aria-label="نتيجة التشغيل">
        {runError !== "" && <p className="cx-run-error" data-testid="coding-run-error">{runError}</p>}
        {view?.mode === "custom" && <div className="cx-result" data-testid="coding-result" data-status={view.result.status} data-run-stale={stale ? "true" : undefined}>
          <span className="cx-result-status">{(view.title ? view.title + ": " : "") + EXECUTION_STATUS_LABELS[view.result.status]}</span>
          {stale && <p className="cx-result-stale" data-testid="coding-result-stale" role="note">{RUN_STALE_MESSAGE}</p>}
          <ResultBody result={view.result} sample={view.sample} />
        </div>}
        {view?.mode === "public" && <div className="cx-public-results" data-testid="coding-public-results">
          <strong>نتائج تشغيل الأمثلة</strong>
          <p className="cx-result-note">{PUBLIC_RUN_DISCLAIMER}</p>
          {stale && <p className="cx-result-stale" data-testid="coding-result-stale" role="note">{RUN_STALE_MESSAGE}</p>}
          <ol className="cx-public-list">
            {view.rows.map(r => <li key={r.key} className="cx-result" data-testid="coding-public-result" data-status={r.result ? r.result.status : "pending"} data-match={matchOf(r.result, r.sample)}>
              <span className="cx-result-status">{r.title + ": " + (r.result ? EXECUTION_STATUS_LABELS[r.result.status] : "لم يُشغَّل بعد")}</span>
              {r.result && <ResultBody result={r.result} sample={r.sample} />}
            </li>)}
          </ol>
        </div>}
      </div>
      {samples.length > 0 && <section className="cx-samples" data-testid="coding-public-tests" aria-label="أمثلة ظاهرة">
        <strong>أمثلة</strong>
        {samples.map((t, i) => <section key={t.id || i} className="cx-sample" data-testid="coding-sample-test" aria-label={sampleTitle(t, i)}>
          <span>{sampleTitle(t, i)}</span>
          <div className="cx-io-grid">
            <div className="cx-io-block"><span>الإدخال</span><pre dir="ltr">{t.input}</pre></div>
            {t.sampleOutput !== undefined && <div className="cx-io-block"><span>الناتج المتوقع</span><pre dir="ltr">{t.sampleOutput}</pre></div>}
          </div>
        </section>)}
      </section>}
      {confirmDialog}
    </CodingWorkspace>
  );
}
