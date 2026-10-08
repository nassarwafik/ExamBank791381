import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  validateRichContent, RICH_LIMITS, RICH_CODE_LANGUAGES, RICH_CALLOUT_VARIANTS, RICH_TABLE_RESPONSIVE,
  type RichBlock, type RichBlockType, type RichCell, type RichContentV1, type RichIssue, type RichRun
} from "./richContentModel";
import { parseMath } from "./richMath";
import { parseInlineMarkdown, runsToInlineMarkdown, MARKDOWN_HTML_REFUSED, MARKDOWN_IMAGE_REFUSED, MARKDOWN_LINK_TEXT_ONLY } from "./markdownToRichContent";
import { readImageFile, MEDIA_MSG } from "../questionMedia";
import { useConfirm } from "../ui/useConfirm";
import type { ConfirmOptions } from "../ui/ConfirmDialog";
import "./rich-content-editor.css";

// Phase 20D.1 — the BLOCK editor for RichContentV1 (builder only, lazy: never in the student runtime or the initial graph). Every block is
// edited through typed controls — plain <textarea> / <input> fields, selects and checkboxes — never an editable-HTML surface and never raw
// JSON. Prose fields accept a tiny SAFE inline syntax (**bold**, *italic*, `code`, $math$, ++underline++, ^sup^, ~sub~) converted to runs by
// the same parser the Markdown converter uses; nothing is ever stored as HTML. Each change emits the whole document (an empty document emits
// `undefined`, which removes the field). Incomplete blocks (e.g. an empty paragraph) are emitted as typed so typing is never blocked; the
// authority's (validateRichContent) issues are shown inline in Arabic, and the live preview renders the valid blocks through the trusted
// renderer (lazy).
const RichContentRenderer = lazy(() => import("./RichContentRenderer"));
// Phase 21A — the Scientific Math v2 snippet palette loads only when an author opens it
const MathSnippetPalette = lazy(() => import("./MathSnippetPalette"));

type Props = {
  value: RichContentV1 | undefined;
  onChange: (next: RichContentV1 | undefined) => void;
  disabled?: boolean;
  /** The host's plain text (the fallback / search text); shown as the student fallback while the document is empty. */
  plainText?: string;
  label?: string;
};
type Confirm = (o: ConfirmOptions | string) => Promise<boolean>;
/** An editor node: a block plus a stable key (and, for a columns block, its two keyed child lists). */
type EB = { key: string; block: RichBlock; cols?: [EB[], EB[]] };
/** Where a block list lives: the document root, or one column of a top-level columns block. */
type Loc = { col?: { key: string; side: 0 | 1 } };

let keySeq = 0;
const newKey = () => "rcb" + ++keySeq;
const fromBlock = (b: RichBlock): EB => (b.type === "columns"
  ? { key: newKey(), block: b, cols: [(b.columns[0]?.blocks ?? []).map(fromBlock), (b.columns[1]?.blocks ?? []).map(fromBlock)] }
  : { key: newKey(), block: b });
const toBlock = (e: EB): RichBlock => (e.cols ? { type: "columns", columns: [{ blocks: e.cols[0].map(toBlock) }, { blocks: e.cols[1].map(toBlock) }] } : e.block);
const fromValue = (v: RichContentV1 | undefined): EB[] => (v && Array.isArray(v.blocks) ? v.blocks.map(fromBlock) : []);
const toDoc = (items: EB[]): RichContentV1 | undefined => (items.length ? { schemaVersion: 1, blocks: items.map(toBlock) } : undefined);
const countBlocks = (items: EB[]): number => items.reduce((n, e) => n + 1 + (e.cols ? countBlocks(e.cols[0]) + countBlocks(e.cols[1]) : 0), 0);
const cloneEB = (e: EB): EB => ({ key: newKey(), block: structuredCloneSafe(e.block), ...(e.cols ? { cols: [e.cols[0].map(cloneEB), e.cols[1].map(cloneEB)] as [EB[], EB[]] } : {}) });
function structuredCloneSafe<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }
const sameJson = (a: unknown, b: unknown) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };

const RICH_BLOCK_LABELS: Readonly<Record<RichBlockType, string>> = Object.freeze({
  paragraph: "فقرة", heading: "عنوان", unorderedList: "قائمة", orderedList: "قائمة مرقمة", table: "جدول", image: "صورة", figure: "صورة بتعليق",
  code: "كود", cli: "CLI", quote: "اقتباس", callout: "تنبيه", divider: "فاصل", keyValueGrid: "قيم", columns: "عمودان", math: "صيغة"
});
const CALLOUT_LABELS: Readonly<Record<string, string>> = { info: "معلومة", note: "ملاحظة", warning: "تحذير", success: "إرشاد", important: "مهم" };
const LANGUAGE_LABELS: Readonly<Record<string, string>> = { python: "Python", java: "Java", csharp: "C#", pseudocode: "شبه كود", javascript: "JavaScript", html: "HTML", css: "CSS", sql: "SQL", text: "نص" };
const RESPONSIVE_LABELS: Readonly<Record<string, string>> = { scroll: "تمرير أفقي", stack: "بطاقات مكدّسة", compact: "مضغوط" };
/** The toolbar, in order: [button text, block type]. Images are added through a file picker. */
const ADDABLE: readonly (readonly [string, RichBlockType])[] = [
  ["+ فقرة", "paragraph"], ["+ عنوان", "heading"], ["+ قائمة", "unorderedList"], ["+ قائمة مرقمة", "orderedList"], ["+ جدول", "table"],
  ["+ صورة", "image"], ["+ كود", "code"], ["+ CLI", "cli"], ["+ اقتباس", "quote"], ["+ تنبيه", "callout"], ["+ فاصل", "divider"],
  ["+ قيم", "keyValueGrid"], ["+ عمودان", "columns"], ["+ صيغة", "math"]
];
const TEXT_TYPES = new Set<RichBlockType>(["paragraph", "heading", "quote", "callout", "unorderedList", "orderedList"]);
const COMPLEX_TYPES = new Set<RichBlockType>(["table", "code", "cli", "columns", "keyValueGrid", "image", "figure"]);
const RASTER = /^data:image\/(png|jpe?g|webp)[;,]/i;
const RASTER_ONLY_MSG = "صور المحتوى المنسق: PNG أو JPEG أو WEBP فقط (لا SVG ولا روابط خارجية).";

