#!/usr/bin/env node
// AUTO-A13 (docs/enterprise-automata-lab-a4.md §19) — builds «مختبر الآلات»: the book's «صمّم الآلة» exercises of «الأتمتة» (899271) as
// ready exam questions in the Exam Library, one library item per batch of the book (units 2–4, 5–7, 8–9, 10), which a teacher assigns as
// homework in one step (the server freezes the item, reference machines included, into the assignment) or opens in the builder.
//   node scripts/build-899271-automata-lab.mjs
//
// Source: the course's own units (scripts/automata-course/uNN.mjs): every `DESIGN` (finite automaton, `automaton-design`) and
// `DESIGN_MACHINE` (push-down automaton / Turing machine, `machine-design`) activity, in reading order. For every exercise:
//   • the question is the exercise's own task — its statement, machine, alphabet, state limit, completeness / left end / mode / longest
//     word, and its example words — as an automatonDesign@1 / machineDesign@1 node; the PRIVATE key is the exercise's reference machine
//     (the book proves it: scripts/automata-course/automata-course.proof.test.ts), never served to a student;
//   • the node passes the shared validator (validateQuestionTypeNode — the same code the API finalizes with: the reference is read by
//     the book's engine and the example words are run on it);
//   • the API's own grader gives the reference FULL marks, and a machine with one state that accepts nothing — and, for a function, one
//     that halts at once without an answer — ZERO (the judge tells them apart; never shipped, test evidence only).
// Output: api/src/data/exam-library/items/AU899271-NN.json and their catalog entries (entries of other repositories are kept as they
// are, ours replace their predecessors in place). Pure JavaScript, no Docker: the build is deterministic (regenerating changes no byte).
// Exit 0 when every question passes, 1 otherwise.
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UNITS } from "./automata-course/index.mjs";
import { subsets } from "./automata-course/dsl.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LIBRARY_DIR = join(ROOT, "api", "src", "data", "exam-library");
export const REPOSITORY = "899271";
export const CATEGORY = "automata-899271";
export const MARKS = 10;
export const BUILT_AT = "2026-11-26T00:00:00.000Z";   // fixed: the build is deterministic
const { validateQuestionTypeNode } = require("../api/src/lib/shared-finalization/questionTypeValidation.js");
require("../api/src/lib/question-type-graders.js");   // registers the shared per-type validators (as the API does)
const { scoreAutomatonDesign } = require("../api/src/lib/automaton-design-grading.js");
const { scoreMachineDesign } = require("../api/src/lib/machine-design-grading.js");
const { evaluateAutomatonDesign } = require("../api/src/lib/learning-automaton-design.js");
const { evaluateExamFinalization } = require("../api/src/lib/shared-finalization/examFinalization.js");

/** The book's batches the library items follow (scripts/automata-course/index.mjs COURSE.batches). */
export const BATCHES = Object.freeze([
  { n: 1, units: [2, 3, 4], title: "الأوتومات المنتهي الحتمي", span: "الوحدات 2–4" },
  { n: 2, units: [5, 6, 7], title: "غير الحتمي واللغات المنتظمة", span: "الوحدات 5–7" },
  { n: 3, units: [8, 9], title: "أوتومات المكدّس", span: "الوحدتان 8–9", from: "الوحدتين 8–9" },
  { n: 4, units: [10], title: "آلة تورنغ", span: "الوحدة 10" },
]);
export const itemId = n => "AU899271-" + String(n).padStart(2, "0");
export const questionId = (n, i) => `${itemId(n)}-Q${String(i + 1).padStart(2, "0")}`;

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
/** Every «صمّم الآلة» activity of the course, in reading order: { unit, k (its number in the unit), activity }. */
export function readExercises(units = UNITS) {
  const out = [];
  units.forEach((u, i) => {
    let k = 0;
    const walk = v => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!isObj(v)) return;
      if (v.type === "simulation" && (v.simulationType === "automaton-design" || v.simulationType === "machine-design")) { out.push({ unit: i + 1, k: ++k, activity: v }); return; }
      for (const x of Object.values(v)) walk(x);
    };
    walk(u);
  });
  return out;
}

