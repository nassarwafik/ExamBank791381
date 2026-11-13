import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconEye, IconWarning } from "../icons";
import { CATEGORY_LABELS, categoryLabel } from "../examLibrary";
import { lazyWithRetry } from "../lazyWithRetry";
import type { ApiResult, LibraryActivityType, LibraryAudience, OwnSavedExam, OwnerLibraryItem, OwnerLibraryTeacher, OwnerSubmission, OwnerSubmissionDetail } from "./ownerApi";
import { ownerHandoffApi, ownerLibraryApi } from "./ownerApi";
import AudienceEditor from "./OwnerAudienceEditor";

// The ONE faithful exam renderer (it scrubs every grading secret itself): the owner sees the exam as a student will.
const ExamPreview = lazy(lazyWithRetry(() => import("../ExamPreview"), "owner-submission-preview"));

/**
 * Tadris+ P6-F — «امتحانات مرسلة للبنك» and «من امتحاناتي» in the Owner Console's «بنك الامتحانات» (docs/enterprise-library-submissions-p6f.md;
 * owner decisions (2), (أ)). A teacher builds an exam with every builder tool and sends it; the owner previews it as a student will see it,
 * then publishes it (title, exam / training, category) or declines it with a reason the teacher sees. An updated version of an exam already
 * published replaces it with the same audience. The owner's own exams (their linked teacher workspace, P4-D) are listed directly.
 * Every change goes through the page's `send` (second-factor check asked inline, then retried); the server decides everything.
 *
 * Tadris+ P6-G (docs/enterprise-library-consent-owner-edit-p6g.md) — the review shows whether the teacher agreed to the platform's use
 * of the exam (one sent without it can only be declined), and lets the owner edit before publishing: «نسخ إلى مساحتي للتعديل» puts a
 * copy in the owner's teacher workspace (P4-D), edited there with the builder; the owner then publishes that copy for the submission.
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
type Tab = "sent" | "own";
const ACTIVITY_LABELS: Record<LibraryActivityType, string> = { exam: "امتحان", training: "تدريب" };
const STATUS_TEXT: Record<OwnerSubmission["status"], string> = { pending: "قيد المراجعة", published: "نُشر", declined: "رُفض", withdrawn: "سحبه المعلم", superseded: "أُرسلت نسخة أحدث" };
const day = (iso: string) => (iso || "").slice(0, 10);

export default function OwnerLibrarySubmissions({ token, busy, send, teachers, categories, onChanged, onDone, onSignedOut }: {
  token: string; busy: boolean; send: Send; teachers: OwnerLibraryTeacher[]; categories: string[];
  onChanged: () => void; onDone: (notice: string) => void; onSignedOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("sent");
  const [list, setList] = useState<OwnerSubmission[] | null>(null);
  const [own, setOwn] = useState<{ linked: boolean; exams: OwnSavedExam[] } | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void ownerLibraryApi.submissions(token).then(r => {
      if (!live) return;
      if (r.ok) { setList(r.data.submissions); setError(""); } else if (r.status === 401) onSignedOut(); else setError(r.error);
    });
    return () => { live = false; };
  }, [token, nonce, onSignedOut]);
  useEffect(() => {
    if (tab !== "own" || own) return;
    let live = true;
    void ownerLibraryApi.ownExams(token).then(r => {
      if (!live) return;
      if (r.ok) setOwn({ linked: r.data.linked, exams: r.data.exams }); else if (r.status === 401) onSignedOut(); else setError(r.error);
    });
    return () => { live = false; };
  }, [tab, own, token, onSignedOut]);

  const pending = (list || []).filter(s => s.status === "pending").length;
  const refresh = () => { setNonce(n => n + 1); onChanged(); };

  if (reviewing) {
    return <Review token={token} id={reviewing} busy={busy} send={send} teachers={teachers} categories={categories} onSignedOut={onSignedOut}
      onBack={() => { setReviewing(null); refresh(); }} onDone={notice => { setReviewing(null); refresh(); onDone(notice); }} />;
  }
  return (
    <section className="eb-owner-cap-group eb-owner-import eb-owner-submissions" aria-labelledby="eb-owner-submissions-title">
      <div className="eb-owner-panel-head">
        <h3 id="eb-owner-submissions-title" className="eb-owner-h3">امتحانات المعلمين للبنك</h3>
      </div>
      <p className="eb-owner-hint">يُعدّ المعلم الامتحان بكل أدوات الباني ثم يرسله. تعاينه هنا كما سيراه الطالب، ثم تنشره وتختار من يراه، أو ترفضه مع سبب يصل إليه.</p>
      <div className="eb-owner-chips" role="group" aria-label="مصدر الامتحانات">
        <button type="button" className={"eb-owner-chip" + (tab === "sent" ? " is-on" : "")} aria-pressed={tab === "sent"} onClick={() => setTab("sent")}>
          امتحانات مرسلة للبنك<span className="eb-owner-chip-count">{pending}</span>
        </button>
        <button type="button" className={"eb-owner-chip" + (tab === "own" ? " is-on" : "")} aria-pressed={tab === "own"} onClick={() => setTab("own")}>من امتحاناتي</button>
      </div>
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}

      {tab === "sent" && (list === null ? <p className="eb-owner-hint" role="status">جارٍ التحميل…</p> : list.length === 0 ? (
        <p className="eb-owner-hint">لم يُرسل أي معلم امتحانًا بعد. يرسل المعلم من «بنك الامتحانات» ← «الامتحانات المحفوظة» ← «إرسال إلى بنك المنصة».</p>
      ) : (
        <ul className="eb-owner-import-list eb-owner-submission-list" aria-label="الامتحانات المرسلة">
          {list.map(s => (
            <li key={s.submissionId} className="eb-owner-submission-row">
              <div>
                <strong><bdi>{s.title}</bdi></strong>
                <span className="eb-owner-hint"> · <bdi>{s.teacherName || "معلم"}</bdi>{s.sentBy === "owner" ? " (مساحتك)" : ""} · {day(s.submittedAt)} · {s.questionCount} سؤال</span>
                <span className={"eb-owner-status eb-owner-status--" + (s.status === "pending" ? "invited" : s.status === "published" ? "active" : "suspended")}>{STATUS_TEXT[s.status]}{s.editedByOwner ? " بتعديلاتك" : ""}{s.libraryItemId ? " · " + s.libraryItemId : ""}</span>
                {s.status === "pending" && s.ownerCopy && <span className="eb-owner-hint"> · نسخة للتعديل في مساحتك</span>}
                {s.status === "declined" && s.reason && <span className="eb-owner-hint"> · السبب: {s.reason}</span>}
              </div>
              {s.status === "pending" && <button type="button" className="eb-owner-secondary eb-owner-small" onClick={() => setReviewing(s.submissionId)}>مراجعة</button>}
            </li>
          ))}
        </ul>
      ))}

      {tab === "own" && (own === null ? <p className="eb-owner-hint" role="status">جارٍ التحميل…</p> : !own.linked ? (
        <p className="eb-owner-hint">لم تربط حسابك بمساحة معلم بعد. اربطه من «نظرة عامة» ← «مساحة المعلم الخاصة بك»، ثم أعدّ امتحانك هناك بالباني واحفظه ليظهر هنا.</p>
      ) : own.exams.length === 0 ? (
        <p className="eb-owner-hint">لا امتحانات منظّمة محفوظة في مساحتك كمعلم بعد. أعدّ امتحانًا بالباني واحفظه ليظهر هنا.</p>
      ) : (
        <ul className="eb-owner-import-list eb-owner-submission-list" aria-label="امتحاناتي المحفوظة">
          {own.exams.map(e => (
            <li key={e.blobName} className="eb-owner-submission-row">
              <div><strong><bdi>{e.title}</bdi></strong><span className="eb-owner-hint"> · {e.questionCount} سؤال · آخر حفظ {day(e.savedAt)}{e.ownerCopyOf ? " · نسختك المعدّلة من امتحان أرسله معلم" : ""}</span></div>
              {e.ownerCopyOf ? (
                <button type="button" className="eb-owner-secondary eb-owner-small" onClick={() => setReviewing(e.ownerCopyOf as string)}>فتح المراجعة</button>
              ) : (
                <button type="button" className="eb-owner-secondary eb-owner-small" disabled={busy}
                  onClick={() => void send(() => ownerLibraryApi.takeOwn(token, e.blobName), d => setReviewing(d.submission.submissionId))}>مراجعة ونشر</button>
              )}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

function Review({ token, id, busy, send, teachers, categories, onBack, onDone, onSignedOut }: {
  token: string; id: string; busy: boolean; send: Send; teachers: OwnerLibraryTeacher[]; categories: string[];
  onBack: () => void; onDone: (notice: string) => void; onSignedOut: () => void;
}) {
  const [detail, setDetail] = useState<OwnerSubmissionDetail | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [activityType, setActivityType] = useState<LibraryActivityType>("exam");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [published, setPublished] = useState<{ item: OwnerLibraryItem; replaces?: string; replacementPending?: boolean } | null>(null);
  // Tadris+ P6-G — what is published (the owner's edited copy once it exists), the copy's preview, the one-time workspace link
  const [useCopy, setUseCopy] = useState(true);
  const [previewCopy, setPreviewCopy] = useState(false);
  const [reload, setReload] = useState(0);
  const [ticket, setTicket] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let live = true;
    void ownerLibraryApi.submission(token, id).then(r => {
      if (!live) return;
      if (!r.ok) { if (r.status === 401) onSignedOut(); else setError(r.error); return; }
      setDetail(r.data);
      if (loaded.current) return;   // a reload (the copy as it is now) keeps what the owner typed
      loaded.current = true;
      setTitle(r.data.submission.title);
      const cover = (r.data.exam.coverPage || null) as { activityType?: string } | null;
      setActivityType(cover && cover.activityType === "training" ? "training" : "exam");
    });
    return () => { live = false; };
  }, [token, id, onSignedOut, reload]);

  const categoryChoices = [...new Set([...Object.keys(CATEGORY_LABELS), ...categories])];
  if (error) return <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error} <button type="button" className="eb-owner-secondary" onClick={onBack}>رجوع</button></div>;
  if (!detail) return <p className="eb-owner-hint" role="status">جارٍ تحميل الامتحان…</p>;
  const s = detail.submission;
  const copy = detail.ownerCopy && detail.ownerCopy.exists ? detail.ownerCopy : null;
  const fromCopy = !!copy && useCopy;
  const sentReady = !!detail.finalization && detail.finalization.canFinalize;
  const copyReady = !!copy && !!copy.finalization && copy.finalization.canFinalize;
  const ready = fromCopy ? copyReady : sentReady;
  const consented = s.consented !== false;   // P6-G — an exam sent without the agreement is never published (decline it)

  if (published) {
    const doneText = "نُشر «" + published.item.title + "» (" + published.item.libraryItemId + ")";
    return (
      <section className="eb-owner-cap-group eb-owner-import" aria-label="بعد النشر">
        {published.replaces && !published.replacementPending && <p className="eb-owner-hint eb-owner-done" role="status">✓ {doneText} وحلّ محل {published.replaces} بالجمهور نفسه. النسخة السابقة لم تعد ظاهرة لأحد، والواجبات المسندة منها كما هي.</p>}
        {published.replaces && published.replacementPending && (
          <div className="auth-error" role="alert">
            <span>نُشر {published.item.libraryItemId}، لكن نقل الجمهور من {published.replaces} لم يكتمل. النسخة السابقة ما زالت ظاهرة كما كانت، والجديدة «لم يُحدَّد بعد».</span>
            <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void send(() => ownerLibraryApi.completeReplacement(token, published.item.libraryItemId), () => onDone(doneText + " وحلّ محل النسخة السابقة."))}>إكمال الاستبدال</button>
          </div>
        )}
        {published.replaces && !published.replacementPending && <button type="button" className="auth-submit" onClick={() => onDone(doneText + " وحلّ محل النسخة السابقة.")}>تم</button>}
        {!published.replaces && (
          <>
            <p className="eb-owner-hint eb-owner-done" role="status">✓ {doneText}. لا يراه أحد حتى تختار.</p>
            <AudienceEditor item={published.item} teachers={teachers} busy={busy} onCancel={() => onDone(doneText + ". جمهوره «لم يُحدَّد بعد».")}
              onSave={(audience: LibraryAudience, chosen: string[]) => send(() => ownerLibraryApi.setAudience(token, published.item.libraryItemId, audience, chosen), () => onDone(doneText + " وحُفظ جمهوره."))} />
          </>
        )}
      </section>
    );
  }

  return (
    <section className="eb-owner-cap-group eb-owner-import" aria-label={"مراجعة «" + s.title + "»"}>
      <div className="eb-owner-panel-head">
        <h3 className="eb-owner-h3">مراجعة «<bdi>{s.title}</bdi>»</h3>
        <button type="button" className="eb-owner-secondary eb-owner-small" onClick={onBack}>رجوع</button>
      </div>
      <p className="eb-owner-hint">من <bdi>{s.teacherName || "معلم"}</bdi>{s.sentBy === "owner" ? " (مساحتك)" : ""} · أُرسل {day(s.submittedAt)} · {s.questionCount} سؤال · {s.totalMarks} علامة{s.governed ? " · النسخة المنشورة من مراجعات النشر" : ""}</p>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary" onClick={() => setPreview(true)}><IconEye size={16} aria-hidden="true" /> معاينة الامتحان</button>
      </div>
      {preview && createPortal(<Suspense fallback={null}><ExamPreview exam={detail.exam as never} onClose={() => setPreview(false)} /></Suspense>, document.body)}
      {previewCopy && copy && copy.exam && createPortal(<Suspense fallback={null}><ExamPreview exam={copy.exam as never} onClose={() => setPreviewCopy(false)} /></Suspense>, document.body)}

      {/* Tadris+ P6-G — the teacher's agreement to the platform's use of the exam */}
      {s.sentBy === "teacher" && (consented ? (
        <details className="eb-owner-hint">
          <summary>✓ أقرّ المعلم بحقوق الاستخدام{s.consentedAt ? " في " + day(s.consentedAt) : ""}</summary>
          {detail.consentText && <p>{detail.consentText}</p>}
        </details>
      ) : (
        <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" /><span>أُرسل هذا الامتحان دون إقرار المعلم بحقوق الاستخدام، فلا يُنشر ولا يُنسخ. ارفضه واطلب من المعلم إرساله من جديد.</span></div>
      ))}

      {consented && (sentReady ? <p className="eb-owner-hint eb-owner-done" role="status">✓ الامتحان كما أرسله المعلم جاهز للنشر.</p> : (
        <div className="auth-error" role="alert">
          <span>لا يمكن نشر الامتحان كما أُرسل. ارفضه مع ذكر ما يجب إصلاحه، أو انسخه إلى مساحتك وأصلحه:</span>
          <ul className="eb-owner-import-list">{detail.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ))}

      {/* Tadris+ P6-G — the owner edits before publishing: a copy in the owner's teacher workspace, edited with the builder */}
      {consented && s.sentBy === "teacher" && (
        <section className="eb-owner-cap-group" aria-label="تعديل قبل النشر">
          <h4 className="eb-owner-h3">تعديل قبل النشر</h4>
          {!detail.ownerCopy ? (
            <>
              <p className="eb-owner-hint">تُنسخ نسخة من الامتحان إلى مساحتك كمعلم، فتعدّلها بالباني بكل أدواته ثم تنشرها من هنا. ما أرسله المعلم لا يتغير.</p>
              <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void send(() => ownerLibraryApi.copySubmission(token, s.submissionId), () => setReload(n => n + 1))}>نسخ إلى مساحتي للتعديل</button>
            </>
          ) : !detail.ownerCopy.linked ? (
            <p className="eb-owner-hint" role="note">نسختك في مساحة معلم لم تعد مربوطة بحسابك. اربط مساحتك من «نظرة عامة» ← «مساحة المعلم الخاصة بك».</p>
          ) : !copy ? (
            <>
              <p className="eb-owner-hint" role="note">لم تعد نسختك موجودة في مساحتك. يمكنك نسخ الامتحان من جديد.</p>
              <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void send(() => ownerLibraryApi.copySubmission(token, s.submissionId), () => setReload(n => n + 1))}>نسخ إلى مساحتي للتعديل</button>
            </>
          ) : (
            <>
              <p className="eb-owner-hint">نسختك في مساحتك كمعلم ← «امتحاناتي» باسم «<bdi>{copy.title}</bdi>»{copy.savedAt ? " · آخر حفظ " + day(copy.savedAt) : ""}. افتحها بالباني وعدّلها واحفظها، ثم عد هنا واضغط «تحديث النسخة».</p>
              <div className="eb-owner-actions">
                {ticket ? (
                  <a className="auth-submit" href={ticket} target="_blank" rel="noopener noreferrer" onClick={() => setTicket(null)}>فتح مساحة المعلم في تبويب جديد</a>
                ) : (
                  <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void send(() => ownerHandoffApi.issue(token), d => setTicket(window.location.pathname + d.handoffPath))}>فتح مساحتي كمعلم</button>
                )}
                <button type="button" className="eb-owner-secondary" onClick={() => setReload(n => n + 1)}>تحديث النسخة</button>
                <button type="button" className="eb-owner-secondary" onClick={() => setPreviewCopy(true)}><IconEye size={16} aria-hidden="true" /> معاينة نسختي</button>
              </div>
              {copyReady ? <p className="eb-owner-hint eb-owner-done" role="status">✓ نسختك المعدّلة جاهزة للنشر.</p> : (
                <div className="auth-error" role="alert">
                  <span>نسختك المعدّلة غير جاهزة للنشر بعد. أصلح في الباني:</span>
                  <ul className="eb-owner-import-list">{(copy.blockers || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {detail.replaces && <p className="eb-owner-hint" role="note">نسخة محدَّثة من «<bdi>{detail.replaces.title}</bdi>» ({detail.replaces.libraryItemId}): عند النشر تحلّ محلها في بنوك المعلمين أنفسهم، وتُخفى السابقة. الواجبات المسندة منها لا تتغير.</p>}

      {consented && (sentReady || copy) && (
        <form className="auth-form eb-owner-create" aria-label="نشر الامتحان المرسل" onSubmit={e => { e.preventDefault(); if (!ready) return; void send(() => ownerLibraryApi.publishSubmission(token, s.submissionId, { title: title.trim(), category, activityType, description: description.trim(), ...(fromCopy ? { fromOwnerCopy: true } : {}) }), d => setPublished({ item: d.item, replaces: d.replaces, replacementPending: d.replacementPending })); }}>
          {copy && (
            <fieldset className="eb-owner-cap-group">
              <legend>ما يُنشر</legend>
              <label className="eb-owner-check"><input type="radio" name="eb-review-source" checked={useCopy} onChange={() => setUseCopy(true)} /> نسختي المعدّلة</label>
              <label className="eb-owner-check"><input type="radio" name="eb-review-source" checked={!useCopy} onChange={() => setUseCopy(false)} /> كما أرسله المعلم</label>
            </fieldset>
          )}
          <label className="auth-field"><span>عنوان الامتحان في البنك</span>
            <div className="auth-input"><input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required /></div>
          </label>
          <fieldset className="eb-owner-cap-group">
            <legend>النوع</legend>
            {(Object.keys(ACTIVITY_LABELS) as LibraryActivityType[]).map(t => (
              <label key={t} className="eb-owner-check"><input type="radio" name="eb-review-activity" checked={activityType === t} onChange={() => setActivityType(t)} /> {ACTIVITY_LABELS[t]}</label>
            ))}
          </fieldset>
          <label className="auth-field"><span>التصنيف</span>
            <div className="auth-input"><select value={category} onChange={e => setCategory(e.target.value)} required>
              <option value="" disabled>— اختر —</option>
              {categoryChoices.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select></div>
          </label>
          <label className="auth-field"><span>وصف قصير (اختياري)</span>
            <div className="auth-input"><input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy || !ready || !title.trim() || !category}>{detail.replaces ? "نشر النسخة المحدَّثة" : "نشر في البنك"}{fromCopy ? " (بتعديلاتي)" : ""}</button>
          </div>
        </form>
      )}

      <form className="auth-form eb-owner-create" aria-label="رفض الامتحان المرسل" onSubmit={e => { e.preventDefault(); void send(() => ownerLibraryApi.declineSubmission(token, s.submissionId, reason.trim()), () => onDone("رُفض «" + s.title + "»، ووصل السبب إلى المعلم.")); }}>
        <label className="auth-field"><span>سبب الرفض (يصل إلى المعلم)</span>
          <div className="auth-input"><textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={300} rows={2} /></div>
        </label>
        <div className="eb-owner-actions">
          <button type="submit" className="eb-owner-secondary" disabled={busy || !reason.trim()}>رفض</button>
        </div>
      </form>
    </section>
  );
}