/** A fresh, structurally VALID block of the given type (the placeholder text is meant to be replaced). */
function defaultRichBlock(type: Exclude<RichBlockType, "image" | "figure">): RichBlock {
  switch (type) {
    case "paragraph": return { type: "paragraph", runs: [{ text: "فقرة جديدة" }] };
    case "heading": return { type: "heading", level: 3, runs: [{ text: "عنوان" }] };
    case "unorderedList": return { type: "unorderedList", items: [{ runs: [{ text: "عنصر" }] }] };
    case "orderedList": return { type: "orderedList", items: [{ runs: [{ text: "الخطوة الأولى" }] }] };
    case "table": return { type: "table", columnHeaders: ["العمود 1", "العمود 2"], rows: [["", ""]], responsive: "scroll" };
    case "code": return { type: "code", language: "python", source: "print(\"Hello\")" };
    case "cli": return { type: "cli", source: "show ip interface brief" };
    case "quote": return { type: "quote", runs: [{ text: "نص الاقتباس" }] };
    case "callout": return { type: "callout", variant: "info", runs: [{ text: "نص التنبيه" }] };
    case "divider": return { type: "divider" };
    case "keyValueGrid": return { type: "keyValueGrid", items: [{ label: "البند", value: "القيمة" }] };
    case "columns": return { type: "columns", columns: [{ blocks: [{ type: "paragraph", runs: [{ text: "العمود الأول" }] }] }, { blocks: [{ type: "paragraph", runs: [{ text: "العمود الثاني" }] }] }] };
    case "math": return { type: "math", source: "a^{2} + b^{2} = c^{2}" };
  }
}

// ── type conversion ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const NL: RichRun = { text: "\n" };
function blockRuns(b: RichBlock): RichRun[] {
  switch (b.type) {
    case "paragraph": case "heading": case "quote": case "callout": return b.runs;
    case "unorderedList": case "orderedList": return b.items.flatMap((it, i) => (i ? [NL, ...it.runs] : it.runs));
    case "code": case "cli": return b.source ? [{ text: b.source }] : [];
    case "math": return b.source ? [{ math: b.source }] : [];
    default: return [];
  }
}
function splitLines(runs: RichRun[]): RichRun[][] {
  const lines: RichRun[][] = [[]];
  for (const r of runs) {
    if ("math" in r) { lines[lines.length - 1].push(r); continue; }
    r.text.split("\n").forEach((part, i) => { if (i) lines.push([]); if (part) lines[lines.length - 1].push({ ...r, text: part }); });
  }
  return lines.filter(l => l.length);
}
const plainOf = (runs: RichRun[]) => runs.map(r => ("text" in r ? r.text : r.math)).join("");
/** True when the block holds author content a type change could lose. */
function hasContent(b: RichBlock): boolean {
  switch (b.type) {
    case "divider": return false;
    case "table": return b.rows.some(r => r.some(c => (typeof c === "string" ? c : plainOf(c.runs)).trim() !== "")) || !!b.caption?.trim();
    case "keyValueGrid": return b.items.some(i => i.label.trim() || i.value.trim());
    case "columns": return b.columns.some(c => c.blocks.length > 0);
    case "image": case "figure": return true;
    default: return plainOf(blockRuns(b)).trim() !== "";
  }
}
/** Converts a block; `lossy` is true when content (or formatting) cannot be carried into the new type. */
function convertBlock(b: RichBlock, to: RichBlockType): { block: RichBlock; lossy: boolean } {
  if (to === b.type) return { block: b, lossy: false };
  const runs = blockRuns(b);
  const fromText = TEXT_TYPES.has(b.type) || b.type === "code" || b.type === "cli" || b.type === "math";
  if (to === "columns") return { block: { type: "columns", columns: [{ blocks: [b] }, { blocks: [] }] }, lossy: false };
  if (!fromText || !runs.length) return { block: defaultRichBlock(to as Exclude<RichBlockType, "image" | "figure">), lossy: hasContent(b) };
  const formatted = runs.some(r => "math" in r || ("marks" in r && r.marks && r.marks.length));
  switch (to) {
    case "paragraph": return { block: { type: "paragraph", runs }, lossy: false };
    case "heading": return { block: { type: "heading", level: 3, runs }, lossy: false };
    case "quote": return { block: { type: "quote", runs }, lossy: b.type === "callout" && !!b.title };
    case "callout": return { block: { type: "callout", variant: "info", runs }, lossy: b.type === "quote" && !!b.citation };
    case "unorderedList": case "orderedList": { const items = splitLines(runs).map(l => ({ runs: l })); return { block: { type: to, items: items.length ? items : [{ runs }] }, lossy: false }; }
    case "code": return { block: { type: "code", language: "text", source: plainOf(runs) }, lossy: formatted };
    case "cli": return { block: { type: "cli", source: plainOf(runs) }, lossy: formatted };
    case "math": return { block: { type: "math", source: plainOf(runs) }, lossy: formatted };
    default: return { block: defaultRichBlock(to as Exclude<RichBlockType, "image" | "figure">), lossy: true };
  }
}
const blockIssues = (b: RichBlock, path: string): RichIssue[] => validateRichContent({ schemaVersion: 1, blocks: [b] }, path).issues;

