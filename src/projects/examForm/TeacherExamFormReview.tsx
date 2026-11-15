// Phase F3-UI — the teacher reviews ONE student's project exam form: the answers section by section (read-only), which
// auto-marked questions are right with their key, a level on the rubric and a note per section, then one of: save the
// ratings, return the form for correction, approve it (the server computes the mark then) or take an approval back.
// Everything shown here is presentation: the server decides who may rate, what a valid level is and what the mark is.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackerGet, trackerGetBlob, trackerPost } from "../api";
import { isStaleEdit } from "../../teacherFetch";
import StatusBadge from "../../ui/StatusBadge";
import { IconChevronBack } from "../../icons";
import { useConfirm } from "../../ui/useConfirm";
import { SAVE_STATE_LABELS } from "../../teacher/saveLabels";
import QuestionInput from "./QuestionInput";
import { ExamFormImageList, type ExamFormImageReader } from "./ExamFormImages";
import { ExamFormFileLine, type ExamFormFileReader } from "./ExamFormFile";
import ExamFormPrintButton from "./ExamFormPrintButton";
import { printDate, type PrintRating } from "./examFormPrint";
import { STATUS_BADGE, entryText, type SectionRating, type TeacherFormView, type TeacherQuestion, type TeacherSection } from "./teacherTypes";

type Props = {
  token: string; projectCode: string; classId: string; studentId: string;
  /** An archived class, or a teacher without the manage capability: the form is shown, nothing can be changed. */
  readOnly?: boolean;
  onClose: () => void;
};

type DraftRating = { level: number | null; note: string };
type Draft = Record<string, DraftRating>;
const NOTE_MAX = 1000;
const noop = () => {};

const draftOf = (view: TeacherFormView): Draft =>
  Object.fromEntries(view.form.sections.map(s => [s.sectionId, { level: view.review.ratings[s.sectionId]?.level ?? null, note: view.review.ratings[s.sectionId]?.note ?? "" }]));

// What a save must send: only the sections whose level or note differ from what the server stores (null clears one).
function patchOf(view: TeacherFormView, draft: Draft): Record<string, SectionRating | null> {
  const patch: Record<string, SectionRating | null> = {};
  for (const section of view.form.sections) {
    const stored = view.review.ratings[section.sectionId];
    const local = draft[section.sectionId];
    if (!local) continue;
    if (local.level === null) { if (stored) patch[section.sectionId] = null; continue; }
    const note = local.note.trim();
    if (!stored || stored.level !== local.level || (stored.note || "") !== note) patch[section.sectionId] = note ? { level: local.level, note } : { level: local.level };
  }
  return patch;
}

// The mark the ratings give (the server computes the real one at the approval): Σ weight × level / top level.
function previewMark(sections: TeacherSection[], level: (sectionId: string) => number | null, top: number): number | null {
  let total = 0;
  for (const s of sections) {
    if (s.weight <= 0) continue;
    const value = level(s.sectionId);
    if (value === null) return null;
    total += Math.round((s.weight * value * 100) / top) / 100;
  }
  return Math.round(total * 100) / 100;
}

function keyText(q: TeacherQuestion): string {
  const key = q.answer;
  if (!key) return "";
  if (q.kind === "choice" && key.correctOptionId) return entryText(q.options, key.correctOptionId);
  if (q.kind === "multiChoice" && key.correctOptionIds) return key.correctOptionIds.map(id => entryText(q.options, id)).join("، ");
  if (q.kind === "matching" && key.pairs) { const pairs = key.pairs; return (q.left || []).map(l => l.text + " ← " + entryText(q.right, pairs[l.id])).join("؛ "); }
  if (q.kind === "ordering" && key.order) return key.order.map((id, i) => (i + 1) + ". " + entryText(q.items, id)).join("؛ ");
  return "";
}

