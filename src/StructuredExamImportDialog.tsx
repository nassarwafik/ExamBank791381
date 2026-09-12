
import { useRef, useState } from "react";
import type { StructuredExam } from "./examTypes";
import { importStructuredExam } from "./structuredExamHtmlParser";
import { MAX_IMPORT_BYTES, type StructuredImportResult } from "./structuredExamImport";
import "./structured-builder.css";

// Lightweight structured-exam import dialog (Phase 3). Parses a .json / .html / .htm file entirely
// client-side (File.text + DOMParser/JSON.parse — no server upload, no innerHTML), shows an import
// summary, and hands the resulting StructuredExam to the parent to open in the builder. It NEVER
// auto-saves: the teacher decides when to persist via the existing save flow.

type Props = { onClose: () => void; onOpenInBuilder: (exam: StructuredExam) => void };

const ACCEPT = ".json,.html,.htm";

export default function StructuredExamImportDialog({ onClose, onOpenInBuilder }: Props) {
  const [result, setResult] = useState<StructuredImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setFileError("");
    if (file.size > MAX_IMPORT_BYTES) { setFileError("الملف كبير جدًّا (الحد الأقصى ~10 ميغابايت)."); return; }
    setBusy(true);
    try {
      const text = await file.text();
      setResult(importStructuredExam(file.name, text));
    } catch {
      setFileError("تعذّر قراءة الملف.");
    } finally {
      setBusy(false);
    }
  }

  const reset = () => { setResult(null); setFileError(""); if (inputRef.current) inputRef.current.value = ""; };
  const stats = result?.stats;

  return (
    <div className="sb-preview-overlay" role="dialog" aria-modal="true" dir="rtl">
      <header className="sb-preview-head">
        <strong>📥 استيراد امتحان منظّم</strong>
        <button type="button" className="sb-btn" onClick={onClose}>✕ إغلاق</button>
      </header>

      <div className="sb-import-body">
        {!result && (
          <div
            className="sb-import-drop"
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]); }}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={e => void handleFile(e.target.files?.[0])} />
            <p className="sb-import-drop-title">اسحب ملف <b>JSON</b> أو <b>HTML</b> هنا، أو اضغط للاختيار</p>
            <p className="sb-hint">الصيغ المقبولة: .json · .html · .htm — لا يُدعم Word/PDF هنا (حوّلهما خارجيًا أولًا).</p>
            {busy && <p className="sb-hint">⏳ جارٍ التحليل…</p>}
            {fileError && <div className="sb-banner sb-banner-error">{fileError}</div>}
          </div>
        )}

        {!result && (
          <div className="sb-import-templates">
            <span className="sb-field-label">قوالب جاهزة (استخدمها كهدف تحويل من Word/PDF):</span>
            <a className="sb-mini-btn" href="/templates/structured-exam-template.json" download>مثال JSON</a>
            <a className="sb-mini-btn" href="/templates/structured-exam-template.html" download>مثال HTML</a>
          </div>
        )}

        {result && (
          <div className="sb-import-result">
            <div className="sb-row-between">
              <div>
                <strong>نتيجة الاستيراد</strong>
                <p className="sb-hint">الملف: {result.fileName} · الصيغة: {result.sourceLabel || (result.format === "html" ? "HTML" : "JSON")}</p>
              </div>
              <button type="button" className="sb-btn" onClick={reset}>↺ إعادة اختيار ملف</button>
            </div>

            {stats && result.canOpen && (
              <ul className="sb-import-stats">
                <li>✓ {stats.sections} قسم</li>
                <li>✓ {stats.questions} سؤال</li>
                {stats.parts > 0 && <li>✓ {stats.parts} بند</li>}
                {(stats.byType.tableFill || 0) > 0 && <li>✓ {stats.byType.tableFill} جدول</li>}
                {(stats.byType.cliFill || 0) > 0 && <li>✓ {stats.byType.cliFill} سؤال CLI</li>}
                {stats.stimuli > 0 && <li>✓ {stats.stimuli} مادة مشتركة</li>}
                {stats.images > 0 && <li>✓ {stats.images} صورة</li>}
              </ul>
            )}

            {result.parseErrors.length > 0 && (
              <div className="sb-issues sb-issues-error">
                <strong className="sb-issues-head">أخطاء في قراءة الملف — لا يمكن الفتح</strong>
                <ul className="sb-issues-list">{result.parseErrors.map((m, i) => <li className="sb-issue-error" key={i}>⛔ {m.message}</li>)}</ul>
              </div>
            )}

            {(result.validationErrors.length > 0 || result.parseWarnings.length > 0 || result.validationWarnings.length > 0) && (
              <div className={"sb-issues " + (result.validationErrors.length ? "sb-issues-error" : "sb-issues-warn")}>
                <strong className="sb-issues-head">مشاكل تحتاج مراجعة {result.canOpen ? "(يمكن الفتح كمسودة وإصلاحها)" : ""}</strong>
                <ul className="sb-issues-list">
                  {result.validationErrors.map(m => <li className="sb-issue-error" key={m.id}>⛔ {m.message}</li>)}
                  {[...result.parseWarnings, ...result.validationWarnings.map(v => ({ message: v.message }))].map((m, i) => <li className="sb-issue-warn" key={"w" + i}>⚠ {m.message}</li>)}
                </ul>
              </div>
            )}

            <div className="sb-details">
              <button type="button" className="sb-issues-head" onClick={() => setShowDetails(v => !v)}>{showDetails ? "▾" : "▸"} تفاصيل الاستيراد</button>
              {showDetails && (
                <ul className="sb-issues-list">
                  <li>معرّفات مُولّدة تلقائيًا: {result.generatedIds}</li>
                  <li>عناصر غير مدعومة/تنبيهات القراءة: {result.parseWarnings.length + result.parseErrors.length}</li>
                  <li>أنواع الأسئلة: {stats ? Object.entries(stats.byType).map(([k, v]) => k + "×" + v).join("، ") : "—"}</li>
                </ul>
              )}
            </div>

            <div className="sb-import-actions">
              <button type="button" className="sb-btn" onClick={onClose}>إلغاء</button>
              <button type="button" className="sb-btn sb-btn-primary" disabled={!result.canOpen || !result.exam} onClick={() => result.exam && onOpenInBuilder(result.exam)}>فتح في محرر الامتحان المنظّم</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