// ── the editor ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function RichContentEditor({ value, onChange, disabled, plainText, label }: Props) {
  const [items, setItems] = useState<EB[]>(() => fromValue(value));
  const itemsRef = useRef(items);
  const lastEmitted = useRef<RichContentV1 | undefined>(value);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const { confirm, confirmDialog } = useConfirm();

  // An EXTERNAL change (undo, a conversion, another control) rebuilds the keyed model; our own emissions are recognised and kept.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    if (sameJson(value ?? null, toDoc(itemsRef.current) ?? null)) { lastEmitted.current = value; return; }
    const next = fromValue(value);
    itemsRef.current = next;
    lastEmitted.current = value;
    setItems(next);
  }, [value]);

  const commit = (next: EB[]) => {
    itemsRef.current = next;
    setItems(next);
    const doc = toDoc(next);
    lastEmitted.current = doc;
    onChange(doc);
  };
  const mapList = (list: EB[], loc: Loc, fn: (l: EB[]) => EB[]): EB[] => {
    if (!loc.col) return fn(list);
    const { key, side } = loc.col;
    return list.map(e => (e.key === key && e.cols ? { ...e, cols: (side === 0 ? [fn(e.cols[0]), e.cols[1]] : [e.cols[0], fn(e.cols[1])]) as [EB[], EB[]] } : e));
  };
  const updateList = (loc: Loc, fn: (l: EB[]) => EB[]) => commit(mapList(itemsRef.current, loc, fn));
  const total = countBlocks(items);
  const doc = useMemo(() => toDoc(items), [items]);
  const docIssues = useMemo(() => (doc ? validateRichContent(doc).issues.filter(i => !/^richContent\.blocks\[\d+\]/.test(i.path)) : []), [doc]);
  const previewDoc = useMemo<RichContentV1 | undefined>(() => {
    if (!doc) return undefined;
    const valid = doc.blocks.filter(b => validateRichContent({ schemaVersion: 1, blocks: [b] }).ok);
    return valid.length ? { schemaVersion: 1, blocks: valid } : undefined;
  }, [doc]);

  const ops: Ops = {
    disabled: !!disabled,
    total,
    confirm,
    focusKey,
    clearFocus: () => setFocusKey(null),
    collapsed,
    toggleCollapsed: key => setCollapsed(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; }),
    add: (loc, block) => {
      const e = fromBlock(block);
      updateList(loc, l => [...l, e]);
      setFocusKey(e.key);
    },
    patch: (loc, key, block) => updateList(loc, l => l.map(e => (e.key === key ? { ...e, block } : e))),
    replace: (loc, key, block) => updateList(loc, l => l.map(e => (e.key === key ? { ...fromBlock(block), key } : e))),
    move: (loc, key, delta) => updateList(loc, l => {
      const i = l.findIndex(e => e.key === key), j = i + delta;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
    }),
    duplicate: (loc, key) => updateList(loc, l => { const i = l.findIndex(e => e.key === key); if (i < 0) return l; const n = [...l]; n.splice(i + 1, 0, cloneEB(l[i])); return n; }),
    remove: (loc, key) => updateList(loc, l => l.filter(e => e.key !== key)),
    setCols: (key, side, fn) => updateList({ col: { key, side } }, fn)
  };

  const clearAll = async () => {
    if (await confirm({ title: "حذف المحتوى المنسق", message: "ستُحذف كل كتل المحتوى المنسق. يبقى النص العادي كما هو ويُعرض للطالب.", confirmLabel: "حذف المحتوى", tone: "danger" })) commit([]);
  };

  return (
    <div className="rc-editor" role="group" aria-label={label || "محتوى منسق"} dir="rtl">
      <div className="rc-editor-head">
        <strong className="rc-editor-title">{label || "محتوى منسق"}</strong>
        <span className="rc-editor-count">{total} / {RICH_LIMITS.blocks} كتلة</span>
        <span className="rc-spacer" />
        <button type="button" className="sb-mini-btn" aria-pressed={showPreview} onClick={() => setShowPreview(s => !s)}>{showPreview ? "إخفاء المعاينة" : "إظهار المعاينة"}</button>
        {items.length > 0 && <button type="button" className="sb-mini-btn sb-danger" onClick={() => void clearAll()} disabled={disabled}>حذف المحتوى المنسق</button>}
      </div>
      <p className="rc-hint">التنسيق داخل النص: **غامق** · *مائل* · `كود` · $x^{2}$ · ++تسطير++ · ^علوي^ · ~سفلي~ — لا يُقبل HTML. النص العادي يبقى نصًا احتياطيًا وللبحث.</p>
      {items.length === 0 && <p className="rc-empty">{plainText?.trim() ? "لا توجد كتل بعد — يرى الطالب النص العادي حتى تضيف محتوى منسقًا." : "لا توجد كتل بعد. أضف فقرة أو جدولًا أو كودًا…"}</p>}
      <BlockList list={items} loc={{}} depth={0} ops={ops} />
      {docIssues.length > 0 && <ul className="rc-issues" data-testid="rc-doc-issues">{docIssues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
      {showPreview && (
        <section className="rc-preview" aria-label="معاينة المحتوى المنسق">
          <h4 className="rc-preview-title">معاينة</h4>
          {previewDoc
            ? <Suspense fallback={<p className="rc-hint" role="status">جارٍ تحميل المعاينة…</p>}><div className="rc-preview-body xp-rich"><RichContentRenderer content={previewDoc} /></div></Suspense>
            : <p className="rc-hint">لا شيء للمعاينة بعد.</p>}
        </section>
      )}
      {confirmDialog}
    </div>
  );
}

type Ops = {
  disabled: boolean;
  total: number;
  confirm: Confirm;
  focusKey: string | null;
  clearFocus: () => void;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (key: string) => void;
  add: (loc: Loc, block: RichBlock) => void;
  patch: (loc: Loc, key: string, block: RichBlock) => void;
  replace: (loc: Loc, key: string, block: RichBlock) => void;
  move: (loc: Loc, key: string, delta: number) => void;
  duplicate: (loc: Loc, key: string) => void;
  remove: (loc: Loc, key: string) => void;
  setCols: (key: string, side: 0 | 1, fn: (l: EB[]) => EB[]) => void;
};
const ebCost = (e: EB): number => 1 + (e.cols ? countBlocks(e.cols[0]) + countBlocks(e.cols[1]) : 0);

function BlockList({ list, loc, depth, ops }: { list: EB[]; loc: Loc; depth: number; ops: Ops }) {
  const where = loc.col ? " من العمود " + (loc.col.side + 1) : "";
  return (
    <div className="rc-list">
      <ol className="rc-blocks">
        {list.map((e, i) => <BlockCard key={e.key} eb={e} index={i} count={list.length} loc={loc} depth={depth} name={"الكتلة " + (i + 1) + where} ops={ops} />)}
      </ol>
      <Toolbar loc={loc} depth={depth} ops={ops} />
    </div>
  );
}

function Toolbar({ loc, depth, ops }: { loc: Loc; depth: number; ops: Ops }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const room = (cost: number) => ops.total + cost <= RICH_LIMITS.blocks;
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const r = await readImageFile(file);
      if (!RASTER.test(r.dataUrl)) { setError(RASTER_ONLY_MSG); return; }
      ops.add(loc, { type: "image", asset: { dataUrl: r.dataUrl, contentType: r.contentType, origin: "uploaded" }, alt: "" });
    } catch (err) { setError(err instanceof Error && err.message ? err.message : MEDIA_MSG.readFail); }
  }
  return (
    <div className="rc-toolbar" role="group" aria-label={loc.col ? "إضافة كتلة إلى العمود " + (loc.col.side + 1) : "إضافة كتلة"}>
      {ADDABLE.filter(([, t]) => !(t === "columns" && depth > 0)).map(([text, type]) => (
        <button key={type} type="button" className="sb-mini-btn rc-add" disabled={ops.disabled || !room(type === "columns" ? 3 : 1)}
          onClick={() => { if (type === "image") fileRef.current?.click(); else ops.add(loc, defaultRichBlock(type as Exclude<RichBlockType, "image" | "figure">)); }}>{text}</button>
      ))}
      <input ref={fileRef} className="rc-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label={"ملف صورة للمحتوى المنسق" + (loc.col ? " (العمود " + (loc.col.side + 1) + ")" : "")} tabIndex={-1} onChange={e => void onFile(e)} disabled={ops.disabled} />
      {error && <p className="rc-error" role="alert">{error}</p>}
    </div>
  );
}

