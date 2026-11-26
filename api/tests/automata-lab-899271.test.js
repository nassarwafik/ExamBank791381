import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// AUTO-A13 (docs/enterprise-automata-lab-a4.md §19) — «مختبر الآلات»: the 21 «صمّم الآلة» exercises of the book «الأتمتة» (899271) as
// ready exam questions, shipped as 4 Exam Library items AU899271-01…04 (one per batch of the book: units 2–4, 5–7, 8–9, 10) that a
// teacher assigns as homework in one step or opens in the structured builder. This suite proves:
//   • the shipped items are EXACTLY what the builder makes from the course's own units (no hand edit, regenerating changes no byte);
//   • every node is a valid automatonDesign@1 / machineDesign@1 question of the shared validator, and every item a finalizable
//     structured exam under the server's own authority;
//   • the key is a model answer the question's own rules accept — the API's grader gives it full marks — and where the book keeps a
//     non-deterministic reference for a «complete DFA» exercise (unit 3), the key is its minimal complete DFA, proven the SAME language
//     by the book's own judge;
//   • a machine that accepts nothing (and, for a Turing machine, one that halts at once) scores ZERO with a reason;
//   • the student view carries no reference machine;
//   • end to end: a teacher assigns the item by `libraryRef`; the server freezes it, keys included; the official grader gives a student
//     whose machines are the references under OTHER state names full marks, and empty machines zero.
const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "a13-automata-lab-test-only-root-secret";   // TEST value — never a real secret
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const ROOT = path.join(__dirname, "..", "..");
const LIB = path.join(ROOT, "api", "src", "data", "exam-library");
const B = await import("../../scripts/build-899271-automata-lab.mjs");
const { validateQuestionTypeNode } = cjs("../src/lib/shared-finalization/questionTypeValidation.js");
const { evaluateExamFinalization } = cjs("../src/lib/shared-finalization/examFinalization.js");
const { sanitizeExamForStudent } = cjs("../src/lib/student-exam-sanitize.js");
const { readLibraryCatalog, readLibraryItem } = cjs("../src/lib/exam-library-store.js");
const { gradeExam } = cjs("../src/lib/assignment-grading.js");
const { examOfficialStats } = cjs("../src/lib/exam-structure.js");
const { evaluateAutomatonDesign } = cjs("../src/lib/learning-automaton-design.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");

const IDS = ["AU899271-01", "AU899271-02", "AU899271-03", "AU899271-04"];
const readItem = id => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
const catalogFile = () => JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8"));
const questionsOf = item => item.examSnapshot.sections.flatMap(s => s.questions);
const exercises = B.readExercises();
const built = B.buildLab(exercises);

