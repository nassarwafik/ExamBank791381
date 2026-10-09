// Phase 20F — AI → RichContentV1. The model never writes RichContentV1 directly: it fills ONE bounded, flat block descriptor per block
// (strict schema; only the composer's rich vocabulary — no image, figure or columns, so no URL, data URL or layout nesting can ever be
// authored), the code maps it field by field to the 20D.1 block, and the canonical validateRichContent decides (raw HTML / script URLs in
// prose, bounds, exact keys…). Technical text keeps its own direction: CLI / code / math are LTR blocks, never Arabic paragraphs.
import { looksLikeRawHtml, validateRichContent, type RichContentV1 } from "../richContent/richContentModel";
import { COMPOSER_LIMITS, type ComposerIssue } from "./composerLimits";
import { COMPOSER_CALLOUT_VARIANTS, COMPOSER_RICH_BLOCKS, COMPOSER_RICH_CODE_LANGUAGES } from "./composerCatalog";
import { cleanText, hasExactKeys, isArr, isEnum, isInt, isPlainRecord, isStr, sArr, sEnum, sInt, sNull, sObj, sStr, type JsonSchema } from "./composerSchemaKit";
import { buildAiChartSchema, mapAiChart, type AiChartPolicy } from "./composerChart";

const L = COMPOSER_LIMITS;
const DIRS = ["auto", "rtl", "ltr"] as const;
export function buildRichBlockSchema(): JsonSchema {
  return sObj({
    type: sEnum(COMPOSER_RICH_BLOCKS), text: sStr(), level: sInt(2, 4), dir: sEnum(DIRS), items: sArr(sStr(), L.richItems),
    headers: sArr(sStr(), L.richTableColumns), rows: sArr(sArr(sStr(), L.richTableColumns), L.richTableRows), language: sEnum(COMPOSER_RICH_CODE_LANGUAGES),
    source: sStr(), variant: sEnum(COMPOSER_CALLOUT_VARIANTS), title: sStr(), pairs: sArr(sObj({ label: sStr(), value: sStr() }), L.richItems),
    // 21A.1: the declarative chart descriptor of a dataChart block (null in every other block)
    chart: sNull(buildAiChartSchema())
  });
}
export const buildRichBlocksSchema = (): JsonSchema => sArr(buildRichBlockSchema(), L.richBlocks);
const BLOCK_KEYS = ["type", "text", "level", "dir", "items", "headers", "rows", "language", "source", "variant", "title", "pairs", "chart"] as const;

const runs = (text: string) => [{ text }];
/** Maps AI block descriptors to a validated RichContentV1, or refuses with the canonical validator's issues. Empty list ⇒ null. A dataChart
 *  block is judged under the caller's chart data policy (21A.1); without one, an AI chart is refused (fail closed). */
