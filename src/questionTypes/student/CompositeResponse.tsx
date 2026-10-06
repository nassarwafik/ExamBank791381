import { Suspense, lazy, useContext, useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import type { Question, QuestionPart } from "../../studentQuestionTypes";
import { answered, type Answer } from "../../answerState";
import { compositeChildKey, compositeShape, selectCompositeCountedParts } from "../../compositeModel";
import { resolveStudentRenderer, studentUnsupported } from "../studentRegistry";
import StudentUnsupported from "../StudentUnsupported";
import CompoundPartControl from "../../CompoundPartControl";
import { partLabel } from "../../examStructure";
import { ScenarioSources } from "../../scenario/ScenarioView";
import type { ScenarioV1, SourceStimulusV1 } from "../../scenarioSource";
import { projectSmartSimForStudent } from "../../trustedSimPlugins";
import { resolveSmartSimUi } from "../../trustedSim/smartSimUiRegistry";
import { TeacherPreviewContext } from "../studentAttemptContext";
import type { JsonValue } from "../../smartsimState";
import "../../composite/composite-student.css";
// Phase 20D.1 — a part's (already strictly projected) richContent is its prompt, through the shared trusted renderer (lazy; the strict
// authority re-checks it, memoized); anything else keeps the plain part text. Answers, identities and the first-N rule are untouched.
const RichText = lazy(() => import("../../richContent/RichPrompt").then(m => ({ default: m.RichText })));

// Phase 20D — the composite@1 student renderer (lazy; student exam AND teacher preview). It reads ONLY the public projection `q.composite`
// (the server sanitizer already removed every private key) and fails closed as a whole: a malformed or unavailable root renders one explicit
// "unavailable" note, never a partial question. Layout: every shared context ONCE (source contexts through the 19G ScenarioSources; SmartSim
// contexts through the plugin's lazy workspace, exactly like SmartSimResponse), then each group with its parts. A part renders through the
// SAME student registry a standalone question uses (its id is the server-owned child key, so coding practice runs target the child), a legacy
// part through the extracted compound control, an unknown identity through StudentUnsupported, and a part LINKED to a shared SmartSim context
// renders no simulator (it is scored from the context). Every emission is the FULL canonical Answer {kind:"composite", parts, contexts}.
// First-N groups mark answered-but-not-counted parts as excess with the SAME selection rule the server grades with.

type Ctx = { id: string; kind: string; title?: string; instructions?: string; sources?: unknown; smartSim?: unknown };
type Child = QuestionPart & { contextId?: string };
type Group = { id: string; title?: string; instructions?: string; gradingPolicy: string; requiredAnswers: number | null; maxMarks: number | null; parts: Child[] };
type Composite = { contexts: Ctx[]; groups: Group[] };
type CompositeAnswer = { kind: "composite"; parts: Record<string, Answer>; contexts: Record<string, Answer> };

const EMPTY: readonly unknown[] = Object.freeze([]);
const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const imageList = (p: QuestionPart) => (p.image?.exists && p.image.visible && Array.isArray(p.image.assets) ? p.image.assets : Array.isArray(p.images) ? p.images : []);
const without = <T,>(rec: Record<string, T>, key: string): Record<string, T> => { const next = { ...rec }; delete next[key]; return next; };

/** The public projection, or null when it is unavailable / malformed (the light shape authority decides; nothing is repaired). */
function readComposite(q: Question): Composite | null {
  const root = (q as { composite?: unknown }).composite;
  if (!isObj(root) || root.status === "unavailable" || !Array.isArray(root.contexts) || !Array.isArray(root.groups)) return null;
  if (!compositeShape(q).ok) return null;
  return { contexts: root.contexts as Ctx[], groups: root.groups as Group[] };
}

function SourceContext({ ctx }: { ctx: Ctx }) {
  if (!Array.isArray(ctx.sources)) return <p className="ncli-unavailable" role="note">هذا المصدر المشترك غير متاح.</p>;
  const scenario: ScenarioV1 = { id: ctx.id, version: 1, sources: ctx.sources as SourceStimulusV1[], questionIds: [] };
  return <ScenarioSources scenario={scenario} />;
}

function SimContext({ ctx, answer, onAnswer, disabled, label }: { ctx: Ctx; answer: Answer | undefined; onAnswer: (next: Answer) => void; disabled?: boolean; label: string }) {
  const env = useMemo(() => projectSmartSimForStudent(ctx.smartSim), [ctx]);
  const preview = useContext(TeacherPreviewContext);
  const ui = env ? resolveSmartSimUi(env.pluginKey, env.pluginVersion) : undefined;
  const stored = answer?.kind === "smartSim" && env && answer.pluginKey === env.pluginKey && answer.pluginVersion === env.pluginVersion && Array.isArray(answer.actions) ? answer.actions : EMPTY;
  if (!env || !ui) return <p className="ncli-unavailable" role="note" data-testid="smartsim-unavailable">هذه المحاكاة غير متوفرة في هذا الإصدار من التطبيق؛ لا يمكن عرضها.</p>;
  const { Workspace } = ui;
  return (
    <div className="iex-smartsim" data-testid="smartsim-response" data-plugin={env.pluginKey + "@" + env.pluginVersion}>
      <Suspense fallback={<p role="status">جارٍ تحميل المحاكاة...</p>}>
        <Workspace config={env.config} actions={stored} disabled={disabled} label={label} preview={preview}
          onChange={(actions, state) => onAnswer({ kind: "smartSim", pluginKey: env.pluginKey, pluginVersion: env.pluginVersion, actions: actions as JsonValue[], state: state as JsonValue } as Answer)} />
      </Suspense>
    </div>
  );
}

export default function CompositeResponse({ q, id, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const model = useMemo(() => readComposite(q), [q]);
  const current: CompositeAnswer = answer?.kind === "composite" ? answer : { kind: "composite", parts: {}, contexts: {} };
  const parts = isObj(current.parts) ? current.parts : {}, contexts = isObj(current.contexts) ? current.contexts : {};
  const selection = useMemo(() => selectCompositeCountedParts(q, answer), [q, answer]);   // the shared first-N rule (non-composite answer ⇒ nothing answered)
  if (!model) return <p className="ncli-unavailable" role="note" data-testid="composite-unavailable">هذا السؤال المركّب غير متاح في هذا الإصدار من التطبيق؛ لا يمكن عرضه.</p>;
  const emit = (nextParts: Record<string, Answer>, nextContexts: Record<string, Answer>) => onAnswer({ kind: "composite", parts: nextParts, contexts: nextContexts });
  const setPart = (pid: string, a: Answer) => emit({ ...parts, [pid]: a }, contexts);
  const setContext = (cid: string, a: Answer) => emit(parts, { ...contexts, [cid]: a });
  const ctxTitle = (c: Ctx | undefined) => c?.title || (c?.kind === "smartSim" ? "المحاكاة" : "المصادر المشتركة");
  const base = "cmp-" + safeId(id);
  const hasAny = Object.keys(parts).length + Object.keys(contexts).length > 0;
  let ordinal = 0;
  return (
    <div className="cmp-response" dir="rtl" data-testid="composite-response">
      {model.contexts.map(c => {
        const hid = base + "-ctx-" + safeId(c.id), title = ctxTitle(c);
        return (
          <section className="cmp-context" aria-labelledby={hid} data-context-id={c.id} data-kind={c.kind} key={c.id}>
            <div className="cmp-context-head">
              <h4 id={hid} className="cmp-context-title"><span className="iex-section-eyebrow">{c.kind === "smartSim" ? "محاكاة مشتركة" : "مصدر مشترك"}</span>{title}</h4>
              {c.kind === "smartSim" && contexts[c.id] !== undefined && !disabled && <button type="button" className="cmp-reset" aria-label={"إعادة ضبط «" + title + "»"} onClick={() => emit(parts, without(contexts, c.id))}>إعادة ضبط</button>}
            </div>
            {c.instructions && <p className="cmp-context-instructions">{c.instructions}</p>}
            {c.kind === "source" ? <SourceContext ctx={c} /> : c.kind === "smartSim" ? <SimContext ctx={c} answer={contexts[c.id]} onAnswer={a => setContext(c.id, a)} disabled={disabled} label={labelPrefix + " — " + title} /> : <p className="ncli-unavailable" role="note">هذا السياق المشترك غير متاح.</p>}
          </section>
        );
      })}
      {model.groups.map(g => {
        const hid = base + "-grp-" + safeId(g.id);
        return (
          <section className="cmp-group" aria-labelledby={g.title ? hid : undefined} aria-label={g.title ? undefined : "مجموعة بنود"} data-group-id={g.id} key={g.id}>
            {(g.title || g.gradingPolicy === "firstNAnswered") && <div className="cmp-group-head">
              {g.title && <h4 id={hid} className="cmp-group-title">{g.title}</h4>}
              {g.gradingPolicy === "firstNAnswered" && g.requiredAnswers !== null && <span className="cmp-group-rule">{"أجب عن " + g.requiredAnswers + " من " + g.parts.length}{g.maxMarks !== null ? " — " + g.maxMarks + " علامة" : ""}</span>}
            </div>}
            {g.instructions && <p className="cmp-group-instructions">{g.instructions}</p>}
            <div className="cmp-parts">{g.parts.map(child => {
              const pid = child.id, label = partLabel(child, ordinal++), pAns = parts[pid];
              const rich = (child as { richContent?: unknown }).richContent, hasRich = !!rich && typeof rich === "object";
              const key = compositeChildKey(id, pid), textId = child.text || hasRich ? "cmp-part-" + safeId(key) : undefined;
              const name = labelPrefix + (g.title ? " — " + g.title : "") + " — البند " + label;
              const linked = child.type === "smartSim" && typeof child.contextId === "string";
              const registered = linked ? undefined : resolveStudentRenderer(child.type, child.questionTypeVersion);
              const unsupported = !linked && !registered && studentUnsupported(child.type, child.questionTypeVersion);
              const excess = !!selection.get(pid)?.ignored, done = answered(pAns);
              return (
                <div className={"cmp-part" + (done ? " done" : "") + (excess ? " cmp-part-excess" : "")} data-part-id={pid} role="group" aria-label={name} key={pid}>
                  <div className="cmp-part-head">
                    <b className="cmp-part-label" aria-hidden="true">{label}</b>
                    <span className="cmp-part-marks">{child.marks} علامة</span>
                    {done && <span className="cmp-part-state">تمت الإجابة</span>}
                    {pAns !== undefined && !disabled && <button type="button" className="cmp-reset" aria-label={"مسح إجابة البند " + label} onClick={() => emit(without(parts, pid), contexts)}>مسح</button>}
                  </div>
                  {hasRich
                    ? <Suspense fallback={child.text ? <p className="cmp-part-text" id={textId}>{child.text}</p> : null}><RichText raw={rich} id={textId} className="cmp-part-text" fallback={child.text ? <p className="cmp-part-text" id={textId}>{child.text}</p> : null} /></Suspense>
                    : child.text && <p className="cmp-part-text" id={textId}>{child.text}</p>}
                  {!registered?.ownsImage && imageList(child).map((im, n) => im?.dataUrl ? <img className="iex-image" src={im.dataUrl} alt={"صورة البند " + label} key={n} /> : null)}
                  {linked && <p className="cmp-part-linked" role="note">{"تُجاب في «" + ctxTitle(model.contexts.find(c => c.id === child.contextId)) + "» أعلاه"}</p>}
                  {registered && <Suspense fallback={<p className="iex-loading" role="status">جارٍ تحميل البند…</p>}><registered.Renderer q={{ ...child, presentationType: child.type } as unknown as Question} id={key} answer={pAns} onAnswer={a => setPart(pid, a)} disabled={disabled} labelPrefix={name} textId={textId} /></Suspense>}
                  {unsupported && <StudentUnsupported />}
                  {!linked && !registered && !unsupported && <CompoundPartControl p={child} idBase={key} answer={pAns} onAnswer={a => setPart(pid, a)} disabled={disabled} textId={textId} name={name} />}
                  {excess && <div className="iex-extra-hint cmp-excess-hint">إجابة إضافية — لن تدخل في التصحيح</div>}
                </div>
              );
            })}</div>
          </section>
        );
      })}
      {hasAny && !disabled && <div className="cmp-actions"><button type="button" className="cmp-reset cmp-reset-all" onClick={() => emit({}, {})}>مسح إجابات السؤال كله</button></div>}
    </div>
  );
}
