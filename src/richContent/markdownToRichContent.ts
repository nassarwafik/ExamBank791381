// Phase 20D.1 — a repository-owned, LINE-BASED converter from a SAFE Markdown subset to a RichContentV1 document. Builder-only (lazy):
// it never enters the student runtime or the initial graph. It produces DATA, never markup: no HTML is generated, parsed into the DOM or
// persisted. Raw HTML (block or inline tags) is dropped with a warning; images are never fetched (they become a plain "[صورة: …]" note);
// links keep their visible text only (the URL is dropped). Math is accepted only when the allow-listed parser (richMath) accepts it.
// The result is always re-validated by the ONE authority (validateRichContent); a block that still fails is dropped with a warning.
//
// The same INLINE syntax powers the block editor's text fields (parseInlineMarkdown / runsToInlineMarkdown), so authors get marks
// without HTML:  **bold**   *italic* / _italic_   `code`   $math$   ++underline++   ^sup^   ~sub~   (~~strike~~ keeps the text, drops the
// markers — there is no strike mark). Every RichMark has a spelling, so editing a field never silently loses a mark.
import { validateRichContent, RICH_CODE_LANGUAGES, RICH_LIMITS, type RichBlock, type RichContentV1, type RichMark, type RichRun } from "./richContentModel";
import { parseMath } from "./richMath";

export const MARKDOWN_HTML_REFUSED = "MARKDOWN_HTML_REFUSED";
export const MARKDOWN_IMAGE_REFUSED = "MARKDOWN_IMAGE_REFUSED";
export const MARKDOWN_LINK_TEXT_ONLY = "MARKDOWN_LINK_TEXT_ONLY";
export const MARKDOWN_MATH_REFUSED = "MARKDOWN_MATH_REFUSED";
export const MARKDOWN_TABLE_RAGGED = "MARKDOWN_TABLE_RAGGED";
export const MARKDOWN_LIMIT = "MARKDOWN_LIMIT";
export const MARKDOWN_BLOCK_DROPPED = "MARKDOWN_BLOCK_DROPPED";
export const MARKDOWN_TEXT_ADJUSTED = "MARKDOWN_TEXT_ADJUSTED";
export const MARKDOWN_NESTED_LIST = "MARKDOWN_NESTED_LIST";
export const MARKDOWN_CODE_LANGUAGE = "MARKDOWN_CODE_LANGUAGE";
export const MARKDOWN_EMPTY = "MARKDOWN_EMPTY";

const WARNING_TEXT: Readonly<Record<string, string>> = Object.freeze({
  [MARKDOWN_HTML_REFUSED]: "حُذفت وسوم HTML: المحتوى المنسق لا يقبل HTML.",
  [MARKDOWN_IMAGE_REFUSED]: "لم تُحمَّل الصور الخارجية: استُبدلت بملاحظة نصية. أضف الصورة من زر «+ صورة».",
  [MARKDOWN_LINK_TEXT_ONLY]: "الروابط تُحوَّل إلى نصها فقط (لا تُحفظ العناوين).",
  [MARKDOWN_MATH_REFUSED]: "صيغة رياضية غير مدعومة أُبقيت نصًا عاديًا.",
  [MARKDOWN_TABLE_RAGGED]: "صفوف جدول بعدد خلايا مختلف عُدّلت لتطابق عدد الأعمدة.",
  [MARKDOWN_LIMIT]: "تجاوز المحتوى الحدود المسموحة؛ حُذف الجزء الزائد.",
  [MARKDOWN_BLOCK_DROPPED]: "حُذفت كتلة غير صالحة من النتيجة.",
  [MARKDOWN_TEXT_ADJUSTED]: "عُدّل نص يشبه الوسوم أو روابط script ليُقبل بأمان.",
  [MARKDOWN_NESTED_LIST]: "القوائم المتداخلة سُطّحت إلى مستوى واحد.",
  [MARKDOWN_CODE_LANGUAGE]: "لغة كود غير معروفة عُرضت كنص عادي.",
  [MARKDOWN_EMPTY]: "لا يوجد محتوى لتحويله."
});

