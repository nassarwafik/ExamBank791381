// DG8 «أرفق بالاستمارة» (docs/enterprise-diagram-editor-design.md §10.3, §20) — the picture of the diagram the student just drew, attached
// to an image question of the project's exam form, through the form's own image request (F4: `addImage`). Nothing new on the server: it
// decides everything as it does for a photo — the student's own form only, a form still open for editing, the question's image count,
// the bytes sniffed, bounded, re-encoded and stripped of metadata. What this panel checks is presentation only (which questions to offer,
// and why a button is off); a refusal from the server is shown as it comes.
import { useEffect, useMemo, useRef, useState } from "react";
import { addExamFormImage, fetchExamForm, ExamFormRequestError } from "./api";
import { ImageFileError, prepareImageFile } from "./imageFile";
import { hasImageAnswers, isLocked } from "./useExamFormDraft";
import type { ExamFormQuestion, ExamFormView } from "./types";

type ImageQuestion = { section: string; question: ExamFormQuestion; count: number; max: number };

/** The form's image questions, in its order, with how many images each holds and may hold. */
export function imageQuestionsOf(view: ExamFormView): ImageQuestion[] {
  const out: ImageQuestion[] = [];
  for (const s of [...view.form.sections].sort((a, b) => a.order - b.order)) {
    for (const q of s.questions) {
      if (q.kind !== "image") continue;
      out.push({ section: s.title, question: q, count: view.answers[q.questionId]?.images?.length ?? 0, max: q.images?.max ?? 1 });
    }
  }
  return out;
}

/** Why nothing can be attached to this form now (null: it can). */
export function attachBlockedReason(view: ExamFormView | null): string | null {
  if (!view) return "لم يفتح معلمك استمارة هذا المشروع بعد.";
  if (!hasImageAnswers(view)) return "أسئلة الصور غير مفعّلة في استمارة هذا المشروع بعد.";
  if (view.status === "submitted") return "سلّمت الاستمارة، فلا تُضاف إليها صور الآن. إن أعادها معلمك للتعديل تستطيع الإرفاق.";
  if (view.status === "approved") return "اعتمد معلمك الاستمارة، فهي للعرض فقط.";
  if (isLocked(view)) return "الاستمارة مغلقة الآن، فلا تُضاف إليها صور.";
  if (!imageQuestionsOf(view).length) return "لا سؤال صورة في استمارة هذا المشروع.";
  return null;
}

export default function DiagramAttachPanel({ token, projectCode, picture, title, onClose, onAttached }: {
  token: string; projectCode: string;
  /** The picture of the diagram, as the editor made it. */
  picture: Blob;
  /** What was drawn («مخطط الأصناف»), for the message. */
  title: string;
  onClose: () => void;
  /** After an image is attached (the project's card counts may change). */
  onAttached?: () => void;
}) {
  const [view, setView] = useState<ExamFormView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  useEffect(() => {
    let current = true;
    fetchExamForm(token, projectCode)
      .then(v => { if (current) setView(v); })
      .catch(e => { if (current) setError(e instanceof ExamFormRequestError ? e.message : "تعذر تحميل الاستمارة."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, projectCode]);

  // the picture shown as it will be attached
  const preview = useMemo(() => (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(picture) : ""), [picture]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const blocked = loading || error ? null : attachBlockedReason(view);
  const questions = view && !blocked ? imageQuestionsOf(view) : [];

  const attach = async (q: ImageQuestion) => {
    if (busy) return;
    setBusy(q.question.questionId); setError(""); setDone("");
    try {
      const dataUrl = await prepareImageFile(new File([picture], "diagram.png", { type: picture.type || "image/png" }));
      const next = await addExamFormImage(token, projectCode, q.question.questionId, dataUrl);
      if (!live.current) return;
      setView(next);
      setDone("أُرفقت صورة " + title + " بالسؤال «" + q.question.prompt + "». تجدها في الاستمارة، وتُسلَّم معها حين تسلّمها.");
      onAttached?.();
    } catch (e) {
      if (!live.current) return;
      setError(e instanceof ImageFileError || e instanceof ExamFormRequestError ? e.message : "تعذر رفع الصورة.");
    } finally {
      if (live.current) setBusy("");
    }
  };

  return (
    <section className="eb-sp-attach" aria-label="أرفق صورة المخطط بالاستمارة" data-testid="diagram-attach-panel">
      <div className="eb-sp-attach-head">
        <h3 className="eb-sp-attach-title">أرفق صورة المخطط باستمارة المشروع</h3>
        <button type="button" className="eb-button is-quiet is-small" onClick={onClose}>إغلاق</button>
      </div>
      <div className="eb-sp-attach-body">
        {preview && <img className="eb-sp-attach-preview" src={preview} alt={"صورة " + title + " التي ستُرفق"} data-testid="diagram-attach-preview" />}
        <div className="eb-sp-attach-main">
          {loading && <p className="eb-muted" role="status">جارٍ تحميل الاستمارة…</p>}
          {blocked && <p className="platform-warning" data-testid="diagram-attach-blocked">{blocked}</p>}
          {questions.length > 0 && <>
            <p className="eb-muted">اختر سؤال الصورة الذي تُرفق به المخطط:</p>
            <ul className="eb-sp-attach-list" data-testid="diagram-attach-questions">
              {questions.map(q => {
                const full = q.count >= q.max;
                return (
                  <li key={q.question.questionId}>
                    <span className="eb-sp-attach-q">
                      <span className="eb-muted">{q.section}</span>
                      <strong>{q.question.prompt}</strong>
                      <span className="eb-muted" dir="rtl">{q.count} من {q.max} {q.max === 1 ? "صورة" : "صور"}{full ? " — اكتمل العدد؛ احذف صورة من الاستمارة أولًا" : ""}</span>
                    </span>
                    <button type="button" className="eb-button is-small" disabled={full || !!busy} onClick={() => void attach(q)}
                      data-testid={"diagram-attach-to-" + q.question.questionId}>{busy === q.question.questionId ? "جارٍ الإرفاق…" : "أرفق هنا"}</button>
                  </li>
                );
              })}
            </ul>
          </>}
          {done && <p className="platform-notice" role="status" data-testid="diagram-attach-done">{done}</p>}
          {error && <p className="platform-error" role="alert" data-testid="diagram-attach-error">{error}</p>}
        </div>
      </div>
      <p className="eb-muted eb-sp-attach-note">تُرسل الصورة إلى استمارتك فقط، كما تُرفع أي صورة فيها، ويعيد الخادم تجهيزها. يبقى المخطط في المحرّر كما هو.</p>
    </section>
  );
}
