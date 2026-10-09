// Phase 21A.2 — the teacher's FUNCTION-GRAPH editor (builder only, lazy). A graph is authored through typed controls — expressions in the
// safe language, numbers, labels, checkboxes and pickers — never JSON and never a plotting-library option. Every change emits the whole
// FunctionGraphSpecV1; an expression with an error shows the reason next to the field (and in the issue list) while the graph keeps the
// author's text, so nothing typed is lost — an invalid graph can never be published (finalization runs the same authority). Numbers accept
// constant expressions such as pi/2 (stored as the number). Detected roots / extrema / intersections are APPROXIMATE suggestions the
// teacher may add as authored points; nothing is added silently.
import { useId, useMemo, useState, type ReactNode } from "react";
import { validateFunctionGraphSpec, GRAPH_CURVE_KINDS, GRAPH_LIMITS, GRAPH_LINE_ROLES, GRAPH_LINE_STYLES, GRAPH_POINT_ROLES, type FunctionGraphSpecV1, type GraphCurveV1, type GraphDomainV1, type GraphIssue } from "./functionGraphSpec";
import { compileGraphExpression, isGraphParameterId } from "./graphExpression";
import { analyzeFunctionGraph, type GraphFeature } from "./graphAnalysis";
import { GRAPH_TEMPLATE_KEYS, GRAPH_TEMPLATE_LABELS, graphTemplate, newCurve, nextGraphObjectId, parseGraphNumber, pointFromFeature, type GraphTemplateKey } from "./graphEditing";
import { formatGraphNumber } from "./graphTargets";
import FunctionGraphView from "./FunctionGraphView";
import "./graph-editor.css";

type Confirm = (o: { title: string; message: string; confirmLabel: string; tone?: "danger" }) => Promise<boolean>;
export type GraphEditorProps = { graph: FunctionGraphSpecV1; onChange: (g: FunctionGraphSpecV1) => void; name: string; disabled?: boolean; confirm?: Confirm; preview?: boolean };

const CURVE_KIND_LABELS: Readonly<Record<GraphCurveV1["kind"], string>> = Object.freeze({ explicit: "y = f(x)", piecewise: "متعددة القواعد", parametric: "وسيطي (x(t), y(t))" });
const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({ point: "نقطة", root: "جذر", yIntercept: "مقطع y", intersection: "تقاطع", minimum: "قيمة صغرى", maximum: "قيمة عظمى", inflection: "نقطة انعطاف", hole: "فجوة (مفرغة)", tangency: "نقطة تماس", endpoint: "طرف مجال" });
const LINE_ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({ reference: "مرجعي", asymptote: "خط تقارب" });
const STYLE_LABELS: Readonly<Record<string, string>> = Object.freeze({ solid: "متصل", dashed: "متقطع", dotted: "منقّط" });
const FEATURE_LABELS: Readonly<Record<GraphFeature["kind"], string>> = Object.freeze({ root: "جذر", yIntercept: "مقطع y", minimum: "صغرى", maximum: "عظمى", intersection: "تقاطع", verticalAsymptote: "خط تقارب رأسي" });

