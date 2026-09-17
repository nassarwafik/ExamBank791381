// @vitest-environment happy-dom
//
// UX-6c blocker proof, end to end through the REAL code paths: a fill-blank / word-bank question created through the
// bank-questions handler (in-memory store) → selected by the Builder's real question-bank-action handler → sanitized
// for the student → rendered by StudentQuestionCard → the student's answer grades with the assignment grader.
// A word-bank question must give the student one <select> per blank offering the bank's choices; a fill-blank
// question one text input per blank. On the pre-fix handler these questions stored no fields at all, so the card
// rendered no answer control.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import StudentQuestionCard, { type Answer, type Question, getWordBank } from "../StudentQuestionCard";
// The real (untyped CommonJS) API modules — on purpose: the proof must run the production handlers, not a copy.
// @ts-expect-error untyped CommonJS module
import { handler as bankQuestions, INDEX_BLOB, SOURCES_PREFIX } from "../../api/src/functions/bank-questions.js";
// @ts-expect-error untyped CommonJS module
import { handler as bankAction } from "../../api/src/functions/question-bank-action.js";
import { gradeQuestion } from "../../api/src/lib/assignment-grading.js";
import { sanitizeQuestionForStudent } from "../../api/src/lib/student-exam-sanitize.js";

type Store = Map<string, unknown>;
function makeStore(): Store {
  const store: Store = new Map();
  store.set(INDEX_BLOB, { questions: [] });
  return store;
}
function bankDeps(store: Store) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getBankContainer: () => ({}), getPlatformContainer: () => ({}),
    downloadJsonOrNull: async (_c: unknown, k: string) => (store.has(k) ? structuredClone(store.get(k)) : null),
    listJson: async (_c: unknown, prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
    mutateJsonWithRetry: async (_c: unknown, k: string, fn: (cur: unknown) => unknown) => { const next = await fn(store.has(k) ? structuredClone(store.get(k)) : null); store.set(k, structuredClone(next)); return next; },
    isConcurrencyConflict: () => false,
    recordAuditEvent: async () => {},
    now: () => "2026-09-17T12:00:00.000Z"
  };
}
async function createAndSelect(store: Store, question: Record<string, unknown>, requestKey: string) {
  const created = await bankQuestions({ method: "POST", url: "http://x/bank-questions", params: {}, json: async () => ({ action: "create", question, requestKey }) }, bankDeps(store));
  expect(created.status).toBe(200);
  const presentationType = String(question.presentationType);
  const selected = await bankAction({ json: async () => ({ question: { examQuestionId: "x1", marks: 4, section: question.section, topic: question.topic, difficulty: question.difficulty, presentationType }, presentationType, topic: question.topic }) }, {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getBankContainer: () => ({}),
    downloadJson: async (_c: unknown, k: string) => { if (!store.has(k)) throw new Error("BlobNotFound"); return structuredClone(store.get(k)); }
  });
  expect(selected.status).toBe(200);
  return selected.jsonBody.question as Record<string, unknown> & { fields: unknown[]; presentationType: string; answer: Record<string, unknown> };
}
// The student page's own wiring: a sequence answer per blank index (exactly StudentExamPage's onSeq shape).
function Harness({ q, onAnswer }: { q: Question; onAnswer: (a: Answer) => void }) {
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  const setSeq = (i: number, v: string) => setAnswer(prev => { const values = prev?.kind === "sequence" ? prev.values.slice() : []; values[i] = v; const next: Answer = { kind: "sequence", values }; onAnswer(next); return next; });
  return <StudentQuestionCard q={q} index={0} id="q1" answer={answer} onChoice={() => {}} onSeq={setSeq} onTable={() => {}} onText={() => {}} />;
}

afterEach(cleanup);

