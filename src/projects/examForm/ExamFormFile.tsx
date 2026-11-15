// Phase F5-UI — the file of one FILE question of the project exam form («أرفق ملف Packet Tracer النهائي», «أرفق كتاب المشروع
// النهائي»): what the student attached, the button that attaches or replaces it, the one that removes it, and its download.
// A file has no public address and is never shown in the page: it is read with the reader's session and handed to the
// browser as a download. On a read-only form only the name and the download remain. The teacher's review uses the same
// download line, read with the teacher's session (ExamFormFileLine).
//
// The checks here (extension, size) are a convenience for the student, never protection: the server decides what a file
// must look like (api/src/lib/project-tracker/exam-form-files.js).
import { useRef, useState } from "react";
import { IconDownload, IconFile, IconTrash, IconUpload } from "../../icons";
import { fileRefusal, fileSizeText } from "./fileRules";
import type { ExamFormFileRef, ExamFormQuestion } from "./types";

/** Reads the bytes of one file by its id: the student's own read, or the teacher's read of one student's file. */
export type ExamFormFileReader = (fileId: string) => Promise<Blob>;

/** What the form page gives a file question so it can take a file. Absent while the class has file answers off. */
export type ExamFormFileTools = {
  read: ExamFormFileReader;
  add: (questionId: string, fileName: string, dataBase64: string) => Promise<void>;
  remove: (questionId: string, fileId: string) => Promise<void>;
  /** Asks the student before the file is removed; false keeps it. */
  confirmRemove: () => Promise<boolean>;
};

const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// The bytes of a picked file as base64 text (what the form route takes).
const readAsBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => { const text = typeof reader.result === "string" ? reader.result : ""; const at = text.indexOf(","); resolve(at >= 0 ? text.slice(at + 1) : ""); };
  reader.onerror = () => reject(new Error("read"));
  reader.readAsDataURL(file);
});

// Hands bytes to the browser as a download under the file's own name. The address lives only for the click.
function saveToDevice(blob: Blob, name: string) {
  const address = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(address), 1000);
}

/** One attached file: its name and size, and the button that downloads it with the reader's session. */
export function ExamFormFileLine({ file, read }: { file: ExamFormFileRef; read: ExamFormFileReader }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ext = file.ext && file.name.toLowerCase().endsWith(file.ext) ? file.name.slice(file.name.length - file.ext.length) : "";
  const stem = ext ? file.name.slice(0, file.name.length - ext.length) : file.name;
  async function download() {
    setBusy(true); setError("");
    try { saveToDevice(await read(file.id), file.name); }
    catch (e) { setError(messageOf(e, "تعذر تنزيل الملف.")); }
    finally { setBusy(false); }
  }
  return (
    <div className="eb-sp-form-file-line" data-testid="exam-form-file-line">
      {/* The extension is its own left-to-right run: beside an Arabic name that ends in digits, «794589.docx» would
          otherwise be drawn as «docx.794589». The text is still the file's name, unbroken. */}
      <span className="eb-sp-form-file-name"><IconFile size={16} aria-hidden="true" /><span className="eb-sp-form-file-label"><bdi>{stem}</bdi><span dir="ltr">{ext}</span></span> <span className="eb-muted">({fileSizeText(file.bytes)})</span></span>
      <button type="button" className="eb-button is-small" disabled={busy} onClick={() => void download()} aria-label={"تنزيل الملف " + file.name}>
        <IconDownload size={14} aria-hidden="true" />{busy ? "جارٍ التنزيل..." : "تنزيل"}
      </button>
      {error && <p className="eb-sp-form-missing-mark" role="alert">{error}</p>}
    </div>
  );
}

type Props = { question: ExamFormQuestion; file: ExamFormFileRef | undefined; disabled: boolean; tools: ExamFormFileTools };

export default function ExamFormFile({ question, file, disabled, tools }: Props) {
  const accept = question.accept || [];
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  async function attach(picked: File) {
    setError("");
    const refusal = fileRefusal(accept, picked.name, picked.size);
    if (refusal) { setError(refusal); if (input.current) input.current.value = ""; return; }
    try {
      setBusy(file ? "جارٍ استبدال الملف..." : "جارٍ رفع الملف...");
      const data = await readAsBase64(picked).catch(() => "");
      if (!data) throw new Error("تعذّر قراءة الملف.");
      await tools.add(question.questionId, picked.name, data);
    } catch (e) {
      setError(messageOf(e, "تعذر رفع الملف."));
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }
  async function remove(current: ExamFormFileRef) {
    setError("");
    if (!(await tools.confirmRemove())) return;
    try {
      setBusy("جارٍ حذف الملف...");
      await tools.remove(question.questionId, current.id);
    } catch (e) {
      setError(messageOf(e, "تعذر حذف الملف."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="eb-sp-form-file" data-testid="exam-form-file">
      {file
        ? <ExamFormFileLine file={file} read={tools.read} />
        : <p className="eb-sp-form-file-state">{disabled ? "لم يُرفق ملف." : "لم يُرفق ملف بعد."}</p>}
      {!disabled && (
        <div className="eb-sp-form-file-actions">
          <input ref={input} type="file" accept={accept.join(",")} className="eb-visually-hidden-input" tabIndex={-1} disabled={!!busy}
            aria-label="الملف المرفق" onChange={e => { const picked = e.target.files && e.target.files[0]; if (picked) void attach(picked); }} />
          <button type="button" className="eb-button is-small" disabled={!!busy} onClick={() => input.current?.click()}>
            <IconUpload size={14} aria-hidden="true" />{file ? "استبدال الملف" : "إرفاق ملف"}
          </button>
          {file && (
            <button type="button" className="eb-button is-small is-quiet" disabled={!!busy} onClick={() => void remove(file)}>
              <IconTrash size={14} aria-hidden="true" />حذف الملف
            </button>
          )}
          <span className="eb-muted eb-sp-form-file-hint">المقبول: <span dir="ltr">{accept.join(" ")}</span> — حتى 10 ميغابايت، ملف واحد.</span>
        </div>
      )}
      {busy && <p className="eb-muted eb-sp-form-file-state" role="status">{busy}</p>}
      {error && <p className="eb-sp-form-missing-mark" role="alert">{error}</p>}
    </div>
  );
}
