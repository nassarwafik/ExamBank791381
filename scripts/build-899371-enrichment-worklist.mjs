#!/usr/bin/env node
// 899371 P10 (docs/enterprise-899371-enrichment-plan.md §7) — the question-by-question WORK LIST of the second plan: for every one of the
// book's 161 questions (P0 inventory, docs/enterprise-899371-learning/analysis/inventory.json) WHERE it is in the served course and
// WHAT it gets:
//   • track B «خطوة بخطوة» — a predict-output / trace-table / explain / truth-value question with a program on it (P13);
//   • track C «حلّ وافحص» — a write-program / method / class question; its check class from the P0 runner class (decision D4/D5),
//     and the P7 coding-lab question already authored for it, if any (P14);
//   • «جرّب مدخلك» — a give-an-input-example question (P8 «جرّب الكود» already runs it);
//   • the gate (decision D1): the solution card and the output tracer of a BOOK question are hidden until the teacher releases them;
// and the 33 animated scenes of track A with the summary page each belongs to (P11–P12).
// The page of a question is the converter's own page title («السؤال N» / «الأسئلة a–b», scripts/convert-899371.mjs); inside a page of
// several questions the blocks are split at each question's first line (the converter's own question pattern).
//   node scripts/build-899371-enrichment-worklist.mjs     → docs/enterprise-899371-learning/analysis/enrichment-worklist.json
// Deterministic; no network, no Docker. Exit 1 when a question cannot be placed.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const INVENTORY = join(ROOT, "docs/enterprise-899371-learning/analysis/inventory.json");
export const OUT = join(ROOT, "docs/enterprise-899371-learning/analysis/enrichment-worklist.json");
const CONTENT = join(ROOT, "api/src/data/learning-content/899371");
const LAB = join(ROOT, "scripts/coding-lab-899371");

