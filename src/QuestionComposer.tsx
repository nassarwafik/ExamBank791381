
import { lazy, Suspense, useState } from "react";
import type { BuilderQuestion, BuilderQuestionType } from "./examTypes";
import type { RichContentV1 } from "./richContent/richContentModel";
import { typeChangePatch, typeSpecificContentPresent } from "./questionTypes/typeContent";
import { isKnownQuestionType, questionTypeLabel, listQuestionTypes } from "./questionTypeCatalog";
import { useConfirm } from "./ui/useConfirm";
import { PRESENTATION_VOCABULARY, validateQuestionPresentation, type QuestionPresentationV1 } from "./presentation/presentationModel";
import QuestionBodyEditor from "./QuestionBodyEditor";
import CompoundQuestionEditor from "./CompoundQuestionEditor";
// Phase 20D.1 — the rich-content block editor and the Markdown conversion dialog are LAZY (builder-only chunks, loaded on demand).
const RichContentEditor = lazy(() => import("./richContent/RichContentEditor"));
const MarkdownConvertDialog = lazy(() => import("./richContent/MarkdownConvertDialog"));

// The SHARED question-authoring core: everything about editing a question's CONTENT and nothing about where it lives.
// It owns the type selector, the question prompt, and the type-specific body (delegating to QuestionBodyEditor, or to
// CompoundQuestionEditor for a compound question's independent parts). It edits the canonical BuilderQuestion in place
// through onChange(patch) — no second question model and no transform layer — so the Structured Exam Builder today and
// the Live Challenge composer later drive the SAME editors over the SAME shapes. Exam-specific chrome (display number,
// marks, stimulus/section, move/duplicate/delete, preview) is NOT here; it stays with the host (StructuredQuestionEditor).
// Type changes go through the canonical changeQuestionType helper — the reset/default logic is never reimplemented here.

type Props = {
  question: BuilderQuestion;
  onChange: (patch: Partial<BuilderQuestion>) => void;
  disabled?: boolean;
};

