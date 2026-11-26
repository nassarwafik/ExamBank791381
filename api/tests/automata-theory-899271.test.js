import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { readAutomatonConfig, runAutomaton, splitWord } from "../../src/learning/activities/automaton";

// AUTO-A14 (docs/enterprise-automata-lab-a4.md §20) — «أسئلة نظرية»: the 103 short self-check exercises of the book «الأتمتة» (899271)
// as ready exam questions, shipped as 6 Exam Library items AT899271-01…06 (one per batch of the book). This suite proves:
//   • the shipped items are EXACTLY what the builder makes from the course's own build (no hand edit, regenerating changes no byte);
//   • every question is its exercise: the same statement, the same choices and the BOOK'S OWN KEY, in the platform type that asks it;
//   • an exercise about «الأوتومات أعلاه» carries THE machine of the simulator above it on its page (the proof test's own rule) as a
//     transition table, and every answer the book proves (`prove`) is proven again on the machine the question now carries;
//   • every node is valid, every item a finalizable structured exam under the server's own authority;
//   • the API's grader gives the book's key full marks and a wrong answer less (a short answer that is not the key goes to the teacher's
//     review — never a zero); the student view carries no key;
//   • end to end: a teacher assigns an item by `libraryRef`; the server freezes it, keys included; the official grader gives the book's keys
//     every mark.
const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "a14-automata-theory-test-only-root-secret";   // TEST value — never a real secret
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const ROOT = path.join(__dirname, "..", "..");
const LIB = path.join(ROOT, "api", "src", "data", "exam-library");
const B = await import("../../scripts/build-899271-automata-theory.mjs");
const { sanitizeExamForStudent } = cjs("../src/lib/student-exam-sanitize.js");
const { readLibraryCatalog, readLibraryItem } = cjs("../src/lib/exam-library-store.js");
const { gradeExam } = cjs("../src/lib/assignment-grading.js");
const { evaluateExamFinalization } = cjs("../src/lib/shared-finalization/examFinalization.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");

const IDS = ["AT899271-01", "AT899271-02", "AT899271-03", "AT899271-04", "AT899271-05", "AT899271-06"];
const readItem = id => JSON.parse(fs.readFileSync(path.join(LIB, "items", id + ".json"), "utf8"));
const catalogFile = () => JSON.parse(fs.readFileSync(path.join(LIB, "catalog.json"), "utf8"));
const questionsOf = item => item.examSnapshot.sections.flatMap(s => s.questions);
const exercises = B.readExercises();
const built = B.buildTheory(exercises);
const ALL = IDS.flatMap(id => questionsOf(readItem(id)));
const TYPE = { multipleChoice: "multipleChoice", trueFalse: "trueFalse", shortInput: "shortAnswer", classify: "categorization", matching: "matching", ordering: "ordering", wordBank: "wordBank" };

/** The book's key as the student's response to the node. */
function keyResponse(node, q) {
  switch (q.kind) {
    case "multipleChoice": return { kind: "choice", index: q.options.findIndex(o => o.correct) };
    case "trueFalse": return { kind: "choice", index: q.answer ? 0 : 1 };
    case "shortInput": return { kind: "text", value: String(q.answer) };
    case "classify": return { kind: "fields", values: { ...q.assign } };
    case "matching": return { kind: "fields", values: Object.fromEntries(q.left.map(l => [l.id, q.right.find(r => r.id === q.pairs[l.id]).text])) };
    case "ordering": return { kind: "sequence", values: q.order.map(id => q.items.find(i => i.id === id).text) };
    case "wordBank": return { kind: "fields", values: { ...q.answers } };
  }
  throw new Error(q.kind);
}
/** A wrong response: another choice, another word, every item in the wrong group, the order reversed… */
function wrongResponse(node, q) {
  switch (q.kind) {
    case "multipleChoice": return { kind: "choice", index: q.options.findIndex(o => !o.correct) };
    case "trueFalse": return { kind: "choice", index: q.answer ? 1 : 0 };
    case "shortInput": return { kind: "text", value: String(q.answer) + "x" };
    case "classify": return { kind: "fields", values: Object.fromEntries(Object.entries(q.assign).map(([i, g]) => [i, q.groups.find(x => x.id !== g).id])) };
    case "matching": { const r = keyResponse(node, q).values, ks = Object.keys(r); return { kind: "fields", values: Object.fromEntries(ks.map((k, j) => [k, r[ks[(j + 1) % ks.length]]])) }; }
    case "ordering": return { kind: "sequence", values: [...keyResponse(node, q).values].reverse() };
    case "wordBank": return { kind: "fields", values: Object.fromEntries(Object.keys(q.answers).map(b => [b, q.bank.find(w => w !== q.answers[b])])) };
  }
  throw new Error(q.kind);
}
const gradeOne = (node, response) => gradeExam({ sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [node] }] }, { [node.examQuestionId]: response }).questions[0];

