// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import ExamPreview from "../ExamPreview";
import StudentExamPage from "../StudentExamPage";
import StudentQuestionCard, { type Question } from "../StudentQuestionCard";

// Phase 20D.1 — ONE trusted exam view for the student runtime AND the teacher preview. Fail-first on 0b22080: no presentation engine,
// the preview and the student page share no presentation root, rich content renders as nothing.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const settle = async () => { for (let i = 0; i < 15; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
const norm = (html: string) => html.replace(/\s(id|for|aria-labelledby|aria-describedby|aria-controls|name)="[^"]*"/g, "").replace(/\sdisabled=""/g, "");

const RICH = { schemaVersion: 1, blocks: [
  { type: "heading", level: 3, runs: [{ text: "معطيات الشبكة" }] },
  { type: "table", caption: "الأجهزة", columnHeaders: ["الجهاز", "VLAN", "IP"], rows: [["PC1", "10", "192.168.10.10"], ["PC2", "20", "192.168.20.10"]] },
  { type: "callout", variant: "info", runs: [{ text: "استخدم العناوين كما تظهر في الجدول." }] }
] };
const PRESENTATION = { schemaVersion: 1, preset: "networkLab", components: { questionCard: { variant: "elevated" }, marksBadge: { variant: "pill" }, table: { variant: "striped" } }, questionTypeVariants: { openResponse: "writingPaper" } };
const exam = (extra: Record<string, unknown> = {}) => ({ title: "امتحان الشبكات", metadata: {}, presentationTheme: "classic", presentation: PRESENTATION, sections: [
  { id: "s1", title: "VLAN", instructions: "أجب عن جميع الأسئلة.", instructionsRichContent: { schemaVersion: 1, blocks: [{ type: "callout", variant: "note", runs: [{ text: "اقرأ الجدول أولًا" }] }] }, presentation: { schemaVersion: 1, components: { sectionHeader: { variant: "band" } } }, gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", text: "ادرس معطيات الشبكة التالية ثم أجب.", richContent: RICH, marks: 10, options: [{ text: "VLAN 10" }, { text: "VLAN 20" }] },
    { examQuestionId: "q2", presentationType: "open", text: "علّل.", marks: 2, presentation: { schemaVersion: 1, width: "wide" } }
  ] }
], ...extra });

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const STATE = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const assignment = (e: unknown) => ({ assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 2, totalMarks: 12, exam: e });
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => String(url).includes("/api/student-submission/") ? ((init && init.method) === "POST" ? json(200, { ok: true, savedAt: "x" }) : json(200, { ok: true, state: STATE })) : json(404, {})) as unknown as typeof fetch;
});

