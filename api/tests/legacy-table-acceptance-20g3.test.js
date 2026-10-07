import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import * as K from "./certification-20g/kit.js";

// Phase 20G.3 — TABLE SECURITY ACCEPTANCE FIXTURE (directive §25). Legacy tables published through the real governance chain, assigned, and
// answered end to end through the real handlers: normalize (ingest binder) → saveDraft → GET state (restore) → submit (official grade) →
// teacher review. The student-side control of every row is read from the SANITIZED delivery (what the student card draws from) through the
// shared table authority. Two students: an EXPERT (the correct answers, as the card can emit them) and an ATTACKER (the L-F2 playbook: blank /
// arbitrary cells, a first-row-only sparse array, tick everything, a historical table answer on a grid, a forged table on a part / child).
// The ledger is derived by hand from the 20G.3 rules — not from the code.
//
//   id   shape (marks)                                       drawn rows      expert → score             attacker → score            c2a49e9 attacker
//   A    keyed text table Router/Switch/Hub (6)              text ×3         ["3","2","1"] → 6          ["3"] (row 1 only) → 2      6
//   B    check-box table, key lists rows 1 and 3 (6)         checkbox ×3     [✓,·,✓] → 6                [✓] → 4 (rows 1, 2 right)   6
//   C    matching, select rows (6)                           select ×3       all three → 6              ["تطبيقات"] → 2             6
//   D    AMBIGUOUS data table, key names no row (4)          text ×2         [key] → 0 + review         ["x"] → 0 + review          4
//   E    tableFill grid (4)                                  none (grid)     fields → 4                 historical table → 0 + rev. 0 + review
//   F1   compound, matching part with a table (4)            none (part)     part fields → 4            forged part table → refused → 0 + rev.*
//   F2   composite, matching child with a table (4)          none (child)    child fields → 4           forged child table → refused → 0 + rev.*
//   G    select rows, key never offerable (LIB-F06-Q41) (4)  select ×2       any → 0 + review           any → 0 + review            0
//   H    check-box, substring labels IP/RIP/…/AA (8)         checkbox ×8     exact ticks → 8            tick all → 4 (4 of 8)       8
//   total 46            expert 38 (+8 pending: D, G)            attacker 12 (+20 pending: D, E, F1, F2, G)
//   * the refused part leaves an EMPTY compound / composite answer, which both c2a49e9 and the head grade 0 + teacher review (unanswered
//     part; existing compound / composite semantics, unchanged): the forgery never reaches any grader and earns nothing.
//
// B / H are shortAnswer questions: the card's check-box rows come from the question's phrasing, whatever its type (a tableFill without a
// field grid is refused by the server finalization gate: "a table with no answerable cell"). The finalization gate refuses a matching pair
// whose `correct` is not among its options — so the exact LIB-F06-Q41 shape cannot be published through governance (it reaches students
// only through the library); G therefore carries offerable per-field `correct` values while its answer.text KEY — the only thing the legacy
// table grader reads — names values its selects never offer.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./certification-20g/platform.js");
const { legacyTableCellControl, parseTable } = require_("../src/lib/shared-finalization/legacyTableSemantics.js");
const { A } = K;

const OPTS = [{ text: "تطبيقات" }, { text: "شبكة" }, { text: "ربط" }];
const Q41_OPTS = [{ value: "الدقة أقل من اللازم" }, { value: "الدقة أعلى من اللازم" }, { value: "الوحدات بالبكسل" }, { value: "مقاييس غير صحيحة" }];
const PART_TABLE = "طابق\n| البروتوكول | الطبقة |\n|---|---|\n| HTTP | |\n| IP | |";
const QA = { examQuestionId: "ta", presentationType: "shortAnswer", marks: 6, text: "أكمل رقم الطبقة\n| الجهاز | الطبقة |\n|---|---|\n| Router | |\n| Switch | |\n| Hub | |", answer: { text: "Router=3؛ Switch=2؛ Hub=1" } };
const QB = { examQuestionId: "tb", presentationType: "shortAnswer", marks: 6, text: "وضع علامة ✓ أمام العناوين الخاصة\n| العنوان | خاص |\n|---|---|\n| 10.0.0.1 | |\n| 8.8.8.8 | |\n| 192.168.1.10 | |", answer: { text: "10.0.0.1، 192.168.1.10" } };
const QC = { examQuestionId: "tc", presentationType: "matching", marks: 6, text: "طابق\n| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP |  |\n| IP |  |\n| Ethernet |  |",
  fields: [{ id: "m0", label: "HTTP", kind: "select", options: OPTS, correct: "تطبيقات" }, { id: "m1", label: "IP", kind: "select", options: OPTS, correct: "شبكة" }, { id: "m2", label: "Ethernet", kind: "select", options: OPTS, correct: "ربط" }],
  answer: { text: "HTTP=تطبيقات;IP=شبكة;Ethernet=ربط" } };
