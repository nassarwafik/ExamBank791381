import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as K from "./certification-20g/kit.js";
import { stressExam } from "./certification-20g/exams/S-stress.js";
import { examA, PERSONAS as PA } from "./certification-20g/exams/A-network.js";
import { examE, PERSONAS as PE } from "./certification-20g/exams/E-showcase.js";

// Phase 20G.1 — ANSWER INGEST HARDENING (D3 of the 20G certification). Bound to the AUTHORITATIVE published exam snapshot (every HTTP
// ingest path: saveDraft, submit, pauseAttempt), the shared normalizer must never store an answer for an id that is not an answer unit of
// that exam, must refuse malformed legacy answer shapes, and must bound the legacy pass-through shapes — while every valid answer keeps its
// exact normalized form, its grade and its autosave / restore round trip. Cases D3-A … D3-O; the ones that only PIN existing behaviour
// (they pass on the baseline too) say so in their title.
const require_ = createRequire(import.meta.url);
const { normalizeDraftAnswers } = require_("../src/lib/draft-answers.js");
const { gradeExam } = require_("../src/lib/assignment-grading.js");
const { createPlatform } = require_("./certification-20g/platform.js");
const { sanitizeExamForStudent } = require_("../src/lib/student-exam-sanitize.js");
const { A } = K;
const LIMIT = 65536;                                                               // the legacy answer bound (serialized UTF-8 bytes), see the design record
const digest = v => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const bytes = v => Buffer.byteLength(JSON.stringify(v), "utf8");
const textOfBytes = n => "x".repeat(n - bytes({ kind: "text", value: "" }));    // a { kind: "text" } answer whose serialized size is exactly n bytes
const CAPTURE = process.env.CAPTURE_20G1_PINS;
const captured = {};
const pin = (name, actual) => { if (CAPTURE) { captured[name] = actual; fs.writeFileSync(CAPTURE, JSON.stringify(captured, null, 1)); return; } expect(actual, name).toBe(PIN[name]); };
// captured on the baseline b952f5c (before any 20G.1 code): valid answers must normalize EXACTLY as they did
const PIN = {
  stressValid: "5329103606588b2693a9cdc2611285c11e11cf4f80a4f08a7d9cf9430901dd56",
  examAFull: "f34ec6a07d1cdbc06d4a8679430d363fb45518c2bb1f030660520995fd392fbc",
  examEPerfect: "f3a79ab42cac55d881e4b234f2ce913273b2d2f457a6eef60b840a40cf803c60"
};

const EX = () => K.exam("D3-20G1", "تقوية إدخال الإجابات", [
  K.section("s1", "الكل", [
    K.shortAnswer("q1", "ما البروتوكول؟", 2, "TCP"),
    K.mcq("q2", "اختر", 1, ["أ", "ب", "ج"], 1),
    K.compound("q3", "مركّب", 3, [{ id: "p1", type: "shortAnswer", text: "?", marks: 1, answer: { text: "UDP" } }, { id: "p2", type: "multipleChoice", text: "?", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }]),
    K.ordering("q4", "رتّب", 2, ["أولًا", "ثانيًا"]),
    K.multipleSelect("q5", "اختر كل الصحيح", 2, [["o1", "1"], ["o2", "2"], ["o3", "3"]], ["o1", "o3"]),
    K.numeric("q6", "كم؟", 1, 9.8, 0.1),
    K.fillBlank("q7", "أكمل", 2, [["b1", "الأول", "IP"], ["b2", "الثاني", "MAC"]]),
    K.tableFill("q8", "املأ", 2, ["العمود 1", "العمود 2"], ["الصف"], [["c1", 0, 0, "A"], ["c2", 0, 1, "B"]])
  ]),
  K.section("s2", "أول إجابة", [K.shortAnswer("f1", "اكتب", 3, "x"), K.mcq("f2", "اختر", 3, ["أ", "ب"], 0)], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 3 })
]);
const VALID = () => ({
  q1: A.text("TCP"), q2: A.choice(1),
  q3: { kind: "compound", parts: { p1: A.text("UDP"), p2: A.choice(0) } },
  q4: A.seq(["أولًا", "ثانيًا"]), q5: { kind: "multiChoice", optionIds: ["o1", "o3"] }, q6: { kind: "numeric", value: "9.8" },
  q7: A.fields({ b1: "IP", b2: "MAC" }), q8: { kind: "table", values: ["A", "B"] }, f2: A.choice(0)
});
const codes = r => r.rejected.map(x => x.code);