export default function QuestionComposer({ question: q, onChange, disabled }: Props) {
  // Phase 16A §24 — changing the type is destructive to the type-specific body. When the question carries meaningful authored
  // content the change goes through the shared ConfirmDialog authority (never window.confirm); a fresh default question
  // changes silently. changeQuestionType (canonical) carries identity / prompt / marks / number / group / meta / media and
  // resets ONLY the body, initialising the new type at its current version.
  const { confirm, confirmDialog } = useConfirm();
  const currentKnown = isKnownQuestionType(q.presentationType);
  // Phase 20D.1 — optional RICH prompt (question.richContent). The plain `text` stays the fallback / search text and is never rewritten
  // by the rich editor or the conversion; only the explicit "use as fallback" action fills an EMPTY text. Not offered for compound@1
  // (frozen) nor for parametricNumeric (its stem is a template — rich content is forbidden there).
  const rich = (q as BuilderQuestion & { richContent?: RichContentV1 }).richContent;
  const [richOpen, setRichOpen] = useState(() => rich !== undefined);
  const [converting, setConverting] = useState(false);
  const richAllowed = q.presentationType !== "parametricNumeric" && q.presentationType !== "compound";
  const setRich = (next: RichContentV1 | undefined) => onChange({ richContent: next });
  const applyRichAsFallback = async () => {
    if (!rich || (q.text ?? "").trim()) return;
    const { richContentPlainText } = await import("./richContent/richContentModel");
    const text = richContentPlainText(rich);
    if (text) onChange({ text });
  };
  const requestTypeChange = async (next: BuilderQuestionType) => {
    if (next === q.presentationType) return;
    if (typeSpecificContentPresent(q as unknown as Record<string, unknown>)) {
      const ok = await confirm({ title: "تغيير نوع السؤال", message: "تغيير النوع إلى «" + (questionTypeLabel(next) ?? next) + "» سيحذف الخيارات / الحقول / مفتاح الإجابة الخاصة بالنوع الحالي.\nسيبقى نص السؤال والعلامة والرقم والتصنيف والصورة.", confirmLabel: "تغيير النوع", cancelLabel: "إلغاء", tone: "danger" });
      if (!ok) return;
    }
    // Phase 20D.1 — a parametricNumeric stem is a template: an existing rich prompt is removed with the change (confirmed, never silent).
    const dropRich = next === "parametricNumeric" && (q as BuilderQuestion & { richContent?: unknown }).richContent !== undefined;
    if (dropRich && !(await confirm({ title: "إزالة المحتوى المنسق", message: "أسئلة القوالب العددية لا تقبل محتوى منسقًا؛ سيُحذف المحتوى المنسق لهذا السؤال ويبقى النص العادي.", confirmLabel: "متابعة", cancelLabel: "إلغاء", tone: "danger" }))) return;
    onChange(dropRich ? { ...typeChangePatch(q, next), richContent: undefined } : typeChangePatch(q, next));
  };
  return (
    <div className="sb-composer">
      <div className="sb-composer-type">
        <select
          className="sb-input sb-input-sm"
          value={q.presentationType}
          onChange={e => { void requestTypeChange(e.target.value as BuilderQuestionType); }}
          disabled={disabled}
          aria-label="نوع السؤال"
        >
          {!currentKnown && <option value={q.presentationType}>{"غير مدعوم: " + String(q.presentationType)}</option>}
          {/* Review Fix 1 / R2-B: the LIVE canonical catalog (production types + registered plugins), never a frozen snapshot */}
          {listQuestionTypes().map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>
      {confirmDialog}

      <textarea
        className="sb-input sb-textarea"
        value={q.text ?? ""}
        placeholder={q.presentationType === "compound" ? "نص السؤال المركّب (اختياري)" : "نص السؤال"}
        onChange={e => onChange({ text: e.target.value })}
        disabled={disabled}
      />
      {q.presentationType === "parametricNumeric" && <p className="sb-hint rc-host-note">المحتوى المنسق غير متاح لأسئلة القوالب العددية: نص القالب هو المرجع الوحيد للسؤال.</p>}
      {richAllowed && (
        <div className="rc-host">
          <div className="rc-host-actions">
            <button type="button" className="sb-mini-btn" aria-expanded={richOpen} onClick={() => setRichOpen(o => !o)}>محتوى منسق للسؤال</button>
            <button type="button" className="sb-mini-btn" onClick={() => setConverting(true)} disabled={disabled || !(q.text ?? "").trim()}>تحويل النص إلى محتوى منسق</button>
            {rich !== undefined && !(q.text ?? "").trim() && <button type="button" className="sb-mini-btn" onClick={() => void applyRichAsFallback()} disabled={disabled}>استخدام نص المحتوى كنص بديل</button>}
          </div>
          {rich !== undefined && !richOpen && <p className="sb-hint rc-host-note">لهذا السؤال محتوى منسق يُعرض للطالب بدل النص العادي (يبقى النص العادي احتياطيًا وللبحث).</p>}
          {richOpen && (
            <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرر المحتوى المنسق…</p>}>
              <RichContentEditor value={rich} onChange={setRich} disabled={disabled} plainText={q.text} label="محتوى السؤال المنسق" />
            </Suspense>
          )}
          {converting && (
            <Suspense fallback={null}>
              <MarkdownConvertDialog source={q.text ?? ""} replacing={rich !== undefined} onCancel={() => setConverting(false)} onConfirm={value => { setRich(value); setRichOpen(true); setConverting(false); }} />
            </Suspense>
          )}
        </div>
      )}

      <QuestionPresentationControl value={q.presentation} onChange={presentation => onChange({ presentation })} disabled={disabled} />

      {q.presentationType === "compound"
        ? <CompoundQuestionEditor question={q} onChange={onChange} disabled={disabled} />
        : <QuestionBodyEditor node={q} type={q.presentationType} onChange={onChange} disabled={disabled} />}
    </div>
  );
}