function BlockCard({ eb, index, count, loc, depth, name, ops }: { eb: EB; index: number; count: number; loc: Loc; depth: number; name: string; ops: Ops }) {
  const b = eb.block;
  const type = eb.cols ? "columns" : b.type;
  const ref = useRef<HTMLLIElement | null>(null);
  const complex = COMPLEX_TYPES.has(type);
  const isCollapsed = complex && ops.collapsed.has(eb.key);
  const issues = useMemo(() => (eb.cols ? [] : blockIssues(b, "richContent.blocks[" + index + "]")), [b, eb.cols, index]);
  const { focusKey, clearFocus } = ops;
  useEffect(() => {
    if (focusKey !== eb.key || !ref.current) return;
    const field = ref.current.querySelector<HTMLInputElement | HTMLTextAreaElement>(".rc-block-body textarea, .rc-block-body input:not([type=checkbox]):not([type=file])");
    if (field) { field.focus(); field.select?.(); }
    clearFocus();
  }, [focusKey, eb.key, clearFocus]);
  const set = (next: RichBlock) => ops.patch(loc, eb.key, next);
  const typeOptions = ([...Object.keys(RICH_BLOCK_LABELS)] as RichBlockType[]).filter(t => (t !== "image" && t !== "figure") || t === type || ((type === "image" || type === "figure") && (t === "image" || t === "figure"))).filter(t => !(t === "columns" && depth > 0));

  const changeType = async (to: RichBlockType) => {
    if (to === type) return;
    if ((type === "image" || type === "figure") && (to === "image" || to === "figure")) {
      const img = b as Extract<RichBlock, { type: "image" | "figure" }>;
      set(to === "figure" ? { type: "figure", asset: img.asset, alt: img.alt, caption: img.type === "figure" ? img.caption : [] } : { type: "image", asset: img.asset, alt: img.alt });
      return;
    }
    const current = toBlock(eb);
    const { block, lossy } = convertBlock(current, to);
    if (to === "columns" && ops.total + 1 > RICH_LIMITS.blocks) return;
    if (lossy && hasContent(current) && !(await ops.confirm({ title: "تغيير نوع الكتلة", message: "تحويل " + name + " من «" + RICH_BLOCK_LABELS[type] + "» إلى «" + RICH_BLOCK_LABELS[to] + "» سيحذف بعض محتواها أو تنسيقها.", confirmLabel: "تغيير النوع", tone: "danger" }))) return;
    ops.replace(loc, eb.key, block);
  };
  const remove = async () => {
    if (await ops.confirm({ title: "حذف الكتلة", message: "ستُحذف " + name + " («" + RICH_BLOCK_LABELS[type] + "») بمحتواها.", confirmLabel: "حذف الكتلة", tone: "danger" })) ops.remove(loc, eb.key);
  };

  return (
    <li ref={ref} className={"rc-block rc-block-" + type} data-block-type={type}>
      <div className="rc-block-head">
        <span className="rc-block-badge">{index + 1}</span>
        <select className="sb-input sb-input-sm" aria-label={"نوع " + name} value={type} onChange={e => void changeType(e.target.value as RichBlockType)} disabled={ops.disabled}>
          {typeOptions.map(t => <option key={t} value={t}>{RICH_BLOCK_LABELS[t]}</option>)}
        </select>
        <span className="rc-spacer" />
        {complex && <button type="button" className="sb-icon-btn rc-icon" aria-expanded={!isCollapsed} aria-label={(isCollapsed ? "فتح — " : "طيّ — ") + name} title={isCollapsed ? "فتح" : "طيّ"} onClick={() => ops.toggleCollapsed(eb.key)}>{isCollapsed ? "▸" : "▾"}</button>}
        <button type="button" className="sb-icon-btn rc-icon" aria-label={"تحريك لأعلى — " + name} title="تحريك لأعلى" onClick={() => ops.move(loc, eb.key, -1)} disabled={ops.disabled || index === 0}>↑</button>
        <button type="button" className="sb-icon-btn rc-icon" aria-label={"تحريك لأسفل — " + name} title="تحريك لأسفل" onClick={() => ops.move(loc, eb.key, 1)} disabled={ops.disabled || index === count - 1}>↓</button>
        <button type="button" className="sb-icon-btn rc-icon" aria-label={"تكرار — " + name} title="تكرار" onClick={() => ops.duplicate(loc, eb.key)} disabled={ops.disabled || ops.total + ebCost(eb) > RICH_LIMITS.blocks}>⧉</button>
        <button type="button" className="sb-icon-btn sb-danger rc-icon" aria-label={"حذف — " + name} title="حذف" onClick={() => void remove()} disabled={ops.disabled}>×</button>
      </div>
      {isCollapsed
        ? <p className="rc-collapsed-summary">{RICH_BLOCK_LABELS[type]} — مطويّة</p>
        : <div className="rc-block-body">
          {eb.cols
            ? <ColumnsBody eb={eb} ops={ops} />
            : <BlockBody block={b} name={name} set={set} disabled={ops.disabled} />}
        </div>}
      {issues.length > 0 && <ul className="rc-issues" aria-label={"مشكلات " + name}>{issues.slice(0, 6).map((x, n) => <li key={n}>{x.message}</li>)}</ul>}
    </li>
  );
}

