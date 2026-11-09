#!/usr/bin/env node
// 899371 P2 (docs/enterprise-899371-learning-plan.md §14) — generates the course «أسس علم الحاسوب» (899371) from the owner's Word
// source, so every book block is TRACEABLE to its source paragraph and the conversion is repeatable:
//   node scripts/convert-899371.mjs            → src/learning/content/899371/modules/mNN.ts + manifest.ts
//
// What the converter does (and only this; src/learning/content/899371/fidelity.p2.test.ts proves it against the source):
//   • reads the body with scripts/lib/docx-source.mjs (exact text, line breaks, bold / monospace runs, list formats, tables, images);
//   • walks the paragraph ranges of the STRUCTURE map below (module → lesson → page); every non-empty source line inside a range
//     becomes exactly one block (or one line of a code / list block) of origin "book", in source order;
//   • classifies each LINE: C# code (monospace, or code-shaped with no Arabic outside its strings / comments) → one `code` block per
//     run of code lines (language csharp, common indentation removed, nothing else changed); a numbered paragraph or a «• » / «* »
//     line → a `list` item; a bold line → a heading (summaries) or a strong text line (questions); anything else → a `text` line;
//   • reads the Markdown left in the source as the formatting it was meant to be (decision P2-a): **…** → strong, `…` → code span,
//     «C\#» → «C#», a stray «**» is dropped. Every such place is listed in the generated MARKERS log;
//   • applies ONLY the owner-approved corrections (§12.4) of the CORRECTIONS list — each must match its paragraph exactly once;
//   • replaces the two question FIGURES of chapter 4 (images) by the tables they show (decision P2-c), transcribed in FIGURES.
// The table of contents (¶5) is the Reader's own; the cover picture (¶2) is decorative (decision P2-b).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readDocxBody } from "./lib/docx-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_FILE = join(ROOT, "أسس علم الحاسوب 899371.docx");
const OUT = join(ROOT, "src", "learning", "content", "899371");
const CID = "899371";
const UNIT_LABEL = "أسس علم الحاسوب · نموذج 899371";   // the running header printed on every page of the book

// ── the structure map (paragraph indices of the Word body; `to` inclusive) ─────────────────────────────────────────────────────
// Lesson titles are the book's own table-of-contents entries; page titles are the book's own heading at that point (an emoji or a
// numbering mark in front of it is kept in the block, not in the title).
export const STRUCTURE = [
  { n: 0, title: "افتتاحية", batch: "intro", toc: 3, lessons: [
    { order: 1, title: "افتتاحية", kind: "front", pages: [
      { from: 0, to: 4, title: "مجمع أسئلة في أسس علم الحاسوب", skip: [2] },
      { from: 6, to: 29, title: "كلمة افتتاحية", asText: [28] },   // ¶28 is the bold signature, not a heading
    ] },
  ] },
  { n: 1, title: "الطباعة والمتغيرات", batch: "b1", chapterTitle: 30, lessons: [
    { order: 1, title: "الطباعة والمتغيرات", kind: "summary", toc: 4, pages: [
      { from: 31, to: 32, title: "ما هو البرنامج في الحاسوب؟" },
      { from: 33, to: 67, title: "الأدوات الأساسية للبرمجة" },
      { from: 68, to: 72, title: "تحديات برمجية بسيطة" },
    ] },
    { order: 2, title: "الوظيفة الأولى بيتية", kind: "assignment", toc: 6, from: 73, to: 115 },
    { order: 3, title: "الوظيفة الأولى برمجة", kind: "assignment", toc: 8, from: 116, to: 128 },
  ] },
  { n: 2, title: "العوامل والتعابير المنطقية", batch: "b1", chapterTitle: 129, lessons: [
    { order: 1, title: "العوامل والتعابير المنطقية", kind: "summary", toc: 9, pages: [
      { from: 130, to: 135, title: "ما الهدف من هذا الفصل؟" },
      { from: 136, to: 149, title: "أنواع العوامل (الأوبيراتورات)" },
      { from: 150, to: 172, title: "أمثلة توضيحية" },
    ] },
    { order: 2, title: "الوظيفة الثانية بيتية", kind: "assignment", toc: 12, from: 173, to: 266 },
    { order: 3, title: "الوظيفة الثانية برمجة", kind: "assignment", toc: 15, from: 267, to: 356 },
  ] },
  { n: 3, title: "المكتبة الرياضية", batch: "b1", chapterTitle: 357, lessons: [
    { order: 1, title: "المكتبة الرياضية", kind: "summary", toc: 18, pages: [
      { from: 358, to: 359, title: "مقدمة" },
      { from: 360, to: 382, title: "الدوال في المكتبة Math" },
      { from: 383, to: 396, title: "توليد أعداد عشوائية باستخدام Random" },
    ] },
    { order: 2, title: "الوظيفة الثالثة بيتية", kind: "assignment", toc: 21, from: 397, to: 458 },
    { order: 3, title: "الوظيفة الثالثة برمجة", kind: "assignment", toc: 23, from: 459, to: 533 },
  ] },
  { n: 4, title: "جملة الشرط", batch: "b2", chapterTitle: 534, lessons: [
    { order: 1, title: "جملة الشرط", kind: "summary", toc: 26, pages: [
      { from: 535, to: 543, title: "ما هي جمل الشرط؟ (if statements)" },
      { from: 544, to: 566, title: "أنواع الشروط" },
      { from: 567, to: 576, title: "الشروط المركّبة" },
      { from: 577, to: 587, title: "جداول منطقية" },
      { from: 588, to: 620, title: "مثال مفصل مع جدول متابعة" },
    ] },
    { order: 2, title: "الوظيفة الرابعة بيتية", kind: "assignment", toc: 31, from: 621, to: 747 },
    { order: 3, title: "الوظيفة الرابعة برمجة", kind: "assignment", toc: 37, from: 748, to: 830 },
  ] },
];

