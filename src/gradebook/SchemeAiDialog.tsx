import { useState } from "react";
import Dialog from "../ui/Dialog";
import { editSchemeWithAi, proposeSchemeWithAi } from "./gradebookApi";
import type { GbAiCurrent, GbAiEdit, GbAiProposal } from "./types";

/**
 * Class gradebook GB10 / GB10c — «بناء المخطط بالذكاء الاصطناعي» (docs/enterprise-class-gradebook-gb.md §4.11, §4.12). The teacher describes
 * the distribution, or a change to the scheme in the builder, in words; the server asks the model and answers, built only from this
 * class's sources:
 *   - «بناء مخطط جديد» — a PROPOSAL that fills the builder (GB10);
 *   - «تعديل المخطط الحالي» — a list of CHANGES to the draft, shown here as «ما سيتغيّر» before the teacher applies them (GB10c).
 * Nothing is saved here: the teacher reviews the builder and saves with «حفظ». Presentation only — the server decides access (grading +
 * AI authoring), refuses a locked or archived scheme and judges every change.
 */
export const DESCRIPTION_MAX = 2000;
const BUILD_EXAMPLES = [
  "ثلاثة أقسام: الشهري 20% والفصل الأول 40% والفصل الثاني 40%. في كل قسم الواجبات 30% والامتحانات 70% بالتساوي.",
  "الفصل الأول 50%: كل الامتحانات بالتساوي 80% والحضور والمشاركة من 10 بنسبة 20%. الفصل الثاني 50%: امتحان نهائي ورقي من 100.",
  "قسم واحد للعلامة النهائية فيه كل الواجبات والامتحانات، واقترح أنت الأوزان بحيث تكون الامتحانات أهم من الواجبات."
] as const;
const EDIT_EXAMPLES = [
  "اجعل نسبة الفصل الثاني 50% والفصل الأول 30%.",
  "أضف امتحان 3 إلى الشهري ثم وزّع أوزان الشهري بالتساوي.",
  "احذف الحضور من الفصل الأول وأضف قسمًا جديدًا اسمه المشاركة بنسبة 10% فيه علامة المشاركة من 5."
] as const;

type Mode = "build" | "edit";

export type SchemeAiDialogProps = {
  open: boolean;
  token: string;
  classId: string;
  onClose: () => void;
  /** The proposal, to load into the builder (the builder asks before replacing a non-empty draft). */
  onProposal: (p: GbAiProposal) => void | Promise<void>;
  /** GB10c — the builder's current draft (its keys, titles and weights); null when it has no part (then only a new scheme is offered). */
  current?: GbAiCurrent | null;
  /** GB10c — apply the changes the teacher accepted to the builder's draft. */
  onEdit?: (e: GbAiEdit) => void;
};