const QD = { examQuestionId: "td", presentationType: "shortAnswer", marks: 4, text: "من الجدول، ما قناع الشبكة؟\n| الجهاز | IP |\n|---|---|\n| PC1 | 10.0.0.5 |\n| PC2 | 10.0.0.6 |", answer: { text: "255.255.255.0" } };
const QE = K.tableFill("te", "املأ الجدول", 4, ["المنفذ", "الرقم"], [["DNS", ""], ["DHCP", ""]], [["c1", 0, 1, "53"], ["c2", 1, 1, "67"]]);
const QF1 = K.compound("tf1", "مركّب", 4, [K.part("a", "أ", K.matching("x", PART_TABLE, 4, [["p0", "HTTP", "تطبيقات"], ["p1", "IP", "شبكة"]], ["تطبيقات", "شبكة"]))]);
const QF2 = K.composite("tf2", "مركّب حديث", 4, [], [K.group("g", "g", [K.part("a", "أ", K.matching("y", PART_TABLE, 4, [["p0", "HTTP", "تطبيقات"], ["p1", "IP", "شبكة"]], ["تطبيقات", "شبكة"]))])]);
const QG = { examQuestionId: "tg", presentationType: "matching", marks: 4, text: "حدد سبب الخطأ في النافذتين.\n\n| البند | الإجابة |\n| --- | --- |\n| 1 | |\n| 2 | |",
  fields: [{ id: "f0", label: "1", order: 0, kind: "select", options: Q41_OPTS, correct: "الدقة أقل من اللازم" }, { id: "f1", label: "2", order: 1, kind: "select", options: Q41_OPTS, correct: "الوحدات بالبكسل" }],
  answer: { text: "1=1؛ 2=3" } };
const QH = { examQuestionId: "th", presentationType: "shortAnswer", marks: 8, text: "وضع علامة أمام بروتوكولات التوجيه والشبكات الافتراضية والآمنة\n| البروتوكول | ✓ |\n|---|---|\n| IP | |\n| RIP | |\n| LAN | |\n| VLAN | |\n| HTTP | |\n| HTTPS | |\n| A | |\n| AA | |", answer: { text: "RIP، VLAN، HTTPS، AA" } };
const QUESTIONS = [QA, QB, QC, QD, QE, QF1, QF2, QG, QH];
const EXAM = () => K.exam("TBL-ACC-20G3", "جداول 20G.3", [K.section("s1", "الجداول", QUESTIONS.map(q => JSON.parse(JSON.stringify(q))))]);
const T = values => ({ kind: "table", values });
// the sparse array StudentExamPage.setTable builds (holes serialize to null), exactly as the browser posts it
const ui = (...cells) => { let v = []; for (const [i, x] of cells) { v = [...v]; v[i] = x; } return JSON.parse(JSON.stringify(T(v))); };

const EXPERT = { ta: T(["3", "2", "1"]), tb: ui([0, true], [2, true]), tc: T(["تطبيقات", "شبكة", "ربط"]), td: T(["255.255.255.0"]), te: A.fields({ c1: "53", c2: "67" }),
  tf1: A.compound({ a: A.fields({ p0: "تطبيقات", p1: "شبكة" }) }), tf2: A.composite({ a: A.fields({ p0: "تطبيقات", p1: "شبكة" }) }, {}),
  tg: T(["الدقة أقل من اللازم", "الوحدات بالبكسل"]), th: ui([1, true], [3, true], [5, true], [7, true]) };