describe("20G.1 D3 — unknown ids are never stored (bound to the published exam)", () => {
  it("D3-A an unknown top-level question id is refused with ANSWER_QUESTION_UNKNOWN and not stored; valid ids beside it survive", () => {
    const r = normalizeDraftAnswers({ ...VALID(), ghost: A.text("v") }, EX());
    expect(Object.keys(r.answers)).not.toContain("ghost");
    expect(r.rejected).toEqual([{ id: "ghost", code: "ANSWER_QUESTION_UNKNOWN" }]);
    expect(r.answers).toEqual(VALID());
  });
  it("D3-B a multi-megabyte unknown text answer is not retained (nothing of it reaches the stored map)", () => {
    const r = normalizeDraftAnswers({ ghost: { kind: "text", value: "x".repeat(5e6) } }, EX());
    expect(r.answers).toEqual({});
    expect(codes(r)).toEqual(["ANSWER_QUESTION_UNKNOWN"]);
  });
  it("D3-C 100 000 unknown ids cannot inflate the stored map (each refused deterministically)", () => {
    const many = {};
    for (let i = 0; i < 100000; i++) many["g" + i] = A.text("v");
    const r = normalizeDraftAnswers({ ...many, q1: A.text("TCP") }, EX());
    expect(r.answers).toEqual({ q1: A.text("TCP") });
    expect(r.rejected.length).toBe(100000);
    expect(new Set(codes(r))).toEqual(new Set(["ANSWER_QUESTION_UNKNOWN"]));
  });
  it("D3-C' a malformed / missing exam snapshot binds NOTHING: every answer is refused (fail closed, never pass-through)", () => {
    for (const exam of [null, {}, { sections: "x" }]) {
      const r = normalizeDraftAnswers({ q1: A.text("TCP") }, exam);
      expect(r.answers, JSON.stringify(exam)).toEqual({});
      expect(codes(r)).toEqual(["ANSWER_QUESTION_UNKNOWN"]);
    }
  });
});