/** The statement as an exam states it: the book's pointers to its own pages («(السؤال 6)», «(تمرين ج من الشرائح)») are left out. */
export const questionText = intro => intro.replace(/\s*\((?:السؤال \d+|تمرين [^()]* من الشرائح)\)/g, "").trim();
const examplesOf = ex => (isObj(ex) && ((ex.accept?.length ?? 0) + (ex.reject?.length ?? 0)) > 0 ? { accept: [...(ex.accept ?? [])], reject: [...(ex.reject ?? [])] } : null);
const machineOf = ref => ({ states: [...ref.states], start: ref.start, accept: [...ref.accept], transitions: ref.transitions.map(t => (Array.isArray(t) ? [...t] : { ...t })) });

/** Is the finite automaton `m` itself a deterministic (and, when asked, complete) automaton over `alphabet`? */
export function obeysDfa(m, alphabet, complete) {
  const count = new Map();
  for (const [f, s] of m.transitions) { if (!alphabet.includes(s)) return false; count.set(f + " " + s, (count.get(f + " " + s) ?? 0) + 1); }
  return m.states.every(q => alphabet.every(s => { const c = count.get(q + " " + s) ?? 0; return c <= 1 && (!complete || c === 1); }));
}
/** The minimal complete DFA of `m` (the course's subset construction, then the classic partition refinement), states renamed
 *  q0, q1 … in breadth-first order from the start (the alphabet's order). */
export function minimalDfa(m, alphabet) {
  const d = subsets({ states: m.states, alphabet, start: m.start, accept: m.accept, transitions: m.transitions }, { complete: true });
  const delta = new Map(d.transitions.map(([f, s, t]) => [f + " " + s, t]));
  let block = new Map(d.states.map(q => [q, d.accept.includes(q) ? "A" : "R"]));
  for (let size = 0; ;) {
    const sig = q => block.get(q) + "|" + alphabet.map(s => block.get(delta.get(q + " " + s))).join(",");
    const names = new Map(), next = new Map();
    for (const q of d.states) { const k = sig(q); if (!names.has(k)) names.set(k, "b" + names.size); next.set(q, names.get(k)); }
    block = next;
    if (names.size === size) break;
    size = names.size;
  }
  const order = [block.get(d.start)], rep = new Map([[block.get(d.start), d.start]]);
  for (let i = 0; i < order.length; i++) for (const s of alphabet) {
    const b = block.get(delta.get(rep.get(order[i]) + " " + s));
    if (!rep.has(b)) { rep.set(b, delta.get(rep.get(order[i]) + " " + s)); order.push(b); }
  }
  const name = b => "q" + order.indexOf(b);
  return {
    states: order.map(name), start: "q0", accept: order.filter(b => d.accept.includes(rep.get(b))).map(name),
    transitions: order.flatMap(b => alphabet.map(s => [name(b), s, name(block.get(delta.get(rep.get(b) + " " + s)))])),
  };
}

/** One exercise as the library ships it. */
export function questionNode(n, i, { unit, k, activity }) {
  const task = activity.config.task;
  const head = {
    examQuestionId: questionId(n, i), origin: "imported", sourceId: itemId(n), sourceQuestionId: `u${String(unit).padStart(2, "0")}-design-${k}`,
    questionTypeVersion: 1, marks: MARKS, locked: false, text: questionText(task.intro),
  };
  const answer = { reference: machineOf(activity.config.reference) };
  if (activity.simulationType === "automaton-design") {
    // the book judges its exercise by the reference's LANGUAGE only, so a «complete DFA» exercise may keep a non-deterministic
    // reference; an exam's key is also the teacher's model answer — it obeys the question's own rules (judgeNode proves both)
    if (task.machine === "DFA" && !obeysDfa(answer.reference, task.alphabet, task.complete === true)) answer.reference = minimalDfa(answer.reference, task.alphabet);
    const examples = examplesOf(task.examples);
    return { ...head, presentationType: "automatonDesign",
      automatonDesign: { v: 1, machine: task.machine, alphabet: [...task.alphabet], maxStates: task.maxStates, ...(task.complete ? { complete: true } : {}), ...(examples ? { examples } : {}) }, answer };
  }
  const compute = task.mode === "compute";
  const examples = compute ? (task.examples?.compute?.length ? { compute: task.examples.compute.map(x => ({ word: x.word, output: x.answer })) } : null) : examplesOf(task.examples);
  return { ...head, presentationType: "machineDesign",
    machineDesign: { v: 1, machine: task.machine, ...(compute ? { mode: "compute" } : {}), alphabet: [...task.alphabet], maxStates: task.maxStates,
      ...(task.leftEnd ? { leftEnd: true } : {}), ...(task.maxLength ? { maxLength: task.maxLength } : {}), ...(examples ? { examples } : {}) }, answer };
}

