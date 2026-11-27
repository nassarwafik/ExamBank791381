import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { DIAGRAM_CATALOG, DIAGRAM_COLORS, DIAGRAM_COLOR_IDS, edgeSpec, kindSpec, nodeSpec, type DiagramKind, type EdgeSpec, type NodeSpec } from "./diagramCatalog";
import {
  DIAGRAM_LIMITS, addNode, commit, connect, diagramFileName, duplicateNode, emptyDoc, moveMessage, moveNodesBy, parseDiagram, parseDraft, preview, redo,
  removeEdge, removeNode, reverseEdge, serializeDiagram, serializeDraft, setColor, setEdge, setText, startHistory, undo, type DiagramDoc, type History,
} from "./diagramDoc";
import { contentBounds, edgePath, layoutNode, type EdgePath, type NodeBox } from "./diagramLayout";
import { exampleDoc } from "./diagramExamples";
import { EdgeShape, Lifeline, Markers, NodeShape } from "./diagramShapes";
import { canCopyImage, copyPngToClipboard, diagramPng, diagramSvgMarkup, downloadBlob, embeddedFontCss } from "./diagramExport";
import DiagramCanvas, { type Selection } from "./DiagramCanvas";
import { readSqlTables, sqlToDsd, SQL_LIMITS } from "./sqlToDsd";
import { readCSharpTypes, csharpToClass, CS_LIMITS } from "./csharpToClass";
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
  const [genOpen, setGenOpen] = useState(false);
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
  const selNode = selection?.kind === "node" ? doc.nodes.find(n => n.id === selection.id) : undefined;
  const selEdge = selection?.kind === "edge" ? doc.edges.find(e => e.id === selection.id) : undefined;

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
    const r = connect(doc, from, to, type);
    if (!r.ok) { setSaid(r.error); return; }
    change(r.doc);
    setSelection({ kind: "edge", id: r.id! });
    setSaid("رُسم السهم. اكتب عليه في «الخصائص» إن أردت.");
  };
  const remove = () => {
    if (selNode) change(removeNode(doc, selNode.id));
    else if (selEdge) change(removeEdge(doc, selEdge.id));
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
    if (mod && e.key.toLowerCase() === "d" && selNode) {
      e.preventDefault();
      const r = duplicateNode(doc, selNode.id);
      if (r.ok) { change(r.doc); setSelection({ kind: "node", id: r.id! }); } else setSaid(r.error);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selection) { e.preventDefault(); remove(); return; }
    if (e.key === "Escape" && selection) { e.preventDefault(); setSelection(null); return; }
    const step = e.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] && selNode) { e.preventDefault(); change(moveNodesBy(doc, [selNode.id], ...moves[e.key]), "move:" + selNode.id); }
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
            {(["UML", "قواعد البيانات", "تحليل النظم", "الشبكات"] as const).map(g => (
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
          {FROM_CODE[kind] && <button type="button" className={"stt-btn" + (genOpen ? " is-primary" : "")} aria-pressed={genOpen} onClick={() => setGenOpen(v => !v)} data-testid="diagram-generate">ولّد من الكود</button>}
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
                onClick={() => { setActiveEdge(a => ({ ...a, [kind]: e.type })); if (selEdge) change(setEdge(doc, selEdge.id, { type: e.type })); }}
                data-testid={"diagram-arrow-" + e.type}>
                <ArrowIcon spec={e} prefix={prefix + "pal-"} /><span>{e.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="dgm-canvas eb-light-island" ref={wrapRef} dir="ltr">
          <DiagramCanvas doc={doc} boxes={boxes} paths={paths} zoom={zoom} selection={selection} prefix={prefix} svgRef={svgRef}
            label={kspec.label + ": " + doc.nodes.length + " مكوّن، " + doc.edges.length + " سهم"}
            onSelect={s => { editKey.current = ""; setSelection(s); }}
            onPreview={d => setHist(h => preview(h, d))}
            onCommit={start => { editKey.current = ""; setHist(h => (h.present === start ? h : commit({ ...h, present: start }, h.present))); }}
            onConnect={(a, b) => doConnect(a, b)} onEdit={focusField} />
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
                <button type="button" className="stt-btn" onClick={() => { const r = duplicateNode(doc, selNode.id); if (r.ok) { change(r.doc); setSelection({ kind: "node", id: r.id! }); } else setSaid(r.error); }}>نسخة</button>
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
          {!selection && (
            <div className="dgm-props">
              <p className="stt-hint">{kspec.hint}</p>
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
