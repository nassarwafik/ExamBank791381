// Phase F4-UI — the images of one question of the project exam form: the thumbnails of what the student attached, the
// button that attaches another one, and the one that removes one. An image has no public address: each thumbnail is read
// with the student's session and shown from memory. On a read-only form (submitted, closed, archived) only the
// thumbnails remain.
import { useEffect, useRef, useState } from "react";
import { IconTrash, IconUpload } from "../../icons";
import { fetchExamFormImage } from "./api";
import { IMAGE_ACCEPT, prepareImageFile } from "./imageFile";
import type { ExamFormImageRef, ExamFormQuestion } from "./types";

/** What the form page gives a question so it can take images. Absent while the class has image answers off. */
export type ExamFormImageTools = {
  token: string;
  projectCode: string;
  add: (questionId: string, dataUrl: string) => Promise<void>;
  remove: (questionId: string, imageId: string) => Promise<void>;
  /** Asks the student before an image is removed; false keeps it. */
  confirmRemove: () => Promise<boolean>;
};

type Props = { question: ExamFormQuestion; images: ExamFormImageRef[]; disabled: boolean; tools: ExamFormImageTools };

const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function requirement(min: number, max: number): string {
  if (min > 0 && min === max) return min === 1 ? "المطلوب صورة واحدة." : "المطلوب " + min + " صور.";
  if (min > 0) return "المطلوب " + (min === 1 ? "صورة واحدة" : min + " صور") + " على الأقل، وحتى " + max + ".";
  return max === 1 ? "يمكن إرفاق صورة واحدة." : "يمكن إرفاق حتى " + max + " صور.";
}

// One attached image, read with the session. `large` shows it at the width of the question instead of a thumbnail.
function Thumbnail({ image, index, tools }: { image: ExamFormImageRef; index: number; tools: ExamFormImageTools }) {
  const { token, projectCode } = tools;
  const [shown, setShown] = useState<{ id: string; address: string } | null>(null);
  const [failed, setFailed] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    let alive = true, created = "";
    fetchExamFormImage(token, projectCode, image.id)
      .then(blob => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setShown({ id: image.id, address: created });
        setFailed("");
      })
      .catch(() => { if (alive) setFailed(image.id); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [token, projectCode, image.id, attempt]);

  const number = index + 1;
  if (shown && shown.id === image.id) {
    return (
      <button type="button" className={"eb-sp-form-image-view" + (large ? " is-large" : "")} aria-expanded={large}
        aria-label={(large ? "تصغير الصورة " : "تكبير الصورة ") + number} onClick={() => setLarge(v => !v)}>
        <img src={shown.address} alt={"الصورة " + number + " المرفقة"} width={image.width} height={image.height} />
      </button>
    );
  }
  if (failed === image.id) {
    return (
      <span className="eb-sp-form-image-wait">
        تعذر عرض الصورة <span dir="ltr">{number}</span>.{" "}
        <button type="button" className="eb-button is-small is-quiet" onClick={() => { setFailed(""); setAttempt(n => n + 1); }}>إعادة المحاولة</button>
      </span>
    );
  }
  return <span className="eb-sp-form-image-wait" role="status">جارٍ تحميل الصورة <span dir="ltr">{number}</span>...</span>;
}

export default function ExamFormImages({ question, images, disabled, tools }: Props) {
  const min = question.images?.min ?? 0, max = question.images?.max ?? 0;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const room = Math.max(0, max - images.length);

  async function attach(picked: File[]) {
    setError(""); setNote("");
    const files = picked.slice(0, room);
    if (!files.length) return;
    if (picked.length > files.length) setNote("أُرفق من الصور المختارة ما يسعه السؤال فقط (" + files.length + ").");
    try {
      for (let i = 0; i < files.length; i += 1) {
        setBusy(files.length > 1 ? "جارٍ رفع الصورة " + (i + 1) + " من " + files.length + "..." : "جارٍ رفع الصورة...");
        await tools.add(question.questionId, await prepareImageFile(files[i]));
      }
    } catch (e) {
      setError(messageOf(e, "تعذر رفع الصورة."));
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }
  async function remove(image: ExamFormImageRef) {
    setError(""); setNote("");
    if (!(await tools.confirmRemove())) return;
    try {
      setBusy("جارٍ حذف الصورة...");
      await tools.remove(question.questionId, image.id);
    } catch (e) {
      setError(messageOf(e, "تعذر حذف الصورة."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="eb-sp-form-images" data-testid="exam-form-images">
      <p className="eb-sp-form-images-count">
        {images.length ? <>الصور المرفقة: <span dir="ltr">{images.length}</span> من <span dir="ltr">{max}</span>. </> : disabled ? "لم تُرفق صورة." : "لم تُرفق صورة بعد. "}
        {!disabled && requirement(min, max)}
      </p>
      {images.length > 0 && (
        <ul className="eb-sp-form-images-list">
          {images.map((image, index) => (
            <li key={image.id} className="eb-sp-form-image">
              <Thumbnail image={image} index={index} tools={tools} />
              {!disabled && (
                <button type="button" className="eb-button is-small is-quiet" disabled={!!busy} aria-label={"حذف الصورة " + (index + 1)} onClick={() => void remove(image)}>
                  <IconTrash size={14} aria-hidden="true" />حذف
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && room > 0 && (
        <div className="eb-sp-form-images-add">
          <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple={room > 1} className="eb-visually-hidden-input" tabIndex={-1} disabled={!!busy}
            aria-label="ملف الصورة" onChange={e => { const files = Array.from(e.target.files || []); if (files.length) void attach(files); }} />
          <button type="button" className="eb-button is-small" disabled={!!busy} onClick={() => input.current?.click()}>
            <IconUpload size={14} aria-hidden="true" />{images.length ? "إرفاق صورة أخرى" : "إرفاق صورة"}
          </button>
          <span className="eb-muted eb-sp-form-images-hint">JPEG أو PNG أو WebP.</span>
        </div>
      )}
      {busy && <p className="eb-muted eb-sp-form-images-state" role="status">{busy}</p>}
      {note && !busy && <p className="eb-muted eb-sp-form-images-state" role="status">{note}</p>}
      {error && <p className="eb-sp-form-missing-mark" role="alert">{error}</p>}
    </div>
  );
}
