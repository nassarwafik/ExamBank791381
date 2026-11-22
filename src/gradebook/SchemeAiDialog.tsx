import { useState } from "react";
import Dialog from "../ui/Dialog";
import { proposeSchemeWithAi } from "./gradebookApi";
import type { GbAiProposal } from "./types";

/**
 * Class gradebook GB10 — «بناء المخطط بالذكاء الاصطناعي» (docs/enterprise-class-gradebook-gb.md §4.11). The teacher describes the
 * distribution in words; the server asks the model and answers a PROPOSAL built only from this class's sources, which fills the scheme
 * builder. Nothing is saved here: the teacher reviews the builder and saves with «حفظ». Presentation only — the server decides access
 * (grading + AI authoring), refuses a locked or archived scheme and computes every equal share.
 */
export const DESCRIPTION_MAX = 2000;
const EXAMPLES = [
  "ثلاثة أقسام: الشهري 20% والفصل الأول 40% والفصل الثاني 40%. في كل قسم الواجبات 30% والامتحانات 70% بالتساوي.",
  "الفصل الأول 50%: كل الامتحانات بالتساوي 80% والحضور والمشاركة من 10 بنسبة 20%. الفصل الثاني 50%: امتحان نهائي ورقي من 100.",
  "قسم واحد للعلامة النهائية فيه كل الواجبات والامتحانات، واقترح أنت الأوزان بحيث تكون الامتحانات أهم من الواجبات."
] as const;

export type SchemeAiDialogProps = {
  open: boolean;
  token: string;
  classId: string;
  onClose: () => void;
  /** The proposal, to load into the builder (the builder asks before replacing a non-empty draft). */
  onProposal: (p: GbAiProposal) => void | Promise<void>;
};

export default function SchemeAiDialog(p: SchemeAiDialogProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trimmed = text.trim();

  async function propose() {
    if (!trimmed || busy) return;
    setBusy(true); setError("");
    try {
      const r = await proposeSchemeWithAi(p.token, p.classId, trimmed);
      if (!r.ok) { setError(r.message); return; }
      await p.onProposal(r.proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر بناء المخطط بالذكاء الاصطناعي.");
    } finally {
      setBusy(false);
    }
  }

  const footer = <>
    <button type="button" className="eb-button" onClick={p.onClose} disabled={busy}>إلغاء</button>
    <button type="button" className="eb-button is-primary" onClick={() => void propose()} disabled={busy || !trimmed}>{busy ? "جارٍ بناء المخطط..." : "اقترح المخطط"}</button>
  </>;

  return (
    <Dialog open={p.open} title="بناء المخطط بالذكاء الاصطناعي" onClose={() => { if (!busy) p.onClose(); }} size="md" footer={footer} className="eb-gb-ai">
      <div className="eb-gb-ai-body">
        <p className="eb-muted eb-gb-ai-intro">
          اكتب كيف توزّع العلامة النهائية: الأقسام ونسبة كل قسم، وما يُحسب في كل قسم ووزنه، والعلامات التي ترصدها بنفسك مع علامتها القصوى.
          يبني الذكاء الاصطناعي المخطط من واجبات هذا الصف وامتحاناته، ثم تراجعه وتعدّله قبل «حفظ».
        </p>
        <div className="eb-gb-suggest" role="group" aria-label="أمثلة للوصف">
          {EXAMPLES.map((x, i) => <button key={i} type="button" className="eb-button is-small is-quiet" disabled={busy} onClick={() => setText(x)}>{"مثال " + (i + 1)}</button>)}
        </div>
        <label className="eb-gb-field eb-gb-ai-field">
          <span>وصف توزيع العلامات</span>
          <textarea value={text} rows={6} maxLength={DESCRIPTION_MAX} disabled={busy} aria-describedby="eb-gb-ai-help"
            placeholder="مثل: الشهري 20% والفصل الأول 40% والفصل الثاني 40%. في الشهري الوظيفة 1 بـ10 والباقي بالتساوي على الامتحانات."
            onChange={e => setText(e.target.value)} />
        </label>
        <p id="eb-gb-ai-help" className="eb-muted eb-gb-ai-help">
          {Array.from(text).length + " / " + DESCRIPTION_MAX + " حرف."} يُرسَل الوصف وعناوين واجبات هذا الصف فقط، بلا أسماء طلاب ولا علامات.
          الأرقام التي تكتبها تبقى كما هي، و«بالتساوي» تحسبه المنصة.
        </p>
        {busy && <p className="eb-muted" role="status">جارٍ بناء المخطط... قد يستغرق ذلك بضع ثوانٍ.</p>}
        {error && <p className="platform-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
