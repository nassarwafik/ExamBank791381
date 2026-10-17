import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react";
import { IconClose } from "../../icons";
import useFocusTrap from "../../ui/useFocusTrap";
import { NOTE_MAX, QUOTE_MAX, QUOTE_MIN } from "./annotationsClient";
import type { ReaderAnnotationsApi } from "./useReaderAnnotations";
import "./annotations.css";

// Phase L.5 — the Reader's PRIVATE annotations for a student: the «ملاحظاتي» panel and the selection chip that highlights a
// passage (the state hook and the highlight painter live in useReaderAnnotations.ts). Everything here is mounted only when the
// host hands the Reader an annotations client (the student portal); a teacher preview has none.

/** The selected passage inside the page article, collapsed as the server stores it, with where to show the chip. */
function readSelection(contentRoot: HTMLElement | null): { quote: string; top: number; left: number } | null {
  const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
  const article = contentRoot?.querySelector(".learning-reader-page");
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !article) return null;
  if (!sel.anchorNode || !sel.focusNode || !article.contains(sel.anchorNode) || !article.contains(sel.focusNode)) return null;
  const quote = sel.toString().replace(/\s+/g, " ").trim();
  if (!quote) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect?.();
  const top = rect ? Math.min(Math.max(rect.bottom + 8, 8), window.innerHeight - 56) : 8;
  const left = rect ? Math.min(Math.max(rect.left + rect.width / 2, 72), window.innerWidth - 72) : 72;
  return { quote, top, left };
}

/**
 * «تظليل» — appears under a passage the student selects in the page text. Pressing it never steals the selection
 * (pointerdown is prevented), so it works with a mouse, a pen and a finger alike.
 */
