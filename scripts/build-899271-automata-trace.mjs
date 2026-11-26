#!/usr/bin/env node
// AUTO-A15b (docs/enterprise-automata-lab-a4.md §23) — builds «تتبّع الآلات»: ready machineTrace@1 questions from the book's own simulators
// («الأتمتة», 899271), one library item per batch of the book, which a teacher assigns as homework in one step or opens in the structured builder.
//   node scripts/build-899271-automata-trace.mjs
//
// Source: the course's own build (scripts/build-automata-course.mjs → raw blocks). Every `automaton-trace` simulator becomes one question:
// its machine (the simulator's own `automaton`, canonical keys only — never its display labels) and its first word (the word the book loads
// first). A simulator whose machine and word repeat an earlier one is left out (one question each); one whose run on its word is longer than
// the contract's limit (or does not end) is left out — the contract's own validation decides. Owner decision (2026-11-26): a new category
// «تتبّع الآلات · الأتمتة», one exam per batch.
// Gates (the build writes nothing if one fails): every node passes the shared validator, every item the server's finalization.
// Output: api/src/data/exam-library/items/TR899271-NN.json and their catalog entries (source "899271-trace": the machine lab owns "899271",
// the theory exams "899271-theory"; each build keeps the others' entries). Pure JavaScript, deterministic. Exit 0 / 1.
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
export const REPOSITORY = "899271-trace";
export const CATEGORY = "trace-899271";
export const MARKS = 4;
export const BUILT_AT = "2026-11-26T00:00:00.000Z";
const { validateQuestionTypeNode } = require("../api/src/lib/shared-finalization/questionTypeValidation.js");
require("../api/src/lib/question-type-graders.js");
const { evaluateExamFinalization } = require("../api/src/lib/shared-finalization/examFinalization.js");
const { validateMachineTraceConfig } = require("../api/src/lib/shared-finalization/machineTraceQuestion.js");

const KEYS = Object.freeze({
  DFA: ["kind", "states", "alphabet", "start", "accept", "transitions"], NFA: ["kind", "states", "alphabet", "start", "accept", "transitions"],
  PDA: ["kind", "states", "alphabet", "start", "accept", "transitions", "bottom", "stackAlphabet"], TM: ["kind", "states", "alphabet", "start", "accept", "transitions", "blank", "tapeAlphabet", "leftEnd"],
});
const KIND_TEXT = Object.freeze({ DFA: "الأوتومات المنتهي الحتمي المعطى", NFA: "الأوتومات المنتهي غير الحتمي المعطى", PDA: "أوتومات المكدّس المعطى", TM: "آلة تورنغ المعطاة" });
const FIELDS = Object.freeze({ DFA: "الحالة بعد قراءة كل رمز", NFA: "مجموعة الحالات بعد قراءة كل رمز", PDA: "الحالة ومحتوى المكدّس من القاع إلى القمة بعد كل رمز", TM: "الحالة والشريط وموضع الرأس بعد كل خطوة" });
export const BATCHES = Object.freeze(COURSE.batches.map((b, i) => Object.freeze({ n: i + 1, title: b.label, units: [...b.units] })));
const span = units => (units.length === 1 ? "الوحدة " + units[0] : "الوحدات " + units[0] + "–" + units[units.length - 1]);

/** The machine of a simulator, canonical keys only (its display labels dropped). */
export function machineOfSim(automaton) {
  const kind = automaton.kind === "eNFA" ? "NFA" : automaton.kind;
  return JSON.parse(JSON.stringify({ ...Object.fromEntries(KEYS[kind].filter(k => k in automaton).map(k => [k, automaton[k]])), kind }));
}
/** Every simulator of the course in reading order → { unit, id, title, machine, word, ok, reason }; repeats marked. */
export function readSimulators(raw = buildCourse().raw) {
  const seen = new Set(), out = [];
  for (const r of raw) {
    if (r.block.type !== "simulation" || r.block.simulationType !== "automaton-trace") continue;
    const cfg = r.block.config;
    const machine = machineOfSim(cfg.automaton);
    const word = typeof cfg.word === "string" ? cfg.word : (Array.isArray(cfg.words) && typeof cfg.words[0] === "string" ? cfg.words[0] : "");
    const key = JSON.stringify([machine, word]);
    const repeat = seen.has(key);
    seen.add(key);
    const v = validateMachineTraceConfig({ v: 1, machine, word });
    out.push({ unit: r.unit, id: r.block.id, title: typeof r.block.title === "string" ? r.block.title : "", machine, word, ok: !repeat && v.ok, reason: repeat ? "repeat" : v.ok ? null : v.issues[0].code });
  }
  return out;
}
export const itemId = k => "TR899271-" + String(k).padStart(2, "0");
export const questionId = (k, i) => `${itemId(k)}-Q${String(i + 1).padStart(2, "0")}`;