describe("20G.1 D3 — malformed and oversize legacy answers fail closed; boundary-valid ones are kept byte-for-byte", () => {
  it("D3-D primitive / array / null / unknown-kind / wrong-typed answers on a VALID legacy question are refused (ANSWER_INVALID)", () => {
    const bad = [5, "TCP", true, null, [1], ["TCP"], { kind: "zzz" }, { value: "TCP" }, { kind: "text", value: 5 }, { kind: "text" },
      { kind: "choice", index: "1" }, { kind: "choice", index: -1 }, { kind: "choice", index: 1.5 }, { kind: "sequence", values: "a" }, { kind: "sequence", values: [{ x: 1 }] },
      { kind: "table", values: [[1]] }, { kind: "fields", values: [] }, { kind: "fields", values: { b1: { deep: 1 } } }, { kind: "fields", values: { b1: [{ deep: 1 }] } },
      { kind: "multiChoice", optionIds: [1] }, { kind: "multiChoice", optionIds: "o1" }, { kind: "numeric", value: 9.8 }, { kind: "numeric", value: "9.8", unit: 5 }];
    for (const a of bad) {
      const r = normalizeDraftAnswers({ q1: a }, EX());
      expect(r.answers, JSON.stringify(a)).toEqual({});
      expect(codes(r), JSON.stringify(a)).toEqual(["ANSWER_INVALID"]);
    }
  });
  it("D3-D' extra keys on a legacy answer are never stored: the answer is rebuilt to exactly its contract keys", () => {
    const r = normalizeDraftAnswers({ q1: { kind: "text", value: "TCP", score: 2, correct: true, junk: "x".repeat(1000) }, q6: { kind: "numeric", value: "9.8", unit: "m/s", graded: true } }, EX());
    expect(r.answers).toEqual({ q1: { kind: "text", value: "TCP" }, q6: { kind: "numeric", value: "9.8", unit: "m/s" } });
    expect(r.rejected).toEqual([]);
  });
  it("D3-E a legacy answer one byte over the bound is refused (ANSWER_TOO_LARGE), never truncated", () => {
    const over = { kind: "text", value: textOfBytes(LIMIT + 1) };
    expect(bytes(over)).toBe(LIMIT + 1);
    const r = normalizeDraftAnswers({ q1: over }, EX());
    expect(r.answers).toEqual({});
    expect(codes(r)).toEqual(["ANSWER_TOO_LARGE"]);
    const fields = normalizeDraftAnswers({ q7: { kind: "fields", values: { b1: "x".repeat(LIMIT) } } }, EX());
    expect(codes(fields)).toEqual(["ANSWER_TOO_LARGE"]);
    const part = normalizeDraftAnswers({ q3: { kind: "compound", parts: { p1: over, p2: A.choice(0) } } }, EX());
    expect(part.answers).toEqual({ q3: { kind: "compound", parts: { p2: A.choice(0) } } });
    expect(part.rejected).toEqual([{ id: "q3.p1", code: "ANSWER_TOO_LARGE" }]);
  });
  it("D3-F boundary-valid legacy text (exactly the bound, ASCII and multi-byte Arabic) is kept byte-for-byte (pin)", () => {
    const exact = { kind: "text", value: textOfBytes(LIMIT) };
    expect(bytes(exact)).toBe(LIMIT);
    expect(normalizeDraftAnswers({ q1: exact }, EX())).toEqual({ answers: { q1: exact }, rejected: [] });
    const arabic = { kind: "text", value: "ب".repeat(20000) };                       // the openResponse character cap, 2 bytes per letter
    expect(normalizeDraftAnswers({ q1: arabic }, EX())).toEqual({ answers: { q1: arabic }, rejected: [] });
  });
  it("D3-F' sparse sequence / table answers (unfilled cells are JSON null) stay valid exactly as the client sends them (pin)", () => {
    const sparse = JSON.parse(JSON.stringify({ q4: (() => { const v = []; v[1] = "ثانيًا"; return { kind: "sequence", values: v }; })(), q8: (() => { const v = []; v[1] = "B"; return { kind: "table", values: v }; })() }));
    expect(normalizeDraftAnswers(sparse, EX())).toEqual({ answers: sparse, rejected: [] });
  });
});

