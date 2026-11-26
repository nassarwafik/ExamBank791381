#!/usr/bin/env node
// AUTO-A14 (docs/enterprise-automata-lab-a4.md §20) — builds «أسئلة نظرية»: the book's short self-check exercises of «الأتمتة» (899271)
// as ready exam questions in the Exam Library, one library item per batch of the book (units 1, 2–4, 5–7, 8–9, 10, 11), which a teacher
// assigns as homework in one step (the server freezes the item, keys included, into the assignment) or opens in the structured builder.
//   node scripts/build-899271-automata-theory.mjs
//
// Source: the course's own build (scripts/build-automata-course.mjs → raw blocks, with their ids and pages): every `practice` block, in
// reading order. Each exercise becomes the platform type that asks the same thing, its key the book's own key:
//   multipleChoice → multipleChoice · trueFalse → trueFalse · shortInput → shortAnswer (an answer that is not the key exactly goes to the
//   teacher's review, never to zero) · classify → categorization@1 · matching → matching · ordering → ordering · wordBank → wordBank.
// Owner decision (2026-11-26): an exercise about «الأوتومات أعلاه» — the machine of the simulator above it on its page, the very machine
// the book's proof test proves its answer on — carries that machine IN the question: a rich stem with its transition table (the book's
// notation; the plain text keeps the same machine line by line), and «أعلاه» becomes «المعطى / المعطاة».
// Gates (the build writes nothing if one fails): every node passes the shared validator, every item the server's finalization; the
// API's grader gives the key full marks and a wrong answer less (proven in api/tests/automata-theory-899271.test.js, which also re-proves
// every `prove` answer on the machine the question now carries).
// Output: api/src/data/exam-library/items/AT899271-NN.json and their catalog entries (other sources' entries kept as they are, ours in
// place of their predecessors). Pure JavaScript, deterministic (regenerating changes no byte). Exit 0 when every item passes, 1 otherwise.
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCourse } from "./build-automata-course.mjs";
import { COURSE, UNITS } from "./automata-course/index.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LIBRARY_DIR = join(ROOT, "api", "src", "data", "exam-library");
export const REPOSITORY = "899271-theory";   // its own key: the machine lab (scripts/build-899271-automata-lab.mjs) owns "899271"
export const CATEGORY = "theory-899271";
export const BUILT_AT = "2026-11-26T00:00:00.000Z";
/** Marks: a single choice or a single answer 1; a question of several parts (graded part by part) 2. */
export const MARKS = Object.freeze({ multipleChoice: 1, trueFalse: 1, shortAnswer: 1, categorization: 2, matching: 2, ordering: 2, wordBank: 2 });
const { validateQuestionTypeNode } = require("../api/src/lib/shared-finalization/questionTypeValidation.js");
require("../api/src/lib/question-type-graders.js");
const { evaluateExamFinalization } = require("../api/src/lib/shared-finalization/examFinalization.js");

/** The book's batches (COURSE.batches): one item each. */
export const BATCHES = Object.freeze(COURSE.batches.map((b, i) => Object.freeze({ n: i + 1, id: b.id, title: b.label, units: [...b.units] })));
export const itemId = n => "AT899271-" + String(n).padStart(2, "0");
export const questionId = (n, i) => `${itemId(n)}-Q${String(i + 1).padStart(2, "0")}`;
const span = units => (units.length === 1 ? "الوحدة " + units[0] : "الوحدات " + units[0] + "–" + units[units.length - 1]);

/** Every practice exercise of the course in reading order, with the machine of the simulator above it on its page (as the proof test). */
export function readExercises(raw = buildCourse().raw) {
  const out = [];
  raw.forEach((r, at) => {
    if (r.block.type !== "practice" || !r.block.question) return;
    const above = raw.slice(0, at).reverse().find(x => x.pageId === r.pageId && x.block.type === "simulation" && x.block.simulationType === "automaton-trace");
    out.push({ unit: r.unit, pageId: r.pageId, id: r.block.id, question: r.block.question, prove: r.block._prove ?? null, machine: above ? above.block.config.automaton : null });
  });
  return out;
}

