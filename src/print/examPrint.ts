// D5 (item 9, owner decision) — print an exam for a paper sitting: a STUDENT PAPER (questions, options, images, room for the name and
// the answers) and a separate ANSWER KEY for the teacher. Pure builder (unit-tested) of ONE self-contained RTL HTML document, printed
// from a hidden same-origin iframe exactly like the gradebook / login-card prints (no popup, no script, no dependency); the browser's
// «حفظ بصيغة PDF» turns it into a PDF with proper Arabic shaping.
//
// Rules:
//  - Every text value is HTML-escaped; images are only data:image URLs or same-origin paths (the CSP's img-src), never external.
//  - The student paper never carries a key: answers are read ONLY when mode === "key" (and the key document says so on every page).
//  - Matching / categorization answer sides are listed in a fixed alphabetical order, never in key order.
//  - Interactive families (coding, simulations, hotspot, charts, 3D, network CLI…) print their prompt and image with a note that they
//    are answered on the platform; nothing is invented for them.
//  - Marks are the official ones (questionMaxMarks / distributePartMarks), the same the cover and the grader use.
import type { BuilderField, BuilderOption, BuilderQuestion, BuilderSection, StructuredExam } from "../examTypes";
import { distributePartMarks, partLabel, questionMaxMarks } from "../examStructure";
import { parseTable } from "../legacyTableSemantics";

export type ExamPrintMode = "student" | "key";
type Obj = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const marksText = (n: number) => { const r = Math.round(n * 100) / 100; return r === 1 ? "علامة واحدة" : r === 2 ? "علامتان" : r + " علامات"; };
const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل"];
const letter = (i: number) => LETTERS[i] || String(i + 1);
const optionText = (o: BuilderOption | undefined) => (o ? o.text || o.label || o.value || "" : "");
const byText = (a: string, b: string) => a.localeCompare(b, "ar");

/** Only images the page may show (CSP img-src 'self' data: blob:) — a data:image URL or a same-origin path. */
export function printableImageSrc(src: unknown): string | null {
  if (typeof src !== "string" || !src) return null;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(src)) return src;
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  return null;
}
function imagesOf(q: Obj): string[] {
  const out: string[] = [];
  const img = q.image;
  if (isObj(img) && img.visible !== false && img.exists !== false) for (const a of arr<Obj>(img.assets)) { const s = printableImageSrc(isObj(a) ? a.dataUrl : null); if (s) out.push(s); }
  if (!out.length) for (const a of arr<Obj>(q.images)) { const s = printableImageSrc(isObj(a) ? a.dataUrl : null); if (s) out.push(s); }
  return out;
}
const imgs = (q: Obj) => imagesOf(q).map(s => '<img class="qimg" src="' + esc(s) + '" alt="">').join("");

/** Plain text of a rich document (headings, paragraphs, list items, code, quotes): the printable fallback of a rich stem. */
export function richPlainText(doc: unknown, limit = 20000): string {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || out.join("\n").length > limit) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (!isObj(v)) return;
    for (const k of ["text", "source", "title", "caption", "content"]) if (typeof v[k] === "string" && (v[k] as string).trim()) out.push(v[k] as string);
    for (const k of ["blocks", "items", "children", "columns", "rows", "cells", "spans"]) if (v[k] !== undefined) walk(v[k], depth + 1);
  };
  walk(isObj(doc) ? doc.blocks : doc, 0);
  return out.join("\n");
}