describe("AUTO-A13 — the shipped automata lab is exactly the build of the course's units", () => {
  it("21 exercises (units 2–10) → 4 items AU899271-01…04 of 4 / 6 / 4 / 7 questions, one section per unit; each catalog entry is the item's own header", () => {
    expect(exercises.map(e => e.unit)).toEqual([2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10, 10, 10, 10]);
    expect(fs.readdirSync(path.join(LIB, "items")).filter(f => f.startsWith("AU899271-")).sort()).toEqual(IDS.map(id => id + ".json"));
    const ours = catalogFile().filter(e => e.source?.repository === B.REPOSITORY);
    expect(ours.map(e => e.libraryItemId)).toEqual(IDS);
    expect(catalogFile().slice(-4)).toEqual(ours);   // after every other source's entries
    const counts = [];
    for (const entry of ours) {
      const item = readItem(entry.libraryItemId);
      const { schemaVersion, examSnapshot, ...header } = item;
      expect([schemaVersion, header], entry.libraryItemId).toEqual([1, entry]);
      const n = questionsOf(item).length;
      counts.push(n);
      expect(entry).toMatchObject({ category: "automata-899271", publishable: true, conversionStatus: "ready", autoGradableCount: n, manualReviewCount: 0, questionCount: n, totalMarks: 10 * n });
      expect(examSnapshot.schemaVersion).toBe(2);
      expect(examSnapshot.sections.map(s => s.id)).toEqual(B.BATCHES.find(b => B.itemId(b.n) === entry.libraryItemId).units.map(u => "sec-u" + String(u).padStart(2, "0")));
    }
    expect(counts).toEqual([4, 6, 4, 7]);
  });

  it("regenerating from the course's units changes no byte of any item or catalog entry", () => {
    const catalog = catalogFile();
    for (const b of built) {
      expect(b.problems, b.entry.libraryItemId).toEqual([]);
      expect(JSON.stringify(b.item, null, 2), b.entry.libraryItemId).toBe(fs.readFileSync(path.join(LIB, "items", b.entry.libraryItemId + ".json"), "utf8"));
      expect(catalog.find(e => e.libraryItemId === b.entry.libraryItemId), b.entry.libraryItemId).toEqual(b.entry);
    }
    expect(B.mergeCatalog(catalog, built.map(b => b.entry))).toEqual(catalog);   // the build puts its entries back where they are
  });

  it("the catalog merge keeps every other source's entries as they are, ours in place of their predecessors, else last", () => {
    const x = id => ({ libraryItemId: id, source: { repository: "other" } }), ours = id => ({ libraryItemId: id, source: { repository: B.REPOSITORY } });
    expect(B.mergeCatalog([x("a"), x("b")], [ours("n1"), ours("n2")]).map(e => e.libraryItemId)).toEqual(["a", "b", "n1", "n2"]);
    expect(B.mergeCatalog([x("a"), ours("o1"), ours("o2"), x("b")], [ours("n1")]).map(e => e.libraryItemId)).toEqual(["a", "n1", "b"]);
    expect(B.mergeCatalog([ours("o1"), x("a")], [ours("n1"), ours("n2")]).map(e => e.libraryItemId)).toEqual(["n1", "n2", "a"]);
  });

  it("every question is the exercise's own task: its statement (without the book's page pointers), machine, alphabet and rules", () => {
    const all = IDS.flatMap(id => questionsOf(readItem(id)));
    expect(all.map(q => q.examQuestionId)).toEqual(built.flatMap(b => b.nodes.map(n => n.examQuestionId)));
    all.forEach((q, i) => {
      const { unit, k, activity } = exercises[i], task = activity.config.task;
      expect(q.sourceQuestionId).toBe(`u${String(unit).padStart(2, "0")}-design-${k}`);
      expect(q.text).toBe(B.questionText(task.intro));
      expect(q).toMatchObject({ origin: "imported", marks: 10, questionTypeVersion: 1 });
      const cfg = q.automatonDesign ?? q.machineDesign;
      expect([cfg.machine, cfg.alphabet, cfg.maxStates], q.examQuestionId).toEqual([task.machine, task.alphabet, task.maxStates]);
    });
    expect(all.map(q => q.presentationType)).toEqual([...Array(10).fill("automatonDesign"), ...Array(11).fill("machineDesign")]);
    expect(all.filter(q => /السؤال \d|من الشرائح/.test(q.text))).toEqual([]);
    expect(all.find(q => q.sourceQuestionId === "u08-design-2").text).toBe("صمّم أوتومات مكدّس حتميًا يقبل اللغة {(ab)ⁿbⁿ | 0 ≤ n}.");
    expect(all.find(q => q.sourceQuestionId === "u10-design-4").text).toBe("صمّم آلة تورنغ تقبل اللغة {w | w ∈ {a,b}*، w = R(w)}.");
    // a function's examples become {word, output} (the student sanitizer removes every key named «answer»)
    expect(all.find(q => q.sourceQuestionId === "u10-design-5").machineDesign).toEqual({ v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, maxLength: 10, examples: { compute: [{ word: "111", output: "11111" }, { word: "", output: "11" }] } });
  });

  it("every node is valid under the shared validator, and every item is a finalizable structured exam under the server's authority", () => {
    for (const id of IDS) {
      const item = readItem(id);
      for (const q of questionsOf(item)) expect(validateQuestionTypeNode(q, q.presentationType, 1).filter(x => x.severity === "error"), q.examQuestionId).toEqual([]);
      const d = evaluateExamFinalization(item.examSnapshot);
      expect([d.canFinalize, d.blockers.map(b => b.message)], id).toEqual([true, []]);
      expect(examOfficialStats(item.examSnapshot).totalMarks, id).toBe(item.totalMarks);
    }
  });

  it("the key obeys the question's rules — the API's grader gives it full marks; a machine that accepts nothing (or halts at once) scores 0 with a reason", () => {
    for (const id of IDS) for (const q of questionsOf(readItem(id))) {
      expect(B.gradeOf(q, q.answer.reference), q.examQuestionId).toMatchObject({ score: 10, correct: true, manualReview: false });
      for (const m of B.wrongMachines(q)) {
        const g = B.gradeOf(q, m);
        expect([g.score, g.correct, g.manualReview, !!(g.counterexample || g.issue)], q.examQuestionId).toEqual([0, false, false, true]);
      }
    }
  });

  it("unit 3's two «complete DFA» exercises: the book's reference is non-deterministic; the key is its minimal complete DFA, the same language by the book's judge", () => {
    const converted = [];
    exercises.forEach((e, i) => {
      const q = IDS.flatMap(id => questionsOf(readItem(id)))[i];
      const book = e.activity.config.reference;
      if (JSON.stringify(book) === JSON.stringify(q.answer.reference)) return;
      converted.push(q.sourceQuestionId);
      expect(B.obeysDfa(book, q.automatonDesign.alphabet, true), q.examQuestionId).toBe(false);
      expect(B.obeysDfa(q.answer.reference, q.automatonDesign.alphabet, true), q.examQuestionId).toBe(true);
      const v = evaluateAutomatonDesign({ kind: "automaton-design", rules: { machine: "NFA", alphabet: q.automatonDesign.alphabet, maxStates: 12, complete: false }, reference: book }, { kind: "automaton-design", machine: q.answer.reference });
      expect([v.status, v.correct], q.examQuestionId).toEqual(["judged", true]);
    });
    expect(converted).toEqual(["u03-design-1", "u03-design-2"]);
    // the minimum the book's explanation names: 6 states (start, «a», two «after ab», accept, trap) and 7
    const keys = questionsOf(readItem("AU899271-01")).map(q => q.answer.reference.states.length);
    expect(keys).toEqual([2, 6, 7, 4]);
    // every other DFA exercise's reference is already a complete DFA (kept as the book writes it)
    for (const q of IDS.slice(0, 2).flatMap(id => questionsOf(readItem(id)))) if (q.automatonDesign.machine === "DFA") expect(B.obeysDfa(q.answer.reference, q.automatonDesign.alphabet, true), q.examQuestionId).toBe(true);
  });

  it("«obeys the DFA rules»: one arrow per state and symbol, every one of them when completeness is asked, nothing outside the alphabet", () => {
    const m = { states: ["p", "q"], start: "p", accept: ["q"], transitions: [["p", "a", "q"], ["q", "a", "q"], ["q", "b", "p"]] };
    expect(B.obeysDfa(m, ["a", "b"], false)).toBe(true);
    expect(B.obeysDfa(m, ["a", "b"], true)).toBe(false);   // p has no arrow on b
    expect(B.obeysDfa({ ...m, transitions: [...m.transitions, ["p", "b", "p"]] }, ["a", "b"], true)).toBe(true);
    expect(B.obeysDfa({ ...m, transitions: [...m.transitions, ["p", "a", "p"]] }, ["a", "b"], false)).toBe(false);   // two arrows
    expect(B.obeysDfa({ ...m, transitions: [...m.transitions, ["p", "c", "p"]] }, ["a", "b"], false)).toBe(false);   // outside the alphabet
  });

  it("the minimal DFA is the minimum: a machine with one state fewer cannot be equivalent (the judge refuses the key without a state)", () => {
    // the minimisation on a hand case: (a|b)*ab with 4 states, one redundant → 3
    const m = { states: ["p", "q", "r", "s"], start: "p", accept: ["r"], transitions: [["p", "a", "q"], ["p", "b", "s"], ["s", "a", "q"], ["s", "b", "s"], ["q", "a", "q"], ["q", "b", "r"], ["r", "a", "q"], ["r", "b", "p"]] };
    expect(B.minimalDfa(m, ["a", "b"])).toEqual({ states: ["q0", "q1", "q2"], start: "q0", accept: ["q2"], transitions: [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q2"], ["q2", "a", "q1"], ["q2", "b", "q0"]] });
  });

  it("the build's gates refuse a broken question: rules that do not read, a key its own rules refuse, a key of another language, a judge that accepts a wrong machine, an exam that cannot be finalized", () => {
    const item = readItem("AU899271-01"), dfa = questionsOf(item)[1], tm = questionsOf(readItem("AU899271-04"))[0];
    const book = exercises[1].activity.config.reference;   // unit 3's non-deterministic reference
    expect(B.judgeNode(dfa, book)).toEqual([]);
    expect(B.judgeNode({ ...dfa, automatonDesign: { ...dfa.automatonDesign, alphabet: [] } }, book)[0]).toMatch(/^AUTOMATON_ALPHABET_INVALID /);   // the shared validator's own word
    expect(B.judgeNode({ ...tm, machineDesign: { ...tm.machineDesign, maxStates: 99 } })[0]).toMatch(/^MACHINE_/);
    expect(B.judgeNode({ ...dfa, answer: { reference: book } }).join(" ")).toMatch(/the reference does not earn full marks/);   // the NFA itself as the key of a «complete DFA» question
    const other = { ...dfa.answer.reference, accept: [...dfa.answer.reference.accept, "q0"] };
    expect(B.judgeNode({ ...dfa, answer: { reference: other } }, book).join(" ")).toMatch(/not the book reference's language/);
    // a «question» whose key accepts nothing: the one-state wrong machine is then RIGHT — the gate refuses it
    const nfa = questionsOf(readItem("AU899271-02"))[0];
    const noExamples = ({ examples, ...cfg }) => cfg;
    expect(B.judgeNode({ ...nfa, automatonDesign: noExamples(nfa.automatonDesign), answer: { reference: { states: ["q0"], start: "q0", accept: [], transitions: [] } } }).join(" ")).toMatch(/wrong machine 0 is not refused/);
    const halts = { ...tm, machineDesign: noExamples(tm.machineDesign), answer: { reference: { states: ["q0"], start: "q0", accept: ["q0"], transitions: [] } } };
    expect(B.judgeNode(halts).join(" ")).toMatch(/wrong machine 1 is not refused/);
    expect(B.finalizationProblems(item.examSnapshot)).toEqual([]);
    const broken = JSON.parse(JSON.stringify(item.examSnapshot));
    delete broken.sections[0].questions[0].answer.reference;
    expect(B.finalizationProblems(broken).length).toBeGreaterThan(0);
  });

  it("the student view carries no reference machine", () => {
    for (const id of IDS) {
      const item = readItem(id);
      const view = sanitizeExamForStudent(item.examSnapshot), student = JSON.stringify(view);
      expect(student, id).not.toMatch(/"reference"|"transitions"/);
      for (const q of view.sections.flatMap(s => s.questions)) expect(q.answer ?? {}, q.examQuestionId).toEqual({});
      // the public rules are delivered as written
      for (const q of questionsOf(item)) expect(student.includes(JSON.stringify(q.automatonDesign ?? q.machineDesign)), q.examQuestionId).toBe(true);
    }
  });

  it("the library store reads the items like any other (frozen, same as the file)", () => {
    expect(readLibraryCatalog().filter(e => e.category === "automata-899271").map(e => e.libraryItemId)).toEqual(IDS);
    for (const id of IDS) expect(readLibraryItem(id), id).toEqual(readItem(id));
  });
});

/** A teacher assigns `itemId` by libraryRef (the shared-password identity, single workspace) → the server's frozen assignment. */
async function assignFromLibrary(itemId) {
  const mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true, status: "active" } });
  const deps = { getContainer: () => mem.container, now: () => "2026-11-26T10:00:00.000Z", ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const headers = { "x-builder-token": createBuilderToken("teacher") };
  const r = await assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: { get: k => headers[String(k).toLowerCase()] ?? null }, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, examSnapshot: { title: "ignored", questions: [] }, libraryRef: { itemId } }) }, deps);
  expect(r.status, itemId).toBe(200);
  return mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");
}
/** The machine under other state names (the grade never depends on them). */
function renamed(m, prefix) {
  const n = q => prefix + q;
  return { states: m.states.map(n), start: n(m.start), accept: m.accept.map(n), transitions: m.transitions.map(t => (Array.isArray(t) ? [n(t[0]), t[1], n(t[2])] : { ...t, from: n(t.from), to: n(t.to) })) };
}