const ATTACKER = { ta: ui([0, "3"]), tb: ui([0, true]), tc: ui([0, "تطبيقات"]), td: ui([0, "x"]), te: T(["53", "67"]),
  tf1: A.compound({ a: T([false, false]) }), tf2: A.composite({ a: T(["تطبيقات", "شبكة"]) }, {}),
  tg: T(["الدقة أعلى من اللازم", "مقاييس غير صحيحة"]), th: T([true, true, true, true, true, true, true, true]) };
// what the ingest binder keeps: the forged part / child tables are refused (ANSWER_KIND_MISMATCH) and never stored
const STORED = { expert: EXPERT, attacker: { ...ATTACKER, tf1: A.compound({}), tf2: A.composite({}, {}) } };
const LEDGER = {
  expert: { ta: [6, false], tb: [6, false], tc: [6, false], td: [0, true], te: [4, false], tf1: [4, false], tf2: [4, false], tg: [0, true], th: [8, false], score: 38, award: { td: { score: 4 }, tg: { score: 4 } }, final: 46 },
  attacker: { ta: [2, false], tb: [4, false], tc: [2, false], td: [0, true], te: [0, true], tf1: [0, true], tf2: [0, true], tg: [0, true], th: [4, false], score: 12, award: { td: { score: 0 }, te: { score: 0 }, tf1: { score: 0 }, tf2: { score: 0 }, tg: { score: 0 } }, final: 12 }
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
    expect(JSON.stringify(qs)).not.toMatch(/255\.255\.255\.0|Router=3|192\.168\.1\.10،|1=1؛|RIP، VLAN/);
    const controls = id => parseTable(qs[id].text).rows.map((_r, i) => legacyTableCellControl(qs[id], i));
    expect(controls("ta")).toEqual(["text", "text", "text"]);
    expect(controls("tb")).toEqual(["checkbox", "checkbox", "checkbox"]);
    expect(controls("tc")).toEqual(["select", "select", "select"]);
    expect(controls("td")).toEqual(["text", "text"]);
    expect(parseTable(qs.te.text)).toBeNull();                                         // the grid is drawn from tableHeaders / tableRows (fields)
    expect(controls("tg")).toEqual(["select", "select"]);
    expect(controls("th")).toEqual(Array(8).fill("checkbox"));
  });

  for (const [who, sid, answers] of [["expert", "t3-expert", EXPERT], ["attacker", "t3-attacker", ATTACKER]]) {
    it(`ACC-${who} draft → restore keeps every admitted answer as sent (sparse holes as null, forged part tables refused); submit grades exactly the hand ledger; review settles the pending marks`, async () => {
      const s = p.student(sid);
      if (who === "attacker") expect((await s.start(aid)).status).toBe(200);
      const draft = await s.draft(aid, answers);
      expect(draft.status, JSON.stringify(draft.jsonBody)).toBe(200);
      expect((await s.state(aid)).jsonBody.state.draftAnswers).toEqual(STORED[who]);
      const sub = await s.submit(aid, answers);
      expect(sub.status, JSON.stringify(sub.jsonBody)).toBe(200);
      const att = s.attempt(aid);
      expect(att.answers).toEqual(STORED[who]);
      const L = LEDGER[who];
      for (const q of QUESTIONS) {
        const g = att.questionGrades.find(x => x.questionId === q.examQuestionId);
        expect([g.score, !!g.manualReview], `${who} ${q.examQuestionId}`).toEqual(L[q.examQuestionId]);
      }
      expect(att.score).toBe(L.score);
      // the teacher sees the pending items and settles them; the auto-graded rows are never re-scored by the review
      expect((await p.teacher.reviewGet(aid, sid)).status).toBe(200);
      expect((await p.teacher.saveReview(aid, sid, L.award)).status).toBe(200);
      expect(s.attempt(aid).score).toBe(L.final);
    });
  }
});