function ColumnsBody({ eb, ops }: { eb: EB; ops: Ops }) {
  const cols = eb.cols!;
  return (
    <div className="rc-columns">
      {([0, 1] as const).map(side => (
        <div key={side} className="rc-column" role="group" aria-label={"العمود " + (side + 1)}>
          <span className="rc-column-title">العمود {side + 1}</span>
          <BlockList list={cols[side]} loc={{ col: { key: eb.key, side } }} depth={1} ops={ops} />
        </div>
      ))}
    </div>
  );
}

// ── per-type bodies ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function BlockBody({ block: b, name, set, disabled }: { block: RichBlock; name: string; set: (b: RichBlock) => void; disabled: boolean }) {
  switch (b.type) {
    case "paragraph": return (
      <>
        <InlineField label={"نص " + name} runs={b.runs} multiline onRuns={runs => set({ ...b, runs })} disabled={disabled} />
        <div className="rc-row">
          <label className="sb-inline"><span>الاتجاه</span>
            <select className="sb-input sb-input-sm" value={b.dir ?? ""} onChange={e => set(withOpt(b, "dir", e.target.value || undefined))} disabled={disabled} aria-label={"اتجاه " + name}>
              <option value="">افتراضي</option><option value="auto">تلقائي</option><option value="rtl">من اليمين</option><option value="ltr">من اليسار</option>
            </select>
          </label>
          <label className="sb-inline"><span>المحاذاة</span>
            <select className="sb-input sb-input-sm" value={b.align ?? ""} onChange={e => set(withOpt(b, "align", e.target.value || undefined))} disabled={disabled} aria-label={"محاذاة " + name}>
              <option value="">افتراضية</option><option value="start">البداية</option><option value="center">الوسط</option><option value="end">النهاية</option>
            </select>
          </label>
        </div>
      </>
    );
    case "heading": return (
      <div className="rc-row rc-row-grow">
        <select className="sb-input sb-input-sm" value={String(b.level)} onChange={e => set({ ...b, level: Number(e.target.value) as 2 | 3 | 4 })} disabled={disabled} aria-label={"مستوى " + name}>
          <option value="2">عنوان رئيسي</option><option value="3">عنوان فرعي</option><option value="4">عنوان صغير</option>
        </select>
        <InlineField label={"نص " + name} runs={b.runs} onRuns={runs => set({ ...b, runs })} disabled={disabled} />
      </div>
    );
    case "unorderedList": case "orderedList": return <ListBody block={b} name={name} set={set} disabled={disabled} />;
    case "table": return <TableBody block={b} name={name} set={set} disabled={disabled} />;
    case "image": case "figure": return <ImageBody block={b} name={name} set={set} disabled={disabled} />;
    case "code": return (
      <>
        <div className="rc-row">
          <label className="sb-inline"><span>اللغة</span>
            <select className="sb-input sb-input-sm" value={b.language} onChange={e => set({ ...b, language: e.target.value as typeof b.language })} disabled={disabled} aria-label={"لغة " + name}>
              {RICH_CODE_LANGUAGES.map(l => <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>)}
            </select>
          </label>
          <label className="sb-check"><input type="checkbox" checked={!!b.lineNumbers} onChange={e => set(withOpt(b, "lineNumbers", e.target.checked || undefined))} disabled={disabled} /><span>ترقيم الأسطر</span></label>
          <input className="sb-input sb-input-sm" value={b.title ?? ""} maxLength={RICH_LIMITS.shortText} placeholder="عنوان (اختياري)" aria-label={"عنوان " + name} onChange={e => set(withOpt(b, "title", e.target.value || undefined))} disabled={disabled} />
        </div>
        <CodeArea label={"كود " + name} value={b.source} onChange={source => set({ ...b, source })} disabled={disabled} />
      </>
    );
    case "cli": return (
      <>
        <input className="sb-input sb-input-sm" value={b.title ?? ""} maxLength={RICH_LIMITS.shortText} placeholder="عنوان (اختياري)، مثال: Router1" aria-label={"عنوان " + name} onChange={e => set(withOpt(b, "title", e.target.value || undefined))} disabled={disabled} />
        <CodeArea label={"أوامر " + name} value={b.source} onChange={source => set({ ...b, source })} disabled={disabled} />
      </>
    );
    case "quote": return (
      <>
        <InlineField label={"نص " + name} runs={b.runs} multiline onRuns={runs => set({ ...b, runs })} disabled={disabled} />
        <input className="sb-input sb-input-sm" value={b.citation ?? ""} maxLength={RICH_LIMITS.shortText} placeholder="المصدر / القائل (اختياري)" aria-label={"مصدر " + name} onChange={e => set(withOpt(b, "citation", e.target.value || undefined))} disabled={disabled} />
      </>
    );
    case "callout": return (
      <>
        <div className="rc-row rc-row-grow">
          <select className="sb-input sb-input-sm" value={b.variant} onChange={e => set({ ...b, variant: e.target.value as typeof b.variant })} disabled={disabled} aria-label={"نوع " + name + " (التنبيه)"}>
            {RICH_CALLOUT_VARIANTS.map(v => <option key={v} value={v}>{CALLOUT_LABELS[v] ?? v}</option>)}
          </select>
          <input className="sb-input sb-input-sm" value={b.title ?? ""} maxLength={RICH_LIMITS.shortText} placeholder="عنوان التنبيه (اختياري)" aria-label={"عنوان " + name} onChange={e => set(withOpt(b, "title", e.target.value || undefined))} disabled={disabled} />
        </div>
        <InlineField label={"نص " + name} runs={b.runs} multiline onRuns={runs => set({ ...b, runs })} disabled={disabled} />
      </>
    );
    case "divider": return <p className="rc-hint">خط فاصل بين أجزاء المحتوى.</p>;
    case "keyValueGrid": return <KeyValueBody block={b} name={name} set={set} disabled={disabled} />;
    case "math": return <MathBody block={b} name={name} set={set} disabled={disabled} />;
    case "columns": return null;
  }
}
/** Sets / removes one optional key, keeping exact keys (no `undefined` values are ever emitted). */
function withOpt<T extends RichBlock, K extends string>(b: T, key: K, v: unknown): T {
  const out = { ...b } as Record<string, unknown>;
  if (v === undefined) delete out[key]; else out[key] = v;
  return out as T;
}