/** The course's overview sections; a section whose modules are not converted yet is shown as «قريبًا» (P3 converts m05–m12). */
export const BATCHES = [
  { id: "intro", label: "المقدمة" },
  { id: "b1", label: "الأساسيات: الطباعة والمتغيرات والعوامل و Math" },
  { id: "b2", label: "الشرط والتكرار" },
  { id: "b3", label: "العمليات والنصوص" },
  { id: "b4", label: "المصفوفات" },
  { id: "b5", label: "الكائنات" },
];

/** The owner-approved corrections (plan §12.4, 2026-11-09) that fall in the converted range. Each must match exactly once. */
export const CORRECTIONS = [
  { finding: "F1", index: 397, find: "في شبكات الاتصال", replace: "في أسس علم الحاسوب" },
  { finding: "F2", index: 138, cell: [5, 2], find: "5 / 2", replace: "5.0 / 2" },
  { finding: "F6", index: 639, find: "int b;", replace: "int b = int.Parse(Console.ReadLine());" },
  { finding: "F6", index: 705, find: "int x, y;", replace: "int x = int.Parse(Console.ReadLine());\nint y = int.Parse(Console.ReadLine());" },
];

/** The question figures (images) of the converted range, transcribed as the tables they show (decision P2-c). RTL column order. */
export const FIGURES = {
  "image2.png": { index: 724, headers: ["", "3 < a", "3 > a", "a = 3"], rows: [["7 < b", "c = 4", "c = 1", "c = 5"], ["7 > b", "c = 5", "c = 4", "c = 3"], ["b = 7", "c = 1", "c = 2", "c = 1"]], columnDirs: ["ltr", "ltr", "ltr", "ltr"] },
  "image3.png": { index: 739, headers: ["اليوم", "أكثر من 8 ساعات", "أقل أو يساوي 8 ساعات"], rows: [["السبت", "50 شاقل", "40 شاقل"], ["الإثنين.. الخميس", "30 شاقل", "25 شاقل"], ["الجمعة، الأحد", "35 شاقل", "30 شاقل"]] },
};