export type MarkdownConversion = { ok: boolean; value?: RichContentV1; warnings: string[]; warningCodes: string[] };

// ── inline ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Warn = (code: string) => void;
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
const ESCAPABLE = new Set(["\\", "`", "*", "_", "$", "~", "^", "[", "]", "(", ")", "!", "#", "|", "<", ">", "-", "+", "."]);
// Containers whose CONTENT is dropped with the tag (never shown as text); every other tag only loses the tag itself.
const DANGEROUS_PAIRED = /<\s*(script|style|iframe|object|embed|template|noscript|textarea|svg|math|title|select)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
// Sticky (y) inline image / link matchers anchored at lastIndex — no per-position s.slice(i) copy (linear scan, no quadratic blow-up).
// Bounded (alt / text ≤ 500 = RICH_LIMITS.shortText, url ≤ 2048, never across a line) so a run of unmatched "[" stays linear.
const INLINE_IMAGE = /!\[([^\]\n]{0,500})\]\(([^)\n]{0,2048})\)/y, INLINE_LINK = /\[([^\]\n]{1,500})\]\(([^)\n]{0,2048})\)/y;
const ANY_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![A-Za-z][^<>]*>|<\?[^<>]*\?>/g;

/** Removes raw HTML from a prose fragment (tags dropped, dangerous containers dropped with their content). */
function stripHtml(s: string, warn: Warn): string {
  let out = s.replace(DANGEROUS_PAIRED, () => { warn(MARKDOWN_HTML_REFUSED); return ""; });
  out = out.replace(ANY_TAG, () => { warn(MARKDOWN_HTML_REFUSED); return ""; });
  return out;
}

/** Index of the closing delimiter `d` starting the scan at `from`, or -1 (skips escapes and code spans; a single-char delimiter skips doubled runs). */
function findClose(s: string, from: number, d: string): number {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") { j++; continue; }
    if (c === "`" && d !== "`") { const e = s.indexOf("`", j + 1); if (e > 0) { j = e; continue; } }
    if (!s.startsWith(d, j)) continue;
    if (d.length === 1 && (d === "*" || d === "_") && s[j + 1] === d) {
      // a doubled run inside single emphasis (**strong**) is skipped as a unit — unless it is the tail of a triple closer (`***`)
      if (s[j + 2] === d && j > from && !isSpace(s[j - 1])) return j + 2;
      j++; continue;
    }
    if (d === "**" && s[j + 2] === "*" && s.slice(from, j).split("*").length % 2 === 0) return j + 1;   // `**a *b***` → strong closes after the italic
    if (j > from && !isSpace(s[j - 1])) {
      if (d === "_" || d === "__") { if (isWordChar(s[j + d.length])) continue; }   // snake_case is never emphasis
      return j;
    }
  }
  return -1;
}

type Seg = { text: string; marks: RichMark[] } | { math: string };
function addMark(marks: readonly RichMark[], m: RichMark): RichMark[] { return marks.includes(m) ? [...marks] : [...marks, m]; }