/** A prose field: the safe inline syntax ⇄ runs. The author's spelling is kept while it means the same runs (no cursor jumps). */
function InlineField({ label, runs, onRuns, multiline, disabled, placeholder }: { label: string; runs: RichRun[]; onRuns: (r: RichRun[]) => void; multiline?: boolean; disabled?: boolean; placeholder?: string }) {
  const canonical = useMemo(() => runsToInlineMarkdown(runs), [runs]);
  const [state, setState] = useState(() => ({ draft: canonical, from: canonical, notes: [] as string[] }));
  if (state.from !== canonical) {
    const ownMeaning = runsToInlineMarkdown(parseInlineMarkdown(state.draft));
    setState({ draft: ownMeaning === canonical ? state.draft : canonical, from: canonical, notes: ownMeaning === canonical ? state.notes : [] });
  }
  const change = (v: string) => {
    const notes: string[] = [];
    const next = parseInlineMarkdown(v, code => { if (!notes.includes(code)) notes.push(code); });
    setState({ draft: v, from: runsToInlineMarkdown(next), notes });
    onRuns(next);
  };
  const props = { className: "sb-input rc-field" + (multiline ? " sb-textarea" : ""), value: state.draft, "aria-label": label, dir: "auto" as const, placeholder: placeholder ?? "اكتب النص…", disabled, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(e.target.value) };
  return (
    <>
      {multiline ? <textarea {...props} rows={Math.min(10, Math.max(2, state.draft.split("\n").length + 1))} /> : <input {...props} />}
      {state.notes.length > 0 && <p className="rc-note" role="status">{state.notes.map(noteText).join(" ")}</p>}
    </>
  );
}
const noteText = (code: string) => (code === MARKDOWN_HTML_REFUSED ? "وسوم HTML لا تُقبل وتُحذف من النص." : code === MARKDOWN_IMAGE_REFUSED ? "الصور لا تُضاف من النص؛ استخدم زر «+ صورة»." : code === MARKDOWN_LINK_TEXT_ONLY ? "الروابط تُحفظ كنصها فقط." : "صيغة رياضية غير مدعومة بقيت نصًا.");