function AnswerBlock({ question, view, readImage, readFile }: { question: TeacherQuestion; view: TeacherFormView; readImage: ExamFormImageReader; readFile: ExamFormFileReader }) {
  const answer = view.answers[question.questionId];
  const verdict = question.grading === "auto" ? view.auto.byQuestion[question.questionId] : undefined;
  const key = question.grading === "auto" ? keyText(question) : "";
  // Phase F4 lets a class attach images to its answers. The review says how many a question has and (F4-UI) shows them,
  // read with the teacher's session through the class's own route; a question with none is checked from the book.
  const attached = answer && Array.isArray(answer.images) ? answer.images : [];
  const images = attached.length;
  // Phase F5-UI — the file a student attached to a file question: its name, its size and a download read with the teacher's
  // session through the class's own route. The file is never shown in the page.
  const file = answer && answer.file && typeof answer.file.id === "string" ? answer.file : undefined;
  return (
    <div className="eb-sp-form-question-body">
      {file
        ? <>
          <p className="eb-sp-form-deferred" data-file={file.id}>أرفق الطالب ملفًا لهذا السؤال. نزّله وافتحه على جهازك كأي ملف يصلك من طالب.</p>
          <ExamFormFileLine file={file} read={readFile} />
        </>
        : null}
      {images > 0
        ? <>
          <p className="eb-sp-form-deferred" data-images={images}>أرفق الطالب صورًا لهذا السؤال (العدد: <span dir="ltr">{images}</span>).</p>
          <ExamFormImageList images={attached} read={readImage} />
        </>
        : null}
      {question.kind === "image" || question.kind === "file"
        ? (images > 0 || file ? null : <p className="eb-sp-form-deferred">{question.kind === "image" ? "سؤال صورة" : "سؤال ملف"}: يُفحص من كتاب الطالب وملف مشروعه.</p>)
        : !answer
          ? <p className="eb-sp-form-deferred">لم يُجب الطالب عن هذا السؤال.</p>
          : <QuestionInput question={question} answer={answer} disabled onChange={noop} />}
      {verdict !== undefined && (
        <p className="eb-project-form-verdict" data-verdict={verdict === null ? "none" : verdict ? "right" : "wrong"}>
          <StatusBadge tone={verdict === null ? "neutral" : verdict ? "success" : "danger"}>{verdict === null ? "بلا إجابة" : verdict ? "إجابة صحيحة" : "إجابة خاطئة"}</StatusBadge>
          {key && <span className="eb-project-form-key"> الإجابة الصحيحة: <span dir="auto">{key}</span></span>}
        </p>
      )}
    </div>
  );
}