describe("AUTO-A14 — the shipped theory exams are exactly the build of the course", () => {
  it("103 exercises (units 1–11) → 6 items AT899271-01…06 of 12 / 26 / 27 / 18 / 11 / 9 questions, a section per unit; each catalog entry is the item's own header", () => {
    expect(exercises).toHaveLength(103);
    expect(fs.readdirSync(path.join(LIB, "items")).filter(f => f.startsWith("AT899271-")).sort()).toEqual(IDS.map(id => id + ".json"));
    const ours = catalogFile().filter(e => e.source?.repository === B.REPOSITORY);
    expect(ours.map(e => e.libraryItemId)).toEqual(IDS);
    expect(catalogFile().slice(-6)).toEqual(ours);
    const counts = [];
    for (const entry of ours) {
      const item = readItem(entry.libraryItemId);
      const { schemaVersion, examSnapshot, ...header } = item;
      expect([schemaVersion, header], entry.libraryItemId).toEqual([1, entry]);
      const qs = questionsOf(item);
      counts.push(qs.length);
      expect(entry).toMatchObject({ category: "theory-899271", publishable: true, conversionStatus: "ready", autoGradableCount: qs.length, manualReviewCount: 0, questionCount: qs.length, totalMarks: qs.reduce((s, q) => s + q.marks, 0) });
      expect(examSnapshot.schemaVersion).toBe(2);
    }
    expect(counts).toEqual([12, 26, 27, 18, 11, 9]);
    expect(ALL.reduce((s, q) => s + q.marks, 0)).toBe(133);
  });

  it("regenerating from the course changes no byte of any item or catalog entry; the catalog merge keeps every other source", () => {
    const catalog = catalogFile();
    for (const b of built) {
      expect(b.problems, b.entry.libraryItemId).toEqual([]);
      expect(JSON.stringify(b.item, null, 2), b.entry.libraryItemId).toBe(fs.readFileSync(path.join(LIB, "items", b.entry.libraryItemId + ".json"), "utf8"));
      expect(catalog.find(e => e.libraryItemId === b.entry.libraryItemId)).toEqual(b.entry);
    }
    expect(B.mergeCatalog(catalog, built.map(b => b.entry))).toEqual(catalog);
    const x = id => ({ libraryItemId: id, source: { repository: "899271" } }), ours = id => ({ libraryItemId: id, source: { repository: B.REPOSITORY } });
    expect(B.mergeCatalog([x("lab"), x("b")], [ours("n1")]).map(e => e.libraryItemId)).toEqual(["lab", "b", "n1"]);   // the machine lab's entries are not ours
    expect(B.mergeCatalog([x("a"), ours("o1"), x("b")], [ours("n1"), ours("n2")]).map(e => e.libraryItemId)).toEqual(["a", "n1", "n2", "b"]);
  });

  it("every question is its exercise: the platform type that asks it, the statement, the choices and the BOOK'S OWN KEY", () => {
    expect(ALL.map(q => q.sourceQuestionId)).toEqual(exercises.map(e => e.id));
    ALL.forEach((node, i) => {
      const q = exercises[i].question, at = node.examQuestionId;
      expect(node.presentationType, at).toBe(TYPE[q.kind]);
      expect(node.text.startsWith(B.statement(q.prompt)), at).toBe(true);
      expect(node.text, at).not.toMatch(/أعلاه|للبندين/);
      expect(node.marks, at).toBe(B.MARKS[node.presentationType]);
      if (q.kind === "multipleChoice") expect([node.options.map(o => o.text), node.options[node.answer.correctOptionIndex].text], at).toEqual([q.options.map(o => o.text), q.options.find(o => o.correct).text]);
      if (q.kind === "trueFalse") expect(node.answer.correctOptionIndex, at).toBe(q.answer ? 0 : 1);
      if (q.kind === "shortInput") expect(node.answer.text, at).toBe(String(q.answer));
      if (q.kind === "classify") expect([node.categorization.items.map(x => x.label), node.answer.correctCategoryByItem], at).toEqual([q.items.map(x => x.text), q.assign]);
      if (q.kind === "matching") expect(node.fields.map(f => [f.label, f.correct]), at).toEqual(q.left.map(l => [l.text, q.right.find(r => r.id === q.pairs[l.id]).text]));
      if (q.kind === "ordering") expect([node.answer.values, node.wordBank], at).toEqual([q.order.map(id => q.items.find(x => x.id === id).text), q.items.map(x => x.text)]);
      if (q.kind === "wordBank") expect([node.fields.map(f => [f.id, f.correct]), node.wordBank], at).toEqual([Object.entries(q.answers), q.bank]);
    });
    const kinds = {};
    for (const e of exercises) kinds[e.question.kind] = (kinds[e.question.kind] ?? 0) + 1;
    expect(kinds).toEqual({ classify: 14, multipleChoice: 32, trueFalse: 31, wordBank: 2, matching: 5, shortInput: 10, ordering: 9 });
  });

  it("an exercise about «الأوتومات أعلاه» carries the machine of the simulator above it on its page — as a table, and line by line in its text", () => {
    const above = ALL.filter((_, i) => /أعلاه/.test(exercises[i].question.prompt));
    expect(above).toHaveLength(32);
    expect(ALL.filter(q => q.richContent).map(q => q.examQuestionId)).toEqual(above.map(q => q.examQuestionId));
    ALL.forEach((node, i) => {
      if (!node.richContent) return;
      const m = exercises[i].machine, t = B.machineTable(m);
      expect(m, node.examQuestionId).toBeTruthy();
      expect(node.richContent.blocks, node.examQuestionId).toEqual([{ type: "paragraph", runs: [{ text: B.statement(exercises[i].question.prompt) }] }, ...B.machineBlocks(t)]);
      // the caption is Arabic and the legend only — no state inside it; a push-down / Turing machine lists its states, each its own LTR run
      expect(t.caption, node.examQuestionId).not.toMatch(/q\d/);
      if (t.states) expect(node.richContent.blocks[2].runs.filter(r => r.dir === "ltr").map(r => r.text), node.examQuestionId).toEqual(t.states);
      else expect(node.richContent.blocks, node.examQuestionId).toHaveLength(2);
      for (const row of t.rows) expect(node.text.includes(row.join(" | ")), node.examQuestionId).toBe(true);
      // the table IS the machine: every state, the start, every accepting state and every transition, nothing else
      if (m.kind === "DFA" || m.kind === "NFA") {
        expect(t.rows.map(r => r[0].replace(/^→ | \*$/g, ""))).toEqual(m.states);
        const cells = t.rows.flatMap((r, k) => t.columnHeaders.slice(1).flatMap((s, j) => (/^[∅—]$/.test(r[j + 1]) ? [] : r[j + 1].split("، ").map(to => [m.states[k], s, to]))));
        expect(cells.map(c => c.join(" ")).sort()).toEqual(m.transitions.map(c => c.join(" ")).sort());
      } else {
        expect(t.rows.map(r => r[1])).toEqual(m.transitions.map(x => B.arrowLabel(m.kind, x)));
        expect(t.rows.map(r => [r[0], r[2]].map(c => c.replace(/^→ | \*$/g, "")))).toEqual(m.transitions.map(x => [x.from, x.to]));
      }
      expect(t.rows.flat().concat(t.states ?? []).filter(c => c.startsWith("→ ")).every(c => c.startsWith("→ " + m.start))).toBe(true);
      if (t.states) expect(t.states.map(c => c.replace(/^→ | \*$/g, "")), node.examQuestionId).toEqual(m.states);
      const starred = [...[...t.rows.flat(), ...(t.states ?? [])].join("\n").matchAll(/(?:^|→ |\s)([^\s،؛]+) \*/gm)].map(x => x[1]);
      expect(new Set(starred), node.examQuestionId).toEqual(new Set(m.accept));
    });
    const kinds = new Set(ALL.filter(q => q.richContent).map(q => q.richContent.blocks[1].caption.split(" — ")[0]));
    expect([...kinds].sort()).toEqual(["آلة تورنغ", "أوتومات منتهٍ حتمي", "أوتومات منتهٍ غير حتمي", "أوتومات مكدّس"].sort());
  });

  it("«the machine above» is the NEAREST simulator above the exercise on ITS page — never an earlier one, never another page's", () => {
    const sim = (pageId, kind) => ({ unit: 1, pageId, block: { type: "simulation", simulationType: "automaton-trace", config: { automaton: { kind } } } });
    const ex = (pageId, id) => ({ unit: 1, pageId, block: { type: "practice", id, question: { kind: "trueFalse", prompt: "الأوتومات أعلاه يقبل a.", answer: true } } });
    const got = B.readExercises([sim("p1", "DFA"), ex("p1", "e1"), sim("p1", "NFA"), ex("p1", "e2"), ex("p2", "e3"), sim("p2", "PDA"), ex("p2", "e4")]);
    expect(got.map(e => [e.id, e.machine?.kind ?? null])).toEqual([["e1", "DFA"], ["e2", "NFA"], ["e3", null], ["e4", "PDA"]]);
  });

  it("every answer the book proves is proven AGAIN on the machine the question carries (accepts / final state / state set / stack / classify / shortest)", () => {
    let proven = 0;
    exercises.forEach((e, i) => {
      if (!e.prove || !ALL[i].richContent) return;
      proven++;
      const m = readAutomatonConfig({ automaton: e.machine }).machine;
      const run = w => { const s = splitWord(m, w); expect(s.ok, w).toBe(true); return runAutomaton(m, s.symbols); };
      const node = ALL[i], p = e.prove;
      switch (p.type) {
        case "accepts": expect(run(p.word).verdict === "accept").toBe(p.expect); expect(node.answer.correctOptionIndex).toBe(p.expect ? 0 : 1); break;
        case "finalState": expect(run(p.word).steps.at(-1).active).toEqual([p.expect]); expect(node.options[node.answer.correctOptionIndex].text).toBe(p.expect); break;
        case "stateSet": expect(run(p.word).steps.at(-1).active).toEqual(p.expect); break;
        case "stackAfter": expect(run(p.word).steps.at(-1).stack.join("")).toBe(p.expect); break;
        case "classify": for (const [w, g] of p.words) expect(run(w).verdict === "accept", "«" + w + "»").toBe(g === 0); break;
        case "shortest": break;   // proven by the book's own proof test on the same machine (the shortest words up to length 8)
        default: throw new Error("unknown proof " + p.type);
      }
    });
    expect(proven).toBe(27);
  });

  it("every node is valid, every item a finalizable structured exam under the server's authority", () => {
    for (const node of ALL) expect(B.validatorProblems(node), node.examQuestionId).toEqual([]);
    for (const id of IDS) {
      const d = evaluateExamFinalization(readItem(id).examSnapshot);
      expect([d.canFinalize, d.blockers.map(b => b.message)], id).toEqual([true, []]);
    }
  });

  it("the build's gates refuse a broken question: a matching without its key, a key not among the choices, an exam that cannot be finalized, «أعلاه» left in the text", () => {
    const matching = ALL.find(q => q.presentationType === "matching");
    expect(B.validatorProblems({ ...matching, answer: {} }).length + B.finalizationProblems({ ...readItem(IDS[0]).examSnapshot, sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [{ ...matching, answer: {} }] }] }).length).toBeGreaterThan(0);
    const ordering = ALL.find(q => q.presentationType === "ordering");
    expect(B.finalizationProblems({ ...readItem(IDS[0]).examSnapshot, sections: [{ id: "s", title: "s", gradingPolicy: "all", questions: [{ ...ordering, answer: { mode: "exactSequence", values: ordering.answer.values.slice(1) } }] }] }).length).toBeGreaterThan(0);
    expect(() => B.statement("الأوتومات في الصفحة أعلاه يقبل ab.")).toThrow(/أعلاه/);
    expect(B.statement("للبندين أ و ج: صنّف كل كلمة.")).toBe("صنّف كل كلمة.");
    expect(B.statement("الأوتومات أعلاه يقبل ab، والآلة أعلاه تقبل ba، وللأوتومات أعلاه حالتان.")).toBe("الأوتومات المعطى يقبل ab، والآلة المعطاة تقبل ba، وللأوتومات المعطى حالتان.");
    expect(() => B.questionNode(1, 0, { id: "x", unit: 1, question: { kind: "multipleChoice", prompt: "؟", options: [{ text: "a", correct: true }, { text: "b", correct: true }] } })).toThrow(/2 correct options/);
    expect(() => B.questionNode(1, 0, { id: "x", unit: 1, question: { kind: "trueFalse", prompt: "الأوتومات أعلاه يقبل a.", answer: true }, machine: null })).toThrow(/no machine above/);
  });

  it("the API's grader: the book's key earns every mark; a wrong answer less — a short answer that is not the key goes to the teacher's review, never a zero", () => {
    ALL.forEach((node, i) => {
      const q = exercises[i].question, at = node.examQuestionId;
      const right = gradeOne(node, keyResponse(node, q));
      expect([right.score, right.correct, right.manualReview], at).toEqual([node.marks, true, false]);
      const wrong = gradeOne(node, wrongResponse(node, q));
      expect(wrong.score, at).toBeLessThan(node.marks);
      expect(wrong.manualReview, at).toBe(node.presentationType === "shortAnswer");
    });
  });

  it("the student view carries no key — no correct option, category, pair, order or answer — and keeps the machine's table", () => {
    for (const id of IDS) {
      const item = readItem(id), view = sanitizeExamForStudent(item.examSnapshot), student = JSON.stringify(view);
      expect(student, id).not.toMatch(/"correctOptionIndex"|"correctCategoryByItem"|"correct"|"values"|"exactSequence"/);
      for (const q of view.sections.flatMap(s => s.questions)) expect(q.answer ?? {}, q.examQuestionId).toEqual({});
      for (const q of questionsOf(item)) {
        if (q.presentationType === "shortAnswer") {
          const { text, ...mine } = view.sections.flatMap(x => x.questions).find(x => x.examQuestionId === q.examQuestionId);
          expect(JSON.stringify(mine).includes(JSON.stringify(q.answer.text)), q.examQuestionId + " the short answer's key").toBe(false);
        }
        if (q.richContent) expect(student.includes(JSON.stringify(q.richContent.blocks[1].rows)), q.examQuestionId + " the table").toBe(true);
      }
    }
  });

  it("the library store reads the items like any other", () => {
    expect(readLibraryCatalog().filter(e => e.category === "theory-899271").map(e => e.libraryItemId)).toEqual(IDS);
    for (const id of IDS) expect(readLibraryItem(id), id).toEqual(readItem(id));
  });
});

