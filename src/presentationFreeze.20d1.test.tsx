// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import { render, cleanup, act, fireEvent, screen } from "@testing-library/react";
import ExamPreview from "./ExamPreview";
import StudentExamPage from "./StudentExamPage";
import StudentQuestionCard, { type Question } from "./StudentQuestionCard";
import StructuredExamCover from "./StructuredExamCover";
import { ScenarioContextView } from "./scenario/ScenarioView";
import { projectSectionScenariosForStudent } from "./scenarioSource";
import { parseTable, promptText } from "./questionContent";
import { EXAM_THEMES, normalizeExamTheme, THEME_LABELS } from "./examTheme";
import { normalizeCoverPage, examMarksDistribution } from "./examCover";
import { normalizeExamStructure } from "./examStructure";
import { QUESTION_TYPE_CATALOG } from "./questionTypeCatalog";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam } from "./composite/compositeFixtures";
import { sanitizeExamForStudent } from "../api/src/lib/student-exam-sanitize.js";
import { gradeExam } from "../api/src/lib/assignment-grading.js";

// Phase 20D.1 — the PRESENTATION FREEZE. The enterprise presentation engine is OPT-IN (a new versioned `presentation` object / a new
// `richContent` field); an exam without them must render, sanitize and grade EXACTLY as on the baseline. These are PINS: the SHA-256
// digests below were captured on the untouched baseline 0b2208076610c95c993fca2f4b8c6461bb8cc887 (before any 20D.1 code) and must never
// change. A changed digest means a legacy exam silently changed — a release blocker, never a test to "update".
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const CAPTURE = process.env.CAPTURE_20D1_PINS;
const captured: Record<string, unknown> = {};
const pin = (name: string, actual: unknown) => { if (CAPTURE) { captured[name] = actual; fs.writeFileSync(CAPTURE, JSON.stringify(captured, null, 1)); return; } expect(actual, name).toEqual((PIN as Record<string, unknown>)[name]); };
const digest = (v: unknown) => crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
// useId-derived attributes vary with render order; everything else in the DOM is pinned byte-for-byte.
const domDigest = (html: string) => digest(html.replace(/\s(id|for|aria-labelledby|aria-describedby|aria-controls)="[^"]*"/g, ""));
const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MIXED_SECTIONS = () => [
  { id: "s1", title: "القسم الأول", instructions: "أجب عن جميع الأسئلة.", gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }], answer: { correctOptionIndex: 0 } },
    { examQuestionId: "q2", presentationType: "trueFalse", text: "الشمس نجم.", marks: 1, answer: { correct: true } },
    { examQuestionId: "q3", presentationType: "shortAnswer", text: "اكتب اسم بروتوكول التوجيه.", marks: 2, answer: { acceptedAnswers: ["OSPF"] } },
    { examQuestionId: "q4", presentationType: "tableFill", text: "أكمل الجدول:\n| الجهاز | VLAN |\n|---|---|\n| PC1 | |\n| PC2 | |", marks: 2, answer: {} },
    { examQuestionId: "q5", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.\nبالتفصيل.", marks: 3 },
    { examQuestionId: "q6", presentationType: "wordBank", text: "املأ الفراغات.", marks: 2, wordBank: ["router", "switch"], fields: [{ id: "f1", label: "الفراغ 1" }, { id: "f2", label: "الفراغ 2" }], answer: {} },
    { examQuestionId: "q7", presentationType: "multiTrueFalse", text: "حدّد الصواب.", marks: 2, fields: [{ id: "a", label: "IPv4 32 بت" }, { id: "b", label: "MAC 16 بت" }], answer: {} },
    { examQuestionId: "q8", presentationType: "open", text: "صف الصورة.", marks: 1, image: { exists: true, visible: true, assets: [{ dataUrl: PNG, origin: "uploaded" }] } },
    { examQuestionId: "q9", presentationType: "open", text: "ما ناتج البرنامج؟", marks: 2, codeStimulus: { language: "python", source: "for i in range(3):\n    print(i)" } }
  ] },
  { id: "s2", title: "القسم الثاني", instructions: "اقرأ المصادر ثم أجب.", gradingPolicy: "firstNAnswered", requiredAnswers: 1, answerUnit: "question", maxMarks: 2,
    scenarios: [{ id: "scn1", version: 1, title: "شبكة المدرسة", instructions: "ادرس المصادر.", questionIds: ["q10", "q11"], sources: [
      { id: "t1", version: 1, kind: "text", title: "وصف", text: "شبكة فيها موجّه ومبدّل." },
      { id: "tb1", version: 1, kind: "table", title: "الأجهزة", columnHeaders: ["الجهاز", "IP"], rows: [["R1", "192.168.1.1"], ["PC1", "192.168.1.10"]] },
      { id: "c1", version: 1, kind: "code", language: "python", source: "print('hi')" }
    ] }],
    questions: [
      { examQuestionId: "q10", presentationType: "multipleChoice", text: "ما عنوان الموجّه؟", marks: 2, options: [{ text: "192.168.1.1" }, { text: "192.168.1.10" }], answer: { correctOptionIndex: 0 } },
      { examQuestionId: "q11", presentationType: "open", text: "علّل.", marks: 2 }
    ] }
];
const MIXED = (theme: string, extra: Record<string, unknown> = {}) => ({ title: "امتحان العرض", metadata: {}, presentationTheme: theme, sections: MIXED_SECTIONS(), ...extra });
const COVER = { enabled: true, subtitle: "الفصل الأول", instructions: "اقرأ الأسئلة جيدًا.\nلا تستخدم الهاتف.", allowedMaterials: "آلة حاسبة", showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const STATE = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const assignment = (exam: unknown) => ({ assignmentId: "asg1", title: "واجب", instructions: "أجب بعناية.", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 11, totalMarks: 20, exam });
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (String(url).includes("/api/student-submission/")) return method === "GET" ? json(200, { ok: true, state: STATE }) : json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" });
    return json(404, { ok: false });
  }) as unknown as typeof fetch;
});