const TRACE = ["PO", "TT", "EX", "TV"], SOLVE = ["WP", "WM", "WC"];
// decision D4 (no runner change) + D5 (a question whose wording needs the owner's correction is run-only until corrected)
export const CHECK_CLASS = Object.freeze({ auto: "check", "auto-small-n": "check-small-n", "needs-correction": "run-only-until-corrected", nondeterministic: "run-only", "incomplete-spec": "run-only" });
const ORDINALS = { "الأول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10 };
const START = new RegExp("^\\s*(?:السؤال|سؤال)\\s*(\\d+|" + Object.keys(ORDINALS).join("|") + ")|^\\s*(\\d{1,2})\\.\\s");
const spanText = b => (Array.isArray(b.spans) ? b.spans.map(s => s.text || "").join("") : "");
const numbersOfTitle = t => { const m = /^الأسئلة\s+(\d+)–(\d+)$/.exec(t); if (m) { const out = []; for (let n = +m[1]; n <= +m[2]; n++) out.push(n); return out; } const s = /^السؤال\s+(\d+)$/.exec(t); return s ? [+s[1]] : []; };
// a method HEADER alone («public static int Igloo(int[] a, int num);») is the signature a question asks the student to write: nothing
// runs, so it is no program to trace (its writing is track C, P14)
const programKind = code => /^\s*(public\s+|private\s+)?(static\s+)?[\w<>[\],\s]+\s+\w+\s*\([^)]*\)\s*;\s*$/.test(code) ? "signature" : /static\s+void\s+Main\s*\(/.test(code) ? (/\bclass\s+\w/.test(code) ? "class-with-main" : "main") : /\bclass\s+\w/.test(code) ? "class" : /\b(static\s+)?\w+\s+\w+\s*\([^)]*\)\s*\{/.test(code) ? "method" : "fragment";

// ── track A: the 33 animated scenes (plan §3.1, decision D6 — accepted as listed) ─────────────────────────────────────────────────
// [id, chapter, summary page (899371-mNN-l01-pNN), the concept the scene shows]
export const SCENES = Object.freeze([
  ["m01-variable-box", "m01", "p02", "المتغير صندوق: الإسناد يستبدل القيمة"],
  ["m01-write-writeline", "m01", "p02", "Write مقابل WriteLine ومكان المؤشر"],
  ["m01-readline-parse", "m01", "p02", "ReadLine ثم int.Parse: من لوحة المفاتيح إلى الصندوق"],
  ["m02-int-division", "m02", "p02", "القسمة الصحيحة والكسرية: 7 / 2 و7.0 / 2"],
  ["m02-remainder", "m02", "p02", "باقي القسمة: 7 % 3 توزيع حبات على مجموعات"],
  ["m02-logic-gates", "m02", "p02", "&& و|| بوابتان تضيئان"],
  ["m03-number-line", "m03", "p02", "Abs وRound وFloor على خط الأعداد"],
  ["m03-pow-sqrt", "m03", "p02", "Pow وSqrt: مربعات تكبر"],
  ["m03-random-range", "m03", "p03", "Random.Next(1, 7): الحد الأعلى غير مشمول"],
  ["m04-if-else-path", "m04", "p01", "مسار if / else يضيء حسب الشرط"],
  ["m04-else-if-ladder", "m04", "p02", "سلّم else if: أول شرط صحيح يوقف الفحص"],
  ["m04-truth-table", "m04", "p04", "جدول منطقي يمتلئ"],
  ["m05-for-anatomy", "m05", "p01", "تشريح for: البداية ← الشرط ← الجسم ← الخطوة"],
  ["m05-accumulator", "m05", "p02", "المجمِّع sum += i"],
  ["m05-nested-stars", "m05", "p02", "حلقتان متداخلتان ترسمان مثلث نجوم"],
  ["m06-while-vs-do", "m06", "p03", "while مقابل do-while: من يفحص أولًا"],
  ["m06-digits", "m06", "p02", "استخراج المنازل % 10 و/ 10"],
  ["m06-sentinel", "m06", "p01", "حلقة الحارس (−1)"],
  ["m07-call-return", "m07", "p02", "استدعاء وعودة: إطار يُدفع ويُسحب"],
  ["m07-value-ref-out", "m07", "p03", "بالقيمة مقابل ref وout: نسخة مقابل الصندوق نفسه"],
  ["m07-return-value", "m07", "p04", "القيمة المعادة تحل مكان الاستدعاء"],
  ["m08-string-index", "m08", "p02", "النص أحرف بمؤشرات: s[i] وLength"],
  ["m08-substring", "m08", "p03", "Substring(3, 4) نافذة تنزلق"],
  ["m08-indexof-replace", "m08", "p03", "IndexOf يمسح، وReplace ينشئ نصًا جديدًا"],
  ["m09-array-cells", "m09", "p03", "خانات المصفوفة والمؤشر من 0، و«خارج الحدود»"],
  ["m09-find-max", "m09", "p04", "أكبر قيمة: المؤشر يمشي ويحفظ"],
  ["m09-counters", "m09", "p05", "مصفوفة العدّادات (أصوات)"],
  ["m10-rows-cols", "m10", "p01", "الصفوف والأعمدة وGetLength(0/1)"],
  ["m10-row-major", "m10", "p02", "المرور صفًا صفًا"],
  ["m10-diagonals", "m10", "p03", "القطر الرئيسي والثانوي"],
  ["m11-class-objects", "m11", "p01", "الفئة مخطط والكائنات نسخ (new)"],
  ["m11-references-null", "m11", "p03", "مرجعان لكائن واحد، وnull"],
  ["m11-encapsulation", "m11", "p02", "private والوصول عبر Get / Set"],
].map(([id, chapter, page, concept]) => Object.freeze({ id, chapter, pageId: `899371-${chapter}-l01-${page}`, concept })));

function readModules() {
  const out = {};
  for (const f of readdirSync(CONTENT).filter(f => f.endsWith(".json"))) { const m = JSON.parse(readFileSync(join(CONTENT, f), "utf8")); out[m.id] = m; }
  return out;
}
function labQuestions() {
  const out = {};
  for (const f of readdirSync(LAB).filter(f => /^m\d\d\.json$/.test(f)).sort()) {
    JSON.parse(readFileSync(join(LAB, f), "utf8")).questions.forEach((q, i) => { out[q.book] = `CL899371-${f.slice(1, 3)}-Q${String(i + 1).padStart(2, "0")}`; });
  }
  return out;
}

/** The blocks of question `number` on its page: the whole page, or (several questions on it) from its first line to the next
 *  question's first line. Shared with the converter (P14 places a question's «حلّ وافحص» block right after them). Pure. */
export function questionSegment(page, number) {
  const numbers = numbersOfTitle(page.title);
  if (numbers.length <= 1) return { from: 0, to: page.blocks.length };
  const starts = page.blocks.map((b, i) => { if (b.type !== "text") return null; const t = spanText(b), s = START.exec(t); return s ? { i, n: s[1] ? (ORDINALS[s[1]] ?? Number(s[1])) : Number(s[2]) } : null; }).filter(Boolean);
  const k = starts.findIndex(s => s.n === number);
  // a question printed inside another's line (F21: «… السؤال 10 - …») has no first line of its own: it shares that question's blocks
  const at = k >= 0 ? k : starts.reduce((best, s, j) => (s.n < number ? j : best), 0);
  return { from: starts[at]?.i ?? 0, to: starts[at + 1]?.i ?? page.blocks.length };
}
export { numbersOfTitle };

/** The work list (pure over the inventory, the served bodies and the P7 lab). Throws when a question cannot be placed. */
export function buildWorklist(inventory = JSON.parse(readFileSync(INVENTORY, "utf8")), modules = readModules(), lab = labQuestions()) {
  const questions = [];
  for (const m of inventory.modules) for (const a of m.assignments || []) {
    const sec = a.section === "homework" ? "h" : "p";
    const lesson = modules[m.moduleId].lessons.find(l => l.id === m.moduleId + (sec === "h" ? "-l02" : "-l03"));
    if (!lesson) throw new Error(m.moduleId + ": no " + a.section + " lesson");
    for (const q of a.questions) {
      const page = lesson.pages.find(p => numbersOfTitle(p.title).includes(q.number));
      if (!page) throw new Error(q.id + ": no page names question " + q.number);
      // the blocks of this question: the page, or (several questions on it) from its first line to the next question's first line
      const seg = questionSegment(page, q.number);
      const blocks = page.blocks.slice(seg.from, seg.to);
      // the BOOK's programs only (an added «حلّ وافحص» starter block, P14, is not the question's program)
      const programs = blocks.filter(b => b.type === "code" && b.language === "csharp" && b.origin === "book").map(b => ({ blockId: b.id, kind: programKind(b.code) }));
      const patterns = [...new Set([...(q.pattern ? [q.pattern] : []), ...(q.parts || []).map(p => p.pattern).filter(Boolean)])].sort();
      const trace = patterns.some(p => TRACE.includes(p)) && programs.length > 0;
      const solve = patterns.some(p => SOLVE.includes(p)) ? (CHECK_CLASS[q.runner] ?? null) : null;
      questions.push({
        id: q.id, chapter: m.moduleId.slice(-3), section: a.section, number: q.number, brief: q.brief || "", pageId: page.id, patterns, programs,
        trace, solve, ...(solve ? { runnerClass: q.runner ?? null, lab: lab[q.id] ?? null } : {}), tryInput: patterns.includes("GI"),
        gate: trace || solve ? "teacher-release" : null,
      });
    }
  }
  const pages = new Set(Object.values(modules).flatMap(m => m.lessons.flatMap(l => l.pages.map(p => p.id))));
  for (const s of SCENES) if (!pages.has(s.pageId)) throw new Error("scene " + s.id + ": no page " + s.pageId);
  const count = f => questions.filter(f).length;
  return {
    schemaVersion: 1, courseId: "899371", plan: "docs/enterprise-899371-enrichment-plan.md",
    decisions: { D1: "teacher-release", D2: "follows-D1", D3: "badge-only", D4: "no-runner-change", D5: "run-only-until-corrected", D6: "scenes-as-listed" },
    totals: {
      questions: questions.length, trace: count(q => q.trace), solve: count(q => q.solve), tryInput: count(q => q.tryInput),
      solveByClass: Object.fromEntries(Object.values(CHECK_CLASS).filter((v, i, a) => a.indexOf(v) === i).map(c => [c, count(q => q.solve === c)])),
      solveFromLab: count(q => q.solve && q.lab), scenes: SCENES.length,
    },
    scenes: SCENES, questions,
  };
}

function main() {
  const list = buildWorklist();
  writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  console.log(JSON.stringify(list.totals));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