describe("AUTO-A13 — end to end: assigned by libraryRef, answered, graded officially by the API", () => {
  for (const id of IDS) {
    it(id + ": the server freezes the item, keys included; the references under other names earn every mark, empty machines none", async () => {
      const stored = await assignFromLibrary(id);
      const item = readItem(id);
      const pick = q => ({ id: q.examQuestionId, type: q.presentationType, marks: q.marks, text: q.text, cfg: q.automatonDesign ?? q.machineDesign, answer: q.answer });
      expect(stored.examSnapshot.sections.flatMap(s => s.questions).map(pick)).toEqual(questionsOf(item).map(pick));
      expect(stored.source).toMatchObject({ kind: "library", itemId: id });
      expect([stored.questionCount, stored.totalMarks]).toEqual([item.questionCount, item.totalMarks]);
      const qs = stored.examSnapshot.sections.flatMap(s => s.questions);
      const right = Object.fromEntries(qs.map(q => [q.examQuestionId, { kind: q.presentationType, machine: renamed(q.answer.reference, "s") }]));
      const r = gradeExam(stored.examSnapshot, right);
      expect([r.score, r.totalMarks, r.manualReviewMarks, r.questions.every(g => g.correct === true)], id).toEqual([item.totalMarks, item.totalMarks, 0, true]);
      const wrong = Object.fromEntries(qs.map(q => [q.examQuestionId, { kind: q.presentationType, machine: B.wrongMachines(q)[0] }]));
      const w = gradeExam(stored.examSnapshot, wrong);
      expect([w.score, w.manualReviewMarks], id).toEqual([0, 0]);
      for (const g of w.questions) expect([g.score, g.manualReview, !!(g.automatonFeedback || g.machineFeedback)], g.questionId).toEqual([0, false, true]);
    });
  }
});