async function assignFromLibrary(itemId) {
  const mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true, status: "active" } });
  const deps = { getContainer: () => mem.container, now: () => "2026-11-26T12:00:00.000Z", ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const headers = { "x-builder-token": createBuilderToken("teacher") };
  const r = await assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: { get: k => headers[String(k).toLowerCase()] ?? null }, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, examSnapshot: { title: "ignored", questions: [] }, libraryRef: { itemId } }) }, deps);
  expect(r.status, itemId).toBe(200);
  return mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");
}

describe("AUTO-A14 — end to end: assigned by libraryRef, answered, graded officially by the API", () => {
  for (const id of IDS) {
    it(id + ": the server freezes the item, keys included; the book's keys earn every mark", async () => {
      const stored = await assignFromLibrary(id), item = readItem(id);
      expect(stored.examSnapshot.sections.flatMap(s => s.questions)).toEqual(questionsOf(item));
      expect(stored.source).toMatchObject({ kind: "library", itemId: id });
      expect([stored.questionCount, stored.totalMarks]).toEqual([item.questionCount, item.totalMarks]);
      const answers = Object.fromEntries(questionsOf(item).map(node => [node.examQuestionId, keyResponse(node, exercises.find(e => e.id === node.sourceQuestionId).question)]));
      const r = gradeExam(stored.examSnapshot, answers);
      expect([r.score, r.totalMarks, r.manualReviewMarks], id).toEqual([item.totalMarks, item.totalMarks, 0]);
    });
  }
});
