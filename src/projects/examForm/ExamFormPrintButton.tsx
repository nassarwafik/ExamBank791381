// Phase F5 (PDF) — «طباعة / حفظ PDF» for one student's project exam form, on the student's page and in the teacher's
// review. The page says what the copy carries (`prepare`); this button reads the attached images with the reader's
// session, builds the document and hands it to the browser's print dialog, where «حفظ بصيغة PDF» makes the file.
import { useState } from "react";
import { IconPrint } from "../../icons";
import { buildExamFormPrintHtml, loadPrintImages, printExamFormDocument, referencedImageIds, type ExamFormPrintInput } from "./examFormPrint";

type Props = {
  /** What to print, without the images — or a sentence that says why it cannot be printed now. */
  prepare: () => Omit<ExamFormPrintInput, "images" | "generatedAt"> | string;
  /** Reads one attached image with the reader's session. */
  readImage: (imageId: string) => Promise<Blob>;
};

export default function ExamFormPrintButton({ prepare, readImage }: Props) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setError("");
    const prepared = prepare();
    if (typeof prepared === "string") { setError(prepared); return; }
    try {
      setBusy("جارٍ تجهيز الملف...");
      const ids = referencedImageIds(prepared.sections, prepared.answers);
      const images = await loadPrintImages(ids, readImage, (done, total) => setBusy("جارٍ تجهيز الصور " + done + " من " + total + "..."));
      const generatedAt = new Date().toLocaleString("ar", { numberingSystem: "latn", dateStyle: "medium", timeStyle: "short" } as Intl.DateTimeFormatOptions);
      if (!printExamFormDocument(buildExamFormPrintHtml({ ...prepared, images, generatedAt }))) setError("تعذر فتح نافذة الطباعة في هذا المتصفح.");
    } catch {
      setError("تعذر تجهيز ملف الطباعة. حاول مرة أخرى.");
    } finally {
      setBusy("");
    }
  }

  return (
    <span className="eb-sp-form-print" data-testid="exam-form-print">
      <button type="button" className="eb-button is-small" disabled={!!busy} onClick={() => void run()}>
        <IconPrint size={14} aria-hidden="true" />{busy ? "جارٍ التجهيز..." : "طباعة / حفظ PDF"}
      </button>
      {busy && <span className="eb-muted eb-sp-form-print-state" role="status">{busy}</span>}
      {error && <span className="eb-sp-form-missing-mark" role="alert">{error}</span>}
    </span>
  );
}