function CodeArea({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return <textarea className="sb-input rc-code" dir="ltr" lang="en" aria-label={label} value={value} rows={Math.min(18, Math.max(4, value.split("\n").length + 1))} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" onChange={e => onChange(e.target.value)} disabled={disabled} />;
}

function ListBody({ block: b, name, set, disabled }: { block: Extract<RichBlock, { type: "unorderedList" | "orderedList" }>; name: string; set: (b: RichBlock) => void; disabled: boolean }) {
  const setItem = (i: number, runs: RichRun[]) => set({ ...b, items: b.items.map((it, k) => (k === i ? { runs } : it)) });
  return (
    <div className="rc-list-items">
      <ol className={"rc-items" + (b.type === "unorderedList" ? " rc-items-bullets" : "")}>
        {b.items.map((it, i) => (
          <li key={i} className="rc-item">
            <InlineField label={"العنصر " + (i + 1) + " في " + name} runs={it.runs} onRuns={runs => setItem(i, runs)} disabled={disabled} />
            <button type="button" className="sb-icon-btn sb-danger rc-icon" aria-label={"حذف العنصر " + (i + 1) + " من " + name} title="حذف العنصر" onClick={() => set({ ...b, items: b.items.filter((_, k) => k !== i) })} disabled={disabled || b.items.length <= 1}>×</button>
          </li>
        ))}
      </ol>
      <button type="button" className="sb-mini-btn" onClick={() => set({ ...b, items: [...b.items, { runs: [{ text: "عنصر" }] }] })} disabled={disabled || b.items.length >= RICH_LIMITS.listItems}>إضافة عنصر</button>
    </div>
  );
}

const cellRuns = (c: RichCell): RichRun[] => (typeof c === "string" ? (c ? [{ text: c }] : []) : c.runs);
/** Runs → the simplest cell: a plain string unless marks / math are present. */
const runsCell = (runs: RichRun[]): RichCell => (runs.every(r => "text" in r && !(r.marks && r.marks.length)) ? plainOf(runs) : { runs });
function TableBody({ block: t, name, set, disabled }: { block: Extract<RichBlock, { type: "table" }>; name: string; set: (b: RichBlock) => void; disabled: boolean }) {
  const cols = Math.max(t.columnHeaders?.length ?? 0, ...t.rows.map(r => r.length), 1);
  const hasHeaders = Array.isArray(t.columnHeaders);
  const setHeader = (c: number, v: string) => set({ ...t, columnHeaders: (t.columnHeaders ?? []).map((h, i) => (i === c ? v : h)) });
  const setCell = (r: number, c: number, runs: RichRun[]) => set({ ...t, rows: t.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? runsCell(runs) : cell)) : row)) });
  const addRow = () => set({ ...t, rows: [...t.rows, Array.from({ length: cols }, () => "")] });
  const addColumn = () => set({ ...t, ...(hasHeaders ? { columnHeaders: [...(t.columnHeaders ?? []), "العمود " + (cols + 1)] } : {}), rows: t.rows.map(r => [...r, ""]) });
  const removeRow = (r: number) => set({ ...t, rows: t.rows.filter((_, i) => i !== r) });
  const removeColumn = (c: number) => set({ ...t, ...(hasHeaders ? { columnHeaders: (t.columnHeaders ?? []).filter((_, i) => i !== c) } : {}), rows: t.rows.map(r => r.filter((_, i) => i !== c)) });
  const toggleHeaders = (on: boolean) => set(withOpt(t, "columnHeaders", on ? Array.from({ length: cols }, (_, i) => "العمود " + (i + 1)) : undefined));
  return (
    <div className="rc-table-editor">
      <input className="sb-input sb-input-sm" value={t.caption ?? ""} maxLength={RICH_LIMITS.shortText} placeholder="عنوان الجدول (اختياري، يُقرأ لقارئ الشاشة)" aria-label={"عنوان " + name} onChange={e => set(withOpt(t, "caption", e.target.value || undefined))} disabled={disabled} />
      <div className="rc-row">
        <button type="button" className="sb-mini-btn" onClick={addRow} disabled={disabled || t.rows.length >= RICH_LIMITS.tableRows}>إضافة صف</button>
        <button type="button" className="sb-mini-btn" onClick={addColumn} disabled={disabled || cols >= RICH_LIMITS.tableColumns}>إضافة عمود</button>
        <label className="sb-check"><input type="checkbox" checked={hasHeaders} onChange={e => toggleHeaders(e.target.checked)} disabled={disabled} /><span>صف رؤوس الأعمدة</span></label>
        <label className="sb-check"><input type="checkbox" checked={!!t.rowHeaders} onChange={e => set(withOpt(t, "rowHeaders", e.target.checked || undefined))} disabled={disabled} /><span>العمود الأول رؤوس صفوف</span></label>
        <label className="sb-inline"><span>العرض على الهاتف</span>
          <select className="sb-input sb-input-sm" value={t.responsive ?? ""} onChange={e => set(withOpt(t, "responsive", e.target.value || undefined))} disabled={disabled} aria-label={"نمط عرض " + name}>
            <option value="">افتراضي</option>
            {RICH_TABLE_RESPONSIVE.map(r => <option key={r} value={r}>{RESPONSIVE_LABELS[r] ?? r}</option>)}
          </select>
        </label>
      </div>
      <div className="rc-table-scroll">
        <table className="rc-grid">
          {hasHeaders && (
            <thead>
              <tr>
                {(t.columnHeaders ?? []).map((h, c) => (
                  <th key={c} scope="col">
                    <div className="rc-cell-tools">
                      <input className="sb-input sb-input-sm" value={h} maxLength={RICH_LIMITS.cellChars} aria-label={"رأس العمود " + (c + 1) + " في " + name} onChange={e => setHeader(c, e.target.value)} disabled={disabled} />
                      <button type="button" className="sb-icon-btn sb-danger rc-icon" aria-label={"حذف العمود " + (c + 1) + " من " + name} title="حذف العمود" onClick={() => removeColumn(c)} disabled={disabled || cols <= 1}>×</button>
                    </div>
                  </th>
                ))}
                <th aria-label="إجراءات الصف" />
              </tr>
            </thead>
          )}
          <tbody>
            {t.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={t.rowHeaders && c === 0 ? "rc-row-head" : undefined}>
                    <InlineField label={"الخلية " + (r + 1) + "،" + (c + 1) + " في " + name} runs={cellRuns(cell)} onRuns={runs => setCell(r, c, runs)} disabled={disabled} placeholder="" />
                    {!hasHeaders && r === 0 && <button type="button" className="sb-icon-btn sb-danger rc-icon" aria-label={"حذف العمود " + (c + 1) + " من " + name} title="حذف العمود" onClick={() => removeColumn(c)} disabled={disabled || cols <= 1}>×</button>}
                  </td>
                ))}
                <td className="rc-grid-actions"><button type="button" className="sb-icon-btn sb-danger rc-icon" aria-label={"حذف الصف " + (r + 1) + " من " + name} title="حذف الصف" onClick={() => removeRow(r)} disabled={disabled || t.rows.length <= 1}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImageBody({ block: b, name, set, disabled }: { block: Extract<RichBlock, { type: "image" | "figure" }>; name: string; set: (b: RichBlock) => void; disabled: boolean }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const caption = b.type === "figure" ? b.caption : [];
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const r = await readImageFile(file);
      if (!RASTER.test(r.dataUrl)) { setError(RASTER_ONLY_MSG); return; }
      set({ ...b, asset: { dataUrl: r.dataUrl, contentType: r.contentType, origin: "uploaded" } });
    } catch (err) { setError(err instanceof Error && err.message ? err.message : MEDIA_MSG.readFail); }
  }
  const setCaption = (runs: RichRun[]) => set(runs.length ? { type: "figure", asset: b.asset, alt: b.alt, caption: runs } : { type: "image", asset: b.asset, alt: b.alt });
  return (
    <div className="rc-image-editor">
      {typeof b.asset?.dataUrl === "string" && <img className="rc-thumb" src={b.asset.dataUrl} alt={b.alt || "صورة بلا وصف"} />}
      <div className="rc-row">
        <button type="button" className="sb-mini-btn" onClick={() => fileRef.current?.click()} disabled={disabled}>استبدال الصورة</button>
        <input ref={fileRef} className="rc-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label={"ملف " + name} tabIndex={-1} onChange={e => void onFile(e)} disabled={disabled} />
      </div>
      <input className="sb-input" value={b.alt} maxLength={RICH_LIMITS.shortText} placeholder="الوصف البديل (مطلوب): ماذا تُظهر الصورة؟" aria-label={"الوصف البديل لـ" + name} aria-required="true" onChange={e => set({ ...b, alt: e.target.value })} disabled={disabled} />
      <InlineField label={"تعليق " + name + " (اختياري)"} runs={caption} onRuns={setCaption} disabled={disabled} placeholder="تعليق يظهر تحت الصورة (اختياري)" />
      {error && <p className="rc-error" role="alert">{error}</p>}
    </div>
  );
}