describe("20G.1 D3 — valid answers and specialized contracts are unchanged", () => {
  it("D3-G every valid legacy answer keeps its exact normalized form (no refusal)", () => {
    expect(normalizeDraftAnswers(VALID(), EX())).toEqual({ answers: VALID(), rejected: [] });
  });
  it("D3-G' the 20G stress fixture (every family, kitchen-sink composite + compound) normalizes exactly as on the baseline (pin)", () => {
    const { exam, answers } = stressExam({ sections: 1, perSection: 30 });
    const r = normalizeDraftAnswers(answers, exam);
    expect(r.rejected).toEqual([]);
    pin("stressValid", digest(r.answers));
  });
  it("D3-H specialized families keep their own refusal codes on an unknown id — never replaced by ANSWER_QUESTION_UNKNOWN (pin)", () => {
    const r = normalizeDraftAnswers({
      gc: { kind: "code", language: "python", languageVersion: 1, source: "print(1)" },
      gt: { kind: "codeTemplate", language: "python", languageVersion: 1, values: { g: "x" } },
      gs: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions: [], state: null },
      gh: { kind: "hotspot", points: [{ x: 0.1, y: 0.1 }] },
      gk: { kind: "composite", parts: {}, contexts: {} }
    }, EX());
    expect(r.answers).toEqual({});
    expect(r.rejected).toEqual([{ id: "gc", code: "CODE_QUESTION_MISMATCH" }, { id: "gt", code: "CODE_QUESTION_MISMATCH" }, { id: "gs", code: "SMARTSIM_QUESTION_MISMATCH" }, { id: "gh", code: "HOTSPOT_QUESTION_MISMATCH" }, { id: "gk", code: "COMPOSITE_QUESTION_MISMATCH" }]);
  });
  it("D3-H' modern kinds hidden inside a compound part keep their mismatch codes; an unknown compound part id is refused (COMPOUND_PART_UNKNOWN)", () => {
    const r = normalizeDraftAnswers({ q3: { kind: "compound", parts: { p1: A.text("UDP"), x: { kind: "code", language: "python", languageVersion: 1, source: "1" }, ghost: A.text("v") }, extra: 1 } }, EX());
    expect(r.answers).toEqual({ q3: { kind: "compound", parts: { p1: A.text("UDP") } } });
    expect(r.rejected).toEqual([{ id: "q3.x", code: "CODE_QUESTION_MISMATCH" }, { id: "q3.ghost", code: "COMPOUND_PART_UNKNOWN" }]);
  });
  it("D3-J grading the normalized valid answers equals grading the raw valid answers (pin)", () => {
    expect(gradeExam(EX(), normalizeDraftAnswers(VALID(), EX()).answers)).toEqual(gradeExam(EX(), VALID()));
  });
  it("D3-N prototype-shaped payloads stay inert: Object.prototype untouched, nothing stored under __proto__, forbidden keys in fields refused", () => {
    const hostile = JSON.parse('{"__proto__":{"kind":"text","value":"x","polluted":1},"q7":{"kind":"fields","values":{"__proto__":{"polluted":1},"b1":"IP"}},"q3":{"kind":"compound","parts":{"__proto__":{"kind":"text","value":"x"},"p1":{"kind":"text","value":"UDP"}}}}');
    const r = normalizeDraftAnswers(hostile, EX());
    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(r.answers, "__proto__")).toBe(false);
    expect(Object.getPrototypeOf(r.answers)).toBe(Object.prototype);
    expect(r.answers).toEqual({ q3: { kind: "compound", parts: { p1: A.text("UDP") } } });
    expect(r.rejected).toEqual([{ id: "__proto__", code: "ANSWER_QUESTION_UNKNOWN" }, { id: "q7", code: "ANSWER_INVALID" }, { id: "q3.__proto__", code: "COMPOUND_PART_UNKNOWN" }]);
  });
  it("D3-O composite (20G E) and the networking exam (20G A) valid answers normalize exactly as on the baseline (pin)", () => {
    const a = normalizeDraftAnswers(PA.FULL.answers, examA());
    const delivery = sanitizeExamForStudent(examE(), { parametric: { assignmentId: "pin-20g1", studentId: "s", attemptNumber: 1 } });
    const e = normalizeDraftAnswers(PE.PERFECT.answers(delivery), examE());
    expect(a.rejected).toEqual([]);
    expect(e.rejected).toEqual([]);
    pin("examAFull", digest(a.answers));
    pin("examEPerfect", digest(e.answers));
  });
});

