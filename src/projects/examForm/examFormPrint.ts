// Phase F5 (PDF) — one student's project exam form as a print-ready, right-to-left document: every section, every question
// and the student's answer, the attached images, and — where the reader may see it — the teacher's review. Printed from a
// hidden same-origin iframe like the platform's other exports (reports/printReport.ts, print/examPrint.ts): the browser's
// «حفظ بصيغة PDF» then makes the PDF with proper Arabic shaping, which a JavaScript PDF library would not. No dependency.
//
// What a copy carries is decided by what the page was given, never here:
//   the student's copy   their own answers; after the teacher's approval also the mark, each section's level and note, and
//                        right / wrong per auto-marked question (what the server sends them, nothing more)
//   the teacher's copy   the answers, right / wrong per auto-marked question, the stored ratings and notes, the mark
// NEITHER copy carries an answer key: this module never reads `question.answer`, so a key cannot reach paper even from the
// teacher's view of the form. Every piece of text is HTML-escaped (an answer can never inject markup), and an image is
// embedded only as an image data URL of a raster type.
import type { ExamFormAnswer, ExamFormAnswers, ExamFormEntry, ExamFormQuestion } from "./types";

export type PrintAudience = "teacher" | "student";
export type PrintSection = { sectionId: string; title: string; order: number; weight?: number; questions: ExamFormQuestion[] };
/** One section's rating as the copy may show it. */
export type PrintRating = { level: number; topLevel: number; label: string; note: string; weight?: number; points?: number };
export type ExamFormPrintInput = {
  audience: PrintAudience;
  formTitle: string;
  projectCode: string;
  studentName: string;
  statusText: string;
  /** Label / value pairs under the title (class, dates, progress …). */
  meta: ReadonlyArray<readonly [string, string]>;
  sections: readonly PrintSection[];
  answers: ExamFormAnswers;
  /** imageId → an image data URL the page read with the reader's session. An id that is missing prints as a placeholder. */
  images: Readonly<Record<string, string>>;
  /** Right (true), wrong (false) or not answered (null) per auto-marked question — only where the reader may see it. */
  verdicts?: Readonly<Record<string, boolean | null>>;
  /** sectionId → rating — only where the reader may see it. */
  ratings?: Readonly<Record<string, PrintRating>>;
  /** Says what the ratings are when they are not an approved result (the teacher's working ratings). */
  ratingsNote?: string;
  generalNote?: string;
  mark?: { mark: number; outOf: number };
  generatedAt: string;
};

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Only a raster image data URL is ever written into the document. */
export const IMAGE_DATA_URL = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const entryText = (list: ExamFormEntry[] | undefined, id: string) => (list || []).find(e => e.id === id)?.text ?? id;
const blank = (s: unknown) => typeof s !== "string" || s.trim() === "";
const NONE = '<p class="none">لم يُجب.</p>';
const text = (s: string) => '<p class="text">' + esc(s) + "</p>";
const FILE_HANDED_IN = '<p class="none">يُسلَّم الملف للمعلم مباشرة: الملفات لا تُرفع إلى الموقع.</p>';

function imagesHtml(answer: ExamFormAnswer | undefined, images: Readonly<Record<string, string>>): string {
  const refs = answer && Array.isArray(answer.images) ? answer.images : [];
  if (!refs.length) return "";
  return '<div class="imgs">' + refs.map((ref, i) => {
    const src = images[ref.id];
    return typeof src === "string" && IMAGE_DATA_URL.test(src)
      ? '<figure><img alt="' + esc("الصورة " + (i + 1)) + '" src="' + src + '"><figcaption>' + esc("الصورة " + (i + 1)) + "</figcaption></figure>"
      : '<p class="none">' + esc("الصورة " + (i + 1) + ": تعذر تضمينها في هذا الملف.") + "</p>";
  }).join("") + "</div>";
}

