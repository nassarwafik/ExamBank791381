import { useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { CodingExecutionContext, EXECUTION_STATUS_LABELS, PUBLIC_RUN_DISCLAIMER, RUN_PREVIEW_MESSAGE, RUN_STALE_MESSAGE, RUN_STDIN_MAX_BYTES, RUN_UNAVAILABLE_MESSAGE, canRun, runErrorMessage, type CodingCapabilities } from "../../coding/codingExecution";
import { createApiCodingService, loadCodingCapabilities, type CodingRunFailure } from "../../coding/codingRunClient";
import { StudentAttemptContext, TeacherPreviewContext } from "../studentAttemptContext";
import { CODE_SOURCE_MAX_BYTES, codingLanguage, projectCodingConfigForStudent, utf8ByteLength } from "../../codingQuestion";
import { CODING_TEMPLATE_LIMITS, reconstructTemplateSource, templateStarterValues, type CodingTemplateV1 } from "../../codingTemplate";
import { normalizeExecutionResult, type CodeExecutionResult } from "../../codingContract";
import { ResultBody } from "../../coding/CodingRunResult";
import { matchOf, sampleTitle } from "../../coding/runResultModel";
import { useConfirm } from "../../ui/useConfirm";
import "../../coding/coding.css";
import "../../coding/codingTemplate.css";

// Phase 19F — coding@3 student renderer: the LOCKED TEMPLATE editor (lazy; one component for the student exam AND the teacher preview).
// It reads ONLY the allow-listed public projection of `q.coding` (projectCodingConfigForStudent), whose template is the strict canonical
// form. The published program is shown in segment order:
//   • a LOCKED segment is read-only text in a <pre> — marked by a visible «مقفل» label, a dashed frame and its accessible name, never by
//     colour alone; it is never an input, so nothing typed can reach it;
//   • an EDITABLE gap is a native <textarea> (LTR, no spell-check / autocomplete / autocorrect / autocapitalize — the exam editor never
//     helps solve the question) with its number, its own reset, and Alt+↓ / Alt+↑ to jump between gaps (Tab keeps moving focus, so
//     the keyboard is never trapped). A native textarea is also the mobile fallback: no custom editor engine is needed on a phone.
// The Answer is ONLY the gap values: { kind: "codeTemplate", language, languageVersion, values } — nothing is recorded until the student
// edits a gap; the server reconstructs the official program from the PUBLISHED template (a source built here is display-only).
// Practice runs send the gap values too (the server reconstructs); results are ephemeral practice evidence, exactly as in coding@2.
type Snapshot = { source: string };
type CustomView = { mode: "custom"; snap: Snapshot; title?: string; result: CodeExecutionResult; sample?: string };
type PublicRow = { key: string; title: string; sample?: string; result?: CodeExecutionResult };
type PublicView = { mode: "public"; snap: Snapshot; rows: PublicRow[] };
type View = CustomView | PublicView;

/** The values to show: a stored answer's value for each published gap (when it is a string), else the gap's starter. */
function currentValues(t: CodingTemplateV1, answer: StudentRendererProps["answer"]): Record<string, string> {
  const starters = templateStarterValues(t);
  if (answer?.kind !== "codeTemplate" || answer.language !== t.language || !answer.values || typeof answer.values !== "object") return starters;
  const out: Record<string, string> = {};
  for (const id of Object.keys(starters)) { const v = Object.prototype.hasOwnProperty.call(answer.values, id) ? answer.values[id] : undefined; out[id] = typeof v === "string" ? v : starters[id]; }
  return out;
}
const rowsOf = (v: string) => Math.min(16, Math.max(2, v.split("\n").length + (v.endsWith("\n") ? 0 : 1)));

export default function CodingTemplateResponse({ q, id, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectCodingConfigForStudent((q as { coding?: unknown }).coding), [q]);
  const injected = useContext(CodingExecutionContext);
  const attempt = useContext(StudentAttemptContext);
  const preview = useContext(TeacherPreviewContext);
  const { confirm, confirmDialog } = useConfirm();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [view, setView] = useState<View | null>(null);
  const [runError, setRunError] = useState("");
  const [busy, setBusy] = useState<"" | "custom" | "public">("");
  const [progress, setProgress] = useState("");
  const [limitNote, setLimitNote] = useState("");
  const [stdin, setStdin] = useState<string>(() => cfg?.publicTests?.[0]?.input ?? "");
  const [remoteCaps, setRemoteCaps] = useState<CodingCapabilities | null>(null);
  const gapRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const seq = useRef(0), active = useRef<{ id: number; ctrl: AbortController } | null>(null), mounted = useRef(true);
  useEffect(() => {
    const live = mounted, generation = seq, inflight = active;
    live.current = true;
    return () => { live.current = false; generation.current++; inflight.current?.ctrl.abort(); inflight.current = null; };
  }, []);
  useEffect(() => {
    if (injected || !attempt || preview) return;
    let live = true;
    void loadCodingCapabilities(attempt).then(c => { if (live) setRemoteCaps(c); });
    return () => { live = false; };
  }, [injected, attempt, preview]);
  const exec = useMemo(() => injected ?? (attempt && remoteCaps && !preview ? createApiCodingService(attempt, id, remoteCaps) : undefined), [injected, attempt, remoteCaps, id, preview]);

  const template = cfg?.template;
  const def = template ? codingLanguage(template.language) : undefined;
  if (!cfg || !template || !def) return <div className="cx-coding" data-testid="coding-config-invalid" role="note">إعداد سؤال القالب المقفل غير صالح؛ لا يمكن عرض الكود. أبلغ المعلم.</div>;

  const values = currentValues(template, answer);
  const starters = templateStarterValues(template);
  const source = reconstructTemplateSource(template, values);   // display / staleness only — the server rebuilds the official program
  const limit = Math.min(CODE_SOURCE_MAX_BYTES, cfg.limits?.sourceBytes ?? CODE_SOURCE_MAX_BYTES);
  const gapIds = template.segments.flatMap(s => (s.kind === "editable" ? [s.id] : []));
  const emit = (next: Record<string, string>) => onAnswer({ kind: "codeTemplate", language: template.language, languageVersion: def.version, values: next });
  const setGap = (gap: string, text: string) => {
    if (disabled) return;
    const next = { ...values, [gap]: text };
    if (utf8ByteLength(text) > CODING_TEMPLATE_LIMITS.gapBytes) { setLimitNote("النص في هذا الفراغ أطول من الحد المسموح (16 كيلوبايت)؛ لم يُحفظ التعديل الأخير."); return; }
    if (utf8ByteLength(reconstructTemplateSource(template, next)) > limit) { setLimitNote("الكود الكامل أكبر من حد حجم الكود (" + limit + " بايت)؛ لم يُحفظ التعديل الأخير."); return; }
    setLimitNote("");
    emit(next);
  };
  const resetGap = (gap: string) => setGap(gap, starters[gap]);
  const resetAll = async () => {
    const changed = gapIds.some(g => values[g] !== starters[g]);
    if (!changed) return;
    if (!(await confirm({ title: "استعادة كل الفراغات", message: "سيُستبدل ما كتبته في جميع الفراغات بالنص الابتدائي.\nلا يمكن التراجع عن هذا الإجراء.", confirmLabel: "استعادة", cancelLabel: "إلغاء", tone: "danger" }))) return;
    setLimitNote("");
    emit({ ...starters });
  };
  const onGapKey = (i: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const target = gapRefs.current[e.key === "ArrowDown" ? i + 1 : i - 1];
    if (!target) return;
    e.preventDefault();
    target.focus();
  };

  const runnable = !preview && canRun(exec, template.language, def.version);
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
  const request = (input: string, testId?: string) => ({ language: template.language, languageVersion: def.version, source, values: { ...values }, stdin: input, ...(testId ? { testId } : {}) });
  const execute = async () => {
    if (stdinTooLarge) return;
    const run = begin("custom");
    if (!run) return;
    const snap: Snapshot = { source }, input = stdin, sample = samples.find(t => t.input === input);
    setProgress("جارٍ التشغيل…");
    try {
      const raw = await exec!.run(request(input, sample?.id), { signal: run.ctrl.signal });
      if (!current(run.id)) return;
      setView({ mode: "custom", snap, title: sample?.title, result: normalizeExecutionResult(raw, cfg.limits?.outputBytes ?? 65536), sample: sample?.sampleOutput });
    } catch (e) {
      if (!current(run.id)) return;
      setView(null);
      setRunError(failMessage(e));
    } finally { finish(run.id); }
  };
  const executePublic = async () => {
    if (samples.length === 0) return;
    const run = begin("public");
    if (!run) return;
    const snap: Snapshot = { source };
    let rows: PublicRow[] = samples.map((t, i) => ({ key: t.id || String(i), title: sampleTitle(t, i), sample: t.sampleOutput }));
    setView({ mode: "public", snap, rows });
    try {
      for (let i = 0; i < samples.length; i++) {
        setProgress("جارٍ تشغيل الأمثلة… (" + (i + 1) + " من " + samples.length + ")");
        const raw = await exec!.run(request(samples[i].input, samples[i].id), { signal: run.ctrl.signal });
        if (!current(run.id)) return;
        rows = rows.map((r, k) => (k === i ? { ...r, result: normalizeExecutionResult(raw, cfg.limits?.outputBytes ?? 65536) } : r));
        setView({ mode: "public", snap, rows });
      }
    } catch (e) {
      if (!current(run.id)) return;
      setRunError(failMessage(e));
    } finally { finish(run.id); }
  };
  const stale = !!view && view.snap.source !== source;
  const helpId = "cx-tpl-help-" + uid;
  let gapNo = 0;

  return (
    <div className="cx-coding cx-tpl" data-testid="coding-template-response" aria-label={"قالب الكود — " + labelPrefix} role="group">
      {preview && <p className="cx-run-note" data-testid="coding-template-preview-note" role="note">معاينة المعلم: هذا ما يراه الطالب؛ لا تُحفظ الإجابات هنا.</p>}
      <div className="cx-tpl-head">
        <span className="cx-tpl-lang" data-testid="coding-template-language">لغة البرمجة: {def.label}</span>
        <button type="button" className="cx-ws-button" onClick={() => void resetAll()} disabled={disabled}>استعادة كل الفراغات</button>
      </div>
      <p className="cx-tpl-help" id={helpId}>
        {"الأجزاء المعلَّمة «مقفل» للقراءة فقط ولا يمكن تعديلها. اكتب في الفراغات المرقّمة فقط (" + gapIds.length + (gapIds.length === 1 ? " فراغ" : " فراغات") + "). للانتقال بين الفراغات: Alt + ↓ / Alt + ↑."}
      </p>
      <div className="cx-tpl-code" dir="ltr" lang="en" data-testid="coding-template-code">
        {template.segments.map((s, i) => {
          if (s.kind === "locked") return (
            <div key={"l" + i} className="cx-tpl-locked" data-testid="coding-template-locked">
              <span className="cx-tpl-tag" dir="rtl" lang="ar" aria-hidden="true">🔒 مقفل</span>
              <pre tabIndex={0} aria-label="كود مقفل للقراءة فقط" aria-roledescription="كود مقفل">{s.text}</pre>
            </div>
          );
          const n = ++gapNo, idx = n - 1, v = values[s.id];
          return (
            <div key={s.id} className="cx-tpl-gap" data-testid="coding-template-gap" data-gap-id={s.id} data-changed={v !== s.starter || undefined}>
              <div className="cx-tpl-gap-bar" dir="rtl" lang="ar">
                <label className="cx-tpl-tag is-gap" htmlFor={"cx-tpl-" + uid + "-" + s.id}>{"✎ فراغ " + n}</label>
                <button type="button" className="cx-tpl-reset" onClick={() => resetGap(s.id)} disabled={disabled || v === s.starter} aria-label={"استعادة النص الابتدائي للفراغ " + n}>استعادة</button>
              </div>
              <textarea id={"cx-tpl-" + uid + "-" + s.id} ref={el => { gapRefs.current[idx] = el; }} className="cx-tpl-input" dir="ltr" wrap="off"
                rows={rowsOf(v)} value={v} disabled={disabled} readOnly={disabled}
                spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" data-gramm="false"
                aria-label={"فراغ " + n + " من " + gapIds.length + " — " + labelPrefix} aria-describedby={helpId}
                data-testid="coding-template-input" onKeyDown={onGapKey(idx)} onChange={e => setGap(s.id, e.target.value)} />
            </div>
          );
        })}
      </div>
      {limitNote !== "" && <p className="cx-run-error" role="alert" data-testid="coding-template-limit">{limitNote}</p>}
      <details className="cx-tpl-full" data-testid="coding-template-full">
        <summary>عرض البرنامج كاملًا (للقراءة فقط)</summary>
        <pre dir="ltr" lang="en" tabIndex={0} aria-label="البرنامج كاملًا للقراءة فقط">{source}</pre>
      </details>
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
    </div>
  );
}
