import { useRef, useState } from "react";
import type { BuilderQuestion, BuilderImageAsset } from "./examTypes";
import {
  IMAGE_ACCEPT_ATTR, MEDIA_MSG, readImageFile, aiRequestQuestion,
  currentAsset, hasImage, isImageHidden, replaceImagePatch, removeImagePatch, setVisibilityPatch,
  type AiImageRequestQuestion,
} from "./questionMedia";

// Phase 5B — per-question media authoring for the Structured Exam Builder ONLY. Deliberately a SEPARATE
// component from the shared QuestionComposer (which Live Challenge also uses), so exam media controls are
// never exposed in Live Challenge authoring. It owns no auth/session: AI generation goes through the
// `requestQuestionImage` callback injected by App.tsx (the teacher apiRequest path). All state changes flow
// out via `onChange`, which the parent applies to THIS question by examQuestionId — so an operation on one
// question never touches another. Single-flight per question with an operation-sequence guard means a late
// AI response can never overwrite a newer explicit media choice (upload / remove).

type Props = {
  question: BuilderQuestion;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  disabled?: boolean;
  // Authenticated AI image callback (App.tsx). Receives the SAFE request shape (no answer key) and resolves
  // to the generated asset. Absent → the AI button is not offered (e.g. a test render without the callback).
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
};

export default function QuestionMediaEditor({ question, onChange, disabled, requestQuestionImage }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const opSeq = useRef(0);
  const inFlight = useRef(false); // synchronous single-flight (a same-tick double-click can't start two requests)
  const fileRef = useRef<HTMLInputElement | null>(null);

  const asset = currentAsset(question);
  const present = hasImage(question);
  const hidden = isImageHidden(question);

  // Bump the per-question operation token on EVERY explicit media change (upload / AI / remove / toggle). An
  // in-flight async result whose captured token is no longer current is discarded (stale-response guard).
  const nextOp = () => (opSeq.current += 1);

  function pickFile() { if (!disabled && !busy && fileRef.current) fileRef.current.click(); }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-selecting the same file next time
    if (!file || disabled || inFlight.current) return;
    inFlight.current = true;
    const token = nextOp();
    setBusy(true); setError(""); setNotice(MEDIA_MSG.uploading);
    try {
      const read = await readImageFile(file);
      if (token === opSeq.current) {
        onChange(replaceImagePatch({ id: "uploaded-" + Date.now(), origin: read.origin, contentType: read.contentType, dataUrl: read.dataUrl }));
        setNotice(MEDIA_MSG.uploadSuccess);
      }
    } catch (err) {
      if (token === opSeq.current) { setError(err instanceof Error && err.message ? err.message : MEDIA_MSG.readFail); setNotice(""); }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onGenerate() {
    if (disabled || inFlight.current || !requestQuestionImage) return; // synchronous single-flight
    // An existing image is NEVER silently overwritten — require explicit replacement intent.
    if (present && !window.confirm("سيتم إنشاء صورة جديدة واستبدال الصورة الحالية لهذا السؤال. هل تريد المتابعة؟")) return;
    inFlight.current = true;
    const token = nextOp();
    setBusy(true); setError(""); setNotice(MEDIA_MSG.generating);
    try {
      const generated = await requestQuestionImage(aiRequestQuestion(question)); // SAFE payload only (no answer)
      if (token === opSeq.current) {
        onChange(replaceImagePatch({ ...generated }));
        setNotice(MEDIA_MSG.aiSuccess);
      }
      // else: superseded by a newer explicit change — discard the stale result, keep the newer choice.
    } catch (err) {
      // Failure keeps the previous image intact (no onChange) and clears the busy/progress state.
      if (token === opSeq.current) { setError(err instanceof Error && err.message ? err.message : MEDIA_MSG.aiFail); setNotice(""); }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onRemove() {
    if (disabled || !present) return;
    if (!window.confirm("سيتم إزالة صورة هذا السؤال. هل تريد المتابعة؟")) return;
    nextOp(); // supersede any in-flight AI/upload so a late result cannot re-add the removed image
    onChange(removeImagePatch());
    setNotice(""); setError("");
  }

  function onToggleVisible() {
    if (disabled || busy || !asset) return;
    nextOp();
    onChange(setVisibilityPatch(question, hidden)); // hidden → show, visible → hide
    setError("");
  }

  return (
    <div className="sb-media" dir="rtl">
      <div className="sb-media-head">
        <span className="sb-media-title">صورة السؤال</span>
        {busy && <span className="sb-media-busy" role="status">{notice || MEDIA_MSG.generating}</span>}
      </div>

      <input
        ref={fileRef} type="file" className="sb-media-file" accept={IMAGE_ACCEPT_ATTR}
        aria-label="رفع صورة السؤال" onChange={onFile} disabled={disabled || busy}
      />

      {present && asset && (
        <div className="sb-media-preview">
          <img className={"sb-media-thumb" + (hidden ? " sb-media-hidden" : "")} src={asset.dataUrl} alt="معاينة صورة السؤال" />
          {hidden && <span className="sb-media-hidden-tag">مخفية عن الطالب</span>}
        </div>
      )}

      <div className="sb-media-actions">
        {!present && (
          <button type="button" className="sb-btn sb-media-upload" onClick={pickFile} disabled={disabled || busy}>⬆ رفع صورة</button>
        )}
        {present && (
          <button type="button" className="sb-btn sb-media-replace" onClick={pickFile} disabled={disabled || busy}>🔄 استبدال صورة</button>
        )}
        {requestQuestionImage && (
          <button type="button" className="sb-btn sb-media-ai" onClick={() => void onGenerate()} disabled={disabled || busy}>
            {present ? "✨ إنشاء صورة جديدة" : "✨ إنشاء صورة بالذكاء الاصطناعي"}
          </button>
        )}
        {present && (
          <button type="button" className="sb-btn sb-media-visible" onClick={onToggleVisible} disabled={disabled || busy}>
            {hidden ? "👁 إظهار الصورة" : "👁 إخفاء الصورة"}
          </button>
        )}
        {present && (
          <button type="button" className="sb-btn sb-danger sb-media-remove" onClick={onRemove} disabled={disabled}>🗑 إزالة الصورة</button>
        )}
      </div>

      {!busy && notice && <p className="sb-media-notice" role="status">{notice}</p>}
      {error && <p className="sb-media-error" role="alert">{error}</p>}
      <p className="sb-media-hint">PNG أو JPG أو WEBP أو SVG · الحد الأقصى 3 MB</p>
    </div>
  );
}