// ── line classification ──────────────────────────────────────────────────────────────────────────────────────────────────────
const ARABIC = /[؀-ۿ]/;
const CODE_START = /^\s*(static|public|private|protected|class|if|else|for|foreach|while|do|switch|case|return|break|using|namespace|int|double|string|char|bool|var|Random|Console)\b/;
/** Arabic outside C# string / char literals and // comments? */
function arabicOutsideCode(line) {
  const stripped = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "").replace(/\/\/.*$/, "");
  return ARABIC.test(stripped);
}
export function isCodeLine(line, mono) {
  const t = line.trim();
  if (!t) return false;
  if (mono) return !/^(\d+(\.\d+)?\s*[-:])/.test(t) && !arabicOutsideCode(t);   // a monospace question number «1.1 -» is not code
  if (arabicOutsideCode(t)) return false;
  return /[;{}]\s*(\/\/.*)?$/.test(t) || /^[{}]$/.test(t) || CODE_START.test(t) && /[(;={]/.test(t) || /^\s*(else|else if\b.*)\s*(\.{3,})?$/.test(t);
}
const QUESTION = /^\s*(السؤال|سؤال)\s*\d+|^\s*\d{1,2}\.\s/;
const ASSIGNMENT_TITLE = /^\s*الوظيفة\s.+\sفي\s.+-\s*(بيتية|برمجية|برمجة|تتبع)\s*$/;

// ── Markdown left in the source (decision P2-a) ─────────────────────────────────────────────────────────────────────────────────
/** Spans of one prose line: bold runs → strong, monospace runs → code (ltr); then **…** / `…` / C\# read as formatting. */
export function lineSpans(runs, log, where) {
  const merged = [];
  for (const r of runs) {
    const style = r.mono ? "code" : r.bold ? "strong" : undefined;
    const last = merged[merged.length - 1];
    if (last && last.style === style) last.text += r.text; else merged.push({ text: r.text, style });
  }
  const out = [];
  for (const span of merged) {
    let text = span.text;
    if (/\\[#!]/.test(text)) { log.push({ where, marker: "\\#", text: text.match(/\S*\\[#!]\S*/)[0] }); text = text.replace(/\\([#!])/g, "$1"); }
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) { log.push({ where, marker: "**", text: part }); out.push({ text: part.slice(2, -2), style: "strong" }); continue; }
      if (/^`[^`]+`$/.test(part)) { log.push({ where, marker: "`", text: part }); out.push({ text: part.slice(1, -1), style: "code", dir: "ltr" }); continue; }
      let rest = part;
      if (rest.includes("**")) { log.push({ where, marker: "** (stray)", text: rest.trim() }); rest = rest.replace(/\*\*/g, ""); }
      out.push(span.style === "code" ? { text: rest, style: "code", dir: "ltr" } : span.style ? { text: rest, style: span.style } : { text: rest });
    }
  }
  // trim the line's own leading / trailing whitespace (layout indentation of the Word page), collapse nothing else
  if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ""); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ""); }
  return out.filter(s => s.text !== "");
}

/** Split a paragraph's runs at its line breaks → [{ text, runs }]. */
function splitLines(p) {
  const lines = [{ runs: [] }];
  for (const r of p.runs) {
    const pieces = r.text.split("\n");
    pieces.forEach((piece, i) => { if (i > 0) lines.push({ runs: [] }); if (piece) lines[lines.length - 1].runs.push({ ...r, text: piece }); });
  }
  return lines.map(l => ({ runs: l.runs, text: l.runs.map(r => r.text).join(""), mono: l.runs.length > 0 && l.runs.every(r => r.mono) }));
}
const dedent = lines => {
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(Math.min(ind, l.match(/^ */)[0].length)).replace(/\s+$/, ""));
};