function NumField({ label, value, onCommit, optional, disabled }: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void; optional?: boolean; disabled?: boolean }) {
  const shown = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState({ text: shown, from: shown });
  if (draft.from !== shown) setDraft({ text: parseGraphNumber(draft.text) === value ? draft.text : shown, from: shown });
  const parsed = parseGraphNumber(draft.text), bad = draft.text.trim() === "" ? !optional : parsed === undefined;
  const err = "ge-n-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <label className="ge-field ge-field-num"><span>{label}</span>
      <input className="sb-input sb-input-sm ge-num" dir="ltr" inputMode="decimal" value={draft.text} aria-invalid={bad || undefined} aria-describedby={bad ? err : undefined} disabled={disabled}
        placeholder={optional ? "—" : "0"}
        onChange={e => { const text = e.target.value, p = parseGraphNumber(text); setDraft({ text, from: shown }); if (p !== undefined) onCommit(p); else if (text.trim() === "" && optional) onCommit(undefined); }} />
      {bad && <span id={err} className="ge-error" role="alert">{draft.text.trim() === "" ? "مطلوب" : "ليس عددًا (يُقبل مثل 2.5 أو pi/2)"}</span>}
    </label>
  );
}
function TextField({ label, value, onChange, disabled, ltr, long, max }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; ltr?: boolean; long?: boolean; max?: number }) {
  return (
    <label className={"ge-field" + (long ? " ge-field-long" : "")}><span>{label}</span>
      {long ? <textarea className="sb-input ge-text" rows={2} value={value} maxLength={max} dir="auto" disabled={disabled} onChange={e => onChange(e.target.value)} />
        : <input className="sb-input sb-input-sm ge-text" value={value} maxLength={max} dir={ltr ? "ltr" : "auto"} disabled={disabled} onChange={e => onChange(e.target.value)} />}
    </label>
  );
}
/** An expression field: the engine's verdict (in Arabic) right under the field, from the same compiler the authority uses. */
function ExprField({ label, value, variable, params, onChange, disabled }: { label: string; value: string; variable: "x" | "t"; params: ReadonlySet<string>; onChange: (v: string) => void; disabled?: boolean }) {
  const r = useMemo(() => compileGraphExpression(value, variable, params), [value, variable, params]);
  const err = "ge-e-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <label className="ge-field ge-field-expr"><span>{label}</span>
      <input className="sb-input sb-input-sm ge-expr" dir="ltr" spellCheck={false} autoCapitalize="off" value={value} aria-invalid={!r.ok || undefined} aria-describedby={!r.ok ? err : undefined} disabled={disabled} onChange={e => onChange(e.target.value)} />
      {!r.ok && <span id={err} className="ge-error" role="alert">{r.message}</span>}
    </label>
  );
}
const without = <T extends object>(o: T, k: string): T => { const c = { ...o } as Record<string, unknown>; delete c[k]; return c as T; };
const setOpt = <T extends object>(o: T, k: string, v: unknown): T => (v === undefined || v === "" ? without(o, k) : ({ ...o, [k]: v } as T));