export function HighlightChip({ contentRef, pageId, api }: { contentRef: RefObject<HTMLElement | null>; pageId: string; api: ReaderAnnotationsApi }) {
  const [sel, setSel] = useState<{ quote: string; top: number; left: number } | null>(null);
  useEffect(() => {
    const onChange = () => setSel(readSelection(contentRef.current));
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [contentRef]);
  if (!sel || api.state.status !== "ready") return null;
  const tooLong = sel.quote.length > QUOTE_MAX, tooShort = sel.quote.length < QUOTE_MIN;
  const already = api.state.data.highlights.some(h => h.pageId === pageId && h.quote === sel.quote);
  const style = { "--eb-hl-chip-top": sel.top + "px", "--eb-hl-chip-left": sel.left + "px" } as CSSProperties;
  return (
    <div className="learning-reader-hl-chip" style={style} role="group" aria-label="المقطع المحدد">
      {tooLong ? (
        <span className="learning-reader-hl-chip-note">حدّد مقطعًا أقصر (حتى {QUOTE_MAX} حرف)</span>
      ) : (
        <button
          type="button"
          className="eb-button is-small is-primary"
          disabled={api.busy || tooShort || already}
          onPointerDown={e => e.preventDefault()}
          onMouseDown={e => e.preventDefault()}
          onClick={async () => { await api.highlight(pageId, sel.quote); window.getSelection()?.removeAllRanges(); setSel(null); }}
        >
          {already ? "مظلّل" : "تظليل"}
        </button>
      )}
    </div>
  );
}

/** «ملاحظاتي»: this page's note and highlights, then every bookmark, note and highlight in the book (each opens its page). */
export function AnnotationsPanel({ api, pageId, pageTitle, titleOf, onOpenPage, onClose }: {
  api: ReaderAnnotationsApi;
  pageId: string;
  pageTitle: string;
  /** The title of a page of THIS reader's book, or null when it is not openable here. */
  titleOf: (pageId: string) => string | null;
  /** Opens the page and closes the panel (the Reader moves focus to the page title). */
  onOpenPage: (pageId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useFocusTrap(ref, true, onClose);
  const data = api.state.status === "ready" ? api.state.data : null;
  const note = data?.notes.find(n => n.pageId === pageId)?.text ?? "";
  const pageHighlights = data?.highlights.filter(h => h.pageId === pageId) ?? [];
  return (
    <div className="learning-reader-search-root">
      <div className="learning-reader-search-backdrop" aria-hidden="true" onClick={onClose} />
      <div ref={ref} className="learning-reader-search learning-reader-notes" role="dialog" aria-modal="true" aria-labelledby={uid + "-title"}>
        <div className="learning-reader-search-head">
          <h2 id={uid + "-title"} className="learning-reader-search-title">ملاحظاتي</h2>
          <button type="button" className="eb-button is-quiet is-small" onClick={onClose}><IconClose size={18} aria-hidden="true" />إغلاق</button>
        </div>
        <p className="learning-reader-notes-private">ملاحظاتك وعلاماتك والتظليل خاصة بك وحدك: لا يراها المعلم ولا الطلاب الآخرون.</p>
        {api.state.status === "loading" && <p className="learning-reader-status" role="status">جارٍ تحميل ملاحظاتك…</p>}
        {api.state.status === "error" && (
          <div className="learning-reader-notes-error" role="alert">
            <span>تعذّر تحميل ملاحظاتك الآن.</span>
            <button type="button" className="eb-button is-small" onClick={api.retry}>إعادة المحاولة</button>
          </div>
        )}
        {api.notice && <p className="learning-reader-notes-notice" role="status">{api.notice}</p>}
        {api.error && <p className="learning-reader-notes-error" role="alert">{api.error}</p>}
        {data && (
          <>
            <section className="learning-reader-notes-section" aria-labelledby={uid + "-here"}>
              <h3 id={uid + "-here"}>هذه الصفحة: {pageTitle}</h3>
              <NoteEditor key={pageId + "\u0000" + note} initial={note} busy={api.busy} onSave={text => api.saveNote(pageId, text)} />
              {pageHighlights.length > 0 && (
                <ul className="learning-reader-notes-list" aria-label="المقاطع المظلّلة في هذه الصفحة">
                  {pageHighlights.map(h => (
                    <li key={h.id}>
                      <q className="learning-reader-notes-quote">{h.quote}</q>
                      <button type="button" className="eb-button is-quiet is-small" disabled={api.busy} onClick={() => { void api.unhighlight(pageId, h.id); }} aria-label={"إزالة تظليل «" + h.quote.slice(0, 40) + "»"}>إزالة التظليل</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <BookList title="علاماتي المرجعية" empty="لم تضع علامة مرجعية بعد. استخدم «علامة مرجعية» في شريط القارئ." items={data.bookmarks.map(b => ({ key: b.pageId, pageId: b.pageId }))} titleOf={titleOf} onOpen={onOpenPage} />
            <BookList title="ملاحظاتي في الكتاب" empty="لا ملاحظات بعد." items={data.notes.map(n => ({ key: n.pageId, pageId: n.pageId, detail: n.text }))} titleOf={titleOf} onOpen={onOpenPage} />
            <BookList title="النصوص المظلّلة" empty="حدّد نصًّا في الصفحة ثم اختر «تظليل»." items={data.highlights.map(h => ({ key: h.id, pageId: h.pageId, detail: "«" + h.quote + "»" }))} titleOf={titleOf} onOpen={onOpenPage} />
          </>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(initial);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const over = draft.length > NOTE_MAX;
  const changed = draft.trim() !== initial.trim();
  return (
    <form className="learning-reader-note" onSubmit={e => { e.preventDefault(); if (!over && changed) void onSave(draft); }}>
      <label htmlFor={uid + "-text"}>ملاحظتي على هذه الصفحة</label>
      <textarea id={uid + "-text"} rows={4} value={draft} onChange={e => setDraft(e.target.value)} aria-describedby={uid + "-count"} aria-invalid={over || undefined} />
      <div className="learning-reader-note-foot">
        <span id={uid + "-count"} className={over ? "learning-reader-note-count is-over" : "learning-reader-note-count"}>{draft.length} / {NOTE_MAX}</span>
        {initial && <button type="button" className="eb-button is-quiet is-small" disabled={busy} onClick={() => { void onSave(""); }}>حذف الملاحظة</button>}
        <button type="submit" className="eb-button is-small is-primary" disabled={busy || over || !changed}>حفظ الملاحظة</button>
      </div>
    </form>
  );
}

function BookList({ title, empty, items, titleOf, onOpen }: { title: string; empty: string; items: { key: string; pageId: string; detail?: string }[]; titleOf: (pageId: string) => string | null; onOpen: (pageId: string) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const openable = items.filter(i => titleOf(i.pageId) !== null);
  return (
    <section className="learning-reader-notes-section" aria-labelledby={uid}>
      <h3 id={uid}>{title} <span className="eb-section-count">{openable.length}</span></h3>
      {openable.length === 0 ? <p className="eb-muted">{empty}</p> : (
        <ul className="learning-reader-notes-list">
          {openable.map(i => (
            <li key={i.key}>
              <button type="button" className="learning-reader-notes-open" onClick={() => onOpen(i.pageId)}>
                <span className="learning-reader-notes-page">{titleOf(i.pageId)}</span>
                {i.detail && <span className="learning-reader-notes-detail">{i.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
