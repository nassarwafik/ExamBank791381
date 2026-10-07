import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import * as K from "./certification-20g/kit.js";

// Phase 20G.3 — TABLE SECURITY ACCEPTANCE FIXTURE. Six legacy tables (A–F) published through the real governance chain, assigned, and answered
// end to end through the real handlers: normalize (ingest binder) → saveDraft → GET state (restore) → submit (official grade) → teacher review.
// The student-side control of every row is read from the SANITIZED delivery (what the student card actually draws from) through the shared
// table authority. Two students: an EXPERT (the correct answers, as the card can emit them) and an ATTACKER (the L-F2 playbook: blank /
// arbitrary cells, a first-row-only sparse array, tick everything). The ledger below is derived by hand from the 20G.3 rules — not from the code.
// D / F are shortAnswer questions: the card's check-box rows come from the question's phrasing, whatever its type (a tableFill without a
// field grid is refused by the server finalization gate: "a table with no answerable cell"). C / E carry per-field `correct` values, which
// the finalization gate requires for matching pairs (it refuses a pair whose `correct` is not among its options — so the exact LIB-F06-Q41
// shape cannot be published through governance; it reaches students only through the library). E therefore carries offerable per-field
// `correct` values while its answer.text KEY — the only thing the legacy table grader reads — names values its selects never offer.
//
//   id  shape (marks)                                   drawn rows            expert answer → score         attacker answer → score (baseline)
//   A   shortAnswer, data table, key names no row (4)   text ×2               ["255.255.255.0"] → 0 review  ["x"] → 0 review          (4)
//   B   keyed text table Router/Switch/Hub (6)          text ×3               ["3","2","1"] → 6             [ "3" ] → 2 (1 of 3 rows) (6)
//   C   matching, select rows (6)                       select ×3             all three → 6                 ["تطبيقات"] → 2           (6)
//   D   check-box table, key lists rows 1 and 3 (6)     checkbox ×3           [✓,·,✓] → 6                   [✓] → 4 (rows 1, 2 right) (6)
//   E   select rows, key never offerable (Q41) (4)      select ×2             any → 0 review                any → 0 review            (0)
//   F   check-box, substring labels IP/RIP/…/AA (8)     checkbox ×8           exact ticks → 8               tick all → 4 (4 of 8)     (8)
//   total 34                                            expert 26 (+8 pending review: A, E)    attacker 12 (+8 pending)    baseline attacker 30
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./certification-20g/platform.js");
const { legacyTableCellControl, parseTable } = require_("../src/lib/shared-finalization/legacyTableSemantics.js");

const OPTS = [{ text: "تطبيقات" }, { text: "شبكة" }, { text: "ربط" }];
const Q41_OPTS = [{ value: "الدقة أقل من اللازم" }, { value: "الدقة أعلى من اللازم" }, { value: "الوحدات بالبكسل" }, { value: "مقاييس غير صحيحة" }];
const QA = { examQuestionId: "ta", presentationType: "shortAnswer", marks: 4, text: "من الجدول، ما قناع الشبكة؟\n| الجهاز | IP |\n|---|---|\n| PC1 | 10.0.0.5 |\n| PC2 | 10.0.0.6 |", answer: { text: "255.255.255.0" } };
const QB = { examQuestionId: "tb", presentationType: "shortAnswer", marks: 6, text: "أكمل رقم الطبقة\n| الجهاز | الطبقة |\n|---|---|\n| Router | |\n| Switch | |\n| Hub | |", answer: { text: "Router=3؛ Switch=2؛ Hub=1" } };
const QC = { examQuestionId: "tc", presentationType: "matching", marks: 6, text: "طابق\n| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP |  |\n| IP |  |\n| Ethernet |  |",
  fields: [{ id: "m0", label: "HTTP", kind: "select", options: OPTS, correct: "تطبيقات" }, { id: "m1", label: "IP", kind: "select", options: OPTS, correct: "شبكة" }, { id: "m2", label: "Ethernet", kind: "select", options: OPTS, correct: "ربط" }], answer: { text: "HTTP=تطبيقات;IP=شبكة;Ethernet=ربط" } };
const QD = { examQuestionId: "td", presentationType: "shortAnswer", marks: 6, text: "وضع علامة ✓ أمام العناوين الخاصة\n| العنوان | خاص |\n|---|---|\n| 10.0.0.1 | |\n| 8.8.8.8 | |\n| 192.168.1.10 | |", answer: { text: "10.0.0.1، 192.168.1.10" } };
const QE = { examQuestionId: "te", presentationType: "matching", marks: 4, text: "حدد سبب الخطأ في النافذتين.\n\n| البند | الإجابة |\n| --- | --- |\n| 1 | |\n| 2 | |",
  fields: [{ id: "f0", label: "1", order: 0, kind: "select", options: Q41_OPTS, correct: "الدقة أقل من اللازم" }, { id: "f1", label: "2", order: 1, kind: "select", options: Q41_OPTS, correct: "الوحدات بالبكسل" }], answer: { text: "1=1؛ 2=3" } };
