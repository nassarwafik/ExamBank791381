import type { ChangeEvent, FormEvent } from "react";
import Dialog from "../ui/Dialog";
import StudentPhotoField from "./StudentPhotoField";
import StatusBadge from "../ui/StatusBadge";
import { IconPlus, IconUpload } from "../icons";
import type { Classroom, ImportPreviewRow, Student, ProfilePhotoMeta } from "./types";
import { IDENTITY_ERROR, validIdentity } from "./identity";

/* Form dialogs for the Classes & Students workspace. Field VALUES and handlers live in TeacherPlatform
   (it owns validation, the request bodies and the credential semantics); these components only lay the
   fields out inside the shared Dialog. Submitting the form triggers the same handler as before. */

function submitHandler(onSubmit: () => void) {
  return (e: FormEvent) => { e.preventDefault(); onSubmit(); };
}

// UX-8b — the only FIELD-SPECIFIC validation these dialogs own: the identity number must be exactly 9 digits (the same
// rule TeacherPlatform gates the submit on). A non-empty value that breaks it names the field as invalid and is described
// by the visible message; an empty or valid value leaves no aria-invalid and no stale aria-describedby. Server rejections
// stay form-level banners in TeacherPlatform and never mark a field.
function identityFieldProps(identityNumber: string, errorId: string) {
  const invalid = identityNumber.trim() !== "" && !validIdentity(identityNumber.trim());
  return { invalid, inputProps: invalid ? { "aria-invalid": true as const, "aria-describedby": errorId } : {} };
}
function IdentityError({ id, show }: { id: string; show: boolean }) {
  return show ? <p id={id} className="eb-field-error">{IDENTITY_ERROR}</p> : null;
}

export function CreateClassDialog({ open, onClose, name, grade, schoolYear, onName, onGrade, onSchoolYear, onSubmit, busy }: {
  open: boolean; onClose: () => void; name: string; grade: string; schoolYear: string;
  onName: (v: string) => void; onGrade: (v: string) => void; onSchoolYear: (v: string) => void; onSubmit: () => void; busy: boolean;
}) {
  const formId = "eb-create-class-form";
  return (
    <Dialog open={open} title="إنشاء صف جديد" onClose={onClose} size="sm"
      footer={<><button type="button" className="eb-button" onClick={onClose}>إلغاء</button><button type="submit" form={formId} className="eb-button is-primary" disabled={busy || !name.trim()}><IconPlus size={16} />إنشاء الصف</button></>}>
      <form id={formId} className="eb-form-grid" onSubmit={submitHandler(onSubmit)}>
        <label>اسم الصف<input value={name} onChange={e => onName(e.target.value)} placeholder="مثال: الثاني عشر 8" autoComplete="off" /></label>
        <label>المرحلة / الصف<input value={grade} onChange={e => onGrade(e.target.value)} placeholder="مثال: الثاني عشر" autoComplete="off" /></label>
        <label>السنة الدراسية<input value={schoolYear} onChange={e => onSchoolYear(e.target.value)} autoComplete="off" /></label>
      </form>
    </Dialog>
  );
}

export function AddStudentDialog({ open, onClose, classroom, classActive, firstName, familyName, identityNumber, password, onFirstName, onFamilyName, onIdentityNumber, onPassword, canSubmit, onSubmit, busy }: {
  open: boolean; onClose: () => void; classroom: Classroom | null; classActive: boolean;
  firstName: string; familyName: string; identityNumber: string; password: string;
  onFirstName: (v: string) => void; onFamilyName: (v: string) => void; onIdentityNumber: (v: string) => void; onPassword: (v: string) => void;
  canSubmit: boolean; onSubmit: () => void; busy: boolean;
}) {
  const formId = "eb-add-student-form";
  const identity = identityFieldProps(identityNumber, formId + "-identity-error");
  return (
    <Dialog open={open} title="إضافة طالب" onClose={onClose} size="sm"
      footer={<><button type="button" className="eb-button" onClick={onClose}>إلغاء</button><button type="submit" form={formId} className="eb-button is-primary" disabled={busy || !classActive || !canSubmit}><IconPlus size={16} />إنشاء حساب طالب</button></>}>
      <p className="eb-dialog-lead">سيُضاف الطالب إلى الصف <strong>{classroom?.name || "—"}</strong> ويستخدم رقم الهوية لتسجيل الدخول.</p>
      <form id={formId} className="eb-form-grid" onSubmit={submitHandler(onSubmit)}>
        <label>الاسم<input value={firstName} onChange={e => onFirstName(e.target.value)} placeholder="الاسم الشخصي" autoComplete="off" /></label>
        <label>اسم العائلة<input value={familyName} onChange={e => onFamilyName(e.target.value)} placeholder="اسم العائلة" autoComplete="off" /></label>
        <label>رقم الهوية<input value={identityNumber} onChange={e => onIdentityNumber(e.target.value)} inputMode="numeric" maxLength={9} dir="ltr" placeholder="9 أرقام" autoComplete="off" {...identity.inputProps} /><IdentityError id={formId + "-identity-error"} show={identity.invalid} /></label>
        <label>كلمة مرور اختيارية<input type="password" value={password} onChange={e => onPassword(e.target.value)} placeholder="اتركها فارغة للتوليد التلقائي" autoComplete="new-password" /></label>
      </form>
    </Dialog>
  );
}