// ── conversion ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function convert(body) {
  const log = [], applied = [];
  const item = i => { const it = body[i]; if (!it) throw new Error("no source item " + i); return it; };
  const corrected = (it) => {
    const fixes = CORRECTIONS.filter(c => c.index === it.index);
    if (!fixes.length) return it;
    const copy = JSON.parse(JSON.stringify(it));
    for (const c of fixes) {
      if (c.cell) {
        const [r, k] = c.cell;
        if (copy.rows[r][k].split(c.find).length !== 2) throw new Error(c.finding + ": no single match in ¶" + c.index);
        copy.rows[r][k] = copy.rows[r][k].replace(c.find, c.replace);
      } else {
        // match on the paragraph's whole text (Word may split «int b;» over coloured runs); the runs the match touches are merged
        const full = copy.runs.map(r => r.text).join("");
        if (full.split(c.find).length !== 2) throw new Error(c.finding + ": no single match in ¶" + c.index);
        const at = full.indexOf(c.find), end = at + c.find.length;
        let pos = 0; const runs = [];
        let merged = null;
        for (const r of copy.runs) {
          const a = pos, b = pos + r.text.length; pos = b;
          if (b <= at || a >= end) { runs.push(r); continue; }
          if (!merged) { merged = { ...r, text: r.text.slice(0, at - a) + c.replace }; runs.push(merged); }
          if (b > end) merged.text += r.text.slice(end - a);
        }
        copy.runs = runs;
        copy.text = copy.runs.map(r => r.text).join("");
      }
      applied.push(c);
    }
    return copy;
  };

  const modules = STRUCTURE.map(mod => {
    const mid = `${CID}-m${String(mod.n).padStart(2, "0")}`;
    const lessons = [];
    if (mod.chapterTitle !== undefined) {
      const title = item(mod.chapterTitle).text.trim();
      lessons.push({ id: mid + "-l00", title: "افتتاحية الوحدة", order: 0, pages: [{
        id: mid + "-l00-p01", title, order: 1, layout: "opener", source: src(mod.lessons[0].toc, mod.chapterTitle, mod.chapterTitle),
        blocks: [{ id: `m${String(mod.n).padStart(2, "0")}-l00-p01-opener`, type: "unit-opener", origin: "book", unitLabel: UNIT_LABEL, unitNumber: String(mod.n).padStart(2, "0"), title }],
      }] });
    }
    for (const les of mod.lessons) {
      const lid = `${mid}-l${String(les.order).padStart(2, "0")}`;
      const ranges = les.kind === "assignment" ? questionPages(body, les) : les.pages;
      const pages = ranges.map((pg, i) => {
        const pid = `${lid}-p${String(i + 1).padStart(2, "0")}`;
        const blocks = blocksOf(body, pg, pid, les.kind, corrected, log);
        return { id: pid, title: pg.title, order: i + 1, source: src(les.toc ?? mod.toc, pg.from, pg.to), blocks };
      });
      lessons.push({ id: lid, title: les.title, order: les.order, pages });
    }
    return { id: mid, title: mod.title, order: mod.n, lessons };
  });
  if (applied.length !== CORRECTIONS.length) throw new Error("a correction did not apply: " + CORRECTIONS.filter(c => !applied.includes(c)).map(c => c.finding).join(", "));
  return { modules, log, applied };
}
const src = (printed, from, to) => ({ kind: "book", sourceId: CID, pdfPageStart: printed, printedPage: printed, sourceNote: from === to ? `¶${from}` : `¶${from}–${to}` });