export default function SchemeAiDialog(p: SchemeAiDialogProps) {
  const canEdit = !!(p.current && p.current.categories.length && p.onEdit);
  const [mode, setMode] = useState<Mode>(canEdit ? "edit" : "build");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<GbAiEdit | null>(null);
  const trimmed = text.trim();
  const examples = mode === "edit" ? EDIT_EXAMPLES : BUILD_EXAMPLES;

  async function send() {
    if (!trimmed || busy) return;
    setBusy(true); setError("");
    try {
      if (mode === "edit" && p.current) {
        const r = await editSchemeWithAi(p.token, p.classId, trimmed, p.current);
        if (!r.ok) { setError(r.message); return; }
        setReview(r.edit);
      } else {
        const r = await proposeSchemeWithAi(p.token, p.classId, trimmed);
        if (!r.ok) { setError(r.message); return; }
        await p.onProposal(r.proposal);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الوصول إلى الذكاء الاصطناعي.");
    } finally {
      setBusy(false);
    }
  }

  const footer = review
    ? <>
      <button type="button" className="eb-button" onClick={() => setReview(null)}>رجوع</button>
      <button type="button" className="eb-button is-primary" disabled={!review.ops.length} onClick={() => p.onEdit && p.onEdit(review)}>طبّق التعديلات</button>
    </>
    : <>
      <button type="button" className="eb-button" onClick={p.onClose} disabled={busy}>إلغاء</button>
      <button type="button" className="eb-button is-primary" onClick={() => void send()} disabled={busy || !trimmed}>
        {busy ? (mode === "edit" ? "جارٍ تحضير التعديلات..." : "جارٍ بناء المخطط...") : mode === "edit" ? "اقترح التعديلات" : "اقترح المخطط"}
      </button>
    </>;

  return (
    <Dialog open={p.open} title="بناء المخطط بالذكاء الاصطناعي" onClose={() => { if (!busy) p.onClose(); }} size="md" footer={footer} className="eb-gb-ai">
      {review ? <EditReview edit={review} /> : (
        <div className="eb-gb-ai-body">
          {canEdit && (
            <fieldset className="eb-gb-ai-mode">
              <legend>ماذا تريد؟</legend>
              <label><input type="radio" name="eb-gb-ai-mode" checked={mode === "edit"} disabled={busy} onChange={() => { setMode("edit"); setError(""); }} />تعديل المخطط الحالي</label>
              <label><input type="radio" name="eb-gb-ai-mode" checked={mode === "build"} disabled={busy} onChange={() => { setMode("build"); setError(""); }} />بناء مخطط جديد مكانه</label>
            </fieldset>
          )}
          <p className="eb-muted eb-gb-ai-intro">
            {mode === "edit"
              ? "اكتب ما تريد تغييره في المخطط: نسبة قسم، أو عنصرًا تضيفه أو تحذفه، أو وزنًا جديدًا. يتغيّر ما تطلبه فقط، وترى التغييرات قبل تطبيقها."
              : "اكتب كيف توزّع العلامة النهائية: الأقسام ونسبة كل قسم، وما يُحسب في كل قسم ووزنه، والعلامات التي ترصدها بنفسك مع علامتها القصوى. يبني الذكاء الاصطناعي المخطط من واجبات هذا الصف وامتحاناته، ثم تراجعه وتعدّله قبل «حفظ»."}
          </p>
          <div className="eb-gb-suggest" role="group" aria-label="أمثلة للوصف">
            {examples.map((x, i) => <button key={mode + i} type="button" className="eb-button is-small is-quiet" disabled={busy} onClick={() => setText(x)}>{"مثال " + (i + 1)}</button>)}
          </div>
          <label className="eb-gb-field eb-gb-ai-field">
            <span>{mode === "edit" ? "وصف التعديل" : "وصف توزيع العلامات"}</span>
            <textarea value={text} rows={6} maxLength={DESCRIPTION_MAX} disabled={busy} aria-describedby="eb-gb-ai-help"
              placeholder={mode === "edit" ? "مثل: اجعل نسبة الفصل الثاني 50% وأضف امتحان 3 إلى الشهري بوزن 20." : "مثل: الشهري 20% والفصل الأول 40% والفصل الثاني 40%. في الشهري الوظيفة 1 بـ10 والباقي بالتساوي على الامتحانات."}
              onChange={e => setText(e.target.value)} />
          </label>
          <p id="eb-gb-ai-help" className="eb-muted eb-gb-ai-help">
            {Array.from(text).length + " / " + DESCRIPTION_MAX + " حرف."} يُرسَل الوصف وعناوين واجبات هذا الصف{mode === "edit" ? " وأقسام المخطط وأوزانه" : ""} فقط، بلا أسماء طلاب ولا علامات.
            الأرقام التي تكتبها تبقى كما هي، و«بالتساوي» تحسبه المنصة.
          </p>
          {busy && <p className="eb-muted" role="status">{mode === "edit" ? "جارٍ تحضير التعديلات..." : "جارٍ بناء المخطط..."} قد يستغرق ذلك بضع ثوانٍ.</p>}
          {error && <p className="platform-error" role="alert">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** GB10c — «ما سيتغيّر»: each change, what could not be done and why, and the notes; nothing is applied before «طبّق التعديلات». */
function EditReview({ edit }: { edit: GbAiEdit }) {
  const notes = [...edit.notes, ...edit.assumptions];
  return (
    <div className="eb-gb-ai-body" role="status">
      <h3 className="eb-gb-copy-title">ما سيتغيّر</h3>
      {edit.changes.length
        ? <ol className="eb-gb-ai-changes">{edit.changes.map((c, i) => <li key={i}>{c}</li>)}</ol>
        : <p className="eb-muted">لا تعديل يمكن تطبيقه.</p>}
      {edit.unmatched.length > 0 && (
        <div className="eb-gb-warning">
          <p className="eb-gb-copy-summary">{"لم يُطبَّق " + edit.unmatched.length + ":"}</p>
          <ul className="eb-gb-copy-missing">{edit.unmatched.map((u, i) => <li key={i}>{(u.category ? "«" + u.category + "» · " : "") + (u.title || "تعديل") + " — " + u.reason + (u.candidates && u.candidates.length ? " ربما تقصد: " + u.candidates.map(c => "«" + c + "»").join("، ") + "." : "")}</li>)}</ul>
        </div>
      )}
      {notes.length > 0 && <ul className="eb-gb-ai-notes" aria-label="ملاحظات على التعديلات">{notes.map((m, i) => <li key={i}>{m}</li>)}</ul>}
      <p className="eb-muted">لا يُحفظ شيء قبل «حفظ» في نافذة المخطط، ويمكنك التراجع بعد التطبيق.</p>
    </div>
  );
}
