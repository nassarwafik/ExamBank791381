import { lazy, Suspense, useMemo, useRef } from "react";
import Dialog from "../ui/Dialog";
import { markdownToRichContent } from "./markdownToRichContent";
import type { RichContentV1 } from "./richContentModel";
import "./rich-content-editor.css";

// Phase 20D.1 — the explicit "plain text → rich content" conversion (builder only, lazy). The SAFE Markdown converter runs on the host's
// current plain text; the teacher sees a PREVIEW through the trusted renderer plus every warning (HTML dropped, images not loaded, links
// reduced to text, unsupported math kept as text) and nothing is written until "اعتماد المحتوى المنسق". The plain text is never touched.
const RichContentRenderer = lazy(() => import("./RichContentRenderer"));

type Props = {
  source: string;
  /** True when the host already carries rich content (confirming replaces it). */
  replacing?: boolean;
  title?: string;
  onConfirm: (value: RichContentV1) => void;
  onCancel: () => void;
};

export default function MarkdownConvertDialog({ source, replacing, title, onConfirm, onCancel }: Props) {
  const result = useMemo(() => markdownToRichContent(source), [source]);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const value = result.ok ? result.value : undefined;
  return (
    <Dialog
      open
      size="lg"
      title={title || "تحويل النص إلى محتوى منسق"}
      onClose={onCancel}
      initialFocusRef={cancelRef}
      className="rc-convert-dialog"
      footer={
        <>
          <button ref={cancelRef} type="button" className="eb-button" onClick={onCancel}>إلغاء</button>
          <button type="button" className="eb-button is-primary" disabled={!value} onClick={() => { if (value) onConfirm(value); }}>اعتماد المحتوى المنسق</button>
        </>
      }
    >
      <p className="rc-host-note">يُحوَّل النص (صيغة Markdown آمنة: عناوين، فقرات، **غامق**، *مائل*، `كود`، قوائم، اقتباس، فاصل، كود، جداول) إلى كتل منسقة. يبقى النص العادي كما هو كنص احتياطي وللبحث.</p>
      {replacing && <p className="rc-host-note"><strong>تنبيه:</strong> سيستبدل هذا المحتوى المنسق الحالي.</p>}
      {result.warnings.length > 0 && <ul className="rc-convert-warnings" data-testid="rc-convert-warnings">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      {value
        ? (
          <section className="rc-convert-preview" aria-label="معاينة التحويل" data-testid="rc-convert-preview">
            <Suspense fallback={<p className="rc-host-note" role="status">جارٍ تحميل المعاينة…</p>}><div className="xp-rich"><RichContentRenderer content={value} /></div></Suspense>
          </section>
        )
        : <p className="rc-host-note" role="status">لا يوجد محتوى صالح للتحويل.</p>}
    </Dialog>
  );
}