const ABOVE = /أعلاه/;
/** The statement as an exam states it: «للبندين أ و ج:» (the book's own item letters) dropped; «أعلاه» → the machine the question gives. */
export function statement(prompt) {
  const s = prompt.replace(/^للبندين [^:]+:\s*/, "").replace(/أوتومات أعلاه/g, "أوتومات المعطى").replace(/الآلة أعلاه/g, "الآلة المعطاة").trim();
  if (ABOVE.test(s)) throw new Error("«أعلاه» left in: " + prompt);
  return s;
}

const OP = { push: "ادفع", pop: "اسحب", none: "بلا تغيير" };
/** A transition in the book's notation (PDA «ادفع a,⏊/S», TM «a/A,R»). */
export const arrowLabel = (kind, t) => (kind === "PDA" ? `${OP[t.op]} ${t.read},${t.top}/${t.write}` : `${t.read}/${t.write},${t.move}`);
const mark = (m, q) => (q === m.start ? "→ " : "") + q + (m.accept.includes(q) ? " *" : "");
/** The machine as a table (rich) and as lines (plain text): finite automata as δ (a row per state, a column per symbol); push-down and
 *  Turing machines as their arrows (from, the label, to) and the list of their states. «→» marks the start, «*» an accepting state.
 *  The caption is Arabic and the legend only; a state («→ q0 *», left to right) never sits inside Arabic text without its own direction:
 *  in the rich stem each one is its own left-to-right run (a <bdi>), so «*» stays with its state on a right-to-left page. */
export function machineTable(m) {
  const legend = "«→» حالة البداية، «*» حالة قبول";
  if (m.kind === "DFA" || m.kind === "NFA") {
    const symbols = [...m.alphabet, ...(m.transitions.some(t => t[1] === "ε") ? ["ε"] : [])];
    const cell = (q, s) => { const to = m.transitions.filter(t => t[0] === q && t[1] === s).map(t => t[2]); return to.length ? to.join("، ") : (m.kind === "NFA" ? "∅" : "—"); };
    return {
      caption: (m.kind === "DFA" ? "أوتومات منتهٍ حتمي" : "أوتومات منتهٍ غير حتمي") + " — جدول الانتقالات δ؛ " + legend,
      columnHeaders: ["الحالة", ...symbols], rows: m.states.map(q => [mark(m, q), ...symbols.map(s => cell(q, s))]), states: null,
    };
  }
  const extra = m.kind === "TM" ? "؛ " + (m.leftEnd ? "الكلمة مكتوبة بعد ├ والرأس على أول رموزها" : "الرأس على أول رموز الكلمة") + "، ∆ الخانة الفارغة" : "؛ ⏊ قاع المكدّس";
  return {
    caption: (m.kind === "PDA" ? "أوتومات مكدّس" : "آلة تورنغ") + " — الانتقالات؛ " + legend + extra,
    columnHeaders: ["من", "الانتقال", "إلى"], rows: m.transitions.map(t => [mark(m, t.from), arrowLabel(m.kind, t), mark(m, t.to)]),
    states: m.states.map(q => mark(m, q)),
  };
}
const tableText = t => [t.caption, ...(t.states ? ["الحالات: " + t.states.join("، ")] : []), t.columnHeaders.join(" | "), ...t.rows.map(r => r.join(" | "))].join("\n");
/** The rich blocks of a machine: its table, and (push-down / Turing) the paragraph of its states, each state its own LTR run. */
export function machineBlocks(t) {
  const { states, ...table } = t;
  const blocks = [{ type: "table", ...table, responsive: "scroll" }];
  if (states) blocks.push({ type: "paragraph", runs: [{ text: "الحالات: " }, ...states.flatMap((q, k) => [...(k ? [{ text: "، " }] : []), { text: q, dir: "ltr" }])] });
  return blocks;
}
const para = text => ({ type: "paragraph", runs: [{ text }] });

