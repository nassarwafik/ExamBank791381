import { useEffect, useRef, useState, type DragEvent } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import { simulationReferenceOf, validateSimulationReference, type SimulationQuestionConfig } from "../../smartsimManifest";
import { useSimulationService, type SimulationPackageRecord, type SimulationUploadResult, type SimulationValidationReport } from "../../smartsim/simulationService";
import SimulationSandboxHost from "../../smartsim/SimulationSandboxHost";
import { SIMULATOR_BUILD_SPEC } from "../../smartsim/simulatorSpecText";
import Dialog from "../../ui/Dialog";
import type { JsonValue } from "../../smartsimState";
import "../../smartsim/smartsim.css";

// Phase 16B-A — simulation@1 authoring (lazy): pick a package from the teacher's Simulation Library or upload a .smartsim /
// .zip (drag-and-drop or click), read the server's factual validation report, handle the version/hash conflict (never an
// overwrite), preview through EXACTLY the student sandbox host, and copy the build spec. The question stores ONLY the exact
// reference {packageId, packageVersion, packageHash, runtimeVersion, entry, title} (+ optional scenario / publicConfig);
// `answer` is never touched here (reserved for the 16B-B assertion engine). The editor never sees a token: the App-owned
// service arrives through context; without it the actions are simply not offered.
type Panel = "none" | "library" | "upload";
const hashPrefix = (h: string) => (h.startsWith("sha256:") ? h.slice(7, 19) : h.slice(0, 12));
const fmtBytes = (n: number) => (n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" }); };
const CONFLICT_MESSAGE = "هذه النسخة موجودة بمحتوى مختلف. أنشئ إصدارًا جديدًا للمحاكي، مثل v2.";

export default function SimulationEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const service = useSimulationService();
  const current = (node as { simulation?: SimulationQuestionConfig }).simulation;
  const currentIssues = validateSimulationReference(current);
  const [panel, setPanel] = useState<Panel>("none");
  const [library, setLibrary] = useState<SimulationPackageRecord[] | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<SimulationUploadResult | null>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewState, setPreviewState] = useState<JsonValue | null | undefined>(undefined);
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastFile = useRef<File | null>(null);
  const [lastFileName, setLastFileName] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const select = (pkg: SimulationPackageRecord) => {
    const ref = simulationReferenceOf(pkg);
    // scenario / publicConfig are package-specific: they survive only a version change of the SAME package
    if (current && current.packageId === pkg.packageId) { if (current.scenario) ref.scenario = current.scenario; if (current.publicConfig) ref.publicConfig = current.publicConfig; }
    onChange({ simulation: ref } as Partial<typeof node>);
  };
  const openLibrary = async () => {
    setPanel("library"); setLibraryError("");
    if (!service) return;
    try { const rows = await service.list(); if (alive.current) setLibrary(rows); }
    catch { if (alive.current) { setLibrary([]); setLibraryError("تعذّر تحميل مكتبة المحاكاة. أعد المحاولة."); } }
  };
  const upload = async (file: File) => {
    if (!service) return;
    lastFile.current = file; setLastFileName(file.name); setResult(null); setProgress(0);
    let r: SimulationUploadResult;
    try { r = await service.upload(file, f => { if (alive.current) setProgress(f); }); }
    catch { r = { status: "error", message: "تعذّر رفع الحزمة. تحقق من الاتصال ثم أعد المحاولة." }; }
    if (!alive.current) return;
    setProgress(null); setResult(r);
    if (r.status === "created" || r.status === "exists") select(r.package);
  };
  const onFiles = (files: FileList | null) => { const f = files && files[0]; if (f) void upload(f); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (!disabled) onFiles(e.dataTransfer?.files ?? null); };
  const copySpec = async () => {
    try { await navigator.clipboard.writeText(SIMULATOR_BUILD_SPEC); setCopied("✓ تم نسخ مواصفات بناء المحاكي."); }
    catch { setCopied("تعذّر النسخ تلقائيًا؛ راجع docs/smartsim/AI_SIMULATOR_SPEC.md."); }
  };
  const report: SimulationValidationReport | undefined = result && result.status !== "error" ? result.report : undefined;
  const blockers = report ? report.issues.filter(i => i.severity === "error") : [];
  const warnings = report ? report.issues.filter(i => i.severity === "warning") : [];

  return (
    <div className="qt-editor qt-simulation" data-testid="qt-editor-simulation">
      <div className="smartsim-selected" data-testid="smartsim-selected">
        {current && !currentIssues.length ? (
          <>
            <strong>{current.title || current.packageId}</strong>
            <span>الحزمة: <code>{current.packageId}@{current.packageVersion}</code> · البصمة: <code>{hashPrefix(current.packageHash)}…</code> · بيئة التشغيل: <code>simulation@{current.runtimeVersion}</code></span>
            <span className="sb-hint">مرجع مثبّت بالضبط (المعرّف والإصدار والبصمة). تغيير المحاكي أو إصداره يتم فقط عبر الاختيار من المكتبة أو الرفع.</span>
          </>
        ) : current ? (
          <span className="smartsim-issue-blocker">مرجع حزمة المحاكاة غير صالح ({currentIssues.map(i => i.code).join(", ")}) — اختر حزمة من المكتبة أو ارفع حزمة جديدة.</span>
        ) : (
          <span>لم يتم اختيار حزمة محاكاة بعد. لا يمكن اعتماد الامتحان قبل تثبيت حزمة لهذا السؤال.</span>
        )}
      </div>

      {service ? (
        <div className="smartsim-actions" role="group" aria-label="إجراءات المحاكاة">
          <button type="button" className="eb-button" onClick={() => { void openLibrary(); }} disabled={disabled} aria-pressed={panel === "library"}>من المكتبة</button>
          <button type="button" className="eb-button" onClick={() => setPanel("upload")} disabled={disabled} aria-pressed={panel === "upload"}>رفع محاكاة</button>
          {current && !currentIssues.length && <button type="button" className="eb-button" onClick={() => { setPreviewState(undefined); setPreview(true); }}>معاينة المحاكاة</button>}
          <button type="button" className="eb-button" onClick={() => { void copySpec(); }}>نسخ مواصفات بناء محاكي</button>
        </div>
      ) : (
        <p className="sb-hint" role="note">خدمة المحاكاة غير متاحة في هذا السياق (رفع الحزم واختيارها من المكتبة يتطلبان جلسة معلّم في منشئ الامتحانات).</p>
      )}
      {copied && <p className="sb-hint" role="status">{copied}</p>}

      {panel === "library" && service && (
        <section className="smartsim-panel" aria-label="مكتبة المحاكاة">
          <h4>مكتبة المحاكاة</h4>
          {library === null && !libraryError && <p className="sb-hint" role="status">جارٍ تحميل المكتبة…</p>}
          {libraryError && <p className="smartsim-issue-blocker" role="alert">{libraryError}</p>}
          {library && library.length === 0 && !libraryError && <p className="sb-hint">لا توجد محاكيات مرفوعة بعد. استخدم «رفع محاكاة».</p>}
          {library && library.length > 0 && (
            <ul className="smartsim-lib">
              {library.map(p => (
                <li key={p.packageHash} className="smartsim-lib-item" data-testid="smartsim-lib-item">
                  <div>
                    <strong>{p.title}</strong>
                    {p.description && <p className="sb-hint">{p.description}</p>}
                    <div className="smartsim-meta">
                      <code>{p.packageId}@{p.packageVersion}</code>
                      <span>البصمة <code>{hashPrefix(p.packageHash)}…</code></span>
                      <span>{fmtBytes(p.sizeBytes)} · {p.fileCount} ملف</span>
                      <span>{fmtDate(p.uploadedAt)}</span>
                      <span>{p.status === "ready" ? "جاهزة" : p.status}</span>
                    </div>
                  </div>
                  <button type="button" className="eb-button is-primary" onClick={() => select(p)} disabled={disabled} aria-label={"اختيار " + p.title + " الإصدار " + p.packageVersion}>اختيار</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {panel === "upload" && service && (
        <section className="smartsim-panel" aria-label="رفع محاكاة">
          <h4>رفع حزمة محاكاة (.smartsim أو .zip)</h4>
          <div className={"smartsim-drop" + (over ? " is-over" : "")} role="button" tabIndex={0} aria-label="اختر ملف حزمة المحاكاة أو أفلته هنا"
            onClick={() => fileRef.current?.click()} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <span>أفلت ملف .smartsim هنا أو انقر للاختيار</span>
            <span className="sb-hint">الحد الأقصى 15 MB · يجب أن تحتوي الحزمة على manifest.json ومجلد dist/ مبني مسبقًا</span>
            <input ref={fileRef} data-testid="smartsim-file-input" type="file" accept=".smartsim,.zip,application/zip,application/x-zip-compressed" hidden onChange={e => { onFiles(e.target.files); e.target.value = ""; }} disabled={disabled} />
          </div>
          {progress !== null && <progress className="smartsim-progress" max={1} value={progress} aria-label="تقدّم الرفع">{Math.round(progress * 100)}%</progress>}
          {result && result.status === "error" && <p className="smartsim-issue-blocker" role="alert">{result.message}</p>}
          {result && result.status === "conflict" && (
            <div className="smartsim-conflict" role="alert" data-testid="smartsim-conflict">
              <p>{CONFLICT_MESSAGE}</p>
              {result.existing && <p className="sb-hint">النسخة المخزّنة: <code>{hashPrefix(result.existing.packageHash)}…</code></p>}
            </div>
          )}
          {report && (
            <div className="smartsim-report" data-testid="smartsim-report" role="status">
              {result && (result.status === "created" || result.status === "exists") && <p><strong>✓ اجتازت فحوص الحزمة</strong>{report.fileCount !== undefined && <> — {report.fileCount} ملف{report.uncompressedBytes !== undefined ? " · " + fmtBytes(report.uncompressedBytes) : ""}{report.selfContained ? " · ذاتية الاحتواء" : ""}</>}{result.status === "exists" ? " (الحزمة مخزّنة مسبقًا بالبصمة نفسها)" : ""}</p>}
              {result && result.status === "rejected" && <p><strong>لم تجتز الحزمة فحوص السلامة</strong> — لم يُخزَّن شيء ولم يتغير السؤال.</p>}
              {blockers.length > 0 && <ul aria-label="عوائق">{blockers.map((i, n) => <li key={n} className="smartsim-issue smartsim-issue-blocker" data-testid="smartsim-issue-blocker"><code>{i.code}</code> {i.message}{i.path ? <> — <code>{i.path}</code></> : null}</li>)}</ul>}
              {warnings.length > 0 && <ul aria-label="تنبيهات">{warnings.map((i, n) => <li key={n} className="smartsim-issue smartsim-issue-warning" data-testid="smartsim-issue-warning"><code>{i.code}</code> {i.message}</li>)}</ul>}
            </div>
          )}
          {result && result.status !== "created" && result.status !== "exists" && lastFileName && <button type="button" className="eb-button" onClick={() => { if (lastFile.current) void upload(lastFile.current); }} disabled={disabled}>إعادة المحاولة ({lastFileName})</button>}
        </section>
      )}

      <p className="sb-hint">
        المحاكاة تعمل في إطار معزول (sandbox) بلا شبكة ولا وصول إلى الصفحة. تُرفع الحزمة كملف .smartsim/.zip يحوي manifest.json ومجلد dist/ يُنفَّذ وحده؛
        مشاريع TypeScript / React / Vite يجب بناؤها مسبقًا (dist) — لا يُشغَّل npm أو tsc أو vite على الخادم. إجابة الطالب هي حالة المحاكاة كما أرسلتها الحزمة
        وتُراجع يدويًا في هذه المرحلة؛ الحزمة لا تمنح درجات.
      </p>

      {preview && current && !currentIssues.length && (
        <Dialog open title={"معاينة المحاكاة — " + (current.title || current.packageId)} size="lg" onClose={() => setPreview(false)} className="smartsim-preview-dialog">
          <div className="smartsim-preview">
            <p className="sb-hint">هذه المعاينة تستخدم نفس مضيف الطالب تمامًا (نفس sandbox ونفس الرابط المثبّت بالبصمة). حالة المحاكاة أدناه للتصحيح فقط ولا تُحفظ.</p>
            <SimulationSandboxHost reference={current} savedState={previewState} mode="preview" onStateChange={setPreviewState} label={current.title} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