function parseSegs(s: string, marks: readonly RichMark[], out: Seg[], warn: Warn, depth: number): void {
  let buf = "";
  const flush = () => { if (buf) { out.push({ text: buf, marks: [...marks] }); buf = ""; } };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && ESCAPABLE.has(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (c === "`") {
      let n = 1; while (s[i + n] === "`") n++;
      const fence = "`".repeat(n);
      const e = s.indexOf(fence, i + n);
      if (e > i + n - 1 && e !== i + n) {
        let code = s.slice(i + n, e);
        if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
        flush(); out.push({ text: code, marks: addMark(marks, "code") }); i = e + n; continue;
      }
      buf += fence; i += n; continue;
    }
    if (c === "$" && s[i + 1] !== "$" && !isSpace(s[i + 1])) {
      const e = findDollar(s, i + 1);
      if (e > 0) {
        const src = s.slice(i + 1, e);
        if (src.length <= RICH_LIMITS.mathChars && parseMath(src).ok) { flush(); out.push({ math: src }); i = e + 1; continue; }
        warn(MARKDOWN_MATH_REFUSED);
      }
      buf += c; i++; continue;
    }
    if (c === "!" && s[i + 1] === "[") {
      INLINE_IMAGE.lastIndex = i; const m = INLINE_IMAGE.exec(s);
      if (m) { warn(MARKDOWN_IMAGE_REFUSED); buf += imageNote(m[1]); i += m[0].length; continue; }
    }
    if (c === "[") {
      INLINE_LINK.lastIndex = i; const m = INLINE_LINK.exec(s);
      if (m) { warn(MARKDOWN_LINK_TEXT_ONLY); flush(); if (depth < 8) parseSegs(m[1], marks, out, warn, depth + 1); else buf += m[1]; i += m[0].length; continue; }
    }
    if (c === "~" && s[i + 1] === "~" && !isSpace(s[i + 2])) {
      const e = findClose(s, i + 2, "~~");
      if (e > 0) { flush(); if (depth < 8) parseSegs(s.slice(i + 2, e), marks, out, warn, depth + 1); else buf += s.slice(i + 2, e); i = e + 2; continue; }
    }
    if (c === "+" && s[i + 1] === "+" && !isSpace(s[i + 2]) && depth < 8) {
      const e = findClose(s, i + 2, "++");
      if (e > 0) { flush(); parseSegs(s.slice(i + 2, e), addMark(marks, "underline"), out, warn, depth + 1); i = e + 2; continue; }
    }
    if ((c === "^" || (c === "~" && s[i + 1] !== "~")) && !isSpace(s[i + 1]) && s[i + 1] !== c && depth < 8) {
      const e = s.indexOf(c, i + 1);
      const inner = e > 0 ? s.slice(i + 1, e) : "";
      if (inner && !/\s/.test(inner) && s[e + 1] !== c) { flush(); parseSegs(inner, addMark(marks, c === "^" ? "sup" : "sub"), out, warn, depth + 1); i = e + 1; continue; }
    }
    if ((c === "*" || c === "_") && depth < 8) {
      const prevOk = c === "*" || !isWordChar(s[i - 1]);
      const triple = c.repeat(3), double = c.repeat(2);
      if (prevOk && s.startsWith(triple, i) && !isSpace(s[i + 3])) {
        const e = findClose(s, i + 3, triple);
        if (e > 0) { flush(); parseSegs(s.slice(i + 3, e), addMark(addMark(marks, "bold"), "italic"), out, warn, depth + 1); i = e + 3; continue; }
      }
      if (prevOk && s.startsWith(double, i) && !isSpace(s[i + 2])) {
        const e = findClose(s, i + 2, double);
        if (e > 0) { flush(); parseSegs(s.slice(i + 2, e), addMark(marks, "bold"), out, warn, depth + 1); i = e + 2; continue; }
      }
      if (prevOk && !s.startsWith(double, i) && !isSpace(s[i + 1])) {
        const e = findClose(s, i + 1, c);
        if (e > 0) { flush(); parseSegs(s.slice(i + 1, e), addMark(marks, "italic"), out, warn, depth + 1); i = e + 1; continue; }
      }
      // an unmatched run of delimiters is literal text
      let n = 1; while (s[i + n] === c) n++;
      buf += s.slice(i, i + n); i += n; continue;
    }
    buf += c; i++;
  }
  flush();
}
function findDollar(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === "$") return isSpace(s[j - 1]) || s[j + 1] === "$" ? -1 : j;
    if (s[j] === "\n") return -1;
  }
  return -1;
}
const imageNote = (alt: string) => (alt.trim() ? "[صورة: " + alt.trim() + "]" : "[صورة]");

