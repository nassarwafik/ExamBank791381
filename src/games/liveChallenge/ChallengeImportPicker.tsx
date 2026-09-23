import { useEffect, useId, useRef, useState } from "react";
import Dialog from "../../ui/Dialog";
import type { BuilderQuestion } from "../../examTypes";
import { QUESTION_TYPE_LABELS } from "../../examTypes";
import { MAX_IMPORT_BYTES } from "../../structuredExamImport";
import { formatDateLatn } from "../../student/exam/format";
import type { ChallengeQuestionSource } from "../domain/challenge";
import type { LiveChallengeClient, SourceExamListItem } from "./liveChallengeClient";
import { parseExamJsonForChallenge, questionPreviewText, JSON_IMPORT_MESSAGES, type SourceExamStatus } from "./sourceExamQuestions";

export type ImportSource = "saved" | "json";

/** The loaded, selectable questions of ONE source (a saved exam or a local JSON file). */
type Loaded = { title: string; source: ChallengeQuestionSource; questions: BuilderQuestion[]; status: SourceExamStatus; skipped: number };

const EMPTY_MESSAGE = "لا توجد أسئلة قابلة للاستيراد في هذا الامتحان.";
const UNRECOGNIZED_MESSAGE = "تعذّر التعرّف على بنية أسئلة هذا الامتحان.";

/**
 * Import questions into a challenge — ONE shared picker for both sources, built on the shared Dialog primitive
 * (role=dialog + aria-modal, focus trap, Escape/backdrop close, focus return, internal scroll with a fixed footer):
 *   • امتحان محفوظ — a saved exam from /api/saved-exams (structured OR legacy; see questionsFromSourceExam);
 *   • ملف JSON     — a local .json exam file, read and parsed IN THE BROWSER only (never uploaded or stored).
 * The teacher picks questions and presses «أضف المحدّد»; the parent then snapshots each selection immutably
 * (addImportedQuestions), so neither the saved exam nor the file stays linked to the challenge.
 */