/** An assignment lesson's pages: one per question that holds code / a table / a figure; question-only lines are grouped (≤ 4). */
function questionPages(body, les) {
  const starts = [];
  for (let i = les.from; i <= les.to; i++) {
    const it = body[i];
    if (it.kind !== "p") continue;
    const text = it.text.replace(/^\n+/, "");
    // «السؤال N» always starts a question; a bare «N.» only when the line is bold (chapter 2 prints its questions «1.» … «15.» in
    // bold) — the plain «32. -» of ¶97 is the sub-question 2.3 printed with a typo (F21), not question 32
    const bare = /^\s*\d{1,2}\.\s/.test(text);
    if (/^\s*(السؤال|سؤال)\s*\d+/.test(text) || bare && it.runs.length > 0 && it.runs.every(r => r.bold)) starts.push(i);
  }
  const groups = [];
  let cursor = les.from;
  starts.forEach((s, k) => {
    // a section heading («🔹 القسم …») right before a question belongs to that question's page
    let begin = s;
    while (begin - 1 >= cursor && body[begin - 1].kind === "p" && (body[begin - 1].text.trim() === "" || /^\s*🔹/.test(body[begin - 1].text))) begin--;
    if (k === 0) begin = les.from;
    const end = (starts[k + 1] ?? les.to + 1) - 1;
    groups.push({ from: begin, to: end, number: (body[s].text.match(/\d+/) || [""])[0] });
    cursor = end + 1;
  });
  // fix the boundaries: each group ends where the next begins
  for (let k = 0; k + 1 < groups.length; k++) groups[k].to = groups[k + 1].from - 1;
  const heavy = g => { for (let i = g.from; i <= g.to; i++) { const it = body[i]; if (it.kind === "table" || it.image || (it.kind === "p" && splitLines(it).some(l => isCodeLine(l.text, l.mono)))) return true; } return false; };
  const pages = [];
  for (const g of groups) {
    const last = pages[pages.length - 1];
    if (last && !last.heavy && !heavy(g) && last.numbers.length < 4) { last.to = g.to; last.numbers.push(g.number); continue; }
    pages.push({ from: g.from, to: g.to, numbers: [g.number], heavy: heavy(g) });
  }
  // the title names every question printed on the page — also one printed inside another's line («… السؤال 10 - …», ¶125, F21)
  return pages.map(p => {
    const nums = new Set(p.numbers.map(Number));
    for (let i = p.from; i <= p.to; i++) if (body[i].kind === "p") for (const m of body[i].text.matchAll(/(?:^|\s)السؤال\s*(\d+)\s*[-:(]/g)) nums.add(Number(m[1]));
    const sorted = [...nums].sort((a, b) => a - b);
    return { from: p.from, to: p.to, title: sorted.length === 1 ? `السؤال ${sorted[0]}` : `الأسئلة ${sorted[0]}–${sorted[sorted.length - 1]}` };
  });
}

function blocksOf(body, pg, pid, kind, corrected, log) {
  const short = pid.slice(CID.length + 1);
  const blocks = [];
  let n = 0;
  const id = () => `${short}-b${String(++n).padStart(2, "0")}`;
  let code = null, list = null;
  const flushCode = () => { if (code) { const lines = dedent(code.lines); while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); blocks.push({ id: id(), type: "code", origin: "book", language: "csharp", dir: "ltr", code: lines.join("\n") }); code = null; } };
  const flushList = () => { if (list) { blocks.push({ id: id(), type: "list", origin: "book", variant: list.variant, items: list.items.map((t, i) => ({ id: `i${i + 1}`, text: t })) }); list = null; } };
  for (let i = pg.from; i <= pg.to; i++) {
    if (pg.skip && pg.skip.includes(i)) continue;
    const it = corrected(body[i]);
    if (it.kind === "table") {
      flushCode(); flushList();
      if (i === 5) continue;   // the printed table of contents → the Reader's own
      blocks.push(tableBlock(id(), it.rows));
      continue;
    }
    if (it.image) {
      const fig = FIGURES[it.image];
      if (!fig || fig.index !== i) throw new Error("an image without a transcription in ¶" + i + ": " + it.image);
      flushCode(); flushList();
      blocks.push({ id: id(), type: "table", origin: "book", headers: fig.headers, rows: fig.rows, ...(fig.columnDirs ? { columnDirs: fig.columnDirs } : {}) });
    }
    const lines = splitLines(it);
    for (const line of lines) {
      if (!line.text.trim()) { if (code) code.lines.push(""); continue; }
      if (isCodeLine(line.text, line.mono)) { flushList(); if (!code) code = { lines: [], ref: i }; code.lines.push(line.text.replace(/\t/g, "    ")); continue; }
      flushCode();
      const bullet = /^\s*[•*]\s+/.test(line.text);
      if (it.numbered || bullet) {
        const variant = it.numbered && it.numbered.format === "decimal" ? "ordered" : "plain";
        const runs = bullet ? stripBullet(line.runs) : line.runs;
        if (!list || list.variant !== variant || (it.numbered && list.numId !== it.numbered.numId)) { flushList(); list = { variant, items: [], numId: it.numbered?.numId }; }
        list.items.push(lineSpans(runs, log, pid));
        continue;
      }
      flushList();
      const bold = line.runs.length > 0 && line.runs.every(r => r.bold);
      const text = line.text.trim();
      if (ASSIGNMENT_TITLE.test(text)) { blocks.push({ id: id(), type: "heading", origin: "book", level: 2, text: text.replace(/\s+/g, " ") }); continue; }
      const headingInAssignment = kind === "assignment" && bold && (/^🔹/.test(text) || text === "الأسئلة" || /^الوظيفة:/.test(text));
      // a short bold label («مثال:», «الناتج:», «✅ الكود:») stays a bold line of text, not a heading
      const label = text.endsWith(":") && text.split(/\s+/).length <= 2;
      if ((kind === "summary" || kind === "front") && bold && !QUESTION.test(text) && !label && !(pg.asText || []).includes(i) || headingInAssignment) {
        const spans = lineSpans(line.runs, log, pid);
        blocks.push({ id: id(), type: "heading", origin: "book", level: 3, text: spans.map(s => s.text).join("") });
        continue;
      }
      const spans = lineSpans(line.runs, log, pid);
      if (spans.length) blocks.push({ id: id(), type: "text", origin: "book", spans });
    }
  }
  flushCode(); flushList();
  return blocks;
}
const stripBullet = runs => { const out = runs.map(r => ({ ...r })); out[0].text = out[0].text.replace(/^\s*[•*]\s+/, ""); return out.filter(r => r.text); };
function tableBlock(id, rows) {
  const [headers, ...body] = rows.map(r => r.map(c => c.replace(/\s+/g, " ").trim()));
  const width = headers.length;
  const cells = body.map(r => r.length === width ? r : [...r, ...Array(Math.max(0, width - r.length)).fill("")].slice(0, width));
  const columnDirs = headers.map((_, k) => (cells.length && cells.every(r => !ARABIC.test(r[k])) ? "ltr" : "rtl"));
  return { id, type: "table", origin: "book", headers, rows: cells, ...(columnDirs.some(d => d === "ltr") ? { columnDirs } : {}) };
}

