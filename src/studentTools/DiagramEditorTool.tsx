import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { DIAGRAM_CATALOG, DIAGRAM_COLORS, DIAGRAM_COLOR_IDS, edgeSpec, kindSpec, nodeSpec, type DiagramKind, type EdgeSpec, type NodeSpec } from "./diagramCatalog";
import {
  DIAGRAM_LIMITS, addNode, alignNodes, commit, connect, diagramFileName, duplicateMany, duplicateNode, emptyDoc, moveMessage, moveNodesBy, parseDiagram,
  parseDraft, preview, redo, removeEdge, removeMany, removeNode, reverseEdge, routeApplies, routeOf, serializeDiagram, serializeDraft, setColor, setEdge,
  setRoute, setText, startHistory, undo, type AlignHow, type DiagramDoc, type EdgeRoute, type History,
} from "./diagramDoc";
import { contentBounds, edgePath, layoutNode, type EdgePath, type NodeBox } from "./diagramLayout";
import { exampleDoc } from "./diagramExamples";
import { EdgeShape, Lifeline, Markers, NodeShape } from "./diagramShapes";
import { canCopyImage, copyPngToClipboard, diagramPng, diagramSvgMarkup, downloadBlob, embeddedFontCss } from "./diagramExport";
import DiagramCanvas, { makeSelection, selectedEdges, type Selection } from "./DiagramCanvas";
import { checkDiagram, type Finding, type FindingLevel } from "./diagramChecks";
import { readSqlTables, sqlToDsd, SQL_LIMITS } from "./sqlToDsd";
import { readCSharpTypes, csharpToClass, CS_LIMITS } from "./csharpToClass";
import { isScriptKind, keepPositions, readDiagramScript, SCRIPT_MAX_CHARS, type ScriptKind, type ScriptProblem, type ScriptResult } from "./diagramScript";
import { diagramToScript } from "./diagramToScript";
import "./diagramEditor.css";

// «محرّر المخططات» (docs/enterprise-diagram-editor-design.md) — the learner draws a diagram for the project book by choosing components,
// filling them in and drawing arrows between them: UML (use case, class, sequence, activity, state, object, component / deployment),
// ERD, DSD (the tables' relationships), DFD and a network topology. It saves the drawing as a picture (PNG / SVG, or copied for Word)
// and the diagram itself as a file to open again. Nothing is sent or graded; in a BOOK (`draftKey`) the learner's last diagram of each
// kind is also kept as a draft in this browser.

type Store = { kind: DiagramKind; hist: Partial<Record<DiagramKind, History>> };
const SAID = {
  png: "حُفظت الصورة (PNG) في مجلد التنزيلات. أدرجها في كتابك من «إدراج ← صور».",
  svg: "حُفظت الصورة (SVG) في مجلد التنزيلات.",
  copied: "نُسخت الصورة. الصقها في Word أو PowerPoint بـ Ctrl+V.",
  file: "حُفظ المخطط في ملف. افتحه لاحقًا بـ «افتح ملفًا» لتعدّل عليه.",
  empty: "المخطط فارغ: أضف مكوّنًا أولًا.",
  failed: "تعذّر حفظ الصورة في هذا المتصفح.",
  copyFailed: "تعذّر النسخ في هذا المتصفح. استعمل «حفظ صورة PNG» بدلًا منه.",
} as const;

function readStore(draftKey?: string): Store {
  if (draftKey) {
    try {
      const d = parseDraft(localStorage.getItem(draftKey));
      if (d) {
        const hist: Store["hist"] = {};
        for (const [k, doc] of Object.entries(d.docs)) if (doc) hist[k as DiagramKind] = startHistory(doc);
        return { kind: d.current, hist };
      }
    } catch { /* no storage here: start empty */ }
  }
  return { kind: "useCase", hist: {} };
}

/** A component's drawing in a small box (the palette's buttons). */
function PaletteIcon({ kind, spec }: { kind: DiagramKind; spec: NodeSpec }) {
  const node = { id: "p", type: spec.type, x: 2, y: 2, w: spec.minW, h: spec.form === "lifeline" ? 34 : spec.minH, text: {}, color: "none" as const };
  const b = layoutNode({ kind, nodes: [node], edges: [] }, node);
  if (!b) return null;
  const tall = spec.form === "lifeline" ? 70 : b.h;
  const vb = `0 0 ${b.w + 4} ${tall + 4}`;
  return (
    <svg className="dgm-pal-icon eb-light-island" viewBox={vb} aria-hidden="true" focusable="false">
      {spec.form === "lifeline" ? <Lifeline b={{ ...b, title: [""] }} bottom={tall + 2} /> : <NodeShape b={{ ...b, title: b.title.map(() => "") }} />}
    </svg>
  );
}
function ArrowIcon({ spec, prefix }: { spec: EdgeSpec; prefix: string }) {
  const path: EdgePath = { d: "M6,10 L54,10", mid: { x: 30, y: 10 }, fromAt: { x: 6, y: 10 }, toAt: { x: 54, y: 10 }, angle: 0, pts: [] };
  return (
    <svg className="dgm-arrow-icon eb-light-island" viewBox="0 0 60 20" aria-hidden="true" focusable="false">
      <EdgeShape edge={{ id: "p", type: spec.type, from: "", to: "", label: "", fromLabel: "", toLabel: "", y: 0 }} path={path} spec={spec} prefix={prefix} />
    </svg>
  );
}

/** A hint whose example is code («مثل: - name : string»): the example keeps its own direction inside the Arabic sentence. */
function Hint({ text }: { text: string }) {
  const at = text.indexOf("مثل: ");
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at + 5)}<bdi>{text.slice(at + 5)}</bdi></>;
}

/** «خطأ واحد»، «خطآن»، «3 أخطاء»، «11 خطأً». */
function counted(n: number, one: string, two: string, few: string, many: string): string {
  return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? n + " " + few : n + " " + many;
}

