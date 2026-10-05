import { OPEN_RESPONSE_PROFILE_LABELS, type OpenResponseProfile } from "../openResponseQuestion";
import { useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import type { BuilderQuestion } from "../examTypes";
import { AI_AUTHOR_LIMITS, verifyAiQuestionNode } from "../aiQuestionDraft";
import { questionTypeDefinition } from "../questionTypeCatalog";
import { validateNetworkCliAnswerKey } from "../networkCliQuestion";
import { inlineClozePreviewText, validateInlineClozeConfig } from "../inlineClozeQuestion";
import { validateParametricNumericConfig } from "../parametricNumericQuestion";
import type { AiAuthorIssueView, AiAuthorService } from "./aiAuthorService";

// Phase 19A — «سؤال بالذكاء الاصطناعي» (lazy edge of the Structured Exam Builder). The teacher describes the question in natural
// language; the App-owned service calls /api/ai-question-author; the returned draft is RE-VERIFIED here with the SAME shared
// canonical authority (verifyAiQuestionNode → the structured-exam quality gate and the registered type validators) before it is
// offered; a factual summary is shown (type, checks / passage with blank markers — never the private answers); the question is
// inserted as ONE builder update only when the teacher confirms, with fresh ids. A refusal or a failure inserts nothing.
export type AiInsertOutcome = "ok" | "stale";
type SectionOption = { id: string; title: string };
type Props = { open: boolean; onClose: () => void; service: AiAuthorService; sections: SectionOption[]; defaultSectionId?: string; onInsert: (question: BuilderQuestion, sectionId: string) => AiInsertOutcome; disabled?: boolean };
const PREFERRED: [string, string][] = [["", "تلقائي (يختار الذكاء الاصطناعي)"], ["networkCli", "محاكي أوامر الشبكة"], ["inlineCloze", "إكمال نص تفاعلي"], ["parametricNumeric", "سؤال رقمي بمعطيات متغيرة"], ["openResponse", "إجابة مفتوحة مع سلم تقييم"], ["fillBlank", "إكمال فراغات"], ["multipleChoice", "اختيار من متعدد"], ["trueFalse", "صح أو خطأ"], ["shortAnswer", "إجابة قصيرة"]];
type Ready = { question: BuilderQuestion; notes: string[] };
type Failure = { message: string; issues: AiAuthorIssueView[] };

function summaryOf(q: BuilderQuestion): string {
  const node = q as unknown as Record<string, unknown>;
  const label = questionTypeDefinition(node.presentationType)?.label ?? String(node.presentationType);
  const parts = ["النوع: " + label, "العلامة: " + String(node.marks)];
  if (node.presentationType === "networkCli") { const k = validateNetworkCliAnswerKey(node.answer); if (k.ok) parts.push(k.key.checks + " عناصر للتصحيح على حالة المبدّل"); }
  if (node.presentationType === "inlineCloze") { const c = validateInlineClozeConfig(node.inlineCloze); if (c.ok) parts.push("النص: " + inlineClozePreviewText(c.config)); }
  // Phase 19E — profile + rubric size only; the private model answer and grader guidance are never summarised here.
  if (node.presentationType === "openResponse") { const o = node.openResponse as { profile?: unknown } | undefined, a = node.answer as { rubric?: { criteria?: unknown[] } } | undefined; parts.push("النمط: " + (OPEN_RESPONSE_PROFILE_LABELS[o?.profile as OpenResponseProfile] ?? String(o?.profile ?? "")) + " · " + (Array.isArray(a?.rubric?.criteria) ? a.rubric.criteria.length : 0) + " معايير في سلم التقييم"); }
  if (node.presentationType === "parametricNumeric") { const c = validateParametricNumericConfig(node.parametric); if (c.ok) parts.push(c.config.variables.length + " متغيرات · قيم مختلفة لكل طالب ومحاولة"); }
  if (Array.isArray(node.options)) parts.push(node.options.length + " خيارات");
  return parts.join(" · ");
}

export default function AiQuestionAuthorDialog({ open, onClose, service, sections, defaultSectionId, onInsert, disabled }: Props) {
  const [request, setRequest] = useState("");
  const [preferred, setPreferred] = useState("");
  const [sectionId, setSectionId] = useState(defaultSectionId ?? sections[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const seq = useRef(0);

  const generate = async () => {
    const text = request.trim();
    if (!text || busy) return;
    const mine = ++seq.current;
    setBusy(true); setReady(null); setFailure(null);
    try {
      const r = await service.author(preferred ? { request: text, preferredType: preferred } : { request: text });
      if (mine !== seq.current) return;
      if (!r || r.ok !== true) {
        const f = r && r.ok === false ? r : null;
        setFailure({ message: f?.message || f?.error || "تعذّر إنشاء السؤال.", issues: Array.isArray(f?.issues) ? f.issues : [] });
        return;
      }
      const verdict = verifyAiQuestionNode(r.question);                   // defense in depth: the same canonical authority, client-side
      if (!verdict.ok) { setFailure({ message: verdict.message, issues: verdict.issues }); return; }
      setReady({ question: verdict.question, notes: Array.isArray(r.notes) ? r.notes.filter(n => typeof n === "string") : [] });
    } catch (e) {
      if (mine === seq.current) setFailure({ message: e instanceof Error && e.message ? e.message : "تعذّر الوصول إلى خدمة الذكاء الاصطناعي.", issues: [] });
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };
  const insert = () => {
    if (!ready) return;
    const outcome = onInsert(ready.question, sectionId);
    if (outcome === "ok") onClose();
    else setFailure({ message: "تغيّر الامتحان أو القسم الهدف منذ إنشاء المسودة؛ لم يُدرج السؤال.", issues: [] });
  };

  return (
    <Dialog open={open} onClose={onClose} title="إنشاء سؤال بالذكاء الاصطناعي" size="lg" className="ai-author-dialog">
      <div className="ai-author-dialog" data-testid="ai-author-dialog">
        <p className="sb-hint">صف السؤال المطلوب بلغتك، مثل: «أنشئ سؤال محاكي سويتش: VLAN 10 و20 مع trunk» أو «اكتب فقرة فيها 4 فراغات، الثاني قائمة منسدلة». يُنشأ السؤال مسودةً تراجعها قبل الإدراج، ويُطبَّق عليه التحقق نفسه المطبّق على الأسئلة اليدوية.</p>
        <label className="sb-field"><span>اكتب طلبك</span>
          <textarea aria-label="اكتب طلبك" value={request} maxLength={AI_AUTHOR_LIMITS.requestChars} rows={4} dir="auto" disabled={busy || disabled} onChange={e => setRequest(e.target.value)} />
        </label>
        <div className="sb-inline">
          <label className="sb-field"><span>نوع السؤال المفضّل</span>
            <select aria-label="نوع السؤال المفضّل" value={preferred} disabled={busy || disabled} onChange={e => setPreferred(e.target.value)}>{PREFERRED.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="sb-field"><span>القسم الهدف</span>
            <select aria-label="القسم الهدف" value={sectionId} disabled={busy || disabled} onChange={e => setSectionId(e.target.value)}>{sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
          </label>
        </div>
        <div className="sb-inline">
          <button type="button" className="sb-btn sb-btn-primary" onClick={() => void generate()} disabled={busy || disabled || request.trim() === "" || !sectionId}>{busy ? "⏳ جارٍ الإنشاء…" : "إنشاء المسودة"}</button>
        </div>
        {busy && <p role="status" className="sb-hint">جارٍ إنشاء المسودة والتحقق منها…</p>}
        {failure && (
          <div role="alert" className="platform-error">
            <p>{failure.message}</p>
            {failure.issues.length > 0 && <ul>{failure.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
          </div>
        )}
        {ready && (
          <div className="sb-panel" data-testid="ai-author-ready">
            <p data-testid="ai-author-summary">{summaryOf(ready.question)}</p>
            <p className="sb-hint">نص السؤال: <bdi>{String((ready.question as unknown as { text?: unknown }).text ?? "")}</bdi></p>
            {ready.notes.map((n, i) => <p key={i} className="sb-hint">{n}</p>)}
            <div className="sb-inline">
              <button type="button" className="sb-btn sb-btn-primary" onClick={insert} disabled={disabled}>إدراج في الامتحان</button>
              <button type="button" className="sb-btn" onClick={() => setReady(null)}>تجاهل المسودة</button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