// ── output ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ts = v => JSON.stringify(v, null, 2);
function moduleFile(mod) {
  const n = mod.id.slice(-3);
  return `// Learning Materials — «أسس علم الحاسوب» (899371), ${mod.order === 0 ? "the opening" : "chapter " + mod.order} «${mod.title}».
//
// GENERATED by scripts/convert-899371.mjs from the owner's Word source (do not edit by hand: change the converter and re-run it).
// Every block is origin "book", converted verbatim from the source paragraphs its page's source note names (¶); the owner-approved
// corrections (plan §12.4) and the reading of the source's Markdown residue (decision P2-a) are the only differences, and
// fidelity.p2.test.ts proves it. The page's source note (¶) names the Word paragraphs it was converted from.

import type { ContentModule } from "../../types";

const ${n}: ContentModule = ${ts(mod)};

export default ${n};
`;
}
function manifestFile(modules) {
  const manifest = {
    schemaVersion: 1, courseId: CID, title: "أسس علم الحاسوب", direction: "rtl",
    modules: modules.map(m => ({ id: m.id, title: m.title, order: m.order, lessons: m.lessons.map(l => ({ id: l.id, title: l.title, order: l.order, pages: l.pages.map(p => ({ id: p.id, title: p.title, order: p.order, source: p.source })) })) })),
    batches: BATCHES.map(b => ({ ...b, moduleIds: STRUCTURE.filter(m => m.batch === b.id).map(m => `${CID}-m${String(m.n).padStart(2, "0")}`) })),
  };
  return `// Learning Materials — content MANIFEST of «أسس علم الحاسوب» (course 899371, مجمع أسئلة نموذج 899371).
//
// GENERATED by scripts/convert-899371.mjs with the module bodies (contentData.sync and course899371.test.ts pin the two equal).
// Module mNN is chapter NN of the book (m00 = its opening); a page's source names the book page of its section (printed table of
// contents) and the Word paragraphs it was converted from. Sections without a converted module yet are shown as «قريبًا».
//
// ID policy: \`899371\` · \`899371-mNN\` · \`899371-mNN-lNN\` · \`899371-mNN-lNN-pNN\` — stable, never regenerated at runtime.

import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseManifest } from "../types";

const manifest: LearningCourseManifest = ${ts(manifest).replace('"schemaVersion": 1', '"schemaVersion": LEARNING_CONTENT_SCHEMA_VERSION')};

export default manifest;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { modules, log, applied } = convert(readDocxBody(readFileSync(SOURCE_FILE)));
  mkdirSync(join(OUT, "modules"), { recursive: true });
  for (const m of modules) writeFileSync(join(OUT, "modules", m.id.slice(-3) + ".ts"), moduleFile(m));
  writeFileSync(join(OUT, "manifest.ts"), manifestFile(modules));
  writeFileSync(join(OUT, "conversion-log.json"), JSON.stringify({ markers: log, corrections: applied.map(c => ({ finding: c.finding, index: c.index, find: c.find, replace: c.replace })) }, null, 2) + "\n");
  const pages = modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.pages.length, 0), 0);
  const blocks = modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.pages.reduce((b, p) => b + p.blocks.length, 0), 0), 0);
  console.log(`899371: ${modules.length} modules, ${pages} pages, ${blocks} blocks; ${applied.length} corrections; ${log.length} Markdown markers read as formatting`);
}