// The student's answer to one question, as text. Never the question's key.
function answerHtml(q: ExamFormQuestion, answer: ExamFormAnswer | undefined, images: Readonly<Record<string, string>>): string {
  const pictures = imagesHtml(answer, images);
  if (q.kind === "image") return pictures || '<p class="none">لم تُرفق صورة.</p>';
  // Owner decision (2026-11-15): files are not uploaded to the site. A file question prints what the student's page says,
  // and nothing an answer may still hold from the short time uploads existed.
  if (q.kind === "file") return FILE_HANDED_IN;
  if (!answer) return NONE + pictures;
  let body = "";
  switch (q.kind) {
    case "shortText": case "paragraph":
      body = blank(answer.text) ? NONE : text(answer.text as string);
      break;
    case "cli":
      body = blank(answer.text) ? NONE : '<pre dir="ltr">' + esc(answer.text) + "</pre>";
      break;
    case "table": {
      const columns = q.columns || [], rows = Array.isArray(answer.rows) ? answer.rows : [];
      body = !rows.length ? NONE
        : "<table><thead><tr>" + columns.map(c => '<th scope="col">' + esc(c.title) + "</th>").join("") + "</tr></thead><tbody>"
          + rows.map(row => "<tr>" + columns.map(c => '<td dir="auto">' + esc(row && row[c.id]) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
      break;
    }
    case "choice":
      body = typeof answer.optionId !== "string" ? NONE : text(entryText(q.options, answer.optionId));
      if (!blank(answer.justification)) body += '<p class="text"><span class="lbl">التبرير: </span>' + esc(answer.justification) + "</p>";
      break;
    case "multiChoice": {
      const chosen = Array.isArray(answer.optionIds) ? answer.optionIds : [];
      body = !chosen.length ? NONE : "<ul>" + chosen.map(id => "<li>" + esc(entryText(q.options, id)) + "</li>").join("") + "</ul>";
      break;
    }
    case "matching": {
      const pairs = answer.pairs || {};
      const rows = (q.left || []).filter(l => typeof pairs[l.id] === "string");
      body = !rows.length ? NONE : "<ul>" + rows.map(l => "<li>" + esc(l.text) + ' <span class="lbl">←</span> ' + esc(entryText(q.right, pairs[l.id])) + "</li>").join("") + "</ul>";
      break;
    }
    case "ordering": {
      const order = Array.isArray(answer.order) ? answer.order : [];
      body = !order.length ? NONE : "<ol>" + order.map(id => "<li>" + esc(entryText(q.items, id)) + "</li>").join("") + "</ol>";
      break;
    }
    case "scale": {
      const values = answer.values || {};
      const rows = (q.items || []).filter(i => Number.isFinite(values[i.id]));
      body = !rows.length ? NONE : "<ul>" + rows.map(i => "<li>" + esc(i.text) + ': <span dir="ltr">' + esc(values[i.id]) + (q.max ? " / " + esc(q.max) : "") + "</span></li>").join("") + "</ul>";
      break;
    }
    case "checklist": {
      const checked = Array.isArray(answer.checked) ? answer.checked : [];
      body = !checked.length ? NONE : "<ul>" + checked.map(id => "<li>" + esc(entryText(q.items, id)) + "</li>").join("") + "</ul>";
      break;
    }
    case "declaration":
      body = answer.accepted === true ? text("أوافق.") : NONE;
      break;
    default:
      body = NONE;
  }
  return body + pictures;
}

const verdictHtml = (v: boolean | null) =>
  '<p class="verdict ' + (v === null ? "v-none" : v ? "v-right" : "v-wrong") + '">' + (v === null ? "تصحيح آلي: بلا إجابة" : v ? "تصحيح آلي: إجابة صحيحة" : "تصحيح آلي: إجابة خاطئة") + "</p>";

function ratingHtml(r: PrintRating): string {
  const points = typeof r.points === "number" && typeof r.weight === "number" ? ' · <span dir="ltr">' + esc(r.points) + " / " + esc(r.weight) + "</span>" : "";
  return '<div class="rating"><p><span class="lbl">تقدير القسم: </span>' + esc(r.label) + ' <span dir="ltr">(' + esc(r.level) + "/" + esc(r.topLevel) + ")</span>" + points + "</p>"
    + (blank(r.note) ? "" : '<p><span class="lbl">ملاحظة المعلم: </span>' + esc(r.note) + "</p>") + "</div>";
}

const CSS = "@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;font-size:10.5pt;line-height:1.55}"
  + "h1{font-size:16pt;margin:0 0 1mm}p.sub{margin:0 0 3mm;color:#475569}h2{font-size:12.5pt;margin:6mm 0 2mm;padding-bottom:1mm;border-bottom:1.5px solid #0f172a;break-after:avoid}"
  + "dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2mm 5mm;margin:0 0 4mm}dl div{border:1px solid #cbd5e1;border-radius:2mm;padding:1.5mm 3mm}dt{color:#475569;font-size:8.5pt}dd{margin:0;font-weight:700}"
  + ".mark{border:1.5px solid #0f172a;border-radius:2mm;padding:2mm 4mm;margin:0 0 4mm;font-size:12pt;font-weight:700}"
  + ".q{margin:0 0 3mm;padding:2mm 3mm;border:1px solid #cbd5e1;border-radius:2mm;break-inside:avoid}.q h3{font-size:10.5pt;margin:0 0 1.5mm}.q .n{color:#475569;font-variant-numeric:tabular-nums}"
  + "p{margin:0 0 1mm}p.text{white-space:pre-wrap;overflow-wrap:anywhere}p.none{color:#64748b;font-style:italic}.lbl{color:#475569}"
  + "pre{margin:0 0 1mm;border:1px solid #94a3b8;border-radius:2mm;padding:2mm;font:9.5pt ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left}"
  + "table{width:100%;border-collapse:collapse;margin:0 0 1mm}th,td{border:1px solid #cbd5e1;padding:1mm 1.5mm;text-align:start;vertical-align:top;overflow-wrap:break-word}td{font-size:9pt}th{background:#f1f5f9;font-size:8.5pt}thead{display:table-header-group}tr{break-inside:avoid}"
  + "ul,ol{margin:0 0 1mm;padding-inline-start:6mm}"
  + ".imgs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;margin:1mm 0}figure{margin:0;break-inside:avoid}figure:only-child{grid-column:1 / -1}figure img{display:block;max-width:100%;max-height:95mm;margin:0 auto;object-fit:contain;border:1px solid #cbd5e1}figure:only-child img{max-height:130mm}figcaption{font-size:8.5pt;color:#475569;text-align:center}"
  + ".verdict{font-size:9.5pt;font-weight:700;margin-top:1mm}.v-right{color:#166534}.v-wrong{color:#b91c1c}.v-none{color:#475569}"
  + ".rating{border:1.5px solid #475569;border-radius:2mm;padding:2mm 3mm;margin:0 0 3mm;break-inside:avoid}"
  + ".general{border:1px solid #cbd5e1;border-radius:2mm;padding:2mm 3mm;margin:0 0 4mm}footer{margin-top:5mm;color:#64748b;font-size:8.5pt;text-align:center}";

/** The whole HTML document of one student's form (exported for tests). */
export function buildExamFormPrintHtml(input: ExamFormPrintInput): string {
  const teacher = input.audience === "teacher";
  const title = input.formTitle + " — " + input.projectCode;
  const meta = input.meta.map(([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>").join("");
  const mark = input.mark ? '<p class="mark">علامة الاستمارة: <span dir="ltr">' + esc(input.mark.mark) + " / " + esc(input.mark.outOf) + "</span></p>" : "";
  const general = blank(input.generalNote) ? "" : '<div class="general"><p><span class="lbl">ملاحظة عامة من المعلم: </span>' + esc(input.generalNote) + "</p></div>";
  const ratingsNote = input.ratings && !blank(input.ratingsNote) ? '<p class="sub">' + esc(input.ratingsNote) + "</p>" : "";
  const sections = input.sections.map(section => {
    const rating = input.ratings ? input.ratings[section.sectionId] : undefined;
    const questions = section.questions.map((q, i) => {
      const verdict = input.verdicts && q.questionId in input.verdicts ? verdictHtml(input.verdicts[q.questionId]) : "";
      return '<div class="q"><h3><span class="n" dir="ltr">' + esc(section.order + "." + (i + 1)) + "</span> " + esc(q.prompt) + (q.required ? "" : ' <span class="lbl">(اختياري)</span>') + "</h3>"
        + answerHtml(q, input.answers[q.questionId], input.images) + verdict + "</div>";
    }).join("");
    return "<section><h2>" + '<span dir="ltr">' + esc(section.order) + "</span>. " + esc(section.title)
      + (typeof section.weight === "number" && section.weight > 0 ? ' <span class="lbl">(' + esc("الوزن " + section.weight) + ")</span>" : "") + "</h2>"
      + questions + (rating ? ratingHtml(rating) : "") + "</section>";
  }).join("");
  const foot = (teacher ? "نسخة المعلم — لا تتضمن مفاتيح الإجابة" : "نسخة الطالب") + " · أُنشئ في " + input.generatedAt;
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title + " — " + input.studentName) + "</title><style>" + CSS + "</style></head><body>"
    + "<h1>" + esc(input.formTitle) + "</h1>"
    + '<p class="sub">' + esc("مشروع " + input.projectCode + (blank(input.studentName) ? "" : " · " + input.studentName) + " · " + input.statusText) + "</p>"
    + (meta ? "<dl>" + meta + "</dl>" : "") + mark + general + ratingsNote
    + "<main>" + sections + "</main>"
    + "<footer>" + esc(foot) + "</footer></body></html>";
}

/** The ids of every image the answers reference, in the order of the form. */
export function referencedImageIds(sections: readonly PrintSection[], answers: ExamFormAnswers): string[] {
  const ids: string[] = [];
  for (const section of sections) for (const q of section.questions) {
    const answer = answers[q.questionId];
    for (const ref of answer && Array.isArray(answer.images) ? answer.images : []) if (ref && typeof ref.id === "string" && !ids.includes(ref.id)) ids.push(ref.id);
  }
  return ids;
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(new Error("read"));
  reader.readAsDataURL(blob);
});

/**
 * Reads the attached images with the reader's session, one after another, as data URLs for the document. An image that
 * cannot be read, or that is not a raster image, is left out (the document says so in its place); the export never fails
 * because of one image. `onProgress(done, total)` after each.
 */
export async function loadPrintImages(ids: readonly string[], read: (imageId: string) => Promise<Blob>, onProgress?: (done: number, total: number) => void): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  let done = 0;
  for (const id of ids) {
    try {
      const url = await blobToDataUrl(await read(id));
      if (IMAGE_DATA_URL.test(url)) images[id] = url;
    } catch { /* left out; the document prints a placeholder */ }
    done += 1;
    if (onProgress) onProgress(done, ids.length);
  }
  return images;
}

/** How long a document with pictures waits for them before it prints anyway. */
export const PRINT_IMAGE_WAIT_MS = 3000;

/** Prints the document from a hidden same-origin iframe (removed after printing). False when the browser offers no iframe document. */
export function printExamFormDocument(html: string): boolean {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "استمارة المشروع للطباعة";
  frame.style.cssText = "position:fixed;inset-block-end:0;inset-inline-end:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument, win = frame.contentWindow;
  if (!doc || !win || typeof win.print !== "function") { frame.remove(); return false; }
  doc.open(); doc.write(html); doc.close();
  win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 0), { once: true });
  // A picture written into the document is not decoded yet when the write returns: the print waits for them, bounded.
  const waiting = Array.from(doc.querySelectorAll("img")).filter(img => !(img.complete && img.naturalWidth > 0));
  let started = false;
  const start = () => { if (started) return; started = true; if (frame.isConnected) { win.focus(); win.print(); } };
  if (!waiting.length) start();
  else {
    let left = waiting.length;
    const tick = () => { left -= 1; if (left <= 0) start(); };
    for (const img of waiting) { img.addEventListener("load", tick, { once: true }); img.addEventListener("error", tick, { once: true }); }
    setTimeout(start, PRINT_IMAGE_WAIT_MS);
  }
  setTimeout(() => { if (frame.isConnected) frame.remove(); }, 120000);   // a browser that never fires afterprint
  return true;
}

/** The date and time of an ISO instant in words for the document; "" for nothing. */
export function printDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar", { numberingSystem: "latn", dateStyle: "medium", timeStyle: "short" } as Intl.DateTimeFormatOptions);
}