/** One simulator as the library ships it. */
export function questionNode(k, i, s) {
  const shown = s.word === "" ? "ε (الكلمة الفارغة)" : s.word;
  // a title that is itself the task («آلة awb: تتبّع الكلمة abb», «تتبّع الآلة خطوة بخطوة») keeps only its name before «:», or nothing
  const title = s.title.includes("تتبّع") ? (s.title.includes(":") ? s.title.split(":")[0].trim() : "") : s.title;
  const text = (title ? title + " — " : "") + "تتبّع تشغيل " + KIND_TEXT[s.machine.kind] + " على الكلمة " + shown + ": اكتب سطرًا للبداية ثم سطرًا لكل خطوة (" + FIELDS[s.machine.kind] + ")، ثم النتيجة.";
  return { examQuestionId: questionId(k, i), origin: "imported", sourceId: itemId(k), sourceQuestionId: s.id, presentationType: "machineTrace", questionTypeVersion: 1, marks: MARKS, text,
    machineTrace: { v: 1, machine: s.machine, word: s.word }, answer: {} };
}
export const validatorProblems = node => validateQuestionTypeNode(node, "machineTrace", 1).filter(x => x.severity === "error").map(x => x.code + " " + (x.message || ""));
export function finalizationProblems(examSnapshot) {
  const d = evaluateExamFinalization(examSnapshot);
  return d.canFinalize === true ? [] : [...(d.structuralErrors ?? []).map(e => "structure: " + (e.code ?? e.id ?? "") + " " + (e.message ?? "")), ...(d.blockers ?? []).map(b => "blocker: " + (b.id ?? "") + " " + (b.message ?? ""))];
}
const contentHash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const COVER = {
  enabled: true, activityType: "exam", subtitle: "تتبّع تشغيل الآلات — من كتاب «الأتمتة»",
  instructions: "في كل سؤال آلة معطاة بجدول انتقالاتها («→» حالة البداية، «*» حالة قبول) وكلمة: اكتب سطر البداية ثم سطرًا لكل خطوة، ثم النتيجة. كل سطر صحيح يأخذ جزءًا من العلامة، والخطأ لا يُحسب مرتين.",
  showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true,
};
export function libraryItem(k, batch, sims, nodes, units = UNITS) {
  const id = itemId(k), title = "تتبّع الآلات — " + batch.title + " (" + span(batch.units) + ")";
  const sections = batch.units.map(u => ({ id: "sec-u" + String(u).padStart(2, "0"), title: "الوحدة " + u + " — " + units[u - 1].title, gradingPolicy: "all", questions: nodes.filter((_, i) => sims[i].unit === u) })).filter(s => s.questions.length);
  const examSnapshot = { schemaVersion: 2, examId: "LIB-" + id, title, status: "final", metadata: {}, coverPage: COVER, presentation: { schemaVersion: 1, preset: "modernAcademic" }, sections };
  const entry = {
    libraryItemId: id, title, category: CATEGORY,
    description: "تتبّع تشغيل آلات " + span(batch.units) + " في «الأتمتة» — آلات محاكيات الكتاب نفسها، كل آلة على كلمتها: سطرًا سطرًا ثم النتيجة؛ علامة جزئية والخطأ لا يُحسب مرتين.",
    tags: ["الأتمتة", "تتبّع", "تصحيح آلي"], questionCount: nodes.length, totalMarks: nodes.length * MARKS, pageRange: "", parserFamily: "automata-trace-899271-v1",
    conversionStatus: "ready", publishable: true, autoGradableCount: nodes.length, manualReviewCount: 0, libraryVersion: 1,
    sourceSha: contentHash(sims.map(s => ({ id: s.id, machine: s.machine, word: s.word }))), contentHash: contentHash(examSnapshot), convertedAt: BUILT_AT,
    source: { repository: REPOSITORY, sourceFile: batch.units.map(u => "scripts/automata-course/u" + String(u).padStart(2, "0") + ".mjs").join(" ") },
  };
  return { entry, item: { ...entry, schemaVersion: 1, examSnapshot } };
}
/** Every batch that has simulators, numbered in order. */
export function buildTrace(sims = readSimulators()) {
  const kept = sims.filter(s => s.ok);
  let k = 0;
  return BATCHES.map(batch => ({ batch, mine: kept.filter(s => batch.units.includes(s.unit)) })).filter(b => b.mine.length).map(({ batch, mine }) => {
    k++;
    const nodes = mine.map((s, i) => questionNode(k, i, s));
    const problems = nodes.flatMap(n => validatorProblems(n).map(p => [n.examQuestionId, p]));
    const built = libraryItem(k, batch, mine, nodes);
    problems.push(...finalizationProblems(built.item.examSnapshot).map(p => [built.entry.libraryItemId, p]));
    return { batch, sims: mine, nodes, problems, ...built };
  });
}
export function mergeCatalog(catalog, entries) {
  const at = catalog.findIndex(e => e?.source?.repository === REPOSITORY);
  const others = catalog.filter(e => e?.source?.repository !== REPOSITORY);
  if (at < 0) return [...others, ...entries];
  const before = catalog.slice(0, at).filter(e => e?.source?.repository !== REPOSITORY).length;
  return [...others.slice(0, before), ...entries, ...others.slice(before)];
}
function main() {
  const built = buildTrace();
  let bad = 0;
  for (const b of built) {
    for (const [at, p] of b.problems) { bad++; console.log(`✗ ${at}: ${p}`); }
    console.log(`${b.problems.length ? "✗" : "✓"} ${b.entry.libraryItemId} — ${b.nodes.length} questions`);
  }
  if (bad) { console.log(`${bad} problem(s) — library unchanged`); process.exit(1); }
  const items = join(LIBRARY_DIR, "items");
  for (const f of readdirSync(items).filter(f => f.startsWith("TR899271-"))) rmSync(join(items, f));
  for (const { item } of built) writeFileSync(join(items, item.libraryItemId + ".json"), JSON.stringify(item, null, 2));
  const catalogPath = join(LIBRARY_DIR, "catalog.json");
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : [];
  writeFileSync(catalogPath, JSON.stringify(mergeCatalog(catalog, built.map(b => b.entry)), null, 2));
  console.log(`${built.length} library items, ${built.reduce((s, b) => s + b.nodes.length, 0)} questions`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