/** Machines the judge must refuse: one state, nothing accepted (and, for a TM, one that halts at once). Never shipped. */
export function wrongMachines(node) {
  const one = { states: ["q0"], start: "q0", accept: [], transitions: [] };
  return node.presentationType === "machineDesign" && node.machineDesign.machine === "TM" ? [one, { ...one, accept: ["q0"] }] : [one];
}
/** The API's own grade of `machine` as the answer to `node`. */
export function gradeOf(node, machine) {
  const auto = node.presentationType === "automatonDesign";
  return (auto ? scoreAutomatonDesign : scoreMachineDesign)({
    config: auto ? node.automatonDesign : node.machineDesign, answerKey: node.answer, maxMarks: node.marks,
    response: { kind: node.presentationType, machine },
  });
}
/** The problems of one node (empty: valid, the reference earns full marks, the book's own reference — when the key is its
 *  minimal DFA — earns full marks under it too, i.e. the same language, and every wrong machine zero with a reason). */
export function judgeNode(node, bookReference) {
  const problems = validateQuestionTypeNode(node, node.presentationType, 1).filter(x => x.severity === "error").map(x => x.code + " " + (x.message || ""));
  if (problems.length) return problems;
  const ref = gradeOf(node, node.answer.reference);
  if (!(ref.correct === true && ref.score === MARKS && ref.manualReview === false)) problems.push("the reference does not earn full marks: " + JSON.stringify(ref));
  if (bookReference && JSON.stringify(bookReference) !== JSON.stringify(node.answer.reference)) {
    // the book's own judge, exactly: the two languages compared, under no rule but the alphabet
    const same = evaluateAutomatonDesign({ kind: "automaton-design", rules: { machine: "NFA", alphabet: node.automatonDesign.alphabet, maxStates: 12, complete: false }, reference: bookReference },
      { kind: "automaton-design", machine: node.answer.reference });
    if (!(same && same.status === "judged" && same.correct === true)) problems.push("the key is not the book reference's language: " + JSON.stringify(same));
  }
  wrongMachines(node).forEach((m, j) => {
    const g = gradeOf(node, m);
    if (!(g.score === 0 && g.correct === false && g.manualReview === false && (g.counterexample || g.issue))) problems.push("wrong machine " + j + " is not refused with a reason: " + JSON.stringify(g));
  });
  return problems;
}

const contentHash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const DESCRIPTION = {
  1: "يبني الطالب الأوتومات، ويقارن الخادم لغته بلغة الآلة النموذجية تمامًا",
  2: "يبني الطالب الأوتومات، ويقارن الخادم لغته بلغة الآلة النموذجية تمامًا",
  3: "يبني الطالب الآلة، ويشغّلها الخادم مع الآلة النموذجية على كل الكلمات حتى طول محدد",
  4: "يبني الطالب الآلة، ويشغّلها الخادم مع الآلة النموذجية على كل الكلمات حتى طول محدد؛ آلة لا تتوقف تذهب إلى مراجعة المعلم",
};
const COVER = n => ({
  enabled: true, activityType: "exam", subtitle: "«صمّم الآلة» — من كتاب «الأتمتة»",
  instructions: n <= 2
    ? "ابنِ في كل سؤال الأوتومات المطلوب: الحالات، وحالة البداية، وحالات القبول، والانتقالات — بالصفوف أو بالرسم بالفأرة. يقارن التصحيح لغة أوتوماتك بلغة الآلة النموذجية تمامًا: العلامة كاملة أو صفر."
    : "ابنِ في كل سؤال الآلة المطلوبة: الحالات، وحالة البداية، وحالات القبول، والانتقالات بترميز المادة — بالصفوف أو بالرسم بالفأرة. يشغّل التصحيح آلتك والآلة النموذجية على كل الكلمات حتى طول معيّن: اتفاقهما العلامة كاملة.",
  showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true,
});
/** One batch's library item + its catalog entry: a STRUCTURED exam (one section per unit of the book), so «فتح نسخة في الباني»
 *  opens it in the structured builder, where these question types live. */