describe("20D.1 FREEZE — legacy themes and plain-text rendering (PINS captured on 0b22080)", () => {
  it("L-1 the six legacy themes are unchanged (names, labels, normalization)", () => {
    pin("themes", { themes: EXAM_THEMES, labels: THEME_LABELS, norm: ["", "cards", "nope", null, "modern", "MODERN"].map(v => normalizeExamTheme(v)) });
  });
  it("L-2 teacher preview DOM per legacy theme (structured exam, no presentation object)", async () => {
    for (const theme of EXAM_THEMES) {
      const { container, unmount } = render(<ExamPreview exam={MIXED(theme) as never} onClose={() => {}} />);
      await settle();
      pin("preview-" + theme, domDigest(container.innerHTML));
      unmount();
    }
  });
  for (const theme of EXAM_THEMES) it("L-3 the student exam page — legacy theme " + theme + " (root class, first page, scenario page)", async () => {
    const { container } = render(<StudentExamPage token="t" assignment={assignment(MIXED(theme)) as never} studentName="أحمد" className="العاشر" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    const root = container.querySelector("main")!;
    const first = domDigest(container.querySelector(".iex-page")!.outerHTML);
    for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    await settle();
    pin("student-" + theme, { rootClass: root.className, first, scenarioPage: domDigest(container.querySelector(".iex-page")!.outerHTML) });
  });
  for (const q of MIXED_SECTIONS().flatMap(sec => sec.questions)) it("L-4 legacy question card " + q.examQuestionId + " renders the plain q.text path byte-for-byte", async () => {
    const { container } = render(<StudentQuestionCard q={q as unknown as Question} index={0} id={q.examQuestionId} answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} onAnswer={() => {}} />);
    await settle();
    pin("card-" + q.examQuestionId, domDigest(container.innerHTML));
  });
  it("L-5 the legacy pipe-table parser and prompt splitter are unchanged", () => {
    const samples = ["أكمل الجدول:\n| الجهاز | VLAN |\n|---|---|\n| PC1 | |", "| a | b |\n| 1 | 2 |", "نص فقط", "سطر\n|x|\n", "| h |\n|:---:|\n| v |"];
    pin("parse", samples.map(s => ({ t: parseTable(s), p: promptText(s) })));
  });
  it("L-6 the cover page and the scenario view are unchanged", async () => {
    const cover = normalizeCoverPage(COVER)!;
    const norm = normalizeExamStructure(MIXED("default") as never);
    const c = render(<StructuredExamCover cover={cover} title="امتحان العرض" distribution={examMarksDistribution(norm as never)} preview onStart={() => {}} />);
    const coverDom = domDigest(c.container.innerHTML); c.unmount();
    const sc = projectSectionScenariosForStudent(MIXED_SECTIONS()[1] as never)![0];
    const s = render(<ScenarioContextView scenario={sc} open />);
    await settle();
    pin("cover-scenario", { coverDom, scenarioDom: domDigest(s.container.innerHTML), coverKeys: Object.keys(cover) });
  });
});

