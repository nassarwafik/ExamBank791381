import { useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import type { BuilderQuestion } from "../examTypes";
import type { ScenarioV1 } from "../scenarioSource";
import { sourceKindLabel } from "../scenarioSource";
import { AI_SCENARIO_LIMITS, verifyAiScenarioDraft } from "../aiScenarioDraft";
import { questionTypeDefinition } from "../questionTypeCatalog";
import type { AiAuthorIssueView, AiAuthorService } from "./aiAuthorService";

// Phase 19G — «سيناريو بالذكاء الاصطناعي» (lazy edge of the Structured Exam Builder). The teacher describes the scenario in natural
// language; the App-owned service calls /api/ai-scenario-author; the returned draft (ONE scenario + its questions) is RE-VERIFIED here
// with the SAME shared authority (verifyAiScenarioDraft → verifyAiQuestionNode per question, validateSectionScenarios, the quality gate)
// before it is offered; a factual summary is shown (sources by kind, questions by type — never a private answer); the whole scenario is
// inserted as ONE builder update only when the teacher confirms, with fresh ids. A refusal or a failure inserts nothing.
export type AiScenarioInsertOutcome = "ok" | "stale";
type SectionOption = { id: string; title: string };
type Props = { open: boolean; onClose: () => void; service: AiAuthorService; sections: SectionOption[]; defaultSectionId?: string; onInsert: (scenario: ScenarioV1, questions: BuilderQuestion[], sectionId: string) => AiScenarioInsertOutcome; disabled?: boolean };
type Ready = { scenario: ScenarioV1; questions: BuilderQuestion[]; notes: string[] };
type Failure = { message: string; issues: AiAuthorIssueView[] };

function summaryOf(r: Ready): string {
  const kinds = r.scenario.sources.map(s => sourceKindLabel(s.kind)).join("، ");
  const types = r.questions.map(q => questionTypeDefinition(q.presentationType)?.label ?? String(q.presentationType)).join("، ");
  return "السيناريو: " + (r.scenario.title || "بلا عنوان") + " · المصادر (" + r.scenario.sources.length + "): " + kinds + " · الأسئلة (" + r.questions.length + "): " + types;
}

export default function AiScenarioAuthorDialog({ open, onClose, service, sections, defaultSectionId, onInsert, disabled }: Props) {
  const [request, setRequest] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId ?? sections[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const seq = useRef(0);

  const generate = async () => {
    const text = request.trim();
    if (!text || busy || !service.authorScenario) return;
    const mine = ++seq.current;
    setBusy(true); setReady(null); setFailure(null);
    try {
      const r = await service.authorScenario({ request: text });
      if (mine !== seq.current) return;
      if (!r || r.ok !== true) {
        const f = r && r.ok === false ? r : null;
        setFailure({ message: f?.message || f?.error || "تعذّر إنشاء السيناريو.", issues: Array.isArray(f?.issues) ? f.issues : [] });
        return;
      }
      const verdict = verifyAiScenarioDraft({ scenario: r.scenario, questions: r.questions });   // defense in depth: the same canonical authority, client-side
      if (!verdict.ok) { setFailure({ message: verdict.message, issues: verdict.issues }); return; }
      setReady({ scenario: verdict.scenario, questions: verdict.questions, notes: Array.isArray(r.notes) ? r.notes.filter(n => typeof n === "string") : [] });
    } catch (e) {
      if (mine === seq.current) setFailure({ message: e instanceof Error && e.message ? e.message : "تعذّر الوصول إلى خدمة الذكاء الاصطناعي.", issues: [] });
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };
  const insert = () => {
    if (!ready) return;
    const outcome = onInsert(ready.scenario, ready.questions, sectionId);
    if (outcome === "ok") onClose();
    else setFailure({ message: "تغيّر الامتحان أو القسم الهدف منذ إنشاء المسودة؛ لم يُدرج السيناريو.", issues: [] });
  };

  return (
    <Dialog open={open} onClose={onClose} title="إنشاء سيناريو بالذكاء الاصطناعي" size="lg" className="ai-author-dialog">
      <div className="ai-author-dialog" data-testid="ai-scenario-dialog">
        <p className="sb-hint">صف السيناريو المطلوب: مصدرًا مشتركًا (نص أو جدول أو كود للقراءة) وأسئلة تعتمد عليه، مثل: «فقرة عن بروتوكول DHCP مع سؤال اختيار من متعدد وسؤال إجابة مفتوحة». لا يُنشئ الذكاء الاصطناعي صورًا ولا اختبارات مخفية ولا مناطق على الصور؛ ويُطبَّق على المسودة التحقق نفسه المطبّق على السيناريوهات اليدوية، وتُدرج كاملةً أو لا تُدرج.</p>
        <label className="sb-field"><span>اكتب طلبك</span>
          <textarea aria-label="اكتب طلب السيناريو" value={request} maxLength={AI_SCENARIO_LIMITS.requestChars} rows={4} dir="auto" disabled={busy || disabled} onChange={e => setRequest(e.target.value)} />
        </label>
        <div className="sb-inline">
          <label className="sb-field"><span>القسم الهدف</span>
            <select aria-label="القسم الهدف للسيناريو" value={sectionId} disabled={busy || disabled} onChange={e => setSectionId(e.target.value)}>{sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
          </label>
          <button type="button" className="sb-btn sb-btn-primary" onClick={() => void generate()} disabled={busy || disabled || request.trim() === "" || !sectionId}>{busy ? "⏳ جارٍ الإنشاء…" : "إنشاء مسودة السيناريو"}</button>
        </div>
        {busy && <p role="status" className="sb-hint">جارٍ إنشاء السيناريو والتحقق منه…</p>}
        {failure && (
          <div role="alert" className="platform-error">
            <p>{failure.message}</p>
            {failure.issues.length > 0 && <ul>{failure.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
          </div>
        )}
        {ready && (
          <div className="sb-panel" data-testid="ai-scenario-ready">
            <p data-testid="ai-scenario-summary">{summaryOf(ready)}</p>
            <ol className="sb-hint">{ready.questions.map(q => <li key={q.examQuestionId}><bdi>{String(q.text ?? "")}</bdi></li>)}</ol>
            {ready.notes.map((n, i) => <p key={i} className="sb-hint">{n}</p>)}
            <div className="sb-inline">
              <button type="button" className="sb-btn sb-btn-primary" onClick={insert} disabled={disabled}>إدراج السيناريو في القسم</button>
              <button type="button" className="sb-btn" onClick={() => setReady(null)}>تجاهل المسودة</button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