const MARK_ORDER: readonly RichMark[] = ["bold", "italic", "underline", "code", "sup", "sub"];
function toRuns(segs: Seg[]): RichRun[] {
  const out: RichRun[] = [];
  for (const g of segs) {
    if ("math" in g) { out.push({ math: g.math }); continue; }
    if (!g.text) continue;
    const marks = MARK_ORDER.filter(m => g.marks.includes(m));
    const last = out[out.length - 1];
    if (last && "text" in last && sameMarks(last.marks ?? [], marks)) { last.text += g.text; continue; }
    out.push(marks.length ? { text: g.text, marks } : { text: g.text });
  }
  return out;
}
const sameMarks = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(m => b.includes(m));

/** The safe inline syntax → runs (raw HTML dropped, images → a text note, links → their text). Never throws. */
export function parseInlineMarkdown(text: string, warn: Warn = () => {}): RichRun[] {
  const clean = stripHtml(String(text ?? ""), warn);
  const segs: Seg[] = [];
  parseSegs(clean, [], segs, warn, 0);
  return toRuns(segs);
}

function escapeInline(t: string): string { return t.replace(/[\\`*_$~^+[\]]/g, ch => "\\" + ch); }
function runSource(r: RichRun, escape: boolean): string {
  if ("math" in r) return "$" + r.math + "$";
  const marks = r.marks ?? [];
  let core: string, lead = "", trail = "";
  if (marks.includes("code")) {
    const ticks = r.text.includes("`") ? "``" : "`";
    const pad = r.text.startsWith("`") || r.text.endsWith("`") ? " " : "";
    core = ticks + pad + r.text + pad + ticks;
  } else {
    // emphasis delimiters must hug non-space text: keep the surrounding whitespace outside the markers
    const body = escape ? escapeInline(r.text) : r.text;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(body)!;
    if (!m[2] || !marks.length) return body;
    lead = m[1]; core = m[2]; trail = m[3];
  }
  if (marks.includes("sub")) core = "~" + core + "~";
  if (marks.includes("sup")) core = "^" + core + "^";
  if (marks.includes("italic") && marks.includes("bold")) core = "***" + core + "***";
  else if (marks.includes("bold")) core = "**" + core + "**";
  else if (marks.includes("italic")) core = "*" + core + "*";
  if (marks.includes("underline")) core = "++" + core + "++";
  return lead + core + trail;
}
const runsEqual = (a: readonly RichRun[], b: readonly RichRun[]) => JSON.stringify(a) === JSON.stringify(b);
/** Runs → the inline syntax the editor shows (escaping only when the plain form would not read back identically). */
export function runsToInlineMarkdown(runs: readonly RichRun[]): string {
  const canonical = toRuns(runs.map(r => ("math" in r ? { math: r.math } : { text: r.text, marks: r.marks ?? [] })));
  const plain = canonical.map(r => runSource(r, false)).join("");
  if (runsEqual(parseInlineMarkdown(plain), canonical)) return plain;
  return canonical.map(r => runSource(r, true)).join("");
}

// ── blocks ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const CODE_LANG_ALIASES: Readonly<Record<string, (typeof RICH_CODE_LANGUAGES)[number]>> = Object.freeze({
  py: "python", python: "python", python3: "python", java: "java", cs: "csharp", csharp: "csharp", "c#": "csharp",
  js: "javascript", javascript: "javascript", jsx: "javascript", mjs: "javascript", node: "javascript", html: "html", htm: "html", xml: "html",
  css: "css", sql: "sql", mysql: "sql", sqlite: "sql", pseudo: "pseudocode", pseudocode: "pseudocode", algorithm: "pseudocode",
  text: "text", txt: "text", plain: "text", plaintext: "text"
});
const CLI_LANGS = new Set(["cli", "console", "terminal", "shell-session", "ios", "cisco"]);
const CALLOUT_ALERTS: Readonly<Record<string, "info" | "note" | "warning" | "success" | "important">> = Object.freeze({ NOTE: "note", INFO: "info", TIP: "success", IMPORTANT: "important", WARNING: "warning", CAUTION: "warning" });

const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/,
  setext: /^ {0,3}(=+|-+)[ \t]*$/,
  quote: /^ {0,3}>[ ]?(.*)$/,
  ul: /^([ \t]*)([-*+])[ \t]+(.*)$/,
  ol: /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/,
  image: /^\s*!\[([^\]]*)\]\(([^)]*)\)\s*$/,
  htmlLine: /^\s*<(\/?[A-Za-z][A-Za-z0-9-]*|!--|!\[CDATA\[|![A-Za-z]|\?)/,
  linkDef: /^ {0,3}\[[^\]]+\]:\s*\S/,
  htmlOpen: /^\s*<\s*(script|style|iframe|object|embed|template|noscript|textarea|svg|math|title|select|pre)\b/i,
  tableSep: /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/,
  displayMathOne: /^\s*\$\$(.+)\$\$\s*$/,
  displayMathOpen: /^\s*\$\$(.*)$/
};

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "", inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (c === "`") inCode = !inCode;
    if (c === "|" && !inCode) { cells.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}
const runsPlain = (runs: readonly RichRun[]) => runs.map(r => ("text" in r ? r.text : r.math)).join("");
const hasMarkup = (runs: readonly RichRun[]) => runs.some(r => "math" in r || (r.marks && r.marks.length > 0));
// Characters the authority would refuse as markup inside prose: make them inert (lookalike) instead of losing the whole block.
const neutralize = (t: string) => t.replace(/</g, "＜").replace(/(javascript|vbscript)(\s*):/gi, "$1$2：").replace(/(data)(\s*):(\s*text\/html)/gi, "$1$2：$3");

type Ctx = { warn: Warn; blocks: RichBlock[]; chars: number; full: boolean };

/** Converts the SAFE Markdown subset to a validated RichContentV1. Pure; never throws; never produces or persists HTML. */
export function markdownToRichContent(md: string): MarkdownConversion {
  const codes: string[] = [];
  const warn: Warn = code => { if (!codes.includes(code)) codes.push(code); };
  const ctx: Ctx = { warn, blocks: [], chars: 0, full: false };
  const src = String(md ?? "").replace(/\r\n?/g, "\n");
  // eslint-disable-next-line no-control-regex
  const lines = src.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").split("\n");
  const push = (b: RichBlock | undefined) => {
    if (!b) return;
    if (ctx.full || ctx.blocks.length >= RICH_LIMITS.blocks) { ctx.full = true; warn(MARKDOWN_LIMIT); return; }
    const size = JSON.stringify(b).length;
    if (ctx.chars + size > RICH_LIMITS.totalChars) { ctx.full = true; warn(MARKDOWN_LIMIT); return; }
    const ok = validateBlock(b, warn);
    if (!ok) return;
    ctx.chars += size;
    ctx.blocks.push(ok);
  };
  const inline = (t: string) => trimRuns(parseInlineMarkdown(t, warn));
  const textBlock = (t: string, make: (runs: RichRun[]) => RichBlock) => {
    for (const chunk of chunkText(t, RICH_LIMITS.blockChars, warn)) {
      const runs = capRuns(inline(chunk), warn);
      if (runs.length && runsPlain(runs).trim() !== "") push(make(runs));
    }
  };

  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join("\n").trim();
    para = [];
    if (text) textBlock(text, runs => ({ type: "paragraph", runs }));
  };

  let i = 0;
  while (i < lines.length && !ctx.full) {
    const line = lines[i];
    if (line.trim() === "") { flushPara(); i++; continue; }

    // fenced code (``` / ~~~); a cli / console fence becomes a CLI block
    const fence = RE.fence.exec(line);
    if (fence) {
      flushPara();
      const marker = fence[1], info = fence[2].toLowerCase();
      const body: string[] = [];
      let j = i + 1, closed = false;
      for (; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t.startsWith(marker[0].repeat(marker.length)) && /^[`~]+$/.test(t) && t[0] === marker[0]) { closed = true; break; }
        body.push(lines[j]);
      }
      i = closed ? j + 1 : j;
      const source = body.join("\n");
      if (source.trim() === "") continue;
      if (CLI_LANGS.has(info)) { push({ type: "cli", source }); continue; }
      const language = info ? CODE_LANG_ALIASES[info] : "text";
      if (info && !language) warn(MARKDOWN_CODE_LANGUAGE);
      push({ type: "code", language: language ?? "text", source });
      continue;
    }

    // display math $$…$$ (single or multi-line) — accepted only when the allow-listed parser accepts it
    if (RE.displayMathOpen.test(line)) {
      flushPara();
      let mathSrc: string, j = i;
      const one = RE.displayMathOne.exec(line);
      if (one) mathSrc = one[1];
      else {
        const parts = [RE.displayMathOpen.exec(line)![1]];
        let closed = false;
        for (j = i + 1; j < lines.length; j++) {
          const k = lines[j].indexOf("$$");
          if (k >= 0) { parts.push(lines[j].slice(0, k)); closed = true; break; }
          parts.push(lines[j]);
        }
        if (!closed) { para.push(line); i++; continue; }
        mathSrc = parts.join("\n");
      }
      i = j + 1;
      const m = mathSrc.trim();
      if (m && m.length <= RICH_LIMITS.mathChars && parseMath(m).ok) push({ type: "math", source: m });
      else if (m) { warn(MARKDOWN_MATH_REFUSED); textBlock(m, runs => ({ type: "paragraph", runs: runs.map(r => ("math" in r ? { text: "$" + r.math + "$" } : r)) })); }
      continue;
    }

    // raw HTML lines are refused (a script / style / iframe … container is skipped up to its closing tag)
    if (RE.htmlLine.test(line) && (RE.htmlOpen.test(line) || new RegExp(ANY_TAG.source).test(line))) {
      flushPara();
      warn(MARKDOWN_HTML_REFUSED);
      const open = RE.htmlOpen.exec(line);
      if (open && !new RegExp("<\\s*\\/\\s*" + open[1] + "\\s*>", "i").test(line)) {
        let j = i + 1;
        while (j < lines.length && !new RegExp("<\\s*\\/\\s*" + open[1] + "\\s*>", "i").test(lines[j])) j++;
        i = j + 1;
      } else {
        // a tag line may still carry text after the tag (e.g. "<b>x</b> y") — keep the visible text, never the tag
        const rest = stripHtml(line, warn).trim();
        if (rest && !open) para.push(rest);
        i++;
      }
      continue;
    }

    if (RE.linkDef.test(line)) { flushPara(); warn(MARKDOWN_LINK_TEXT_ONLY); i++; continue; }   // a reference-link definition carries only a URL

    // setext heading (a paragraph line underlined with === / ---)
    if (para.length && RE.setext.test(line)) {
      const text = para.join("\n").trim();
      para = [];
      textBlock(text, runs => ({ type: "heading", level: 2, runs }));
      i++;
      continue;
    }

    if (RE.hr.test(line)) { flushPara(); push({ type: "divider" }); i++; continue; }

    const h = RE.heading.exec(line);
    if (h) {
      flushPara();
      const n = h[1].length;
      const level = (n <= 2 ? 2 : n === 3 ? 3 : 4) as 2 | 3 | 4;
      textBlock((h[2] ?? "").trim(), runs => ({ type: "heading", level, runs }));
      i++;
      continue;
    }

    const img = RE.image.exec(line);
    if (img) { flushPara(); warn(MARKDOWN_IMAGE_REFUSED); push({ type: "paragraph", runs: [{ text: imageNote(img[1]) }] }); i++; continue; }

    if (RE.quote.test(line)) {
      flushPara();
      const body: string[] = [];
      while (i < lines.length && RE.quote.test(lines[i])) { body.push(RE.quote.exec(lines[i])![1].replace(/^(\s*>\s?)+/, "")); i++; }
      const alert = /^\s*\[!([A-Za-z]+)\]\s*$/.exec(body[0] ?? "");
      const variant = alert ? CALLOUT_ALERTS[alert[1].toUpperCase()] : undefined;
      const text = (variant ? body.slice(1) : body).join("\n").trim();
      if (!text) continue;
      if (variant) textBlock(text, runs => ({ type: "callout", variant, runs }));
      else textBlock(text, runs => ({ type: "quote", runs }));
      continue;
    }

    // pipe table: a header row followed by a |---|---| separator
    if (line.includes("|") && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      flushPara();
      const header = splitRow(line);
      const bodyLines: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) { bodyLines.push(lines[j]); j++; }
      i = j;
      push(buildTable(header, bodyLines.map(splitRow), warn));
      continue;
    }

    const ul = RE.ul.exec(line), ol = ul ? null : RE.ol.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      const baseIndent = (ul ?? ol)![1].length;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === "") {
          let k = i + 1;
          while (k < lines.length && lines[k].trim() === "") k++;
          const next = k < lines.length ? lines[k] : "";
          if (k < lines.length && (ordered ? RE.ol.test(next) && !RE.ul.test(next) : RE.ul.test(next) && !RE.hr.test(next))) { i = k; continue; }
          break;
        }
        const mu = RE.ul.exec(l), mo = mu ? null : RE.ol.exec(l);
        const m = mu ?? mo;
        if (m && !RE.hr.test(l)) {
          const indent = m[1].length;
          if (indent <= baseIndent + 1 && (ordered ? !!mo : !!mu)) { items.push(m[3]); i++; continue; }
          if (indent > baseIndent + 1) { warn(MARKDOWN_NESTED_LIST); items.push(m[3]); i++; continue; }
          break;   // a sibling list of the other kind starts a new block
        }
        if (/^\s+\S/.test(l) && items.length && !RE.quote.test(l) && !RE.fence.test(l)) { items[items.length - 1] += "\n" + l.trim(); i++; continue; }
        if (items.length && !RE.heading.test(l) && !RE.quote.test(l) && !RE.fence.test(l) && !RE.hr.test(l) && !RE.htmlLine.test(l) && !l.includes("|")) { items[items.length - 1] += "\n" + l.trim(); i++; continue; }
        break;
      }
      for (let s = 0; s < items.length; s += RICH_LIMITS.listItems) {
        const slice = items.slice(s, s + RICH_LIMITS.listItems).map(t => capRuns(inline(t.slice(0, RICH_LIMITS.blockChars)), warn)).filter(r => r.length && runsPlain(r).trim() !== "");
        if (slice.length) push({ type: ordered ? "orderedList" : "unorderedList", items: slice.map(runs => ({ runs })) });
      }
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return finish(ctx.blocks, codes);
}

/** Trims the outer whitespace of a block's runs (a stripped tag can leave a dangling space); math runs are kept as they are. */
function trimRuns(runs: RichRun[]): RichRun[] {
  const out = runs.map(r => ({ ...r }));
  const first = out[0], last = out[out.length - 1];
  if (first && "text" in first) first.text = first.text.replace(/^\s+/, "");
  if (last && "text" in last) last.text = last.text.replace(/\s+$/, "");
  return out.filter(r => !("text" in r) || r.text !== "");
}

function chunkText(t: string, max: number, warn: Warn): string[] {
  if (t.length <= max) return [t];
  warn(MARKDOWN_LIMIT);
  const out: string[] = [];
  let rest = t;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) out.push(rest);
  return out;
}
function capRuns(runs: RichRun[], warn: Warn): RichRun[] {
  if (runs.length <= RICH_LIMITS.runs) return runs;
  warn(MARKDOWN_LIMIT);
  return [{ text: runsPlain(runs) }];
}

function buildTable(header: string[], rows: string[][], warn: Warn): RichBlock | undefined {
  let width = header.length;
  if (width > RICH_LIMITS.tableColumns) { warn(MARKDOWN_LIMIT); width = RICH_LIMITS.tableColumns; }
  const fit = (r: string[]) => {
    if (r.length !== header.length) warn(MARKDOWN_TABLE_RAGGED);
    const out = r.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  };
  let body = rows.map(fit);
  if (body.length > RICH_LIMITS.tableRows) { warn(MARKDOWN_LIMIT); body = body.slice(0, RICH_LIMITS.tableRows); }
  const cell = (t: string) => {
    const runs = parseInlineMarkdown(t.slice(0, RICH_LIMITS.cellChars), warn);
    if (!runs.length) return "";
    return hasMarkup(runs) ? { runs } : runsPlain(runs);
  };
  const headers = header.slice(0, width).map(h => runsPlain(parseInlineMarkdown(h, warn)).slice(0, RICH_LIMITS.cellChars));
  if (!body.length) return { type: "table", rows: [headers] };
  return { type: "table", columnHeaders: headers, rows: body.map(r => r.map(cell)) };
}

/** Validates one block through the authority; a markup-looking prose block is neutralized once, else dropped with a warning. */
function validateBlock(b: RichBlock, warn: Warn): RichBlock | undefined {
  const check = (x: RichBlock) => validateRichContent({ schemaVersion: 1, blocks: [x] });
  let r = check(b);
  if (r.ok && r.value) return r.value.blocks[0];
  if (r.issues.some(x => x.code === "RICH_CONTENT_RAW_HTML" || x.code === "RICH_CONTENT_INVALID_TEXT")) {
    const fixed = mapProse(b, neutralize);
    r = check(fixed);
    if (r.ok && r.value) { warn(MARKDOWN_TEXT_ADJUSTED); return r.value.blocks[0]; }
  }
  warn(MARKDOWN_BLOCK_DROPPED);
  return undefined;
}
function mapProse(b: RichBlock, f: (t: string) => string): RichBlock {
  const runs = (rs: RichRun[]) => rs.map(r => ("text" in r ? { ...r, text: f(r.text) } : r));
  switch (b.type) {
    case "heading": case "paragraph": case "quote": return { ...b, runs: runs(b.runs) };
    case "callout": return { ...b, runs: runs(b.runs), ...(b.title !== undefined ? { title: f(b.title) } : {}) };
    case "unorderedList": case "orderedList": return { ...b, items: b.items.map(it => ({ runs: runs(it.runs) })) };
    case "table": return { ...b, ...(b.caption !== undefined ? { caption: f(b.caption) } : {}), ...(b.columnHeaders ? { columnHeaders: b.columnHeaders.map(f) } : {}), rows: b.rows.map(r => r.map(c => (typeof c === "string" ? f(c) : { runs: runs(c.runs) }))) };
    default: return b;
  }
}

function finish(blocks: RichBlock[], codes: string[]): MarkdownConversion {
  const result = (value?: RichContentV1): MarkdownConversion => ({ ok: !!value, ...(value ? { value } : {}), warnings: codes.map(c => WARNING_TEXT[c] ?? c), warningCodes: [...codes] });
  let list = blocks;
  for (let guard = 0; guard < 8 && list.length; guard++) {
    const r = validateRichContent({ schemaVersion: 1, blocks: list });
    if (r.ok && r.value) return result(r.value);
    const bad = new Set<number>();
    for (const iss of r.issues) { const m = /^richContent\.blocks\[(\d+)\]/.exec(iss.path); if (m) bad.add(Number(m[1])); }
    if (!codes.includes(MARKDOWN_LIMIT) && r.issues.some(x => x.code === "RICH_CONTENT_LIMIT")) codes.push(MARKDOWN_LIMIT);
    if (bad.size) { if (!codes.includes(MARKDOWN_BLOCK_DROPPED)) codes.push(MARKDOWN_BLOCK_DROPPED); list = list.filter((_, k) => !bad.has(k)); }
    else list = list.slice(0, Math.max(0, Math.floor(list.length * 0.8)));   // document-level bound → drop the tail
  }
  if (!list.length && !codes.includes(MARKDOWN_EMPTY)) codes.push(MARKDOWN_EMPTY);
  return result(undefined);
}