describe("20D.1 FREEZE — student delivery and grading (PINS captured on 0b22080)", () => {
  it("L-7 the student projection of legacy and composite exams is unchanged", () => {
    const exams = { mixed: MIXED("classic", { coverPage: COVER }), arabic: compositeArabicExam(), physics: compositePhysicsExam(), cs: compositeCsExam(), network: compositeNetworkExam() };
    pin("sanitize", Object.fromEntries(Object.entries(exams).map(([k, e]) => [k, digest(sanitizeExamForStudent(e, { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } }))])));
  });
  it("L-8 official grading of the legacy exam and the composite fixtures is unchanged", () => {
    const mixed = gradeExam(MIXED("classic"), { q1: { kind: "choice", index: 0 }, q2: { kind: "choice", index: 1 }, q3: { kind: "text", value: "ospf" }, q5: { kind: "text", value: "x" }, q10: { kind: "choice", index: 0 }, q11: { kind: "text", value: "y" } });
    const arabic = gradeExam(compositeArabicExam(), { q4: { kind: "composite", parts: { pA1: { kind: "choice", index: 0 }, pB1: { kind: "fields", values: { t1: "k1", t2: "k2" } }, pB2: { kind: "fields", values: { x1: "c1", x2: "c2" } }, pB3: { kind: "numeric", value: "70" } }, contexts: {} } });
    const scrub = (g: { score: number; totalMarks: number; manualReviewMarks?: number; questions: unknown[]; sections?: unknown }) => digest({ score: g.score, totalMarks: g.totalMarks, manualReviewMarks: g.manualReviewMarks, questions: g.questions, sections: g.sections });
    pin("grade", { mixed: scrub(mixed as never), arabic: scrub(arabic as never) });
  });
  // Phase 21A.1 inserts chartSelection@1 right after composite@1 (an additive type; every 20D.1 identity keeps its position)
  it("L-9 the production catalog is pinned (20D.1 added NO question type; 21A.1 adds chartSelection, 21A.2 adds functionGraphSelection, 21C adds scene3DSelection and 21D-B.3 adds meshPartSelection: 29 types)", () => {
    pin("catalog", QUESTION_TYPE_CATALOG.map(d => d.key + "@" + d.version));
  });
});

