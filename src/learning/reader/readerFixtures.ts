// Learning Materials — Phase 3: SYNTHETIC READER TEST FIXTURES ONLY.
//
// Imported only by *.test.tsx. NOT production content and never shown to real users (§72/§73). It provides a
// synthetic manifest + matching module bodies (covering every block shape and mixed provenance, plus a practice
// block that DOES carry an answer key so the secrecy tests have something to catch) and a controllable fake
// content API so lazy-load / cache / stale-load behaviour can be driven deterministically without any network.

import { deriveManifest, type LearningCourseContent, type ContentModule, type ContentPage, type LearningCourseManifest } from "../content/types";
import type { ReaderContentApi } from "./LearningReader";

const CID = "791381";
const src = (pdf: number, end?: number, printed?: number): ContentPage["source"] => ({ kind: "book", sourceId: CID, pdfPageStart: pdf, pdfPageEnd: end, printedPage: printed });

// A rich page exercising every block type + book/enrichment provenance. The practice block intentionally holds a
// full answer key (correct flag + answers + all feedback) so answer-key-secrecy tests can assert it never leaks.
export const ANSWER_KEY = {
  correctText: "Access",
  hint: "SECRET_HINT_XYZ",
  correctFeedback: "SECRET_CORRECT_XYZ",
  incorrectFeedback: "SECRET_INCORRECT_XYZ",
  explanation: "SECRET_EXPLANATION_XYZ",
  shortAnswer: "SECRET_SHORT_ANSWER_XYZ",
};

const richPage: ContentPage = {
  id: "p1", title: "صفحة غنية", order: 1, source: src(124, 125, 122),
  blocks: [
    { id: "p1-h", type: "heading", origin: "book", text: "عنوان داخلي", level: 2 },
    { id: "p1-t", type: "text", origin: "book", spans: [{ text: "منفذ " }, { text: "Access", style: "term", dir: "ltr" }, { text: " يربط جهازًا واحدًا؛ الأمر " }, { text: "switchport", style: "code", dir: "ltr" }, { text: "." }] },
    { id: "p1-c", type: "callout", origin: "book", kind: "summary", title: "الخلاصة", spans: [{ text: "Access لجهاز، Trunk للربط." }] },
    { id: "p1-img", type: "image", origin: "book", src: "/learning/791381/x.png", alt: "رسم توضيحي للمنافذ" },
    { id: "p1-ex", type: "example", origin: "book", mode: "solved", title: "تحويل عدد", prompt: "حوّل 44 إلى ثنائي", steps: [{ text: "32 + 8 + 4 = 44" }], result: "00101100", explanation: "اجمع القيم." },
    { id: "p1-tbl", type: "table", origin: "book", caption: "قيم", headers: ["A", "B"], rows: [["1", "0"], ["0", "1"]] },
    { id: "p1-code", type: "code", origin: "book", language: "cli", dir: "ltr", code: "Switch(config)# vlan 10" },
    { id: "p1-dia", type: "diagram", origin: "book", src: "/learning/791381/d.png", alt: "مخطط الشبكة" },
    { id: "p1-dia2", type: "diagram", origin: "book", alt: "مخطط بلا صورة" },
    { id: "p1-clar", type: "callout", origin: "teacher-enrichment", kind: "clarification", title: "توضيح المعلم", spans: [{ text: "توضيح إضافي من المعلم." }] },
    { id: "p1-ex2", type: "example", origin: "teacher-enrichment", mode: "practice", title: "تصنيف المنفذ", prompt: "صنّف المنفذ", steps: [{ text: "اعدد الأجهزة" }] },
    {
      id: "p1-prac", type: "practice", origin: "teacher-enrichment",
      question: {
        kind: "multipleChoice", prompt: "أي وضع لجهاز واحد؟",
        options: [{ id: "o1", text: "Access", correct: true }, { id: "o2", text: "Trunk" }],
        feedback: { hint: ANSWER_KEY.hint, correctFeedback: ANSWER_KEY.correctFeedback, incorrectFeedback: ANSWER_KEY.incorrectFeedback, explanation: ANSWER_KEY.explanation },
      },
    },
    { id: "p1-sim", type: "simulation", origin: "teacher-enrichment", simulationType: "vlan", version: 1, title: "محاكاة VLAN", description: "توزيع المنافذ." },
  ],
};