function textBlock(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const table = parseTable(t);
  const prose = table ? t.split(/\r?\n/).filter(l => !(l.trim().startsWith("|") && l.trim().endsWith("|"))).join("\n").trim() : t;
  return (prose ? '<p class="stem">' + esc(prose).replace(/\n/g, "<br>") + "</p>" : "") + (table ? htmlTable(table.headers, table.rows) : "");
}
const htmlTable = (headers: readonly string[], rows: readonly (readonly string[])[], cell: (r: number, c: number, v: string) => string = (_r, _c, v) => esc(v)) =>
  '<table class="grid">' + (headers.length ? "<thead><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead>" : "") + "<tbody>" + rows.map((row, r) => "<tr>" + row.map((v, c) => "<td>" + cell(r, c, v) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
const lines = (n: number) => '<div class="lines">' + "<i></i>".repeat(n) + "</div>";
const blank = '<span class="blank"></span>';
const keyBox = (html: string) => '<div class="key"><b>الإجابة: </b>' + html + "</div>";
const note = (text: string) => '<p class="note">' + esc(text) + "</p>";
const INTERACTIVE_NOTE = "سؤال تفاعلي — يُجاب عنه على المنصة.";

function stemOf(q: Obj): string {
  const t = str(q.text);
  return t.trim() ? t : richPlainText(q.richContent);
}
function codeBlock(language: string, source: string, label = ""): string {
  if (!source.trim()) return "";
  return '<figure class="code">' + (label || language ? "<figcaption>" + esc(label || language) + "</figcaption>" : "") + '<pre dir="ltr"><code>' + esc(source) + "</code></pre></figure>";
}

/** One question / part body (everything after the stem): the controls of the paper, and in key mode the answer. */
function body(q: Obj, type: string, key: boolean): string {
  const a = isObj(q.answer) ? q.answer : {};
  const opts = arr<BuilderOption>(q.options), fields = arr<BuilderField>(q.fields);
  switch (type) {
    case "multipleChoice": {
      const c = typeof a.correctOptionIndex === "number" ? a.correctOptionIndex : -1;
      return '<ol class="opts">' + opts.map((o, i) => '<li><span class="box">' + letter(i) + "</span> " + esc(optionText(o)) + "</li>").join("") + "</ol>"
        + (key ? keyBox(c >= 0 && opts[c] ? letter(c) + ") " + esc(optionText(opts[c])) : "—") : "");
    }
    case "multipleSelect": {
      const ids = arr<string>(a.correctOptionIds);
      return note("اختر كل ما ينطبق.") + '<ul class="opts check">' + opts.map(o => '<li><span class="square"></span> ' + esc(optionText(o)) + "</li>").join("") + "</ul>"
        + (key ? keyBox(opts.filter(o => o.id && ids.includes(o.id)).map(o => esc(optionText(o))).join("، ") || "—") : "");
    }
    case "trueFalse": {
      const v = a.correct === true || a.correctOptionIndex === 0 ? "صح" : a.correct === false || a.correctOptionIndex === 1 ? "خطأ" : "—";
      return '<p class="tf"><span class="circle"></span> صح <span class="circle"></span> خطأ</p>' + (key ? keyBox(v) : "");
    }
    case "multiTrueFalse":
      return '<table class="grid"><thead><tr><th>العبارة</th><th>صح</th><th>خطأ</th></tr></thead><tbody>' + fields.map(f => "<tr><td>" + esc(f.statement || f.label || "") + "</td><td>" + (key && f.correct === true ? "✓" : '<span class="square"></span>') + "</td><td>" + (key && f.correct === false ? "✓" : '<span class="square"></span>') + "</td></tr>").join("") + "</tbody></table>";
    case "fillBlank":
    case "wordBank": {
      const bank = arr<string>(q.wordBank).filter(Boolean), values = arr<unknown>(a.values);
      return (bank.length ? '<p class="bank"><b>الكلمات: </b>' + [...bank].sort(byText).map(esc).join(" · ") + "</p>" : "")
        + '<ol class="fields">' + fields.map((f, i) => "<li>" + esc(f.label || "") + " " + (key ? "<b>" + esc(str(values[i]) || str(f.correct) || "—") + "</b>" : blank) + "</li>").join("") + "</ol>";
    }
    case "matching": {
      const right = fields.map(f => str(f.correct)).filter(Boolean).sort(byText);
      return '<div class="match"><ol class="fields">' + fields.map(f => "<li>" + esc(f.label || "") + " " + (key ? "← <b>" + esc(str(f.correct) || "—") + "</b>" : blank) + "</li>").join("") + "</ol>"
        + (right.length && !key ? '<ul class="pool">' + right.map(v => "<li>" + esc(v) + "</li>").join("") + "</ul>" : "") + "</div>";
    }
    case "ordering": {
      const items = (arr<string>(q.wordBank).length ? arr<string>(q.wordBank) : opts.map(optionText)).filter(Boolean), seq = arr<unknown>(a.values).map(str).filter(Boolean);
      return note("رتّب العناصر بكتابة رقم الترتيب في المربع.") + '<ul class="opts">' + [...items].sort(byText).map(v => '<li><span class="square wide"></span> ' + esc(v) + "</li>").join("") + "</ul>"
        + (key ? keyBox(seq.length ? seq.map((v, i) => i + 1 + ". " + esc(v)).join("، ") : "—") : "");
    }
    case "tableFill": {
      const headers = arr<string>(q.tableHeaders), rows = arr<string[]>(q.tableRows);
      if (!rows.length) return "";
      const at = (r: number, c: number) => fields.find(f => f.row === r && f.column === c);
      return htmlTable(headers, rows, (r, c, v) => { const f = at(r, c); return f ? (key ? "<b>" + esc(str(f.correct) || "—") + "</b>" : blank) : esc(v); });
    }
    case "cliFill":
      return codeBlock("CLI", str(q.cli)) + '<ol class="fields">' + fields.map(f => "<li>" + esc(f.label || "") + " " + (key ? "<b dir=\"ltr\">" + esc(str(f.correct) || "—") + "</b>" : blank) + "</li>").join("") + "</ol>";
    case "matrix": {
      const m = isObj(q.matrix) ? q.matrix : {}, rows = arr<Obj>(m.rows), cols = arr<Obj>(m.columns), map = isObj(a.correctColumnByRow) ? a.correctColumnByRow : {};
      return '<table class="grid"><thead><tr><th></th>' + cols.map(c => "<th>" + esc(c.label) + "</th>").join("") + "</tr></thead><tbody>" + rows.map(r => "<tr><th>" + esc(r.label) + "</th>" + cols.map(c => "<td>" + (key && map[str(r.id)] === c.id ? "✓" : '<span class="circle"></span>') + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
    }
    case "categorization": {
      const cz = isObj(q.categorization) ? q.categorization : {}, cats = arr<Obj>(cz.categories), items = arr<Obj>(cz.items), map = isObj(a.correctCategoryByItem) ? a.correctCategoryByItem : {};
      const catLabel = (id: unknown) => esc(cats.find(c => c.id === id)?.label ?? "—");
      return '<p class="bank"><b>الفئات: </b>' + cats.map(c => esc(c.label)).join(" · ") + "</p>" + '<ol class="fields">' + [...items].sort((x, y) => byText(str(x.label), str(y.label))).map(it => "<li>" + esc(it.label) + " " + (key ? "← <b>" + catLabel(map[str(it.id)]) + "</b>" : blank) + "</li>").join("") + "</ol>";
    }
    case "inlineCloze": {
      const segs = arr<Obj>(isObj(q.inlineCloze) ? q.inlineCloze.segments : []), blanks = isObj(a.blanks) ? a.blanks : {};
      let n = 0;
      const passage = segs.map(s => {
        if (s.type === "text") return esc(s.text);
        n++;
        const b = isObj(blanks[str(s.id)]) ? blanks[str(s.id)] as Obj : {};
        const optsTxt = arr<Obj>(s.options).map(o => str(o.label));
        if (key) return "<b>(" + n + ") " + esc(s.control === "dropdown" ? str(arr<Obj>(s.options).find(o => o.id === b.correctOptionId)?.label) || "—" : arr<string>(b.accepted).join(" / ") || "—") + "</b>";
        return "(" + n + ") " + (s.control === "dropdown" && optsTxt.length ? "[ " + optsTxt.map(esc).join(" / ") + " ]" : blank);
      }).join("");
      return '<p class="stem">' + passage + "</p>";
    }
    case "numericResponse": {
      const unit = str(a.unit), tol = Number(a.tolerance);
      const v = a.mode === "range" || (a.min !== undefined && a.max !== undefined) ? str(a.min) + " – " + str(a.max) : str(a.expected) + (Number.isFinite(tol) && tol > 0 ? " ± " + tol : "");
      return '<p class="answer-line">الإجابة: ' + blank + (unit && !key ? " " + esc(unit) : "") + "</p>" + (key ? keyBox('<span dir="ltr">' + esc(v || "—") + "</span>" + (unit ? " " + esc(unit) : "")) : "");
    }
    case "parametricNumeric":
      return note("قيم هذا السؤال تتولد لكل طالب على المنصة؛ في الورقة تُستخدم القيم التي يحددها المعلم.") + '<p class="answer-line">الإجابة: ' + blank + "</p>" + (key ? keyBox('<span dir="ltr">' + esc(str(a.expression) || "—") + "</span>") : "");
    case "shortAnswer":
    case "open":
      return lines(2) + (key ? keyBox(esc(str(a.text) || "يُصحَّح يدويًا")) : "");
    case "openResponse": {
      const cfg = isObj(q.openResponse) ? q.openResponse : {};
      return (str(cfg.instructions) ? note(str(cfg.instructions)) : "") + lines(8) + (key ? keyBox(esc(str(a.modelAnswer) || "يُصحَّح يدويًا وفق معايير التصحيح.")) : "");
    }
    case "coding": {
      const c = isObj(q.coding) ? q.coding : {}, tpl = isObj(c.template) ? c.template : null;
      const src = tpl ? arr<Obj>(tpl.segments).map(s => (s.kind === "editable" ? "▢ " + str(s.starter) : str(s.text))).join("") : str(c.starterCode);
      return codeBlock(str(tpl ? tpl.language : c.language), src) + note("سؤال برمجة — يُنفَّذ ويُصحَّح على المنصة؛ يمكن كتابة الحل على الورقة.") + lines(6) + (key ? keyBox("يُصحَّح باختبارات مخفية على المنصة.") : "");
    }
    default:
      return note(INTERACTIVE_NOTE) + (key ? keyBox("يُصحَّح على المنصة.") : "");
  }
}

function sourceHtml(src: Obj): string {
  const title = str(src.title) ? "<h4>" + esc(src.title) + "</h4>" : "";
  if (src.kind === "text") return title + textBlock(str(src.text));
  if (src.kind === "code") return title + codeBlock(str(src.language), str(src.source));
  if (src.kind === "table") return title + htmlTable(arr<string>(src.columnHeaders), arr<string[]>(src.rows));
  if (src.kind === "image") { const s = printableImageSrc(isObj(src.image) ? src.image.dataUrl : null); return title + (s ? '<img class="qimg" src="' + esc(s) + '" alt="' + esc(src.alt) + '">' : ""); }
  if (src.kind === "rich") return title + textBlock(richPlainText(src.richContent));
  return "";
}

function compositeHtml(q: Obj, key: boolean): string {
  const root = isObj(q.composite) ? q.composite : {};
  const ctx = arr<Obj>(root.contexts).map(c => '<div class="stimulus">' + (str(c.title) ? "<h4>" + esc(c.title) + "</h4>" : "") + (str(c.instructions) ? textBlock(str(c.instructions)) : "") + (c.kind === "smartSim" ? note(INTERACTIVE_NOTE) : arr<Obj>(c.sources).map(sourceHtml).join("")) + "</div>").join("");
  const groups = arr<Obj>(root.groups).map(g => (str(g.title) ? "<h4>" + esc(g.title) + "</h4>" : "") + (str(g.instructions) ? textBlock(str(g.instructions)) : "")
    + arr<Obj>(g.parts).map((p, i) => '<div class="part"><p class="part-head"><b>' + esc(partLabel(p as never, i)) + ")</b>" + (Number(p.marks) > 0 ? ' <span class="marks">(' + marksText(Number(p.marks)) + ")</span>" : "") + "</p>" + textBlock(stemOf(p)) + imgs(p) + body(p, str(p.type), key) + "</div>").join("")).join("");
  return ctx + groups;
}

function questionHtml(q: BuilderQuestion, number: string, key: boolean): string {
  const o = q as unknown as Obj, type = str(q.presentationType);
  const head = '<div class="q-head"><span class="q-num">' + esc(number) + '</span><span class="marks">(' + marksText(questionMaxMarks(q as never)) + ")</span></div>";
  const stimulus = q.codeStimulus ? codeBlock(str(q.codeStimulus.language), str(q.codeStimulus.source), str(q.codeStimulus.label)) : "";
  let inner: string;
  if (type === "composite") inner = compositeHtml(o, key);
  else if (Array.isArray(q.parts) && q.parts.length) {
    const marks = distributePartMarks(q as never);
    inner = q.parts.map((p, i) => '<div class="part"><p class="part-head"><b>' + esc(partLabel(p as never, i)) + ")</b> " + '<span class="marks">(' + marksText(marks[i] || 0) + ")</span></p>" + textBlock(stemOf(p as unknown as Obj)) + body(p as unknown as Obj, str(p.type), key) + "</div>").join("");
  } else inner = body(o, type, key);
  return '<article class="q">' + head + textBlock(stemOf(o)) + stimulus + imgs(o) + inner + "</article>";
}

function sectionHtml(s: BuilderSection, startNumber: number, key: boolean): { html: string; next: number } {
  let n = startNumber;
  const shownStimuli = new Set<string>(), shownScenarios = new Set<string>();
  const scenarios = arr<Obj>(s.scenarios);
  const qs = arr<BuilderQuestion>(s.questions).map(q => {
    let pre = "";
    for (const sc of scenarios) if (!shownScenarios.has(str(sc.id)) && arr<string>(sc.questionIds).includes(q.examQuestionId)) {
      shownScenarios.add(str(sc.id));
      pre += '<div class="stimulus">' + (str(sc.title) ? "<h4>" + esc(sc.title) + "</h4>" : "") + (str(sc.instructions) ? textBlock(str(sc.instructions)) : "") + arr<Obj>(sc.sources).map(sourceHtml).join("") + "</div>";
    }
    const st = q.groupId && s.stimuli ? s.stimuli[q.groupId] : undefined;
    if (st && q.groupId && !shownStimuli.has(q.groupId)) {
      shownStimuli.add(q.groupId);
      const src = printableImageSrc(st.image?.dataUrl);
      pre += '<div class="stimulus">' + (st.title ? "<h4>" + esc(st.title) + "</h4>" : "") + textBlock(str(st.text)) + (src ? '<img class="qimg" src="' + esc(src) + '" alt="">' : "") + "</div>";
    }
    const number = str(q.displayNumber).trim() || String(n);
    n++;
    return pre + questionHtml(q, number, key);
  }).join("");
  const policy = s.gradingPolicy === "firstNAnswered" && Number(s.requiredAnswers) > 0 ? note("أجب عن " + Number(s.requiredAnswers) + " فقط من أسئلة هذا القسم.") : "";
  return { html: '<section class="sec"><h2>' + esc(s.title || "") + "</h2>" + (s.instructions ? textBlock(s.instructions) : "") + policy + qs + "</section>", next: n };
}

/** The whole print document of a structured exam (exported for tests). */
export function buildExamPrintHtml(exam: StructuredExam, mode: ExamPrintMode, opts: { generatedAt?: string } = {}): string {
  const key = mode === "key";
  const md = isObj(exam.metadata) ? exam.metadata : {};
  const sections = arr<BuilderSection>(exam.sections);
  const total = sections.reduce((s, sec) => s + arr<BuilderQuestion>(sec.questions).reduce((t, q) => t + questionMaxMarks(q as never), 0), 0);
  const metaPairs: Array<[string, string]> = [["المدرسة", str(md.school)], ["المادة", str(md.subject)], ["الصف", str(md.grade) || str(md.className)], ["المعلم", str(md.teacherName)], ["التاريخ", str(md.date)], ["المدة", str(md.duration)], ["العلامة الكلية", String(Math.round(total * 100) / 100)]];
  const meta = metaPairs.filter(([, v]) => v).map(([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>").join("");
  let next = 1;
  const body = sections.map(s => { const r = sectionHtml(s, next, key); next = r.next; return r.html; }).join("");
  const instructions = str(md.generalInstructions) || str(exam.coverPage?.instructions);
  const title = str(exam.title) || "امتحان";
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + (key ? " — مفتاح الإجابات" : "") + "</title><style>"
    + "@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,Arial,sans-serif;color:#111;font-size:11.5pt;line-height:1.6}"
    + "header{border-bottom:2px solid #111;padding-bottom:3mm;margin-bottom:4mm}h1{font-size:17pt;margin:0 0 2mm}"
    + ".badge{display:inline-block;border:1.5px solid #b91c1c;color:#b91c1c;font-weight:700;padding:0 3mm;border-radius:2mm;margin-inline-start:3mm;font-size:11pt}"
    + "dl{display:flex;flex-wrap:wrap;gap:1mm 6mm;margin:0}dl div{display:flex;gap:2mm}dt{color:#444}dd{margin:0;font-weight:700}"
    + ".student{display:flex;gap:8mm;margin:3mm 0 0}.student span{flex:1;border-bottom:1px dotted #111;padding-bottom:1mm}"
    + ".instructions{border:1px solid #999;border-radius:2mm;padding:2mm 3mm;margin:0 0 4mm}"
    + ".sec h2{font-size:13.5pt;border-bottom:1px solid #999;margin:5mm 0 2mm;padding-bottom:1mm}"
    + ".q{break-inside:avoid;page-break-inside:avoid;margin:0 0 4mm;padding:0 0 2mm;border-bottom:1px dashed #ccc}"
    + ".q-head{display:flex;justify-content:space-between;align-items:baseline}.q-num{font-weight:800;font-size:12.5pt}.q-num::after{content:' .'}"
    + ".marks{color:#444;font-size:10pt}.stem{margin:1mm 0}.note{color:#555;font-size:10pt;font-style:italic;margin:1mm 0}"
    + ".opts{list-style:none;padding:0;margin:1mm 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1mm 6mm}"
    + ".box{display:inline-block;min-width:6mm;text-align:center;border:1px solid #111;border-radius:50%;font-size:9.5pt}"
    + ".square{display:inline-block;width:4mm;height:4mm;border:1px solid #111;vertical-align:middle}.square.wide{width:8mm}"
    + ".circle{display:inline-block;width:4mm;height:4mm;border:1px solid #111;border-radius:50%;vertical-align:middle;margin-inline-start:4mm}"
    + ".blank{display:inline-block;min-width:35mm;border-bottom:1px solid #111;height:1em}"
    + ".lines i{display:block;border-bottom:1px solid #888;height:8mm}.fields{margin:1mm 0;padding-inline-start:6mm}.fields li{margin:1mm 0}"
    + ".match{display:flex;gap:8mm}.pool{border:1px solid #999;border-radius:2mm;padding:2mm 6mm;margin:0;align-self:flex-start}"
    + ".bank{border:1px solid #999;border-radius:2mm;padding:1mm 3mm}.answer-line{margin:2mm 0}"
    + "table.grid{border-collapse:collapse;width:100%;margin:1mm 0}table.grid th,table.grid td{border:1px solid #888;padding:1mm 2mm;text-align:start;vertical-align:top}"
    + "thead{display:table-header-group}.qimg{display:block;max-width:100%;max-height:85mm;margin:2mm auto;object-fit:contain}"
    + "figure.code{margin:2mm 0}figure.code figcaption{font-size:9pt;color:#444}pre{margin:0;border:1px solid #999;border-radius:2mm;padding:2mm;font:10pt ui-monospace,Consolas,monospace;white-space:pre-wrap}"
    + ".stimulus{border-inline-start:3px solid #999;padding-inline-start:3mm;margin:2mm 0 3mm}.stimulus h4{margin:0 0 1mm}"
    + ".part{margin:2mm 0 0;padding-inline-start:4mm}.part-head{margin:0}"
    + ".key{border:1.5px solid #15803d;border-radius:2mm;background:#f0fdf4;padding:1mm 3mm;margin:2mm 0 0;break-inside:avoid}"
    + "footer{margin-top:6mm;color:#666;font-size:9pt;text-align:center}"
    + "</style></head><body><header><h1>" + esc(title) + (key ? '<span class="badge">مفتاح الإجابات — للمعلم فقط</span>' : "") + "</h1>"
    + (meta ? "<dl>" + meta + "</dl>" : "")
    + (key ? "" : '<div class="student"><span>اسم الطالب: </span><span>الصف/الشعبة: </span></div>') + "</header>"
    + (instructions && !key ? '<div class="instructions">' + textBlock(instructions) + "</div>" : "")
    + "<main>" + body + "</main>"
    + "<footer>" + (key ? "مفتاح الإجابات — للمعلم فقط" : "انتهت الأسئلة") + (opts.generatedAt ? " · " + esc(opts.generatedAt) : "") + "</footer></body></html>";
}

/** Prints the exam from a hidden same-origin iframe (removed after printing). Returns false when the browser offers no iframe document. */
export function printExam(exam: StructuredExam, mode: ExamPrintMode): boolean {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = mode === "key" ? "مفتاح الإجابات للطباعة" : "ورقة الامتحان للطباعة";
  frame.style.cssText = "position:fixed;inset-block-end:0;inset-inline-end:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc || !win || typeof win.print !== "function") { frame.remove(); return false; }
  doc.open(); doc.write(buildExamPrintHtml(exam, mode, { generatedAt: new Date().toLocaleDateString("ar", { numberingSystem: "latn" } as Intl.DateTimeFormatOptions) })); doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 0);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Images (data: / same-origin) must be decoded before the print snapshot is taken.
  const ready = Array.from(doc.querySelectorAll("img")).map(img => (img.complete ? Promise.resolve() : new Promise<void>(res => { img.addEventListener("load", () => res(), { once: true }); img.addEventListener("error", () => res(), { once: true }); })));
  void Promise.race([Promise.all(ready), new Promise(res => setTimeout(res, 3000))]).then(() => { win.focus(); win.print(); });
  setTimeout(() => { if (frame.isConnected) frame.remove(); }, 120000);   // a browser that never fires afterprint
  return true;
}