/** One exercise as the library ships it. */
export function questionNode(n, i, ex) {
  const q = ex.question;
  let text = statement(q.prompt), type, body;
  switch (q.kind) {
    case "multipleChoice": {
      const correct = q.options.map((o, k) => (o.correct ? k : -1)).filter(k => k >= 0);
      if (correct.length !== 1) throw new Error(ex.id + ": a multiple choice with " + correct.length + " correct options");
      type = "multipleChoice"; body = { options: q.options.map(o => ({ text: o.text })), answer: { correctOptionIndex: correct[0] } };
      break;
    }
    case "trueFalse":
      type = "trueFalse"; body = { options: [{ text: "صحيح" }, { text: "غير صحيح" }], answer: { correctOptionIndex: q.answer === true ? 0 : 1 } };
      break;
    case "shortInput":
      type = "shortAnswer"; body = { answer: { text: String(q.answer) } };
      break;
    case "classify":
      type = "categorization";
      body = { questionTypeVersion: 1, categorization: { categories: q.groups.map(g => ({ id: g.id, label: g.text })), items: q.items.map(it => ({ id: it.id, label: it.text })) }, answer: { correctCategoryByItem: { ...q.assign } } };
      break;
    case "matching": {
      const right = q.right.map(r => r.text), byId = Object.fromEntries(q.right.map(r => [r.id, r.text]));
      type = "matching";
      const fields = q.left.map(l => ({ id: l.id, label: l.text, kind: "select", options: right.map(t => ({ text: t })), correct: byId[q.pairs[l.id]] }));
      // the grader reads the fields (part by part); answer.text is the pair list the platform's matching key also carries
      body = { fields, answer: { text: fields.map(f => f.label + "=" + f.correct).join(";") } };
      break;
    }
    case "ordering": {
      const byId = Object.fromEntries(q.items.map(it => [it.id, it.text])), values = q.order.map(id => byId[id]);
      type = "ordering";
      body = { fields: values.map((v, k) => ({ id: "o" + (k + 1), label: "الخطوة " + (k + 1), correct: v })), wordBank: q.items.map(it => it.text), answer: { mode: "exactSequence", values } };
      break;
    }
    case "wordBank": {
      const blanks = q.segments.filter(s => typeof s !== "string").map(s => s.blank);
      text = text + "\n" + q.segments.map(s => (typeof s === "string" ? s : "____")).join("");
      type = "wordBank";
      body = { wordBank: [...q.bank], fields: blanks.map((b, k) => ({ id: b, label: "الفراغ " + (k + 1), correct: q.answers[b] })), answer: { values: blanks.map(b => q.answers[b]) } };
      break;
    }
    default: throw new Error(ex.id + ": unknown exercise kind " + q.kind);
  }
  const node = { examQuestionId: questionId(n, i), origin: "imported", sourceId: itemId(n), sourceQuestionId: ex.id, presentationType: type, marks: MARKS[type], text };
  if (ABOVE.test(q.prompt)) {
    if (!ex.machine) throw new Error(ex.id + ": «أعلاه» with no machine above it on its page");
    const t = machineTable(ex.machine);
    node.text = text + "\n\n" + tableText(t);
    node.richContent = { schemaVersion: 1, blocks: [para(text), ...machineBlocks(t)] };
  }
  return { ...node, ...body };
}

/** The problems of one node under the shared validator (empty: valid). */
export function validatorProblems(node) {
  return validateQuestionTypeNode(node, node.presentationType, node.questionTypeVersion ?? 1).filter(x => x.severity === "error").map(x => x.code + " " + (x.message || ""));
}
/** The server's finalization authority on an item's exam: its blockers. */
export function finalizationProblems(examSnapshot) {
  const d = evaluateExamFinalization(examSnapshot);
  return d.canFinalize === true ? [] : [...(d.structuralErrors ?? []).map(e => "structure: " + (e.code ?? e.id ?? "") + " " + (e.message ?? "")), ...(d.blockers ?? []).map(b => "blocker: " + (b.id ?? "") + " " + (b.message ?? ""))];
}