const shortPage = (id: string, order: number, pdf: number, title: string): ContentPage => ({
  id, title, order, source: src(pdf),
  blocks: [
    { id: id + "-t", type: "text", origin: "book", spans: [{ text: title }] },
    { id: id + "-p", type: "practice", origin: "teacher-enrichment", question: { kind: "shortInput", prompt: "اكتب الإجابة", answer: ANSWER_KEY.shortAnswer } },
  ],
});

/** Full synthetic course: m1 (2 lessons), m2 (1 lesson), m3 (1 lesson, body NOT served → "unavailable"). */
export const readerCourse: LearningCourseContent = {
  schemaVersion: 1, courseId: CID, title: "كتاب اختبار القارئ", direction: "rtl",
  modules: [
    {
      id: "m1", title: "الوحدة الأولى", order: 1, lessons: [
        { id: "m1-l1", title: "الدرس الأول", order: 1, pages: [richPage, shortPage("p2", 2, 9, "صفحة ٢")] },
        { id: "m1-l2", title: "الدرس الثاني", order: 2, pages: [shortPage("p3", 1, 10, "صفحة ٣"), shortPage("p4", 2, 11, "صفحة ٤")] },
      ],
    },
    {
      id: "m2", title: "الوحدة الثانية", order: 2, lessons: [
        { id: "m2-l1", title: "درس", order: 1, pages: [shortPage("p5", 1, 20, "صفحة ٥"), shortPage("p6", 2, 21, "صفحة ٦")] },
      ],
    },
    {
      id: "m3", title: "الوحدة الثالثة", order: 3, lessons: [
        { id: "m3-l1", title: "درس", order: 1, pages: [shortPage("p7", 1, 30, "صفحة ٧")] },
      ],
    },
  ],
};

export const readerManifest: LearningCourseManifest = deriveManifest(readerCourse);
/** Bodies served by the fake API — m3 is intentionally omitted so it renders the "قيد الإعداد" state. */
export const readerBodies = new Map<string, ContentModule>(readerCourse.modules.filter(m => m.id !== "m3").map(m => [m.id, m]));

// ── Controllable fake content API ───────────────────────────────────────────────────────────────────────────
type Deferred = { moduleId: string; resolve: () => void; reject: (e: unknown) => void };

/** A fake API whose module loads resolve immediately (microtask). Records module-load calls + manifest-load count. */
export function makeImmediateApi(overrides?: Partial<ReaderContentApi>): ReaderContentApi & { calls: string[]; manifestCalls: () => number } {
  const calls: string[] = [];
  let manifestCount = 0;
  return {
    loadManifest: async () => { manifestCount++; return readerManifest; },
    hasModule: (_c, m) => readerBodies.has(m),
    loadModule: async (_c, m) => { calls.push(m); const body = readerBodies.get(m); if (!body) throw new Error("no body"); return body; },
    calls,
    manifestCalls: () => manifestCount,
    ...overrides,
  };
}

/** A fake API whose module loads stay pending until you resolve them by module id — for stale-load ordering tests. */
export function makeDeferredApi() {
  const calls: string[] = [];
  const pending: Deferred[] = [];
  const api: ReaderContentApi = {
    loadManifest: async () => readerManifest,
    hasModule: (_c, m) => readerBodies.has(m),
    loadModule: (_c, m) => {
      calls.push(m);
      return new Promise<ContentModule>((resolve, reject) => {
        pending.push({ moduleId: m, resolve: () => resolve(readerBodies.get(m)!), reject });
      });
    },
  };
  return {
    api, calls,
    pendingCount: () => pending.length,
    resolveModule: (moduleId: string) => {
      const i = pending.findIndex(p => p.moduleId === moduleId);
      if (i >= 0) pending.splice(i, 1)[0].resolve();
    },
  };
}