export default function ChallengeImportPicker({ client, initialSource = "saved", onAdd, onCancel }: {
  client: LiveChallengeClient;
  initialSource?: ImportSource;
  onAdd: (items: { question: BuilderQuestion; source: ChallengeQuestionSource }[]) => void;
  onCancel: () => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [source, setSource] = useState<ImportSource>(initialSource);
  const [exams, setExams] = useState<SourceExamListItem[] | null>(null);
  const [listError, setListError] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // The saved-exam list is read once, when that source is first shown.
  useEffect(() => {
    if (source !== "saved" || exams !== null) return;
    let off = false;
    (async () => {
      try { const list = await client.listSourceExams(); if (!off) setExams(list); }
      catch { if (!off) { setExams([]); setListError("تعذّر تحميل قائمة الامتحانات."); } }
    })();
    return () => { off = true; };
  }, [client, source, exams]);

  // Each step change (source switch, exam opened, file parsed, back) moves focus to that step's heading. The first
  // step is focused by the Dialog itself (initialFocusRef).
  const stepKey = source + ":" + (loaded ? "select" : "choose");
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    stepHeadingRef.current?.focus();
  }, [stepKey]);

  // Request generation: every reset (source switch, back, a newer exam/file load) and unmount advances it, so an
  // older in-flight load finds itself stale and does nothing — it can never overwrite a newer source, request or
  // loading state. Only the current request calls setLoaded / setError / the final setLoading(false).
  const requestRef = useRef(0);
  useEffect(() => () => { requestRef.current++; }, []);

  const reset = () => { const v = ++requestRef.current; setLoaded(null); setChecked(new Set()); setError(""); setLoading(false); return v; };
  const switchSource = (next: ImportSource) => { if (next !== source) { reset(); setSource(next); } };

  const openExam = async (exam: SourceExamListItem) => {
    const req = reset(); setLoading(true);
    const current = () => req === requestRef.current;
    try {
      const src = await client.loadSourceQuestions(exam.blobName);
      if (!current()) return;
      const questions = Array.isArray(src.questions) ? src.questions : [];
      const title = src.title || exam.title || exam.examId;
      setLoaded({
        title, questions,
        status: src.status ?? (questions.length ? "ok" : "empty"),
        skipped: src.skipped ?? 0,
        source: { kind: "exam", sourceId: exam.examId, sourceTitle: title },
      });
    } catch { if (current()) setError("تعذّر تحميل أسئلة الامتحان."); }
    finally { if (current()) setLoading(false); }
  };

  const readFile = async (file: File | undefined) => {
    const req = reset();
    const current = () => req === requestRef.current;
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setError(JSON_IMPORT_MESSAGES.tooLarge); return; }
    setLoading(true);
    try {
      const text = await file.text();
      if (!current()) return;
      const r = parseExamJsonForChallenge(text, file.name);   // local, data-only parse — nothing is uploaded
      if (!r.ok) { setError(r.error); return; }
      setLoaded({
        title: r.title, questions: r.questions, status: "ok", skipped: r.skipped,
        source: { kind: "exam", sourceId: r.sourceId, sourceTitle: r.title + " (ملف JSON)" },
      });
    } catch { if (current()) setError(JSON_IMPORT_MESSAGES.malformed); }
    finally { if (current()) setLoading(false); }
  };

  const total = loaded?.questions.length ?? 0;
  const toggle = (i: number) => setChecked(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const selectAll = () => setChecked(new Set(loaded ? loaded.questions.map((_, i) => i) : []));
  const addSelected = () => {
    if (!loaded || checked.size === 0) return;
    onAdd(loaded.questions.filter((_, i) => checked.has(i)).map(question => ({ question, source: loaded.source })));
  };

  const descId = "eb-lc-import-desc-" + uid;
  const fileInputId = "eb-lc-import-file-" + uid;
  const fileHintId = "eb-lc-import-file-hint-" + uid;

  return (
    <Dialog
      open
      title="استيراد أسئلة"
      onClose={onCancel}
      size="lg"
      className="eb-lc-import"
      describedBy={descId}
      initialFocusRef={stepHeadingRef}
      footer={
        <div className="eb-lc-import-foot">
          <button type="button" className="eb-button is-quiet" onClick={onCancel}>إلغاء</button>
          <button type="button" className="eb-button is-primary eb-lc-import-add" disabled={checked.size === 0} onClick={addSelected}>
            أضف المحدّد ({checked.size})
          </button>
        </div>
      }
    >
      <p id={descId} className="eb-lc-import-desc">اختر المصدر ثم حدّد الأسئلة التي تريد إضافتها.</p>

      <div className="eb-lc-srcswitch" role="group" aria-label="مصدر الاستيراد">
        <button type="button" className="eb-lc-srcswitch-btn" aria-pressed={source === "saved"} onClick={() => switchSource("saved")}>امتحان محفوظ</button>
        <button type="button" className="eb-lc-srcswitch-btn" aria-pressed={source === "json"} onClick={() => switchSource("json")}>ملف JSON</button>
      </div>

      {error && <div className="platform-error eb-lc-import-error" role="alert">{error}</div>}
      {loading && <p className="eb-muted" role="status">جارٍ التحميل…</p>}

      {!loaded && source === "saved" && (
        <div className="eb-lc-import-step">
          <h3 ref={stepHeadingRef} tabIndex={-1} className="eb-lc-import-step-title">اختر امتحانًا محفوظًا</h3>
          {listError && <div className="platform-error" role="alert">{listError}</div>}
          {exams === null && <p className="eb-muted" role="status">جارٍ تحميل الامتحانات…</p>}
          {exams !== null && exams.length === 0 && !listError && <p className="eb-muted">لا توجد امتحانات محفوظة بعد.</p>}
          {exams !== null && exams.length > 0 && (
            <ul className="eb-lc-exams" aria-label="الامتحانات المحفوظة">
              {exams.map(ex => (
                <li key={ex.blobName}>
                  <button type="button" className="eb-lc-exam-card" onClick={() => openExam(ex)}>
                    <span className="eb-lc-exam-title">{ex.title || ex.examId}</span>
                    <span className="eb-lc-exam-meta">
                      {typeof ex.questionCount === "number" && <span className="eb-lc-exam-count">{ex.questionCount} سؤال</span>}
                      {typeof ex.totalMarks === "number" && ex.totalMarks > 0 && <span>{ex.totalMarks} علامة</span>}
                      {formatDateLatn(ex.savedAt) && <span dir="ltr">{formatDateLatn(ex.savedAt)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loaded && source === "json" && (
        <div className="eb-lc-import-step">
          <h3 ref={stepHeadingRef} tabIndex={-1} className="eb-lc-import-step-title">اختر ملف JSON من جهازك</h3>
          <label className="eb-lc-file" htmlFor={fileInputId}>
            <span className="eb-lc-file-label">ملف الامتحان (JSON)</span>
            <input
              id={fileInputId}
              className="eb-lc-file-input"
              type="file"
              accept=".json,application/json"
              aria-describedby={fileHintId}
              onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void readFile(f); }}
            />
          </label>
          <p id={fileHintId} className="eb-lc-file-hint">
            يُقرأ الملف على جهازك فقط ولا يُرفع أو يُحفظ. الصيغ المدعومة: امتحان منظّم، امتحان قديم، أو ملف امتحان محفوظ. الحد الأقصى {Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} ميغابايت.
          </p>
        </div>
      )}

      {loaded && (
        <div className="eb-lc-import-step eb-lc-select">
          <div className="eb-lc-select-head">
            <button type="button" className="eb-button is-quiet is-small eb-lc-select-back" onClick={reset}>
              {source === "saved" ? "◄ كل الامتحانات" : "◄ اختيار ملف آخر"}
            </button>
            <h3 ref={stepHeadingRef} tabIndex={-1} className="eb-lc-import-step-title eb-lc-select-title">{loaded.title}</h3>
            <span className="eb-lc-select-total">{total} سؤال</span>
          </div>

          {loaded.status === "empty" && <p className="eb-lc-select-empty" role="status">{EMPTY_MESSAGE}</p>}
          {loaded.status === "unrecognized" && <p className="eb-lc-select-empty is-warning" role="alert">{UNRECOGNIZED_MESSAGE}</p>}
          {loaded.skipped > 0 && loaded.status === "ok" && (
            <p className="eb-lc-select-note" role="note">تم تجاهل {loaded.skipped} من العناصر لأنها ليست أسئلة بصيغة مدعومة.</p>
          )}

          {total > 0 && (
            <>
              <div className="eb-lc-select-tools">
                <button type="button" className="eb-button is-small" onClick={selectAll} disabled={checked.size === total}>تحديد الكل</button>
                {checked.size > 0 && <button type="button" className="eb-button is-quiet is-small" onClick={() => setChecked(new Set())}>إلغاء تحديد الكل</button>}
                <span className="eb-lc-select-count" aria-live="polite">المحدّد: {checked.size} من {total}</span>
              </div>
              <ul className="eb-lc-qpick" aria-label="أسئلة المصدر">
                {loaded.questions.map((q, i) => {
                  const text = questionPreviewText(q);
                  return (
                    <li key={i}>
                      <label className={"eb-lc-qpick-item" + (checked.has(i) ? " is-checked" : "")}>
                        <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                        <span className="eb-lc-qpick-num" aria-hidden="true">{q.displayNumber || i + 1}</span>
                        <span className="eb-lc-qpick-body">
                          <span className="eb-lc-qpick-type">{QUESTION_TYPE_LABELS[q.presentationType]}</span>
                          <span className="eb-lc-qpick-text">{text || "(سؤال بدون نص)"}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