describe("20G.1 D3 — end to end through the real handlers (draft, restore, submit, review) — draft and submit share ONE authority", () => {
  const CANARY = "GHOST-20G1-CANARY";
  let p, aid;
  beforeAll(async () => {
    p = createPlatform({ students: { "ih-1": "طالب أ", "ih-2": "طالب ب", "ih-3": "طالب ج", "ih-4": "طالب د" } });
    const saved = await p.teacher.saveExam(EX());
    expect(saved.status).toBe(200);
    const pub = await p.teacher.publish(EX());
    expect(pub.ok, JSON.stringify(pub.steps.at(-1)?.jsonBody)).toBe(true);
    const as = await p.teacher.assign(EX().examId);
    expect(as.status, JSON.stringify(as.jsonBody)).toBe(200);
    aid = as.jsonBody.assignment.assignmentId;
  }, 120000);
  const junk = () => {
    const j = { ghost: { kind: "text", value: CANARY + "x".repeat(200000) }, q1: { kind: "text", value: "TCP", junk: CANARY }, f1: 5 };
    for (let i = 0; i < 5000; i++) j["g" + i] = A.text(CANARY);
    return j;
  };
  it("D3-I autosave → restore with junk mixed in stores ONLY the valid answers, byte-stable; a later valid save is unaffected (repeated saves)", async () => {
    const s = p.student("ih-1");
    expect((await s.start(aid)).status).toBe(200);
    expect((await s.draft(aid, { ...VALID(), ...junk(), q1: { kind: "text", value: "TCP", junk: CANARY } })).status).toBe(200);
    const doc = s.doc(aid);
    expect(JSON.stringify(doc)).not.toContain(CANARY);
    const restored = (await s.state(aid)).jsonBody.state.draftAnswers;
    expect(restored).toEqual({ ...VALID(), q1: A.text("TCP") });
    expect(bytes(doc)).toBeLessThan(20000);
    expect((await s.draft(aid, VALID())).status).toBe(200);
    expect((await s.state(aid)).jsonBody.state.draftAnswers).toEqual(VALID());
  });
  it("D3-L submit after a rejected draft: unknown ids never reach the completed attempt's answers; the score equals the valid-only score", async () => {
    const s = p.student("ih-2");
    expect((await s.start(aid)).status).toBe(200);
    expect((await s.draft(aid, junk())).status).toBe(200);
    const sub = await s.submit(aid, { ...VALID(), ...junk(), q1: A.text("TCP") });
    expect(sub.status).toBe(200);
    const att = s.attempt(aid);
    expect(JSON.stringify(att)).not.toContain(CANARY);
    expect(Object.keys(att.answers).sort()).toEqual(Object.keys(VALID()).sort());
    expect(att.score).toBe(gradeExam(EX(), VALID()).score);
    expect(bytes(s.doc(aid))).toBeLessThan(40000);
  });
  it("D3-M unknown ids and their content never appear in the teacher review payload", async () => {
    const r = await p.teacher.reviewGet(aid, "ih-2");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.jsonBody)).not.toContain(CANARY);
  });
  it("D3-N' an answer smuggled under an own __proto__ key is never graded: the grade and the stored answers agree (no prototype-chain answers)", async () => {
    const s = p.student("ih-4");
    expect((await s.start(aid)).status).toBe(200);
    const body = JSON.parse('{"__proto__":{"q1":{"kind":"text","value":"TCP"},"q2":{"kind":"choice","index":1}},"q6":{"kind":"numeric","value":"9.8"}}');
    const sub = await s.submit(aid, body);
    expect(sub.status).toBe(200);
    const att = s.attempt(aid), g = id => att.questionGrades.find(x => x.questionId === id);
    expect(att.answers).toEqual({ q6: { kind: "numeric", value: "9.8" } });
    expect(g("q2").score).toBe(0);                                                 // never graded from an answer the attempt does not record
    expect(g("q1")).toMatchObject({ score: 0 });
    expect(att.score).toBe(gradeExam(EX(), { q6: { kind: "numeric", value: "9.8" } }).score);
  });
  it("D3-K a malformed answer cannot take a firstNAnswered slot: the first VALID answered unit is the one counted", async () => {
    const s = p.student("ih-3");
    expect((await s.start(aid)).status).toBe(200);
    const sub = await s.submit(aid, { f1: { kind: "text", value: 7 }, f2: A.choice(0), ghostF: A.text("x") });
    expect(sub.status).toBe(200);
    const g = s.attempt(aid).questionGrades;
    expect(g.find(x => x.questionId === "f2")).toMatchObject({ score: 3, ignored: false });
    expect(g.find(x => x.questionId === "f1")).toMatchObject({ score: 0, manualReview: false });
    expect(s.attempt(aid).answers).toEqual({ f2: A.choice(0) });
  });
});