/** DG2 — «افحص المخطط»: the findings, each a button that selects what it is about. Notes for the learner: no mark, nothing sent. */
function CheckPanel({ findings, onPick, onClose }: { findings: readonly Finding[]; onPick: (f: Finding) => void; onClose: () => void }) {
  const errors = findings.filter(f => f.level === "error").length, warnings = findings.length - errors;
  return (
    <section className="dgm-check" aria-label="نتيجة فحص المخطط" data-testid="diagram-check-panel">
      <div className="dgm-check-head">
        <p className="dgm-check-sum" role="status">
          {findings.length
            ? <>نتيجة الفحص: {[errors && counted(errors, "خطأ واحد", "خطآن", "أخطاء", "خطأً"), warnings && counted(warnings, "تنبيه واحد", "تنبيهان", "تنبيهات", "تنبيهًا")].filter(Boolean).join(" و")}.</>
            : <>✓ لا ملاحظات: المخطط يتبع قواعد نوعه.</>}
        </p>
        <button type="button" className="stt-btn" onClick={onClose}>إغلاق الفحص</button>
      </div>
      {!!findings.length && (
        <ul className="dgm-check-list">
          {findings.map((f, i) => (
            <li key={i}>
              <button type="button" className={"dgm-finding is-" + f.level} onClick={() => onPick(f)} disabled={!f.nodes.length && !f.edges.length} data-testid="diagram-finding">
                <span className="dgm-finding-tag">{f.level === "error" ? "خطأ" : "تنبيه"}</span><span>{f.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="stt-hint">الفحص يساعدك ولا يعطي علامة. اضغط ملاحظة لتختار ما تتحدّث عنه، ويتحدّث الفحص كلما عدّلت.</p>
    </section>
  );
}

/** DG3 — «ولّد من الكود»: which kinds can be drawn from code, and how. */
const FROM_CODE: Partial<Record<DiagramKind, { what: string; placeholder: string; accept: string; max: number; draw: (code: string) => { doc: DiagramDoc | null; summary: string; problems: { line: number; message: string }[] } }>> = {
  dsd: {
    what: "كود CREATE TABLE", accept: ".sql,.txt", max: SQL_LIMITS.chars,
    placeholder: "CREATE TABLE Students (\n  StudentID INT PRIMARY KEY,\n  Name NVARCHAR(50),\n  ClassID INT REFERENCES Classes(ClassID)\n);",
    draw: code => {
      const r = readSqlTables(code);
      const doc = r.tables.length ? sqlToDsd(r) : null;
      return { doc, problems: r.problems, summary: doc ? "رُسم المخطط: " + r.tables.length + " جدول و" + doc.edges.length + " علاقة." : "" };
    },
  },
  class: {
    what: "أصناف C#", accept: ".cs,.txt", max: CS_LIMITS.chars,
    placeholder: "public class Student : Person\n{\n    private int id;\n    public string Name { get; set; }\n    public double GetAverage() { ... }\n}",
    draw: code => {
      const r = readCSharpTypes(code);
      const doc = r.types.length ? csharpToClass(r) : null;
      return { doc, problems: r.problems, summary: doc ? "رُسم المخطط: " + r.types.length + " صنف و" + doc.edges.length + " علاقة." : "" };
    },
  },
};

/** DG3 — «ولّد من الكود»: the learner pastes the code (or opens its file) and the diagram is drawn from it, replacing the one on the
 *  sheet (one «تراجع» brings it back). The code is read on this device only; nothing runs and nothing is sent. */
function GeneratePanel({ kind, onDraw, onClose }: { kind: DiagramKind; onDraw: (doc: DiagramDoc, summary: string) => void; onClose: () => void }) {
  const spec = FROM_CODE[kind]!;
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ summary: string; problems: { line: number; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const draw = (text: string) => {
    const r = spec.draw(text);
    setResult({ summary: r.summary, problems: r.problems });
    if (r.doc) onDraw(r.doc, r.summary);
  };
  const open = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > spec.max) { setResult({ summary: "", problems: [{ line: 1, message: "الملف أكبر من الحد المسموح." }] }); return; }
    const text = await f.text();
    setCode(text);
    draw(text);
  };
  return (
    <section className="dgm-gen" aria-label="ولّد المخطط من الكود" data-testid="diagram-generate-panel">
      <div className="dgm-check-head">
        <p className="dgm-check-sum">ولّد المخطط من {spec.what}</p>
        <button type="button" className="stt-btn" onClick={onClose}>إغلاق</button>
      </div>
      <label className="dgm-field">
        <span>الصق {spec.what} هنا (من كتابك أو من مشروعك)</span>
        <textarea className="dgm-input dgm-code" dir="ltr" rows={8} spellCheck={false} maxLength={spec.max} placeholder={spec.placeholder}
          value={code} onChange={e => setCode(e.target.value)} data-testid="diagram-generate-code" />
      </label>
      <div className="dgm-actions">
        <button type="button" className="stt-btn is-primary" onClick={() => draw(code)} disabled={!code.trim()} data-testid="diagram-generate-draw">ارسم المخطط</button>
        <button type="button" className="stt-btn" onClick={() => fileRef.current?.click()}>افتح ملف الكود</button>
        <input ref={fileRef} type="file" accept={spec.accept} hidden onChange={open} data-testid="diagram-generate-file" />
      </div>
      {result && (
        <div className="dgm-gen-result" role="status" data-testid="diagram-generate-result">
          {result.summary && <p className="dgm-gen-ok">{result.summary} المخطط السابق يعود بـ «تراجع».</p>}
          {!!result.problems.length && <>
            <p className="dgm-gen-warn">{result.summary ? "وفي الكود ما لم أستطع قراءته:" : "لم يُرسم شيء:"}</p>
            <ul className="dgm-check-list">
              {result.problems.map((p, i) => <li key={i} className="dgm-finding is-warning"><span className="dgm-finding-tag" dir="ltr">سطر {p.line}</span><span>{p.message}</span></li>)}
            </ul>
          </>}
        </div>
      )}
      <p className="stt-hint">يقرأ المحرّر التعريفات فقط ولا يشغّل الكود، ولا يرسله إلى أي مكان. رتّب المخطط بعدها كما تشاء.</p>
    </section>
  );
}

/** DG4 — an example script per kind (the activity's is written by hand: a free-form flow is not written back). */
const SCRIPT_EXAMPLE: Record<ScriptKind, () => string> = {
  class: () => "@startuml\nclass Car\n\nDriver - Car : drives >\nCar *- Wheel : have 4 >\nCar -- Person : < owns\n@enduml",
  useCase: () => diagramToScript(exampleDoc("useCase"))!,
  sequence: () => diagramToScript(exampleDoc("sequence"))!,
  state: () => diagramToScript(exampleDoc("state"))!,
  activity: () => "@startuml\nstart\n:إدخال البيانات;\nif (البيانات صحيحة؟) then (نعم)\n  :حفظ البيانات;\nelse (لا)\n  :عرض رسالة خطأ;\nendif\nstop\n@enduml",
};

/** DG4 — «اكتب كنص»: the diagram as a script (PlantUML's everyday core). It opens with the drawing written as text (when the kind is
 *  written back) and draws what the learner types a moment after they stop; a whole stretch of typing is one «تراجع». */
function ScriptPanel({ kind, doc, onApply, onClose }: { kind: ScriptKind; doc: DiagramDoc; onApply: (r: ScriptResult) => void; onClose: () => void }) {
  const [text, setText] = useState(() => (doc.nodes.length ? diagramToScript(doc) ?? "" : ""));
  const [state, setState] = useState<{ summary: string; problems: ScriptProblem[] } | null>(null);
  const [copied, setCopied] = useState("");
  const typed = useRef(false);
  const apply = useRef(onApply);
  useEffect(() => { apply.current = onApply; });
  useEffect(() => {
    if (!typed.current) return;
    const t = setTimeout(() => {
      const r = readDiagramScript(text, kind);
      setState({ problems: r.problems, summary: r.doc.nodes.length ? "✓ رُسم: " + r.doc.nodes.length + " مكوّن و" + r.doc.edges.length + " سهم." : "" });
      if (r.doc.nodes.length) apply.current(r);
    }, 350);
    return () => clearTimeout(t);
  }, [text, kind]);
  const write = (v: string) => { typed.current = true; setText(v.slice(0, SCRIPT_MAX_CHARS)); };
  const fromDrawing = diagramToScript(doc);
  return (
    <section className="dgm-script" aria-label="اكتب المخطط نصًّا" data-testid="diagram-script-panel">
      <div className="dgm-check-head">
        <p className="dgm-check-sum">اكتب المخطط نصًّا (بصيغة PlantUML)</p>
        <button type="button" className="stt-btn" onClick={onClose}>إغلاق</button>
      </div>
      <textarea className="dgm-input dgm-script-code" dir="ltr" rows={10} spellCheck={false} maxLength={SCRIPT_MAX_CHARS} aria-label="نص المخطط"
        placeholder={SCRIPT_EXAMPLE[kind]()} value={text} onChange={e => write(e.target.value)} data-testid="diagram-script-text" />
      <div className="dgm-actions">
        <button type="button" className="stt-btn" onClick={() => write(SCRIPT_EXAMPLE[kind]())} data-testid="diagram-script-example">مثال</button>
        <button type="button" className="stt-btn" disabled={!fromDrawing || !doc.nodes.length} onClick={() => { typed.current = false; setText(fromDrawing ?? ""); setState(null); }}
          title={fromDrawing ? "اكتب الرسم الحالي نصًّا" : "مخطط النشاط لا يُكتب نصًّا من الرسم"}>من الرسم</button>
        <button type="button" className="stt-btn" disabled={!text.trim()} onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied("نُسخ النص."); } catch { setCopied("تعذّر النسخ: حدّد النص وانسخه بـ Ctrl+C."); }
        }}>نسخ النص</button>
        <button type="button" className="stt-btn" disabled={!text.trim()} onClick={() => downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "مخطط.puml")}>حفظ .puml</button>
        <span className="stt-hint" role="status">{copied}</span>
      </div>
      {state && (
        <div className="dgm-script-result" role="status" data-testid="diagram-script-result">
          {state.summary && <p className="dgm-script-ok">{state.summary} للعودة إلى ما قبل الكتابة: «تراجع».</p>}
          {!!state.problems.length && (
            <ul className="dgm-script-list">
              {state.problems.map((p, i) => <li key={i} className="dgm-script-problem"><span className="dgm-script-line" dir="ltr">سطر {p.line}</span><span>{p.message}</span></li>)}
            </ul>
          )}
        </div>
      )}
      <p className="stt-hint">يُرسم المخطط وأنت تكتب. ما حرّكته بيدك يبقى في مكانه. الأمثلة: «class A»، «A --&gt; B : نص»، «A &lt;|-- B»، «actor X»، «(حالة)»، «[*] --&gt; S»، «:نشاط;».</p>
    </section>
  );
}

/** DG5 — the straight / right-angled choice: one pair of buttons, in the palette and in the inspector. */
function RouteChoice({ value, onPick, testid }: { value: EdgeRoute | "mixed"; onPick: (r: EdgeRoute) => void; testid: string }) {
  return (
    <div className="dgm-route" role="radiogroup" aria-label="شكل الخط" data-testid={testid}>
      {([["straight", "مستقيم", "M3,17 L21,5"], ["ortho", "بزوايا قائمة", "M3,17 H12 V5 H21"]] as const).map(([r, label, d]) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} className={"dgm-arrow-btn" + (value === r ? " is-on" : "")}
          onClick={() => onPick(r)} data-testid={testid + "-" + r}>
          <svg viewBox="0 0 24 22" width="24" height="22" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
const ALIGN: { how: AlignHow; label: string; d: string }[] = [
  { how: "right", label: "محاذاة إلى اليمين", d: "M21,3 V21 M8,7 H19 M12,15 H19" },
  { how: "centerX", label: "توسيط أفقي", d: "M12,3 V21 M6,7 H18 M8,15 H16" },
  { how: "left", label: "محاذاة إلى اليسار", d: "M3,3 V21 M5,7 H16 M5,15 H12" },
  { how: "top", label: "محاذاة إلى الأعلى", d: "M3,3 H21 M7,5 V16 M15,5 V12" },
  { how: "middle", label: "توسيط عمودي", d: "M3,12 H21 M7,6 V18 M15,8 V16" },
  { how: "bottom", label: "محاذاة إلى الأسفل", d: "M3,21 H21 M7,8 V19 M15,12 V19" },
  { how: "spreadX", label: "مسافات أفقية متساوية", d: "M3,4 V20 M21,4 V20 M9,8 V16 M15,8 V16" },
  { how: "spreadY", label: "مسافات عمودية متساوية", d: "M4,3 H20 M4,21 H20 M8,9 H16 M8,15 H16" },
];

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.closest("input, textarea, select, [contenteditable='true']") !== null);
const nodeName = (doc: DiagramDoc, id: string) => {
  const n = doc.nodes.find(v => v.id === id);
  if (!n) return "";
  const spec = nodeSpec(doc.kind, n.type);
  const t = (n.text.name || n.text.number || "").split("\n")[0].trim();
  return (spec?.label ?? "") + (t ? ": " + t : "");
};

export default function DiagramEditorTool({ draftKey }: { draftKey?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const prefix = "dgm" + uid + "-";
  const [store, setStore] = useState<Store>(() => readStore(draftKey));
  const [selection, setSelection] = useState<Selection>(null);
  const [activeEdge, setActiveEdge] = useState<Partial<Record<DiagramKind, string>>>({});
  // a phone starts zoomed out
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 600 ? 0.6 : 1));
  const [said, setSaid] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  /** DG5 — «تحديد عدّة»: every press on the sheet adds or removes (for a finger); and the line chosen for new arrows, per kind. */
  const [multi, setMulti] = useState(false);
  const [activeRoute, setActiveRoute] = useState<Partial<Record<DiagramKind, EdgeRoute>>>({});
  const [genOpen, setGenOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  /** DG4 — the diagram as it was when a stretch of typing began: the positions the learner set come from it. */
  const scriptBase = useRef<DiagramDoc | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const propsRef = useRef<HTMLElement | null>(null);
  const editKey = useRef<string>("");
  const { kind } = store;
  const kspec = kindSpec(kind);
  const hist = store.hist[kind] ?? startHistory(emptyDoc(kind));
  const doc = hist.present;
  const edgeType = activeEdge[kind] && edgeSpec(kind, activeEdge[kind]!) ? activeEdge[kind]! : kspec.edges[0].type;

  const setHist = useCallback((f: (h: History) => History) => {
    setStore(s => ({ ...s, hist: { ...s.hist, [s.kind]: f(s.hist[s.kind] ?? startHistory(emptyDoc(s.kind))) } }));
  }, []);
  /** A change: one history step — except a run of typing in the same field, which is one step. */
  const change = useCallback((next: DiagramDoc, typingKey = "") => {
    const same = typingKey !== "" && typingKey === editKey.current;
    editKey.current = typingKey;
    setHist(h => (same ? preview(h, next) : commit(h, next)));
  }, [setHist]);

  // the draft (a book only): the last diagram of each kind, a moment after each change
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      const docs: Partial<Record<DiagramKind, DiagramDoc>> = {};
      for (const [k, h] of Object.entries(store.hist)) if (h) docs[k as DiagramKind] = h.present;
      try { localStorage.setItem(draftKey, serializeDraft({ current: store.kind, docs })); } catch { /* storage full or off: the file still works */ }
    }, 400);
    return () => clearTimeout(t);
  }, [draftKey, store]);

  const boxes = useMemo(() => {
    const m = new Map<string, NodeBox>();
    for (const n of doc.nodes) { const b = layoutNode(doc, n); if (b) m.set(n.id, b); }
    return m;
  }, [doc]);
  const paths = useMemo(() => {
    const m = new Map<string, EdgePath>();
    for (const e of doc.edges) { const p = edgePath(doc, e, boxes); if (p) m.set(e.id, p); }
    return m;
  }, [doc, boxes]);
  // DG2 — the findings follow every change while the check is open; the drawing marks what they are about
  const findings = useMemo(() => (checkOpen ? checkDiagram(doc) : []), [checkOpen, doc]);
  const marks = useMemo(() => {
    const m = new Map<string, FindingLevel>();
    for (const f of findings) for (const id of [...f.nodes, ...f.edges]) if (m.get(id) !== "error") m.set(id, f.level);
    return m;
  }, [findings]);
  const selNode = selection?.kind === "node" ? doc.nodes.find(n => n.id === selection.id) : undefined;
  const selEdge = selection?.kind === "edge" ? doc.edges.find(e => e.id === selection.id) : undefined;
  // DG5 — many chosen: only those still in the diagram count
  const manyNodes = selection?.kind === "many" ? selection.nodes.filter(id => boxes.has(id)) : [];
  const manyEdges = selection?.kind === "many" ? selection.edges.filter(id => doc.edges.some(e => e.id === id)) : [];
  const many = selection?.kind === "many" && manyNodes.length + manyEdges.length > 0;
  const chosenEdges = selectedEdges(selection).map(id => doc.edges.find(e => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  // new arrows follow the learner's last choice; before one, a diagram drawn all with right angles goes on with them
  const newRoute: EdgeRoute = activeRoute[kind] ?? (doc.edges.length && doc.edges.every(e => routeOf(e) === "ortho") ? "ortho" : "straight");
  const shownRoute: EdgeRoute | "mixed" = chosenEdges.length
    ? (chosenEdges.every(e => routeOf(e) === "ortho") ? "ortho" : chosenEdges.every(e => routeOf(e) === "straight") ? "straight" : "mixed")
    : newRoute;
  /** The route for the chosen arrows; with none chosen, for every arrow of the diagram. New arrows follow it. */
  const pickRoute = (r: EdgeRoute) => {
    setActiveRoute(a => ({ ...a, [kind]: r }));
    const ids = chosenEdges.length ? chosenEdges.map(e => e.id) : doc.edges.map(e => e.id);
    const next = setRoute(doc, ids, r);
    if (next !== doc) change(next);
    setSaid(chosenEdges.length ? (r === "ortho" ? "صار السهم المحدَّد بزوايا قائمة." : "صار السهم المحدَّد مستقيمًا.")
      : r === "ortho" ? "كل الأسهم بزوايا قائمة، والأسهم الجديدة كذلك." : "كل الأسهم مستقيمة، والأسهم الجديدة كذلك.");
  };

  const visibleCenter = () => {
    const w = wrapRef.current;
    if (!w) return { x: 400, y: 300 };
    return { x: (w.scrollLeft + Math.min(w.clientWidth, DIAGRAM_LIMITS.canvasW * zoom) / 2) / zoom, y: (w.scrollTop + Math.min(w.clientHeight, DIAGRAM_LIMITS.canvasH * zoom) / 2) / zoom };
  };
  const add = (type: string) => {
    const r = addNode(doc, type, visibleCenter());
    if (!r.ok) { setSaid(r.error); return; }
    change(r.doc);
    setSelection({ kind: "node", id: r.id! });
    setSaid("");
  };
  const doConnect = (from: string, to: string, type = edgeType) => {
    const r = connect(doc, from, to, type, newRoute);
    if (!r.ok) { setSaid(r.error); return; }
    change(r.doc);
    setSelection({ kind: "edge", id: r.id! });
    setSaid("رُسم السهم. اكتب عليه في «الخصائص» إن أردت.");
  };
  const remove = () => {
    if (selNode) change(removeNode(doc, selNode.id));
    else if (selEdge) change(removeEdge(doc, selEdge.id));
    else if (many) { change(removeMany(doc, manyNodes, manyEdges)); setSaid("حُذف المحدَّد. للعودة إليه اضغط «تراجع»."); }
    setSelection(null);
    // the «حذف» button goes with what it deleted: the keys (Ctrl+Z) stay with the sheet
    wrapRef.current?.focus({ preventScroll: true });
  };
  /** DG5 — a copy of the chosen components and the arrows between them; the copy is chosen, ready to be dragged. */
  const duplicateChosen = () => {
    const ids = selNode ? [selNode.id] : manyNodes;
    if (!ids.length) return;
    if (ids.length === 1) {
      const r = duplicateNode(doc, ids[0]);
      if (r.ok) { change(r.doc); setSelection({ kind: "node", id: r.id! }); } else setSaid(r.error);
      return;
    }
    const r = duplicateMany(doc, ids);
    if (!r.ok) { setSaid(r.error); return; }
    change(r.doc);
    setSelection(makeSelection(r.nodes!, r.edges!));
  };
  const align = (how: AlignHow) => {
    const next = alignNodes(doc, manyNodes, how, boxes);
    if (next !== doc) change(next);
  };
  const selectAll = () => { editKey.current = ""; setSelection(makeSelection(doc.nodes.map(n => n.id), doc.edges.map(e => e.id))); };
  /** DG4 — what the learner typed, drawn: one history step per stretch of typing (another change in between starts a new one); the
   *  script may name another kind (a «start» → activity), and the editor follows it. */
  const applyScript = (r: ScriptResult) => {
    const key = "script:" + r.kind;
    const same = editKey.current === key;
    if (!same) scriptBase.current = store.hist[r.kind]?.present;
    editKey.current = key;
    const next = keepPositions(r.doc, scriptBase.current);
    setStore(s => {
      const h = s.hist[r.kind] ?? startHistory(emptyDoc(r.kind));
      return { kind: r.kind, hist: { ...s.hist, [r.kind]: same ? preview(h, next) : commit(h, next) } };
    });
    setSelection(null);
  };
  const switchKind = (k: DiagramKind) => { editKey.current = ""; setStore(s => ({ ...s, kind: k })); setSelection(null); setSaid(""); };
  const loadExample = () => { change(exampleDoc(kind)); setSelection(null); setSaid("فُتح المثال. عدّل عليه أو امسحه وابدأ مخططك (للعودة: «تراجع»)."); };
  const clear = () => { if (!doc.nodes.length) return; change(emptyDoc(kind)); setSelection(null); setSaid("مُسح المخطط. للعودة إليه اضغط «تراجع»."); };
  const doUndo = () => { editKey.current = ""; setHist(undo); setSelection(null); };
  const doRedo = () => { editKey.current = ""; setHist(redo); setSelection(null); };
  const focusField = (id: string) => {
    setSelection({ kind: "node", id });
    setTimeout(() => { const first = propsRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea"); first?.focus(); first?.select?.(); }, 0);
  };

  const fit = () => {
    const b = contentBounds(doc, boxes, 30);
    const w = wrapRef.current;
    if (!b || !w) { setZoom(1); return; }
    const z = Math.max(0.3, Math.min(1.5, Math.min(w.clientWidth / (b.x + b.w), Math.max(320, w.clientHeight) / (b.y + b.h))));
    setZoom(Math.round(z * 100) / 100);
    w.scrollTo?.({ left: 0, top: 0 });
  };

  // ── pictures and files ──
  const area = () => contentBounds(doc, boxes, 24);
  /** The SVG file: the drawing with the app's typeface inside. */
  const svgFile = async () => {
    const a = area(), svg = svgRef.current;
    return a && svg ? new Blob([diagramSvgMarkup(svg, a, await embeddedFontCss(), kspec.label)], { type: "image/svg+xml;charset=utf-8" }) : null;
  };
  const savePng = async (scale = 2) => {
    if (!doc.nodes.length) { setSaid(SAID.empty); return; }
    const a = area(), svg = svgRef.current;
    if (!a || !svg) return;
    setBusy(true);
    try {
      try { downloadBlob(await diagramPng(svg, a, scale), diagramFileName(kind) + ".png"); setSaid(SAID.png); }
      catch { const f = await svgFile(); if (!f) throw new Error("empty"); downloadBlob(f, diagramFileName(kind) + ".svg"); setSaid(SAID.svg); }   // no canvas here: the SVG instead
    } catch { setSaid(SAID.failed); } finally { setBusy(false); }
  };
  const saveSvg = async () => {
    if (!doc.nodes.length) { setSaid(SAID.empty); return; }
    const f = await svgFile();
    if (!f) return;
    downloadBlob(f, diagramFileName(kind) + ".svg");
    setSaid(SAID.svg);
  };
  const copyImage = async () => {
    if (!doc.nodes.length) { setSaid(SAID.empty); return; }
    const a = area(), svg = svgRef.current;
    if (!a || !svg) return;
    try {
      // the picture is promised at once (inside the click), then drawn
      await copyPngToClipboard(diagramPng(svg, a, 2));
      setSaid(SAID.copied);
    } catch { setSaid(SAID.copyFailed); }
  };
  const saveFile = () => {
    if (!doc.nodes.length) { setSaid(SAID.empty); return; }
    downloadBlob(new Blob([serializeDiagram(doc)], { type: "application/json" }), diagramFileName(kind) + ".diagram.json");
    setSaid(SAID.file);
  };
  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > DIAGRAM_LIMITS.fileBytes) { setSaid("الملف أكبر من الحد المسموح (512 KB)."); return; }
    const r = parseDiagram(await f.text());
    if (!r.ok) { setSaid(r.error); return; }
    editKey.current = "";
    setStore(s => ({ kind: r.doc.kind, hist: { ...s.hist, [r.doc.kind]: commit(s.hist[r.doc.kind] ?? startHistory(emptyDoc(r.doc.kind)), r.doc) } }));
    setSelection(null);
    setSaid("فُتح المخطط: " + kindSpec(r.doc.kind).label + ".");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); doRedo(); return; }
    if (mod && e.key.toLowerCase() === "d" && (selNode || manyNodes.length)) { e.preventDefault(); duplicateChosen(); return; }
    if (mod && e.key.toLowerCase() === "a" && doc.nodes.length) { e.preventDefault(); selectAll(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && selection) { e.preventDefault(); remove(); return; }
    // Escape first lets go of the selection, and only that: the key stops here, so the tool bar's Escape (leave full screen, close the
    // panel) waits for the next press
    if (e.key === "Escape" && selection) { e.preventDefault(); e.stopPropagation(); setSelection(null); return; }
    const step = e.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] && selNode) { e.preventDefault(); change(moveNodesBy(doc, [selNode.id], ...moves[e.key]), "move:" + selNode.id); }
    else if (moves[e.key] && manyNodes.length) { e.preventDefault(); change(moveNodesBy(doc, manyNodes, ...moves[e.key]), "move:many:" + manyNodes.join(",")); }
  };

  const selSpec = selNode ? nodeSpec(kind, selNode.type) : undefined;
  const selEdgeSpec = selEdge ? edgeSpec(kind, selEdge.type) : undefined;
  const others = selNode ? doc.nodes.filter(n => n.id !== selNode.id || kind === "state" || kind === "class" || kind === "sequence") : [];
  // «صِل بـ»: the choice belongs to the component it was made for
  const [linkChoice, setLinkChoice] = useState<{ for: string; to: string }>({ for: "", to: "" });
  const linkTo = selNode && linkChoice.for === selNode.id ? linkChoice.to : "";
  const setLinkTo = (to: string) => setLinkChoice({ for: selNode?.id ?? "", to });
  const sortedMessages = kind === "sequence" ? [...doc.edges].sort((a, b) => a.y - b.y) : [];

  return (
    <div className="dgm" dir="rtl" onKeyDown={onKeyDown} data-testid="diagram-editor">
      <svg width="0" height="0" className="dgm-defs" aria-hidden="true" focusable="false"><Markers prefix={prefix + "pal-"} /></svg>
      <div className="dgm-bar" role="toolbar" aria-label="أوامر المخطط">
        <label className="dgm-kind">
          <span>نوع المخطط</span>
          <select value={kind} onChange={e => switchKind(e.target.value as DiagramKind)} data-testid="diagram-kind">
            {(["UML", "قواعد البيانات", "تحليل النظم", "الشبكات", "البرمجة"] as const).map(g => (
              <optgroup key={g} label={g}>{DIAGRAM_CATALOG.filter(c => c.group === g).map(c => <option key={c.kind} value={c.kind}>{c.label}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <span className="dgm-group">
          <button type="button" className="stt-btn" onClick={doUndo} disabled={!hist.past.length} title="تراجع (Ctrl+Z)">↶ تراجع</button>
          <button type="button" className="stt-btn" onClick={doRedo} disabled={!hist.future.length} title="إعادة (Ctrl+Y)">↷ إعادة</button>
        </span>
        <span className="dgm-group" aria-label="التكبير">
          <button type="button" className="stt-btn dgm-sq" onClick={() => setZoom(z => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))} aria-label="تصغير">−</button>
          <span className="dgm-zoom" dir="ltr" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" className="stt-btn dgm-sq" onClick={() => setZoom(z => Math.min(2, Math.round((z + 0.1) * 10) / 10))} aria-label="تكبير">+</button>
          <button type="button" className="stt-btn" onClick={fit} title="اعرض المخطط كله">ملاءمة</button>
        </span>
        <span className="dgm-group">
          <button type="button" className="stt-btn" onClick={loadExample} data-testid="diagram-example">مثال</button>
          <button type="button" className="stt-btn" onClick={clear} disabled={!doc.nodes.length}>مسح</button>
          <button type="button" className={"stt-btn" + (checkOpen ? " is-primary" : "")} aria-pressed={checkOpen} onClick={() => setCheckOpen(v => !v)} data-testid="diagram-check">افحص المخطط</button>
          {FROM_CODE[kind] && <button type="button" className={"stt-btn" + (genOpen ? " is-primary" : "")} aria-pressed={genOpen} onClick={() => setGenOpen(v => !v)} data-testid="diagram-generate">ولّد من الكود</button>}
          <button type="button" className={"stt-btn" + (multi ? " is-primary" : "")} aria-pressed={multi} onClick={() => setMulti(v => !v)} disabled={!doc.nodes.length}
            title="كل نقرة على الورقة تضيف عنصرًا إلى التحديد أو تزيله (بالفأرة: Shift + نقرة)" data-testid="diagram-multi">تحديد عدّة</button>
          {isScriptKind(kind) && <button type="button" className={"stt-btn" + (scriptOpen ? " is-primary" : "")} aria-pressed={scriptOpen} onClick={() => setScriptOpen(v => !v)} data-testid="diagram-script">اكتب كنص</button>}
        </span>
        <span className="dgm-group dgm-save">
          <button type="button" className="stt-btn is-primary" onClick={() => savePng(2)} disabled={busy} data-testid="diagram-png">حفظ صورة PNG</button>
          {canCopyImage() && <button type="button" className="stt-btn" onClick={copyImage} data-testid="diagram-copy">نسخ كصورة</button>}
          <details className="dgm-more">
            <summary className="stt-btn">المزيد</summary>
            <div className="dgm-menu">
              <button type="button" className="stt-btn" onClick={() => savePng(3)} disabled={busy}>صورة PNG بدقة الطباعة</button>
              <button type="button" className="stt-btn" onClick={saveSvg} data-testid="diagram-svg">حفظ صورة SVG</button>
              <button type="button" className="stt-btn" onClick={saveFile} data-testid="diagram-save-file">احفظ المخطط في ملف</button>
              <button type="button" className="stt-btn" onClick={() => fileRef.current?.click()}>افتح ملفًا</button>
            </div>
          </details>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={openFile} data-testid="diagram-open-file" />
        </span>
      </div>

      {scriptOpen && isScriptKind(kind) && <ScriptPanel kind={kind} doc={doc} onClose={() => setScriptOpen(false)} onApply={applyScript} />}
      {checkOpen && <CheckPanel findings={findings} onClose={() => setCheckOpen(false)}
        onPick={f => setSelection(f.nodes.length ? { kind: "node", id: f.nodes[0] } : f.edges.length ? { kind: "edge", id: f.edges[0] } : null)} />}
      {genOpen && FROM_CODE[kind] && <GeneratePanel key={kind} kind={kind} onClose={() => setGenOpen(false)}
        onDraw={(d, summary) => { editKey.current = ""; change(d); setSelection(null); setSaid(summary); }} />}

      <div className="dgm-main">
        <aside className="dgm-palette" aria-label="المكوّنات والأسهم">
          <p className="dgm-pal-title">المكوّنات</p>
          <div className="dgm-pal-grid">
            {kspec.nodes.map(n => (
              <button key={n.type} type="button" className="dgm-pal-btn" onClick={() => add(n.type)} aria-label={"أضف: " + n.label} data-testid={"diagram-add-" + n.type}>
                <PaletteIcon kind={kind} spec={n} /><span>{n.label}</span>
              </button>
            ))}
          </div>
          <p className="dgm-pal-title">الأسهم</p>
          <div className="dgm-arrows" role="radiogroup" aria-label="نوع السهم">
            {kspec.edges.map(e => (
              <button key={e.type} type="button" role="radio" aria-checked={(selEdge ? selEdge.type : edgeType) === e.type}
                className={"dgm-arrow-btn" + ((selEdge ? selEdge.type : edgeType) === e.type ? " is-on" : "")}
                onClick={() => {
                  setActiveEdge(a => ({ ...a, [kind]: e.type }));
                  // the chosen arrows (one or many) take the new type
                  let next = doc;
                  for (const x of chosenEdges) next = setEdge(next, x.id, { type: e.type });
                  if (next !== doc) change(next);
                }}
                data-testid={"diagram-arrow-" + e.type}>
                <ArrowIcon spec={e} prefix={prefix + "pal-"} /><span>{e.label}</span>
              </button>
            ))}
          </div>
          {routeApplies(kind) && <>
            <p className="dgm-pal-title">شكل الخط</p>
            <RouteChoice value={shownRoute} onPick={pickRoute} testid="diagram-route" />
          </>}
        </aside>

        {/* DG5: the sheet takes the keyboard when pressed (a press on a component does not move the focus by itself), so Ctrl+A, Delete,
            the arrow keys and Ctrl+Z reach the editor */}
        <div className="dgm-canvas eb-light-island" ref={wrapRef} dir="ltr" tabIndex={0} aria-label="ورقة الرسم"
          onPointerDown={() => { if (document.activeElement !== wrapRef.current) wrapRef.current?.focus({ preventScroll: true }); }}>
          <DiagramCanvas doc={doc} boxes={boxes} paths={paths} zoom={zoom} selection={selection} prefix={prefix} svgRef={svgRef} marks={marks}
            label={kspec.label + ": " + doc.nodes.length + " مكوّن، " + doc.edges.length + " سهم"}
            onSelect={s => { editKey.current = ""; setSelection(s); }}
            onPreview={d => setHist(h => preview(h, d))}
            onCommit={start => { editKey.current = ""; setHist(h => (h.present === start ? h : commit({ ...h, present: start }, h.present))); }}
            onConnect={(a, b) => doConnect(a, b)} onEdit={focusField} multi={multi} />
          {!doc.nodes.length && (
            <div className="dgm-empty" dir="rtl">
              <p><b>{kspec.label}</b>: {kspec.hint}</p>
              <ol>
                <li>اختر مكوّنًا من «المكوّنات» فيظهر على الورقة، ثم اسحبه إلى مكانه.</li>
                <li>اكتب اسمه وتفاصيله في «الخصائص».</li>
                <li>لتوصيل مكوّنين: اختر نوع السهم، ثم اسحب من النقطة الزرقاء على حافة المكوّن إلى المكوّن الآخر.</li>
                <li>احفظ المخطط صورةً لكتابك بـ «حفظ صورة PNG» أو «نسخ كصورة».</li>
              </ol>
              <button type="button" className="stt-btn" onClick={loadExample}>افتح مثالًا جاهزًا</button>
            </div>
          )}
        </div>

        <aside className="dgm-inspector" aria-label="الخصائص" ref={propsRef}>
          <p className="dgm-pal-title">الخصائص</p>
          {selNode && selSpec && (
            <div className="dgm-props" data-testid="diagram-node-props">
              <p className="dgm-props-kind">{selSpec.label}</p>
              {selSpec.fields.map(f => {
                const id = prefix + "f-" + f.key;
                const value = selNode.text[f.key] ?? "";
                const onChange = (v: string) => change(setText(doc, selNode.id, f.key, v), "text:" + selNode.id + ":" + f.key);
                return (
                  <label key={f.key} className="dgm-field" htmlFor={id}>
                    <span>{f.label}</span>
                    {f.lines
                      ? <textarea id={id} className="dgm-input" dir={f.dir ?? "auto"} rows={Math.min(8, Math.max(3, value.split("\n").length + 1))}
                        value={value} onChange={e => onChange(e.target.value)} />
                      : <input id={id} className="dgm-input" dir={f.dir ?? "auto"} value={value} onChange={e => onChange(e.target.value)} />}
                    {f.hint && <small className="stt-hint"><Hint text={f.hint} /></small>}
                  </label>
                );
              })}
              {selSpec.form !== "start" && selSpec.form !== "end" && selSpec.form !== "bar" && selSpec.form !== "frame" && (
                <fieldset className="dgm-colors">
                  <legend>اللون</legend>
                  {DIAGRAM_COLOR_IDS.map(c => (
                    <button key={c} type="button" className={"dgm-swatch" + (selNode.color === c ? " is-on" : "")} style={{ background: DIAGRAM_COLORS[c].fill }}
                      aria-label={DIAGRAM_COLORS[c].label} aria-pressed={selNode.color === c} onClick={() => change(setColor(doc, selNode.id, c))} />
                  ))}
                </fieldset>
              )}
              <div className="dgm-link">
                <label className="dgm-field">
                  <span>صِل بـ</span>
                  <select value={linkTo} onChange={e => setLinkTo(e.target.value)} data-testid="diagram-link-to">
                    <option value="">اختر مكوّنًا…</option>
                    {others.map(n => <option key={n.id} value={n.id}>{n.id === selNode.id ? "نفسه" : nodeName(doc, n.id)}</option>)}
                  </select>
                </label>
                <button type="button" className="stt-btn" disabled={!linkTo} onClick={() => doConnect(selNode.id, linkTo)} data-testid="diagram-link">
                  ارسم «{edgeSpec(kind, edgeType)?.label}»
                </button>
              </div>
              <div className="dgm-actions">
                <button type="button" className="stt-btn" onClick={duplicateChosen}>نسخة</button>
                <button type="button" className="stt-btn dgm-danger" onClick={remove} data-testid="diagram-delete">حذف</button>
              </div>
              <p className="stt-hint">حرّكه بالسحب أو بأسهم لوحة المفاتيح (مع Shift أسرع).</p>
            </div>
          )}
          {selEdge && selEdgeSpec && (
            <div className="dgm-props" data-testid="diagram-edge-props">
              <p className="dgm-props-kind">{selEdgeSpec.label}: من «{nodeName(doc, selEdge.from)}» إلى «{nodeName(doc, selEdge.to)}»</p>
              <label className="dgm-field">
                <span>نوع السهم</span>
                <select value={selEdge.type} onChange={e => change(setEdge(doc, selEdge.id, { type: e.target.value }))}>
                  {kspec.edges.map(x => <option key={x.type} value={x.type}>{x.label}</option>)}
                </select>
              </label>
              <label className="dgm-field">
                <span>{kind === "sequence" ? "الرسالة" : "النص على السهم"}</span>
                <input className="dgm-input" dir="auto" value={selEdge.label} onChange={e => change(setEdge(doc, selEdge.id, { label: e.target.value }), "label:" + selEdge.id)} data-testid="diagram-edge-label" />
              </label>
              {selEdgeSpec.endLabels && (
                <div className="dgm-ends">
                  <label className="dgm-field"><span>عند «{nodeName(doc, selEdge.from)}»</span>
                    <input className="dgm-input" dir="auto" value={selEdge.fromLabel} onChange={e => change(setEdge(doc, selEdge.id, { fromLabel: e.target.value }), "from:" + selEdge.id)} /></label>
                  <label className="dgm-field"><span>عند «{nodeName(doc, selEdge.to)}»</span>
                    <input className="dgm-input" dir="auto" value={selEdge.toLabel} onChange={e => change(setEdge(doc, selEdge.id, { toLabel: e.target.value }), "to:" + selEdge.id)} /></label>
                </div>
              )}
              {routeApplies(kind) && <div className="dgm-field"><span>شكل الخط</span>
                <RouteChoice value={routeOf(selEdge)} onPick={pickRoute} testid="diagram-edge-route" /></div>}
              {selEdgeSpec.hint && <p className="stt-hint">{selEdgeSpec.hint}</p>}
              <div className="dgm-actions">
                {kind === "sequence" && <>
                  <button type="button" className="stt-btn" onClick={() => change(moveMessage(doc, selEdge.id, -1))} disabled={sortedMessages[0]?.id === selEdge.id}>↑ أعلى</button>
                  <button type="button" className="stt-btn" onClick={() => change(moveMessage(doc, selEdge.id, 1))} disabled={sortedMessages[sortedMessages.length - 1]?.id === selEdge.id}>↓ أسفل</button>
                </>}
                <button type="button" className="stt-btn" onClick={() => change(reverseEdge(doc, selEdge.id))}>اعكس الاتجاه</button>
                <button type="button" className="stt-btn dgm-danger" onClick={remove} data-testid="diagram-delete">حذف</button>
              </div>
            </div>
          )}
          {many && (
            <div className="dgm-props" data-testid="diagram-many-props">
              <p className="dgm-props-kind" role="status">المحدَّد: {manyNodes.length} مكوّن{manyEdges.length ? "، " + manyEdges.length + " سهم" : ""}</p>
              {manyNodes.length >= 2 && (
                <fieldset className="dgm-align">
                  <legend>المحاذاة</legend>
                  {ALIGN.filter(a => manyNodes.length >= 3 || !a.how.startsWith("spread")).map(a => (
                    <button key={a.how} type="button" className="stt-btn dgm-sq" onClick={() => align(a.how)} aria-label={a.label} title={a.label} data-testid={"diagram-align-" + a.how}>
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={a.d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                  ))}
                </fieldset>
              )}
              {manyNodes.length > 0 && (
                <fieldset className="dgm-colors">
                  <legend>اللون</legend>
                  {DIAGRAM_COLOR_IDS.map(c => (
                    <button key={c} type="button" className="dgm-swatch" style={{ background: DIAGRAM_COLORS[c].fill }} aria-label={DIAGRAM_COLORS[c].label}
                      onClick={() => { let next = doc; for (const id of manyNodes) next = setColor(next, id, c); change(next); }} />
                  ))}
                </fieldset>
              )}
              {manyEdges.length > 0 && routeApplies(kind) && <div className="dgm-field"><span>شكل الخط</span>
                <RouteChoice value={shownRoute} onPick={pickRoute} testid="diagram-many-route" /></div>}
              <div className="dgm-actions">
                {manyNodes.length > 0 && <button type="button" className="stt-btn" onClick={duplicateChosen} data-testid="diagram-many-copy">نسخة</button>}
                <button type="button" className="stt-btn dgm-danger" onClick={remove} data-testid="diagram-delete">حذف المحدَّد</button>
              </div>
              <p className="stt-hint">اسحب أيّ مكوّن محدَّد فتتحرّك كلها معًا، أو حرّكها بأسهم لوحة المفاتيح. Shift + نقرة يضيف عنصرًا أو يزيله.</p>
            </div>
          )}
          {!selection && (
            <div className="dgm-props">
              <p className="stt-hint">{kspec.hint}</p>
              <p className="stt-hint">لتحديد عدّة عناصر: Shift + نقرة، أو اسحب مستطيلًا على الورقة الفارغة، أو Ctrl+A للكل (على شاشة اللمس: «تحديد عدّة»).</p>
              <p className="stt-hint">اختر مكوّنًا أو سهمًا على الورقة لتعديله، أو اختره من هنا:</p>
              <label className="dgm-field">
                <span>عناصر المخطط</span>
                <select value="" onChange={e => { const [k, id] = e.target.value.split(":"); if (id) setSelection({ kind: k as "node" | "edge", id }); }} data-testid="diagram-pick">
                  <option value="">({doc.nodes.length} مكوّن، {doc.edges.length} سهم)</option>
                  {doc.nodes.map(n => <option key={n.id} value={"node:" + n.id}>{nodeName(doc, n.id)}</option>)}
                  {doc.edges.map(e => <option key={e.id} value={"edge:" + e.id}>{(edgeSpec(kind, e.type)?.label ?? "") + ": " + nodeName(doc, e.from) + " ← " + nodeName(doc, e.to)}</option>)}
                </select>
              </label>
            </div>
          )}
        </aside>
      </div>
      <p className="stt-hint dgm-said" role="status" data-testid="diagram-status">{said}</p>
    </div>
  );
}