export function ImportStudentsDialog({ open, onClose, classroom, classActive, fileName, previewBusy, preview, onFile, onImport, busy }: {
  open: boolean; onClose: () => void; classroom: Classroom | null; classActive: boolean;
  fileName: string; previewBusy: boolean; preview: ImportPreviewRow[]; onFile: (file: File | null) => void; onImport: () => void; busy: boolean;
}) {
  const valid = preview.filter(x => x.status === "valid").length;
  const duplicates = preview.filter(x => x.status === "duplicate").length;
  const invalid = preview.filter(x => x.status === "invalid").length;
  const badge = (status: ImportPreviewRow["status"]) => status === "valid" ? <StatusBadge tone="success">صالح</StatusBadge> : status === "duplicate" ? <StatusBadge tone="warn">مكرر</StatusBadge> : <StatusBadge tone="danger">غير صالح</StatusBadge>;
  return (
    <Dialog open={open} title="استيراد طلاب من ملف" onClose={onClose} size="lg"
      footer={<><button type="button" className="eb-button" onClick={onClose}>إلغاء</button><button type="button" className="eb-button is-primary" onClick={onImport} disabled={busy || previewBusy || !classActive || !valid}><IconUpload size={16} />استيراد الطلاب الصالحين{valid ? ` (${valid})` : ""}</button></>}>
      <p className="eb-dialog-lead">ملف JSON أو CSV بأعمدة الاسم، اسم العائلة ورقم الهوية. يُعرض فحص الملف أولًا، ولا يُحفظ أي طالب قبل الضغط على زر الاستيراد. الصف: <strong>{classroom?.name || "—"}</strong>.</p>
      <div className="eb-form-grid">
        <label>ملف الطلاب<input type="file" accept=".json,.csv,application/json,text/csv" disabled={!classActive || busy} onChange={(e: ChangeEvent<HTMLInputElement>) => onFile(e.target.files?.[0] || null)} /></label>
        <div className="eb-import-summary" role="status">
          <span>الملف</span><strong>{fileName || "لم يتم اختيار ملف"}</strong>
          <small>{previewBusy ? "جارٍ فحص البيانات..." : preview.length ? `${valid} صالح · ${duplicates} مكرر · ${invalid} غير صالح` : ""}</small>
        </div>
      </div>
      {preview.length > 0 && (
        <div className="students-table-wrap import-preview-wrap">
          <table className="students-table eb-preview-table">
            <thead><tr><th scope="col">الحالة</th><th scope="col">الاسم</th><th scope="col">العائلة</th><th scope="col">رقم الهوية</th><th scope="col">ملاحظة</th></tr></thead>
            <tbody>{preview.map(row => <tr key={row.index} className={"import-row-" + row.status}>
              <td>{badge(row.status)}</td>
              <td>{row.firstName || "—"}</td><td>{row.familyName || "—"}</td><td dir="ltr">{row.identityNumber || "—"}</td>
              <td>{row.error || "جاهز للاستيراد"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

export function EditStudentDialog({ open, onClose, classes, firstName, familyName, identityNumber, classId, password, onFirstName, onFamilyName, onIdentityNumber, onClassId, onPassword, canSubmit, onSubmit, busy, photo }: {
  open: boolean; onClose: () => void; classes: Classroom[];
  firstName: string; familyName: string; identityNumber: string; classId: string; password: string;
  onFirstName: (v: string) => void; onFamilyName: (v: string) => void; onIdentityNumber: (v: string) => void; onClassId: (v: string) => void; onPassword: (v: string) => void;
  canSubmit: boolean; onSubmit: () => void; busy: boolean;
  /** Teacher-managed student photo (top of the dialog). Omitted → no photo section (older hosts). */
  photo?: { token: string; student: Student; onChange: (meta: ProfilePhotoMeta | null) => void };
}) {
  const formId = "eb-edit-student-form";
  const identity = identityFieldProps(identityNumber, formId + "-identity-error");
  return (
    <Dialog open={open} title="تعديل تفاصيل الطالب" onClose={onClose} size="sm"
      footer={<><button type="button" className="eb-button" onClick={onClose}>إلغاء</button><button type="submit" form={formId} className="eb-button is-primary" disabled={busy || !canSubmit}>حفظ التعديلات</button></>}>
      {photo && <StudentPhotoField token={photo.token} studentId={photo.student.userId} studentName={photo.student.displayName} avatarId={photo.student.avatarId} profilePhoto={photo.student.profilePhoto ?? null} onChange={photo.onChange} />}
      <form id={formId} className="eb-form-grid" onSubmit={submitHandler(onSubmit)}>
        <label>الاسم<input value={firstName} onChange={e => onFirstName(e.target.value)} autoComplete="off" /></label>
        <label>اسم العائلة<input value={familyName} onChange={e => onFamilyName(e.target.value)} autoComplete="off" /></label>
        <label>رقم الهوية<input value={identityNumber} onChange={e => onIdentityNumber(e.target.value)} inputMode="numeric" maxLength={9} dir="ltr" autoComplete="off" {...identity.inputProps} /><IdentityError id={formId + "-identity-error"} show={identity.invalid} /></label>
        <label>الصف<select value={classId} onChange={e => onClassId(e.target.value)}>{classes.map(c => <option key={c.classId} value={c.classId}>{c.name} · {c.grade}</option>)}</select></label>
        <label>كلمة مرور جديدة<input type="password" value={password} onChange={e => onPassword(e.target.value)} placeholder="اتركها فارغة للإبقاء على الحالية" autoComplete="new-password" /></label>
      </form>
    </Dialog>
  );
}