export function libraryItem(batch, exercises, nodes, units = UNITS) {
  const id = itemId(batch.n);
  const title = "مختبر الآلات — " + batch.title + " (" + batch.span + ")";
  const sections = batch.units.map(u => ({
    id: "sec-u" + String(u).padStart(2, "0"), title: "الوحدة " + u + " — " + units[u - 1].title, gradingPolicy: "all",
    questions: nodes.filter((_, i) => exercises[i].unit === u),
  })).filter(sec => sec.questions.length);
  const examSnapshot = { schemaVersion: 2, examId: "LIB-" + id, title, status: "final", metadata: {}, coverPage: COVER(batch.n), presentation: { schemaVersion: 1, preset: "modernAcademic" }, sections };
  const entry = {
    libraryItemId: id, title, category: CATEGORY,
    description: "تمارين «صمّم الآلة» من " + (batch.from ?? batch.span) + " في «الأتمتة»: " + DESCRIPTION[batch.n] + ". العلامة كاملة أو صفر.",
    tags: ["الأتمتة", "صمّم الآلة", "تصحيح آلي"], questionCount: nodes.length, totalMarks: nodes.length * MARKS, pageRange: "", parserFamily: "automata-lab-899271-v1",
    conversionStatus: "ready", publishable: true, autoGradableCount: nodes.length, manualReviewCount: 0, libraryVersion: 1,
    sourceSha: contentHash(exercises.map(e => ({ unit: e.unit, k: e.k, title: e.activity.title, config: e.activity.config }))), contentHash: contentHash(examSnapshot), convertedAt: BUILT_AT,
    source: { repository: REPOSITORY, sourceFile: batch.units.map(u => "scripts/automata-course/u" + String(u).padStart(2, "0") + ".mjs").join(" ") },
  };
  return { entry, item: { ...entry, schemaVersion: 1, examSnapshot } };
}
/** The server's finalization authority on the item's exam (the same decision P6-E's import and governance take): its blockers. */
export function finalizationProblems(examSnapshot) {
  const d = evaluateExamFinalization(examSnapshot);
  return d.canFinalize === true ? [] : [...(d.structuralErrors ?? []).map(e => "structure: " + (e.code ?? e.id ?? "") + " " + (e.message ?? "")), ...(d.blockers ?? []).map(b => "blocker: " + (b.id ?? "") + " " + (b.message ?? ""))];
}

/** Every batch built: [{ batch, exercises, nodes, problems: [[questionId, problem]…], entry, item }]. */
export function buildLab(exercises = readExercises()) {
  return BATCHES.map(batch => {
    const mine = exercises.filter(e => batch.units.includes(e.unit));
    const nodes = mine.map((e, i) => questionNode(batch.n, i, e));
    const problems = nodes.flatMap((node, i) => judgeNode(node, mine[i].activity.config.reference).map(p => [node.examQuestionId, p]));
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
  const built = buildLab();
  let bad = 0;
  for (const b of built) {
    for (const [at, p] of b.problems.filter(([q]) => q === b.entry.libraryItemId)) { bad++; console.log(`✗ ${at}: ${p}`); }
    for (const node of b.nodes) {
      const p = b.problems.filter(([q]) => q === node.examQuestionId).map(([, x]) => x);
      if (p.length) { bad++; console.log(`✗ ${node.examQuestionId} (${node.sourceQuestionId}): ${p.join("; ")}`); }
      else console.log(`✓ ${node.examQuestionId} (${node.sourceQuestionId}, ${node.presentationType})`);
    }
  }
  if (bad) { console.log(`${bad} question(s) failed — library unchanged`); process.exit(1); }
  const items = join(LIBRARY_DIR, "items");
  for (const f of readdirSync(items).filter(f => f.startsWith("AU899271-"))) rmSync(join(items, f));
  for (const { item } of built) writeFileSync(join(items, item.libraryItemId + ".json"), JSON.stringify(item, null, 2));   // like the other items: no final newline
  const catalogPath = join(LIBRARY_DIR, "catalog.json");
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : [];
  writeFileSync(catalogPath, JSON.stringify(mergeCatalog(catalog, built.map(b => b.entry)), null, 2));
  console.log(`${built.length} library items, ${built.reduce((s, b) => s + b.nodes.length, 0)} questions`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
