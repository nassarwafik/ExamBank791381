// Phase 20D.1 — RichContentV1: structured, versioned, data-only CONTENT (never HTML). One strict authority shared by the client (lazy) and
// the server (shared finalization build): exact keys at every level, prototype-sensitive keys refused, a closed block / mark vocabulary,
// conservative bounds, safe raster / bank images only (the ONE canonical image-asset authority), math through the allow-listed parser, and
// a policy refusal of HTML / script-like text in prose (code / CLI sources are TEXT shown verbatim and may legitimately contain markup).
// Nothing is repaired: validation returns the canonical rebuilt copy or issues. The student projection is that same rebuild (or nothing →
// the plain `text` fallback). Rendering is the trusted React renderer (RichContentRenderer.tsx) — this module never produces markup.
import { validateImageAsset, type ImageAssetV1 } from "../imageAsset";
import { parseMath } from "./richMath";
import { CONTROL, RAW_HTML } from "./proseGuard";
import { validateChartSpec, type ChartSpecV1 } from "../charts/chartSpec";
import { chartPlainText } from "../charts/chartData";

export const RICH_CONTENT_SCHEMA_VERSION = 1 as const;
export const RICH_BLOCK_TYPES = Object.freeze(["heading", "paragraph", "unorderedList", "orderedList", "table", "image", "figure", "code", "cli", "quote", "callout", "divider", "keyValueGrid", "columns", "math", "dataChart"] as const);
export type RichBlockType = (typeof RICH_BLOCK_TYPES)[number];
export const RICH_MARKS = Object.freeze(["bold", "italic", "underline", "code", "sup", "sub"] as const);
export type RichMark = (typeof RICH_MARKS)[number];
export const RICH_CODE_LANGUAGES = Object.freeze(["python", "java", "csharp", "pseudocode", "javascript", "html", "css", "sql", "text"] as const);
export const RICH_CALLOUT_VARIANTS = Object.freeze(["info", "note", "warning", "success", "important"] as const);
export const RICH_TABLE_RESPONSIVE = Object.freeze(["scroll", "stack", "compact"] as const);
export const RICH_LIMITS = Object.freeze({
  blocks: 200, runs: 200, blockChars: 20000, totalChars: 100000, listItems: 100, tableRows: 100, tableColumns: 12, cellChars: 2000,
  shortText: 500, codeBytes: 65536, mathChars: 2000, keyValueItems: 50, columnDepth: 1, serializedBytes: 524288, charts: 8
});

export type RichRun = { text: string; marks?: RichMark[]; dir?: "ltr" | "rtl" } | { math: string };
export type RichCell = string | { runs: RichRun[] };
export type RichBlock =
  | { type: "heading"; level: 2 | 3 | 4; runs: RichRun[] }
  | { type: "paragraph"; runs: RichRun[]; dir?: "auto" | "rtl" | "ltr"; align?: "start" | "center" | "end" }
  | { type: "unorderedList" | "orderedList"; items: { runs: RichRun[] }[] }
  | { type: "table"; caption?: string; columnHeaders?: string[]; rowHeaders?: boolean; rows: RichCell[][]; responsive?: "scroll" | "stack" | "compact" }
  | { type: "image"; asset: ImageAssetV1; alt: string }
  | { type: "figure"; asset: ImageAssetV1; alt: string; caption: RichRun[] }
  | { type: "code"; language: (typeof RICH_CODE_LANGUAGES)[number]; source: string; lineNumbers?: boolean; title?: string }
  | { type: "cli"; source: string; title?: string }
  | { type: "quote"; runs: RichRun[]; citation?: string }
  | { type: "callout"; variant: (typeof RICH_CALLOUT_VARIANTS)[number]; title?: string; runs: RichRun[] }
  | { type: "divider" }
  | { type: "keyValueGrid"; items: { label: string; value: string }[] }
  | { type: "columns"; columns: { blocks: RichBlock[] }[] }
  | { type: "math"; source: string }
  // Phase 21A.1: a declarative data chart (ExamBank ChartSpecV1 — never a rendering-library option), validated by the ONE chart authority.
  | { type: "dataChart"; chart: ChartSpecV1 };
export type RichContentV1 = { schemaVersion: 1; blocks: RichBlock[] };
export type RichIssue = { code: string; message: string; severity: "error"; path: string };
export type RichResult = { ok: boolean; value?: RichContentV1; issues: RichIssue[] };