const PIN = {
 "themes": {
  "themes": [
   "default",
   "cards",
   "classic",
   "focus",
   "compact",
   "modern"
  ],
  "labels": {
   "default": {
    "name": "الافتراضي",
    "description": "الشكل الحالي للامتحان"
   },
   "cards": {
    "name": "بطاقات",
    "description": "كل سؤال يظهر داخل بطاقة مستقلة"
   },
   "classic": {
    "name": "ورقة امتحان",
    "description": "شكل قريب من الامتحان الورقي التقليدي"
   },
   "focus": {
    "name": "تركيز",
    "description": "سؤال واحد فقط في كل مرة"
   },
   "compact": {
    "name": "مدمج",
    "description": "مساحات أقل، رؤية أسئلة أكثر"
   },
   "modern": {
    "name": "حديث",
    "description": "واجهة عصرية ومريحة"
   }
  },
  "norm": [
   "default",
   "cards",
   "default",
   "default",
   "modern",
   "default"
  ]
 },
 "preview-default": "f9003f77fbc2410f9f848ea3e0619dcb2418dea5aa4aed8f32269131db7f1184",
 "preview-cards": "39dfbb695af643be19b89573be76b6fa662603f20870fb1ef019fb8ad6866cb2",
 "preview-classic": "a18bf20a4b79ff34096d1c08f665a354bcef1738dc11a1205f6bcb645c19a24d",
 "preview-focus": "09f8ce3db0bfe7a3c66006917a0b068cb80658e7cb20d1f1241395fac83adb9a",
 "preview-compact": "99f7275653ac6cf9f4e34ee7463a53a834dbc2b871d0d68093cdf14f9c3862a9",
 "preview-modern": "9f73395c5592d520d9f2ed1794553f9790be78b29b4b5297b31bed6ae05f19a3",
 "student-default": {
  "rootClass": "interactive-exam-page exam-theme-default",
  "first": "57a1fc167fbde98f7597bedf7182fef6bb22b0bdcf237e4452d71800fffc55e3",
  "scenarioPage": "f0f1ea67ccf90863d2a8d8c26c45d1018dd5c98ea6e0df32448ecc09b41ea219"
 },
 "student-cards": {
  "rootClass": "interactive-exam-page exam-theme-cards",
  "first": "57a1fc167fbde98f7597bedf7182fef6bb22b0bdcf237e4452d71800fffc55e3",
  "scenarioPage": "f0f1ea67ccf90863d2a8d8c26c45d1018dd5c98ea6e0df32448ecc09b41ea219"
 },
 "student-classic": {
  "rootClass": "interactive-exam-page exam-theme-classic",
  "first": "57a1fc167fbde98f7597bedf7182fef6bb22b0bdcf237e4452d71800fffc55e3",
  "scenarioPage": "f0f1ea67ccf90863d2a8d8c26c45d1018dd5c98ea6e0df32448ecc09b41ea219"
 },
 "student-focus": {
  "rootClass": "interactive-exam-page exam-theme-focus",
  "first": "57a1fc167fbde98f7597bedf7182fef6bb22b0bdcf237e4452d71800fffc55e3",
  "scenarioPage": "f0f1ea67ccf90863d2a8d8c26c45d1018dd5c98ea6e0df32448ecc09b41ea219"
 },
 "student-compact": {
  "rootClass": "interactive-exam-page exam-theme-compact",
  "first": "57a1fc167fbde98f7597bedf7182fef6bb22b0bdcf237e4452d71800fffc55e3",
  "scenarioPage": "f0f1ea67ccf90863d2a8d8c26c45d1018dd5c98ea6e0df32448ecc09b41ea219"
 },
 "student-modern": {
  "rootClass": "interactive-exam-page exam-theme-modern",
  "first": "57a1fc167fbde98f7597bedf7182fef6bb22b0bdcf237e4452d71800fffc55e3",
  "scenarioPage": "f0f1ea67ccf90863d2a8d8c26c45d1018dd5c98ea6e0df32448ecc09b41ea219"
 },
 "card-q1": "a031906eed24bd359527753f3bc258dd405c25457c4d07c2383e17d85f5a0728",
 "card-q2": "aa5534b87b67aa345879749754e31d82ed16b5416d5d090fe8559fffc9645bac",
 "card-q3": "6e128012860ac685658e8bf1b5bb7f79bfbfc8f10563711124bc9adac1a2315e",
 "card-q4": "0d0c987ead29a4fded03d4366f9752d9eb0d5b924fec5a84bc5c7931be140b08",
 "card-q5": "8e4e1123e045987a91ef6a934021daa3b1e3874e081bbd0166696c7c6945049b",
 "card-q6": "ab1cd551a4c90ed798f1650a2b18890dbdd8e192a719e920e0085fcfe6b812fd",
 "card-q7": "4b96d19edb2af7150a83fe5c27b1fd2eee69a6786a8861915548e53ae61786f5",
 "card-q8": "4ad5107c096a9953eb6cb85d94de7b11fb146a9ef36cf9301b5f4c5b4f66e94c",
 "card-q9": "7449137edfff94c6d50a62c4cb9df23158c1ad4b01dc3a2f2010b87e245b7687",
 "card-q10": "0edf8309d12e6bcf84b010e72e0fc120ce4b66b3c10f7e1cc230c0807124f5f8",
 "card-q11": "0ffba376bdfa08d1e5f9a9824165acfcf7229a5d10d6052353cd3767fd7c6e28",
 "parse": [
  {
   "t": {
    "headers": [
     "الجهاز",
     "VLAN"
    ],
    "rows": [
     [
      "PC1",
      ""
     ]
    ]
   },
   "p": "أكمل الجدول:"
  },
  {
   "t": {
    "headers": [
     "a",
     "b"
    ],
    "rows": [
     [
      "1",
      "2"
     ]
    ]
   },
   "p": "| a | b |"
  },
  {
   "t": null,
   "p": "نص فقط"
  },
  {
   "t": null,
   "p": "سطر"
  },
  {
   "t": {
    "headers": [
     "h"
    ],
    "rows": [
     [
      "v"
     ]
    ]
   },
   "p": "| h |"
  }
 ],
 "cover-scenario": {
  "coverDom": "e84eb071ab05b8d17fa552aa1ae9bc535dc4a570630d28c0ac825e3f81908d75",
  "scenarioDom": "b7490fb3a182b2a3dc5a18f96fdeba0999faa68dad16c8947854ecfa6a58549f",
  "coverKeys": [
   "enabled",
   "activityType",
   "subtitle",
   "instructions",
   "allowedMaterials",
   "showStudentName",
   "showClassName",
   "showExamDate",
   "showDuration",
   "showTotalMarks",
   "showMarksDistribution"
  ]
 },
 "sanitize": {
  "mixed": "37ee4584785ee10171c1c49712b105cd275cb990a2a9d4c9b2e5b545e3a1c463",
  "arabic": "275dc74d8ba8b82869ccdcf6bd6475b1411b314e7a23183ad6bc175791a323dc",
  "physics": "e6294bd6f170b9811c19abad9f91b4577fccb159b9a1b9f9e452042a82b80034",
  "cs": "8e988b9000b71257013cdc377154cbdb85d51c2a72472fd2cca11b35730d035a",
  "network": "11128f25e5ab40d7e0ac303a3f300feab303a556b75c404ad3e728fb68a6b66f"
 },
 "grade": {
  "mixed": "da329ad806cc5f46c2338e61c716b24dacbac4c1ae5f0b972e121425940534b7",
  "arabic": "0dc77d40c8efddef12e2d8491c28768589f633df1cfc864ef80f0bc204b57c64"
 },
 "catalog": [
  "multipleChoice@1",
  "trueFalse@1",
  "multiTrueFalse@1",
  "shortAnswer@1",
  "fillBlank@1",
  "wordBank@1",
  "matching@1",
  "ordering@1",
  "tableFill@1",
  "cliFill@1",
  "compound@1",
  "composite@1",
  "chartSelection@1",
  // Phase 21A.2: additive function graph question; original catalog identities and order remain frozen.
  "functionGraphSelection@1",
  // Phase 21C: additive semantic selection on interactive 3D scenes.
  "scene3DSelection@1",
  // Phase 21D-B.3: additive named-part selection on realistic 3D mesh models.
  "meshPartSelection@1",
  "multipleSelect@1",
  "numericResponse@1",
  "matrix@1",
  "categorization@1",
  "simulation@1",
  "coding@3",
  "networkCli@1",
  "inlineCloze@1",
  "parametricNumeric@1",
  "hotspot@1",
  "labelDiagram@1",
  "openResponse@1",
  "smartSim@1"
 ]
};