export default function GraphEditor({ graph: g, onChange, name, disabled, confirm, preview = true }: GraphEditorProps) {
  const v = useMemo(() => validateFunctionGraphSpec(g), [g]);
  const params = useMemo(() => new Set((g.parameters ?? []).map(p => p.id)), [g.parameters]);
  const [features, setFeatures] = useState<GraphFeature[] | null>(null);
  const [usedIds] = useState(() => new Set<string>());
  const emit = (next: FunctionGraphSpecV1) => { for (const k of ["curves", "points", "lines", "tangents", "regions", "intervals"] as const) for (const o of (next[k] ?? []) as { id: string }[]) usedIds.add(o.id); onChange(next); };
  const list = <K extends "curves" | "points" | "lines" | "tangents" | "regions" | "intervals">(k: K, items: NonNullable<FunctionGraphSpecV1[K]>) => emit(items.length || k === "curves" ? { ...g, [k]: items } : without(g, k));
  const issuesAt = (prefix: string): GraphIssue[] => (v.ok ? [] : v.issues.filter(i => i.path === prefix || i.path.startsWith(prefix + ".") || i.path.startsWith(prefix + "[")));
  const issueList = (at: string) => { const xs = issuesAt(at); return xs.length ? <ul className="ge-issues-inline">{xs.map((i, n) => <li key={n}>{i.message}</li>)}</ul> : null; };
  const curves = g.curves, ex = curves.filter(c => c.kind !== "parametric");
  const applyTemplate = async (key: GraphTemplateKey) => {
    if (confirm && !(await confirm({ title: "استبدال الرسم", message: "سيُستبدل الرسم الحالي (المنحنيات والنقاط والعناصر) بالقالب «" + GRAPH_TEMPLATE_LABELS[key] + "». هل تريد المتابعة؟", confirmLabel: "استبدال", tone: "danger" }))) return;
    emit(graphTemplate(key, g.id));
    setFeatures(null);
  };
  const curveSelect = (value: string | undefined, onPick: (id: string | undefined) => void, label: string, optional = false, kinds: readonly string[] = ["explicit", "piecewise"]) => (
    <label className="ge-field"><span>{label}</span>
      <select className="sb-input sb-input-sm" value={value ?? ""} disabled={disabled} onChange={e => onPick(e.target.value || undefined)}>
        {optional && <option value="">—</option>}
        {curves.filter(c => kinds.includes(c.kind)).map(c => <option key={c.id} value={c.id}>{c.label ?? c.id}</option>)}
      </select>
    </label>
  );
  const remove = (onRemove: () => void, what: string) => <button type="button" className="sb-btn ge-icon" disabled={disabled} aria-label={"حذف " + what} onClick={onRemove}>✕</button>;
  const domainFields = (d: GraphDomainV1 | undefined, onD: (d: GraphDomainV1 | undefined) => void, label: string) => {
    const dd = d ?? {};
    const set = (k: keyof GraphDomainV1, val: unknown) => { let n = setOpt(dd, k, val); if (k === "min" && val === undefined) n = without(n, "minClosed"); if (k === "max" && val === undefined) n = without(n, "maxClosed"); onD(Object.keys(n).length ? n : undefined); };
    return (
      <fieldset className="ge-domain"><legend>{label}</legend>
        <NumField label="من (اختياري)" value={dd.min} optional disabled={disabled} onCommit={x => set("min", x)} />
        {dd.min !== undefined && <label className="ge-check"><input type="checkbox" checked={dd.minClosed ?? true} disabled={disabled} onChange={e => set("minClosed", e.target.checked ? undefined : false)} /> يشمل الطرف</label>}
        <NumField label="إلى (اختياري)" value={dd.max} optional disabled={disabled} onCommit={x => set("max", x)} />
        {dd.max !== undefined && <label className="ge-check"><input type="checkbox" checked={dd.maxClosed ?? true} disabled={disabled} onChange={e => set("maxClosed", e.target.checked ? undefined : false)} /> يشمل الطرف</label>}
      </fieldset>
    );
  };
  const styleFields = <T extends { style?: { line?: string; color?: number } }>(o: T, onO: (o: T) => void) => (
    <>
      <label className="ge-field"><span>نمط الخط</span>
        <select className="sb-input sb-input-sm" value={o.style?.line ?? "solid"} disabled={disabled} onChange={e => { const st = setOpt(o.style ?? {}, "line", e.target.value === "solid" ? undefined : e.target.value); onO(Object.keys(st).length ? { ...o, style: st } : without(o, "style")); }}>
          {GRAPH_LINE_STYLES.map(s => <option key={s} value={s}>{STYLE_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="ge-field"><span>اللون</span>
        <select className="sb-input sb-input-sm" value={o.style?.color ?? ""} disabled={disabled} onChange={e => { const st = setOpt(o.style ?? {}, "color", e.target.value ? Number(e.target.value) : undefined); onO(Object.keys(st).length ? { ...o, style: st } : without(o, "style")); }}>
          <option value="">تلقائي</option>{Array.from({ length: GRAPH_LIMITS.colors }, (_, i) => <option key={i} value={i + 1}>{"لون " + (i + 1)}</option>)}
        </select>
      </label>
    </>
  );
  const section = (title: string, children: ReactNode, add?: ReactNode) => <fieldset className="ge-section"><legend>{title}</legend>{children}{add && <div className="ge-row">{add}</div>}</fieldset>;

  return (
    <div className="ge" data-testid="graph-editor" aria-label={"محرر رسم الدالة: " + name} role="group">
      <div className="ge-row">
        <label className="ge-field"><span>بدء من قالب</span>
          <select className="sb-input sb-input-sm" defaultValue="" disabled={disabled} onChange={e => { const k = e.target.value as GraphTemplateKey; e.target.value = ""; if (k) void applyTemplate(k); }}>
            <option value="">اختر قالبًا…</option>{GRAPH_TEMPLATE_KEYS.map(k => <option key={k} value={k}>{GRAPH_TEMPLATE_LABELS[k]}</option>)}
          </select>
        </label>
      </div>
      <TextField label="العنوان" value={g.title} max={GRAPH_LIMITS.titleChars} disabled={disabled} onChange={t => emit({ ...g, title: t })} />
      {issueList("graph.title")}
      <TextField label="الوصف النصي (يقرؤه قارئ الشاشة)" value={g.description} long max={GRAPH_LIMITS.descriptionChars} disabled={disabled} onChange={t => emit({ ...g, description: t })} />
      {issueList("graph.description")}
      <TextField label="المصدر (اختياري)" value={g.source ?? ""} max={GRAPH_LIMITS.sourceChars} disabled={disabled} onChange={t => emit(setOpt(g, "source", t))} />

      {section("نافذة العرض والمحاور", <>
        <div className="ge-row">
          {(["xMin", "xMax", "yMin", "yMax"] as const).map(k => <NumField key={k} label={k} value={g.viewport[k]} disabled={disabled} onCommit={x => x !== undefined && emit({ ...g, viewport: { ...g.viewport, [k]: x } })} />)}
        </div>
        {issueList("graph.viewport")}
        {(["x", "y"] as const).map(axis => {
          const a = g.axes?.[axis] ?? {};
          const setA = (k: string, val: unknown) => { const na = setOpt(a, k, val); const axes = setOpt(g.axes ?? {}, axis, Object.keys(na).length ? na : undefined); emit(Object.keys(axes).length ? { ...g, axes } : without(g, "axes")); };
          return (
            <div className="ge-row" key={axis}>
              <TextField label={"اسم المحور " + axis} value={a.label ?? ""} max={GRAPH_LIMITS.axisLabelChars} disabled={disabled} onChange={t => setA("label", t)} />
              <label className="ge-check"><input type="checkbox" checked={a.grid ?? true} disabled={disabled} onChange={e => setA("grid", e.target.checked ? undefined : false)} /> شبكة</label>
              <NumField label="خطوة التدريج" value={a.step} optional disabled={disabled} onCommit={x => setA("step", x)} />
              <label className="ge-check"><input type="checkbox" checked={a.ticks === "pi"} disabled={disabled} onChange={e => setA("ticks", e.target.checked ? "pi" : undefined)} /> تدريج بمضاعفات π</label>
            </div>
          );
        })}
        {issueList("graph.axes")}
      </>)}

      {section("المعاملات (ثوابت مسمّاة في التعابير)", <>
        {(g.parameters ?? []).map((p, i) => (
          <div className="ge-row ge-item" key={i}>
            <TextField label="الاسم" ltr value={p.id} max={8} disabled={disabled} onChange={t => emit({ ...g, parameters: g.parameters!.map((q, j) => (j === i ? { ...q, id: t } : q)) })} />
            {!isGraphParameterId(p.id) && <span className="ge-error" role="alert">اسم غير صالح</span>}
            <NumField label="القيمة" value={p.value} disabled={disabled} onCommit={x => x !== undefined && emit({ ...g, parameters: g.parameters!.map((q, j) => (j === i ? { ...q, value: x } : q)) })} />
            {remove(() => { const ps = g.parameters!.filter((_, j) => j !== i); emit(ps.length ? { ...g, parameters: ps } : without(g, "parameters")); }, "المعامل " + p.id)}
          </div>
        ))}
      </>, (g.parameters?.length ?? 0) < GRAPH_LIMITS.parameters && <button type="button" className="sb-btn" disabled={disabled} onClick={() => { const used = new Set((g.parameters ?? []).map(p => p.id)); const id = ["a", "b", "k", "m", "n", "c", "d", "h"].find(x => !used.has(x)) ?? "p" + used.size; emit({ ...g, parameters: [...(g.parameters ?? []), { id, value: 1 }] }); }}>+ معامل</button>)}

      {section("المنحنيات", <>
        {curves.map((c, i) => {
          const set = (nc: GraphCurveV1) => list("curves", curves.map((x, j) => (j === i ? nc : x)));
          return (
            <fieldset className="ge-item" key={c.id + i}><legend>{(c.label ?? c.id) + " — " + CURVE_KIND_LABELS[c.kind]}</legend>
              <div className="ge-row">
                <TextField label="التسمية" value={c.label ?? ""} max={GRAPH_LIMITS.labelChars} disabled={disabled} onChange={t => set(setOpt(c, "label", t))} />
                {c.kind === "explicit" && <ExprField label="y =" value={c.expression} variable="x" params={params} disabled={disabled} onChange={t => set({ ...c, expression: t })} />}
                {c.kind === "parametric" && <>
                  <ExprField label="x(t) =" value={c.x} variable="t" params={params} disabled={disabled} onChange={t => set({ ...c, x: t })} />
                  <ExprField label="y(t) =" value={c.y} variable="t" params={params} disabled={disabled} onChange={t => set({ ...c, y: t })} />
                  <NumField label="t من" value={c.t.min} disabled={disabled} onCommit={x => x !== undefined && set({ ...c, t: { ...c.t, min: x } })} />
                  <NumField label="t إلى" value={c.t.max} disabled={disabled} onCommit={x => x !== undefined && set({ ...c, t: { ...c.t, max: x } })} />
                </>}
                {styleFields(c, set)}
                {curves.length > 1 && remove(() => list("curves", curves.filter((_, j) => j !== i)), "المنحنى " + (c.label ?? c.id))}
              </div>
              {c.kind === "explicit" && <div className="ge-row">{domainFields(c.domain, d => set(setOpt(c, "domain", d)), "المجال")}
                {curveSelect(c.derivativeOf, id => set(setOpt(c, "derivativeOf", id)), "مشتقة المنحنى (اختياري)", true, ["explicit"])}</div>}
              {c.kind === "piecewise" && c.pieces.map((p, j) => (
                <div className="ge-row ge-piece" key={j}>
                  <ExprField label={"القاعدة " + (j + 1) + ": y ="} value={p.expression} variable="x" params={params} disabled={disabled} onChange={t => set({ ...c, pieces: c.pieces.map((q, k) => (k === j ? { ...q, expression: t } : q)) })} />
                  {domainFields(p.domain, d => set({ ...c, pieces: c.pieces.map((q, k) => (k === j ? { ...q, domain: d ?? {} } : q)) }), "مجال القاعدة")}
                  {c.pieces.length > 1 && remove(() => set({ ...c, pieces: c.pieces.filter((_, k) => k !== j) }), "القاعدة " + (j + 1))}
                </div>
              ))}
              {c.kind === "piecewise" && c.pieces.length < GRAPH_LIMITS.pieces && <button type="button" className="sb-btn" disabled={disabled} onClick={() => set({ ...c, pieces: [...c.pieces, { expression: "x", domain: { min: (c.pieces[c.pieces.length - 1]?.domain.max ?? 0), minClosed: false } }] })}>+ قاعدة</button>}
              {issueList("graph.curves[" + i + "]")}
            </fieldset>
          );
        })}
      </>, curves.length < GRAPH_LIMITS.curves && <>{GRAPH_CURVE_KINDS.map(k => <button key={k} type="button" className="sb-btn" disabled={disabled} onClick={() => list("curves", [...curves, newCurve(k, nextGraphObjectId(g, "c", usedIds))])}>{"+ منحنى " + CURVE_KIND_LABELS[k]}</button>)}</>)}

      {section("النقاط", <>
        {(g.points ?? []).map((p, i) => {
          const set = (np: typeof p) => list("points", g.points!.map((x, j) => (j === i ? np : x)));
          return (
            <div className="ge-row ge-item" key={p.id + i}>
              <TextField label="التسمية" value={p.label ?? ""} max={GRAPH_LIMITS.labelChars} disabled={disabled} onChange={t => set(setOpt(p, "label", t))} />
              <NumField label="x" value={p.x} disabled={disabled} onCommit={x => x !== undefined && set({ ...p, x })} />
              <NumField label="y" value={p.y} disabled={disabled} onCommit={y => y !== undefined && set({ ...p, y })} />
              <label className="ge-field"><span>الدور (للمعلم فقط)</span>
                <select className="sb-input sb-input-sm" value={p.role ?? ""} disabled={disabled} onChange={e => set(setOpt(p, "role", e.target.value || undefined))}>
                  <option value="">—</option>{GRAPH_POINT_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>
              <fieldset className="ge-on"><legend>تقع على</legend>{curves.map(c => (
                <label className="ge-check" key={c.id}><input type="checkbox" checked={(p.on ?? []).includes(c.id)} disabled={disabled} onChange={e => { const on = e.target.checked ? [...(p.on ?? []), c.id] : (p.on ?? []).filter(x => x !== c.id); set(setOpt(p, "on", on.length ? on : undefined)); }} /> {c.label ?? c.id}</label>
              ))}</fieldset>
              <label className="ge-check"><input type="checkbox" checked={p.open === true} disabled={disabled} onChange={e => set(setOpt(p, "open", e.target.checked || undefined))} /> مفرغة</label>
              {remove(() => list("points", g.points!.filter((_, j) => j !== i)), "النقطة " + (p.label ?? p.id))}
              {issueList("graph.points[" + i + "]")}
            </div>
          );
        })}
        {features && (
          <div className="ge-features" role="region" aria-label="سمات مكتشفة تقريبيًا">
            <p className="ge-hint">قيم تقريبية محسوبة عدديًا (≈) — لا تُضاف إلا بقرارك، ثم تتحقق منها القواعد كأي نقطة يكتبها المعلم.</p>
            {features.length === 0 ? <p className="ge-hint">لم تُكتشف سمات في نافذة العرض.</p> : <ul>{features.map((f, i) => (
              <li key={i}>{FEATURE_LABELS[f.kind]} ≈ <bdi dir="ltr">{f.y === null ? "x = " + formatGraphNumber(f.x) : "(" + formatGraphNumber(f.x) + ", " + formatGraphNumber(f.y) + ")"}</bdi>
                {f.y !== null && f.kind !== "verticalAsymptote" && <button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => { const n = pointFromFeature(g, f, usedIds); if (n) emit(n); }}>إضافة كنقطة</button>}
                {f.kind === "verticalAsymptote" && <button type="button" className="sb-btn sb-btn-sm" disabled={disabled} onClick={() => list("lines", [...(g.lines ?? []), { id: nextGraphObjectId(g, "l", usedIds), orientation: "vertical", value: f.x, role: "asymptote", style: { line: "dashed" } }])}>إضافة كخط</button>}
              </li>))}</ul>}
          </div>
        )}
      </>, <>
        {(g.points?.length ?? 0) < GRAPH_LIMITS.points && <button type="button" className="sb-btn" disabled={disabled} onClick={() => list("points", [...(g.points ?? []), { id: nextGraphObjectId(g, "p", usedIds), x: Math.max(g.viewport.xMin, Math.min(g.viewport.xMax, 0)), y: Math.max(g.viewport.yMin, Math.min(g.viewport.yMax, 0)) }])}>+ نقطة</button>}
        <button type="button" className="sb-btn" disabled={disabled || !v.ok || ex.length === 0} onClick={() => setFeatures(v.ok ? analyzeFunctionGraph(v.value) : [])}>اكتشاف الجذور والقيم القصوى والتقاطعات (تقريبي)</button>
      </>)}

      {section("المستقيمات", <>{(g.lines ?? []).map((l, i) => {
        const set = (nl: typeof l) => list("lines", g.lines!.map((x, j) => (j === i ? nl : x)));
        return (
          <div className="ge-row ge-item" key={l.id + i}>
            <TextField label="التسمية" value={l.label ?? ""} max={GRAPH_LIMITS.labelChars} disabled={disabled} onChange={t => set(setOpt(l, "label", t))} />
            <label className="ge-field"><span>الاتجاه</span><select className="sb-input sb-input-sm" value={l.orientation} disabled={disabled} onChange={e => set({ ...l, orientation: e.target.value as "vertical" | "horizontal" })}><option value="vertical">رأسي (x = …)</option><option value="horizontal">أفقي (y = …)</option></select></label>
            <NumField label="القيمة" value={l.value} disabled={disabled} onCommit={x => x !== undefined && set({ ...l, value: x })} />
            <label className="ge-field"><span>الدور (للمعلم فقط)</span><select className="sb-input sb-input-sm" value={l.role ?? ""} disabled={disabled} onChange={e => set(setOpt(l, "role", e.target.value || undefined))}><option value="">—</option>{GRAPH_LINE_ROLES.map(r => <option key={r} value={r}>{LINE_ROLE_LABELS[r]}</option>)}</select></label>
            {styleFields(l, set)}
            {remove(() => list("lines", g.lines!.filter((_, j) => j !== i)), "المستقيم " + (l.label ?? l.id))}
            {issueList("graph.lines[" + i + "]")}
          </div>
        );
      })}</>, (g.lines?.length ?? 0) < GRAPH_LIMITS.lines && <button type="button" className="sb-btn" disabled={disabled} onClick={() => list("lines", [...(g.lines ?? []), { id: nextGraphObjectId(g, "l", usedIds), orientation: "horizontal", value: Math.max(g.viewport.yMin, Math.min(g.viewport.yMax, 0)) }])}>+ مستقيم</button>)}

      {section("المماسات والأعمدة", <>{(g.tangents ?? []).map((t, i) => {
        const set = (nt: typeof t) => list("tangents", g.tangents!.map((x, j) => (j === i ? nt : x)));
        return (
          <div className="ge-row ge-item" key={t.id + i}>
            <TextField label="التسمية" value={t.label ?? ""} max={GRAPH_LIMITS.labelChars} disabled={disabled} onChange={x => set(setOpt(t, "label", x))} />
            {curveSelect(t.curve, id => id && set({ ...t, curve: id }), "على المنحنى")}
            <NumField label="عند x" value={t.x} disabled={disabled} onCommit={x => x !== undefined && set({ ...t, x })} />
            <label className="ge-field"><span>النوع</span><select className="sb-input sb-input-sm" value={t.kind} disabled={disabled} onChange={e => set({ ...t, kind: e.target.value as "tangent" | "normal" })}><option value="tangent">مماس</option><option value="normal">عمودي على المماس</option></select></label>
            <NumField label="الميل (اختياري؛ يُتحقق منه)" value={t.slope} optional disabled={disabled} onCommit={x => set(setOpt(t, "slope", x))} />
            {remove(() => list("tangents", g.tangents!.filter((_, j) => j !== i)), "المماس " + (t.label ?? t.id))}
            {issueList("graph.tangents[" + i + "]")}
          </div>
        );
      })}</>, (g.tangents?.length ?? 0) < GRAPH_LIMITS.tangents && ex.length > 0 && <button type="button" className="sb-btn" disabled={disabled} onClick={() => list("tangents", [...(g.tangents ?? []), { id: nextGraphObjectId(g, "t", usedIds), curve: ex[0].id, x: Math.max(g.viewport.xMin, Math.min(g.viewport.xMax, 1)), kind: "tangent" }])}>+ مماس</button>)}

      {section("المناطق المظللة (التكامل)", <>{(g.regions ?? []).map((r, i) => {
        const set = (nr: typeof r) => list("regions", g.regions!.map((x, j) => (j === i ? nr : x)));
        return (
          <div className="ge-row ge-item" key={r.id + i}>
            <TextField label="التسمية" value={r.label ?? ""} max={GRAPH_LIMITS.labelChars} disabled={disabled} onChange={x => set(setOpt(r, "label", x))} />
            {curveSelect(r.curve, id => id && set({ ...r, curve: id }), "تحت المنحنى")}
            {curveSelect(r.lower, id => set(setOpt(r, "lower", id)), "وفوق المنحنى (اختياري؛ وإلا محور x)", true)}
            <NumField label="من x" value={r.from} disabled={disabled} onCommit={x => x !== undefined && set({ ...r, from: x })} />
            <NumField label="إلى x" value={r.to} disabled={disabled} onCommit={x => x !== undefined && set({ ...r, to: x })} />
            {remove(() => list("regions", g.regions!.filter((_, j) => j !== i)), "المنطقة " + (r.label ?? r.id))}
            {issueList("graph.regions[" + i + "]")}
          </div>
        );
      })}</>, (g.regions?.length ?? 0) < GRAPH_LIMITS.regions && ex.length > 0 && <button type="button" className="sb-btn" disabled={disabled} onClick={() => list("regions", [...(g.regions ?? []), { id: nextGraphObjectId(g, "r", usedIds), curve: ex[0].id, from: g.viewport.xMin + (g.viewport.xMax - g.viewport.xMin) / 4, to: g.viewport.xMin + (g.viewport.xMax - g.viewport.xMin) / 2 }])}>+ منطقة مظللة</button>)}

      {section("الفترات على محور x", <>{(g.intervals ?? []).map((t, i) => {
        const set = (nt: typeof t) => list("intervals", g.intervals!.map((x, j) => (j === i ? nt : x)));
        return (
          <div className="ge-row ge-item" key={t.id + i}>
            <TextField label="التسمية" value={t.label ?? ""} max={GRAPH_LIMITS.labelChars} disabled={disabled} onChange={x => set(setOpt(t, "label", x))} />
            <NumField label="من" value={t.from} disabled={disabled} onCommit={x => x !== undefined && set({ ...t, from: x })} />
            <label className="ge-check"><input type="checkbox" checked={t.fromClosed ?? true} disabled={disabled} onChange={e => set(setOpt(t, "fromClosed", e.target.checked ? undefined : false))} /> مغلقة</label>
            <NumField label="إلى" value={t.to} disabled={disabled} onCommit={x => x !== undefined && set({ ...t, to: x })} />
            <label className="ge-check"><input type="checkbox" checked={t.toClosed ?? true} disabled={disabled} onChange={e => set(setOpt(t, "toClosed", e.target.checked ? undefined : false))} /> مغلقة</label>
            {remove(() => list("intervals", g.intervals!.filter((_, j) => j !== i)), "الفترة " + (t.label ?? t.id))}
            {issueList("graph.intervals[" + i + "]")}
          </div>
        );
      })}</>, (g.intervals?.length ?? 0) < GRAPH_LIMITS.intervals && <button type="button" className="sb-btn" disabled={disabled} onClick={() => list("intervals", [...(g.intervals ?? []), { id: nextGraphObjectId(g, "i", usedIds), from: g.viewport.xMin + (g.viewport.xMax - g.viewport.xMin) / 4, to: g.viewport.xMin + (g.viewport.xMax - g.viewport.xMin) / 2 }])}>+ فترة</button>)}

      {!v.ok && <ul className="ge-issues" role="alert" aria-label={"مشكلات رسم الدالة: " + name}>{v.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
      {preview && (v.ok ? <div className="ge-preview" aria-label={"معاينة رسم الدالة: " + name}><FunctionGraphView spec={v.value} /></div>
        : <p className="ge-hint" role="status">تظهر المعاينة عندما يصبح الرسم صالحًا.</p>)}
      <p className="ge-hint">الدوال المتاحة: sin cos tan asin acos atan sqrt abs exp ln log10 pow min max — اكتب الضرب صراحةً (2*x) والأس بـ ^.</p>
    </div>
  );
}