// Phase 20D.1 — the bounded per-question presentation override («عرض السؤال»): collapsed by default, it SELECTS vocabulary values only
// (width, type variant, card, answer area). A "default" choice removes the key; an override left with no key is removed entirely. A
// malformed stored override is never rewritten silently: it is reported and can only be removed explicitly.
const QP_WORDS: Record<string, string> = {
  normal: "عادي", wide: "عريض", full: "كامل العرض", standard: "قياسي", writingPaper: "ورقة كتابة", developerWorkspace: "بيئة مطوّر", laboratory: "مساحة مختبرية",
  networkWorkspace: "مساحة عمل شبكية", storyWorkspace: "مساحة سيناريو", visualWorkspace: "مساحة بصرية", flat: "مسطّح", outlined: "بإطار", elevated: "مرتفع بظل",
  paper: "ورقي", plain: "بسيط", contained: "داخل إطار", lined: "مسطّر"
};
type QpKey = "width" | "variant" | "card" | "answerArea";
const QP_FIELDS: readonly { key: QpKey; label: string; options: readonly string[] }[] = [
  { key: "width", label: "اتساع السؤال", options: PRESENTATION_VOCABULARY.questionWidths },
  { key: "variant", label: "مساحة العرض", options: PRESENTATION_VOCABULARY.typeVariants },
  { key: "card", label: "بطاقة السؤال", options: PRESENTATION_VOCABULARY.slots.questionCard },
  { key: "answerArea", label: "منطقة الإجابة", options: PRESENTATION_VOCABULARY.slots.answerArea }
];
function QuestionPresentationControl({ value, onChange, disabled }: { value: unknown; onChange: (next: QuestionPresentationV1 | undefined) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const checked = value === undefined ? null : validateQuestionPresentation(value);
  const current = checked?.ok ? checked.value : undefined;
  const malformed = !!checked && !checked.ok;
  const pick = (key: QpKey, next: string) => {
    if (malformed) return;
    const field = QP_FIELDS.find(f => f.key === key);
    if (!field || (next && !field.options.includes(next))) return;
    const draft: Record<string, unknown> = { ...(current ?? {}), schemaVersion: 1 };
    if (next) draft[key] = next; else delete draft[key];
    if (Object.keys(draft).length === 1) { onChange(undefined); return; }
    const r = validateQuestionPresentation(draft);
    if (r.ok) onChange(r.value);
  };
  return (
    <div className="rc-host qp-host">
      <div className="rc-host-actions">
        <button type="button" className="sb-mini-btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>عرض السؤال</button>
        {value !== undefined && <button type="button" className="sb-mini-btn" onClick={() => onChange(undefined)} disabled={disabled}>إزالة تخصيص العرض</button>}
      </div>
      {!open && value !== undefined && !malformed && <p className="sb-hint rc-host-note">لهذا السؤال تخصيص عرض خاص (الشكل فقط؛ لا يؤثر في التصحيح أو العلامة).</p>}
      {malformed && <p className="sb-hint rc-host-note" role="alert">تخصيص العرض المخزّن لهذا السؤال غير صالح ويُتجاهَل عند العرض؛ أزله ثم اختر من جديد.</p>}
      {open && !malformed && (
        <div className="qp-fields" role="group" aria-label="تخصيص عرض السؤال">
          {QP_FIELDS.map(f => (
            <label key={f.key} className="sb-field">
              <span>{f.label}</span>
              <select className="sb-input sb-input-sm" value={current?.[f.key] ?? ""} onChange={e => pick(f.key, e.target.value)} disabled={disabled} aria-label={f.label}>
                <option value="">الافتراضي</option>
                {f.options.map(o => <option key={o} value={o}>{QP_WORDS[o] ?? o}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
