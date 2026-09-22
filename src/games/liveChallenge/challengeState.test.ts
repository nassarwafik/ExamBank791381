import { describe, it, expect } from "vitest";
import { newQuestion } from "../../examBuilderState";
import type { BuilderQuestion } from "../../examTypes";
import {
  newChallengeDefinition, setChallengeTitle, addManualQuestion, addImportedQuestions,
  updateChallengeQuestion, duplicateChallengeQuestion, removeChallengeQuestion, moveChallengeQuestion,
  normalizeChallengeDefinition, challengeSummary,
} from "./challengeState";
import { CHALLENGE_COURSE_ID } from "../domain/challenge";

const ids = (d: { questions: { question: BuilderQuestion }[] }) => d.questions.map(q => q.question.examQuestionId);

describe("challengeState — pure authoring operations", () => {
  it("newChallengeDefinition is empty, pinned to the core course, schema v1", () => {
    const d = newChallengeDefinition({ challengeId: "c1", title: "تحدّي", now: "T" });
    expect(d).toMatchObject({ challengeId: "c1", title: "تحدّي", courseId: CHALLENGE_COURSE_ID, schemaVersion: 1, questions: [] });
    expect(d.createdAt).toBe("T");
  });

  it("addManualQuestion appends a canonical question of the chosen type (manual source)", () => {
    let d = newChallengeDefinition({ challengeId: "c1" });
    d = addManualQuestion(d, "multipleChoice");
    d = addManualQuestion(d, "cliFill");
    expect(d.questions.length).toBe(2);
    expect(d.questions[0].question.presentationType).toBe("multipleChoice");
    expect(d.questions[1].question.presentationType).toBe("cliFill");
    expect(d.questions.every(q => q.source.kind === "manual")).toBe(true);
  });

  it("importing snapshots the source deeply — later source edits do NOT change the challenge (isolation)", () => {
    const source = newQuestion("multipleChoice", { text: "الأصل", options: [{ text: "أ" }, { text: "ب" }] });
    let d = newChallengeDefinition({ challengeId: "c1" });
    d = addImportedQuestions(d, [{ question: source, source: { kind: "exam", sourceId: "EXAM-1", sourceTitle: "امتحان" } }]);
    const snap = d.questions[0].question;
    expect(snap.text).toBe("الأصل");
    expect(snap.examQuestionId).not.toBe(source.examQuestionId);          // fresh id — not linked to the source
    expect(d.questions[0].source).toEqual({ kind: "exam", sourceId: "EXAM-1", sourceTitle: "امتحان" });
    // mutate the ORIGINAL source object after import
    source.text = "عُدّل الأصل";
    (source.options as { text: string }[])[0].text = "مُعدّل";
    expect(d.questions[0].question.text).toBe("الأصل");                    // snapshot unchanged
    expect((d.questions[0].question.options as { text: string }[])[0].text).toBe("أ");
  });

  it("editing the challenge copy does NOT mutate the imported source object", () => {
    const source = newQuestion("shortAnswer", { text: "س" });
    let d = addImportedQuestions(newChallengeDefinition({ challengeId: "c1" }), [{ question: source, source: { kind: "bank" } }]);
    const id = d.questions[0].question.examQuestionId;
    d = updateChallengeQuestion(d, id, { text: "نص محرّر في التحدّي" });
    expect(d.questions[0].question.text).toBe("نص محرّر في التحدّي");
    expect(source.text).toBe("س");                                        // original source untouched
  });

  it("duplicate inserts a fresh-id copy right after; delete removes; order otherwise preserved", () => {
    let d = newChallengeDefinition({ challengeId: "c1" });
    d = addManualQuestion(d, "multipleChoice"); d = addManualQuestion(d, "trueFalse"); d = addManualQuestion(d, "ordering");
    const [a, b, c] = ids(d);
    d = duplicateChallengeQuestion(d, b);
    expect(d.questions.length).toBe(4);
    expect(ids(d)[0]).toBe(a); expect(ids(d)[1]).toBe(b); expect(ids(d)[3]).toBe(c);
    expect(ids(d)[2]).not.toBe(b);                                        // the copy has a new id
    expect(d.questions[2].question.presentationType).toBe("trueFalse");   // same content/type as its original
    d = removeChallengeQuestion(d, b);
    expect(ids(d).includes(b)).toBe(false);
    expect(d.questions.length).toBe(3);
  });

  it("move up/down reorders and clamps at the ends", () => {
    let d = newChallengeDefinition({ challengeId: "c1" });
    d = addManualQuestion(d, "multipleChoice"); d = addManualQuestion(d, "trueFalse"); d = addManualQuestion(d, "ordering");
    const [a, b, c] = ids(d);
    d = moveChallengeQuestion(d, c, -1);
    expect(ids(d)).toEqual([a, c, b]);
    d = moveChallengeQuestion(d, a, -1);                                  // already first → clamp, no change
    expect(ids(d)).toEqual([a, c, b]);
    d = moveChallengeQuestion(d, a, +1);
    expect(ids(d)).toEqual([c, a, b]);
  });

  it("setChallengeTitle renames; summary carries no question content", () => {
    let d = addManualQuestion(newChallengeDefinition({ challengeId: "c1" }), "multipleChoice");
    d = setChallengeTitle(d, "عنوان جديد");
    expect(d.title).toBe("عنوان جديد");
    const s = challengeSummary(d);
    expect(s).toEqual({ challengeId: "c1", title: "عنوان جديد", questionCount: 1, updatedAt: d.updatedAt });
    expect(JSON.stringify(s)).not.toContain("examQuestionId");
  });

  it("normalizeChallengeDefinition repairs/loads safely and drops junk questions", () => {
    expect(normalizeChallengeDefinition(null)).toBeNull();
    expect(normalizeChallengeDefinition({ title: "no id" })).toBeNull();
    const good = addManualQuestion(newChallengeDefinition({ challengeId: "c9", title: "t" }), "multipleChoice");
    const round = normalizeChallengeDefinition(JSON.parse(JSON.stringify(good)));
    expect(round?.questions.length).toBe(1);
    // junk entries and a missing source are tolerated
    const messy = { challengeId: "c9", questions: [{ nope: 1 }, { question: { examQuestionId: "q1", presentationType: "trueFalse", text: "", marks: 1 } }] };
    const norm = normalizeChallengeDefinition(messy)!;
    expect(norm.questions.length).toBe(1);
    expect(norm.questions[0].source).toEqual({ kind: "manual" });
    expect(norm.courseId).toBe(CHALLENGE_COURSE_ID);
  });

  it("operations are immutable — the input definition object is never mutated", () => {
    const d0 = addManualQuestion(newChallengeDefinition({ challengeId: "c1" }), "multipleChoice");
    const before = JSON.stringify(d0);
    addManualQuestion(d0, "trueFalse");
    duplicateChallengeQuestion(d0, ids(d0)[0]);
    removeChallengeQuestion(d0, ids(d0)[0]);
    expect(JSON.stringify(d0)).toBe(before);
  });
});