function KeyValueBody({ block: b, name, set, disabled }: { block: Extract<RichBlock, { type: "keyValueGrid" }>; name: string; set: (b: RichBlock) => void; disabled: boolean }) {
  const setItem = (i: number, patch: Partial<{ label: string; value: string }>) => set({ ...b, items: b.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  return (
    <div className="rc-kv-editor">
      {b.items.map((it, i) => (
        <div key={i} className="rc-kv-row">
          <input className="sb-input sb-input-sm" value={it.label} maxLength={RICH_LIMITS.shortText} placeholder="البند" aria-label={"البند " + (i + 1) + " في " + name} onChange={e => setItem(i, { label: e.target.value })} disabled={disabled} />
          <input className="sb-input sb-input-sm" value={it.value} maxLength={RICH_LIMITS.shortText} placeholder="القيمة" dir="auto" aria-label={"قيمة البند " + (i + 1) + " في " + name} onChange={e => setItem(i, { value: e.target.value })} disabled={disabled} />
          <button type="button" className="sb-icon-btn sb-danger rc-icon" aria-label={"حذف القيمة " + (i + 1) + " من " + name} title="حذف القيمة" onClick={() => set({ ...b, items: b.items.filter((_, k) => k !== i) })} disabled={disabled || b.items.length <= 1}>×</button>
        </div>
      ))}
      <button type="button" className="sb-mini-btn" onClick={() => set({ ...b, items: [...b.items, { label: "البند " + (b.items.length + 1), value: "" }] })} disabled={disabled || b.items.length >= RICH_LIMITS.keyValueItems}>إضافة قيمة</button>
    </div>
  );
}

function MathBody({ block: b, name, set, disabled }: { block: Extract<RichBlock, { type: "math" }>; name: string; set: (b: RichBlock) => void; disabled: boolean }) {
  // Phase 21A: a multi-line LTR source field (matrices / cases / aligned span lines), the parser's live verdict, a trusted preview through
  // the SAME lazy renderer, and an optional snippet palette that inserts only parser-proven syntax at the caret.
  const field = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const [palette, setPalette] = useState(false);
  const parsed = useMemo(() => (b.source.trim() ? parseMath(b.source) : null), [b.source]);
  useEffect(() => {
    const el = field.current, at = caret.current;
    if (el && at !== null) { caret.current = null; el.focus(); el.setSelectionRange(at, at); }
  }, [b.source]);
  const insert = (snippet: string) => {
    const el = field.current, src = b.source;
    const start = el ? el.selectionStart : src.length, end = el ? el.selectionEnd : src.length;
    const before = src.slice(0, start), glue = before && !/\s$/.test(before) ? " " : "";
    const next = before + glue + snippet + src.slice(end);
    if (next.length > RICH_LIMITS.mathChars) return;
    caret.current = before.length + glue.length + snippet.length;
    set({ ...b, source: next });
  };
  let status: ReactNode;
  if (!parsed) status = <span className="rc-math-bad">اكتب الصيغة.</span>;
  else if (parsed.ok) status = <span className="rc-math-ok">✓ صيغة صالحة</span>;
  else status = <span className="rc-math-bad">{parsed.message}</span>;
  return (
    <div className="rc-math-editor">
      <textarea ref={field} className="sb-input rc-code rc-math-source" dir="ltr" lang="en" spellCheck={false} rows={Math.min(8, Math.max(2, b.source.split("\n").length))} value={b.source} maxLength={RICH_LIMITS.mathChars} placeholder="\frac{a}{b}" aria-label={"صيغة " + name} onChange={e => set({ ...b, source: e.target.value })} disabled={disabled} />
      <p className="rc-math-status" aria-live="polite">{status}</p>
      {parsed && parsed.ok && <div className="rc-math-preview" aria-label={"معاينة صيغة " + name}><Suspense fallback={null}><RichContentRenderer content={{ schemaVersion: 1, blocks: [b] }} /></Suspense></div>}
      <button type="button" className="sb-mini-btn rc-math-palette-toggle" aria-expanded={palette} onClick={() => setPalette(v => !v)} disabled={disabled}>{palette ? "إخفاء النماذج" : "نماذج الصيغ العلمية"}</button>
      {palette && <Suspense fallback={null}><MathSnippetPalette onInsert={insert} disabled={disabled} /></Suspense>}
      <p className="rc-hint">{"لغة الصيغ العلمية الآمنة (الإصدار 2) فقط: \\frac، \\sqrt، ^ و _، الحروف اليونانية، \\int و\\iint و\\sum و\\lim، المصفوفات \\begin{pmatrix} … \\end{pmatrix} وcases وaligned (الخلايا بـ & والأسطر بـ \\\\)، \\mathbb{R}، \\mathrm للوحدات والصيغ الكيميائية. لا أوامر خارجية ولا ماكرو."}</p>
    </div>
  );
}
