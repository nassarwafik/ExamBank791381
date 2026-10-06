import { lazy, Suspense, useId, useMemo, useRef, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { BuilderPart, BuilderPartType, QuestionBody } from "../../examTypes";
import { COMPOSITE_CHILD_IDENTITIES, COMPOSITE_LIMITS, compositeOfficialMaxMarks, validateCompositeQuestion } from "../../compositeQuestion";
import { effectiveQuestionTypeVersion, questionTypeLabel } from "../../questionTypeCatalog";
import { changePartType, duplicatePart, genId, mergePatch, moveInArray, newPart, ordinalLabel } from "../../examBuilderState";
import { typeSpecificContentPresent } from "../typeContent";
import QuestionBodyEditor from "../../QuestionBodyEditor";
import { listSmartSimPlugins } from "../../trustedSimPlugins";
import { resolveSmartSimUi, type SmartSimEditorProps } from "../../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../../trustedSim/smartSimStarters";
import { newSourceStimulus } from "../../scenarioBuilderOps";
import { SCENARIO_LIMITS, SCENARIO_SOURCE_KINDS, SCENARIO_SOURCE_KIND_LABELS, type SourceStimulusKind } from "../../scenarioSource";
import { CODE_STIMULUS_LANGUAGES } from "../../codeStimulus";
import { readImageFile, MEDIA_MSG } from "../../questionMedia";
import { useConfirm } from "../../ui/useConfirm";
import "../../composite/composite-editor.css";
import { SCENARIO_RICH_SOURCE_KIND } from "../../scenarioSource";
import type { RichContentV1 } from "../../richContent/richContentModel";
// Phase 20D.1 — the rich-content block editor (per-part rich prompt, rich shared sources) is lazy: loaded only when a teacher opens it.
const RichContentEditor = lazy(() => import("../../richContent/RichContentEditor"));
const RICH_SOURCE_LABEL = "محتوى منسق";
/** A new rich shared source: an EMPTY document (the validator asks for content until the teacher adds blocks — no placeholder leaks). */
const newRichSource = (overrides: Obj = {}): Obj => ({ id: genId("src"), version: 1, kind: SCENARIO_RICH_SOURCE_KIND, richContent: { schemaVersion: 1, blocks: [] }, ...overrides });

// Phase 20D — composite@1 ENTERPRISE authoring (lazy). It edits the type-owned root `composite` only, always emitting a FRESH root
// ({ composite }) through onChange; the question mark is changed ONLY by the explicit "use the official total" button ({ marks }).
//   • groups: add / duplicate / delete (confirmed) / reorder, title + instructions, grading policy (all ↔ firstNAnswered) with its
//     required answers and maximum;
//   • parts: add / duplicate / delete (confirmed) / reorder / move to another group, label, marks, prompt, exact child identity (type +
//     supported version from the code-owned vocabulary — never "latest"; a destructive change is confirmed) and a link to a shared context;
//   • shared contexts: static SOURCES (text / code / table / image) and SmartSim workspaces (the plugin's own lazy editor in config usage);
//     removing a context unlinks its parts (confirmed).
// Every child body is edited by the EXISTING QuestionBodyEditor host. The ONE composite-specific linkage: a SmartSim part linked to a shared
// SmartSim context edits only its private checks through the plugin editor, given the CONTEXT's config; a config change it emits is routed
// back to the context (never duplicated on the part). The strict authority (validateCompositeQuestion) is shown inline; nothing is repaired.
type Obj = Record<string, unknown>;
type Ops = ReturnType<typeof useCompositeOps>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const fmt = (n: number): string => String(Math.round(n * 100) / 100);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const EPS = 1e-9;
/** Drop keys whose value is undefined (changePartType carries optional keys verbatim). */
const clean = (o: Obj): Obj => { const out: Obj = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out; };
const asBody = (patch: Obj): Partial<QuestionBody> => patch as unknown as Partial<QuestionBody>;

/** The code-owned child vocabulary: unique type keys (catalog order of the identities) and the EXACT versions each family supports. */
const CHILD_TYPES: readonly string[] = [...new Set(COMPOSITE_CHILD_IDENTITIES.map(i => i.slice(0, i.lastIndexOf("@"))))];
const childVersions = (type: string): number[] => COMPOSITE_CHILD_IDENTITIES.filter(i => i.slice(0, i.lastIndexOf("@")) === type).map(i => Number(i.slice(i.lastIndexOf("@") + 1)));
const POLICY_LABEL: Readonly<Record<string, string>> = Object.freeze({ all: "جميع البنود", firstNAnswered: "أول عدد محدد من الإجابات" });
const CONTEXT_KIND_LABEL: Readonly<Record<string, string>> = Object.freeze({ source: "مصدر مشترك", smartSim: "محاكاة مشتركة" });

/** A group's OFFICIAL maximum as the authority computes it: Σ part marks for "all", the explicit maximum for "firstNAnswered". */
const groupOfficialMax = (g: Obj): number => (g.gradingPolicy === "firstNAnswered" ? num(g.maxMarks) : objs(g.parts).reduce((s, p) => s + num(p.marks), 0));
const equalMarks = (parts: Obj[]): boolean => parts.length > 0 && parts.every(p => Math.abs(num(p.marks) - num(parts[0].marks)) <= EPS);
const contextName = (c: Obj, i: number): string => str(c.title).trim() || (CONTEXT_KIND_LABEL[str(c.kind)] ?? "سياق") + " " + (i + 1);
const smartSimEnvelope = (pluginKey: string, pluginVersion: number): Obj => ({ schemaVersion: 1, pluginKey, pluginVersion, config: smartSimStarterConfig(pluginKey, pluginVersion) });
const newGroup = (labelIndex: number): Obj => ({ id: genId("g"), title: "", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [newChild("multipleChoice", labelIndex)] });
function newChild(type: string, labelIndex: number): Obj {
  return clean(newPart(type as BuilderPartType, { marks: 1, label: ordinalLabel(labelIndex) }) as unknown as Obj);
}
/** The default root offered by the explicit (confirmed) reset of a malformed / unsupported root — the composite@1 type defaults. */
const defaultRoot = (): Obj => ({ v: 1, contexts: [], groups: [newGroup(0)] });

/**
 * Re-initialises a part as (type, version) through the canonical factories (changePartType for a type change, newPart for an exact version):
 * identity, label, prompt, marks, classification and media are carried; the type-specific body restarts from the code-owned defaults. The
 * shared-context link is re-applied when still meaningful: any child may read a context for presentation; a SmartSim child links only to a
 * SmartSim context (it then carries no envelope of its own and starts with an empty private key).
 */
function rebuildPart(p: Obj, type: string, version: number | undefined, contexts: Obj[]): Obj {
  const carried: Obj = { id: p.id, label: p.label, text: p.text, marks: p.marks, assessmentMeta: p.assessmentMeta };
  const base = version === undefined
    ? (changePartType(p as unknown as BuilderPart, type as BuilderPartType) as unknown as Obj)
    : (newPart(type as BuilderPartType, { ...carried, questionTypeVersion: version } as Partial<BuilderPart>) as unknown as Obj);
  // Phase 20D.1 — the rich prompt is presentation and is carried too, except into parametricNumeric (a template stem: rich is forbidden).
  const next = clean({ ...base, ...clean(carried), image: p.image, images: p.images, richContent: type === "parametricNumeric" ? undefined : p.richContent });
  delete next.activity;
  const ctx = typeof p.contextId === "string" ? contexts.find(c => c.id === p.contextId) : undefined;
  if (!ctx) return next;
  if (type !== "smartSim") return { ...next, contextId: ctx.id };
  if (ctx.kind !== "smartSim") return next;
  const { smartSim: _own, ...linked } = next;
  void _own;
  return { ...linked, contextId: ctx.id, answer: { scoring: "proportional", checks: [] } };
}

function useCompositeOps(n: Obj, onChange: AuthoringEditorProps["onChange"]) {
  const root = isObj(n.composite) ? n.composite : {};
  const groups = Array.isArray(root.groups) ? (root.groups as unknown[]) : [];
  const contexts = Array.isArray(root.contexts) ? (root.contexts as unknown[]) : [];
  const ctxList = objs(contexts);
  const totalParts = objs(groups).reduce((s, g) => s + objs(g.parts).length, 0);
  const emit = (next: { groups?: unknown[]; contexts?: unknown[] }) => onChange(asBody({ composite: { ...root, groups: next.groups ?? groups, contexts: next.contexts ?? contexts } }));
  const mapGroups = (fn: (g: Obj) => Obj) => groups.map(g => (isObj(g) ? fn(g) : g));
  const mapParts = (fn: (p: Obj) => Obj) => mapGroups(g => (Array.isArray(g.parts) ? { ...g, parts: g.parts.map(p => (isObj(p) ? fn(p) : p)) } : g));
  const withGroup = (gid: unknown, fn: (g: Obj) => Obj) => mapGroups(g => (g.id === gid ? fn(g) : g));
  const groupIndex = (gid: unknown) => groups.findIndex(g => isObj(g) && g.id === gid);
  const contextById = (cid: unknown) => ctxList.find(c => c.id === cid);
  return {
    root, groups, contexts, ctxList, totalParts, contextById,
    // ── groups ──
    addGroup: () => emit({ groups: [...groups, newGroup(totalParts)] }),
    patchGroup: (gid: unknown, patch: Obj) => emit({ groups: withGroup(gid, g => mergePatch(g, patch)) }),
    moveGroup: (gid: unknown, delta: number) => emit({ groups: moveInArray(groups, groupIndex(gid), delta) }),
    deleteGroup: (gid: unknown) => emit({ groups: groups.filter(g => !(isObj(g) && g.id === gid)) }),
    duplicateGroup: (gid: unknown) => {
      const i = groupIndex(gid);
      if (i < 0) return;
      const copy = clone(groups[i] as Obj);
      copy.id = genId("g");
      copy.parts = objs(copy.parts).map(p => ({ ...p, id: genId("p") }));
      emit({ groups: [...groups.slice(0, i + 1), copy, ...groups.slice(i + 1)] });
    },
    setPolicy: (gid: unknown, policy: string) => emit({ groups: withGroup(gid, g => {
      if (policy !== "firstNAnswered") return { ...g, gradingPolicy: "all", requiredAnswers: null, maxMarks: null };
      const parts = objs(g.parts), required = parts.length > 1 ? parts.length - 1 : 1;
      return { ...g, gradingPolicy: "firstNAnswered", requiredAnswers: required, maxMarks: required * (num(parts[0]?.marks) || 1) };
    }) }),
    setRequired: (gid: unknown, required: number) => emit({ groups: withGroup(gid, g => {
      const parts = objs(g.parts);
      // the group maximum is DERIVED (required × the common part mark) whenever the part marks are equal; otherwise it is left as typed
      return { ...g, requiredAnswers: required, ...(equalMarks(parts) && Number.isInteger(required) && required > 0 ? { maxMarks: required * num(parts[0].marks) } : {}) };
    }) }),
    equalizeMarks: (gid: unknown) => emit({ groups: withGroup(gid, g => {
      const parts = objs(g.parts), m = num(parts[0]?.marks) || 1;
      return { ...g, parts: (g.parts as unknown[]).map(p => (isObj(p) ? { ...p, marks: m } : p)), ...(typeof g.requiredAnswers === "number" ? { maxMarks: g.requiredAnswers * m } : {}) };
    }) }),
    // ── parts ──
    addPart: (gid: unknown) => emit({ groups: withGroup(gid, g => ({ ...g, parts: [...(Array.isArray(g.parts) ? g.parts : []), newChild("multipleChoice", totalParts)] })) }),
    patchPart: (pid: unknown, fn: (p: Obj) => Obj) => emit({ groups: mapParts(p => (p.id === pid ? fn(p) : p)) }),
    movePart: (gid: unknown, pid: unknown, delta: number) => emit({ groups: withGroup(gid, g => {
      const parts = Array.isArray(g.parts) ? g.parts : [];
      return { ...g, parts: moveInArray(parts, parts.findIndex(p => isObj(p) && p.id === pid), delta) };
    }) }),
    duplicatePart: (gid: unknown, pid: unknown) => emit({ groups: withGroup(gid, g => {
      const parts = duplicatePart(objs(g.parts) as unknown as BuilderPart[], String(pid)) as unknown as Obj[];
      const at = parts.findIndex(p => p.id === pid) + 1;
      if (at > 0 && parts[at] && typeof parts[at].label === "string") parts[at] = { ...parts[at], label: ordinalLabel(totalParts) };
      return { ...g, parts };
    }) }),
    deletePart: (pid: unknown) => emit({ groups: mapGroups(g => (Array.isArray(g.parts) ? { ...g, parts: g.parts.filter(p => !(isObj(p) && p.id === pid)) } : g)) }),
    movePartToGroup: (pid: unknown, targetGid: unknown) => {
      const part = objs(groups).flatMap(g => objs(g.parts)).find(p => p.id === pid);
      if (!part || groupIndex(targetGid) < 0) return;
      emit({ groups: mapGroups(g => {
        const parts = (Array.isArray(g.parts) ? g.parts : []).filter(p => !(isObj(p) && p.id === pid));
        return g.id === targetGid ? { ...g, parts: [...parts, part] } : Array.isArray(g.parts) ? { ...g, parts } : g;
      }) });
    },
    rebuildPart: (pid: unknown, type: string, version?: number) => emit({ groups: mapParts(p => (p.id === pid ? rebuildPart(p, type, version, ctxList) : p)) }),
    /** Link / unlink a part. A SmartSim part linking to a SmartSim context drops its own envelope (its private checks restart empty unless
     *  its envelope equals the context's); unlinking gives it a copy of the context envelope, so its checks keep their meaning. */
    linkPart: (pid: unknown, cid: string) => emit({ groups: mapParts(p => {
      if (p.id !== pid) return p;
      const target = cid ? contextById(cid) : undefined;
      if (p.type !== "smartSim") return mergePatch(p, { contextId: target ? target.id : undefined });
      const current = typeof p.contextId === "string" ? contextById(p.contextId) : undefined;
      const key = isObj(p.answer) ? p.answer : {};
      if (!target) {
        const { contextId: _c, ...rest } = p;
        void _c;
        return { ...rest, smartSim: current?.kind === "smartSim" && isObj(current.smartSim) ? clone(current.smartSim) : smartSimEnvelope("networkTopology", 1) };
      }
      if (target.kind !== "smartSim") return p;
      const own = p.contextId === undefined ? p.smartSim : current?.smartSim;
      const keep = JSON.stringify(own) === JSON.stringify(target.smartSim);
      const { smartSim: _s, ...rest } = p;
      void _s;
      return { ...rest, contextId: target.id, answer: { scoring: key.scoring ?? "proportional", checks: keep && Array.isArray(key.checks) ? key.checks : [] } };
    }) }),
    /** A linked SmartSim part's plugin editor: checks / scoring → the part's private key; config → the SHARED context. */
    linkedSimChange: (pid: unknown, cid: unknown, next: { config?: unknown; checks?: unknown[]; scoring?: unknown }) => {
      const nextContexts = next.config === undefined ? contexts : contexts.map(c => (isObj(c) && c.id === cid && isObj(c.smartSim) ? { ...c, smartSim: { ...c.smartSim, config: next.config } } : c));
      const nextGroups = next.checks === undefined && next.scoring === undefined ? groups : mapParts(p => {
        if (p.id !== pid) return p;
        const key = isObj(p.answer) ? p.answer : {};
        return { ...p, answer: { scoring: next.scoring !== undefined ? next.scoring : key.scoring ?? "proportional", checks: next.checks !== undefined ? next.checks : Array.isArray(key.checks) ? key.checks : [] } };
      });
      emit({ groups: nextGroups, contexts: nextContexts });
    },
    // ── contexts ──
    addSourceContext: () => emit({ contexts: [...contexts, { id: genId("ctx"), version: 1, kind: "source", title: "", sources: [newSourceStimulus("text")] }] }),
    addSmartSimContext: (pluginKey: string, pluginVersion: number) => emit({ contexts: [...contexts, { id: genId("ctx"), version: 1, kind: "smartSim", title: "", smartSim: smartSimEnvelope(pluginKey, pluginVersion) }] }),
    patchContext: (cid: unknown, patch: Obj) => emit({ contexts: contexts.map(c => (isObj(c) && c.id === cid ? mergePatch(c, patch) : c)) }),
    moveContext: (cid: unknown, delta: number) => emit({ contexts: moveInArray(contexts, contexts.findIndex(c => isObj(c) && c.id === cid), delta) }),
    /** Replaces a SmartSim context's plugin (starter config); every linked part's checks restart empty (they belonged to the old plugin). */
    setContextPlugin: (cid: unknown, pluginKey: string, pluginVersion: number) => emit({
      contexts: contexts.map(c => (isObj(c) && c.id === cid ? { ...c, smartSim: smartSimEnvelope(pluginKey, pluginVersion) } : c)),
      groups: mapParts(p => (p.type === "smartSim" && p.contextId === cid ? { ...p, answer: { scoring: isObj(p.answer) && p.answer.scoring !== undefined ? p.answer.scoring : "proportional", checks: [] } } : p))
    }),
    deleteContext: (cid: unknown) => {
      const ctx = contextById(cid);
      emit({
        contexts: contexts.filter(c => !(isObj(c) && c.id === cid)),
        groups: mapParts(p => {
          if (p.contextId !== cid) return p;
          const { contextId: _c, ...rest } = p;
          void _c;
          return p.type === "smartSim" && ctx?.kind === "smartSim" && isObj(ctx.smartSim) ? { ...rest, smartSim: clone(ctx.smartSim) } : rest;
        })
      });
    }
  };
}

export default function CompositeEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const n = node as unknown as Obj;
  const { confirm, confirmDialog } = useConfirm();
  const issues = useMemo(() => validateCompositeQuestion(n).filter(i => i.severity === "error"), [n]);
  const ops = useCompositeOps(n, onChange);
  const plugins = listSmartSimPlugins();
  const [simPlugin, setSimPlugin] = useState(() => (plugins[0] ? plugins[0].key + "@" + plugins[0].version : ""));
  const root = n.composite;

  if (!isObj(root) || root.v !== 1 || !Array.isArray(root.groups) || !Array.isArray(root.contexts)) {
    const reset = async () => {
      if (await confirm({ title: "إنشاء بنية جديدة", message: "بنية هذا السؤال المركّب مفقودة أو بإصدار غير مدعوم، ولن تُرقّى تلقائيًا.\nسيُستبدل ما فيها ببنية جديدة من مجموعة واحدة وبند واحد.", confirmLabel: "استبدال البنية", tone: "danger" })) onChange(asBody({ composite: defaultRoot() }));
    };
    return (
      <div className="cmp-editor" dir="rtl">
        <p className="qt-unsupported" role="note" data-testid="composite-editor-unsupported">بنية السؤال المركّب المتقدّم مفقودة أو بإصدار غير مدعوم في هذا الإصدار من التطبيق؛ لن تُعاد تفسيرها ولن تُقبل في الاعتماد النهائي.</p>
        <button type="button" className="sb-mini-btn" onClick={() => void reset()} disabled={disabled}>إنشاء بنية جديدة…</button>
        {confirmDialog}
      </div>
    );
  }

  const groups = ops.groups, ctxList = ops.ctxList;
  const official = compositeOfficialMaxMarks(n) ?? objs(groups).reduce((s, g) => s + groupOfficialMax(g), 0);
  const questionMarks = Number(n.marks);
  const mismatch = !Number.isFinite(questionMarks) || Math.abs(questionMarks - official) > EPS;
  const smartSimContexts = ctxList.filter(c => c.kind === "smartSim").length, sourceContexts = ctxList.filter(c => c.kind === "source").length;
  const canAddContext = ctxList.length < COMPOSITE_LIMITS.contexts;
  const labels = new Map<unknown, string>();
  objs(groups).forEach(g => objs(g.parts).forEach(p => { labels.set(p.id, str(p.label).trim() || ordinalLabel(labels.size)); }));

  const removeGroup = async (g: Obj, i: number) => {
    if (await confirm({ title: "حذف المجموعة", message: "ستُحذف المجموعة " + (str(g.title).trim() ? "«" + str(g.title) + "»" : i + 1) + " وبنودها (" + objs(g.parts).length + ") بإجاباتها النموذجية.", confirmLabel: "حذف المجموعة", tone: "danger" })) ops.deleteGroup(g.id);
  };
  const removeContext = async (c: Obj, i: number) => {
    const linked = objs(groups).flatMap(g => objs(g.parts)).filter(p => p.contextId === c.id).length;
    const message = "سيُحذف السياق «" + contextName(c, i) + "»." + (linked ? "\nسيُفكّ ربط " + linked + " بند به؛ تبقى البنود بإجاباتها، وبند المحاكاة المرتبط يأخذ نسخة مستقلة من إعداد المحاكاة." : "");
    if (await confirm({ title: "حذف السياق المشترك", message, confirmLabel: "حذف السياق", tone: "danger" })) ops.deleteContext(c.id);
  };
  const addSim = () => {
    const p = plugins.find(x => x.key + "@" + x.version === simPlugin);
    if (p) ops.addSmartSimContext(p.key, p.version);
  };

  return (
    <div className="cmp-editor" dir="rtl" data-testid="composite-editor">
      <div className="cmp-marks-summary" aria-live="polite">
        <span>المجموع الرسمي للمجموعات: <strong>{fmt(official)}</strong></span>
        <span>علامة السؤال: <strong>{Number.isFinite(questionMarks) ? fmt(questionMarks) : "—"}</strong></span>
        <span>{objs(groups).length} مجموعة · {ops.totalParts} بند · {ctxList.length} سياق مشترك</span>
      </div>
      {mismatch && (
        <div className="cmp-marks-mismatch" role="alert">
          <span>علامة السؤال ({Number.isFinite(questionMarks) ? fmt(questionMarks) : "—"}) لا تساوي مجموع العلامات الرسمية للمجموعات ({fmt(official)}). لا تُغيَّر العلامة تلقائيًا.</span>
          <button type="button" className="sb-mini-btn" onClick={() => onChange(asBody({ marks: official }))} disabled={disabled || !(official > 0)}>اعتماد المجموع الرسمي ({fmt(official)}) علامةً للسؤال</button>
        </div>
      )}

      <section className="cmp-editor-contexts" aria-label="السياقات المشتركة">
        <div className="sb-row-between">
          <strong>السياقات المشتركة ({ctxList.length})</strong>
          <div className="cmp-editor-tools">
            <button type="button" className="sb-mini-btn" onClick={ops.addSourceContext} disabled={disabled || !canAddContext || sourceContexts >= COMPOSITE_LIMITS.sourceContexts}>+ مصدر مشترك</button>
            <label className="sb-inline"><span>محاكاة</span>
              <select className="sb-input sb-input-sm" aria-label="نوع المحاكاة المشتركة الجديدة" value={simPlugin} onChange={e => setSimPlugin(e.target.value)} disabled={disabled}>
                {plugins.map(p => <option key={p.key + "@" + p.version} value={p.key + "@" + p.version}>{p.label}</option>)}
              </select>
            </label>
            <button type="button" className="sb-mini-btn" onClick={addSim} disabled={disabled || !simPlugin || !canAddContext || smartSimContexts >= COMPOSITE_LIMITS.smartSimContexts}>+ محاكاة مشتركة</button>
          </div>
        </div>
        {ctxList.length === 0 && <p className="sb-hint">لا توجد سياقات مشتركة. أضف نصًا أو كودًا أو جدولًا أو صورة يقرؤها عدة بنود، أو محاكاة واحدة تخدم عدة بنود.</p>}
        {(ops.contexts as unknown[]).map((c, i) => isObj(c)
          ? <ContextEditor key={String(c.id) + ":" + i} ctx={c} index={i} total={ops.contexts.length} ops={ops} disabled={disabled} onDelete={() => void removeContext(c, i)} confirm={confirm} />
          : <p key={"bad-" + i} className="sb-warn-text" role="note">سياق غير صالح في الموضع {i + 1}.</p>)}
      </section>

      {(groups as unknown[]).map((g, gi) => isObj(g)
        ? <GroupEditor key={String(g.id) + ":" + gi} group={g} index={gi} ops={ops} labels={labels} disabled={disabled} confirm={confirm} onDelete={() => void removeGroup(g, gi)} />
        : <p key={"bad-" + gi} className="sb-warn-text" role="note">مجموعة غير صالحة في الموضع {gi + 1}.</p>)}
      <button type="button" className="sb-add-btn" aria-label="إضافة مجموعة" onClick={ops.addGroup} disabled={disabled || groups.length >= COMPOSITE_LIMITS.groups || ops.totalParts >= COMPOSITE_LIMITS.parts}>+ إضافة مجموعة</button>

      {issues.length > 0 && (
        <ul className="cmp-editor-issues" data-testid="composite-issues" aria-label="مشكلات تمنع اعتماد السؤال">
          {issues.slice(0, 40).map((i, k) => <li key={k}>{i.message}</li>)}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}

type Confirm = ReturnType<typeof useConfirm>["confirm"];

function GroupEditor({ group: g, index, ops, labels, disabled, confirm, onDelete }: { group: Obj; index: number; ops: Ops; labels: Map<unknown, string>; disabled?: boolean; confirm: Confirm; onDelete: () => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(true);
  const parts = objs(g.parts);
  const firstN = g.gradingPolicy === "firstNAnswered";
  const linkedSim = parts.some(p => p.type === "smartSim" && p.contextId !== undefined);
  const name = "المجموعة " + (index + 1);
  const total = ops.groups.length;
  return (
    <section className="cmp-editor-group" aria-labelledby={"cmp-g-h-" + uid} data-group-id={String(g.id)}>
      <div className="cmp-editor-group-head">
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} aria-label={(open ? "طيّ " : "فتح ") + name} aria-expanded={open}>{open ? "▾" : "▸"}</button>
        <h4 id={"cmp-g-h-" + uid} className="cmp-editor-group-title">{name}{str(g.title).trim() ? " — " + str(g.title) : ""}</h4>
        <span className="cmp-editor-count">{parts.length} بند · الحد الرسمي {fmt(groupOfficialMax(g))}</span>
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="أعلى" aria-label={"تقديم " + name} onClick={() => ops.moveGroup(g.id, -1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" aria-label={"تأخير " + name} onClick={() => ops.moveGroup(g.id, 1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn" title="تكرار" aria-label={"تكرار " + name} onClick={() => ops.duplicateGroup(g.id)} disabled={disabled || total >= COMPOSITE_LIMITS.groups || ops.totalParts + parts.length > COMPOSITE_LIMITS.parts}>⧉</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label={"حذف " + name} onClick={onDelete} disabled={disabled || total <= 1}>×</button>
      </div>
      {open && (
        <div className="cmp-editor-group-body">
          <label className="sb-field-label" htmlFor={"cmp-g-t-" + uid}>عنوان المجموعة</label>
          <input id={"cmp-g-t-" + uid} className="sb-input" value={str(g.title)} maxLength={COMPOSITE_LIMITS.titleChars} placeholder="مثال: مجموعة أ — فهم النص" onChange={e => ops.patchGroup(g.id, { title: e.target.value })} disabled={disabled} />
          <label className="sb-field-label" htmlFor={"cmp-g-i-" + uid}>تعليمات المجموعة</label>
          <textarea id={"cmp-g-i-" + uid} className="sb-input sb-textarea" value={str(g.instructions)} maxLength={COMPOSITE_LIMITS.instructionsChars} placeholder="تظهر للطالب فوق بنود المجموعة (اختياري)" onChange={e => ops.patchGroup(g.id, { instructions: e.target.value || undefined })} disabled={disabled} />
          <div className="cmp-editor-policy">
            <label className="sb-inline"><span>قاعدة التصحيح</span>
              <select className="sb-input sb-input-sm" aria-label={"قاعدة تصحيح " + name} value={firstN ? "firstNAnswered" : "all"} onChange={e => ops.setPolicy(g.id, e.target.value)} disabled={disabled}>
                <option value="all">{POLICY_LABEL.all}</option>
                <option value="firstNAnswered" disabled={linkedSim && !firstN}>{POLICY_LABEL.firstNAnswered}</option>
              </select>
            </label>
            {firstN && <>
              <label className="sb-inline"><span>عدد الإجابات المطلوبة</span>
                <input className="sb-input sb-input-xs" type="number" min={1} max={parts.length} step={1} aria-label={"عدد الإجابات المطلوبة في " + name} value={typeof g.requiredAnswers === "number" ? g.requiredAnswers : ""} onChange={e => ops.setRequired(g.id, e.target.value === "" ? 0 : Number(e.target.value))} disabled={disabled} />
              </label>
              <label className="sb-inline"><span>العلامة القصوى للمجموعة</span>
                <input className="sb-input sb-input-xs" type="number" min={0} step={0.25} aria-label={"العلامة القصوى لـ" + name} value={typeof g.maxMarks === "number" ? g.maxMarks : ""} onChange={e => ops.patchGroup(g.id, { maxMarks: e.target.value === "" ? null : Number(e.target.value) })} disabled={disabled} />
              </label>
              {!equalMarks(parts) && <button type="button" className="sb-mini-btn" onClick={() => ops.equalizeMarks(g.id)} disabled={disabled}>توحيد علامات البنود</button>}
            </>}
          </div>
          {firstN
            ? <p className="sb-rule-explain">يُحتسب أول {typeof g.requiredAnswers === "number" ? g.requiredAnswers : "—"} بنود يجيب عنها الطالب بترتيب العرض؛ الإجابات الزائدة تُحفظ ولا تُصحَّح. بنود المجموعة بعلامات متساوية، والعلامة القصوى = العدد المطلوب × علامة البند.</p>
            : <p className="sb-rule-explain">تُصحَّح جميع البنود، والحد الرسمي للمجموعة = مجموع علامات بنودها.</p>}
          {linkedSim && <p className="sb-hint">بنود المحاكاة المرتبطة بسياق مشترك لا تُسمح في مجموعة «أول عدد محدد».</p>}
          {parts.map((p, pi) => <PartEditor key={String(p.id) + ":" + pi} part={p} group={g} index={pi} count={parts.length} label={labels.get(p.id) ?? ordinalLabel(pi)} ops={ops} disabled={disabled} confirm={confirm} />)}
          <button type="button" className="sb-mini-btn" onClick={() => ops.addPart(g.id)} disabled={disabled || ops.totalParts >= COMPOSITE_LIMITS.parts}>+ إضافة بند إلى {name}</button>
        </div>
      )}
    </section>
  );
}

function PartEditor({ part: p, group: g, index, count, label, ops, disabled, confirm }: { part: Obj; group: Obj; index: number; count: number; label: string; ops: Ops; disabled?: boolean; confirm: Confirm }) {
  const type = str(p.type);
  const versions = childVersions(type);
  const version = effectiveQuestionTypeVersion(type, p.questionTypeVersion);
  const versionValue = String(version ?? p.questionTypeVersion ?? "");
  const ctx = typeof p.contextId === "string" ? ops.contextById(p.contextId) : undefined;
  const linkedSim = type === "smartSim" && p.contextId !== undefined;
  const name = "البند " + label;
  const otherGroups = objs(ops.groups).filter(x => x.id !== g.id);
  const hasContent = () => typeSpecificContentPresent({ ...p, presentationType: type });
  const [richOpen, setRichOpen] = useState(() => p.richContent !== undefined);

  const changeType = async (next: string) => {
    if (next === type) return;
    if (hasContent() && !(await confirm({ title: "تغيير نوع البند", message: "تغيير نوع " + name + " إلى «" + (questionTypeLabel(next) ?? next) + "» سيحذف الخيارات / الحقول / مفتاح الإجابة الخاصة بالنوع الحالي.\nيبقى نص البند وتسميته وعلامته وربطه بالسياق متى كان ممكنًا.", confirmLabel: "تغيير النوع", tone: "danger" }))) return;
    ops.rebuildPart(p.id, next);
  };
  const changeVersion = async (next: number) => {
    if (next === version) return;
    if (!(await confirm({ title: "تغيير إصدار البند", message: "تغيير " + name + " إلى الإصدار " + next + " يعيد إعداد النوع ومفتاح الإجابة إلى القيم الافتراضية لذلك الإصدار تحديدًا (لا ترقية تلقائية).", confirmLabel: "تغيير الإصدار", tone: "danger" }))) return;
    ops.rebuildPart(p.id, type, next);
  };
  const changeLink = async (cid: string) => {
    if (cid === (p.contextId ?? "")) return;
    const checks = isObj(p.answer) && Array.isArray(p.answer.checks) ? p.answer.checks : [];
    if (type === "smartSim" && cid && checks.length && !(await confirm({ title: "ربط بند المحاكاة بسياق مشترك", message: "سيقرأ " + name + " إعداد المحاكاة المشتركة بدل إعداده الخاص؛ ستُحذف فحوصه الحالية ما لم يكن إعداده مطابقًا لإعداد السياق.", confirmLabel: "ربط البند", tone: "danger" }))) return;
    ops.linkPart(p.id, cid);
  };
  const remove = async () => {
    if (await confirm({ title: "حذف البند", message: "سيُحذف " + name + " بإعداده وإجابته النموذجية.", confirmLabel: "حذف البند", tone: "danger" })) ops.deletePart(p.id);
  };

  return (
    <div className="cmp-editor-part sb-part" data-part-id={String(p.id)}>
      <div className="sb-part-head">
        <b className="sb-part-badge">{label}</b>
        <select className="sb-input sb-input-sm" aria-label={"نوع " + name} value={type} onChange={e => void changeType(e.target.value)} disabled={disabled}>
          {!CHILD_TYPES.includes(type) && <option value={type}>{"غير مدعوم: " + type}</option>}
          {CHILD_TYPES.map(t => <option key={t} value={t}>{questionTypeLabel(t) ?? t}</option>)}
        </select>
        {versions.length > 1 && (
          <select className="sb-input sb-input-sm" aria-label={"إصدار نوع " + name} value={versionValue} onChange={e => void changeVersion(Number(e.target.value))} disabled={disabled}>
            {!versions.includes(Number(versionValue)) && <option value={versionValue}>{"إصدار غير مدعوم: " + versionValue}</option>}
            {versions.map(v => <option key={v} value={String(v)}>{"الإصدار " + v}</option>)}
          </select>
        )}
        <input className="sb-input sb-input-sm" aria-label={"تسمية " + name} value={str(p.label)} maxLength={COMPOSITE_LIMITS.labelChars} placeholder="التسمية (أ، ب...)" onChange={e => ops.patchPart(p.id, x => mergePatch(x, { label: e.target.value || undefined }))} disabled={disabled} />
        <input className="sb-input sb-input-xs" type="number" min={0} step={0.25} aria-label={"علامة " + name} value={typeof p.marks === "number" ? p.marks : ""} placeholder="علامة" onChange={e => { const v = Number(e.target.value); ops.patchPart(p.id, x => ({ ...x, marks: e.target.value === "" || !Number.isFinite(v) ? 0 : v })); }} disabled={disabled} />
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="أعلى" aria-label={"تقديم " + name} onClick={() => ops.movePart(g.id, p.id, -1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" aria-label={"تأخير " + name} onClick={() => ops.movePart(g.id, p.id, 1)} disabled={disabled || index === count - 1}>↓</button>
        <button type="button" className="sb-icon-btn" title="تكرار" aria-label={"تكرار " + name} onClick={() => ops.duplicatePart(g.id, p.id)} disabled={disabled || ops.totalParts >= COMPOSITE_LIMITS.parts}>⧉</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label={"حذف " + name} onClick={() => void remove()} disabled={disabled}>×</button>
      </div>
      <div className="cmp-editor-part-links">
        <label className="sb-inline"><span>السياق المشترك</span>
          <select className="sb-input sb-input-sm" aria-label={"السياق المشترك لـ" + name} value={typeof p.contextId === "string" ? p.contextId : ""} onChange={e => void changeLink(e.target.value)} disabled={disabled}>
            <option value="">بلا سياق مشترك</option>
            {typeof p.contextId === "string" && !ctx && <option value={p.contextId}>سياق مفقود</option>}
            {ops.ctxList.map((c, i) => <option key={String(c.id)} value={String(c.id)} disabled={type === "smartSim" && c.kind !== "smartSim"}>{contextName(c, i)}</option>)}
          </select>
        </label>
        {otherGroups.length > 0 && (
          <label className="sb-inline"><span>نقل إلى</span>
            <select className="sb-input sb-input-sm" aria-label={"نقل " + name + " إلى مجموعة أخرى"} value="" onChange={e => { const target = e.target.value; if (target) ops.movePartToGroup(p.id, target); }} disabled={disabled}>
              <option value="">اختر مجموعة…</option>
              {otherGroups.map(x => <option key={String(x.id)} value={String(x.id)}>{"المجموعة " + (objs(ops.groups).indexOf(x) + 1) + (str(x.title).trim() ? " — " + str(x.title) : "")}</option>)}
            </select>
          </label>
        )}
      </div>
      <textarea className="sb-input sb-textarea sb-part-text" aria-label={"نص " + name} value={str(p.text)} placeholder="نص البند" onChange={e => ops.patchPart(p.id, x => ({ ...x, text: e.target.value }))} disabled={disabled} />
      {type === "parametricNumeric"
        ? (p.richContent !== undefined && <p className="sb-hint sb-warn-text" role="note">بند القالب العددي لا يقبل محتوى منسقًا (القالب يُولَّد من النص)؛ أزله قبل الاعتماد. <button type="button" className="sb-mini-btn" onClick={() => ops.patchPart(p.id, x => mergePatch(x, { richContent: undefined }))} disabled={disabled}>{"إزالة المحتوى المنسق من " + name}</button></p>)
        : (
          <div className="rc-host">
            <div className="rc-host-actions">
              <button type="button" className="sb-mini-btn" aria-expanded={richOpen} onClick={() => setRichOpen(o => !o)}>{"محتوى منسق لـ" + name}</button>
            </div>
            {richOpen && (
              <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرر المحتوى المنسق…</p>}>
                <RichContentEditor value={p.richContent as RichContentV1 | undefined} onChange={next => ops.patchPart(p.id, x => mergePatch(x, { richContent: next }))} disabled={disabled} plainText={str(p.text)} label={"نص " + name + " المنسق"} />
              </Suspense>
            )}
          </div>
        )}
      {linkedSim
        ? <LinkedSmartSimBody part={p} ctx={ctx} ops={ops} disabled={disabled} />
        : <QuestionBodyEditor node={p as unknown as QuestionBody} type={type} onChange={patch => ops.patchPart(p.id, x => mergePatch(x, patch as Obj))} disabled={disabled} />}
    </div>
  );
}

/** A SmartSim part scored on a SHARED context: the plugin editor receives the CONTEXT's config and the part's own checks / scoring. */
function LinkedSmartSimBody({ part: p, ctx, ops, disabled }: { part: Obj; ctx: Obj | undefined; ops: Ops; disabled?: boolean }) {
  const env = ctx && ctx.kind === "smartSim" && isObj(ctx.smartSim) ? ctx.smartSim : undefined;
  const ui = env ? resolveSmartSimUi(env.pluginKey, env.pluginVersion) : undefined;
  const key = isObj(p.answer) ? p.answer : {};
  if (!env || !ui) return <p className="ncli-unavailable" role="note">سياق المحاكاة المرتبط مفقود أو غير مدعوم في هذا الإصدار من التطبيق؛ لا يمكن تحرير فحوص هذا البند.</p>;
  const Editor = ui.Editor;
  const onSim: SmartSimEditorProps["onChange"] = next => ops.linkedSimChange(p.id, ctx?.id, next);
  return (
    <div className="cmp-editor-linked-sim">
      <p className="sb-hint">يقرأ هذا البند المحاكاة المشتركة «{str(ctx?.title).trim() || "المحاكاة المشتركة"}»؛ تُحرَّر هنا فحوصه الخاصة فقط، وأي تعديل لإعداد المحاكاة يُطبَّق على السياق المشترك.</p>
      <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرّر المحاكاة...</p>}>
        <Editor config={env.config} checks={Array.isArray(key.checks) ? key.checks : []} scoring={key.scoring} onChange={onSim} disabled={disabled} />
      </Suspense>
    </div>
  );
}

function ContextEditor({ ctx: c, index, total, ops, disabled, onDelete, confirm }: { ctx: Obj; index: number; total: number; ops: Ops; disabled?: boolean; onDelete: () => void; confirm: Confirm }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(true);
  const name = contextName(c, index);
  const linked = objs(ops.groups).flatMap(g => objs(g.parts)).filter(p => p.contextId === c.id).length;
  const known = c.kind === "source" || c.kind === "smartSim";
  return (
    <div className="cmp-editor-context" data-context-id={String(c.id)} data-kind={str(c.kind)}>
      <div className="cmp-editor-group-head">
        <button type="button" className="sb-collapse" onClick={() => setOpen(o => !o)} aria-label={(open ? "طيّ " : "فتح ") + name} aria-expanded={open}>{open ? "▾" : "▸"}</button>
        <span className="sb-scenario-badge cmp-editor-badge">{CONTEXT_KIND_LABEL[str(c.kind)] ?? "سياق غير مدعوم"}</span>
        <strong>{name}</strong>
        <span className="cmp-editor-count">مرتبط بـ {linked} بند</span>
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="أعلى" aria-label={"تقديم " + name} onClick={() => ops.moveContext(c.id, -1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" aria-label={"تأخير " + name} onClick={() => ops.moveContext(c.id, 1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label={"حذف " + name} onClick={onDelete} disabled={disabled}>×</button>
      </div>
      {open && known && (
        <div className="cmp-editor-group-body">
          <label className="sb-field-label" htmlFor={"cmp-c-t-" + uid}>عنوان السياق</label>
          <input id={"cmp-c-t-" + uid} className="sb-input" value={str(c.title)} maxLength={COMPOSITE_LIMITS.titleChars} placeholder="مثال: النص، الكود، محاكاة السقوط الحر" onChange={e => ops.patchContext(c.id, { title: e.target.value })} disabled={disabled} />
          <label className="sb-field-label" htmlFor={"cmp-c-i-" + uid}>تعليمات السياق</label>
          <textarea id={"cmp-c-i-" + uid} className="sb-input sb-textarea" value={str(c.instructions)} maxLength={COMPOSITE_LIMITS.instructionsChars} placeholder="تظهر للطالب مع السياق (اختياري)" onChange={e => ops.patchContext(c.id, { instructions: e.target.value || undefined })} disabled={disabled} />
          {c.kind === "source"
            ? <SourcesEditor ctx={c} ops={ops} disabled={disabled} confirm={confirm} />
            : <SmartSimContextBody ctx={c} linked={linked} ops={ops} disabled={disabled} confirm={confirm} />}
        </div>
      )}
      {open && !known && <p className="qt-unsupported" role="note">نوع هذا السياق أو إصداره غير مدعوم؛ يُحفظ كما هو ولن يُقبل في الاعتماد النهائي.</p>}
    </div>
  );
}

function SmartSimContextBody({ ctx: c, linked, ops, disabled, confirm }: { ctx: Obj; linked: number; ops: Ops; disabled?: boolean; confirm: Confirm }) {
  const env = isObj(c.smartSim) ? c.smartSim : {};
  const plugins = listSmartSimPlugins();
  const current = String(env.pluginKey) + "@" + String(env.pluginVersion);
  const known = plugins.some(p => p.key + "@" + p.version === current);
  const ui = resolveSmartSimUi(env.pluginKey, env.pluginVersion);
  const pick = async (id: string) => {
    const p = plugins.find(x => x.key + "@" + x.version === id);
    if (!p || id === current) return;
    if (!(await confirm({ title: "تغيير نوع المحاكاة المشتركة", message: "سيُستبدل إعداد المحاكاة بإعداد البداية للنوع الجديد" + (linked ? "، وستُحذف فحوص " + linked + " بند مرتبط بها (الفحوص خاصة بكل نوع)." : "."), confirmLabel: "تغيير النوع", tone: "danger" }))) return;
    ops.setContextPlugin(c.id, p.key, p.version);
  };
  const Editor = ui?.Editor;
  return (
    <div className="cmp-editor-sim">
      <label className="sb-inline"><span>نوع المحاكاة الموثوقة</span>
        <select className="sb-input sb-input-sm" aria-label={"نوع المحاكاة للسياق " + (str(c.title).trim() || String(c.id))} value={current} onChange={e => void pick(e.target.value)} disabled={disabled}>
          {!known && <option value={current}>غير معروفة ({current})</option>}
          {plugins.map(p => <option key={p.key + "@" + p.version} value={p.key + "@" + p.version}>{p.label}</option>)}
        </select>
      </label>
      <p className="sb-hint">إعداد المحاكاة مشترك بين البنود المرتبطة؛ فحوص كل بند تُحرَّر داخل البند نفسه.</p>
      {Editor
        ? <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرّر المحاكاة...</p>}><Editor config={env.config} checks={[]} scoring={undefined} onChange={next => { if (next.config !== undefined) ops.patchContext(c.id, { smartSim: { ...env, config: next.config } }); }} disabled={disabled} /></Suspense>
        : <p className="ncli-unavailable" role="note">هذه المحاكاة أو إصدارها غير مدعوم في هذا الإصدار من التطبيق؛ لا يمكن تحريرها.</p>}
    </div>
  );
}

function SourcesEditor({ ctx: c, ops, disabled, confirm }: { ctx: Obj; ops: Ops; disabled?: boolean; confirm: Confirm }) {
  const sources = Array.isArray(c.sources) ? (c.sources as unknown[]) : [];
  const setSources = (next: unknown[]) => ops.patchContext(c.id, { sources: next });
  const patchSource = (i: number, patch: Obj) => setSources(sources.map((s, k) => (k === i && isObj(s) ? mergePatch(s, patch) : s)));
  const remove = async (i: number) => {
    if (await confirm({ title: "حذف المصدر", message: "سيُحذف المصدر " + (i + 1) + " من هذا السياق المشترك.", confirmLabel: "حذف المصدر", tone: "danger" })) setSources(sources.filter((_, k) => k !== i));
  };
  const changeKind = async (i: number, kind: SourceStimulusKind | typeof SCENARIO_RICH_SOURCE_KIND) => {
    const s = sources[i];
    if (!isObj(s) || s.kind === kind) return;
    if (!(await confirm({ title: "تغيير نوع المصدر", message: "تغيير نوع المصدر " + (i + 1) + " يحذف محتواه الحالي.", confirmLabel: "تغيير النوع", tone: "danger" }))) return;
    const keep = { id: s.id, ...(typeof s.title === "string" ? { title: s.title } : {}) };
    setSources(sources.map((x, k) => (k === i ? (kind === SCENARIO_RICH_SOURCE_KIND ? newRichSource(keep) : newSourceStimulus(kind as SourceStimulusKind, keep)) : x)));
  };
  return (
    <div className="cmp-editor-sources">
      <div className="cmp-editor-tools">
        {SCENARIO_SOURCE_KINDS.map(k => <button key={k} type="button" className="sb-mini-btn" disabled={disabled || sources.length >= COMPOSITE_LIMITS.sourcesPerContext} onClick={() => setSources([...sources, newSourceStimulus(k)])}>+ {SCENARIO_SOURCE_KIND_LABELS[k]}</button>)}
        <button type="button" className="sb-mini-btn" disabled={disabled || sources.length >= COMPOSITE_LIMITS.sourcesPerContext} onClick={() => setSources([...sources, newRichSource()])}>+ {RICH_SOURCE_LABEL}</button>
      </div>
      {sources.length === 0 && <p className="sb-hint sb-warn-text">أضف مصدرًا واحدًا على الأقل.</p>}
      <ol className="sb-scenario-sources">
        {sources.map((s, i) => isObj(s)
          ? <SourceItem key={String(s.id) + ":" + i} source={s} index={i} total={sources.length} disabled={disabled} onPatch={patch => patchSource(i, patch)} onKind={k => void changeKind(i, k)} onMove={d => setSources(moveInArray(sources, i, d))} onDelete={() => void remove(i)} />
          : <li key={"bad-" + i} className="sb-warn-text">مصدر غير صالح في الموضع {i + 1}.</li>)}
      </ol>
    </div>
  );
}

type SourceItemProps = { source: Obj; index: number; total: number; disabled?: boolean; onPatch: (patch: Obj) => void; onKind: (k: SourceStimulusKind | typeof SCENARIO_RICH_SOURCE_KIND) => void; onMove: (delta: number) => void; onDelete: () => void };
function SourceItem({ source: s, index, total, disabled, onPatch, onKind, onMove, onDelete }: SourceItemProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mediaError, setMediaError] = useState("");
  const n = index + 1;
  const kind = str(s.kind);
  const image = isObj(s.image) ? s.image : {};
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setMediaError("");
    try {
      const r = await readImageFile(file);
      if (!/^data:image\/(png|jpe?g|webp)[;,]/i.test(r.dataUrl)) { setMediaError("صور المصادر: PNG أو JPG أو WEBP فقط."); return; }
      onPatch({ image: { dataUrl: r.dataUrl, contentType: r.contentType, origin: "uploaded" } });
    } catch (err) { setMediaError(err instanceof Error && err.message ? err.message : MEDIA_MSG.readFail); }
  }
  return (
    <li className="sb-scenario-source" data-kind={kind}>
      <div className="sb-scenario-source-head">
        <span className="sb-q-badge">{n}</span>
        <select className="sb-input sb-input-sm" value={kind} aria-label={"نوع المصدر " + n} disabled={disabled} onChange={e => onKind(e.target.value as SourceStimulusKind)}>
          {!(SCENARIO_SOURCE_KINDS as readonly string[]).includes(kind) && kind !== SCENARIO_RICH_SOURCE_KIND && <option value={kind}>{"غير مدعوم: " + kind}</option>}
          {SCENARIO_SOURCE_KINDS.map(k => <option key={k} value={k}>{SCENARIO_SOURCE_KIND_LABELS[k]}</option>)}
          <option value={SCENARIO_RICH_SOURCE_KIND}>{RICH_SOURCE_LABEL}</option>
        </select>
        <input className="sb-input sb-input-sm" value={str(s.title)} maxLength={SCENARIO_LIMITS.sourceTitle} placeholder="عنوان المصدر (اختياري)" aria-label={"عنوان المصدر " + n} disabled={disabled} onChange={e => onPatch({ title: e.target.value || undefined })} />
        <span className="sb-spacer" />
        <button type="button" className="sb-icon-btn" title="أعلى" aria-label={"تقديم المصدر " + n} onClick={() => onMove(-1)} disabled={disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn" title="أسفل" aria-label={"تأخير المصدر " + n} onClick={() => onMove(1)} disabled={disabled || index === total - 1}>↓</button>
        <button type="button" className="sb-icon-btn sb-danger" title="حذف" aria-label={"حذف المصدر " + n} onClick={onDelete} disabled={disabled}>×</button>
      </div>
      {kind === "text" && <textarea className="sb-input sb-textarea" aria-label={"نص المصدر " + n} value={str(s.text)} maxLength={SCENARIO_LIMITS.textChars} dir="auto" rows={6} placeholder="النص الذي يقرأه الطالب قبل الإجابة" disabled={disabled} onChange={e => onPatch({ text: e.target.value })} />}
      {kind === "code" && <>
        <select className="sb-input sb-input-sm" value={str(s.language)} aria-label={"لغة الكود للمصدر " + n} disabled={disabled} onChange={e => onPatch({ language: e.target.value })}>
          {!Object.prototype.hasOwnProperty.call(CODE_STIMULUS_LANGUAGES, str(s.language)) && <option value={str(s.language)}>{"غير مدعومة: " + str(s.language)}</option>}
          {Object.entries(CODE_STIMULUS_LANGUAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <textarea className="sb-input sb-scenario-code" dir="ltr" lang="en" aria-label={"كود المصدر " + n + " (للقراءة فقط، لا يُشغَّل)"} value={str(s.source)} rows={Math.min(18, Math.max(5, str(s.source).split("\n").length + 1))} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" disabled={disabled} onChange={e => onPatch({ source: e.target.value })} />
      </>}
      {kind === "image" && <>
        <input className="sb-input" value={str(s.alt)} maxLength={SCENARIO_LIMITS.alt} placeholder="الوصف البديل للصورة (مطلوب)" aria-label={"الوصف البديل لصورة المصدر " + n} disabled={disabled} onChange={e => onPatch({ alt: e.target.value })} />
        <div className="sb-media-actions">
          <input ref={fileRef} className="sb-media-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label={"ملف صورة المصدر " + n} onChange={e => void onFile(e)} disabled={disabled} />
          <button type="button" className="sb-btn" disabled={disabled} onClick={() => fileRef.current?.click()}>{typeof image.dataUrl === "string" ? "استبدال الصورة" : "رفع صورة"}</button>
        </div>
        {typeof image.dataUrl === "string" && <img className="sb-scenario-thumb" src={image.dataUrl} alt={str(s.alt) || "صورة المصدر"} />}
        {mediaError && <p className="sb-media-error" role="alert">{mediaError}</p>}
      </>}
      {kind === "table" && <TableSource source={s} index={index} disabled={disabled} onPatch={onPatch} />}
      {kind === SCENARIO_RICH_SOURCE_KIND && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل محرر المحتوى المنسق…</p>}>
          <RichContentEditor value={isObj(s.richContent) && Array.isArray(s.richContent.blocks) && s.richContent.blocks.length ? (s.richContent as RichContentV1) : undefined} onChange={next => onPatch({ richContent: next ?? { schemaVersion: 1, blocks: [] } })} disabled={disabled} label={"المحتوى المنسق للمصدر " + n} />
        </Suspense>
      )}
    </li>
  );
}

function TableSource({ source: t, index, disabled, onPatch }: { source: Obj; index: number; disabled?: boolean; onPatch: (patch: Obj) => void }) {
  const headers = Array.isArray(t.columnHeaders) ? (t.columnHeaders as unknown[]).map(str) : [];
  const rows = Array.isArray(t.rows) ? (t.rows as unknown[]).map(r => (Array.isArray(r) ? r.map(str) : [])) : [];
  const n = index + 1;
  return (
    <div className="sb-scenario-table">
      <div className="sb-media-actions">
        <button type="button" className="sb-mini-btn" onClick={() => onPatch({ columnHeaders: [...headers, ""], rows: rows.map(r => [...r, ""]) })} disabled={disabled || headers.length >= SCENARIO_LIMITS.tableColumns}>+ عمود</button>
        <button type="button" className="sb-mini-btn" onClick={() => onPatch({ rows: [...rows, headers.map(() => "")], ...(Array.isArray(t.rowHeaders) ? { rowHeaders: [...(t.rowHeaders as unknown[]).map(str), ""] } : {}) })} disabled={disabled || rows.length >= SCENARIO_LIMITS.tableRows}>+ صف</button>
      </div>
      <table className="sb-grid">
        <thead><tr>{headers.map((h, c) => <th key={c}><input className="sb-input sb-input-sm" value={h} maxLength={SCENARIO_LIMITS.headerChars} placeholder={"العمود " + (c + 1)} aria-label={"عنوان العمود " + (c + 1) + " في المصدر " + n} onChange={e => onPatch({ columnHeaders: headers.map((x, i) => (i === c ? e.target.value : x)) })} disabled={disabled} /></th>)}</tr></thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {Array.isArray(t.rowHeaders) && <th scope="row" className="sb-grid-row-head">{str((t.rowHeaders as unknown[])[r])}</th>}
              {row.map((cell, c) => <td key={c}><input className="sb-input sb-input-sm" value={cell} maxLength={SCENARIO_LIMITS.cellChars} aria-label={"الخلية " + (r + 1) + "،" + (c + 1) + " في المصدر " + n} onChange={e => onPatch({ rows: rows.map((x, ri) => (ri === r ? x.map((y, ci) => (ci === c ? e.target.value : y)) : x)) })} disabled={disabled} /></td>)}
              <td className="sb-grid-actions">{rows.length > 1 && <button type="button" className="sb-icon-btn sb-danger" aria-label={"حذف الصف " + (r + 1) + " من المصدر " + n} onClick={() => onPatch({ rows: rows.filter((_, i) => i !== r), ...(Array.isArray(t.rowHeaders) ? { rowHeaders: (t.rowHeaders as unknown[]).filter((_, i) => i !== r) } : {}) })} disabled={disabled}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