const QF = { examQuestionId: "tf", presentationType: "shortAnswer", marks: 8, text: "وضع علامة أمام بروتوكولات التوجيه والشبكات الافتراضية والآمنة\n| البروتوكول | ✓ |\n|---|---|\n| IP | |\n| RIP | |\n| LAN | |\n| VLAN | |\n| HTTP | |\n| HTTPS | |\n| A | |\n| AA | |", answer: { text: "RIP، VLAN، HTTPS، AA" } };
const EXAM = () => K.exam("TBL-ACC-20G3", "جداول 20G.3", [K.section("s1", "الجداول", [QA, QB, QC, QD, QE, QF].map(q => ({ ...q })))]);
const T = values => ({ kind: "table", values });
// the sparse array StudentExamPage.setTable builds (holes serialize to null), exactly as the browser posts it
const ui = (...cells) => { let v = []; for (const [i, x] of cells) { v = [...v]; v[i] = x; } return JSON.parse(JSON.stringify(T(v))); };

const EXPERT = { ta: T(["255.255.255.0"]), tb: T(["3", "2", "1"]), tc: T(["تطبيقات", "شبكة", "ربط"]), td: ui([0, true], [2, true]), te: T(["الدقة أقل من اللازم", "الوحدات بالبكسل"]), tf: ui([1, true], [3, true], [5, true], [7, true]) };
const ATTACKER = { ta: ui([0, "x"]), tb: ui([0, "3"]), tc: ui([0, "تطبيقات"]), td: ui([0, true]), te: T(["الدقة أعلى من اللازم", "مقاييس غير صحيحة"]), tf: T([true, true, true, true, true, true, true, true]) };
const LEDGER = {
  expert: { ta: [0, true], tb: [6, false], tc: [6, false], td: [6, false], te: [0, true], tf: [8, false], score: 26, review: 8 },
  attacker: { ta: [0, true], tb: [2, false], tc: [2, false], td: [4, false], te: [0, true], tf: [4, false], score: 12, review: 8 }
};

describe("20G.3 table security acceptance — normalize → save → restore → submit → grade → review, through the real handlers", () => {
  let p, aid;
  beforeAll(async () => {
    p = createPlatform({ students: { "t3-expert": "خبير", "t3-attacker": "مهاجم" } });
    expect((await p.teacher.saveExam(EXAM())).status).toBe(200);
    const pub = await p.teacher.publish(EXAM());
    expect(pub.ok, JSON.stringify(pub.steps.at(-1)?.jsonBody)).toBe(true);
    aid = (await p.teacher.assign(EXAM().examId)).jsonBody.assignment.assignmentId;
  }, 120000);

  it("ACC-0 the sanitized delivery carries no key, and the shared authority's per-row controls over it are the drawn controls of the ledger", async () => {
    const s = p.student("t3-expert");
    expect((await s.start(aid)).status).toBe(200);
    const d = await s.deliver(aid);
    expect(d.status).toBe(200);
    const qs = Object.fromEntries(d.jsonBody.assignment.exam.sections.flatMap(x => x.questions).map(q => [q.examQuestionId, q]));
    expect(JSON.stringify(qs)).not.toMatch(/255\.255\.255\.0|Router=3|192\.168\.1\.10،|1=1؛/);
    const controls = id => parseTable(qs[id].text).rows.map((_r, i) => legacyTableCellControl(qs[id], i));
    expect(controls("ta")).toEqual(["text", "text"]);
    expect(controls("tb")).toEqual(["text", "text", "text"]);
    expect(controls("tc")).toEqual(["select", "select", "select"]);
    expect(controls("td")).toEqual(["checkbox", "checkbox", "checkbox"]);
    expect(controls("te")).toEqual(["select", "select"]);
    expect(controls("tf")).toEqual(Array(8).fill("checkbox"));
  });

  for (const [who, sid, answers] of [["expert", "t3-expert", EXPERT], ["attacker", "t3-attacker", ATTACKER]]) {
    it(`ACC-${who} draft → restore keeps every table answer as sent (sparse holes as null); submit grades exactly the hand ledger; review settles the pending marks`, async () => {
      const s = p.student(sid);
      if (who === "attacker") expect((await s.start(aid)).status).toBe(200);
      const draft = await s.draft(aid, answers);
      expect(draft.status, JSON.stringify(draft.jsonBody)).toBe(200);
      expect((await s.state(aid)).jsonBody.state.draftAnswers).toEqual(answers);                 // every answer is a valid table: nothing refused
      const sub = await s.submit(aid, answers);
      expect(sub.status, JSON.stringify(sub.jsonBody)).toBe(200);
      const att = s.attempt(aid);
      expect(att.answers).toEqual(answers);
      const L = LEDGER[who];
      for (const id of ["ta", "tb", "tc", "td", "te", "tf"]) expect([att.questionGrades.find(g => g.questionId === id).score, !!att.questionGrades.find(g => g.questionId === id).manualReview], `${who} ${id}`).toEqual(L[id]);
      expect(att.score).toBe(L.score);
      // the teacher sees the pending items and settles them; the official auto-graded rows are never re-scored by the review
      const rv = await p.teacher.reviewGet(aid, sid);
      expect(rv.status).toBe(200);
      const award = who === "expert" ? { ta: { score: 4 }, te: { score: 4 } } : { ta: { score: 0 }, te: { score: 0 } };
      expect((await p.teacher.saveReview(aid, sid, award)).status).toBe(200);
      expect(s.attempt(aid).score).toBe(L.score + (who === "expert" ? 8 : 0));
    });
  }
});