describe("20D1-V1 student runtime and teacher preview share ONE presentation engine", () => {
  it("both roots are the scoped .exam-presentation element with the SAME resolved data attributes and CSS variables; the legacy theme class is not applied", async () => {
    const s = render(<StudentExamPage token="t" assignment={assignment(exam()) as never} studentName="أ" className="ب" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    const sRoot = s.container.querySelector(".exam-presentation") as HTMLElement;
    expect(sRoot).toBeTruthy();
    expect(s.container.querySelector(".exam-theme-classic")).toBeNull();
    const sAttrs = [...sRoot.attributes].filter(a => a.name.startsWith("data-xp-") || a.name === "style").map(a => a.name + "=" + a.value).sort();
    s.unmount();
    const p = render(<ExamPreview exam={exam() as never} onClose={() => {}} />);
    await settle();
    const pRoot = p.container.querySelector(".exam-presentation") as HTMLElement;
    expect(pRoot).toBeTruthy();
    const pAttrs = [...pRoot.attributes].filter(a => a.name.startsWith("data-xp-") || a.name === "style").map(a => a.name + "=" + a.value).sort();
    expect(pAttrs).toEqual(sAttrs);
    expect(sAttrs.join(" ")).toContain("data-xp-preset=networkLab");
  });
  it("the question article (shell attributes, rich stem, semantic table, marks badge) is byte-identical in the student page and the preview", async () => {
    const s = render(<StudentExamPage token="t" assignment={assignment(exam()) as never} studentName="أ" className="ب" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    const sArticle = norm(s.container.querySelector("article.iex-q")!.outerHTML);
    expect(s.container.querySelector("article.iex-q .xp-table-wrap > table")).toBeTruthy();
    expect(s.container.querySelector("article.iex-q")!.getAttribute("data-xp-card")).toBe("elevated");
    s.unmount();
    const p = render(<ExamPreview exam={exam() as never} onClose={() => {}} />);
    await settle();
    expect(norm(p.container.querySelector("article.iex-q")!.outerHTML)).toBe(sArticle);
  });
  it("the section header comes from the SAME shared shell (variant band, rich instructions) in both views", async () => {
    const s = render(<StudentExamPage token="t" assignment={assignment(exam()) as never} studentName="أ" className="ب" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    const sh = s.container.querySelector("[data-xp-slot=section-header]") as HTMLElement;
    expect(sh.getAttribute("data-xp-variant")).toBe("band");
    expect(sh.textContent).toContain("اقرأ الجدول أولًا");
    const sHtml = norm(sh.outerHTML);
    s.unmount();
    const p = render(<ExamPreview exam={exam() as never} onClose={() => {}} />);
    await settle();
    expect(norm((p.container.querySelector("[data-xp-slot=section-header]") as HTMLElement).outerHTML)).toBe(sHtml);
  });
  it("lifecycle controls (top bar, timer, save status, navigation) stay outside presentation control: present, code-owned, never hidden by JSON", async () => {
    const s = render(<StudentExamPage token="t" assignment={assignment(exam()) as never} studentName="أ" className="ب" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    expect(s.container.querySelector("header.iex-topbar")).toBeTruthy();
    expect(s.container.querySelector("nav.iex-bottom-nav")).toBeTruthy();
    const style = (s.container.querySelector(".exam-presentation") as HTMLElement).getAttribute("style") || "";
    expect(style).not.toMatch(/display|position|z-index|opacity|visibility|url\(/i);
  });
});

describe("20D1-V2 precedence and legacy fallback", () => {
  it("valid richContent is the stem (no duplicate plain prompt); the plain text remains the fallback for malformed rich content", async () => {
    const card = (q: Record<string, unknown>) => render(<StudentQuestionCard q={q as unknown as Question} index={0} id="q1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={() => {}} />);
    const a = card({ examQuestionId: "q1", presentationType: "open", text: "النص العادي", richContent: RICH, marks: 1 });
    await settle();
    expect(a.container.querySelector(".xp-rich table")).toBeTruthy();
    expect(a.container.textContent).not.toContain("النص العادي");
    expect(a.container.querySelector("#iex-qtext-q1")).toBeTruthy();
    a.unmount();
    const b = card({ examQuestionId: "q1", presentationType: "open", text: "النص العادي", richContent: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "<script>x</script>" }] }] }, marks: 1 });
    await settle();
    expect(b.container.querySelector("p.iex-qtext")!.textContent).toBe("النص العادي");
    expect(b.container.querySelector(".xp-rich")).toBeNull();
  });
  it("a legacy pipe-table answer question keeps its interactive table from q.text even when rich content is the stem", async () => {
    const r = render(<StudentQuestionCard q={{ examQuestionId: "q4", presentationType: "tableFill", text: "أكمل:\n| الجهاز | VLAN |\n|---|---|\n| PC1 | |", richContent: RICH, marks: 2 } as unknown as Question} index={0} id="q4" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={() => {}} />);
    await settle();
    expect(r.container.querySelector(".iex-table-wrap input.iex-cell, .iex-table-wrap .iex-cell-select, .iex-table-wrap input.iex-check")).toBeTruthy();
    expect(r.container.querySelector(".xp-rich .xp-table-wrap")).toBeTruthy();
  });
  it("a malformed presentation never breaks the exam: the safe default preset renders (fallback flagged), questions still answerable", async () => {
    const s = render(<StudentExamPage token="t" assignment={assignment(exam({ presentation: { schemaVersion: 1, preset: "x", css: "body{display:none}" } })) as never} studentName="أ" className="ب" onBack={() => {}} onLogout={() => {}} />);
    await settle();
    const root = s.container.querySelector(".exam-presentation") as HTMLElement;
    expect(root.getAttribute("data-xp-preset")).toBe("default");
    expect(root.getAttribute("data-xp-fallback")).toBe("true");
    expect(s.container.querySelectorAll("article.iex-q input[type=radio]").length).toBe(2);
  });
});