const BLOCK_KEYS: Readonly<Record<RichBlockType, readonly string[]>> = Object.freeze({
  heading: ["type", "level", "runs"], paragraph: ["type", "runs", "dir", "align"], unorderedList: ["type", "items"], orderedList: ["type", "items"],
  table: ["type", "caption", "columnHeaders", "rowHeaders", "rows", "responsive"], image: ["type", "asset", "alt"], figure: ["type", "asset", "alt", "caption"],
  code: ["type", "language", "source", "lineNumbers", "title"], cli: ["type", "source", "title"], quote: ["type", "runs", "citation"],
  callout: ["type", "variant", "title", "runs"], divider: ["type"], keyValueGrid: ["type", "items"], columns: ["type", "columns"], math: ["type", "source"],
  dataChart: ["type", "chart"]
});
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
  }
  return n;
}

/** Phase 21A — the raw-HTML / script-URL pattern prose refuses, as a predicate for intake paths that must be stricter than the stored-content
 *  validator (AI-authored formulas). The math language itself stays unchanged: `<` `>` `/` are relations, so such a source is inert math data. */
export const looksLikeRawHtml = (s: string): boolean => RAW_HTML.test(s);
/** Strict validation of a RichContentV1 document. Never throws; returns the canonical rebuilt copy only when there is no issue. */
export function validateRichContent(raw: unknown, path = "richContent"): RichResult {
  const issues: RichIssue[] = [];
  const add = (code: string, message: string, at: string) => { if (issues.length < 50) issues.push({ code, message, severity: "error", path: at }); };
  let blockCount = 0, totalChars = 0, chartCount = 0;
  const chartIds = new Set<string>();
  const keysOk = (o: Record<string, unknown>, allowed: readonly string[], at: string): boolean => {
    let ok = true;
    for (const k of Object.keys(o)) if (FORBIDDEN_KEYS.has(k) || !allowed.includes(k)) { add("RICH_CONTENT_UNKNOWN_KEY", "حقل غير معروف في المحتوى المنسق: " + k, at + "." + k); ok = false; }
    // a literal "__proto__" key in parsed JSON is an own property; Object.keys reports it, so the loop above already refuses it
    return ok;
  };
  const prose = (v: unknown, at: string, max: number, required: boolean): string | undefined => {
    if (typeof v !== "string") { add("RICH_CONTENT_INVALID", "نص غير صالح في المحتوى المنسق.", at); return undefined; }
    if (required && v.trim() === "") { add("RICH_CONTENT_INVALID", "نص فارغ في المحتوى المنسق.", at); return undefined; }
    if (v.length > max) { add("RICH_CONTENT_LIMIT", "نص أطول من الحد المسموح في المحتوى المنسق.", at); return undefined; }
    if (CONTROL.test(v)) { add("RICH_CONTENT_INVALID_TEXT", "محارف تحكم غير مسموحة في المحتوى المنسق.", at); return undefined; }
    if (RAW_HTML.test(v)) { add("RICH_CONTENT_RAW_HTML", "المحتوى المنسق لا يقبل وسوم HTML أو روابط script.", at); return undefined; }
    totalChars += v.length;
    return v;
  };
  const verbatim = (v: unknown, at: string, maxBytes: number): string | undefined => {
    if (typeof v !== "string" || v.trim() === "") { add("RICH_CONTENT_INVALID", "نص الكود فارغ أو غير صالح.", at); return undefined; }
    if (utf8Bytes(v) > maxBytes) { add("RICH_CONTENT_LIMIT", "الكود أطول من الحد المسموح.", at); return undefined; }
    if (CONTROL.test(v)) { add("RICH_CONTENT_INVALID_TEXT", "محارف تحكم غير مسموحة في الكود.", at); return undefined; }
    totalChars += v.length;
    return v;
  };
  const optShort = (o: Record<string, unknown>, k: string, at: string, out: Record<string, unknown>) => {
    if (!own(o, k)) return;
    const v = prose(o[k], at + "." + k, RICH_LIMITS.shortText, false);
    if (v !== undefined) out[k] = v;
  };
  const enumOf = <T extends string>(v: unknown, allowed: readonly T[], at: string, what: string): T | undefined => {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
    add("RICH_CONTENT_INVALID", what + " غير مسموح في المحتوى المنسق.", at);
    return undefined;
  };
  const runs = (v: unknown, at: string, allowEmpty: boolean): RichRun[] | undefined => {
    if (!Array.isArray(v)) { add("RICH_CONTENT_INVALID", "سطر نصي غير صالح في المحتوى المنسق.", at); return undefined; }
    if (v.length > RICH_LIMITS.runs) { add("RICH_CONTENT_LIMIT", "عدد المقاطع النصية أكبر من الحد المسموح.", at); return undefined; }
    if (!allowEmpty && v.length === 0) { add("RICH_CONTENT_INVALID", "سطر نصي فارغ في المحتوى المنسق.", at); return undefined; }
    const out: RichRun[] = [];
    let chars = 0, bad = false;
    v.forEach((r, i) => {
      const rp = at + "[" + i + "]";
      if (!isPlain(r)) { add("RICH_CONTENT_INVALID", "مقطع نصي غير صالح.", rp); bad = true; return; }
      if (own(r, "math")) {
        if (!keysOk(r, ["math"], rp)) { if (own(r, "text")) add("RICH_CONTENT_INVALID", "المقطع إما نص أو صيغة، لا الاثنان.", rp); bad = true; return; }
        if (typeof r.math !== "string" || r.math.length > RICH_LIMITS.mathChars) { add(typeof r.math === "string" ? "RICH_CONTENT_LIMIT" : "RICH_CONTENT_INVALID", "صيغة رياضية غير صالحة.", rp); bad = true; return; }
        const m = parseMath(r.math);
        if (!m.ok) { add("RICH_CONTENT_MATH", m.message, rp); bad = true; return; }
        chars += r.math.length; totalChars += r.math.length;
        out.push({ math: r.math });
        return;
      }
      if (!keysOk(r, ["text", "marks", "dir"], rp)) { bad = true; return; }
      const text = prose(r.text, rp + ".text", RICH_LIMITS.blockChars, false);
      if (text === undefined) { bad = true; return; }
      chars += text.length;
      const run: { text: string; marks?: RichMark[]; dir?: "ltr" | "rtl" } = { text };
      if (own(r, "marks")) {
        const ms = r.marks;
        if (!Array.isArray(ms) || ms.length > RICH_MARKS.length || new Set(ms).size !== ms.length || ms.some(m => typeof m !== "string" || !(RICH_MARKS as readonly string[]).includes(m))) { add("RICH_CONTENT_INVALID", "تنسيق نصي غير مسموح.", rp + ".marks"); bad = true; return; }
        run.marks = ms as RichMark[];
      }
      if (own(r, "dir")) { const d = enumOf(r.dir, ["ltr", "rtl"] as const, rp + ".dir", "اتجاه النص"); if (!d) { bad = true; return; } run.dir = d; }
      out.push(run);
    });
    if (chars > RICH_LIMITS.blockChars) { add("RICH_CONTENT_LIMIT", "نص الكتلة أطول من الحد المسموح.", at); return undefined; }
    return bad ? undefined : out;
  };
  const image = (v: unknown, at: string): ImageAssetV1 | undefined => {
    const a = validateImageAsset(v);
    if (!a) add("RICH_CONTENT_IMAGE", "صورة غير صالحة: يُقبل فقط ملف صورة آمن مرفوع (PNG/JPEG/WEBP) أو صورة من البنك — لا روابط خارجية ولا SVG.", at);
    return a || undefined;
  };
  const alt = (v: unknown, at: string): string | undefined => {
    if (typeof v !== "string" || v.trim() === "") { add("RICH_CONTENT_IMAGE", "النص البديل للصورة مطلوب.", at); return undefined; }
    return prose(v, at, RICH_LIMITS.shortText, true);
  };
  const block = (b: unknown, at: string, depth: number): RichBlock | undefined => {
    blockCount++;
    if (!isPlain(b)) { add("RICH_CONTENT_INVALID", "كتلة غير صالحة في المحتوى المنسق.", at); return undefined; }
    const type = b.type;
    if (typeof type !== "string" || !(RICH_BLOCK_TYPES as readonly string[]).includes(type)) { add("RICH_CONTENT_BLOCK_TYPE", "نوع كتلة غير مسموح في المحتوى المنسق: " + String(type).slice(0, 40), at + ".type"); return undefined; }
    const t = type as RichBlockType;
    if (!keysOk(b, BLOCK_KEYS[t], at)) return undefined;
    const before = issues.length;
    let out: RichBlock | undefined;
    switch (t) {
      case "heading": {
        const level = b.level === 2 || b.level === 3 || b.level === 4 ? b.level : (add("RICH_CONTENT_INVALID", "مستوى العنوان يجب أن يكون 2 أو 3 أو 4.", at + ".level"), undefined);
        const r = runs(b.runs, at + ".runs", false);
        if (level && r) out = { type: "heading", level, runs: r };
        break;
      }
      case "paragraph": {
        const r = runs(b.runs, at + ".runs", false);
        const o: Extract<RichBlock, { type: "paragraph" }> = { type: "paragraph", runs: r || [] };
        if (own(b, "dir")) { const d = enumOf(b.dir, ["auto", "rtl", "ltr"] as const, at + ".dir", "اتجاه الفقرة"); if (d) o.dir = d; }
        if (own(b, "align")) { const a = enumOf(b.align, ["start", "center", "end"] as const, at + ".align", "محاذاة الفقرة"); if (a) o.align = a; }
        if (r) out = o;
        break;
      }
      case "unorderedList": case "orderedList": {
        if (!Array.isArray(b.items) || b.items.length === 0) { add("RICH_CONTENT_INVALID", "القائمة تحتاج عنصرًا واحدًا على الأقل.", at + ".items"); break; }
        if (b.items.length > RICH_LIMITS.listItems) { add("RICH_CONTENT_LIMIT", "عدد عناصر القائمة أكبر من الحد المسموح.", at + ".items"); break; }
        const items: { runs: RichRun[] }[] = [];
        b.items.forEach((it, i) => {
          const ip = at + ".items[" + i + "]";
          if (!isPlain(it)) { add("RICH_CONTENT_INVALID", "عنصر قائمة غير صالح.", ip); return; }
          if (!keysOk(it, ["runs"], ip)) return;
          const r = runs(it.runs, ip + ".runs", false);
          if (r) items.push({ runs: r });
        });
        out = { type: t, items };
        break;
      }
      case "table": {
        const o: Extract<RichBlock, { type: "table" }> = { type: "table", rows: [] };
        optShort(b, "caption", at, o as unknown as Record<string, unknown>);
        let cols = -1;
        if (own(b, "columnHeaders")) {
          const h = b.columnHeaders;
          if (!Array.isArray(h) || h.length === 0) add("RICH_CONTENT_INVALID", "رؤوس أعمدة الجدول غير صالحة.", at + ".columnHeaders");
          else if (h.length > RICH_LIMITS.tableColumns) add("RICH_CONTENT_LIMIT", "عدد أعمدة الجدول أكبر من الحد المسموح.", at + ".columnHeaders");
          else { const hs = h.map((x, i) => prose(x, at + ".columnHeaders[" + i + "]", RICH_LIMITS.cellChars, false)); if (hs.every(x => x !== undefined)) o.columnHeaders = hs as string[]; cols = h.length; }
        }
        if (own(b, "rowHeaders")) { if (typeof b.rowHeaders !== "boolean") add("RICH_CONTENT_INVALID", "خيار رؤوس الصفوف يجب أن يكون منطقيًا.", at + ".rowHeaders"); else o.rowHeaders = b.rowHeaders; }
        if (own(b, "responsive")) { const r = enumOf(b.responsive, RICH_TABLE_RESPONSIVE, at + ".responsive", "نمط عرض الجدول"); if (r) o.responsive = r; }
        const rows = b.rows;
        if (!Array.isArray(rows) || rows.length === 0) { add("RICH_CONTENT_INVALID", "الجدول يحتاج صفًا واحدًا على الأقل.", at + ".rows"); break; }
        if (rows.length > RICH_LIMITS.tableRows) { add("RICH_CONTENT_LIMIT", "عدد صفوف الجدول أكبر من الحد المسموح.", at + ".rows"); break; }
        rows.forEach((row, ri) => {
          const rp = at + ".rows[" + ri + "]";
          if (!Array.isArray(row) || row.length === 0) { add("RICH_CONTENT_INVALID", "صف جدول غير صالح.", rp); return; }
          if (row.length > RICH_LIMITS.tableColumns) { add("RICH_CONTENT_LIMIT", "عدد أعمدة الجدول أكبر من الحد المسموح.", rp); return; }
          if (cols === -1) cols = row.length;
          else if (row.length !== cols) { add("RICH_CONTENT_INVALID", "صفوف الجدول يجب أن تحمل عدد الأعمدة نفسه.", rp); return; }
          const cells: RichCell[] = [];
          row.forEach((c, ci) => {
            const cp = rp + "[" + ci + "]";
            if (typeof c === "string") { const v = prose(c, cp, RICH_LIMITS.cellChars, false); if (v !== undefined) cells.push(v); return; }
            if (!isPlain(c) || !keysOk(c, ["runs"], cp)) { if (!isPlain(c)) add("RICH_CONTENT_INVALID", "خلية جدول غير صالحة.", cp); return; }
            const r = runs(c.runs, cp + ".runs", false);
            if (r) { if (r.reduce((n, x) => n + ("text" in x ? x.text.length : x.math.length), 0) > RICH_LIMITS.cellChars) add("RICH_CONTENT_LIMIT", "نص خلية الجدول أطول من الحد المسموح.", cp); else cells.push({ runs: r }); }
          });
          o.rows.push(cells);
        });
        out = o;
        break;
      }
      case "image": case "figure": {
        const a = image(b.asset, at + ".asset");
        const al = alt(b.alt, at + ".alt");
        if (t === "figure") { const cap = runs(b.caption, at + ".caption", true); if (a && al !== undefined && cap) out = { type: "figure", asset: a, alt: al, caption: cap }; }
        else if (a && al !== undefined) out = { type: "image", asset: a, alt: al };
        break;
      }
      case "code": {
        const lang = enumOf(b.language, RICH_CODE_LANGUAGES, at + ".language", "لغة الكود");
        const src = verbatim(b.source, at + ".source", RICH_LIMITS.codeBytes);
        const o: Extract<RichBlock, { type: "code" }> = { type: "code", language: lang || "text", source: src || "" };
        if (own(b, "lineNumbers")) { if (typeof b.lineNumbers !== "boolean") add("RICH_CONTENT_INVALID", "ترقيم الأسطر يجب أن يكون منطقيًا.", at + ".lineNumbers"); else o.lineNumbers = b.lineNumbers; }
        optShort(b, "title", at, o as unknown as Record<string, unknown>);
        if (lang && src !== undefined) out = o;
        break;
      }
      case "cli": {
        const src = verbatim(b.source, at + ".source", RICH_LIMITS.codeBytes);
        const o: Extract<RichBlock, { type: "cli" }> = { type: "cli", source: src || "" };
        optShort(b, "title", at, o as unknown as Record<string, unknown>);
        if (src !== undefined) out = o;
        break;
      }
      case "quote": {
        const r = runs(b.runs, at + ".runs", false);
        const o: Extract<RichBlock, { type: "quote" }> = { type: "quote", runs: r || [] };
        optShort(b, "citation", at, o as unknown as Record<string, unknown>);
        if (r) out = o;
        break;
      }
      case "callout": {
        const v = enumOf(b.variant, RICH_CALLOUT_VARIANTS, at + ".variant", "نوع التنبيه");
        const o: Extract<RichBlock, { type: "callout" }> = { type: "callout", variant: v || "info", runs: [] };
        optShort(b, "title", at, o as unknown as Record<string, unknown>);
        const r = runs(b.runs, at + ".runs", false);
        if (r) o.runs = r;
        if (v && r) out = { type: "callout", variant: v, ...(o.title !== undefined ? { title: o.title } : {}), runs: r };
        break;
      }
      case "divider": out = { type: "divider" }; break;
      case "keyValueGrid": {
        if (!Array.isArray(b.items) || b.items.length === 0) { add("RICH_CONTENT_INVALID", "شبكة القيم تحتاج عنصرًا واحدًا على الأقل.", at + ".items"); break; }
        if (b.items.length > RICH_LIMITS.keyValueItems) { add("RICH_CONTENT_LIMIT", "عدد عناصر شبكة القيم أكبر من الحد المسموح.", at + ".items"); break; }
        const items: { label: string; value: string }[] = [];
        b.items.forEach((it, i) => {
          const ip = at + ".items[" + i + "]";
          if (!isPlain(it)) { add("RICH_CONTENT_INVALID", "عنصر غير صالح في شبكة القيم.", ip); return; }
          if (!keysOk(it, ["label", "value"], ip)) return;
          const l = prose(it.label, ip + ".label", RICH_LIMITS.shortText, true), v = prose(it.value, ip + ".value", RICH_LIMITS.shortText, false);
          if (l !== undefined && v !== undefined) items.push({ label: l, value: v });
        });
        out = { type: "keyValueGrid", items };
        break;
      }
      case "columns": {
        if (depth >= RICH_LIMITS.columnDepth) { add("RICH_CONTENT_NESTING", "الأعمدة لا تتداخل داخل أعمدة أخرى.", at); break; }
        if (!Array.isArray(b.columns) || b.columns.length !== 2) { add("RICH_CONTENT_INVALID", "كتلة الأعمدة تحمل عمودين فقط.", at + ".columns"); break; }
        const columns: { blocks: RichBlock[] }[] = [];
        b.columns.forEach((c, ci) => {
          const cp = at + ".columns[" + ci + "]";
          if (!isPlain(c)) { add("RICH_CONTENT_INVALID", "عمود غير صالح.", cp); return; }
          if (!keysOk(c, ["blocks"], cp)) return;
          if (!Array.isArray(c.blocks)) { add("RICH_CONTENT_INVALID", "كتل العمود غير صالحة.", cp + ".blocks"); return; }
          const inner: RichBlock[] = [];
          c.blocks.forEach((x, xi) => { const r = block(x, cp + ".blocks[" + xi + "]", depth + 1); if (r) inner.push(r); });
          columns.push({ blocks: inner });
        });
        out = { type: "columns", columns };
        break;
      }
      case "math": {
        if (typeof b.source !== "string") { add("RICH_CONTENT_INVALID", "صيغة رياضية غير صالحة.", at + ".source"); break; }
        if (b.source.length > RICH_LIMITS.mathChars) { add("RICH_CONTENT_LIMIT", "الصيغة الرياضية أطول من الحد المسموح.", at + ".source"); break; }
        const m = parseMath(b.source);
        if (!m.ok) { add("RICH_CONTENT_MATH", m.message, at + ".source"); break; }
        totalChars += b.source.length;
        out = { type: "math", source: b.source };
        break;
      }
      case "dataChart": {
        if (++chartCount > RICH_LIMITS.charts) { add("RICH_CONTENT_LIMIT", "عدد الرسوم البيانية في المحتوى المنسق أكبر من الحد المسموح (" + RICH_LIMITS.charts + ").", at); break; }
        const c = validateChartSpec(b.chart, at + ".chart");
        if (!c.ok) { for (const i of c.issues) add("RICH_CONTENT_CHART", i.message + " [" + i.code + "]", i.path); break; }
        if (chartIds.has(c.value.id)) { add("RICH_CONTENT_CHART", "معرّف الرسم البياني «" + c.value.id + "» مكرّر في المحتوى نفسه.", at + ".chart.id"); break; }
        chartIds.add(c.value.id);
        totalChars += chartPlainText(c.value).length;
        out = { type: "dataChart", chart: c.value };
        break;
      }
    }
    return issues.length === before ? out : undefined;
  };

  if (!isPlain(raw)) { add("RICH_CONTENT_INVALID", "المحتوى المنسق يجب أن يكون كائنًا منظمًا (لا نص HTML).", path); return { ok: false, issues }; }
  if (raw.schemaVersion !== RICH_CONTENT_SCHEMA_VERSION) { add("RICH_CONTENT_VERSION", "إصدار المحتوى المنسق غير مدعوم (المدعوم: 1).", path + ".schemaVersion"); return { ok: false, issues }; }
  keysOk(raw, ["schemaVersion", "blocks"], path);
  if (!Array.isArray(raw.blocks)) { add("RICH_CONTENT_INVALID", "كتل المحتوى المنسق غير صالحة.", path + ".blocks"); return { ok: false, issues }; }
  if (raw.blocks.length === 0) add("RICH_CONTENT_EMPTY", "المحتوى المنسق فارغ.", path + ".blocks");
  const blocks: RichBlock[] = [];
  if (raw.blocks.length <= RICH_LIMITS.blocks) raw.blocks.forEach((b, i) => { const r = block(b, path + ".blocks[" + i + "]", 0); if (r) blocks.push(r); });
  if (raw.blocks.length > RICH_LIMITS.blocks || blockCount > RICH_LIMITS.blocks) add("RICH_CONTENT_LIMIT", "عدد كتل المحتوى المنسق أكبر من الحد المسموح.", path + ".blocks");
  if (totalChars > RICH_LIMITS.totalChars) add("RICH_CONTENT_LIMIT", "حجم نص المحتوى المنسق أكبر من الحد المسموح.", path);
  if (issues.length === 0) {
    let bytes = Infinity;
    try { bytes = utf8Bytes(JSON.stringify(raw, (k, v) => (k === "dataUrl" && typeof v === "string" && v.startsWith("data:image/") ? "" : v)) ?? ""); } catch { /* cyclic → refused below */ }
    if (bytes > RICH_LIMITS.serializedBytes) add("RICH_CONTENT_LIMIT", "حجم المحتوى المنسق أكبر من الحد المسموح.", path);
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: { schemaVersion: 1, blocks }, issues };
}