const contentHash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const COVER = {
  enabled: true, activityType: "exam", subtitle: "أسئلة نظرية — من كتاب «الأتمتة»",
  instructions: "أجب عن كل سؤال. في الأسئلة التي تعطي آلة، الآلة معطاة بجدول انتقالاتها: «→» حالة البداية، «*» حالة قبول. الإجابة القصيرة التي لا تطابق المفتاح حرفيًا تذهب إلى مراجعة المعلم.",
  showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true,
};
/** One batch's library item + its catalog entry: a STRUCTURED exam, one section per unit. */
export function libraryItem(batch, exercises, nodes, units = UNITS) {
  const id = itemId(batch.n), title = "أسئلة نظرية — " + batch.title + " (" + span(batch.units) + ")";
  const sections = batch.units.map(u => ({
    id: "sec-u" + String(u).padStart(2, "0"), title: "الوحدة " + u + " — " + units[u - 1].title, gradingPolicy: "all",
    questions: nodes.filter((_, i) => exercises[i].unit === u),
  })).filter(s => s.questions.length);
  const totalMarks = nodes.reduce((s, q) => s + q.marks, 0);
  const examSnapshot = { schemaVersion: 2, examId: "LIB-" + id, title, status: "final", metadata: {}, coverPage: COVER, presentation: { schemaVersion: 1, preset: "modernAcademic" }, sections };
  const entry = {
    libraryItemId: id, title, category: CATEGORY,
    description: "أسئلة التدريب الذاتي من " + span(batch.units) + " في «الأتمتة»: اختيار من متعدد، صح أو خطأ، تصنيف، ترتيب، مطابقة وإجابة قصيرة؛ الآلة التي يسأل عنها السؤال معطاة بجدول انتقالاتها.",
    tags: ["الأتمتة", "أسئلة نظرية", "تصحيح آلي"], questionCount: nodes.length, totalMarks, pageRange: "", parserFamily: "automata-theory-899271-v1",
    conversionStatus: "ready", publishable: true, autoGradableCount: nodes.length, manualReviewCount: 0, libraryVersion: 1,
    sourceSha: contentHash(exercises.map(e => ({ id: e.id, question: e.question, machine: e.machine }))), contentHash: contentHash(examSnapshot), convertedAt: BUILT_AT,
    source: { repository: REPOSITORY, sourceFile: batch.units.map(u => "scripts/automata-course/u" + String(u).padStart(2, "0") + ".mjs").join(" ") },
  };
  return { entry, item: { ...entry, schemaVersion: 1, examSnapshot } };
}

/** Every batch built: [{ batch, exercises, nodes, problems, entry, item }]. */
export function buildTheory(exercises = readExercises()) {
  return BATCHES.map(batch => {
    const mine = exercises.filter(e => batch.units.includes(e.unit));
    const nodes = mine.map((e, i) => questionNode(batch.n, i, e));
    const problems = nodes.flatMap(node => validatorProblems(node).map(p => [node.examQuestionId, p]));
    const built = libraryItem(batch, mine, nodes);
    problems.push(...finalizationProblems(built.item.examSnapshot).map(p => [built.entry.libraryItemId, p]));
    return { batch, exercises: mine, nodes, problems, ...built };
  });
}

/** The catalog with our entries: in place of their predecessors, else after everything else. */
export function mergeCatalog(catalog, entries) {
  const at = catalog.findIndex(e => e?.source?.repository === REPOSITORY);
  const others = catalog.filter(e => e?.source?.repository !== REPOSITORY);
  if (at < 0) return [...others, ...entries];
  const before = catalog.slice(0, at).filter(e => e?.source?.repository !== REPOSITORY).length;
  return [...others.slice(0, before), ...entries, ...others.slice(before)];
}

function main() {
  const built = buildTheory();
  let bad = 0;
  for (const b of built) {
    for (const [at, p] of b.problems) { bad++; console.log(`✗ ${at}: ${p}`); }
    console.log(`${b.problems.length ? "✗" : "✓"} ${b.entry.libraryItemId} — ${b.nodes.length} questions, ${b.entry.totalMarks} marks`);
  }
  if (bad) { console.log(`${bad} problem(s) — library unchanged`); process.exit(1); }
  const items = join(LIBRARY_DIR, "items");
  for (const f of readdirSync(items).filter(f => f.startsWith("AT899271-"))) rmSync(join(items, f));
  for (const { item } of built) writeFileSync(join(items, item.libraryItemId + ".json"), JSON.stringify(item, null, 2));
  const catalogPath = join(LIBRARY_DIR, "catalog.json");
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : [];
  writeFileSync(catalogPath, JSON.stringify(mergeCatalog(catalog, built.map(b => b.entry)), null, 2));
  console.log(`${built.length} library items, ${built.reduce((s, b) => s + b.nodes.length, 0)} questions`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