export function mapAiRichBlocks(raw: unknown, path = "richContent", chartPolicy?: AiChartPolicy): { ok: true; richContent: RichContentV1 | null } | { ok: false; issues: ComposerIssue[] } {
  const fail = (message: string, p = path): { ok: false; issues: ComposerIssue[] } => ({ ok: false, issues: [{ code: "AI_RICH_CONTENT_INVALID", message, path: p }] });
  if (!isArr(raw, L.richBlocks)) return fail("كتل المحتوى المنسق غير صالحة.");
  if (!raw.length) return { ok: true, richContent: null };
  const blocks: Record<string, unknown>[] = [];
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i], p = path + "[" + i + "]";
    if (!hasExactKeys(b, BLOCK_KEYS) || !isEnum(b.type, COMPOSER_RICH_BLOCKS)) return fail("كتلة منسقة غير صالحة البنية.", p);
    if (!isStr(b.text, L.richTextChars) || !isStr(b.source, L.richSourceChars) || !isStr(b.title, L.shortText) || !isEnum(b.dir, DIRS) || !isInt(b.level, 2, 4)) return fail("قيم الكتلة المنسقة خارج الحدود.", p);
    if (!isArr(b.items, L.richItems) || !b.items.every(x => isStr(x, L.richTextChars)) || !isArr(b.headers, L.richTableColumns) || !b.headers.every(x => isStr(x, L.shortText))) return fail("قوائم الكتلة المنسقة غير صالحة.", p);
    if (!isArr(b.rows, L.richTableRows) || !b.rows.every(r => isArr(r, L.richTableColumns) && r.every(c => isStr(c, L.richTextChars)))) return fail("صفوف الجدول غير صالحة.", p);
    if (!isArr(b.pairs, L.richItems) || !b.pairs.every(x => hasExactKeys(x, ["label", "value"]) && isStr(x.label, L.shortText) && isStr(x.value, L.richTextChars))) return fail("أزواج القيم غير صالحة.", p);
    if (!isEnum(b.language, COMPOSER_RICH_CODE_LANGUAGES) || !isEnum(b.variant, COMPOSER_CALLOUT_VARIANTS)) return fail("لغة الكود أو نوع الملاحظة غير معروف.", p);
    if (b.chart !== null && !isPlainRecord(b.chart)) return fail("وصف الرسم البياني غير صالح.", p + ".chart");
    const text = cleanText(b.text), title = cleanText(b.title);
    switch (b.type) {
      case "heading": blocks.push({ type: "heading", level: b.level, runs: runs(text) }); break;
      case "paragraph": blocks.push({ type: "paragraph", runs: runs(text), ...(b.dir !== "auto" ? { dir: b.dir } : {}) }); break;
      case "unorderedList": case "orderedList": blocks.push({ type: b.type, items: (b.items as string[]).map(x => ({ runs: runs(cleanText(x)) })) }); break;
      case "table": {
        const cols = Math.max((b.headers as string[]).length, ...(b.rows as string[][]).map(r => r.length));
        const pad = (r: string[]) => [...r.map(cleanText), ...Array(Math.max(0, cols - r.length)).fill("")];
        blocks.push({ type: "table", ...(title ? { caption: title } : {}), ...((b.headers as string[]).length ? { columnHeaders: pad(b.headers as string[]) } : {}), rows: (b.rows as string[][]).map(pad), responsive: "scroll" });
        break;
      }
      case "code": blocks.push({ type: "code", language: b.language, source: String(b.source).replace(/\r\n?/g, "\n"), ...(title ? { title } : {}) }); break;
      case "cli": blocks.push({ type: "cli", source: String(b.source).replace(/\r\n?/g, "\n"), ...(title ? { title } : {}) }); break;
      case "quote": blocks.push({ type: "quote", runs: runs(text), ...(title ? { citation: title } : {}) }); break;
      case "callout": blocks.push({ type: "callout", variant: b.variant, ...(title ? { title } : {}), runs: runs(text) }); break;
      case "divider": blocks.push({ type: "divider" }); break;
      case "keyValueGrid": blocks.push({ type: "keyValueGrid", items: (b.pairs as { label: string; value: string }[]).map(x => ({ label: cleanText(x.label), value: cleanText(x.value) })) }); break;
      case "dataChart": {
        if (b.chart === null) return fail("كتلة الرسم البياني تحتاج وصفًا للرسم (chart).", p + ".chart");
        const c = mapAiChart(b.chart, i, chartPolicy, p + ".chart");
        if (!c.ok) return { ok: false, issues: c.issues };
        blocks.push({ type: "dataChart", chart: c.chart });
        break;
      }
      case "math": {
        // 21A: multi-line grids keep LF line breaks. An AI formula that looks like markup (<script>, <math>, javascript:) is refused here even
        // though the math language would read it as inert relations: the prompt contract says HTML is refused, and AI text is untrusted.
        const source = String(b.source || b.text).replace(/\r\n?/g, "\n").trim();
        if (looksLikeRawHtml(source)) return fail("الصيغة الرياضية لا تقبل وسوم HTML أو روابط script.", p);
        blocks.push({ type: "math", source });
        break;
      }
    }
  }
  const v = validateRichContent({ schemaVersion: 1, blocks }, path);
  if (!v.ok || !v.value) return { ok: false, issues: v.issues.map(i => ({ code: "AI_RICH_CONTENT_INVALID", message: i.message, path: i.path })) };
  return { ok: true, richContent: v.value };
}