export default function TeacherExamFormReview({ token, projectCode, classId, studentId, readOnly = false, onClose }: Props) {
  const [view, setView] = useState<TeacherFormView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [generalNote, setGeneralNote] = useState("");
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showUnrated, setShowUnrated] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const { confirm, confirmDialog } = useConfirm();
  const seq = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Adopts a view from the server: the page's ratings become the stored ones.
  const adopt = useCallback((next: TeacherFormView) => {
    setView(next); setDraft(draftOf(next)); setGeneralNote(next.review.generalNote || "");
  }, []);

  // Phase F4-UI — one of this student's attached images, through the class's own route (capability, tenancy, membership
  // and the reference are the server's checks). Stable, so a thumbnail is read once.
  const readImage = useCallback<ExamFormImageReader>(imageId => trackerGetBlob(token, projectCode, "exam-form-image", { classId, studentId, imageId }), [token, projectCode, classId, studentId]);

  // Phase F5-UI — the file of one of this student's file questions, through the class's own route (the same checks).
  const readFile = useCallback<ExamFormFileReader>(fileId => trackerGetBlob(token, projectCode, "exam-form-file", { classId, studentId, fileId }, "تعذر تنزيل الملف."), [token, projectCode, classId, studentId]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const r = await trackerGet<TeacherFormView>(token, projectCode, "exam-form-student", { classId, studentId });
      if (mine === seq.current) { adopt(r); setLoadError(""); }
    } catch (e) {
      if (mine === seq.current) setLoadError(e instanceof Error ? e.message : "تعذر تحميل الاستمارة.");
    }
  }, [token, projectCode, classId, studentId, adopt]);

  useEffect(() => {
    let live = true;
    queueMicrotask(() => { if (live) void load(); });
    return () => { live = false; seq.current += 1; };
  }, [load]);

  const patch = useMemo(() => (view ? patchOf(view, draft) : {}), [view, draft]);
  const noteChanged = !!view && generalNote.trim() !== (view.review.generalNote || "");
  const unsaved = Object.keys(patch).length > 0 || noteChanged;

  async function leave() {
    if (unsaved && !(await confirm({ title: "تقديرات غير محفوظة", message: "لديك تقديرات أو ملاحظات لم تُحفظ. هل تخرج دون حفظها؟", confirmLabel: "خروج دون حفظ", tone: "danger" }))) return;
    onClose();
  }
  const back = (
    <button type="button" className="eb-button is-quiet eb-sp-form-back" onClick={() => void leave()}>
      <IconChevronBack size={16} aria-hidden="true" />العودة إلى قائمة الطلاب
    </button>
  );

  if (!view) {
    return (
      <section className="eb-sp-form eb-project-form-review">
        {back}
        {loadError
          ? <div className="platform-error assignment-inline-message" role="alert">{loadError} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>
          : <p className="eb-muted" role="status">جارٍ تحميل الاستمارة...</p>}
        {confirmDialog}
      </section>
    );
  }

  const sections = view.form.sections;
  const levels = view.form.rubric.levels;
  const top = levels.length - 1;
  const index = Math.min(current, sections.length - 1);
  const section = sections[index];
  const locked = readOnly || view.readOnly === true;
  const editable = !locked && view.status === "submitted";
  const badge = STATUS_BADGE[view.status];
  const name = view.student.displayName || view.student.studentId;
  const sectionTitle = (id: string) => sections.find(s => s.sectionId === id)?.title || id;
  const mark = previewMark(sections, id => draft[id]?.level ?? null, top);
  const local = draft[section.sectionId] || { level: null, note: "" };

  function go(next: number) {
    setCurrent(next);
    queueMicrotask(() => { const h = headingRef.current; if (h) { if (typeof h.scrollIntoView === "function") h.scrollIntoView({ block: "start" }); h.focus({ preventScroll: true }); } });
  }
  const setRating = (sectionId: string, change: Partial<DraftRating>) =>
    setDraft(d => ({ ...d, [sectionId]: { ...(d[sectionId] || { level: null, note: "" }), ...change } }));

  // One write to the server. A stale page (the student submitted again, or the form was rated from another page) reads the
  // form again: what the server stores now is shown, and ONLY the sections changed on this page keep what was typed here —
  // a rating saved from elsewhere is never cleared by this page's older copy. The teacher checks and saves again.
  async function write(from: TeacherFormView, body: Record<string, unknown>, fallback: string): Promise<TeacherFormView | null> {
    try {
      return await trackerPost<TeacherFormView>(token, projectCode, { classId, studentId, ...body });
    } catch (e) {
      if (!isStaleEdit(e, "REVIEW_STALE")) { setError(e instanceof Error ? e.message : fallback); return null; }
      const mineIds = new Set([...Object.keys(patchOf(from, draft)), ...Object.entries(draft).filter(([, v]) => v.level === null && v.note.trim() !== "").map(([id]) => id)]);
      const keepNote = generalNote.trim() !== (from.review.generalNote || "");
      const mine = ++seq.current;
      try {
        const fresh = await trackerGet<TeacherFormView>(token, projectCode, "exam-form-student", { classId, studentId });
        if (mine !== seq.current) return null;
        const next = draftOf(fresh);
        for (const id of mineIds) if (next[id] && draft[id]) next[id] = draft[id];
        setView(fresh); setDraft(next);
        if (!keepNote) setGeneralNote(fresh.review.generalNote || "");
        setError("تغيّرت الاستمارة منذ فتحتها. حُمّلت النسخة الأخيرة وبقيت تقديراتك غير المحفوظة؛ راجعها ثم احفظ من جديد.");
      } catch (again) {
        setError(again instanceof Error ? again.message : fallback);
      }
      return null;
    }
  }

  // Saves what changed. Returns the stored view, or null when the save failed. Nothing to save → the current view.
  async function saveRatings(from: TeacherFormView): Promise<TeacherFormView | null> {
    const ratings = patchOf(from, draft);
    const note = generalNote.trim() !== (from.review.generalNote || "");
    if (!Object.keys(ratings).length && !note) return from;
    const r = await write(from, { action: "examForm.review", expectedRevision: from.revision, ratings, ...(note ? { generalNote: generalNote.trim() } : {}) }, "تعذر حفظ التقديرات.");
    if (!r) return null;
    // A note typed for a section that has no level yet cannot be stored; it stays on the page.
    const next = draftOf(r);
    for (const [id, value] of Object.entries(draft)) if (value.level === null && value.note && next[id]) next[id] = { level: null, note: value.note };
    setView(r); setDraft(next); setGeneralNote(r.review.generalNote || "");
    return r;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice(""); setError(""); setShowUnrated(false);
    try { await action(); } finally { setBusy(false); }
  }

  const onSave = () => run(async () => {
    if (await saveRatings(view)) setNotice("حُفظت التقديرات. لا يراها الطالب قبل الاعتماد.");
  });

  const onApprove = () => run(async () => {
    const stored = await saveRatings(view);
    if (!stored) return;
    if (stored.unrated.length) { setShowUnrated(true); return; }
    const final = previewMark(stored.form.sections, id => stored.review.ratings[id]?.level ?? null, top);
    if (!(await confirm({ title: "اعتماد الاستمارة", confirmLabel: "اعتماد",
      message: "العلامة " + (final ?? "—") + " من 100.\nبعد الاعتماد يرى الطالب العلامة وتقدير كل قسم وملاحظاتك، ولا يستطيع تعديل إجاباته." }))) return;
    const r = await write(stored, { action: "examForm.approve", expectedRevision: stored.revision }, "تعذر اعتماد الاستمارة.");
    if (r) { adopt(r); setNotice("اعتُمدت الاستمارة. العلامة " + (r.result ? r.result.mark : "") + " من 100."); }
  });

  const onReturn = () => run(async () => {
    const stored = await saveRatings(view);
    if (!stored) return;
    const r = await write(stored, { action: "examForm.return", expectedRevision: stored.revision, note: returnNote.trim() }, "تعذر إعادة الاستمارة.");
    if (r) { adopt(r); setReturning(false); setReturnNote(""); setNotice("أُعيدت الاستمارة إلى الطالب ليعدّلها ويسلّمها من جديد."); }
  });

  const onUnapprove = () => run(async () => {
    if (!(await confirm({ title: "إلغاء اعتماد الاستمارة", confirmLabel: "إلغاء الاعتماد", tone: "danger",
      message: "لن يرى الطالب العلامة حتى تعتمد الاستمارة من جديد. تقديراتك تبقى كما هي ويمكنك تعديلها." }))) return;
    const r = await write(view, { action: "examForm.unapprove", expectedRevision: view.revision }, "تعذر إلغاء الاعتماد.");
    if (r) { adopt(r); setNotice("أُلغي الاعتماد. الاستمارة «سُلّمت» من جديد."); }
  });

  // Phase F5 (PDF) — the teacher's copy: the answers, right / wrong per auto-marked question, the STORED ratings and notes
  // and the mark of an approved form. Never a key (the print module does not read one). Unsaved ratings are saved first.
  function printCopy() {
    if (unsaved) return "احفظ التقديرات أولًا لتظهر في ملف الطباعة.";
    const stored = view!.review.ratings;
    const ratings: Record<string, PrintRating> = {};
    for (const s of sections) {
      const r = stored[s.sectionId];
      if (!r || !Number.isInteger(r.level) || !levels[r.level]) continue;
      ratings[s.sectionId] = { level: r.level, topLevel: top, label: levels[r.level].label, note: r.note || "", weight: s.weight, points: Math.round((s.weight * r.level * 100) / top) / 100 };
    }
    const meta: [string, string][] = [
      ["الإجابات", view!.progress.answered + " من " + view!.progress.total],
      ["الأسئلة الآلية", view!.auto.correct + " صحيحة من " + view!.auto.total]
    ];
    if (view!.submittedAt && view!.status !== "draft") meta.push(["تاريخ التسليم", printDate(view!.submittedAt)]);
    if (view!.result && view!.approvedAt) meta.push(["تاريخ الاعتماد", printDate(view!.approvedAt)]);
    return {
      audience: "teacher" as const, formTitle: view!.form.title, projectCode: view!.form.projectCode, studentName: name, statusText: badge.text, meta,
      sections, answers: view!.answers, verdicts: view!.auto.byQuestion, ratings,
      ratingsNote: view!.result ? "" : (Object.keys(ratings).length ? "تقديرات المعلم المحفوظة — لم تُعتمد بعد، ولا يراها الطالب." : ""),
      generalNote: view!.review.generalNote || "",
      ...(view!.result ? { mark: { mark: view!.result.mark, outOf: view!.result.outOf } } : {})
    };
  }

  const why = locked ? "العرض فقط: لا يمكن تغيير التقديرات في هذا الصف."
    : view.status === "approved" ? "الاستمارة معتمدة. ألغِ الاعتماد لتعديل التقديرات."
      : view.status === "returned" ? "الاستمارة عند الطالب للتعديل. تُقدَّر بعد أن يسلّمها من جديد."
        : view.status !== "submitted" ? "لم يسلّم الطالب الاستمارة بعد. لا تُقدَّر ولا تُعتمد قبل التسليم." : "";

  return (
    <section className="eb-sp-form eb-project-form-review" aria-labelledby="eb-project-form-review-title" data-testid="exam-form-review">
      {back}
      <header className="eb-sp-form-head">
        <h3 id="eb-project-form-review-title" className="eb-subheading">استمارة {name}</h3>
        <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>
        {unsaved && <span className="eb-project-form-unsaved" role="status">{SAVE_STATE_LABELS.dirty}</span>}
        <ExamFormPrintButton prepare={printCopy} readImage={readImage} />
      </header>
      <p className="eb-project-form-facts">
        أجاب عن <span dir="ltr">{view.progress.answered}</span> من <span dir="ltr">{view.progress.total}</span> ·
        الأسئلة الآلية: <span dir="ltr">{view.auto.correct}</span> صحيحة من <span dir="ltr">{view.auto.total}</span> ·
        قُدّر <span dir="ltr">{sections.filter(s => s.weight > 0 && draft[s.sectionId]?.level !== null && draft[s.sectionId] !== undefined).length}</span> من <span dir="ltr">{sections.filter(s => s.weight > 0).length}</span> قسمًا
        {view.result ? <> · العلامة المعتمدة <strong dir="ltr">{view.result.mark} / {view.result.outOf}</strong></> : mark !== null ? <> · العلامة حسب تقديراتك <strong dir="ltr">{mark} / 100</strong></> : null}
      </p>
      {why && <p className="platform-notice assignment-inline-message" data-testid="exam-form-review-why">{why}</p>}
      {view.status === "returned" && view.returnNote && <p className="eb-muted">ملاحظة الإعادة: {view.returnNote}</p>}
      {notice && <p className="platform-notice assignment-inline-message" role="status">{notice}</p>}
      {error && <p className="platform-error assignment-inline-message" role="alert">{error}</p>}

      <nav className="eb-sp-form-sections" aria-label="أقسام الاستمارة">
        {sections.map((s, i) => {
          const level = draft[s.sectionId]?.level ?? null;
          return (
            <button key={s.sectionId} type="button" className="eb-chip-button" aria-current={i === index ? "step" : undefined} onClick={() => go(i)}>
              <span dir="ltr">{s.order}</span> {s.title} · {s.weight <= 0 ? "بلا وزن" : level === null ? "بلا تقدير" : <span dir="ltr">{level}/{top}</span>}
            </button>
          );
        })}
      </nav>

      <div className="eb-sp-form-section">
        <h4 className="eb-sp-form-section-title" ref={headingRef} tabIndex={-1}><span dir="ltr">{section.order}</span>. {section.title}</h4>
        {section.questions.map((question, qi) => (
          <fieldset key={question.questionId} className="eb-sp-form-question" data-question={question.questionId}>
            <legend><span className="eb-sp-form-number" dir="ltr">{section.order}.{qi + 1}</span> {question.prompt}</legend>
            <AnswerBlock question={question} view={view} readImage={readImage} readFile={readFile} />
          </fieldset>
        ))}

        {section.weight > 0 && (
          <fieldset className="eb-project-form-rating" disabled={!editable || busy} data-testid="exam-form-rating">
            <legend>تقدير القسم <span className="eb-muted">(وزنه <span dir="ltr">{section.weight}</span> من 100)</span></legend>
            <div className="eb-project-form-levels">
              {levels.map(l => (
                <label key={l.value} className="eb-sp-form-option">
                  <input type="radio" name={"eb-rate-" + section.sectionId} checked={local.level === l.value} onChange={() => setRating(section.sectionId, { level: l.value })} />
                  <span><strong dir="ltr">{l.value}</strong> — {l.label}</span>
                </label>
              ))}
            </div>
            {editable && local.level !== null && <button type="button" className="eb-button is-small is-quiet" onClick={() => setRating(section.sectionId, { level: null })}>مسح التقدير</button>}
            <label className="eb-sp-form-justify">
              <span>ملاحظة للطالب على هذا القسم (اختيارية)</span>
              <textarea className="eb-sp-form-text" dir="auto" rows={2} maxLength={NOTE_MAX} value={local.note} onChange={e => setRating(section.sectionId, { note: e.target.value })} />
            </label>
            {editable && local.level === null && local.note.trim() !== "" && <p className="eb-sp-form-help eb-muted">اختر مستوى ليُحفظ التقدير مع ملاحظته.</p>}
          </fieldset>
        )}
      </div>

      <div className="eb-sp-form-steps">
        <button type="button" className="eb-button" disabled={index === 0} onClick={() => go(index - 1)}>القسم السابق</button>
        <button type="button" className="eb-button" disabled={index === sections.length - 1} onClick={() => go(index + 1)}>القسم التالي</button>
      </div>

      <label className="eb-sp-form-justify eb-project-form-general">
        <span>ملاحظة عامة للطالب (اختيارية)</span>
        <textarea className="eb-sp-form-text" dir="auto" rows={3} maxLength={NOTE_MAX} disabled={!editable || busy} value={generalNote} onChange={e => setGeneralNote(e.target.value)} />
      </label>

      {showUnrated && view.unrated.length > 0 && (
        <div className="platform-error assignment-inline-message eb-sp-form-missing" role="alert">
          <p>قدّر كل الأقسام قبل الاعتماد. بقي <span dir="ltr">{view.unrated.length}</span>:</p>
          <ul>
            {view.unrated.map(id => <li key={id}><button type="button" className="eb-button is-small" onClick={() => go(sections.findIndex(s => s.sectionId === id))}>{sectionTitle(id)}</button></li>)}
          </ul>
        </div>
      )}

      {editable && returning && (
        <div className="eb-project-form-return" data-testid="exam-form-return">
          <label className="eb-sp-form-justify">
            <span>ما الذي على الطالب تعديله؟ (تظهر له الملاحظة)</span>
            <textarea className="eb-sp-form-text" dir="auto" rows={3} maxLength={NOTE_MAX} disabled={busy} value={returnNote} onChange={e => setReturnNote(e.target.value)} />
          </label>
          <div className="eb-project-form-actions">
            <button type="button" className="eb-button is-primary" disabled={busy} onClick={() => void onReturn()}>تأكيد الإعادة</button>
            <button type="button" className="eb-button" disabled={busy} onClick={() => { setReturning(false); setReturnNote(""); }}>إلغاء</button>
          </div>
        </div>
      )}

      {editable && !returning && (
        <div className="eb-project-form-actions" role="group" aria-label="إجراءات الاستمارة">
          <button type="button" className="eb-button" disabled={busy || !unsaved} onClick={() => void onSave()}>حفظ التقديرات</button>
          <button type="button" className="eb-button" disabled={busy} onClick={() => setReturning(true)}>إعادة للتعديل</button>
          <button type="button" className="eb-button is-primary" disabled={busy} onClick={() => void onApprove()}>اعتماد الاستمارة</button>
        </div>
      )}
      {!locked && view.status === "approved" && (
        <div className="eb-project-form-actions" role="group" aria-label="إجراءات الاستمارة">
          <button type="button" className="eb-button" disabled={busy} onClick={() => void onUnapprove()}>إلغاء الاعتماد</button>
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