describe("UX-6c — bank-created fill-blank / word-bank questions render a real student answer control and grade", () => {
  it("word bank: one <select> per blank offering the word bank's choices; choosing the expected words grades full marks", async () => {
    const store = makeStore();
    const q = await createAndSelect(store, { section: "BASIC", topic: "ROUTING_MANUAL", difficulty: 2, presentationType: "wordBank", text: "اختر: ____ يعتمد الحالة، ____ يعتمد المسافة", fields: [{ label: "الأول", correct: "OSPF" }, { label: "الثاني", correct: "RIP" }], wordBank: ["OSPF", "RIP", "BGP", "EIGRP"] }, "k-word-render-1");
    expect(q.presentationType).toBe("wordBank");
    expect(q.fields).toHaveLength(2);
    const student = sanitizeQuestionForStudent({ ...q, marks: 4 }) as Question;            // exactly what the student receives
    expect(JSON.stringify(student)).not.toContain("correct");                              // no answer key reaches the browser
    expect(getWordBank(student)).toEqual(["OSPF", "RIP", "BGP", "EIGRP"]);
    let last: Answer | undefined;
    const { container } = render(<Harness q={student} onAnswer={a => { last = a; }} />);
    const selects = container.querySelectorAll(".iex-seq select");
    expect(selects).toHaveLength(2);                                                         // a dropdown per blank
    expect(container.querySelectorAll(".iex-seq input.iex-cell")).toHaveLength(0);
    expect(Array.from(selects[0].querySelectorAll("option")).map(o => o.textContent)).toEqual(["— اختر —", "OSPF", "RIP", "BGP", "EIGRP"]);
    expect(container.querySelector(".iex-bank")?.textContent).toBe("OSPFRIPBGPEIGRP");
    expect(Array.from(container.querySelectorAll(".iex-seq label > span")).map(s => s.textContent)).toEqual(["الأول", "الثاني"]);
    fireEvent.change(selects[0], { target: { value: "OSPF" } });
    fireEvent.change(selects[1], { target: { value: "RIP" } });
    expect(last).toEqual({ kind: "sequence", values: ["OSPF", "RIP"] });
    expect(gradeQuestion({ ...q, marks: 4 }, last)).toMatchObject({ score: 4, maxMarks: 4, correct: true, manualReview: false });
    expect(gradeQuestion({ ...q, marks: 4 }, { kind: "sequence", values: ["OSPF", "BGP"] })).toMatchObject({ score: 2, correct: false, manualReview: false });
  });
  it("fill blank: one text input per blank (no dropdown, no word bank strip); typing the expected values grades full marks", async () => {
    const store = makeStore();
    const q = await createAndSelect(store, { section: "INFRASTRUCTURE", topic: "SUBNETTING_MANUAL", difficulty: 3, presentationType: "fillBlank", text: "أكمل: قناع الفئة C هو ____ وعنوان البث ____", fields: [{ label: "القناع", correct: "255.255.255.0" }, { label: "عنوان البث", correct: "192.168.1.255" }] }, "k-fill-render-1");
    expect(q.presentationType).toBe("fillBlank");
    const student = sanitizeQuestionForStudent({ ...q, marks: 4 }) as Question;
    expect(getWordBank(student)).toEqual([]);
    let last: Answer | undefined;
    const { container } = render(<Harness q={student} onAnswer={a => { last = a; }} />);
    const inputs = container.querySelectorAll(".iex-seq input.iex-cell");
    expect(inputs).toHaveLength(2);
    expect(container.querySelectorAll(".iex-seq select")).toHaveLength(0);
    expect(container.querySelector(".iex-open")).toBeNull();                                // not the open-question textarea
    expect(Array.from(container.querySelectorAll(".iex-seq label > span")).map(s => s.textContent)).toEqual(["القناع", "عنوان البث"]);
    fireEvent.change(inputs[0], { target: { value: "255.255.255.0" } });
    fireEvent.change(inputs[1], { target: { value: "192.168.1.255" } });
    expect(last).toEqual({ kind: "sequence", values: ["255.255.255.0", "192.168.1.255"] });
    expect(gradeQuestion({ ...q, marks: 4 }, last)).toMatchObject({ score: 4, correct: true, manualReview: false });
  });
  it("the stored document itself (bank/sources/manual.json) is what the Builder converts: fields are non-empty there, and the index type is multiField", async () => {
    const store = makeStore();
    await createAndSelect(store, { section: "BASIC", topic: "ROUTING_MANUAL", difficulty: 2, presentationType: "wordBank", text: "س", fields: [{ label: "", correct: "OSPF" }], wordBank: ["OSPF", "RIP"] }, "k-word-render-2");
    const doc = store.get(SOURCES_PREFIX + "manual.json") as { questions: { fields: unknown[]; wordBank: string[]; type: string }[] };
    expect(doc.questions[0].type).toBe("multiField");
    expect(doc.questions[0].fields).toHaveLength(1);
    expect(doc.questions[0].wordBank).toEqual(["OSPF", "RIP"]);
    expect((store.get(INDEX_BLOB) as { questions: { type: string }[] }).questions[0].type).toBe("multiField");
  });
});
