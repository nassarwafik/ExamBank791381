import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { IconWarning } from "../icons";
import { ownerStudentsApi, type ApiResult, type OwnerCredential, type OwnerImportPreviewRow, type OwnerStudentRow } from "./ownerApi";
import { parseBulkStudents, readImportFileText, IMPORT_TEMPLATE_CSV } from "../bulkStudentsParse";
import { buildCredentialsCsv, buildCredentialCardsHtml, printHtmlDocument } from "../students/credentialSheets";
import { openCredentialBatch } from "../credentialBatch";

/**
 * Tadris+ P5-B4 — «يقوم المالك باضافة طلاب المعلم لكي يجهز له الصفحة»: the owner adds students to one of the teacher's classes,
 * from the «الصفوف» tab — one student, or a list (CSV / JSON, the same file format and the same SERVER preview as the teacher's
 * import: nothing is created before «استيراد»). The students are the teacher's; the teacher keeps adding, editing and archiving them.
 * The temporary passwords are shown ONCE (download the CSV or print the login cards before closing). Every change goes through the
 * page's `send` (a second-factor check is asked inline, then the same request is retried — the import keeps its retry key).
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
const EMPTY = { firstName: "", familyName: "", identityNumber: "", password: "" };
const newImportId = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c && typeof c.randomUUID === "function" ? c.randomUUID() : "imp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
};
function download(text: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function OwnerClassStudents({ token, classId, className, busy, send, onChanged }: {
  token: string; classId: string; className: string; busy: boolean; send: Send; onChanged: () => void;
}) {
  const [one, setOne] = useState(EMPTY);
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<OwnerStudentRow[]>([]);
  const [preview, setPreview] = useState<OwnerImportPreviewRow[] | null>(null);
  const [importId, setImportId] = useState("");
  const [fileError, setFileError] = useState("");
  const [batch, setBatch] = useState<OwnerCredential[] | null>(null);
  const [result, setResult] = useState("");

  const showCredentials = (credentials: OwnerCredential[], text: string) => { setBatch(credentials); setResult(text); onChanged(); };
  const batchOf = () => openCredentialBatch(classId, className, batch || []);

  function addOne(event: FormEvent) {
    event.preventDefault();
    const row = { firstName: one.firstName.trim(), familyName: one.familyName.trim(), identityNumber: one.identityNumber.trim() };
    if (!row.firstName || !row.familyName || !row.identityNumber) { setMissing(true); return; }
    setMissing(false);
    void send(() => ownerStudentsApi.add(token, classId, { ...row, ...(one.password ? { password: one.password } : {}) }), d => {
      setOne(EMPTY);
      showCredentials([{ ...d.student, password: d.temporaryPassword }], "أُضيف الطالب " + d.student.displayName + ".");
    });
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    setFileError(""); setPreview(null); setRows([]);
    if (!file) return;
    let parsed: OwnerStudentRow[];
    try { parsed = parseBulkStudents(await readImportFileText(file), file.name).students; } catch (e) { setFileError(e instanceof Error ? e.message : "الملف غير صالح."); return; }
    if (!parsed.length) { setFileError("لم أجد بيانات طلاب في الملف."); return; }
    setRows(parsed);
    await send(() => ownerStudentsApi.preview(token, classId, parsed), d => { setPreview(d.preview); setImportId(newImportId()); });
  }

  const valid = (preview || []).filter(r => r.status === "valid");
  function importValid() {
    const payload = valid.map(r => ({ firstName: r.firstName, familyName: r.familyName, identityNumber: r.identityNumber }));
    void send(() => ownerStudentsApi.import(token, classId, payload, importId), d => {
      setPreview(null); setRows([]);
      showCredentials(d.credentials, "استُورد " + d.imported + " طالبًا" + (d.failed ? "، وتعذر " + d.failed + "." : "."));
    });
  }

  return (
    <div className="eb-owner-class-students" role="region" aria-label={"طلاب " + className}>
      {result && <p className="eb-owner-hint eb-owner-done" role="status">{result}</p>}
      {batch && batch.length > 0 && (
        <div className="eb-owner-confirm" role="group" aria-label="كلمات المرور المؤقتة">
          <p><strong>كلمات المرور المؤقتة تظهر الآن فقط.</strong> نزّل الملف أو اطبع البطاقات قبل الإغلاق، وسلّمها للمعلم.</p>
          <ul className="eb-owner-hint">{batch.map(c => <li key={c.userId || c.code}><bdi>{c.displayName || [c.firstName, c.familyName].filter(Boolean).join(" ")}</bdi> · <span dir="ltr">{c.identityNumber || c.code}</span> · <span dir="ltr">{c.password}</span></li>)}</ul>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" onClick={() => download(buildCredentialsCsv(batchOf()), "text/csv;charset=utf-8", "student-credentials.csv")}>تنزيل CSV</button>
            <button type="button" className="eb-owner-secondary" onClick={() => printHtmlDocument(buildCredentialCardsHtml(batchOf()))}>طباعة بطاقات الدخول</button>
            <button type="button" className="eb-owner-secondary" onClick={() => { setBatch(null); setResult(""); }}>إغلاق</button>
          </div>
        </div>
      )}

      <form className="auth-form eb-owner-create" onSubmit={addOne} noValidate aria-label={"إضافة طالب إلى " + className}>
        <label className="auth-field"><span>الاسم الشخصي</span><div className="auth-input"><input type="text" value={one.firstName} maxLength={80} onChange={e => setOne(v => ({ ...v, firstName: e.target.value }))} /></div></label>
        <label className="auth-field"><span>اسم العائلة</span><div className="auth-input"><input type="text" value={one.familyName} maxLength={80} onChange={e => setOne(v => ({ ...v, familyName: e.target.value }))} /></div></label>
        <label className="auth-field"><span>رقم الهوية</span><div className="auth-input"><input type="text" inputMode="numeric" dir="ltr" value={one.identityNumber} maxLength={9} onChange={e => setOne(v => ({ ...v, identityNumber: e.target.value }))} /></div></label>
        <label className="auth-field"><span>كلمة المرور (اختيارية — تُولَّد تلقائيًا إن تُركت فارغة)</span><div className="auth-input"><input type="text" dir="ltr" autoComplete="off" value={one.password} onChange={e => setOne(v => ({ ...v, password: e.target.value }))} /></div></label>
        {missing && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />أدخل الاسم الشخصي واسم العائلة ورقم الهوية.</p>}
        <div className="eb-owner-actions"><button type="submit" className="auth-submit" disabled={busy}>إضافة الطالب</button></div>
      </form>

      <fieldset className="eb-owner-cap-group">
        <legend>استيراد قائمة طلاب (CSV أو JSON)</legend>
        <p className="eb-owner-hint">الأعمدة: الاسم، اسم العائلة، رقم الهوية. لا يُنشأ أي طالب قبل الضغط على «استيراد».</p>
        <div className="eb-owner-actions">
          <label className={"eb-owner-secondary eb-owner-file" + (busy ? " is-disabled" : "")}>اختيار ملف<input type="file" accept=".csv,.json,text/csv,application/json" onChange={e => void pickFile(e)} disabled={busy} aria-label="ملف الطلاب" /></label>
          <button type="button" className="eb-owner-secondary" onClick={() => download(IMPORT_TEMPLATE_CSV, "text/csv;charset=utf-8", "students-import-template.csv")}>تنزيل نموذج</button>
        </div>
        {fileError && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{fileError}</p>}
        {preview && (
          <>
            <p className="eb-owner-hint" role="status">المعاينة: {valid.length} صالح، {preview.filter(r => r.status === "duplicate").length} مكرر، {preview.filter(r => r.status === "invalid").length} غير صالح (من {rows.length}).</p>
            <ul className="eb-owner-hint" aria-label="معاينة الاستيراد">
              {preview.filter(r => r.status !== "valid").map((r, i) => <li key={i}><bdi>{[r.firstName, r.familyName].filter(Boolean).join(" ") || "—"}</bdi> · <span dir="ltr">{r.identityNumber}</span>: {r.error || r.message || (r.status === "duplicate" ? "مكرر" : "غير صالح")}</li>)}
            </ul>
            <div className="eb-owner-actions">
              <button type="button" className="auth-submit" disabled={busy || !valid.length} onClick={importValid}>استيراد {valid.length} طالبًا</button>
              <button type="button" className="eb-owner-secondary" onClick={() => { setPreview(null); setRows([]); }}>إلغاء</button>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