/** The student projection: the strict canonical rebuild, or undefined (→ the plain `text` fallback). Never a spread of stored data. */
export function projectRichContentForStudent(raw: unknown): RichContentV1 | undefined {
  const r = validateRichContent(raw);
  return r.ok ? r.value : undefined;
}

const runsText = (runs: readonly RichRun[]) => runs.map(r => ("text" in r ? r.text : r.math)).join("");
/** Plain text of a document (search, the plain fallback suggestion, accessibility summaries). Total; tolerates malformed input. */
export function richContentPlainText(raw: unknown): string {
  const r = validateRichContent(raw);
  if (!r.ok || !r.value) return "";
  const out: string[] = [];
  const walk = (blocks: readonly RichBlock[]) => {
    for (const b of blocks) {
      switch (b.type) {
        case "heading": case "paragraph": case "quote": out.push(runsText(b.runs)); if (b.type === "quote" && b.citation) out.push(b.citation); break;
        case "callout": if (b.title) out.push(b.title); out.push(runsText(b.runs)); break;
        case "unorderedList": case "orderedList": for (const it of b.items) out.push(runsText(it.runs)); break;
        case "table": if (b.caption) out.push(b.caption); if (b.columnHeaders) out.push(b.columnHeaders.join(" | ")); for (const row of b.rows) out.push(row.map(c => (typeof c === "string" ? c : runsText(c.runs))).join(" | ")); break;
        case "image": out.push(b.alt); break;
        case "figure": out.push(b.alt); if (b.caption.length) out.push(runsText(b.caption)); break;
        case "code": case "cli": if (b.title) out.push(b.title); out.push(b.source); break;
        case "keyValueGrid": for (const it of b.items) out.push(it.label + ": " + it.value); break;
        case "columns": for (const c of b.columns) walk(c.blocks); break;
        case "math": out.push(b.source); break;
        case "dataChart": out.push(chartPlainText(b.chart)); break;
        case "divider": break;
      }
    }
  };
  walk(r.value.blocks);
  return out.filter(Boolean).join("\n");
}

/** Rebuilds a (possibly unvalidated) document with every image / figure asset passed through `fn` (bank-asset hydration / storage).
 *  Structure-only walk: anything that is not a plain block / asset is copied as is (validation stays the authority). */
export function mapRichImages(raw: unknown, fn: (asset: Record<string, unknown>) => Record<string, unknown>): unknown {
  if (!isPlain(raw) || !Array.isArray(raw.blocks)) return raw;
  const mapBlocks = (blocks: unknown[]): unknown[] => blocks.map(b => {
    if (!isPlain(b)) return b;
    if ((b.type === "image" || b.type === "figure") && isPlain(b.asset)) return { ...b, asset: fn(b.asset) };
    if (b.type === "columns" && Array.isArray(b.columns)) return { ...b, columns: b.columns.map(c => (isPlain(c) && Array.isArray(c.blocks) ? { ...c, blocks: mapBlocks(c.blocks) } : c)) };
    return b;
  });
  return { ...raw, blocks: mapBlocks(raw.blocks) };
}
